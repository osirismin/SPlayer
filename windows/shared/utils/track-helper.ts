import type { NowPlayingTrack } from "@shared/now-playing";

/** 提取艺术家显示文本：兼容 SongType 中 artists 为字符串 / 数组两种形态 */
export const getArtistsText = (track: NowPlayingTrack | null): string => {
  if (!track) return "";
  if (typeof track.artists === "string") return track.artists;
  if (Array.isArray(track.artists)) return track.artists.map((a) => a.name).join(" / ");
  return "";
};

/** 提取专辑显示文本 */
export const getAlbumText = (track: NowPlayingTrack | null): string => {
  if (!track) return "";
  if (typeof track.album === "string") return track.album;
  if (track.album && typeof track.album.name === "string") return track.album.name;
  return "";
};
