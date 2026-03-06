# 插件系统技术架构

## 概述

SPlayer 插件系统允许通过外部 `.js` 文件扩展播放器功能。所有插件运行在沙盒环境中，通过受限的 `sp` API 与播放器交互。

## 整体架构

```
┌──────────────────────────────────────────────┐
│  渲染器进程 (Vue 3 SPA)                        │
│                                              │
│  SongManager ──→ PluginManager(IPC 代理)      │
│       │                  │                   │
│  PluginStore ◄───── ipcRenderer.invoke ──┐   │
│  (Pinia)                                 │   │
└──────────────────────────────────────────│───┘
                                           │ IPC
┌──────────────────────────────────────────│───┐
│  主进程                                   │   │
│                                          ▼   │
│  ipc-plugin.ts ──→ PluginManager (核心)       │
│                         │                    │
│                    ┌────▼─────┐              │
│                    │ 共享宿主   │              │
│                    │ Browser  │              │
│                    │ Window   │              │
│                    │ (hidden) │              │
│                    │          │              │
│                    │ [插件A]  │              │
│                    │ [插件B]  │              │
│                    │ [插件C]  │              │
│                    └──────────┘              │
└──────────────────────────────────────────────┘
```

## 核心设计

### 单窗口共享模型

所有活跃插件共享**一个**隐藏 BrowserWindow（`sandbox: true` + `contextIsolation: true`），而非每个插件一个窗口。

| 方案 | N 个插件内存开销 |
|------|:------:|
| 每插件一个 BrowserWindow | ~30-50MB × N |
| **单窗口共享（当前方案）** | **~30-50MB（固定）** |

- 无活跃插件时不创建宿主窗口，内存开销为 0
- 最后一个插件停用后自动销毁宿主窗口

### IIFE 命名空间隔离

每个插件代码在注入宿主窗口时被 IIFE（立即执行函数表达式）包裹：

```javascript
;(function() {
  var __pluginId = "abc123";
  var sp = {
    // 独立的 sp 代理对象
    // 自动注入 pluginId，互不干扰
    registerAudioSource: function(p) { globalThis.sp.__registerAudioSource(__pluginId, p); },
    getConfig: function() { return globalThis.sp.getConfig(__pluginId); },
    log: {
      info: function() { globalThis.sp.log.info(__pluginId, ...arguments); },
      // ...
    },
    // ...
  };

  // 插件代码在此执行，只能访问局部 sp 变量
})();
```

- 插件代码中的 `sp` 是局部变量，非 `globalThis.sp`
- 每个 `sp` 代理自动携带 `pluginId`，主进程可识别来源
- 插件间无法互相访问

### 事件分发

主进程向宿主窗口发送事件时携带 `pluginId`，preload 层根据 `pluginId` 过滤分发：

```
主进程 → webContents.send("sp:event", "resolve-audio-source", { pluginId, requestId, song })
  → preload 接收 → 遍历 listeners → 仅回调 __pluginId 匹配的监听器
```

## 文件结构

```
electron/main/plugin/
├── PluginManager.ts      # 主进程插件管理器（单例）
│                         # - 文件管理（导入/删除）
│                         # - 宿主窗口生命周期
│                         # - 插件代码注入（IIFE 包裹）
│                         # - 音频源调度（优先级排序、超时控制）
│                         # - HTTP 请求代理（net.request）
│                         # - 状态持久化（electron-store）
│
└── preload.ts            # 插件宿主窗口 preload
                          # - contextBridge 暴露 globalThis.sp
                          # - 事件监听/分发（按 pluginId 过滤）
                          # - IPC 桥接

electron/main/ipc/
└── ipc-plugin.ts         # 渲染器↔主进程 插件 IPC 通道
                          # - plugin:get-list / import-file
                          # - plugin:enable / disable / remove
                          # - plugin:resolve-audio-source
                          # - plugin:select-file（文件选择对话框）

src/types/plugin.ts       # 共享类型定义
                          # - PluginMeta / PluginState / PluginRuntimeInfo
                          # - AudioSourceResult / PluginSongData
                          # - PluginCapability

src/stores/plugin.ts      # 渲染器 Pinia store
                          # - 纯 IPC 代理，不持久化
                          # - syncFromMain / importFromFile / importFromUrl
                          # - togglePlugin / removePlugin

src/core/plugin/
└── PluginManager.ts      # 渲染器侧薄代理
                          # - resolveAudioSource() → IPC 转发

src/components/Setting/
├── config/plugin.ts      # 设置页配置入口
└── components/PluginList.vue  # 插件管理 UI
```

## 数据流

### 插件导入

```
用户点击「从文件导入」
  → PluginStore.importFromFile()
  → IPC invoke("plugin:select-file")
  → 主进程 dialog.showOpenDialog() → 返回路径
  → IPC invoke("plugin:import-file", path)
  → PluginManager.importFromFile(path)
    → fs.copyFile → userData/plugins/xxx.js
    → 解析 JSDoc 元数据（@name, @version 等）
    → 生成 ID（MD5 hash）
    → electron-store 写入 PluginState
    → startPlugin() → IIFE 包裹 → executeJavaScript
  → PluginStore.syncFromMain() 刷新 UI
```

### 音频源解析

```
SongManager.getAudioSource(song)
  → 官方 URL 不可用
  → pluginManager.resolveAudioSource(song)
    → IPC invoke("plugin:resolve-audio-source", songData)
    → PluginManager.resolveAudioSource(songData)
      → 按优先级排序活跃插件
      → 对每个插件依次:
        → webContents.send("sp:event", "resolve-audio-source", { pluginId, requestId, song })
        → preload 分发给对应插件的 on("resolve-audio-source") 回调
        → 插件处理后调用 sp.sendResult(requestId, result)
        → ipcRenderer.send("sp:resolve-result", requestId, result)
        → PluginManager 收到结果，resolve Promise
        → 10 秒超时保护
      → 返回首个非 null 结果
    → 返回给渲染器
  → SongManager 使用结果播放
```

## 插件生命周期

| 阶段 | 触发 | 行为 |
|------|------|------|
| **导入** | 用户操作 | 复制/下载 .js → 解析元数据 → 写入 store → 自动启动 |
| **启动** | 导入/启用/应用启动 | 创建宿主窗口（如不存在）→ IIFE 包裹 → executeJavaScript |
| **运行** | 播放器请求 | 响应 `resolve-audio-source` 事件，返回结果 |
| **停止** | 用户禁用 | 清理事件监听器 → 从活跃列表移除 → 无插件时销毁窗口 |
| **删除** | 用户操作 | 停止 → 删除 .js 文件 → 从 electron-store 移除 |

## 安全措施

| 措施 | 说明 |
|------|------|
| `contextIsolation: true` | 插件无法访问 preload 上下文 |
| `sandbox: true` | 禁止访问 Node.js API |
| `nodeIntegration: false` | 禁止 require / import |
| IIFE 包裹 | 插件间命名空间隔离 |
| `sp` 代理 | 仅暴露白名单方法 |
| HTTP 代理 | 请求通过主进程 `net.request`，无直接网络访问 |
| 事件白名单 | 仅允许监听 `resolve-audio-source` |
| 超时保护 | 解析请求 10 秒超时 |
| 窗口限制 | 禁止导航、弹窗、权限请求 |

## IPC 通道一览

### 渲染器 → 主进程（`ipc-plugin.ts`）

| 通道 | 方向 | 说明 |
|------|------|------|
| `plugin:get-list` | handle | 获取插件运行时信息列表 |
| `plugin:import-file` | handle | 从本地文件导入 |
| `plugin:enable` | handle | 启用插件 |
| `plugin:disable` | handle | 禁用插件 |
| `plugin:remove` | handle | 删除插件 |
| `plugin:resolve-audio-source` | handle | 请求解析音频源 |
| `plugin:select-file` | handle | 打开文件选择对话框 |

### 插件宿主 → 主进程（`PluginManager` 内部 IPC）

| 通道 | 方向 | 说明 |
|------|------|------|
| `sp:register-audio-source` | on | 注册音频源能力 |
| `sp:resolve-result` | on | 返回解析结果 |
| `sp:request` | handle | HTTP 请求代理 |
| `sp:get-config` | handle | 读取插件配置 |
| `sp:set-config` | handle | 保存插件配置 |
| `sp:get-current-song` | handle | 获取当前播放歌曲 |
| `sp:notify` | on | 发送 UI 通知 |
| `sp:log` | on | 插件日志 |

### 主进程 → 插件宿主

| 通道 | 方向 | 说明 |
|------|------|------|
| `sp:event` | send | 分发事件（如 `resolve-audio-source`） |
