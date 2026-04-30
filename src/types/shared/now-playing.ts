/**
 * 主进程播放状态总线（NowPlayingService）类型定义
 * 用于：主窗口 → 主进程 推送当前播放状态；主进程 → 各歌词窗口 广播
 */
import type { LyricData, LyricLine } from "./lyrics";

/** 歌手元数据（与原项目 MetaData 一致） */
export interface NowPlayingArtist {
  id?: number | string;
  name: string;
}

/** 专辑元数据（与原项目 MetaData 一致） */
export interface NowPlayingAlbum {
  id?: number | string;
  name: string;
}

/**
 * 歌曲基本信息（IPC 边界上的最小集合）
 * 字段命名贴合原项目 SongType：用 `name` 而非 `title`，artists/album 兼容字符串与数组
 */
export interface NowPlayingTrack {
  /** 歌曲 ID */
  id: number | string;
  /** 歌曲名称（对应 SongType.name） */
  name: string;
  /** 歌手：可能是 MetaData 数组，也可能是单个字符串 */
  artists: NowPlayingArtist[] | string;
  /** 专辑：可能是 MetaData，也可能是单个字符串 */
  album?: NowPlayingAlbum | string;
  /** 时长（毫秒） */
  duration: number;
  /** 封面 URL */
  cover?: string;
  /** 歌曲类型：song / radio / streaming */
  type?: "song" | "radio" | "streaming";
  /** 本地路径（本地歌曲才有） */
  path?: string;
  /** 别名（NCM 歌曲常见） */
  alia?: string;
}

/** 渲染进程 → 主进程：同步当前播放状态（track + 歌词 + 源） */
export interface NowPlayingUpdatePayload {
  track: NowPlayingTrack | null;
  lyric: LyricLine[];
  source: LyricData;
}

/** 主进程 → 窗口：当前播放的完整快照 */
export interface NowPlayingSnapshot {
  track: NowPlayingTrack | null;
  lyric: LyricLine[];
  source: LyricData;
  position: number;
  playing: boolean;
  /** 发送时刻的主进程时钟（Date.now 毫秒），接收端用于补偿 IPC 延迟 */
  sendTimestamp: number;
}

/** 主进程 → 窗口：播放位置锚点 */
export interface NowPlayingPositionSync {
  position: number;
  playing: boolean;
  sendTimestamp: number;
}

/** IPC 通道常量 */
export const NOW_PLAYING_IPC = {
  /** 渲染进程 → 主进程：完整状态更新 */
  UPDATE: "nowPlaying:update",
  /** 渲染进程 → 主进程：高频位置同步 */
  POSITION: "nowPlaying:position",
  /** 渲染进程 → 主进程：播放状态切换 */
  PLAY_STATE: "nowPlaying:playState",
  /** 渲染进程 → 主进程（invoke）：拉取当前完整快照 */
  REQUEST_SNAPSHOT: "nowPlaying:requestSnapshot",
  /** 主进程 → 窗口：曲目切换 */
  TRACK_CHANGE: "nowPlaying:track-change",
  /** 主进程 → 窗口：歌词内容变化（含完整快照） */
  LYRIC_CHANGE: "nowPlaying:lyric-change",
  /** 主进程 → 窗口：播放位置锚点 */
  POSITION_SYNC: "nowPlaying:position-sync",
} as const;
