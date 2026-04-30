import { computed, reactive, ref } from "vue";
import {
  DEFAULT_DESKTOP_LYRIC,
  DEFAULT_DYNAMIC_ISLAND,
  DEFAULT_TASKBAR_LYRIC,
  type DesktopLyricSettings,
  type DynamicIslandSettings,
  type TaskbarLyricSettings,
} from "@shared/lyric-window";
import { useSettingStore } from "@/stores";
import type { SettingConfig } from "@/types/settings";
import { isElectron, isMac, isWin } from "@/utils/env";

type LyricMode = "desktopLyric" | "dynamicIsland" | "taskbarLyric";

const desktopLyricCfg = reactive<DesktopLyricSettings>({ ...DEFAULT_DESKTOP_LYRIC });
const dynamicIslandCfg = reactive<DynamicIslandSettings>({ ...DEFAULT_DYNAMIC_ISLAND });
const taskbarLyricCfg = reactive<TaskbarLyricSettings>({ ...DEFAULT_TASKBAR_LYRIC });

const desktopLyricOpen = ref(false);
const dynamicIslandOpen = ref(false);
const taskbarLyricOpen = ref(false);

const pushConfig = (
  mode: LyricMode,
  partial: Partial<DesktopLyricSettings | DynamicIslandSettings | TaskbarLyricSettings>,
): void => {
  if (!isElectron) return;
  window.api.lyric.setConfig(mode, partial).catch((err) => {
    console.error(`[external-lyric] setConfig ${mode} failed`, err);
  });
};

const bind = <T extends DesktopLyricSettings | DynamicIslandSettings | TaskbarLyricSettings>(
  cfg: T,
  mode: LyricMode,
  key: keyof T,
) => ({
  get: () => cfg[key],
  set: (val: T[keyof T]) => {
    cfg[key] = val;
    pushConfig(mode, { [key]: val } as Partial<T>);
  },
});

const restoreDesktopLyricConfig = () => {
  if (!isElectron) return;
  window.$dialog.warning({
    title: "警告",
    content: "此操作将恢复所有桌面歌词配置为默认值，是否继续?",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      Object.assign(desktopLyricCfg, DEFAULT_DESKTOP_LYRIC);
      pushConfig("desktopLyric", { ...DEFAULT_DESKTOP_LYRIC });
      window.$message.success("桌面歌词配置已恢复默认");
    },
  });
};

const restoreDynamicIslandConfig = () => {
  if (!isElectron) return;
  window.$dialog.warning({
    title: "警告",
    content: "此操作将恢复所有灵动岛歌词配置为默认值，是否继续?",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      Object.assign(dynamicIslandCfg, DEFAULT_DYNAMIC_ISLAND);
      pushConfig("dynamicIsland", { ...DEFAULT_DYNAMIC_ISLAND });
      window.$message.success("灵动岛歌词配置已恢复默认");
    },
  });
};

const restoreTaskbarLyricConfig = () => {
  if (!isElectron) return;
  window.$dialog.warning({
    title: "警告",
    content: "此操作将恢复所有任务栏歌词配置为默认值，是否继续?",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      Object.assign(taskbarLyricCfg, DEFAULT_TASKBAR_LYRIC);
      pushConfig("taskbarLyric", { ...DEFAULT_TASKBAR_LYRIC });
      window.$message.success("任务栏歌词配置已恢复默认");
    },
  });
};

/** 订阅三个歌词窗口的可见性变化事件，确保用户从设置之外（X 按钮 / 托盘）关闭时设置面板开关也跟着同步 */
const visibilityUnsubscribers: Array<() => void> = [];

const subscribeVisibility = (): void => {
  if (!isElectron || visibilityUnsubscribers.length > 0) return;
  visibilityUnsubscribers.push(
    window.api.desktopLyric.onVisibilityChange((visible) => {
      desktopLyricOpen.value = visible;
    }),
    window.api.dynamicIsland.onVisibilityChange((visible) => {
      dynamicIslandOpen.value = visible;
    }),
    window.api.taskbarLyric.onVisibilityChange((visible) => {
      taskbarLyricOpen.value = visible;
    }),
  );
};

export const useExternalLyricSettings = (): SettingConfig => {
  const settingStore = useSettingStore();

  const onActivate = async (): Promise<void> => {
    if (!isElectron) return;
    try {
      const [d, di, t, dOpen, diOpen, tOpen] = await Promise.all([
        window.api.lyric.getConfig("desktopLyric"),
        window.api.lyric.getConfig("dynamicIsland"),
        window.api.lyric.getConfig("taskbarLyric"),
        window.api.window.isDesktopLyricOpen(),
        window.api.window.isDynamicIslandOpen(),
        isWin ? window.api.window.isTaskbarLyricOpen() : Promise.resolve(false),
      ]);
      if (d) Object.assign(desktopLyricCfg, d);
      if (di) Object.assign(dynamicIslandCfg, di);
      if (t) Object.assign(taskbarLyricCfg, t);
      desktopLyricOpen.value = !!dOpen;
      dynamicIslandOpen.value = !!diOpen;
      taskbarLyricOpen.value = !!tOpen;
    } catch (err) {
      console.error("[external-lyric] load config failed", err);
    }
    subscribeVisibility();
  };

  return {
    onActivate,
    groups: [
      {
        title: "桌面歌词",
        tags: [{ text: "Beta", type: "warning" }],
        show: isElectron,
        items: [
          {
            key: "showDesktopLyric",
            label: "开启桌面歌词",
            type: "switch",
            description: "如遇问题请向开发者反馈",
            value: computed({
              get: () => desktopLyricOpen.value,
              set: async () => {
                if (!isElectron) return;
                desktopLyricOpen.value = await window.api.window.toggleDesktopLyric();
              },
            }),
          },
          {
            key: "desktopLyricLock",
            label: "锁定桌面歌词位置",
            type: "switch",
            description: "是否锁定桌面歌词位置，防止误触或遮挡内容",
            ...bind(desktopLyricCfg, "desktopLyric", "locked"),
          },
          {
            key: "desktopLyricAlwaysOnTop",
            label: "窗口置顶",
            type: "switch",
            description: "保持桌面歌词窗口始终位于其它窗口之上",
            ...bind(desktopLyricCfg, "desktopLyric", "alwaysOnTop"),
          },
          {
            key: "desktopLyricDoubleLine",
            label: "双行歌词",
            type: "switch",
            description: "是否启用双行歌词，交替显示当前句和下一句",
            ...bind(desktopLyricCfg, "desktopLyric", "doubleLine"),
          },
          {
            key: "desktopLyricLimitBounds",
            label: "限制歌词位置",
            type: "switch",
            description: "是否限制桌面歌词位置在当前屏幕内",
            ...bind(desktopLyricCfg, "desktopLyric", "limitBounds"),
          },
          {
            key: "desktopLyricAlign",
            label: "对齐方式",
            type: "select",
            description: "桌面歌词对齐方式",
            options: [
              { label: "左对齐", value: "left" },
              { label: "居中对齐", value: "center" },
              { label: "右对齐", value: "right" },
              { label: "左右交替", value: "justify" },
            ],
            ...bind(desktopLyricCfg, "desktopLyric", "align"),
          },
          {
            key: "desktopLyricShowWordByWord",
            label: "显示逐字歌词",
            type: "switch",
            description: "是否显示桌面歌词逐字效果",
            ...bind(desktopLyricCfg, "desktopLyric", "wordByWord"),
          },
          {
            key: "desktopLyricAutoGenerateWordByWord",
            label: "自动生成逐字效果",
            type: "switch",
            description: "对没有逐字时间轴的普通歌词，按整行进度模拟逐字渐变",
            ...bind(desktopLyricCfg, "desktopLyric", "autoGenerateWordByWord"),
          },
          {
            key: "desktopLyricShowTran",
            label: "显示翻译",
            type: "switch",
            description: "是否显示桌面歌词翻译",
            ...bind(desktopLyricCfg, "desktopLyric", "showTranslation"),
          },
          {
            key: "desktopLyricAnimation",
            label: "歌词切换动画",
            type: "switch",
            description: "开启后歌词切换时会有动画过渡效果",
            ...bind(desktopLyricCfg, "desktopLyric", "animation"),
          },
          {
            key: "desktopLyricFontWeight",
            label: "文字字重",
            type: "input-number",
            description: "设置桌面歌词显示的字重",
            min: 100,
            max: 900,
            step: 100,
            ...bind(desktopLyricCfg, "desktopLyric", "fontWeight"),
          },
          {
            key: "desktopLyricFontSize",
            label: "文字大小",
            type: "slider",
            description: "桌面歌词主字号，窗口高度将随字号自动变化",
            min: 20,
            max: 96,
            step: 1,
            suffix: "px",
            ...bind(desktopLyricCfg, "desktopLyric", "fontSize"),
          },
          {
            key: "desktopLyricPlayedColor",
            label: "已播放文字",
            type: "color-picker",
            description: "桌面歌词已播放文字颜色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(desktopLyricCfg, "desktopLyric", "playedColor"),
          },
          {
            key: "desktopLyricUnplayedColor",
            label: "未播放文字",
            type: "color-picker",
            description: "桌面歌词未播放文字颜色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(desktopLyricCfg, "desktopLyric", "unplayedColor"),
          },
          {
            key: "desktopLyricStrokeColor",
            label: "描边色",
            type: "color-picker",
            description: "桌面歌词文字描边色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(desktopLyricCfg, "desktopLyric", "strokeColor"),
          },
          {
            key: "desktopLyricTextBackgroundMask",
            label: "文本背景遮罩",
            type: "switch",
            description: "防止在某些界面看不清文本",
            ...bind(desktopLyricCfg, "desktopLyric", "backgroundMask"),
            children: [
              {
                key: "desktopLyricBackgroundMaskColor",
                label: "遮罩颜色",
                type: "color-picker",
                description: "设置背景遮罩的颜色和透明度",
                componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
                ...bind(desktopLyricCfg, "desktopLyric", "backgroundMaskColor"),
              },
            ],
          },
          {
            key: "desktopLyricAlwaysShowPlayInfo",
            label: "始终展示播放信息",
            type: "switch",
            description: "是否始终展示当前歌曲名及歌手",
            ...bind(desktopLyricCfg, "desktopLyric", "alwaysShowSongInfo"),
          },
          {
            key: "desktopLyricRestore",
            label: "恢复默认配置",
            type: "button",
            description: "恢复默认桌面歌词配置",
            buttonLabel: "恢复默认",
            action: restoreDesktopLyricConfig,
          },
        ],
      },
      {
        title: "灵动岛歌词",
        tags: [{ text: "Beta", type: "warning" }],
        show: isElectron,
        items: [
          {
            key: "dynamicIslandEnabled",
            label: "开启灵动岛歌词",
            type: "switch",
            description: "顶部吸附式 Mini 歌词窗口，可吸附在屏幕顶部或自由浮动",
            value: computed({
              get: () => dynamicIslandOpen.value,
              set: async () => {
                if (!isElectron) return;
                dynamicIslandOpen.value = await window.api.window.toggleDynamicIsland();
              },
            }),
          },
          {
            key: "dynamicIslandScale",
            label: "整体缩放",
            type: "slider",
            description: "1.0 为默认尺寸，缩放比例同时影响窗口尺寸与字号",
            min: 0.5,
            max: 2,
            step: 0.1,
            formatTooltip: (v: number) => `${Math.round(v * 100)}%`,
            ...bind(dynamicIslandCfg, "dynamicIsland", "scale"),
          },
          {
            key: "dynamicIslandFontWeight",
            label: "文字字重",
            type: "input-number",
            description: "设置灵动岛歌词显示的字重",
            min: 100,
            max: 900,
            step: 100,
            ...bind(dynamicIslandCfg, "dynamicIsland", "fontWeight"),
          },
          {
            key: "dynamicIslandWordByWord",
            label: "逐字歌词",
            type: "switch",
            description: "随播放进度逐字渐变高亮",
            ...bind(dynamicIslandCfg, "dynamicIsland", "wordByWord"),
          },
          {
            key: "dynamicIslandDoubleLine",
            label: "双行显示",
            type: "switch",
            description: "同时显示当前句和副行（翻译或下一句）",
            ...bind(dynamicIslandCfg, "dynamicIsland", "doubleLine"),
          },
          {
            key: "dynamicIslandShowTranslation",
            label: "显示翻译",
            type: "switch",
            description: "副行优先显示翻译，没有翻译时回退到下一句",
            ...bind(dynamicIslandCfg, "dynamicIsland", "showTranslation"),
          },
          {
            key: "dynamicIslandPlayedColor",
            label: "已播放文字",
            type: "color-picker",
            description: "已播放部分文字颜色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(dynamicIslandCfg, "dynamicIsland", "playedColor"),
          },
          {
            key: "dynamicIslandUnplayedColor",
            label: "未播放文字",
            type: "color-picker",
            description: "未播放部分文字颜色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(dynamicIslandCfg, "dynamicIsland", "unplayedColor"),
          },
          {
            key: "dynamicIslandBackgroundColor",
            label: "背景颜色",
            type: "color-picker",
            description: "灵动岛胶囊背景颜色",
            componentProps: { showAlpha: true, modes: ["rgb", "hex"] },
            ...bind(dynamicIslandCfg, "dynamicIsland", "backgroundColor"),
          },
          {
            key: "dynamicIslandSnapCentered",
            label: "吸附时居中",
            type: "switch",
            description: "吸附到屏幕顶部时按屏幕宽度居中；关闭后保留拖拽时的水平位置",
            ...bind(dynamicIslandCfg, "dynamicIsland", "snapCentered"),
          },
          {
            key: "dynamicIslandNonOcclusive",
            label: "非遮挡模式",
            type: "switch",
            description: "鼠标悬停在窗口上方时窗口透明并穿透，避免遮挡下方内容",
            ...bind(dynamicIslandCfg, "dynamicIsland", "nonOcclusive"),
          },
          {
            key: "dynamicIslandAlwaysOnTop",
            label: "窗口置顶",
            type: "switch",
            description: "保持灵动岛窗口始终位于其它窗口之上",
            ...bind(dynamicIslandCfg, "dynamicIsland", "alwaysOnTop"),
          },
          {
            key: "dynamicIslandRestore",
            label: "恢复默认配置",
            type: "button",
            description: "恢复默认灵动岛歌词配置",
            buttonLabel: "恢复默认",
            action: restoreDynamicIslandConfig,
          },
        ],
      },
      {
        title: "任务栏歌词",
        show: isElectron && isWin,
        items: [
          {
            key: "taskbarLyricEnabled",
            label: "开启任务栏歌词",
            type: "switch",
            description: "开启后将在任务栏显示歌词",
            value: computed({
              get: () => taskbarLyricOpen.value,
              set: async () => {
                if (!isElectron) return;
                taskbarLyricOpen.value = await window.api.window.toggleTaskbarLyric();
              },
            }),
          },
          {
            key: "taskbarLyricPosition",
            label: "显示位置",
            type: "select",
            description: "任务栏歌词的显示位置",
            options: [
              { label: "自动", value: "auto" },
              { label: "靠左", value: "left" },
              { label: "靠右", value: "right" },
            ],
            ...bind(taskbarLyricCfg, "taskbarLyric", "position"),
          },
          {
            key: "taskbarLyricColorMode",
            label: "配色模式",
            type: "select",
            description: "跟随任务栏主题或强制选择浅色/深色",
            options: [
              { label: "跟随任务栏", value: "taskbar" },
              { label: "浅色", value: "light" },
              { label: "深色", value: "dark" },
            ],
            ...bind(taskbarLyricCfg, "taskbarLyric", "colorMode"),
          },
          {
            key: "taskbarLyricAutoMaxWidth",
            label: "宽度自动",
            type: "switch",
            description: "开启后占满任务栏的可用空间，关闭后按最大宽度限制",
            ...bind(taskbarLyricCfg, "taskbarLyric", "autoMaxWidth"),
          },
          {
            key: "taskbarLyricMaxWidth",
            label: "最大宽度",
            type: "slider",
            description: "超出可用空间时仍以可用空间为准，避免挤占",
            show: computed(() => !taskbarLyricCfg.autoMaxWidth),
            min: 200,
            max: 800,
            step: 20,
            suffix: "px",
            ...bind(taskbarLyricCfg, "taskbarLyric", "maxWidth"),
          },
          {
            key: "taskbarLyricFontSize",
            label: "文字大小",
            type: "slider",
            description: "任务栏歌词字号",
            min: 10,
            max: 22,
            step: 1,
            suffix: "px",
            ...bind(taskbarLyricCfg, "taskbarLyric", "fontSize"),
          },
          {
            key: "taskbarLyricDoubleLine",
            label: "双行显示",
            type: "switch",
            description: "同时显示当前歌词和副行（翻译或下一句）",
            ...bind(taskbarLyricCfg, "taskbarLyric", "doubleLine"),
          },
          {
            key: "taskbarLyricShowTranslation",
            label: "显示翻译",
            type: "switch",
            description: "副行优先显示翻译，没有翻译时回退到下一句",
            ...bind(taskbarLyricCfg, "taskbarLyric", "showTranslation"),
          },
          {
            key: "taskbarLyricShowCover",
            label: "显示封面",
            type: "switch",
            description: "是否在任务栏歌词中显示歌曲封面",
            ...bind(taskbarLyricCfg, "taskbarLyric", "showCover"),
          },
          {
            key: "taskbarLyricShowWordByWord",
            label: "显示逐字歌词",
            type: "switch",
            description: "是否显示任务栏歌词逐字效果",
            ...bind(taskbarLyricCfg, "taskbarLyric", "wordByWord"),
          },
          {
            key: "taskbarLyricRestore",
            label: "恢复默认配置",
            type: "button",
            description: "恢复默认任务栏歌词配置",
            buttonLabel: "恢复默认",
            action: restoreTaskbarLyricConfig,
          },
        ],
      },
      {
        title: "macOS 状态栏歌词",
        show: isElectron && isMac,
        items: [
          {
            key: "macStatusBarLyricEnabled",
            label: "启用状态栏歌词",
            type: "switch",
            description: "开启后将在 macOS 状态栏显示歌词",
            value: computed({
              get: () => settingStore.macos.statusBarLyric.enabled,
              set: (v) => {
                settingStore.macos.statusBarLyric.enabled = v;
                window.electron.ipcRenderer.send("macos-lyric:toggle", v);
                window.$message.success(`${v ? "已开启" : "已关闭"}状态栏歌词`);
              },
            }),
          },
        ],
      },
    ],
  };
};
