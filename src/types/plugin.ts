/** 插件能力类型 */
export type PluginCapability = "audio-source";

/** 插件元数据（从 JSDoc 解析） */
export interface PluginMeta {
  /** 插件名称 */
  name: string;
  /** 插件描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 作者 */
  author: string;
  /** 主页 */
  homepage?: string;
}

/** 插件持久化状态（存储在 electron-store） */
export interface PluginState {
  /** 唯一 ID（文件名 hash） */
  id: string;
  /** 插件元数据 */
  meta: PluginMeta;
  /** 是否启用 */
  enabled: boolean;
  /** 插件文件名（相对于 userData/plugins/） */
  fileName: string;
  /** 来源类型 */
  source: "file";
  /** 插件配置 */
  config: Record<string, unknown>;
}

/** 插件运行时信息（渲染器展示用） */
export interface PluginRuntimeInfo {
  /** 插件 ID */
  id: string;
  /** 插件元数据 */
  meta: PluginMeta;
  /** 是否启用 */
  enabled: boolean;
  /** 是否正在运行 */
  running: boolean;
  /** 来源类型 */
  source: "file";
  /** 已注册的能力 */
  capabilities: PluginCapability[];
}

/** 音频源解析结果 */
export interface AudioSourceResult {
  /** 播放地址 */
  url: string;
  /** 音质 */
  quality?: string;
  /** 来源标签 */
  sourceLabel?: string;
}

/** 解析请求中的歌曲数据（序列化安全） */
export interface PluginSongData {
  id: number;
  name: string;
  artists: string | { name: string }[];
  album?: string | { name: string };
  type?: string;
}
