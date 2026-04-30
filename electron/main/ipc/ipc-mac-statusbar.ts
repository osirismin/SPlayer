import type { LyricLine } from "@shared/lyrics";
import type { NowPlayingPositionSync, NowPlayingSnapshot } from "@shared/now-playing";
import { ipcMain } from "electron";
import { useStore } from "../store";
import { getMainTray } from "../tray";
import * as nowPlaying from "../services/now-playing";
import { getCurrentSongTitle } from "./ipc-tray";

let macLyricLines: LyricLine[] = [];
let macAnchorPosition = 0;
let macAnchorTimestamp = 0;
let macIsPlaying = false;
let macLastLyricIndex = -1;
let interpolationTimer: NodeJS.Timeout | null = null;

const LYRIC_UPDATE_INTERVAL = 50; // ms
const SYNC_DRIFT_THRESHOLD_MS = 300; // ms

const stopInterpolation = (): void => {
  if (interpolationTimer) {
    clearInterval(interpolationTimer);
    interpolationTimer = null;
  }
};

const startInterpolation = (): void => {
  stopInterpolation();
  interpolationTimer = setInterval(updateTitle, LYRIC_UPDATE_INTERVAL);
};

/** 计算当前播放位置（基于锚点 + 经过时间） */
const getCurrentPositionMs = (): number => {
  if (!macIsPlaying) return macAnchorPosition;
  return macAnchorPosition + (Date.now() - macAnchorTimestamp);
};

/** 选最新已开始的歌词行 */
const findCurrentLyricIndex = (currentMs: number, lines: LyricLine[]): number => {
  if (lines.length === 0) return -1;
  // 提前 300ms 切换让视觉感更舒服
  const targetTime = currentMs + 300;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startTime <= targetTime) return i;
  }
  return -1;
};

const updateTitle = (forceUpdate = false): void => {
  const tray = getMainTray();
  if (!tray) return;

  const enabled = useStore().get("macos.statusBarLyric.enabled") ?? false;
  if (!enabled) {
    tray.setTitle(getCurrentSongTitle());
    return;
  }

  if (macLyricLines.length === 0) {
    tray.setTitle(getCurrentSongTitle());
    return;
  }

  const currentMs = getCurrentPositionMs();
  const idx = findCurrentLyricIndex(currentMs, macLyricLines);
  if (!forceUpdate && idx === macLastLyricIndex) return;
  macLastLyricIndex = idx;

  const text =
    idx >= 0
      ? macLyricLines[idx].words
          .map((w) => w.word ?? "")
          .join("")
          .trim()
      : getCurrentSongTitle();
  tray.setTitle(text);
};

const onLyricChange = (snap: NowPlayingSnapshot): void => {
  macLyricLines = snap.lyric.filter((line) => !line.isBG);
  macAnchorPosition = snap.position;
  macAnchorTimestamp = Date.now() - Math.max(0, Date.now() - snap.sendTimestamp);
  macIsPlaying = snap.playing;
  macLastLyricIndex = -1;
  updateTitle(true);
  if (macIsPlaying) startInterpolation();
  else stopInterpolation();
};

const onPositionSync = (data: NowPlayingPositionSync): void => {
  // 偏差超过阈值时重置锚点；播放状态变化时立即对齐
  const ipcDelay = Math.max(0, Date.now() - data.sendTimestamp);
  const candidate = data.position + (data.playing ? ipcDelay : 0);
  const projected = macIsPlaying
    ? macAnchorPosition + (Date.now() - macAnchorTimestamp)
    : macAnchorPosition;
  const playingChanged = macIsPlaying !== data.playing;
  if (playingChanged || Math.abs(candidate - projected) > SYNC_DRIFT_THRESHOLD_MS) {
    macAnchorPosition = candidate;
    macAnchorTimestamp = Date.now();
  }
  macIsPlaying = data.playing;
  if (macIsPlaying) startInterpolation();
  else {
    stopInterpolation();
    updateTitle(true);
  }
};

export const initMacStatusBarIpc = (): void => {
  const store = useStore();

  // 初始化：根据当前设置决定是否显示
  const enabled = store.get("macos.statusBarLyric.enabled") ?? false;
  const tray = getMainTray();
  if (!enabled) {
    tray?.setTitle(getCurrentSongTitle());
  }

  // 订阅 NowPlayingService（必须在 ipc-now-playing 注册之后调用）
  nowPlaying.onLyricChange(onLyricChange);
  nowPlaying.onPositionSync(onPositionSync);

  // 渲染端切换 macOS 状态栏歌词开关
  ipcMain.on("macos-lyric:toggle", (_event, show: boolean) => {
    store.set("macos.statusBarLyric.enabled", show);
    const t = getMainTray();
    t?.initTrayMenu();
    if (!show) {
      t?.setTitle(getCurrentSongTitle());
      stopInterpolation();
    } else {
      // 启用时立即用当前快照刷新
      onLyricChange(nowPlaying.snapshot());
    }
  });
};
