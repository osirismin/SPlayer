<template>
  <div class="search-type">
    <Transition name="fade" mode="out-in">
      <SongList
        v-if="songs.length"
        :data="songs"
        :loading="loading"
        doubleClickAction="add"
        loadMore
        disabledSort
        @reachBottom="reachBottom"
      />
      <n-empty v-else :description="emptyDescription" style="margin-top: 60px" size="large">
        <template #icon>
          <SvgIcon name="SearchOff" />
        </template>
      </n-empty>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { searchResult, SearchTypes } from "@/api/search";
import { useSettingStore } from "@/stores";
import type { SongType } from "@/types/main";
import { isElectron } from "@/utils/env";
import { formatSongsList } from "@/utils/format";
import {
  buildOnlineKeywords,
  filterSongsByAdvancedQuery,
  formatAdvancedSearchSummary,
  parseAdvancedSearchQuery,
} from "@/utils/advancedSearch";
import { ADVANCED_SEARCH_IPC_CHANNELS } from "@shared";

const route = useRoute();
const settingStore = useSettingStore();

const advancedQuery = computed(() => parseAdvancedSearchQuery(route.query));
const summary = computed(() => formatAdvancedSearchSummary(advancedQuery.value));

const effectiveMode = computed(() => {
  const mode = advancedQuery.value.mode ?? "auto";
  if (mode === "auto") return settingStore.useOnlineService ? "online" : "local";
  return mode;
});

const emptyDescription = computed(() => `很抱歉，未能找到与 ${summary.value} 相关的任何歌曲`);

const loading = ref(false);
const hasMore = ref(true);
const songs = ref<SongType[]>([]);

const localLimit = 50;

const rawOffset = ref(0);
const rawHasMore = ref(true);
const seenIds = new Set<string>();

const resetState = () => {
  loading.value = false;
  hasMore.value = true;
  songs.value = [];
  rawOffset.value = 0;
  rawHasMore.value = true;
  seenIds.clear();
};

const addSongs = (list: SongType[]) => {
  for (const s of list) {
    const key = String(s.id);
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    songs.value.push(s);
  }
};

const loadMoreLocal = async () => {
  if (!isElectron) {
    hasMore.value = false;
    return;
  }
  loading.value = true;
  try {
    const resp = (await window.electron.ipcRenderer.invoke(
      ADVANCED_SEARCH_IPC_CHANNELS.LOCAL_ADVANCED_SEARCH,
      {
        query: advancedQuery.value,
        limit: localLimit,
        offset: songs.value.length,
      },
    )) as { items: any[]; total: number; hasMore: boolean };

    const list = formatSongsList(resp.items);
    addSongs(list);
    hasMore.value = resp.hasMore;
  } finally {
    loading.value = false;
  }
};

const loadMoreOnline = async () => {
  if (!settingStore.useOnlineService) {
    hasMore.value = false;
    return;
  }
  const keywords = buildOnlineKeywords(advancedQuery.value);
  if (!keywords.trim()) {
    hasMore.value = false;
    return;
  }

  loading.value = true;
  try {
    const rawLimit = 100;
    const targetAdd = 50;
    const startLen = songs.value.length;

    while (songs.value.length - startLen < targetAdd && rawHasMore.value) {
      const result = await searchResult(keywords, rawLimit, rawOffset.value, SearchTypes.Single);
      const rawSongs = formatSongsList(result.result?.songs || []);
      const filtered = filterSongsByAdvancedQuery(rawSongs, advancedQuery.value);
      addSongs(filtered);

      const songCount = Number(result.result?.songCount ?? 0);
      rawHasMore.value = !!result.result?.hasMore || songCount > rawOffset.value + rawLimit;
      rawOffset.value += rawLimit;

      if (!rawSongs.length) {
        rawHasMore.value = false;
      }
    }

    hasMore.value = rawHasMore.value;
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (loading.value || !hasMore.value) return;
  if (effectiveMode.value === "local") {
    await loadMoreLocal();
    return;
  }
  await loadMoreOnline();
};

const reachBottom = () => {
  loadMore();
};

watch(
  () => route.fullPath,
  () => {
    resetState();
    loadMore();
  },
  { immediate: true },
);
</script>
