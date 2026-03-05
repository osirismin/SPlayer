export type AdvancedSearchMode = "auto" | "online" | "local";

export type AdvancedSearchMatch = "contains" | "exact";

export interface AdvancedSearchQuery {
  mode?: AdvancedSearchMode;
  match?: AdvancedSearchMatch;
  keywords?: string;
  title?: string;
  artist?: string;
  album?: string;
  minDuration?: number;
  maxDuration?: number;
}

export const ADVANCED_SEARCH_IPC_CHANNELS = {
  LOCAL_ADVANCED_SEARCH: "local-music:advanced-search",
} as const;

