import { BrowserWindow, screen } from "electron";
import { createWindow } from "./index";
import { useStore } from "../store";
import { broadcast } from "../utils/broadcast";
import { isAppQuitting } from "../utils/lifecycle";
import { isDev, port } from "../utils/config";
import { windowsLog } from "../logger";
import { getMainTray } from "../tray";
import {
  DYNAMIC_ISLAND_BASE_HEIGHT,
  type DynamicIslandSettings,
  type DynamicIslandWindowState,
} from "@shared/lyric-window";

let dynamicIslandWindow: BrowserWindow | null = null;

const MIN_HEIGHT = 14;
const MAX_HEIGHT = 200;
const SNAP_THRESHOLD = 8;
const INITIAL_WIDTH = 200;
const CURSOR_POLL_MS = 150;

/** 权威尺寸缓存：避免 Windows 高 DPI 下 DIP↔物理像素回环漂移 */
const cachedSize = { width: INITIAL_WIDTH, height: 40 };

const clampHeight = (h: number): number =>
  Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h)));

/**
 * 计算吸附位置：贴当前所在屏 workArea 顶部
 * snapCentered=true 时按屏宽居中
 * snapCentered=false 时把 saved.x 当作中心点 x
 */
const computeSnappedPos = (): { x: number; y: number } => {
  const store = useStore();
  const config = store.get("dynamicIsland") as DynamicIslandSettings;
  const saved = store.get("windowStates").dynamicIsland;
  let display: Electron.Display;
  if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
    const bounds = dynamicIslandWindow.getBounds();
    display = screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    });
  } else if (saved.x !== null && saved.y !== null) {
    display = screen.getDisplayNearestPoint({
      x: saved.x,
      y: saved.y + Math.round(cachedSize.height / 2),
    });
  } else {
    display = screen.getPrimaryDisplay();
  }
  const wa = display.workArea;
  let x: number;
  if (config.snapCentered || saved.x === null) {
    x = wa.x + Math.round((wa.width - cachedSize.width) / 2);
  } else {
    const leftFromCenter = saved.x - Math.round(cachedSize.width / 2);
    x = Math.max(wa.x, Math.min(wa.x + wa.width - cachedSize.width, leftFromCenter));
  }
  return { x, y: wa.y };
};

export const applyDynamicIslandAlwaysOnTop = (alwaysOnTop: boolean): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
};

/** 光标位置轮询（非遮挡模式下用 OS 级 getCursorScreenPoint 判断鼠标是否在窗口内） */
let cursorPollTimer: NodeJS.Timeout | null = null;
let lastCursorInside = false;

const isCursorInsideBounds = (): boolean => {
  if (!dynamicIslandWindow || dynamicIslandWindow.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const b = dynamicIslandWindow.getBounds();
  return (
    cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height
  );
};

const startCursorPolling = (): void => {
  if (cursorPollTimer) return;
  lastCursorInside = isCursorInsideBounds();
  dynamicIslandWindow?.webContents.send("dynamicIsland:cursorInside", lastCursorInside);
  cursorPollTimer = setInterval(() => {
    if (!dynamicIslandWindow || dynamicIslandWindow.isDestroyed()) {
      stopCursorPolling();
      return;
    }
    const inside = isCursorInsideBounds();
    if (inside !== lastCursorInside) {
      lastCursorInside = inside;
      dynamicIslandWindow.webContents.send("dynamicIsland:cursorInside", inside);
    }
  }, CURSOR_POLL_MS);
};

const stopCursorPolling = (): void => {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
  if (lastCursorInside) {
    lastCursorInside = false;
    dynamicIslandWindow?.webContents.send("dynamicIsland:cursorInside", false);
  }
};

/** 应用非遮挡模式：开启后鼠标点击穿透窗口，并启动光标轮询 */
export const applyDynamicIslandNonOcclusive = (enabled: boolean): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  win.setIgnoreMouseEvents(enabled, { forward: true });
  if (enabled) {
    startCursorPolling();
  } else {
    stopCursorPolling();
  }
};

/** 切换"吸附是否居中"配置后，立即重新对齐窗口 */
export const applyDynamicIslandSnapCentered = (snapCentered: boolean): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  const store = useStore();
  const ws = store.get("windowStates");
  const saved = ws.dynamicIsland;
  if (saved.mode !== "snapped") return;
  if (snapCentered) {
    store.set("windowStates", {
      ...ws,
      dynamicIsland: { ...saved, mode: "snapped", x: null, y: null },
    });
  } else if (saved.x === null) {
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    });
    store.set("windowStates", {
      ...ws,
      dynamicIsland: {
        ...saved,
        mode: "snapped",
        x: bounds.x + Math.round(bounds.width / 2),
        y: display.workArea.y,
      },
    });
  }
  const pos = computeSnappedPos();
  win.setBounds({ x: pos.x, y: pos.y, width: cachedSize.width, height: cachedSize.height });
};

/** 应用窗口高度：渲染端上报最终高度，主进程仅做安全 clamp */
export const applyDynamicIslandHeight = (height: number): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  const h = clampHeight(height);
  cachedSize.height = h;
  const saved = useStore().get("windowStates").dynamicIsland;
  if (saved.mode === "snapped") {
    const pos = computeSnappedPos();
    win.setBounds({ x: pos.x, y: pos.y, width: cachedSize.width, height: h });
  } else {
    const bounds = win.getBounds();
    win.setBounds({ x: bounds.x, y: bounds.y, width: cachedSize.width, height: h });
  }
};

/** 应用窗口宽度：snapped 模式重算 x 居中；floating 模式保持中心点不变 */
export const applyDynamicIslandWidth = (width: number): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2),
  });
  const maxWidth = display.workArea.width;
  const newWidth = Math.max(1, Math.min(maxWidth, Math.round(width)));
  const oldWidth = cachedSize.width;
  cachedSize.width = newWidth;
  const saved = useStore().get("windowStates").dynamicIsland;
  if (saved.mode === "snapped") {
    const pos = computeSnappedPos();
    win.setBounds({ x: pos.x, y: pos.y, width: newWidth, height: cachedSize.height });
  } else {
    const centerX = bounds.x + Math.round(oldWidth / 2);
    const newX = centerX - Math.round(newWidth / 2);
    win.setBounds({ x: newX, y: bounds.y, width: newWidth, height: cachedSize.height });
  }
};

/** 移动窗口（拖拽中） */
export const moveDynamicIslandWindow = (x: number, y: number): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  const tx = Math.round(x);
  let ty = Math.round(y);
  const display = screen.getDisplayNearestPoint({
    x: tx + Math.round(cachedSize.width / 2),
    y: ty + Math.round(cachedSize.height / 2),
  });
  const wa = display.workArea;
  ty = Math.max(wa.y, Math.min(wa.y + wa.height - cachedSize.height, ty));
  win.setBounds({ x: tx, y: ty, width: cachedSize.width, height: cachedSize.height });
  broadcastMode(ty <= wa.y ? "snapped" : "floating");
};

let lastBroadcastMode: "snapped" | "floating" | null = null;

const broadcastMode = (mode: "snapped" | "floating"): void => {
  if (mode === lastBroadcastMode) return;
  lastBroadcastMode = mode;
  const win = getDynamicIslandWindow();
  win?.webContents.send("dynamicIsland:modeChange", mode);
};

/**
 * 拖拽结束时判定吸附
 * 落点 y 距离工作区顶部 < SNAP_THRESHOLD 则吸附；snapCentered 决定是否归中
 */
export const saveDynamicIslandState = (): void => {
  const win = getDynamicIslandWindow();
  if (!win) return;
  const b = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: b.x + Math.round(b.width / 2),
    y: b.y + Math.round(b.height / 2),
  });
  const wa = display.workArea;
  const store = useStore();
  const ws = store.get("windowStates");
  const saved = ws.dynamicIsland;

  if (b.y - wa.y <= SNAP_THRESHOLD) {
    const config = store.get("dynamicIsland") as DynamicIslandSettings;
    if (config.snapCentered) {
      const leftX = wa.x + Math.round((wa.width - cachedSize.width) / 2);
      win.setBounds({ x: leftX, y: wa.y, width: cachedSize.width, height: cachedSize.height });
      store.set("windowStates", {
        ...ws,
        dynamicIsland: { ...saved, mode: "snapped", x: null, y: null },
      });
    } else {
      const clampedLeftX = Math.max(wa.x, Math.min(wa.x + wa.width - cachedSize.width, b.x));
      const centerX = clampedLeftX + Math.round(cachedSize.width / 2);
      win.setBounds({
        x: clampedLeftX,
        y: wa.y,
        width: cachedSize.width,
        height: cachedSize.height,
      });
      store.set("windowStates", {
        ...ws,
        dynamicIsland: { ...saved, mode: "snapped", x: centerX, y: wa.y },
      });
    }
    broadcastMode("snapped");
  } else {
    store.set("windowStates", {
      ...ws,
      dynamicIsland: { ...saved, mode: "floating", x: b.x, y: b.y },
    });
    broadcastMode("floating");
  }
};

export const getDynamicIslandMode = (): DynamicIslandWindowState["mode"] => {
  const saved = useStore().get("windowStates").dynamicIsland;
  return saved.mode === "floating" ? "floating" : "snapped";
};

/** 创建灵动岛窗口 */
export const createDynamicIslandWindow = (): BrowserWindow | null => {
  if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
    dynamicIslandWindow.show();
    dynamicIslandWindow.focus();
    return dynamicIslandWindow;
  }

  const store = useStore();
  const config = store.get("dynamicIsland") as DynamicIslandSettings;
  const saved = store.get("windowStates").dynamicIsland;

  cachedSize.width = INITIAL_WIDTH;
  cachedSize.height = clampHeight(DYNAMIC_ISLAND_BASE_HEIGHT * config.scale);

  let initialPos: { x: number; y: number };
  if (saved.mode === "floating" && saved.x !== null && saved.y !== null) {
    const display = screen.getDisplayNearestPoint({
      x: saved.x + Math.round(cachedSize.width / 2),
      y: saved.y + Math.round(cachedSize.height / 2),
    });
    const wa = display.workArea;
    initialPos = {
      x: Math.max(wa.x, Math.min(wa.x + wa.width - cachedSize.width, saved.x)),
      y: Math.max(wa.y, Math.min(wa.y + wa.height - cachedSize.height, saved.y)),
    };
  } else {
    initialPos = computeSnappedPos();
  }

  const win = createWindow({
    width: cachedSize.width,
    height: cachedSize.height,
    x: initialPos.x,
    y: initialPos.y,
    title: "Dynamic Island",
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
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
    windowsLog.error("[dynamic-island] createWindow failed");
    return null;
  }

  dynamicIslandWindow = win;

  const url =
    isDev && process.env["ELECTRON_RENDERER_URL"]
      ? `${process.env["ELECTRON_RENDERER_URL"]}/windows/dynamic-island/index.html`
      : `http://localhost:${port}/windows/dynamic-island/index.html`;
  win.loadURL(url);

  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(1.0);
    const currentSaved = useStore().get("windowStates").dynamicIsland;
    lastBroadcastMode = null;
    broadcastMode(currentSaved.mode === "floating" ? "floating" : "snapped");
  });

  win.once("ready-to-show", () => {
    win.setAlwaysOnTop(config.alwaysOnTop, "screen-saver");
    if (config.nonOcclusive) {
      win.setIgnoreMouseEvents(true, { forward: true });
      startCursorPolling();
    }
  });

  store.set("windowStates", {
    ...store.get("windowStates"),
    dynamicIsland: { ...store.get("windowStates").dynamicIsland, visible: true },
  });
  broadcast("dynamicIsland:visibilityChange", true);
  getMainTray()?.setDynamicIslandShow(true);

  win.on("closed", () => {
    stopCursorPolling();
    dynamicIslandWindow = null;
    lastBroadcastMode = null;
    broadcast("dynamicIsland:visibilityChange", false);
    getMainTray()?.setDynamicIslandShow(false);
    if (!isAppQuitting()) {
      const s = useStore();
      s.set("windowStates", {
        ...s.get("windowStates"),
        dynamicIsland: { ...s.get("windowStates").dynamicIsland, visible: false },
      });
    }
  });

  return win;
};

/** 关闭灵动岛窗口 */
export const closeDynamicIslandWindow = (): void => {
  if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
    dynamicIslandWindow.close();
  }
};

/** 切换灵动岛窗口；返回切换后是否打开 */
export const toggleDynamicIslandWindow = (): boolean => {
  if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
    closeDynamicIslandWindow();
    return false;
  }
  return createDynamicIslandWindow() !== null;
};

/** 获取灵动岛窗口实例 */
export const getDynamicIslandWindow = (): BrowserWindow | null => {
  if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) return dynamicIslandWindow;
  return null;
};
