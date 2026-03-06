import { dialog, ipcMain } from "electron";
import { PluginManager } from "../plugin/PluginManager";
import type { PluginSongData } from "../../../src/types/plugin";

/**
 * 初始化渲染器↔主进程的插件 IPC 通信
 */
const initPluginIpc = (): void => {
  const pluginManager = PluginManager.getInstance();

  // 获取插件列表
  ipcMain.handle("plugin:get-list", () => {
    return pluginManager.getPluginList();
  });

  // 从文件导入（返回结构化结果，避免 IPC 异常暴露通道名）
  ipcMain.handle("plugin:import-file", async (_event, filePath: string) => {
    try {
      const state = await pluginManager.importFromFile(filePath);
      return { success: true, data: state };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "导入失败" };
    }
  });

  // 删除插件
  ipcMain.handle("plugin:remove", async (_event, id: string) => {
    return pluginManager.removePlugin(id);
  });

  // 启用插件
  ipcMain.handle("plugin:enable", async (_event, id: string) => {
    return pluginManager.enablePlugin(id);
  });

  // 禁用插件
  ipcMain.handle("plugin:disable", async (_event, id: string) => {
    return pluginManager.disablePlugin(id);
  });

  // 解析音频源
  ipcMain.handle("plugin:resolve-audio-source", async (_event, song: PluginSongData) => {
    return pluginManager.resolveAudioSource(song);
  });

  // 选择插件文件对话框
  ipcMain.handle("plugin:select-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择插件文件",
      filters: [{ name: "JavaScript 插件", extensions: ["js"] }],
      properties: ["openFile"],
    });
    return result.filePaths[0] || null;
  });
};

export default initPluginIpc;
