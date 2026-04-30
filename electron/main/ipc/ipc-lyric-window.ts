import { app, ipcMain } from "electron";
import { isWin } from "../utils/config";
import { useStore } from "../store";
import { broadcast } from "../utils/broadcast";
import {
  applyDesktopLyricHeight,
  applyDesktopLyricMouseIgnore,
  closeDesktopLyricWindow,
  getDesktopLyricWindow,
  moveDesktopLyricWindow,
  saveDesktopLyricState,
  toggleDesktopLyricWindow,
  applyDesktopLyricLock,
  applyDesktopLyricAlwaysOnTop,
} from "../windows/desktop-lyric-window";
import {
  applyDynamicIslandHeight,
  applyDynamicIslandSnapCentered,
  applyDynamicIslandNonOcclusive,
  applyDynamicIslandWidth,
  applyDynamicIslandAlwaysOnTop,
  closeDynamicIslandWindow,
  getDynamicIslandWindow,
  getDynamicIslandMode,
  moveDynamicIslandWindow,
  saveDynamicIslandState,
  toggleDynamicIslandWindow,
} from "../windows/dynamic-island-window";
import {
  applyTaskbarLyricLayout,
  closeTaskbarLyricWindow,
  getTaskbarLyricWindow,
  toggleTaskbarLyricWindow,
} from "../windows/taskbar-lyric-window";
import mainWindow from "../windows/main-window";
import type {
  DesktopLyricSettings,
  DynamicIslandSettings,
  TaskbarLyricSettings,
} from "@shared/lyric-window";

type LyricMode = "desktopLyric" | "dynamicIsland" | "taskbarLyric";

type AnyConfig = Partial<DesktopLyricSettings & DynamicIslandSettings & TaskbarLyricSettings>;

/** 注册三种歌词窗口的 IPC */
const initLyricWindowIpc = (): void => {
  // ----- 桌面歌词窗口 -----
  ipcMain.handle("window:toggleDesktopLyric", () => toggleDesktopLyricWindow());
  ipcMain.handle("window:closeDesktopLyric", () => closeDesktopLyricWindow());
  ipcMain.handle("window:isDesktopLyricOpen", () => !!getDesktopLyricWindow());

  ipcMain.handle("desktopLyric:setHeight", (_event, height: number) => {
    applyDesktopLyricHeight(height);
  });
  ipcMain.on("desktopLyric:setMouseIgnore", (_event, ignore: boolean) => {
    applyDesktopLyricMouseIgnore(ignore);
  });
  ipcMain.on("desktopLyric:move", (_event, x: number, y: number) => {
    moveDesktopLyricWindow(x, y);
  });
  ipcMain.on("desktopLyric:saveState", () => {
    saveDesktopLyricState();
  });

  // ----- 灵动岛窗口 -----
  ipcMain.handle("window:toggleDynamicIsland", () => toggleDynamicIslandWindow());
  ipcMain.handle("window:closeDynamicIsland", () => closeDynamicIslandWindow());
  ipcMain.handle("window:isDynamicIslandOpen", () => !!getDynamicIslandWindow());

  ipcMain.on("dynamicIsland:move", (_event, x: number, y: number) => {
    moveDynamicIslandWindow(x, y);
  });
  ipcMain.on("dynamicIsland:saveState", () => saveDynamicIslandState());
  ipcMain.on("dynamicIsland:resize", (_event, width: number) => {
    applyDynamicIslandWidth(width);
  });
  ipcMain.on("dynamicIsland:setHeight", (_event, height: number) => {
    applyDynamicIslandHeight(height);
  });
  ipcMain.handle("dynamicIsland:getMode", () => getDynamicIslandMode());

  // ----- 任务栏歌词窗口（仅 Windows）-----
  if (isWin) {
    ipcMain.handle("window:toggleTaskbarLyric", () => toggleTaskbarLyricWindow());
    ipcMain.handle("window:closeTaskbarLyric", () => closeTaskbarLyricWindow());
    ipcMain.handle("window:isTaskbarLyricOpen", () => !!getTaskbarLyricWindow());
  } else {
    ipcMain.handle("window:toggleTaskbarLyric", () => false);
    ipcMain.handle("window:closeTaskbarLyric", () => undefined);
    ipcMain.handle("window:isTaskbarLyricOpen", () => false);
  }

  // ----- 通用：聚焦主窗口 -----
  ipcMain.on("window:focusMain", () => {
    const mainWin = mainWindow.getWin();
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  });

  // ----- 歌词窗口配置存取 -----
  ipcMain.handle("lyric:getConfig", (_event, mode: LyricMode) => {
    const store = useStore();
    return store.get(mode);
  });

  ipcMain.handle("lyric:setConfig", (_event, mode: LyricMode, partial: AnyConfig) => {
    const store = useStore();
    const current = (store.get(mode) ?? {}) as AnyConfig;
    const next = { ...current, ...partial };
    store.set(mode, next);

    // 广播配置变更给对应歌词窗口
    broadcast(`${mode}:configChange`, next);

    // 立即应用部分有副作用的字段
    if (mode === "desktopLyric") {
      const k = partial as Partial<DesktopLyricSettings>;
      if ("locked" in k && typeof k.locked === "boolean") applyDesktopLyricLock(k.locked);
      if ("alwaysOnTop" in k && typeof k.alwaysOnTop === "boolean")
        applyDesktopLyricAlwaysOnTop(k.alwaysOnTop);
    } else if (mode === "dynamicIsland") {
      const k = partial as Partial<DynamicIslandSettings>;
      if ("alwaysOnTop" in k && typeof k.alwaysOnTop === "boolean")
        applyDynamicIslandAlwaysOnTop(k.alwaysOnTop);
      if ("snapCentered" in k && typeof k.snapCentered === "boolean")
        applyDynamicIslandSnapCentered(k.snapCentered);
      if ("nonOcclusive" in k && typeof k.nonOcclusive === "boolean")
        applyDynamicIslandNonOcclusive(k.nonOcclusive);
    } else if (mode === "taskbarLyric") {
      // 任务栏歌词大部分字段变化都需要重算布局
      applyTaskbarLyricLayout();
    }

    return next;
  });

  // ----- 播放器调度（窗口端发起播放控制）-----
  // 映射到主窗口 initIpc.ts 中已有的播放控制 IPC 通道
  const dispatchMap: Record<string, string> = {
    play: "play",
    pause: "pause",
    playOrPause: "playOrPause",
    prev: "playPrev",
    next: "playNext",
  };
  ipcMain.on("player:dispatch", (_event, action: string) => {
    const mainWin = mainWindow.getWin();
    if (!mainWin) return;
    const channel = dispatchMap[action];
    if (channel) mainWin.webContents.send(channel);
  });

  // 应用退出时清理
  app.on("before-quit", () => {
    closeDesktopLyricWindow();
    closeDynamicIslandWindow();
    closeTaskbarLyricWindow();
  });
};

export default initLyricWindowIpc;
