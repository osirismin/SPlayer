/**
 * 歌词共享类型（主进程 / 渲染进程 / 歌词窗口共用）
 * 结构对齐 SPlayer-Next，作为 IPC 边界上的标准歌词数据格式
 */

/** 歌词来源 */
export type LyricSource = "external" | "embedded" | "online";

/** 歌词格式 */
export type LyricFormat = "ttml" | "lys" | "yrc" | "qrc" | "krc" | "lrc" | "srt" | "ass";

/** 歌词数据 */
export type LyricData = {
  source: LyricSource;
  format: LyricFormat;
  /** 在线歌词所属平台 */
  platform?: string;
} | null;

/** 歌词时间片段 */
export interface LyricSpan {
  /** 起始时间（毫秒） */
  startTime: number;
  /** 结束时间（毫秒） */
  endTime: number;
  /** 内容 */
  word: string;
}

/** 歌词单词 */
export interface LyricWord extends LyricSpan {
  /** 音译内容 */
  romanWord?: string;
  /** 是否包含不雅用语 */
  obscene?: boolean;
  /** 注音（如日语假名标注） */
  ruby?: LyricSpan[];
}

/** 一行歌词 */
export interface LyricLine {
  /** 该行的所有单词；非逐字格式时通常只含一个 word，且 startTime/endTime 与本行一致 */
  words: LyricWord[];
  /** 翻译歌词 */
  translatedLyric: string;
  /** 音译歌词 */
  romanLyric: string;
  /** 句子起始时间，单位毫秒 */
  startTime: number;
  /** 句子结束时间，单位毫秒 */
  endTime: number;
  /** 是否为背景歌词行 */
  isBG: boolean;
  /** 是否为对唱歌词行 */
  isDuet: boolean;
}
