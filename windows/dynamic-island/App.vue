<script setup lang="ts">
import type { DynamicIslandSettings } from "@shared/lyric-window";
import { DEFAULT_DYNAMIC_ISLAND, DYNAMIC_ISLAND_BASE_HEIGHT } from "@shared/lyric-window";
import type { LyricLine } from "@shared/lyrics";
import IslandLyricLine from "./components/IslandLyricLine.vue";
import { pickLatestStartedIndex } from "@windows/shared/utils/lyric-sync";
import { useNowPlayingSync } from "@windows/shared/composables/useNowPlayingSync";
import { useDragWindow } from "./composables/useDragWindow";
import { getArtistsText } from "@windows/shared/utils/track-helper";

const DEFAULT_COVER = "/images/song.jpg";

const config = reactive<DynamicIslandSettings>({ ...DEFAULT_DYNAMIC_ISLAND });

const hovering = ref(false);

const mainRowHeight = computed(() => Math.round(DYNAMIC_ISLAND_BASE_HEIGHT * config.scale));
const padX = computed(() => Math.round(mainRowHeight.value * 0.4));
const gap = computed(() => Math.round(mainRowHeight.value * 0.25));
const coverSize = computed(() => Math.round(mainRowHeight.value * 0.65));
const coverRadius = computed(() => Math.max(4, Math.round(coverSize.value * 0.3)));
const fontSize = computed(() => Math.max(13, Math.round(mainRowHeight.value * 0.5)));
const snapRadius = computed(() => Math.round(mainRowHeight.value * 0.6));
const subFontSize = computed(() => Math.max(11, Math.round(fontSize.value * 0.65)));
const subRowHeight = computed(() => Math.round(subFontSize.value * 1.2));

const { track, lyric, primaryIndex } = useNowPlayingSync({
  pickIndex: pickLatestStartedIndex,
  logTag: "dynamic-island",
});
const { onRootPointerDown } = useDragWindow();

const mode = ref<"snapped" | "floating">("snapped");

const resolvedFontFamily = computed<string>(() => {
  const ff = config.fontFamily?.trim();
  if (!ff || ff === "system-ui") return "system-ui, sans-serif";
  return `${ff}, system-ui, sans-serif`;
});

const measureCtx = document.createElement("canvas").getContext("2d")!;
const measureTextWidth = (text: string, sizePx: number = fontSize.value): number => {
  measureCtx.font = `${config.fontWeight} ${sizePx}px ${resolvedFontFamily.value}`;
  return Math.ceil(measureCtx.measureText(text).width);
};

const artistsText = computed<string>(() => getArtistsText(track.value));

const currentLine = computed<LyricLine | null>(() => {
  const idx = primaryIndex.value;
  if (idx < 0) return null;
  return lyric.value[idx] ?? null;
});

const fallbackText = computed<string>(() => {
  const t = track.value;
  if (!t) return "SPlayer";
  return artistsText.value ? `${t.name} - ${artistsText.value}` : t.name;
});

const displayLine = shallowRef<LyricLine | null>(null);
const displayFallback = ref("SPlayer");
const displayIndex = ref(-1);
const displaySubText = ref("");

const showSubLine = computed(() => config.doubleLine || displaySubText.value !== "");
const windowHeight = computed(
  () => mainRowHeight.value + (showSubLine.value ? subRowHeight.value : 0),
);

const BOUNCE_OVERSHOOT = 0.15;

const lyricWidth = ref(measureTextWidth(displayFallback.value));
const lyricOpacity = ref(1);

const shrinking = ref(false);
let phase: "idle" | "shrinking" | "expanding" = "idle";

let hasPainted = false;

const lineText = (line: LyricLine): string => line.words.map((w) => w.word).join("");

const computeSubText = (idx: number, line: LyricLine | null): string => {
  if (config.showTranslation && line?.translatedLyric) return line.translatedLyric;
  if (!config.doubleLine || idx < 0) return "";
  const next = lyric.value[idx + 1];
  return next ? lineText(next) : "";
};

const measureTarget = (): number => {
  const line = currentLine.value;
  const mainText = line ? lineText(line) : fallbackText.value;
  const mainPx = Math.max(1, measureTextWidth(mainText));
  const subText = computeSubText(primaryIndex.value, line);
  const subPx = subText ? measureTextWidth(subText, subFontSize.value) : 0;
  return Math.max(mainPx, subPx);
};

const computeWindowWidth = (lyricPx: number): number => {
  const bounceExtra = Math.ceil(lyricPx * BOUNCE_OVERSHOOT);
  return padX.value * 2 + coverSize.value + gap.value + lyricPx + bounceExtra;
};

const resizeWindow = (lyricPx: number): void => {
  window.api.dynamicIsland.resize(computeWindowWidth(lyricPx));
};

const applyImmediate = (): void => {
  displayLine.value = currentLine.value;
  displayFallback.value = fallbackText.value;
  displayIndex.value = primaryIndex.value;
  displaySubText.value = computeSubText(primaryIndex.value, currentLine.value);
  const targetPx = measureTarget();
  shrinking.value = false;
  lyricOpacity.value = 1;
  lyricWidth.value = targetPx;
  resizeWindow(targetPx);
  phase = "expanding";
};

const startSwapAnimation = (): void => {
  phase = "shrinking";
  shrinking.value = true;
  lyricWidth.value = 0;
  lyricOpacity.value = 0;
};

const onLyricTransitionEnd = (event: TransitionEvent): void => {
  if (event.propertyName !== "width") return;
  if (phase === "shrinking") {
    displayLine.value = currentLine.value;
    displayFallback.value = fallbackText.value;
    displayIndex.value = primaryIndex.value;
    displaySubText.value = computeSubText(primaryIndex.value, currentLine.value);
    const targetPx = measureTarget();
    resizeWindow(targetPx);
    requestAnimationFrame(() => {
      if (phase !== "shrinking") return;
      shrinking.value = false;
      requestAnimationFrame(() => {
        if (phase !== "shrinking") return;
        phase = "expanding";
        lyricOpacity.value = 1;
        lyricWidth.value = targetPx;
      });
    });
  } else if (phase === "expanding") {
    phase = "idle";
  }
};

watch([() => config.doubleLine, () => config.showTranslation], () => {
  displaySubText.value = computeSubText(displayIndex.value, displayLine.value);
  if (phase !== "idle") return;
  const targetPx = measureTarget();
  lyricWidth.value = targetPx;
  resizeWindow(targetPx);
});

watch([() => config.scale, () => config.fontWeight, () => config.fontFamily], () => {
  if (phase !== "idle") return;
  const targetPx = measureTarget();
  lyricWidth.value = targetPx;
  resizeWindow(targetPx);
});

watch([currentLine, fallbackText], () => {
  const newLine = currentLine.value;
  const changed = newLine
    ? displayIndex.value !== primaryIndex.value
    : displayFallback.value !== fallbackText.value;
  if (!changed) return;
  if (phase === "shrinking") return;
  if (!hasPainted || lyricWidth.value === 0) {
    applyImmediate();
    return;
  }
  startSwapAnimation();
});

const rootStyle = computed(() => ({
  "--di-played": config.playedColor,
  "--di-unplayed": config.unplayedColor,
  "--di-bg": config.backgroundColor,
  "--di-padx": `${padX.value}px`,
  "--di-gap": `${gap.value}px`,
  "--di-cover": `${coverSize.value}px`,
  "--di-cover-radius": `${coverRadius.value}px`,
  "--di-snap-radius": `${snapRadius.value}px`,
  fontFamily: resolvedFontFamily.value,
}));

let unsubConfig: (() => void) | null = null;
let unsubMode: (() => void) | null = null;
let unsubCursor: (() => void) | null = null;

watch(
  windowHeight,
  (h) => {
    window.api.dynamicIsland.setHeight(h);
  },
  { flush: "post" },
);

onMounted(async () => {
  resizeWindow(lyricWidth.value);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hasPainted = true;
    });
  });
  try {
    const [saved, currentMode] = await Promise.all([
      window.api.lyric.getConfig("dynamicIsland") as Promise<DynamicIslandSettings>,
      window.api.dynamicIsland.getMode(),
    ]);
    if (saved) Object.assign(config, saved);
    mode.value = currentMode;
  } catch (error) {
    console.error("[dynamic-island] load state failed", error);
  }
  unsubConfig = window.api.dynamicIsland.onConfigChange((next) =>
    Object.assign(config, next as DynamicIslandSettings),
  );
  unsubMode = window.api.dynamicIsland.onModeChange((next) => {
    mode.value = next;
  });
  unsubCursor = window.api.dynamicIsland.onCursorInside((inside) => {
    hovering.value = inside;
  });
});

onBeforeUnmount(() => {
  unsubConfig?.();
  unsubConfig = null;
  unsubMode?.();
  unsubMode = null;
  unsubCursor?.();
  unsubCursor = null;
});
</script>

<template>
  <div
    class="root"
    :class="[
      mode === 'snapped' ? 'is-snapped' : 'is-floating',
      { 'is-hidden': config.nonOcclusive && hovering },
    ]"
    :style="rootStyle"
    @pointerdown="onRootPointerDown"
  >
    <div class="cover">
      <img
        :src="track?.cover || DEFAULT_COVER"
        alt="cover"
        draggable="false"
        @error="($event.target as HTMLImageElement).src = DEFAULT_COVER"
      />
    </div>
    <div
      class="lyric"
      :class="{ 'is-shrinking': shrinking }"
      :style="{ width: `${lyricWidth}px`, opacity: lyricOpacity }"
      @transitionend="onLyricTransitionEnd"
    >
      <div class="main-line">
        <IslandLyricLine
          v-if="displayLine"
          :line="displayLine"
          :font-size="fontSize"
          :font-weight="config.fontWeight"
          :word-by-word="config.wordByWord"
        />
        <div v-else class="fallback" :style="{ fontSize: `${fontSize}px` }">
          {{ displayFallback }}
        </div>
      </div>
      <div v-if="showSubLine" class="sub-line" :style="{ fontSize: `${subFontSize}px` }">
        {{ displaySubText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.root {
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--di-gap);
  padding: 0 var(--di-padx);
  box-sizing: border-box;
  background: var(--di-bg);
  cursor: move;
  color: var(--di-played);
  width: fit-content;
  transition:
    border-radius 0.3s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.2s ease-out;
}
.root.is-hidden {
  opacity: 0;
}
.root.is-snapped {
  border-radius: 0 0 var(--di-snap-radius) var(--di-snap-radius);
}
.root.is-floating {
  border-radius: 999px;
}
.cover {
  flex: 0 0 auto;
  width: var(--di-cover);
  height: var(--di-cover);
  border-radius: var(--di-cover-radius);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}
.lyric {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  transition:
    width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease-out;
}
.lyric.is-shrinking {
  transition:
    width 0.25s ease-in,
    opacity 0.25s ease-in;
}
.main-line {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.fallback {
  color: var(--di-played);
  white-space: nowrap;
}
.sub-line {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--di-played);
  opacity: 0.65;
  white-space: nowrap;
}
</style>
