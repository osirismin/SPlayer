<template>
  <div :class="['background', settingStore.playerBackgroundType]">
    <!-- 背景色 -->
    <Transition v-if="settingStore.playerBackgroundType === 'color'" name="fade">
      <div :key="musicStore.songCover" class="color" />
    </Transition>
    <!-- 背景模糊 -->
    <template v-else-if="settingStore.playerBackgroundType === 'blur'">
      <img
        v-for="(layer, index) in blurLayers"
        :key="index"
        :src="layer.src"
        :class="['bg-img', { active: layer.active }]"
        alt="cover"
      />
    </template>
    <!-- 流体效果 -->
    <BackgroundRender
      v-else-if="settingStore.playerBackgroundType === 'animation'"
      :album="musicStore.songCover"
      :fps="settingStore.playerBackgroundFps ?? 60"
      :flowSpeed="flowSpeed"
      :hasLyric="musicStore.isHasLrc"
      :lowFreqVolume="lowFreqVolume"
      :renderScale="settingStore.playerBackgroundRenderScale ?? 0.5"
    />
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";

const musicStore = useMusicStore();
const settingStore = useSettingStore();
const statusStore = useStatusStore();
const player = usePlayerController();

// 双缓冲层
const blurLayers = reactive([
  { src: musicStore.songCover, active: true },
  { src: "", active: false },
]);
let currentLayerIndex = 0;

let preloadImg: HTMLImageElement | null = null;

watch(
  () => musicStore.songCover,
  (newCover) => {
    if (preloadImg) {
      preloadImg.onload = null;
      preloadImg.onerror = null;
      preloadImg.src = "";
      preloadImg = null;
    }
    const nextIndex = currentLayerIndex === 0 ? 1 : 0;
    const switchLayer = () => {
      preloadImg = null;
      blurLayers[nextIndex].src = newCover;
      nextTick(() => {
        blurLayers[nextIndex].active = true;
        blurLayers[currentLayerIndex].active = false;
        currentLayerIndex = nextIndex;
      });
    };
    if (!newCover || !newCover.startsWith("http")) {
      switchLayer();
      return;
    }
    // 预加载图片
    const img = new Image();
    preloadImg = img;
    img.onload = switchLayer;
    img.onerror = switchLayer;
    img.src = newCover;
  },
);

// 低频音量
const lowFreqVolume = ref(1.0);

const flowSpeed = computed(() => {
  if (!statusStore.playStatus && settingStore.playerBackgroundPause) return 0;
  else return settingStore.playerBackgroundFlowSpeed ?? 4;
});

// 更新低频音量
const { pause: pauseRaf, resume: resumeRaf } = useRafFn(
  () => {
    if (
      settingStore.playerBackgroundLowFreqVolume &&
      settingStore.playerBackgroundType === "animation" &&
      statusStore.playStatus
    ) {
      lowFreqVolume.value = player.getLowFrequencyVolume();
    }
  },
  { immediate: false },
);

// 启动或暂停 RAF
watch(
  () => [
    settingStore.playerBackgroundLowFreqVolume,
    settingStore.playerBackgroundType,
    statusStore.playStatus,
  ],
  ([enabled, bgType, playing]) => {
    if (enabled && bgType === "animation") {
      playing ? resumeRaf() : pauseRaf();
    } else {
      pauseRaf();
      lowFreqVolume.value = 1.0;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  pauseRaf();
  if (preloadImg) {
    preloadImg.onload = null;
    preloadImg.onerror = null;
    preloadImg.src = "";
    preloadImg = null;
  }
  blurLayers[0].src = "";
  blurLayers[1].src = "";
});
</script>

<style lang="scss" scoped>
.background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: -1;
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(20px);
  }
  &.blur {
    display: flex;
    align-items: center;
    justify-content: center;
    .bg-img {
      position: absolute;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.5);
      filter: blur(80px) contrast(1.2);
      opacity: 0;
      transition: opacity 0.5s ease-in-out;
      &.active {
        opacity: 1;
      }
    }
  }
  &.color {
    background-color: rgb(var(--main-cover-color));
    .color {
      width: 100%;
      height: 100%;
      background-color: rgb(var(--main-cover-color));
    }
  }
  &.animation {
    &::after {
      display: none;
    }
  }
}
</style>
