import { app, BrowserWindow, ipcMain, net } from "electron";
import { createHash, createDecipheriv, createCipheriv, publicEncrypt } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import log from "electron-log";
import { useStore } from "../store";
import type {
  PluginMeta,
  PluginState,
  PluginRuntimeInfo,
  PluginCapability,
  AudioSourceResult,
  PluginSongData,
} from "../../../src/types/plugin";

const pluginLog = log.scope("plugin");

/** 解析请求超时（毫秒） */
const RESOLVE_TIMEOUT = 10_000;

/** 活跃插件运行时数据 */
interface ActivePlugin {
  id: string;
  state: PluginState;
  /** 已注册的能力 */
  capabilities: Set<PluginCapability>;
  /** 音频源优先级 */
  audioSourcePriority: number;
  /** 音频源名称 */
  audioSourceName: string;
}

/**
 * 主进程插件管理器
 * 所有插件共享一个隐藏 BrowserWindow（节省内存）
 * 每个插件通过 IIFE 包裹实现命名空间隔离
 */
export class PluginManager {
  private static instance: PluginManager | null = null;
  /** 插件目录 */
  private pluginDir: string;
  /** 共享插件宿主窗口 */
  private hostWindow: BrowserWindow | null = null;
  /** 活跃插件 */
  private activePlugins: Map<string, ActivePlugin> = new Map();
  /** 待处理的解析请求 */
  private pendingResolves: Map<
    string,
    { resolve: (result: AudioSourceResult | null) => void; timer: NodeJS.Timeout }
  > = new Map();

  private constructor() {
    this.pluginDir = join(app.getPath("userData"), "plugins");
    if (!existsSync(this.pluginDir)) {
      mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  // ==================== 生命周期 ====================

  /** 初始化：创建宿主窗口、注册 IPC、启动已启用插件 */
  async init(): Promise<void> {
    pluginLog.info("🔌 插件系统初始化");
    this.registerInternalIpc();
    await this.ensureHostWindow();
    // 启动所有已启用的插件
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    for (const p of plugins) {
      if (p.enabled) {
        await this.startPlugin(p);
      }
    }
    pluginLog.info(`🔌 已启动 ${this.activePlugins.size} 个插件`);
  }

  /** 关闭插件系统 */
  shutdown(): void {
    this.activePlugins.clear();
    if (this.hostWindow && !this.hostWindow.isDestroyed()) {
      this.hostWindow.destroy();
    }
    this.hostWindow = null;
    // 清理待处理请求
    for (const [, pending] of this.pendingResolves) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this.pendingResolves.clear();
  }

  // ==================== 导入/删除 ====================

  /** 从本地文件导入插件 */
  async importFromFile(filePath: string): Promise<PluginState> {
    const content = readFileSync(filePath, "utf-8");
    this.validatePluginContent(content);
    const meta = this.parseJSDocMeta(content);

    // 重复检测：同名同版本视为重复
    const store = useStore();
    const existing: PluginState[] = store.get("plugins", []);
    const duplicate = existing.find(
      (p) => p.meta.name === meta.name && p.meta.version === meta.version,
    );
    if (duplicate) {
      throw new Error(`插件「${meta.name}」v${meta.version} 已存在，请先删除旧版本`);
    }

    const fileName = this.generateFileName(meta.name, content);
    const destPath = join(this.pluginDir, fileName);

    copyFileSync(filePath, destPath);
    pluginLog.info(`📦 导入插件文件: ${meta.name} → ${fileName}`);

    const state: PluginState = {
      id: this.generateId(fileName),
      meta,
      enabled: true,
      fileName,
      source: "file",
      config: {},
    };

    this.savePluginState(state);
    await this.startPlugin(state);
    return state;
  }

  /** 删除插件 */
  async removePlugin(id: string): Promise<void> {
    await this.stopPlugin(id);
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    const plugin = plugins.find((p) => p.id === id);
    if (plugin) {
      const filePath = join(this.pluginDir, plugin.fileName);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
    store.set(
      "plugins",
      plugins.filter((p) => p.id !== id),
    );
    pluginLog.info(`🗑️ 已删除插件: ${id}`);
  }

  // ==================== 启用/禁用 ====================

  /** 启用插件 */
  async enablePlugin(id: string): Promise<void> {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    const plugin = plugins.find((p) => p.id === id);
    if (!plugin) return;
    plugin.enabled = true;
    store.set("plugins", plugins);
    await this.startPlugin(plugin);
  }

  /** 禁用插件 */
  async disablePlugin(id: string): Promise<void> {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    const plugin = plugins.find((p) => p.id === id);
    if (!plugin) return;
    plugin.enabled = false;
    store.set("plugins", plugins);
    await this.stopPlugin(id);
  }

  // ==================== 调度 ====================

  /** 取消所有待处理的解析请求 */
  cancelAllResolves(): void {
    for (const [id, pending] of this.pendingResolves) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      this.pendingResolves.delete(id);
    }
  }

  /** 解析音频源：遍历活跃插件，按优先级返回首个结果 */
  async resolveAudioSource(song: PluginSongData): Promise<AudioSourceResult | null> {
    // 取消之前未完成的请求，避免堆积
    this.cancelAllResolves();

    // 收集有音频源能力的插件，按优先级排序
    const providers = Array.from(this.activePlugins.values())
      .filter((p) => p.capabilities.has("audio-source"))
      .sort((a, b) => a.audioSourcePriority - b.audioSourcePriority);

    if (providers.length === 0) return null;

    // 依次尝试每个插件
    for (const provider of providers) {
      try {
        const result = await this.requestResolve(provider, song);
        if (result) {
          pluginLog.info(
            `🔌 [${song.id}] 插件音频源解析成功: ${provider.audioSourceName}`,
          );
          return result;
        }
      } catch (e) {
        pluginLog.warn(`⚠️ 插件解析失败 [${provider.id}]:`, e);
      }
    }
    return null;
  }

  // ==================== 查询 ====================

  /** 获取插件运行时信息列表 */
  getPluginList(): PluginRuntimeInfo[] {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    return plugins.map((p) => {
      const active = this.activePlugins.get(p.id);
      return {
        id: p.id,
        meta: p.meta,
        enabled: p.enabled,
        running: !!active,
        source: p.source,
        capabilities: active ? Array.from(active.capabilities) : [],
      };
    });
  }

  /** 获取插件配置 */
  getPluginConfig(pluginId: string): Record<string, unknown> {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    return plugins.find((p) => p.id === pluginId)?.config ?? {};
  }

  /** 保存插件配置 */
  setPluginConfig(pluginId: string, config: Record<string, unknown>): void {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    const plugin = plugins.find((p) => p.id === pluginId);
    if (plugin) {
      plugin.config = { ...plugin.config, ...config };
      store.set("plugins", plugins);
    }
  }

  // ==================== 内部方法 ====================

  /** 确保宿主窗口存在 */
  private async ensureHostWindow(): Promise<BrowserWindow> {
    if (this.hostWindow && !this.hostWindow.isDestroyed()) {
      return this.hostWindow;
    }

    const preloadPath = join(__dirname, "../preload/plugin-preload.mjs");

    this.hostWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: preloadPath,
      },
    });

    // 安全限制
    this.hostWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.hostWindow.webContents.on("will-navigate", (event) => event.preventDefault());

    // 加载带 CSP 的空白页面
    const csp = "default-src 'none'; script-src 'unsafe-eval'";
    await this.hostWindow.loadURL(
      `data:text/html,<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><title>SPlayer Plugin Host</title></head><body></body></html>`,
    );

    pluginLog.info("🔌 插件宿主窗口已创建");
    return this.hostWindow;
  }

  /** 启动插件：在共享宿主窗口中执行插件代码 */
  private async startPlugin(state: PluginState): Promise<void> {
    if (this.activePlugins.has(state.id)) return;

    const filePath = join(this.pluginDir, state.fileName);
    if (!existsSync(filePath)) {
      pluginLog.error(`插件文件不存在: ${filePath}`);
      return;
    }

    const code = readFileSync(filePath, "utf-8");
    const win = await this.ensureHostWindow();

    const active: ActivePlugin = {
      id: state.id,
      state,
      capabilities: new Set(),
      audioSourcePriority: 50,
      audioSourceName: state.meta.name,
    };
    this.activePlugins.set(state.id, active);

    // 用 IIFE 包裹插件代码，注入 pluginId 并创建隔离的 sp 代理
    const pluginId = JSON.stringify(state.id);
    const wrappedCode = `
      ;(function() {
        var __pluginId = ${pluginId};
        var __listeners = [];
        var sp = {
          version: globalThis.sp.version,
          env: globalThis.sp.env,
          registerAudioSource: function(provider) {
            globalThis.sp.__registerAudioSource(__pluginId, provider);
          },
          sendResult: function(requestId, result) {
            globalThis.sp.sendResult(requestId, result);
          },
          on: function(event, cb) {
            var wrapper = function() {
              cb.apply(null, Array.from(arguments));
            };
            wrapper.__pluginId = __pluginId;
            wrapper.__original = cb;
            __listeners.push({ event: event, wrapper: wrapper });
            globalThis.sp.on(event, wrapper);
          },
          off: function(event, cb) {
            var entry = __listeners.find(function(e) { return e.event === event && e.wrapper.__original === cb; });
            if (entry) globalThis.sp.off(event, entry.wrapper);
          },
          request: function(url, options) {
            return globalThis.sp.request(url, options);
          },
          notify: function(message, type) {
            globalThis.sp.notify(message, type);
          },
          getConfig: function() {
            return globalThis.sp.getConfig(__pluginId);
          },
          setConfig: function(config) {
            return globalThis.sp.setConfig(__pluginId, config);
          },
          getCurrentSong: function() {
            return globalThis.sp.getCurrentSong();
          },
          utils: globalThis.sp.utils,
          log: {
            info: function() { globalThis.sp.log.info.apply(null, [__pluginId].concat(Array.from(arguments))); },
            warn: function() { globalThis.sp.log.warn.apply(null, [__pluginId].concat(Array.from(arguments))); },
            error: function() { globalThis.sp.log.error.apply(null, [__pluginId].concat(Array.from(arguments))); },
          },
        };
        ${code}
      })();
    `;

    try {
      await win.webContents.executeJavaScript(wrappedCode);
      pluginLog.info(`✅ 插件已启动: ${state.meta.name}`);
    } catch (e) {
      pluginLog.error(`❌ 插件代码执行失败 [${state.id}]:`, e);
      this.activePlugins.delete(state.id);
    }
  }

  /** 停止插件：从活跃列表移除，通知宿主窗口清理 */
  private async stopPlugin(id: string): Promise<void> {
    const active = this.activePlugins.get(id);
    if (!active) return;

    // 通知宿主窗口清理该插件的监听器
    if (this.hostWindow && !this.hostWindow.isDestroyed()) {
      try {
        await this.hostWindow.webContents.executeJavaScript(
          `globalThis.sp.__removePlugin(${JSON.stringify(id)})`,
        );
      } catch {
        // 忽略清理失败
      }
    }

    this.activePlugins.delete(id);
    pluginLog.info(`🔌 插件已停止: ${active.state.meta.name}`);

    // 如果没有活跃插件了，销毁宿主窗口释放内存
    if (this.activePlugins.size === 0 && this.hostWindow && !this.hostWindow.isDestroyed()) {
      this.hostWindow.destroy();
      this.hostWindow = null;
      pluginLog.info("🔌 无活跃插件，已销毁宿主窗口");
    }
  }

  /** 注册插件内部 IPC（来自插件宿主窗口） */
  private registerInternalIpc(): void {
    // 插件注册音频源能力（带 pluginId）
    ipcMain.on("sp:register-audio-source", (_event, pluginId: string, provider: { name: string; priority: number }) => {
      const active = this.activePlugins.get(pluginId);
      if (!active) return;
      active.capabilities.add("audio-source");
      active.audioSourcePriority = provider.priority;
      active.audioSourceName = provider.name;
      pluginLog.info(
        `🔌 [${active.state.meta.name}] 注册音频源: ${provider.name} (优先级: ${provider.priority})`,
      );
    });

    // 插件返回解析结果
    ipcMain.on("sp:resolve-result", (_event, requestId: string, result: AudioSourceResult | null) => {
      const pending = this.pendingResolves.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingResolves.delete(requestId);
        pending.resolve(result);
      }
    });

    // 插件 HTTP 请求代理
    ipcMain.handle("sp:request", async (_event, url: string, options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    }) => {
      return this.proxyRequest(url, options);
    });

    // 插件获取配置（通过 pluginId 查找）
    ipcMain.handle("sp:get-config", (_event, pluginId: string) => {
      return this.getPluginConfig(pluginId);
    });

    // 插件保存配置
    ipcMain.handle("sp:set-config", (_event, pluginId: string, config: Record<string, unknown>) => {
      this.setPluginConfig(pluginId, config);
    });

    // 插件通知
    ipcMain.on("sp:notify", (_event, message: string, type: string) => {
      const mainWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.getURL().includes("index.html"),
      );
      if (mainWin) {
        mainWin.webContents.send("plugin:notify", message, type);
      }
    });

    // 插件日志
    ipcMain.on("sp:log", (_event, pluginId: string, level: string, ...args: unknown[]) => {
      const active = this.activePlugins.get(pluginId);
      const prefix = active ? `[${active.state.meta.name}]` : `[Plugin:${pluginId}]`;
      switch (level) {
        case "info":
          pluginLog.info(prefix, ...args);
          break;
        case "warn":
          pluginLog.warn(prefix, ...args);
          break;
        case "error":
          pluginLog.error(prefix, ...args);
          break;
      }
    });

    // 获取当前歌曲（转发给主窗口查询）
    ipcMain.handle("sp:get-current-song", async () => {
      const mainWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.getURL().includes("index.html"),
      );
      if (!mainWin) return null;
      return mainWin.webContents.executeJavaScript(
        "window.__sp_getCurrentSong?.()",
      ).catch(() => null);
    });

    // ==================== Crypto 工具 IPC ====================

    ipcMain.handle("sp:crypto:md5", (_event, data: string) => {
      return createHash("md5").update(data).digest("hex");
    });

    ipcMain.handle("sp:crypto:aes-decrypt", (_event, opts: {
      data: string;
      key: string;
      iv: string;
      mode?: string;
      inputEncoding?: string;
      outputEncoding?: string;
    }) => {
      try {
        const algorithm = opts.mode === "ecb" ? "aes-128-ecb" : "aes-128-cbc";
        const keyBuf = Buffer.from(opts.key, "utf-8");
        const ivBuf = opts.mode === "ecb" ? null : Buffer.from(opts.iv, "utf-8");
        const decipher = createDecipheriv(algorithm, keyBuf, ivBuf as unknown as Buffer);
        const inputEnc = (opts.inputEncoding ?? "base64") as BufferEncoding;
        let decrypted = decipher.update(opts.data, inputEnc, "utf-8");
        decrypted += decipher.final("utf-8");
        return { success: true, data: decrypted };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "解密失败" };
      }
    });

    ipcMain.handle("sp:crypto:aes-encrypt", (_event, opts: {
      data: string;
      key: string;
      iv: string;
      mode?: string;
      outputEncoding?: string;
    }) => {
      try {
        const algorithm = opts.mode === "ecb" ? "aes-128-ecb" : "aes-128-cbc";
        const keyBuf = Buffer.from(opts.key, "utf-8");
        const ivBuf = opts.mode === "ecb" ? null : Buffer.from(opts.iv, "utf-8");
        const cipher = createCipheriv(algorithm, keyBuf, ivBuf as unknown as Buffer);
        const outEnc = (opts.outputEncoding ?? "base64") as BufferEncoding;
        let encrypted = cipher.update(opts.data, "utf-8", outEnc);
        encrypted += cipher.final(outEnc);
        return { success: true, data: encrypted };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "加密失败" };
      }
    });

    ipcMain.handle("sp:crypto:rsa-encrypt", (_event, opts: {
      data: string;
      publicKey: string;
    }) => {
      try {
        const encrypted = publicEncrypt(opts.publicKey, Buffer.from(opts.data, "utf-8"));
        return { success: true, data: encrypted.toString("base64") };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "RSA 加密失败" };
      }
    });
  }

  /** 向指定插件发送解析请求并等待结果 */
  private requestResolve(active: ActivePlugin, song: PluginSongData): Promise<AudioSourceResult | null> {
    return new Promise((resolve) => {
      if (!this.hostWindow || this.hostWindow.isDestroyed()) {
        resolve(null);
        return;
      }
      const requestId = `${active.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        this.pendingResolves.delete(requestId);
        pluginLog.warn(`⏰ 插件解析超时 [${active.state.meta.name}]`);
        resolve(null);
      }, RESOLVE_TIMEOUT);

      this.pendingResolves.set(requestId, { resolve, timer });

      // 发送事件给宿主窗口，带上目标 pluginId
      this.hostWindow.webContents.send("sp:event", "resolve-audio-source", {
        requestId,
        pluginId: active.id,
        song,
      });
    });
  }

  /** 代理 HTTP 请求 */
  private proxyRequest(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const timeout = options?.timeout ?? 15_000;
      const timer = setTimeout(() => {
        reject(new Error("请求超时"));
      }, timeout);

      const request = net.request({
        url,
        method: (options?.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE",
      });

      if (options?.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          request.setHeader(key, value);
        }
      }

      request.on("response", (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks).toString("utf-8");
          const headers: Record<string, string> = {};
          for (const key of Object.keys(response.headers)) {
            const val = response.headers[key];
            if (val) headers[key] = Array.isArray(val) ? val.join(", ") : val;
          }
          resolve({ status: response.statusCode, headers, body });
        });
        response.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      request.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      if (options?.body) {
        request.write(options.body);
      }
      request.end();
    });
  }

  /** 校验插件内容 */
  private validatePluginContent(content: string): void {
    // 必须包含 JSDoc 元数据块
    const hasJSDoc = /\/\*\*([\s\S]*?)\*\//.test(content);
    if (!hasJSDoc) {
      throw new Error("插件缺少元数据声明（/** @name ... */）");
    }
    // 必须声明 @name
    const hasName = /@name\s+.+/m.test(content);
    if (!hasName) {
      throw new Error("插件缺少 @name 声明");
    }
    // 必须使用 sp API
    if (!content.includes("sp.")) {
      throw new Error("插件未调用 sp API，不是有效的 SPlayer 插件");
    }
  }

  /** 解析 JSDoc 元数据 */
  private parseJSDocMeta(code: string): PluginMeta {
    const meta: PluginMeta = {
      name: "未知插件",
      description: "",
      version: "0.0.0",
      author: "未知",
    };
    const match = code.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) return meta;
    const block = match[1];

    const extract = (tag: string): string | undefined => {
      const re = new RegExp(`@${tag}\\s+(.+)`, "m");
      const m = block.match(re);
      return m ? m[1].trim() : undefined;
    };

    meta.name = extract("name")?.slice(0, 24) ?? meta.name;
    meta.description = extract("description")?.slice(0, 36) ?? meta.description;
    meta.version = extract("version") ?? meta.version;
    meta.author = extract("author") ?? meta.author;
    meta.homepage = extract("homepage");

    return meta;
  }

  /** 生成文件名 */
  private generateFileName(name: string, content: string): string {
    const hash = createHash("md5").update(content).digest("hex").slice(0, 8);
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 20);
    return `${safeName}-${hash}.js`;
  }

  /** 生成插件 ID */
  private generateId(fileName: string): string {
    return createHash("md5").update(fileName).digest("hex").slice(0, 12);
  }

  /** 保存插件状态到 electron-store */
  private savePluginState(state: PluginState): void {
    const store = useStore();
    const plugins: PluginState[] = store.get("plugins", []);
    const index = plugins.findIndex((p) => p.id === state.id);
    if (index >= 0) {
      plugins[index] = state;
    } else {
      plugins.push(state);
    }
    store.set("plugins", plugins);
  }
}
