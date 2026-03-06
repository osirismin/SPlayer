import type { PluginRuntimeInfo } from "@/types/plugin";
import { isElectron } from "@/utils/env";
import { defineStore } from "pinia";

interface PluginStoreState {
  /** 所有插件运行时信息 */
  plugins: PluginRuntimeInfo[];
}

export const usePluginStore = defineStore("plugin", {
  state: (): PluginStoreState => ({
    plugins: [],
  }),
  getters: {
    /** 获取指定插件信息 */
    getPlugin: (state) => {
      return (id: string): PluginRuntimeInfo | undefined => {
        return state.plugins.find((p) => p.id === id);
      };
    },
    /** 已启用的插件 */
    enabledPlugins: (state): PluginRuntimeInfo[] => {
      return state.plugins.filter((p) => p.enabled);
    },
  },
  actions: {
    /** 从主进程同步插件列表 */
    async syncFromMain() {
      if (!isElectron) return;
      try {
        this.plugins = await window.electron.ipcRenderer.invoke("plugin:get-list");
      } catch (e) {
        console.error("❌ 同步插件列表失败:", e);
      }
    },
    /** 从文件导入，返回是否实际导入 */
    async importFromFile(): Promise<boolean> {
      if (!isElectron) return false;
      const filePath = await window.electron.ipcRenderer.invoke("plugin:select-file");
      if (!filePath) return false;
      const result = await window.electron.ipcRenderer.invoke("plugin:import-file", filePath);
      if (!result.success) {
        throw new Error(result.error);
      }
      await this.syncFromMain();
      return true;
    },
    /** 切换启用/禁用 */
    async togglePlugin(id: string, enabled: boolean) {
      if (!isElectron) return;
      if (enabled) {
        await window.electron.ipcRenderer.invoke("plugin:enable", id);
      } else {
        await window.electron.ipcRenderer.invoke("plugin:disable", id);
      }
      await this.syncFromMain();
    },
    /** 删除插件 */
    async removePlugin(id: string) {
      if (!isElectron) return;
      await window.electron.ipcRenderer.invoke("plugin:remove", id);
      await this.syncFromMain();
    },
  },
});
