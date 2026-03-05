<template>
  <n-modal
    :show="show"
    preset="card"
    title="本地高级搜索"
    style="width: min(560px, calc(100vw - 24px))"
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

      <n-form :model="form" label-placement="left" label-width="84">
        <n-form-item label="匹配">
          <n-radio-group v-model:value="form.match">
            <n-radio-button value="contains">包含</n-radio-button>
            <n-radio-button value="exact">精确</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <n-form-item label="文件夹">
          <n-select
            v-model:value="inPathValue"
            :options="folderOptions"
            placeholder="全部文件夹"
            clearable
          />
        </n-form-item>

        <n-form-item label="路径包含">
          <n-input v-model:value="form.path" clearable placeholder="可选，用于匹配文件路径" />
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

        <n-form-item label="码率(kbps)">
          <n-flex>
            <n-input-number
              v-model:value="minKbps"
              :min="0"
              :show-button="false"
              placeholder="最低"
              style="width: 140px"
            />
            <n-input-number
              v-model:value="maxKbps"
              :min="0"
              :show-button="false"
              placeholder="最高"
              style="width: 140px"
            />
          </n-flex>
        </n-form-item>

        <n-form-item label="大小(MB)">
          <n-flex>
            <n-input-number
              v-model:value="minMB"
              :min="0"
              :show-button="false"
              placeholder="最小"
              style="width: 140px"
            />
            <n-input-number
              v-model:value="maxMB"
              :min="0"
              :show-button="false"
              placeholder="最大"
              style="width: 140px"
            />
          </n-flex>
        </n-form-item>

        <n-form-item label="曲序">
          <n-flex>
            <n-input-number
              v-model:value="minTrackNumber"
              :min="0"
              :show-button="false"
              placeholder="最小"
              style="width: 140px"
            />
            <n-input-number
              v-model:value="maxTrackNumber"
              :min="0"
              :show-button="false"
              placeholder="最大"
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
import { useDataStore, useSettingStore } from "@/stores";
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
const settingStore = useSettingStore();

const form = reactive<AdvancedSearchQuery>({
  match: "contains",
  keywords: "",
  title: "",
  artist: "",
  album: "",
  minDuration: undefined,
  maxDuration: undefined,
  inPath: undefined,
  path: "",
  minBitrate: undefined,
  maxBitrate: undefined,
  minSize: undefined,
  maxSize: undefined,
  minTrackNumber: undefined,
  maxTrackNumber: undefined,
});

const inPathValue = computed<string | null>({
  get: () => form.inPath ?? null,
  set: (v) => {
    form.inPath = typeof v === "string" && v.trim() ? v : undefined;
  },
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

const minKbps = computed<number | null>({
  get: () => (typeof form.minBitrate === "number" ? Math.round(form.minBitrate / 1000) : null),
  set: (v) => {
    form.minBitrate = typeof v === "number" ? v * 1000 : undefined;
  },
});

const maxKbps = computed<number | null>({
  get: () => (typeof form.maxBitrate === "number" ? Math.round(form.maxBitrate / 1000) : null),
  set: (v) => {
    form.maxBitrate = typeof v === "number" ? v * 1000 : undefined;
  },
});

const minMB = computed<number | null>({
  get: () => (typeof form.minSize === "number" ? Math.round(form.minSize / 1024 / 1024) : null),
  set: (v) => {
    form.minSize = typeof v === "number" ? v * 1024 * 1024 : undefined;
  },
});

const maxMB = computed<number | null>({
  get: () => (typeof form.maxSize === "number" ? Math.round(form.maxSize / 1024 / 1024) : null),
  set: (v) => {
    form.maxSize = typeof v === "number" ? v * 1024 * 1024 : undefined;
  },
});

const minTrackNumber = computed<number | null>({
  get: () => (typeof form.minTrackNumber === "number" ? form.minTrackNumber : null),
  set: (v) => {
    form.minTrackNumber = typeof v === "number" ? v : undefined;
  },
});

const maxTrackNumber = computed<number | null>({
  get: () => (typeof form.maxTrackNumber === "number" ? form.maxTrackNumber : null),
  set: (v) => {
    form.maxTrackNumber = typeof v === "number" ? v : undefined;
  },
});

const folderOptions = computed<SelectOption[]>(() => {
  const base: SelectOption[] = [{ label: "全部文件夹", value: null }];
  const options = settingStore.localFilesPath
    .filter((p) => typeof p === "string" && !!p.trim())
    .map((p) => {
      const isWindows = p.includes("\\");
      const sep = isWindows ? "\\" : "/";
      const folderName = p.split(sep).filter(Boolean).pop() || p;
      return { label: folderName, value: p };
    });
  return base.concat(options);
});

const historyOptions = computed<SelectOption[]>(() => {
  const list = dataStore.advancedSearchHistory.filter((q) => q.mode === "local");
  return list.map((q, index) => ({
    label: formatAdvancedSearchSummary(q),
    value: index,
  }));
});

const applyQueryToForm = (q: AdvancedSearchQuery) => {
  form.match = q.match ?? "contains";
  form.keywords = q.keywords ?? "";
  form.title = q.title ?? "";
  form.artist = q.artist ?? "";
  form.album = q.album ?? "";
  form.minDuration = q.minDuration;
  form.maxDuration = q.maxDuration;
  form.inPath = q.inPath;
  form.path = q.path ?? "";
  form.minBitrate = q.minBitrate;
  form.maxBitrate = q.maxBitrate;
  form.minSize = q.minSize;
  form.maxSize = q.maxSize;
  form.minTrackNumber = q.minTrackNumber;
  form.maxTrackNumber = q.maxTrackNumber;
};

const applyHistory = (value: number | null) => {
  if (value === null) return;
  const list = dataStore.advancedSearchHistory.filter((q) => q.mode === "local");
  const q = list[value];
  if (!q) return;
  applyQueryToForm(q);
};

const submit = () => {
  const query: AdvancedSearchQuery = {
    mode: "local",
    match: form.match ?? "contains",
    inPath: form.inPath?.trim() || undefined,
    path: form.path?.trim() || undefined,
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
    minBitrate:
      typeof form.minBitrate === "number" && Number.isFinite(form.minBitrate)
        ? form.minBitrate
        : undefined,
    maxBitrate:
      typeof form.maxBitrate === "number" && Number.isFinite(form.maxBitrate)
        ? form.maxBitrate
        : undefined,
    minSize:
      typeof form.minSize === "number" && Number.isFinite(form.minSize) ? form.minSize : undefined,
    maxSize:
      typeof form.maxSize === "number" && Number.isFinite(form.maxSize) ? form.maxSize : undefined,
    minTrackNumber:
      typeof form.minTrackNumber === "number" && Number.isFinite(form.minTrackNumber)
        ? form.minTrackNumber
        : undefined,
    maxTrackNumber:
      typeof form.maxTrackNumber === "number" && Number.isFinite(form.maxTrackNumber)
        ? form.maxTrackNumber
        : undefined,
  };
  emit("submit", query);
};

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    const last = dataStore.advancedSearchHistory.find((q) => q.mode === "local");
    if (!last) return;
    applyQueryToForm(last);
  },
);
</script>
