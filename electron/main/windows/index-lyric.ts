/**
 * 歌词窗口集中导出 + 启动恢复入口
 */
import { useStore } from "../store";
import { isWin } from "../utils/config";
import { createDesktopLyricWindow } from "./desktop-lyric-window";
import { createDynamicIslandWindow } from "./dynamic-island-window";
import { createTaskbarLyricWindow } from "./taskbar-lyric-window";

export {
  createDesktopLyricWindow,
  closeDesktopLyricWindow,
  toggleDesktopLyricWindow,
  getDesktopLyricWindow,
  applyDesktopLyricLock,
  applyDesktopLyricAlwaysOnTop,
  applyDesktopLyricMouseIgnore,
  applyDesktopLyricHeight,
  moveDesktopLyricWindow,
  saveDesktopLyricState,
} from "./desktop-lyric-window";

export {
  createDynamicIslandWindow,
  closeDynamicIslandWindow,
  toggleDynamicIslandWindow,
  getDynamicIslandWindow,
  applyDynamicIslandAlwaysOnTop,
  applyDynamicIslandHeight,
  applyDynamicIslandWidth,
  applyDynamicIslandSnapCentered,
  applyDynamicIslandNonOcclusive,
  moveDynamicIslandWindow,
  saveDynamicIslandState,
  getDynamicIslandMode,
} from "./dynamic-island-window";

export {
  createTaskbarLyricWindow,
  closeTaskbarLyricWindow,
  toggleTaskbarLyricWindow,
  getTaskbarLyricWindow,
  applyTaskbarLyricLayout,
} from "./taskbar-lyric-window";

/** 启动时恢复关闭前打开的歌词窗口 */
export const restoreLyricWindows = (): void => {
  const ws = useStore().get("windowStates");
  if (ws.desktopLyric.visible) createDesktopLyricWindow();
  if (ws.dynamicIsland.visible) createDynamicIslandWindow();
  if (isWin && ws.taskbarLyric.visible) createTaskbarLyricWindow();
};
