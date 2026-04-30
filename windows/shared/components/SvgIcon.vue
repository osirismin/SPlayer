<template>
  <span
    class="svg-icon"
    :style="iconStyle"
    role="img"
    aria-hidden="true"
    v-html="svgContent"
  ></span>
</template>

<script setup lang="ts">
interface Props {
  name: string;
  size?: string | number;
}

const props = defineProps<Props>();

const rawIcons = import.meta.glob("../../../src/assets/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 以图标名为键归一化（避免对路径前缀做强假设） */
const iconMap: Record<string, string> = {};
for (const [path, content] of Object.entries(rawIcons)) {
  const match = /([^/\\]+)\.svg$/.exec(path);
  if (match) iconMap[match[1]] = content;
}

const svgContent = ref<string>("");

const iconStyle = computed(() => {
  const size = props.size;
  if (size == null) return undefined;
  const value = typeof size === "number" ? `${size}px` : size;
  return { fontSize: value };
});

const resolveIcon = (iconName: string): void => {
  const raw = iconMap[iconName];
  if (raw) {
    svgContent.value = raw;
  } else {
    console.warn(`[SvgIcon] icon not found: ${iconName}`);
    svgContent.value = "";
  }
};

watch(() => props.name, resolveIcon, { immediate: true });
</script>

<style scoped>
.svg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 0;
  color: inherit;
}
.svg-icon :deep(svg) {
  width: 1em;
  height: 1em;
  fill: currentColor;
}
</style>
