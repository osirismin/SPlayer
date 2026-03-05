import type { LocationQuery } from "vue-router";
import type { SongType } from "@/types/main";
import type { AdvancedSearchQuery, AdvancedSearchMatch, AdvancedSearchMode } from "@shared";

const normalizeText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const toOptionalString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v ? v : undefined;
};

const toOptionalNumber = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const pickMode = (value: unknown): AdvancedSearchMode | undefined => {
  if (value === "auto" || value === "online" || value === "local") return value;
  return undefined;
};

const pickMatch = (value: unknown): AdvancedSearchMatch | undefined => {
  if (value === "contains" || value === "exact") return value;
  return undefined;
};

export const parseAdvancedSearchQuery = (query: LocationQuery): AdvancedSearchQuery => {
  const mode = pickMode(query.mode);
  const match = pickMatch(query.match);

  const keywords = toOptionalString(query.keywords);
  const title = toOptionalString(query.title);
  const artist = toOptionalString(query.artist);
  const album = toOptionalString(query.album);
  const minDuration = toOptionalNumber(query.minDuration);
  const maxDuration = toOptionalNumber(query.maxDuration);

  return {
    mode,
    match,
    keywords,
    title,
    artist,
    album,
    minDuration,
    maxDuration,
  };
};

export const buildAdvancedSearchRouteQuery = (q: AdvancedSearchQuery) => {
  const query: Record<string, string> = { advanced: "1" };
  if (q.mode) query.mode = q.mode;
  if (q.match) query.match = q.match;
  if (q.keywords?.trim()) query.keywords = q.keywords.trim();
  if (q.title?.trim()) query.title = q.title.trim();
  if (q.artist?.trim()) query.artist = q.artist.trim();
  if (q.album?.trim()) query.album = q.album.trim();
  if (typeof q.minDuration === "number" && Number.isFinite(q.minDuration)) {
    query.minDuration = String(q.minDuration);
  }
  if (typeof q.maxDuration === "number" && Number.isFinite(q.maxDuration)) {
    query.maxDuration = String(q.maxDuration);
  }
  return query;
};

export const formatAdvancedSearchSummary = (q: AdvancedSearchQuery) => {
  const parts: string[] = [];
  if (q.title?.trim()) parts.push(`歌名:${q.title.trim()}`);
  if (q.artist?.trim()) parts.push(`歌手:${q.artist.trim()}`);
  if (q.album?.trim()) parts.push(`专辑:${q.album.trim()}`);
  if (q.keywords?.trim()) parts.push(`关键词:${q.keywords.trim()}`);
  if (typeof q.minDuration === "number" && Number.isFinite(q.minDuration)) {
    parts.push(`时长≥${Math.round(q.minDuration / 1000)}s`);
  }
  if (typeof q.maxDuration === "number" && Number.isFinite(q.maxDuration)) {
    parts.push(`时长≤${Math.round(q.maxDuration / 1000)}s`);
  }
  return parts.length ? parts.join(" · ") : "未设置条件";
};

export const buildOnlineKeywords = (q: AdvancedSearchQuery) => {
  const parts = [q.keywords, q.title, q.artist, q.album].map((v) => v?.trim()).filter(Boolean);
  return parts.join(" ");
};

const getSongArtistText = (song: SongType) => {
  if (typeof song.artists === "string") return song.artists;
  return song.artists.map((a) => a.name).filter(Boolean).join(" / ");
};

const getSongAlbumText = (song: SongType) => {
  if (typeof song.album === "string") return song.album;
  return song.album?.name ?? "";
};

const matchText = (haystack: string, needle: string, mode: AdvancedSearchMatch) => {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return true;
  if (mode === "exact") return h === n;
  return h.includes(n);
};

export const filterSongsByAdvancedQuery = (songs: SongType[], q: AdvancedSearchQuery) => {
  const mode: AdvancedSearchMatch = q.match ?? "contains";
  const title = q.title?.trim();
  const artist = q.artist?.trim();
  const album = q.album?.trim();
  const keywords = q.keywords?.trim();
  const minDuration = typeof q.minDuration === "number" ? q.minDuration : undefined;
  const maxDuration = typeof q.maxDuration === "number" ? q.maxDuration : undefined;

  return songs.filter((song) => {
    if (title && !matchText(song.name ?? "", title, mode)) return false;
    if (artist && !matchText(getSongArtistText(song), artist, mode)) return false;
    if (album && !matchText(getSongAlbumText(song), album, mode)) return false;

    if (keywords) {
      const all = `${song.name ?? ""} ${getSongArtistText(song)} ${getSongAlbumText(song)}`;
      if (!matchText(all, keywords, "contains")) return false;
    }

    if (typeof minDuration === "number" && Number.isFinite(minDuration)) {
      if (Number(song.duration || 0) < minDuration) return false;
    }
    if (typeof maxDuration === "number" && Number.isFinite(maxDuration)) {
      if (Number(song.duration || 0) > maxDuration) return false;
    }
    return true;
  });
};

