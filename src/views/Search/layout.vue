<template>
  <div class="search">
    <div class="title">
      <n-text class="keyword">{{ titleText }}</n-text>
      <n-text v-if="!isAdvanced" depth="3">的相关搜索</n-text>
      <n-text v-else depth="3">{{ advancedSummary }}</n-text>
    </div>
    <!-- 标签页 -->
    <n-tabs
      v-if="!isAdvanced"
      v-model:value="searchType"
      class="tabs"
      type="segment"
      @update:value="tabChange"
    >
      <n-tab name="search-songs"> 单曲 </n-tab>
      <n-tab name="search-playlists"> 歌单 </n-tab>
      <n-tab name="search-artists"> 歌手 </n-tab>
      <n-tab name="search-albums"> 专辑 </n-tab>
      <n-tab name="search-videos"> 视频 </n-tab>
      <n-tab name="search-radios"> 播客 </n-tab>
    </n-tabs>
    <!-- 路由 -->
    <RouterView v-slot="{ Component }">
      <Transition :name="`router-${settingStore.routeAnimation}`" mode="out-in">
        <KeepAlive v-if="settingStore.useKeepAlive">
          <component
            :is="Component"
            :key="route.fullPath"
            v-bind="componentProps"
            class="router-view"
          />
        </KeepAlive>
        <component
          v-else
          :is="Component"
          :key="route.fullPath"
          v-bind="componentProps"
          class="router-view"
        />
      </Transition>
    </RouterView>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { formatAdvancedSearchSummary, parseAdvancedSearchQuery } from "@/utils/advancedSearch";
const route = useRoute();
const router = useRouter();
const settingStore = useSettingStore();

// 搜索关键词
const searchKeyword = computed(() => String(route.query.keyword ?? ""));
const isAdvanced = computed(() => route.query.advanced === "1" || route.query.advanced === "true");
const advancedQuery = computed(() => parseAdvancedSearchQuery(route.query));
const advancedSummary = computed(() => formatAdvancedSearchSummary(advancedQuery.value));
const titleText = computed(() => (isAdvanced.value ? "高级搜索" : searchKeyword.value));
const componentProps = computed(() => (isAdvanced.value ? {} : { keyword: searchKeyword.value }));

// 搜索分类
const searchType = ref<string>("search-songs");

// Tabs 改变
const tabChange = (value: string) => {
  router.push({
    name: value,
    query: { ...route.query, keyword: searchKeyword.value },
  });
};

// 监听路由变化，同步 Tab 状态
watch(
  () => route.name,
  (name) => {
    if (name && name.toString().startsWith("search-")) {
      searchType.value = name as string;
    }
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.search {
  display: flex;
  flex-direction: column;
  height: 100%;
  .title {
    margin-top: 12px;
    margin-bottom: 12px;
    font-size: 22px;
    .keyword {
      font-size: 36px;
      font-weight: bold;
      margin-right: 8px;
      line-height: normal;
    }
    .n-text {
      display: inline-block;
    }
  }
  .router-view {
    flex: 1;
    overflow: hidden;
  }
}
</style>
