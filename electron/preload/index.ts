import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);

    // -------- store API（兼容现有代码）--------
    contextBridge.exposeInMainWorld("api", {
      store: {
        get: (key: string) => ipcRenderer.invoke("store-get", key),
        set: (key: string, value: unknown) => ipcRenderer.invoke("store-set", key, value),
        has: (key: string) => ipcRenderer.invoke("store-has", key),
        delete: (key: string) => ipcRenderer.invoke("store-delete", key),
        reset: (keys?: string[]) => ipcRenderer.invoke("store-reset", keys),
        export: (data: unknown) => ipcRenderer.invoke("store-export", data),
        import: () => ipcRenderer.invoke("store-import"),
      },

      // -------- 播放状态总线（NowPlaying）--------
      nowPlaying: {
        update: (payload: unknown) => ipcRenderer.send("nowPlaying:update", payload),
        sendPosition: (position: number, playing: boolean) =>
          ipcRenderer.send("nowPlaying:position", { position, playing }),
        sendPlayState: (playing: boolean) => ipcRenderer.send("nowPlaying:playState", playing),
        requestSnapshot: () => ipcRenderer.invoke("nowPlaying:requestSnapshot"),
        onTrackChange: (callback: (data: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("nowPlaying:track-change", handler);
          return () => ipcRenderer.off("nowPlaying:track-change", handler);
        },
        onLyricChange: (callback: (snap: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("nowPlaying:lyric-change", handler);
          return () => ipcRenderer.off("nowPlaying:lyric-change", handler);
        },
        onPositionSync: (callback: (data: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("nowPlaying:position-sync", handler);
          return () => ipcRenderer.off("nowPlaying:position-sync", handler);
        },
      },

      // -------- 歌词窗口配置 --------
      lyric: {
        getConfig: (mode: string) => ipcRenderer.invoke("lyric:getConfig", mode),
        setConfig: (mode: string, partial: unknown) =>
          ipcRenderer.invoke("lyric:setConfig", mode, partial),
      },

      // -------- 窗口控制 --------
      window: {
        focusMain: () => ipcRenderer.send("window:focusMain"),
        toggleDesktopLyric: () => ipcRenderer.invoke("window:toggleDesktopLyric"),
        closeDesktopLyric: () => ipcRenderer.invoke("window:closeDesktopLyric"),
        isDesktopLyricOpen: () => ipcRenderer.invoke("window:isDesktopLyricOpen"),
        toggleDynamicIsland: () => ipcRenderer.invoke("window:toggleDynamicIsland"),
        closeDynamicIsland: () => ipcRenderer.invoke("window:closeDynamicIsland"),
        isDynamicIslandOpen: () => ipcRenderer.invoke("window:isDynamicIslandOpen"),
        toggleTaskbarLyric: () => ipcRenderer.invoke("window:toggleTaskbarLyric"),
        closeTaskbarLyric: () => ipcRenderer.invoke("window:closeTaskbarLyric"),
        isTaskbarLyricOpen: () => ipcRenderer.invoke("window:isTaskbarLyricOpen"),
      },

      // -------- 桌面歌词专用（窗口端使用）--------
      desktopLyric: {
        setHeight: (height: number) => ipcRenderer.invoke("desktopLyric:setHeight", height),
        setMouseIgnore: (ignore: boolean) =>
          ipcRenderer.send("desktopLyric:setMouseIgnore", ignore),
        move: (x: number, y: number) => ipcRenderer.send("desktopLyric:move", x, y),
        saveState: () => ipcRenderer.send("desktopLyric:saveState"),
        onConfigChange: (callback: (config: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("desktopLyric:configChange", handler);
          return () => ipcRenderer.off("desktopLyric:configChange", handler);
        },
        onCursorInside: (callback: (inside: boolean) => void) => {
          const handler = (_e: unknown, data: boolean) => callback(data);
          ipcRenderer.on("desktopLyric:cursorInside", handler);
          return () => ipcRenderer.off("desktopLyric:cursorInside", handler);
        },
        onVisibilityChange: (callback: (visible: boolean) => void) => {
          const handler = (_e: unknown, data: boolean) => callback(data);
          ipcRenderer.on("desktopLyric:visibilityChange", handler);
          return () => ipcRenderer.off("desktopLyric:visibilityChange", handler);
        },
      },

      // -------- 灵动岛专用 --------
      dynamicIsland: {
        move: (x: number, y: number) => ipcRenderer.send("dynamicIsland:move", x, y),
        saveState: () => ipcRenderer.send("dynamicIsland:saveState"),
        resize: (width: number) => ipcRenderer.send("dynamicIsland:resize", width),
        setHeight: (height: number) => ipcRenderer.send("dynamicIsland:setHeight", height),
        getMode: () => ipcRenderer.invoke("dynamicIsland:getMode"),
        onConfigChange: (callback: (config: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("dynamicIsland:configChange", handler);
          return () => ipcRenderer.off("dynamicIsland:configChange", handler);
        },
        onModeChange: (callback: (mode: "snapped" | "floating") => void) => {
          const handler = (_e: unknown, data: "snapped" | "floating") => callback(data);
          ipcRenderer.on("dynamicIsland:modeChange", handler);
          return () => ipcRenderer.off("dynamicIsland:modeChange", handler);
        },
        onCursorInside: (callback: (inside: boolean) => void) => {
          const handler = (_e: unknown, data: boolean) => callback(data);
          ipcRenderer.on("dynamicIsland:cursorInside", handler);
          return () => ipcRenderer.off("dynamicIsland:cursorInside", handler);
        },
        onVisibilityChange: (callback: (visible: boolean) => void) => {
          const handler = (_e: unknown, data: boolean) => callback(data);
          ipcRenderer.on("dynamicIsland:visibilityChange", handler);
          return () => ipcRenderer.off("dynamicIsland:visibilityChange", handler);
        },
      },

      // -------- 任务栏歌词专用 --------
      taskbarLyric: {
        onLayout: (
          callback: (data: {
            isCentered: boolean;
            systemType: string;
            isLight: boolean;
            anchor: "left" | "right";
          }) => void,
        ) => {
          const handler = (
            _e: unknown,
            data: {
              isCentered: boolean;
              systemType: string;
              isLight: boolean;
              anchor: "left" | "right";
            },
          ) => callback(data);
          ipcRenderer.on("taskbarLyric:layout", handler);
          return () => ipcRenderer.off("taskbarLyric:layout", handler);
        },
        onConfigChange: (callback: (config: unknown) => void) => {
          const handler = (_e: unknown, data: unknown) => callback(data);
          ipcRenderer.on("taskbarLyric:configChange", handler);
          return () => ipcRenderer.off("taskbarLyric:configChange", handler);
        },
        onVisibilityChange: (callback: (visible: boolean) => void) => {
          const handler = (_e: unknown, data: boolean) => callback(data);
          ipcRenderer.on("taskbarLyric:visibilityChange", handler);
          return () => ipcRenderer.off("taskbarLyric:visibilityChange", handler);
        },
      },

      // -------- 播放器调度（窗口端 → 主窗口 relay）--------
      player: {
        dispatch: (action: string) => ipcRenderer.send("player:dispatch", action),
      },
    });

    // -------- logger --------
    contextBridge.exposeInMainWorld("logger", {
      info: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "info", message, args),
      warn: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "warn", message, args),
      error: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "error", message, args),
      debug: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "debug", message, args),
    });
  } catch (error) {
    console.error(error);
  }
}
