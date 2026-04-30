import { usePlayerController } from "@/core/player/PlayerController";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { SettingType } from "@/types/main";
import { handleProtocolUrl } from "@/utils/protocol";
import { cloneDeep } from "lodash-es";
import { toRaw } from "vue";
import { toLikeSong } from "./auth";
import { isElectron, isMac } from "./env";
import { getPlayerInfoObj } from "./format";
import { openSetting, openUpdateApp } from "./modal";

// 关闭更新状态
const closeUpdateStatus = () => {
  const statusStore = useStatusStore();
  statusStore.updateCheck = false;
};

// 全局 IPC 事件
const initIpc = () => {
  try {
    if (!isElectron) return;
    const player = usePlayerController();
    const statusStore = useStatusStore();

    // 播放
    window.electron.ipcRenderer.on("play", () => player.play());
    // 暂停
    window.electron.ipcRenderer.on("pause", () => player.pause());
    // 播放或暂停
    window.electron.ipcRenderer.on("playOrPause", () => player.playOrPause());
    // 上一曲
    window.electron.ipcRenderer.on("playPrev", () => player.nextOrPrev("prev"));
    // 下一曲
    window.electron.ipcRenderer.on("playNext", () => player.nextOrPrev("next"));
    // 音量加
    window.electron.ipcRenderer.on("volumeUp", () => player.setVolume("up"));
    // 音量减
    window.electron.ipcRenderer.on("volumeDown", () => player.setVolume("down"));
    // 快进 / 快退
    window.electron.ipcRenderer.on("seekForward", () => player.seekBy(5000));
    window.electron.ipcRenderer.on("seekBackward", () => player.seekBy(-5000));
    // 播放模式切换
    window.electron.ipcRenderer.on("changeRepeat", (_, mode) => player.toggleRepeat(mode));
    window.electron.ipcRenderer.on("toggleShuffle", (_, mode) => player.toggleShuffle(mode));
    // 喜欢歌曲
    window.electron.ipcRenderer.on("toggle-like-song", async () => {
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      await toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id));
    });
    // 开启设置
    window.electron.ipcRenderer.on("openSetting", (_, type: SettingType, scrollTo?: string) =>
      openSetting(type, scrollTo),
    );
    // mac 状态栏歌词开关（仅 mac 托盘菜单使用此通道）
    window.electron.ipcRenderer.on("toggle-taskbar-lyric", async () => {
      if (!isMac) return;
      const currentMacLyricEnabled = await window.electron.ipcRenderer.invoke(
        "store-get",
        "macos.statusBarLyric.enabled",
      );
      const newState = !currentMacLyricEnabled;
      window.electron.ipcRenderer.send("macos-lyric:toggle", newState);
      window.$message.success(`${newState ? "已开启" : "已关闭"}状态栏歌词`);
    });

    // 监听主进程发来的 macOS 状态栏歌词启用状态更新
    window.electron.ipcRenderer.on(
      "setting:update-macos-lyric-enabled",
      (_event, enabled: boolean) => {
        const settingStore = useSettingStore();
        settingStore.macos.statusBarLyric.enabled = enabled;
      },
    );

    // 旧的桌面/任务栏歌词请求处理已移除，三种歌词窗口通过 NowPlayingService 总线自动同步
    // 无更新
    window.electron.ipcRenderer.on("update-not-available", () => {
      closeUpdateStatus();
      statusStore.updateAvailable = false;
      statusStore.updateInfo = null;
      window.$message.success("当前已是最新版本");
    });
    // 有更新
    window.electron.ipcRenderer.on("update-available", (_, info) => {
      closeUpdateStatus();
      statusStore.updateAvailable = true;
      statusStore.updateInfo = info;
      statusStore.updateDownloaded = false;
      statusStore.updateDownloading = false;
      statusStore.updateDownloadProgress = 0;
      // 弹窗提示
      openUpdateApp(info);
    });
    // 更新下载进度
    window.electron.ipcRenderer.on("download-progress", (_, progress) => {
      statusStore.updateDownloading = true;
      statusStore.updateDownloadProgress = Number((progress?.percent || 0).toFixed(1));
    });
    // 更新下载完成
    window.electron.ipcRenderer.on("update-downloaded", () => {
      statusStore.updateDownloading = false;
      statusStore.updateDownloaded = true;
      statusStore.updateDownloadProgress = 100;
    });
    // 更新错误
    window.electron.ipcRenderer.on("update-error", (_, error) => {
      console.error("Error updating:", error);
      closeUpdateStatus();
      statusStore.updateDownloading = false;
      window.$message.error("更新过程出现错误");
    });
    // 协议数据
    window.electron.ipcRenderer.on("protocol-url", (_, url) => {
      console.log("📡 Received protocol url:", url);
      handleProtocolUrl(url);
    });
    // 请求播放信息
    window.electron.ipcRenderer.on("request-track-info", () => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      const { name, artist, album } = getPlayerInfoObj() || {};
      // 获取原始对象
      const playSong = toRaw(musicStore.playSong);
      const songLyric = statusStore.lyricLoading
        ? { lrcData: [], yrcData: [] }
        : toRaw(musicStore.songLyric);
      window.electron.ipcRenderer.send(
        "return-track-info",
        cloneDeep({
          playStatus: statusStore.playStatus,
          playName: name,
          artistName: artist,
          albumName: album,
          currentTime: statusStore.currentTime,
          // 音量及播放速率
          volume: statusStore.playVolume,
          playRate: statusStore.playRate,
          ...playSong,
          // 歌词及加载状态
          lyricLoading: statusStore.lyricLoading,
          lyricIndex: statusStore.lyricIndex,
          ...songLyric,
        }),
      );
    });
  } catch (error) {
    console.log(error);
  }
};

export default initIpc;
