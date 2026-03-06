import { contextBridge, ipcRenderer } from "electron";

/** 允许插件监听的事件白名单 */
const ALLOWED_EVENTS = ["resolve-audio-source"];

/** 事件监听器：event → Set<callback>，callback 上挂 __pluginId */
type PluginCallback = ((...args: unknown[]) => void) & { __pluginId?: string };
const listeners = new Map<string, Set<PluginCallback>>();

// 统一接收主进程发来的插件事件
ipcRenderer.on("sp:event", (_event, eventName: string, payload: {
  requestId: string;
  pluginId: string;
  song: unknown;
}) => {
  const cbs = listeners.get(eventName);
  if (!cbs) return;

  // 只分发给目标插件的监听器
  cbs.forEach((cb) => {
    if (cb.__pluginId && cb.__pluginId !== payload.pluginId) return;
    try {
      cb(payload);
    } catch (e) {
      console.error(`[Plugin] 事件处理出错 (${eventName}):`, e);
    }
  });
});

contextBridge.exposeInMainWorld("sp", {
  /** API 版本 */
  version: "1.0.0",

  /** 环境信息 */
  env: {
    platform: process.platform,
    arch: process.arch,
  },

  /** 监听事件（由插件 IIFE 包装器调用，附带 __pluginId） */
  on(event: string, cb: PluginCallback) {
    if (!ALLOWED_EVENTS.includes(event)) {
      console.warn(`[Plugin] 不支持的事件: ${event}`);
      return;
    }
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(cb);
  },

  /** 移除监听 */
  off(event: string, cb: PluginCallback) {
    listeners.get(event)?.delete(cb);
  },

  /**
   * 内部方法：注册音频源（由 IIFE 包装器调用，附带 pluginId）
   * 插件代码通过包装器调用 sp.registerAudioSource()，
   * 包装器转调此方法并自动注入 pluginId
   */
  __registerAudioSource(pluginId: string, provider: { name: string; priority?: number }) {
    ipcRenderer.send("sp:register-audio-source", pluginId, {
      name: provider.name,
      priority: provider.priority ?? 50,
    });
  },

  /**
   * 内部方法：清理指定插件的所有监听器
   * 当插件被停用时由主进程调用
   */
  __removePlugin(pluginId: string) {
    for (const [, cbs] of listeners) {
      for (const cb of cbs) {
        if (cb.__pluginId === pluginId) {
          cbs.delete(cb);
        }
      }
    }
  },

  /** 发送解析结果 */
  sendResult(
    requestId: string,
    result: { url: string; quality?: string; sourceLabel?: string } | null,
  ) {
    ipcRenderer.send("sp:resolve-result", requestId, result);
  },

  /** HTTP 请求代理（绕过 CORS） */
  request(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return ipcRenderer.invoke("sp:request", url, options);
  },

  /** 发送 UI 通知 */
  notify(message: string, type?: "info" | "success" | "warning" | "error") {
    ipcRenderer.send("sp:notify", message, type ?? "info");
  },

  /** 读取插件配置（需要 pluginId，由包装器注入） */
  getConfig(pluginId: string): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke("sp:get-config", pluginId);
  },

  /** 保存插件配置 */
  setConfig(pluginId: string, config: Record<string, unknown>): Promise<void> {
    return ipcRenderer.invoke("sp:set-config", pluginId, config);
  },

  /** 获取当前播放歌曲 */
  getCurrentSong(): Promise<unknown> {
    return ipcRenderer.invoke("sp:get-current-song");
  },

  /** 工具函数（通过 IPC 代理主进程 Node.js 能力） */
  utils: {
    crypto: {
      /** MD5 哈希 */
      md5(data: string): Promise<string> {
        return ipcRenderer.invoke("sp:crypto:md5", data);
      },
      /** AES 解密 */
      aesDecrypt(
        data: string,
        key: string,
        iv: string,
        mode?: "cbc" | "ecb",
        inputEncoding?: "base64" | "hex",
      ): Promise<{ success: boolean; data?: string; error?: string }> {
        return ipcRenderer.invoke("sp:crypto:aes-decrypt", {
          data, key, iv, mode, inputEncoding,
        });
      },
      /** AES 加密 */
      aesEncrypt(
        data: string,
        key: string,
        iv: string,
        mode?: "cbc" | "ecb",
        outputEncoding?: "base64" | "hex",
      ): Promise<{ success: boolean; data?: string; error?: string }> {
        return ipcRenderer.invoke("sp:crypto:aes-encrypt", {
          data, key, iv, mode, outputEncoding,
        });
      },
      /** RSA 公钥加密 */
      rsaEncrypt(
        data: string,
        publicKey: string,
      ): Promise<{ success: boolean; data?: string; error?: string }> {
        return ipcRenderer.invoke("sp:crypto:rsa-encrypt", { data, publicKey });
      },
    },
    /** Base64 编解码（浏览器原生，无需 IPC） */
    base64: {
      encode(str: string): string {
        return btoa(
          encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16)),
          ),
        );
      },
      decode(b64: string): string {
        return decodeURIComponent(
          Array.from(atob(b64))
            .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join(""),
        );
      },
    },
  },

  /** 日志（带 pluginId） */
  log: {
    info(pluginId: string, ...args: unknown[]) {
      ipcRenderer.send("sp:log", pluginId, "info", ...args);
    },
    warn(pluginId: string, ...args: unknown[]) {
      ipcRenderer.send("sp:log", pluginId, "warn", ...args);
    },
    error(pluginId: string, ...args: unknown[]) {
      ipcRenderer.send("sp:log", pluginId, "error", ...args);
    },
  },
});
