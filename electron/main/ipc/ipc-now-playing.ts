import { ipcMain } from "electron";
import * as nowPlaying from "../services/now-playing";
import { broadcast } from "../utils/broadcast";
import { NOW_PLAYING_IPC, type NowPlayingUpdatePayload } from "@shared/now-playing";

/** 注册 NowPlaying IPC 总线 */
const initNowPlayingIpc = (): void => {
  // 渲染进程同步当前播放状态到主进程
  ipcMain.on(NOW_PLAYING_IPC.UPDATE, (_event, payload: NowPlayingUpdatePayload) => {
    nowPlaying.update(payload.track, payload.lyric, payload.source);
  });

  // 渲染进程推送高频位置（来自主播放页面 throttle ~5Hz）
  ipcMain.on(
    NOW_PLAYING_IPC.POSITION,
    (_event, payload: { position: number; playing: boolean }) => {
      nowPlaying.onPosition(payload.position, payload.playing);
    },
  );

  // 渲染进程推送播放状态变更（暂停/恢复时立即对齐）
  ipcMain.on(NOW_PLAYING_IPC.PLAY_STATE, (_event, isPlaying: boolean) => {
    nowPlaying.onPlayStateChange(isPlaying);
  });

  // 窗口拉取当前完整快照
  ipcMain.handle(NOW_PLAYING_IPC.REQUEST_SNAPSHOT, () => nowPlaying.snapshot());

  // 订阅 service 事件并广播给所有窗口
  nowPlaying.onTrackChange((data) => broadcast(NOW_PLAYING_IPC.TRACK_CHANGE, data));
  nowPlaying.onLyricChange((snap) => broadcast(NOW_PLAYING_IPC.LYRIC_CHANGE, snap));
  nowPlaying.onPositionSync((data) => broadcast(NOW_PLAYING_IPC.POSITION_SYNC, data));
};

export default initNowPlayingIpc;
