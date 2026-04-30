import { app, BrowserWindow, nativeTheme, screen } from "electron";
import { join } from "node:path";
import { debounce } from "lodash-es";
import type {
  RegistryWatcher,
  TaskbarLayout,
  TaskbarService,
  TrayWatcher,
  UiaWatcher,
} from "@native/taskbar-lyric";
import { createWindow } from "./index";
import { useStore } from "../store";
import { broadcast } from "../utils/broadcast";
import { isAppQuitting } from "../utils/lifecycle";
import { isDev, isWin, port } from "../utils/config";
import { loadNativeModule } from "../utils/native-loader";
import { processLog, windowsLog } from "../logger";
import { getMainTray } from "../tray";
import type { TaskbarLyricSettings } from "@shared/lyric-window";

type TaskbarLyricNative = typeof import("@native/taskbar-lyric");

let taskbarLyricWindow: BrowserWindow | null = null;
let nativeModule: TaskbarLyricNative | null = null;
let service: TaskbarService | null = null;
let registryWatcher: RegistryWatcher | null = null;
let uiaWatcher: UiaWatcher | null = null;
let trayWatcher: TrayWatcher | null = null;
let firstLayoutDone = false;

/**
 * 初始尺寸故意开大（覆盖任何任务栏宽高）
 * 关键原因：transparent + SetParent 后 Chromium 合成器视口不会随 setBounds 扩大，只会收缩
 * 后续 setBounds 只做缩小，视口始终覆盖整个 HWND
 */
const INITIAL_WIDTH = 3000;
const INITIAL_HEIGHT = 200;

/** 默认布局重算间隙（避免过度抖动） */
const debouncedUpdateLayout = debounce(() => {
  service?.update(getDesiredPhysicalWidth());
}, 150);

/** 注册表变化触发的布局重算（多走一次去抖以等待 Explorer 完成调整） */
const debouncedRegistryUpdate = debounce(() => {
  service?.update(getDesiredPhysicalWidth());
}, 500);

const getDesiredPhysicalWidth = (): number => {
  if (!isWin) return 0;
  const store = useStore();
  const config = store.get("taskbarLyric") as TaskbarLyricSettings | undefined;
  const primary = screen.getPrimaryDisplay();
  const scaleFactor = primary.scaleFactor;
  if (!config || config.autoMaxWidth) {
    return Math.round(primary.workAreaSize.width * scaleFactor);
  }
  return Math.round(config.maxWidth * scaleFactor);
};

/**
 * 把当前 native 输出的 TaskbarLayout 转成 left/right 可用空间 + 锚点选择
 * 当前 native API 输出 win10/win11 两种布局，由本函数自行计算 Win11 居中模式下两侧空间
 */
interface PickedSpace {
  rect: Electron.Rectangle;
  anchor: "left" | "right";
  isCentered: boolean;
  systemType: string;
}

const GAP_LOGICAL = 10;

const pickSpace = (layout: TaskbarLayout): PickedSpace | null => {
  const store = useStore();
  const config = store.get("taskbarLyric") as TaskbarLyricSettings | undefined;
  const position = config?.position ?? "auto";
  const primary = screen.getPrimaryDisplay();
  const scaleFactor = primary.scaleFactor;
  const GAP = GAP_LOGICAL * scaleFactor;

  if (layout.systemType === "win10" && layout.win10) {
    const { x, y, width, height } = layout.win10.lyricArea;
    return {
      rect: { x, y, width, height },
      anchor: "left",
      isCentered: false,
      systemType: "win10",
    };
  }

  if (layout.systemType === "win11" && layout.win11) {
    const { startButton, widgets, content, tray, isCentered } = layout.win11;
    let effectiveRightAnchor = tray.x;
    const contentRightEdge = content.x + content.width;
    if (widgets.width > 0 && widgets.x > contentRightEdge) {
      if (widgets.x < tray.x) effectiveRightAnchor = widgets.x;
    }
    const rightSpaceRaw = effectiveRightAnchor - contentRightEdge;
    const rightSpaceNet = rightSpaceRaw - GAP;

    const widgetsRightEdge = widgets.width > 0 ? widgets.x + widgets.width : 0;
    const startLeftEdge = startButton.x;
    const leftSpaceRaw = startLeftEdge - widgetsRightEdge;
    const leftSpaceNet = leftSpaceRaw - GAP;

    let chosenAnchor: "left" | "right" = "right";
    let chosenWidth = 0;
    let chosenX = 0;

    if (position === "left" && isCentered && leftSpaceNet > 0) {
      chosenAnchor = "left";
      chosenWidth = leftSpaceNet;
      chosenX = widgetsRightEdge + GAP;
    } else if (position === "right") {
      chosenAnchor = "right";
      chosenWidth = Math.max(0, rightSpaceNet);
      chosenX = effectiveRightAnchor - chosenWidth - GAP;
    } else if (isCentered && leftSpaceNet >= rightSpaceNet && leftSpaceNet > 0) {
      chosenAnchor = "left";
      chosenWidth = leftSpaceNet;
      chosenX = widgetsRightEdge + GAP;
    } else {
      chosenAnchor = "right";
      chosenWidth = Math.max(0, rightSpaceNet);
      chosenX = effectiveRightAnchor - chosenWidth - GAP;
    }

    if (chosenWidth <= 0) return null;

    return {
      rect: { x: chosenX, y: 0, width: chosenWidth, height: tray.height },
      anchor: chosenAnchor,
      isCentered,
      systemType: "win11",
    };
  }

  return null;
};

/** 应用布局 */
const applyLayout = (layout: TaskbarLayout | null): void => {
  if (!layout) return;
  const win = getTaskbarLyricWindow();
  if (!win) return;

  const picked = pickSpace(layout);
  if (!picked) {
    if (win.isVisible()) win.hide();
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const scaleFactor = primary.scaleFactor;

  // 物理像素 → DIP
  const availX = Math.round(picked.rect.x / scaleFactor);
  const availY = Math.round(picked.rect.y / scaleFactor);
  const availWidth = Math.round(picked.rect.width / scaleFactor);
  const availHeight = Math.round(picked.rect.height / scaleFactor);

  const store = useStore();
  const config = store.get("taskbarLyric") as TaskbarLyricSettings | undefined;
  const autoMaxWidth = config?.autoMaxWidth ?? true;
  const maxWidth = config?.maxWidth ?? 400;
  const windowWidth = autoMaxWidth ? availWidth : Math.min(maxWidth, availWidth);
  const windowX = picked.anchor === "right" ? availX + availWidth - windowWidth : availX;

  win.setBounds({ x: windowX, y: availY, width: windowWidth, height: availHeight });

  if (!firstLayoutDone) {
    firstLayoutDone = true;
    win.show();
  }

  // 主题：使用 nativeTheme 反推 isLight
  const isLight = !nativeTheme.shouldUseDarkColors;

  win.webContents.send("taskbarLyric:layout", {
    isCentered: picked.isCentered,
    systemType: picked.systemType,
    isLight,
    anchor: picked.anchor,
  });
};

const tryStart = <T>(name: string, factory: () => T): T | null => {
  try {
    return factory();
  } catch (error) {
    windowsLog.warn(`[taskbar-lyric] ${name} 启动失败`, error);
    return null;
  }
};

const startWatchers = (mod: TaskbarLyricNative): void => {
  registryWatcher = tryStart(
    "RegistryWatcher",
    () =>
      new mod.RegistryWatcher((err) => {
        if (err) windowsLog.error("[taskbar-lyric] RegistryWatcher cb err", err);
        else debouncedRegistryUpdate();
      }),
  );
  uiaWatcher = tryStart(
    "UiaWatcher",
    () =>
      new mod.UiaWatcher((err) => {
        if (err) windowsLog.error("[taskbar-lyric] UiaWatcher cb err", err);
        else debouncedUpdateLayout();
      }),
  );
  trayWatcher = tryStart(
    "TrayWatcher",
    () =>
      new mod.TrayWatcher((err) => {
        if (err) windowsLog.error("[taskbar-lyric] TrayWatcher cb err", err);
        else debouncedUpdateLayout();
      }),
  );
};

const stopAllWatchers = (): void => {
  registryWatcher?.stop();
  registryWatcher = null;
  uiaWatcher?.stop();
  uiaWatcher = null;
  trayWatcher?.stop();
  trayWatcher = null;
  service?.stop();
  service = null;
};

/** 创建任务栏歌词窗口（仅 Windows） */
export const createTaskbarLyricWindow = (): BrowserWindow | null => {
  if (!isWin) {
    windowsLog.warn("[taskbar-lyric] 仅 Windows 支持");
    return null;
  }

  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    taskbarLyricWindow.show();
    return taskbarLyricWindow;
  }

  if (!nativeModule) {
    nativeModule = loadNativeModule(
      "taskbar-lyric.node",
      "taskbar-lyric",
    ) as TaskbarLyricNative | null;
    if (!nativeModule) {
      windowsLog.error("[taskbar-lyric] 原生模块加载失败");
      return null;
    }
    try {
      const logDir = join(app.getPath("userData"), "logs", "taskbar-lyric");
      nativeModule.initLogger(logDir);
    } catch (e) {
      processLog.error("[taskbar-lyric] 初始化日志失败", e);
    }
  }

  try {
    service = new nativeModule.TaskbarService((err: Error | null, layout: TaskbarLayout) => {
      if (err) {
        processLog.error("[taskbar-lyric] Rust Worker 回调错误", err);
        return;
      }
      applyLayout(layout);
    });
  } catch (e) {
    windowsLog.error("[taskbar-lyric] 初始化 TaskbarService 失败", e);
    return null;
  }

  const win = createWindow({
    width: INITIAL_WIDTH,
    height: INITIAL_HEIGHT,
    minWidth: 0,
    minHeight: 0,
    type: "toolbar",
    title: "Taskbar Lyric",
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      disableDialogs: true,
      zoomFactor: 1.0,
    },
  });

  if (!win) {
    windowsLog.error("[taskbar-lyric] createWindow 失败");
    service?.stop();
    service = null;
    return null;
  }

  taskbarLyricWindow = win;
  firstLayoutDone = false;

  const url =
    isDev && process.env["ELECTRON_RENDERER_URL"]
      ? `${process.env["ELECTRON_RENDERER_URL"]}/windows/taskbar-lyric/index.html`
      : `http://localhost:${port}/windows/taskbar-lyric/index.html`;
  win.loadURL(url);

  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" && input.type === "keyDown") {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: "detach" });
      }
      event.preventDefault();
    }
  });

  win.once("ready-to-show", () => {
    if (!service || !nativeModule) return;
    try {
      const handle = win.getNativeWindowHandle();
      service.embedWindow(handle);
      service.update(getDesiredPhysicalWidth());
      startWatchers(nativeModule);
    } catch (e) {
      windowsLog.error("[taskbar-lyric] 嵌入窗口失败", e);
    }
  });

  win.on("closed", () => {
    stopAllWatchers();
    taskbarLyricWindow = null;
    firstLayoutDone = false;
    broadcast("taskbarLyric:visibilityChange", false);
    getMainTray()?.setTaskbarLyricShow(false);
    if (!isAppQuitting()) {
      const s = useStore();
      s.set("windowStates", {
        ...s.get("windowStates"),
        taskbarLyric: { visible: false },
      });
    }
  });

  const store = useStore();
  store.set("windowStates", {
    ...store.get("windowStates"),
    taskbarLyric: { visible: true },
  });
  broadcast("taskbarLyric:visibilityChange", true);
  getMainTray()?.setTaskbarLyricShow(true);

  return win;
};

/** 关闭任务栏歌词窗口 */
export const closeTaskbarLyricWindow = (): void => {
  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    taskbarLyricWindow.close();
  }
};

/** 切换任务栏歌词窗口；返回切换后是否打开 */
export const toggleTaskbarLyricWindow = (): boolean => {
  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    closeTaskbarLyricWindow();
    return false;
  }
  return createTaskbarLyricWindow() !== null;
};

/** 获取任务栏歌词窗口实例 */
export const getTaskbarLyricWindow = (): BrowserWindow | null => {
  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) return taskbarLyricWindow;
  return null;
};

/** 触发一次布局重算（配置变更后调用） */
export const applyTaskbarLyricLayout = (): void => {
  service?.update(getDesiredPhysicalWidth());
};
