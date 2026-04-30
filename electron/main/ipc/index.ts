import { isMac } from "../utils/config";
import initCacheIpc from "./ipc-cache";
import initFileIpc from "./ipc-file";
import { initMacStatusBarIpc } from "./ipc-mac-statusbar";
import initMediaIpc from "./ipc-media";
import initMpvIpc from "./ipc-mpv";
import initNowPlayingIpc from "./ipc-now-playing";
import initLyricWindowIpc from "./ipc-lyric-window";
import initProtocolIpc from "./ipc-protocol";
import initRendererLogIpc from "./ipc-renderer-log";
import initShortcutIpc from "./ipc-shortcut";
import initSocketIpc from "./ipc-socket";
import initStoreIpc from "./ipc-store";
import initSystemIpc from "./ipc-system";
import initThumbarIpc from "./ipc-thumbar";
import initTrayIpc from "./ipc-tray";
import initUpdateIpc from "./ipc-update";
import initWindowsIpc from "./ipc-window";

/**
 * 初始化全部 IPC 通信
 */
const initIpc = (): void => {
  initSystemIpc();
  initWindowsIpc();
  initUpdateIpc();
  initFileIpc();
  initTrayIpc();
  initStoreIpc();
  initThumbarIpc();
  initShortcutIpc();
  initProtocolIpc();
  initCacheIpc();
  initSocketIpc();
  initMediaIpc();
  initMpvIpc();
  initRendererLogIpc();
  // NowPlaying 总线（必须先于 mac-statusbar 注册，因后者订阅其事件）
  initNowPlayingIpc();
  // 三种歌词窗口（桌面/灵动岛/任务栏）的窗口控制 IPC
  initLyricWindowIpc();
  if (isMac) {
    initMacStatusBarIpc();
  }
};

export default initIpc;
