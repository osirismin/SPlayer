import type { AudioSourceResult, PluginSongData } from "@/types/plugin";
import type { SongType } from "@/types/main";
import { isElectron } from "@/utils/env";

/** 通过插件链解析音频源 */
export const resolveAudioSourceByPlugin = async (
  song: SongType,
): Promise<AudioSourceResult | null> => {
  if (!isElectron) return null;
  try {
    const songData: PluginSongData = {
      id: song.id,
      name: song.name,
      artists: song.artists,
      album: song.album,
      type: song.type,
    };
    return await window.electron.ipcRenderer.invoke("plugin:resolve-audio-source", songData);
  } catch (e) {
    console.warn("⚠️ 插件音频源解析失败:", e);
    return null;
  }
};
