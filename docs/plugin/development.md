# 插件开发指南

## 快速开始

SPlayer 插件是一个标准 `.js` 文件。创建一个文件，写入以下内容即可开始：

```javascript
/**
 * @name        我的音源
 * @description 从 XX 获取替代音源
 * @version     1.0.0
 * @author      你的名字
 */

sp.registerAudioSource({
  name: "我的音源",
  priority: 50,
});

sp.on("resolve-audio-source", async (payload) => {
  const { requestId, song } = payload;
  // 处理逻辑...
  sp.sendResult(requestId, null); // 返回 null 表示无法处理
});
```

然后在 SPlayer 中：**设置 → 插件管理 → 从文件导入**，选择你的 `.js` 文件即可。

## 文件格式

### 元数据声明

通过文件头部的 JSDoc 注释声明插件信息，解析器会提取第一个 `/** */` 块中的标签：

```javascript
/**
 * @name        插件名称
 * @description 插件简介
 * @version     1.0.0
 * @author      作者名
 * @homepage    https://github.com/xxx
 */
```

| 字段 | 必需 | 限制 | 说明 |
|------|:----:|------|------|
| `@name` | 是 | 最多 24 字符 | 显示名称 |
| `@description` | 否 | 最多 36 字符 | 简要描述 |
| `@version` | 否 | semver 格式 | 版本号，默认 `0.0.0` |
| `@author` | 否 | - | 作者 |
| `@homepage` | 否 | URL | 项目主页 |

### 代码结构

插件代码运行在沙盒环境中，可直接使用 `sp` 对象（由运行时自动注入）：

```javascript
// ✅ 正确：直接使用 sp
sp.registerAudioSource({ name: "xxx" });

// ❌ 错误：不要从 globalThis 取
const sp = globalThis.sp; // 这会得到底层对象而非插件代理
```

## `sp` API 参考

### 属性

```javascript
sp.version   // "1.0.0" - API 版本
sp.env       // { platform: "win32"|"darwin"|"linux", arch: "x64"|"arm64" }
```

### 注册音频源

```javascript
sp.registerAudioSource({
  name: "音源名称",    // 显示名称
  priority: 50,       // 优先级，数字越小越优先（默认 50）
});
```

注册后，当播放器需要音频源时会触发 `resolve-audio-source` 事件。优先级决定多个插件间的调用顺序。

### 事件监听

```javascript
sp.on("resolve-audio-source", callback)   // 添加监听
sp.off("resolve-audio-source", callback)  // 移除监听
```

目前支持的事件：

| 事件名 | 说明 |
|--------|------|
| `resolve-audio-source` | 请求解析音频源 |

### 处理音频源请求

当播放器需要替代音源时，会触发 `resolve-audio-source` 事件：

```javascript
sp.on("resolve-audio-source", async (payload) => {
  const { requestId, song } = payload;

  // song 结构：
  // {
  //   id: number          - 歌曲 ID
  //   name: string        - 歌曲名
  //   artists: string | { name: string }[]  - 歌手
  //   album: string | { name: string }      - 专辑
  //   type: string        - 类型
  // }

  // 处理后必须调用 sendResult 返回结果
  sp.sendResult(requestId, {
    url: "https://...",         // 播放地址（必需）
    quality: "HQ",             // 音质标签（可选）
    sourceLabel: "MySource",   // 来源标签（可选）
  });

  // 或返回 null 表示无法处理
  sp.sendResult(requestId, null);
});
```

::: warning 注意
必须在 **10 秒内**调用 `sp.sendResult()`，否则请求会超时并跳过该插件。
:::

### HTTP 请求

所有网络请求通过主进程代理，自动绕过 CORS 限制：

```javascript
const resp = await sp.request(url, options?)
```

**参数：**

```javascript
sp.request("https://api.example.com/search", {
  method: "POST",                    // 默认 "GET"
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ q: "test" }),
  timeout: 8000,                     // 默认 15000 毫秒
})
```

**返回值：**

```javascript
{
  status: 200,                       // HTTP 状态码
  headers: { "content-type": "..." }, // 响应头
  body: "..."                        // 响应体（文本）
}
```

### 配置存储

插件配置会持久化到本地，应用重启后保留：

```javascript
// 读取配置
const config = await sp.getConfig();
// config: { key: "value", ... }

// 保存配置（合并更新）
await sp.setConfig({ apiUrl: "https://...", token: "xxx" });
```

### 工具方法

```javascript
// 在播放器界面显示通知
sp.notify("消息内容", "success")  // "info" | "success" | "warning" | "error"

// 获取当前播放歌曲
const song = await sp.getCurrentSong()
```

### 日志

```javascript
sp.log.info("普通日志", data)
sp.log.warn("警告日志", data)
sp.log.error("错误日志", data)
```

日志输出到主进程日志文件（`userData/logs/`），自动带插件名称前缀。开发时可通过 DevTools 控制台查看。

## 完整示例

### 基础音频源插件

```javascript
/**
 * @name        示例音源
 * @description 演示如何编写音频源插件
 * @version     1.0.0
 * @author      SPlayer
 */

sp.registerAudioSource({
  name: "示例音源",
  priority: 80,
});

sp.on("resolve-audio-source", async (payload) => {
  const { requestId, song } = payload;

  // 提取搜索关键词
  const artist = Array.isArray(song.artists)
    ? song.artists[0].name
    : song.artists;
  const keyword = song.name + " " + artist;

  sp.log.info("开始解析:", keyword);

  try {
    const resp = await sp.request(
      "https://api.example.com/search?q=" + encodeURIComponent(keyword),
      { timeout: 8000 }
    );

    if (resp.status !== 200) {
      sp.sendResult(requestId, null);
      return;
    }

    const data = JSON.parse(resp.body);
    if (data.url) {
      sp.sendResult(requestId, {
        url: data.url,
        quality: "HQ",
        sourceLabel: "ExampleAPI",
      });
    } else {
      sp.sendResult(requestId, null);
    }
  } catch (e) {
    sp.log.error("请求失败:", e);
    sp.sendResult(requestId, null);
  }
});
```

### 带配置的插件

```javascript
/**
 * @name        自定义API
 * @description 支持自定义 API 地址
 * @version     1.0.0
 * @author      Test
 */

sp.registerAudioSource({ name: "自定义API", priority: 60 });

sp.on("resolve-audio-source", async (payload) => {
  const { requestId, song } = payload;
  const config = await sp.getConfig();
  const apiBase = config.apiUrl || "https://default-api.example.com";

  try {
    const resp = await sp.request(apiBase + "/resolve?id=" + song.id);
    const data = JSON.parse(resp.body);
    sp.sendResult(requestId, data.url ? { url: data.url } : null);
  } catch {
    sp.sendResult(requestId, null);
  }
});

// 首次运行设置默认配置
(async () => {
  const config = await sp.getConfig();
  if (!config.apiUrl) {
    await sp.setConfig({ apiUrl: "https://default-api.example.com" });
  }
})();
```

### 多源聚合插件

```javascript
/**
 * @name        多源聚合
 * @description 同时查询多个 API 取最快响应
 * @version     1.0.0
 * @author      Test
 */

sp.registerAudioSource({ name: "多源聚合", priority: 40 });

var APIs = [
  "https://api-a.example.com/song",
  "https://api-b.example.com/song",
];

sp.on("resolve-audio-source", async (payload) => {
  var requestId = payload.requestId;
  var song = payload.song;

  try {
    // 并发请求所有 API，取最快的成功响应
    var result = await Promise.any(
      APIs.map(async (api) => {
        var resp = await sp.request(api + "?name=" + encodeURIComponent(song.name));
        var data = JSON.parse(resp.body);
        if (!data.url) throw new Error("无结果");
        return { url: data.url, quality: "HQ", sourceLabel: "Multi" };
      })
    );
    sp.sendResult(requestId, result);
  } catch {
    sp.sendResult(requestId, null);
  }
});
```

## 安装与管理

### 安装

1. 打开 SPlayer → **设置** → **插件管理**
2. 点击 **从文件导入**
3. 选择 `.js` 插件文件
4. 插件自动启用并开始运行

### 管理

- **启用/禁用**：通过开关控制插件是否运行
- **删除**：点击删除按钮移除插件

插件文件存储在 `userData/plugins/` 目录下。

## 开发调试

1. 编写插件 `.js` 文件
2. 通过「从文件导入」安装
3. 播放一首需要解锁的歌曲，观察日志输出
4. 修改代码后，禁用再启用插件即可重新加载

::: tip 提示
使用 `sp.log.info()` 输出调试信息，日志会记录到主进程日志文件。也可以使用 `sp.notify()` 在界面上显示通知来快速验证。
:::

## 限制与约束

- 插件运行在沙盒中，**无法**访问 Node.js API、文件系统、Electron API
- 所有网络请求必须通过 `sp.request()` 代理
- 解析请求有 **10 秒超时**，超时后自动跳过
- 插件间相互隔离，无法互相通信
- 目前仅支持音频源能力（`audio-source`）
