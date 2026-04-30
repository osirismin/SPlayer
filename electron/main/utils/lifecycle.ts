import { app } from "electron";

/** 应用是否正在退出；退出流程中歌词窗口 close 不再持久化 visible=false */
let quitting = false;

app.once("before-quit", () => {
  quitting = true;
});

export const isAppQuitting = (): boolean => quitting;
