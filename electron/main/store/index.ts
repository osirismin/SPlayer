import { app, screen } from "electron";
import Store from "electron-store";
import { join } from "path";
import {
  DEFAULT_DESKTOP_LYRIC,
  DEFAULT_DYNAMIC_ISLAND,
  DEFAULT_TASKBAR_LYRIC,
  DEFAULT_LYRIC_WINDOW_STATES,
  type DesktopLyricSettings,
  type DynamicIslandSettings,
  type LyricWindowStates,
  type TaskbarLyricSettings,
} from "@shared/lyric-window";
import { storeLog } from "../logger";
import { defaultAMLLDbServer } from "../utils/config";

storeLog.info("🌱 Store init");

export interface StoreType {
  /** 主窗口几何 */
  window: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    maximized?: boolean;
    useBorderless?: boolean;
    zoomFactor?: number;
  };
  /** 桌面歌词配置 */
  desktopLyric: DesktopLyricSettings;
  /** 灵动岛歌词配置 */
  dynamicIsland: DynamicIslandSettings;
  /** 任务栏歌词配置（仅 Windows 实际生效） */
  taskbarLyric: TaskbarLyricSettings;
  /** 三种歌词窗口的运行时几何状态 */
  windowStates: LyricWindowStates;
  /** 代理 */
  proxy: string;
  /** amll-db-server */
  amllDbServer: string;
  /** 缓存地址 */
  cachePath: string;
  /** 缓存大小限制 (GB) */
  cacheLimit: number;
  /** websocket */
  websocket: {
    enabled: boolean;
    port: number;
  };
  /** 下载线程数 */
  downloadThreadCount?: number;
  /** 启用 HTTP/2 下载 */
  enableDownloadHttp2?: boolean;
  /** macOS 专属设置 */
  macos: {
    statusBarLyric: {
      enabled: boolean;
    };
  };
  /** 更新通道 */
  updateChannel?: "stable" | "nightly";
}

/** 使用 Store */
export const useStore = () => {
  const screenData = screen.getPrimaryDisplay();
  const desktopLyricDefaultState = {
    ...DEFAULT_LYRIC_WINDOW_STATES.desktopLyric,
    x: Math.round(screenData.workAreaSize.width / 2 - 400),
    y: Math.round(screenData.workAreaSize.height - 240),
  };
  return new Store<StoreType>({
    defaults: {
      window: {
        width: 1280,
        height: 800,
        useBorderless: true,
      },
      desktopLyric: { ...DEFAULT_DESKTOP_LYRIC },
      dynamicIsland: { ...DEFAULT_DYNAMIC_ISLAND },
      taskbarLyric: { ...DEFAULT_TASKBAR_LYRIC },
      windowStates: {
        ...DEFAULT_LYRIC_WINDOW_STATES,
        desktopLyric: desktopLyricDefaultState,
      },
      proxy: "",
      amllDbServer: defaultAMLLDbServer,
      cachePath: join(app.getPath("userData"), "DataCache"),
      cacheLimit: 10,
      websocket: {
        enabled: false,
        port: 25885,
      },
      downloadThreadCount: 8,
      enableDownloadHttp2: true,
      macos: {
        statusBarLyric: {
          enabled: false,
        },
      },
      updateChannel: "stable",
    },
  });
};
