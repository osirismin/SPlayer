import { ElectronAPI } from "@electron-toolkit/preload";
import type { StoreType } from "../main/store";
import type {
  NowPlayingPositionSync,
  NowPlayingSnapshot,
  NowPlayingTrack,
  NowPlayingUpdatePayload,
} from "../../src/types/shared/now-playing";
import type {
  DesktopLyricSettings,
  DynamicIslandSettings,
  TaskbarLyricSettings,
} from "../../src/types/shared/lyric-window";

type LyricMode = "desktopLyric" | "dynamicIsland" | "taskbarLyric";
type LyricConfigOf<M extends LyricMode> = M extends "desktopLyric"
  ? DesktopLyricSettings
  : M extends "dynamicIsland"
    ? DynamicIslandSettings
    : TaskbarLyricSettings;

interface NowPlayingApi {
  update(payload: NowPlayingUpdatePayload): void;
  sendPosition(position: number, playing: boolean): void;
  sendPlayState(playing: boolean): void;
  requestSnapshot(): Promise<NowPlayingSnapshot>;
  onTrackChange(cb: (data: { track: NowPlayingTrack | null }) => void): () => void;
  onLyricChange(cb: (snap: NowPlayingSnapshot) => void): () => void;
  onPositionSync(cb: (data: NowPlayingPositionSync) => void): () => void;
}

interface LyricConfigApi {
  getConfig<M extends LyricMode>(mode: M): Promise<LyricConfigOf<M> | null>;
  setConfig<M extends LyricMode>(
    mode: M,
    partial: Partial<LyricConfigOf<M>>,
  ): Promise<LyricConfigOf<M>>;
}

interface WindowApi {
  focusMain(): void;
  toggleDesktopLyric(): Promise<boolean>;
  closeDesktopLyric(): Promise<void>;
  isDesktopLyricOpen(): Promise<boolean>;
  toggleDynamicIsland(): Promise<boolean>;
  closeDynamicIsland(): Promise<void>;
  isDynamicIslandOpen(): Promise<boolean>;
  toggleTaskbarLyric(): Promise<boolean>;
  closeTaskbarLyric(): Promise<void>;
  isTaskbarLyricOpen(): Promise<boolean>;
}

interface DesktopLyricApi {
  setHeight(height: number): Promise<void>;
  setMouseIgnore(ignore: boolean): void;
  move(x: number, y: number): void;
  saveState(): void;
  onConfigChange(cb: (config: DesktopLyricSettings) => void): () => void;
  onCursorInside(cb: (inside: boolean) => void): () => void;
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
}

interface DynamicIslandApi {
  move(x: number, y: number): void;
  saveState(): void;
  resize(width: number): void;
  setHeight(height: number): void;
  getMode(): Promise<"snapped" | "floating">;
  onConfigChange(cb: (config: DynamicIslandSettings) => void): () => void;
  onModeChange(cb: (mode: "snapped" | "floating") => void): () => void;
  onCursorInside(cb: (inside: boolean) => void): () => void;
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
}

interface TaskbarLyricApi {
  onLayout(
    cb: (data: {
      isCentered: boolean;
      systemType: string;
      isLight: boolean;
      anchor: "left" | "right";
    }) => void,
  ): () => void;
  onConfigChange(cb: (config: TaskbarLyricSettings) => void): () => void;
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
}

interface PlayerWindowApi {
  dispatch(action: string): void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      store: {
        get<K extends keyof StoreType>(key: K): Promise<StoreType[K]>;
        set<K extends keyof StoreType>(key: K, value: StoreType[K]): Promise<boolean>;
        has(key: keyof StoreType): Promise<boolean>;
        delete(key: keyof StoreType): Promise<boolean>;
        reset(keys?: (keyof StoreType)[]): Promise<boolean>;
        export(data: unknown): Promise<{ success: boolean; path?: string; error?: string }>;
        import(): Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
      nowPlaying: NowPlayingApi;
      lyric: LyricConfigApi;
      window: WindowApi;
      desktopLyric: DesktopLyricApi;
      dynamicIsland: DynamicIslandApi;
      taskbarLyric: TaskbarLyricApi;
      player: PlayerWindowApi;
    };
    logger: {
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
      debug: (message: string, ...args: unknown[]) => void;
    };
  }
}
