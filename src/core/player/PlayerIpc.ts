import { useSettingStore } from "@/stores";
import {
  NOW_PLAYING_IPC,
  type NowPlayingTrack,
  type NowPlayingUpdatePayload,
} from "@/types/shared/now-playing";
import type { LyricLine, LyricData } from "@/types/shared/lyrics";
import type { PlayModePayload, RepeatModeType, ShuffleModeType } from "@/types/shared/play-mode";
import { isElectron } from "@/utils/env";
import { getPlaySongData } from "@/utils/format";
import type { DiscordConfigPayload, MetadataParam, PlaybackStatus, RepeatMode } from "@emi";
import { throttle } from "lodash-es";

/**
 * 封装安全的 IPC 发送方法
 * 仅在 Electron 环境下执行，避免在 Web 浏览器环境报错
 * @param channel IPC 频道名称
 * @param args 传递给主进程的参数
 */
const sendIpc = (channel: string, ...args: any[]) => {
  if (isElectron) {
    window.electron.ipcRenderer.send(channel, ...args);
  }
};

/**
 * 发送播放状态
 * @param isPlaying 是否播放
 */
export const sendPlayStatus = (isPlaying: boolean) => sendIpc("play-status-change", isPlaying);

/**
 * 发送歌曲信息（用于托盘 / SMTC 等通用集成；歌词窗口走 NowPlaying 总线）
 * @param title 歌曲标题
 * @param name 歌曲名称
 * @param artist 歌手
 * @param album 专辑
 */
export const sendSongChange = (title: string, name: string, artist: string, album: string) => {
  if (!isElectron) return;
  const duration = getPlaySongData()?.duration ?? 0;
  sendIpc("play-song-change", { title, name, artist, album, duration });
};

/**
 * 发送状态栏进度
 * @param progress 进度
 */
export const sendTaskbarProgress: (progress: number | "none") => void = throttle(
  (progress: number | "none") => sendIpc("set-bar-progress", progress),
  1000,
);

/**
 * 发送状态栏模式
 * @param mode 模式
 */
export const sendTaskbarMode = (mode: "normal" | "paused" | "error" | "indeterminate") =>
  sendIpc("set-bar-mode", mode);

/**
 * 发送 Socket 实时进度
 */
export const sendSocketProgress: (currentTime: number, duration: number) => void = throttle(
  (currentTime: number, duration: number) => sendIpc("set-progress", { currentTime, duration }),
  500,
);

/**
 * 发送喜欢状态
 * @param isLiked 是否喜欢
 */
export const sendLikeStatus = (isLiked: boolean) => sendIpc("like-status-change", isLiked);

// =====================================================================
// NowPlaying 总线 API
// 三种歌词窗口（桌面 / 灵动岛 / 任务栏）和 mac 状态栏歌词都通过这一条总线
// =====================================================================

/** 推送当前播放状态（曲目 + 已解析歌词 + 来源）到主进程总线 */
export const nowPlayingUpdate = (payload: NowPlayingUpdatePayload) => {
  sendIpc(NOW_PLAYING_IPC.UPDATE, payload);
};

/** 推送高频播放位置（毫秒） */
export const nowPlayingPosition: (positionMs: number, playing: boolean) => void = throttle(
  (positionMs: number, playing: boolean) => {
    sendIpc(NOW_PLAYING_IPC.POSITION, { position: positionMs, playing });
  },
  200,
);

/** 推送播放状态变化（暂停/恢复立即同步一次） */
export const nowPlayingPlayState = (playing: boolean) => {
  sendIpc(NOW_PLAYING_IPC.PLAY_STATE, playing);
};

/**
 * 把 SongType 转成 NowPlayingTrack（IPC 边界格式）
 * 字段以原项目 SongType 为准，artists / album 保持原始的字符串/数组多态
 */
export const buildNowPlayingTrack = (
  song: {
    id: number | string;
    name: string;
    artists: unknown;
    album?: unknown;
    duration: number;
    cover?: string;
    type?: "song" | "radio" | "streaming";
    path?: string;
    alia?: string;
  } | null,
): NowPlayingTrack | null => {
  if (!song) return null;
  return {
    id: song.id,
    name: song.name,
    artists: song.artists as NowPlayingTrack["artists"],
    album: song.album as NowPlayingTrack["album"],
    duration: song.duration,
    cover: song.cover,
    type: song.type,
    path: song.path,
    alia: song.alia,
  };
};

/** 推送歌词与曲目（在 LyricManager 完成解析后调用） */
export const nowPlayingPushTrackAndLyric = (
  song: Parameters<typeof buildNowPlayingTrack>[0],
  lyric: LyricLine[],
  source: LyricData,
) => {
  nowPlayingUpdate({
    track: buildNowPlayingTrack(song),
    lyric,
    source,
  });
};

/**
 * 发送播放模式给托盘
 * @param repeatMode 循环模式 ('off' | 'list' | 'one')
 * @param shuffleMode 随机/心动模式 ('off' | 'on' | 'heartbeat')
 */
export const sendPlayMode = (repeatMode: RepeatModeType, shuffleMode: ShuffleModeType) => {
  if (isElectron) {
    const payload: PlayModePayload = { repeatMode, shuffleMode };
    sendIpc("play-mode-change", payload);
  }
};

///////////////////////////////////////////
//
// 媒体控件
//
///////////////////////////////////////////

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type EmiModule = typeof import("@emi"); // 用于 JSDoc

/**
 * @description 通过外部媒体集成模块更新媒体控件和 Discord RPC 的元数据
 * @note 仅在 Electron 上有效
 * @param payload - 参见 {@link MetadataParam}
 * @see {@link EmiModule.updateMetadata 外部媒体集成模块的 `updateMetadata` 方法}
 */
export const sendMediaMetadata = (payload: MetadataParam) =>
  sendIpc("media-update-metadata", payload);

/**
 * @description 通过外部媒体集成模块更新媒体控件和 Discord RPC 的播放状态
 * @note 仅在 Electron 上有效
 * @param status - 参见 {@link PlaybackStatus}
 * @see {@link EmiModule.updatePlayState 外部媒体集成模块的 `updatePlayState` 方法}
 */
export const sendMediaPlayState = (status: PlaybackStatus) =>
  sendIpc("media-update-play-state", { status });

/**
 * @description 通过外部媒体集成模块更新媒体控件的播放速率
 * @note 仅在 Electron 上有效
 * @param rate - 播放速率，1.0 表示正常速度
 * @see {@link EmiModule.updatePlaybackRate 外部媒体集成模块的 `updatePlaybackRate` 方法}
 */
export const sendMediaPlaybackRate = (rate: number) =>
  sendIpc("media-update-playback-rate", { rate });

/**
 * @description 通过外部媒体集成模块更新媒体控件的音量
 * @note 仅在 Electron 上有效
 * @param volume - 音量，范围是 0.0（静音）到 1.0（最大音量）
 * @see {@link EmiModule.updateVolume 外部媒体集成模块的 `updateVolume` 方法}
 */
export const sendMediaVolume = (volume: number) => sendIpc("media-update-volume", { volume });

/**
 * @description 通过外部媒体集成模块更新媒体控件和 Discord RPC 的播放状态
 * @note 仅在 Electron 上有效
 * @param currentTime - 当前的播放进度，单位是毫秒
 * @param totalTime - 总时长，单位是毫秒
 * @param seeked - 是否为 seek 操作触发的更新
 * @see {@link EmiModule.updateTimeline 外部媒体集成模块的 `updateTimeline` 方法}
 */
export const sendMediaTimeline = (currentTime: number, totalTime: number, seeked?: boolean) =>
  sendIpc("media-update-timeline", { currentTime, totalTime, seeked });

/**
 * @description 通过外部媒体集成模块更新媒体控件的播放模式。不会更新 Discord RPC 的播放状态
 * @note 仅在 Electron 上有效
 * @param isShuffling - 当前是否是随机播放模式
 * @param repeatMode - 当前的循环播放模式，参见 {@link RepeatMode}
 * @see {@link EmiModule.updatePlayMode 外部媒体集成模块的 `updatePlayMode` 方法}
 */
export const sendMediaPlayMode = (isShuffling: boolean, repeatMode: RepeatMode) =>
  sendIpc("media-update-play-mode", { isShuffling, repeatMode });

///////////////////////////////////////////
//
// Discord RPC
//
///////////////////////////////////////////

/**
 * @description 启用 Discord RPC
 * @note 仅在 Electron 上有效
 * @see {@link EmiModule.enableDiscordRpc 外部媒体集成模块的 `enableDiscordRpc` 方法}
 */
export const enableDiscordRpc = () => {
  if (!isElectron) return;
  sendIpc("discord-enable");
  // 立即发送当前配置，确保外部媒体集成模块使用正确的设置
  const settingStore = useSettingStore();
  sendIpc("discord-update-config", {
    showWhenPaused: settingStore.discordRpc.showWhenPaused,
    displayMode: settingStore.discordRpc.displayMode,
  });
};

/**
 * @description 禁用 Discord RPC
 * @note 仅在 Electron 上有效
 * @see {@link EmiModule.disableDiscordRpc 外部媒体集成模块的 `disableDiscordRpc` 方法}
 */
export const disableDiscordRpc = () => sendIpc("discord-disable");

/**
 * @description 更新 Discord RPC 配置
 * @note 仅在 Electron 上有效
 * @param config 配置信息，参见 {@link DiscordConfigPayload}
 * @see {@link EmiModule.updateDiscordConfig 外部媒体集成模块的 `updateDiscordConfig` 方法}
 */
export const updateDiscordConfig = (config: DiscordConfigPayload) => {
  const { showWhenPaused, displayMode } = config;
  sendIpc("discord-update-config", {
    showWhenPaused,
    displayMode: displayMode,
  });
};
