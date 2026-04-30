import { BrowserWindow, screen } from "electron";
import { createWindow } from "./index";
import { useStore } from "../store";
import { broadcast } from "../utils/broadcast";
import { isAppQuitting } from "../utils/lifecycle";
import { isDev, port } from "../utils/config";
import { windowsLog } from "../logger";
import { getMainTray } from "../tray";
import type { DesktopLyricSettings } from "@shared/lyric-window";

let desktopLyricWindow: BrowserWindow | null = null;

const MIN_WIDTH = 400;
const MAX_WIDTH = 10000;
const FALLBACK_HEIGHT = 200;
const FALLBACK_WIDTH = 800;
const CURSOR_POLL_MS = 150;

/** 权威尺寸缓存：所有 setBounds 写宽高都用它，绝不从 getBounds 读尺寸回写 */
const cachedSize = { width: 0, height: 0 };

/** 光标位置轮询 */
let cursorPollTimer: NodeJS.Timeout | null = null;
let lastCursorInside = false;

const isCursorInsideBounds = (): boolean => {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const b = desktopLyricWindow.getBounds();
  return (
    cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height
  );
};

const startCursorPolling = (): void => {
  if (cursorPollTimer) return;
  lastCursorInside = isCursorInsideBounds();
  desktopLyricWindow?.webContents.send("desktopLyric:cursorInside", lastCursorInside);
  cursorPollTimer = setInterval(() => {
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) {
      stopCursorPolling();
      return;
    }
    const inside = isCursorInsideBounds();
    if (inside !== lastCursorInside) {
      lastCursorInside = inside;
      desktopLyricWindow.webContents.send("desktopLyric:cursorInside", inside);
    }
  }, CURSOR_POLL_MS);
};

const stopCursorPolling = (): void => {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
};

const saveWindowState = (): void => {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  const { x, y } = desktopLyricWindow.getBounds();
  const store = useStore();
  const cur = store.get("windowStates").desktopLyric;
  store.set("windowStates", {
    ...store.get("windowStates"),
    desktopLyric: {
      ...cur,
      x,
      y,
      width: cachedSize.width,
      height: cachedSize.height,
    },
  });
};

/** 应用锁定状态：开启时鼠标穿透 + 禁止移动/缩放 */
export const applyDesktopLyricLock = (locked: boolean): void => {
  const win = getDesktopLyricWindow();
  if (!win) return;
  win.setIgnoreMouseEvents(locked, { forward: true });
  win.setMovable(!locked);
  win.setResizable(!locked);
  getMainTray()?.setDesktopLyricLock(locked);
};

/** 应用窗口置顶 */
export const applyDesktopLyricAlwaysOnTop = (alwaysOnTop: boolean): void => {
  const win = getDesktopLyricWindow();
  if (!win) return;
  win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
};

/** 锁定状态下由渲染端切换鼠标事件穿透 */
export const applyDesktopLyricMouseIgnore = (ignore: boolean): void => {
  const win = getDesktopLyricWindow();
  if (!win) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });
};

/** 移动窗口到指定位置；尺寸始终用权威 cachedSize 写回 */
export const moveDesktopLyricWindow = (x: number, y: number): void => {
  const win = getDesktopLyricWindow();
  if (!win) return;
  let tx = Math.round(x);
  let ty = Math.round(y);
  const store = useStore();
  const config = store.get("desktopLyric") as DesktopLyricSettings | undefined;
  if (config?.limitBounds) {
    const display = screen.getDisplayMatching({
      x: tx,
      y: ty,
      width: cachedSize.width,
      height: cachedSize.height,
    });
    const wa = display.workArea;
    tx = Math.max(wa.x, Math.min(wa.x + wa.width - cachedSize.width, tx));
    ty = Math.max(wa.y, Math.min(wa.y + wa.height - cachedSize.height, ty));
  }
  win.setBounds({ x: tx, y: ty, width: cachedSize.width, height: cachedSize.height });
};

/** 拖拽结束后保存最终位置 */
export const saveDesktopLyricState = (): void => {
  saveWindowState();
};

/**
 * 锁定窗口高度（渲染端按字号计算高度后回传）
 * 高度被 setMinimumSize/setMaximumSize 锁死为同一值，宽度允许在 [MIN_WIDTH, MAX_WIDTH] 内自由拖动
 */
export const applyDesktopLyricHeight = (height: number): void => {
  const win = getDesktopLyricWindow();
  if (!win) return;
  const h = Math.round(height);
  cachedSize.height = h;
  win.setMinimumSize(MIN_WIDTH, h);
  win.setMaximumSize(MAX_WIDTH, h);
  const { x, y } = win.getBounds();
  win.setBounds({ x, y, width: cachedSize.width, height: h });
};

/** 创建桌面歌词窗口 */
export const createDesktopLyricWindow = (): BrowserWindow | null => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.show();
    desktopLyricWindow.focus();
    return desktopLyricWindow;
  }

  const store = useStore();
  const config = store.get("desktopLyric") as DesktopLyricSettings;
  const saved = store.get("windowStates").desktopLyric;
  const initialHeight = saved.height || FALLBACK_HEIGHT;
  const initialWidth = saved.width || FALLBACK_WIDTH;

  const win = createWindow({
    width: initialWidth,
    height: initialHeight,
    ...(saved.x !== null && saved.y !== null ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    minHeight: initialHeight,
    maxHeight: initialHeight,
    title: "Desktop Lyric",
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: !config.locked,
    movable: !config.locked,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      disableDialogs: true,
      zoomFactor: 1.0,
    },
  });

  if (!win) {
    windowsLog.error("[desktop-lyric] createWindow failed");
    return null;
  }

  desktopLyricWindow = win;
  cachedSize.width = initialWidth;
  cachedSize.height = initialHeight;

  const url =
    isDev && process.env["ELECTRON_RENDERER_URL"]
      ? `${process.env["ELECTRON_RENDERER_URL"]}/windows/desktop-lyric/index.html`
      : `http://localhost:${port}/windows/desktop-lyric/index.html`;
  win.loadURL(url);

  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(1.0);
  });

  win.once("ready-to-show", () => {
    const b = win.getBounds();
    cachedSize.width = b.width;
    cachedSize.height = b.height;
    win.setAlwaysOnTop(config.alwaysOnTop, "screen-saver");
    startCursorPolling();
  });

  if (config.locked) {
    win.setIgnoreMouseEvents(true, { forward: true });
  }

  win.on("resized", () => {
    if (!desktopLyricWindow) return;
    const b = desktopLyricWindow.getBounds();
    cachedSize.width = b.width;
    cachedSize.height = b.height;
    saveWindowState();
  });

  // 标记可见性 + 同步初始锁定状态到托盘
  store.set("windowStates", {
    ...store.get("windowStates"),
    desktopLyric: { ...store.get("windowStates").desktopLyric, visible: true },
  });
  broadcast("desktopLyric:visibilityChange", true);
  getMainTray()?.setDesktopLyricShow(true);
  getMainTray()?.setDesktopLyricLock(config.locked);

  win.on("closed", () => {
    stopCursorPolling();
    desktopLyricWindow = null;
    broadcast("desktopLyric:visibilityChange", false);
    getMainTray()?.setDesktopLyricShow(false);
    if (!isAppQuitting()) {
      const s = useStore();
      s.set("windowStates", {
        ...s.get("windowStates"),
        desktopLyric: { ...s.get("windowStates").desktopLyric, visible: false },
      });
    }
  });

  return win;
};

/** 关闭桌面歌词窗口 */
export const closeDesktopLyricWindow = (): void => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.close();
  }
};

/** 切换桌面歌词窗口；返回切换后是否打开 */
export const toggleDesktopLyricWindow = (): boolean => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    closeDesktopLyricWindow();
    return false;
  }
  return createDesktopLyricWindow() !== null;
};

/** 获取桌面歌词窗口实例 */
export const getDesktopLyricWindow = (): BrowserWindow | null => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) return desktopLyricWindow;
  return null;
};
