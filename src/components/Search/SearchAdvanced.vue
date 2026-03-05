<template>
  <n-modal
    :show="show"
    preset="card"
    title="在线高级搜索"
    style="width: min(520px, calc(100vw - 24px))"
    @update:show="emit('update:show', $event)"
  >
    <n-flex vertical size="large">
      <n-select
        v-if="historyOptions.length"
        :options="historyOptions"
        placeholder="从历史快速填充"
        clearable
        @update:value="applyHistory"
      />

      <n-form :model="form" label-placement="left" label-width="72">
        <n-form-item label="匹配">
          <n-radio-group v-model:value="form.match">
            <n-radio-button value="contains">包含</n-radio-button>
            <n-radio-button value="exact">精确</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <n-form-item label="关键词">
          <n-input v-model:value="form.keywords" clearable placeholder="可选，用于整体兜底" />
        </n-form-item>
        <n-form-item label="歌名">
          <n-input v-model:value="form.title" clearable placeholder="可选" />
        </n-form-item>
        <n-form-item label="歌手">
          <n-input v-model:value="form.artist" clearable placeholder="可选" />
        </n-form-item>
        <n-form-item label="专辑">
          <n-input v-model:value="form.album" clearable placeholder="可选" />
        </n-form-item>

        <n-form-item label="时长(秒)">
          <n-flex>
            <n-input-number
              v-model:value="minSeconds"
              :min="0"
              :show-button="false"
              placeholder="最短"
              style="width: 140px"
            />
            <n-input-number
              v-model:value="maxSeconds"
              :min="0"
              :show-button="false"
              placeholder="最长"
              style="width: 140px"
            />
          </n-flex>
        </n-form-item>
      </n-form>

      <n-flex justify="end">
        <n-button strong secondary @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" strong secondary @click="submit">搜索</n-button>
      </n-flex>
    </n-flex>
  </n-modal>
</template>

<script setup lang="ts">
import type { SelectOption } from "naive-ui";
import { useDataStore } from "@/stores";
import { formatAdvancedSearchSummary } from "@/utils/advancedSearch";
import type { AdvancedSearchQuery } from "@shared";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  submit: [query: AdvancedSearchQuery];
}>();

const dataStore = useDataStore();

const form = reactive<AdvancedSearchQuery>({
  match: "contains",
  keywords: "",
  title: "",
  artist: "",
  album: "",
  minDuration: undefined,
  maxDuration: undefined,
});

const minSeconds = computed<number | null>({
  get: () => (typeof form.minDuration === "number" ? Math.round(form.minDuration / 1000) : null),
  set: (v) => {
    form.minDuration = typeof v === "number" ? v * 1000 : undefined;
  },
});

const maxSeconds = computed<number | null>({
  get: () => (typeof form.maxDuration === "number" ? Math.round(form.maxDuration / 1000) : null),
  set: (v) => {
    form.maxDuration = typeof v === "number" ? v * 1000 : undefined;
  },
});

const historyOptions = computed<SelectOption[]>(() => {
  const list = dataStore.advancedSearchHistory.filter((q) => (q.mode ?? "auto") !== "local");
  return list.map((q, index) => ({
    label: formatAdvancedSearchSummary(q),
    value: index,
  }));
});

const applyHistory = (value: number | null) => {
  if (value === null) return;
  const list = dataStore.advancedSearchHistory.filter((q) => (q.mode ?? "auto") !== "local");
  const q = list[value];
  if (!q) return;
  form.match = q.match ?? "contains";
  form.keywords = q.keywords ?? "";
  form.title = q.title ?? "";
  form.artist = q.artist ?? "";
  form.album = q.album ?? "";
  form.minDuration = q.minDuration;
  form.maxDuration = q.maxDuration;
};

const submit = () => {
  const query: AdvancedSearchQuery = {
    mode: "online",
    match: form.match ?? "contains",
    keywords: form.keywords?.trim() || undefined,
    title: form.title?.trim() || undefined,
    artist: form.artist?.trim() || undefined,
    album: form.album?.trim() || undefined,
    minDuration:
      typeof form.minDuration === "number" && Number.isFinite(form.minDuration)
        ? form.minDuration
        : undefined,
    maxDuration:
      typeof form.maxDuration === "number" && Number.isFinite(form.maxDuration)
        ? form.maxDuration
        : undefined,
  };
  emit("submit", query);
};

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    const last = dataStore.advancedSearchHistory.find((q) => (q.mode ?? "auto") !== "local");
    if (!last) return;
    form.match = last.match ?? "contains";
    form.keywords = last.keywords ?? "";
    form.title = last.title ?? "";
    form.artist = last.artist ?? "";
    form.album = last.album ?? "";
    form.minDuration = last.minDuration;
    form.maxDuration = last.maxDuration;
  },
);
</script>
