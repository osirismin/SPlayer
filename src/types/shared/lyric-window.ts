/**
 * 三种歌词窗口的配置类型与窗口状态类型
 * 主进程 electron-store / 渲染进程 setting store / 各歌词窗口 共用
 */

/** 桌面歌词对齐方式 */
export type DesktopLyricAlign = "left" | "center" | "right" | "justify";

/** 桌面歌词配置 */
export interface DesktopLyricSettings {
  /** 字号 */
  fontSize: number;
  /** 字重 */
  fontWeight: number;
  /** 字体族（CSS font-family） */
  fontFamily: string;
  /** 显示翻译 */
  showTranslation: boolean;
  /** 双行显示 */
  doubleLine: boolean;
  /** 对齐方式 */
  align: DesktopLyricAlign;
  /** 逐字高亮 */
  wordByWord: boolean;
  /** 自动生成逐字效果 */
  autoGenerateWordByWord: boolean;
  /** 已播放颜色 */
  playedColor: string;
  /** 未播放颜色 */
  unplayedColor: string;
  /** 描边颜色 */
  strokeColor: string;
  /** 是否启用文本背景遮罩 */
  backgroundMask: boolean;
  /** 文本背景遮罩颜色 */
  backgroundMaskColor: string;
  /** 是否常驻显示歌曲信息 */
  alwaysShowSongInfo: boolean;
  /** 拖拽时是否把窗口限制在屏幕工作区内 */
  limitBounds: boolean;
  /** 歌词行切换动画 */
  animation: boolean;
  /** 窗口置顶 */
  alwaysOnTop: boolean;
  /** 锁定：鼠标穿透、禁止拖动 */
  locked: boolean;
}

/** 灵动岛歌词配置 */
export interface DynamicIslandSettings {
  /** 缩放比例（0.5 ~ 2.0），1 = 100% */
  scale: number;
  /** 字重 */
  fontWeight: number;
  /** 字体族（CSS font-family） */
  fontFamily: string;
  /** 逐字高亮 */
  wordByWord: boolean;
  /** 已播放颜色 */
  playedColor: string;
  /** 未播放颜色 */
  unplayedColor: string;
  /** 背景颜色 */
  backgroundColor: string;
  /** 窗口置顶 */
  alwaysOnTop: boolean;
  /** 吸附时是否居中 */
  snapCentered: boolean;
  /** 非遮挡模式 */
  nonOcclusive: boolean;
  /** 总是双行 */
  doubleLine: boolean;
  /** 显示翻译 */
  showTranslation: boolean;
}

/** 任务栏歌词位置模式 */
export type TaskbarLyricPosition = "auto" | "left" | "right";

/** 任务栏歌词配色模式 */
export type TaskbarLyricColorMode = "taskbar" | "light" | "dark";

/** 任务栏歌词配置（仅 Windows） */
export interface TaskbarLyricSettings {
  /** 位置：auto 自动 / left 左侧 / right 右侧 */
  position: TaskbarLyricPosition;
  /** 宽度自动 */
  autoMaxWidth: boolean;
  /** 最大宽度（逻辑像素） */
  maxWidth: number;
  /** 配色模式 */
  colorMode: TaskbarLyricColorMode;
  /** 双行显示 */
  doubleLine: boolean;
  /** 显示翻译 */
  showTranslation: boolean;
  /** 显示封面 */
  showCover: boolean;
  /** 逐字高亮 */
  wordByWord: boolean;
  /** 字号（逻辑像素） */
  fontSize: number;
  /** 字体族（CSS font-family） */
  fontFamily: string;
}

/** 桌面歌词窗口几何 */
export interface DesktopLyricWindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  visible: boolean;
}

/** 灵动岛窗口几何 */
export interface DynamicIslandWindowState {
  /** snapped: 吸附顶部；floating: 自由位置 */
  mode: "snapped" | "floating";
  x: number | null;
  y: number | null;
  visible: boolean;
}

/** 任务栏歌词窗口状态 */
export interface TaskbarLyricWindowState {
  visible: boolean;
}

/** 歌词窗口几何状态汇总 */
export interface LyricWindowStates {
  desktopLyric: DesktopLyricWindowState;
  dynamicIsland: DynamicIslandWindowState;
  taskbarLyric: TaskbarLyricWindowState;
}

/** 灵动岛基准高度（缩放 = 1 时主行高度） */
export const DYNAMIC_ISLAND_BASE_HEIGHT = 40;

/** 桌面歌词配置默认值 */
export const DEFAULT_DESKTOP_LYRIC: DesktopLyricSettings = {
  fontSize: 24,
  fontWeight: 600,
  fontFamily: "system-ui",
  showTranslation: true,
  doubleLine: true,
  align: "center",
  wordByWord: true,
  autoGenerateWordByWord: true,
  playedColor: "rgb(254, 121, 113)",
  unplayedColor: "rgb(255, 255, 255)",
  strokeColor: "rgba(0, 0, 0, 0.5)",
  backgroundMask: false,
  backgroundMaskColor: "rgba(0, 0, 0, 0.3)",
  alwaysShowSongInfo: false,
  limitBounds: false,
  animation: true,
  alwaysOnTop: true,
  locked: false,
};

/** 灵动岛配置默认值 */
export const DEFAULT_DYNAMIC_ISLAND: DynamicIslandSettings = {
  scale: 1,
  fontWeight: 500,
  fontFamily: "system-ui",
  wordByWord: true,
  playedColor: "rgba(255, 255, 255, 1)",
  unplayedColor: "rgba(255, 255, 255, 0.5)",
  backgroundColor: "rgba(0, 0, 0, 1)",
  alwaysOnTop: true,
  snapCentered: true,
  nonOcclusive: false,
  doubleLine: false,
  showTranslation: false,
};

/** 任务栏歌词配置默认值 */
export const DEFAULT_TASKBAR_LYRIC: TaskbarLyricSettings = {
  position: "auto",
  autoMaxWidth: true,
  maxWidth: 400,
  colorMode: "taskbar",
  doubleLine: true,
  showTranslation: true,
  showCover: true,
  wordByWord: true,
  fontSize: 14,
  fontFamily: "system-ui",
};

/** 窗口几何默认值 */
export const DEFAULT_LYRIC_WINDOW_STATES: LyricWindowStates = {
  desktopLyric: {
    width: 800,
    height: 200,
    x: null,
    y: null,
    visible: false,
  },
  dynamicIsland: {
    mode: "snapped",
    x: null,
    y: null,
    visible: false,
  },
  taskbarLyric: {
    visible: false,
  },
};
