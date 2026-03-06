import type { SettingConfig } from "@/types/settings";
import PluginList from "../components/PluginList.vue";
import { markRaw } from "vue";

export const usePluginSettings = (): SettingConfig => {
  return {
    groups: [
      {
        title: "插件管理",
        items: [
          {
            key: "pluginList",
            label: "已安装插件",
            type: "custom",
            noWrapper: true,
            component: markRaw(PluginList),
          },
        ],
      },
    ],
  };
};
