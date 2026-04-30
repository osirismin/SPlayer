import { BrowserWindow } from "electron";

/**
 * 向所有未销毁窗口广播事件
 * @param channel 通道名称
 * @param data 发送的数据
 */
export const broadcast = (channel: string, data?: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
};
