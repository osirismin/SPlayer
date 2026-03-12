import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pathCase } from "change-case";
import { readdirSync } from "fs";
import { join } from "path";
import { serverLog } from "../../main/logger";
import { useStore } from "../../main/store";
import { defaultAMLLDbServer } from "../../main/utils/config";

// 按需加载 NcmApi：启动时只扫描文件名建路由映射，首次请求时才 require 对应模块

let routeMap: Map<string, string> | null = null;
const moduleCache = new Map<string, (...args: unknown[]) => Promise<{ body: unknown }>>();
let cookieToJson: ((str: string) => Record<string, string>) | null = null;
let requestFn: ((...args: unknown[]) => Promise<unknown>) | null = null;

function ensureRouteMap(): Map<string, string> {
  if (routeMap) return routeMap;

  routeMap = new Map();
  try {
    const modulePath = join(require.resolve("@neteasecloudmusicapienhanced/api"), "..", "module");
    const files = readdirSync(modulePath);
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const name = file.slice(0, -3);
      const filePath = join(modulePath, file);
      routeMap.set(name, filePath);
      routeMap.set(pathCase(name), filePath);
    }

    const pkgRoot = join(require.resolve("@neteasecloudmusicapienhanced/api"), "..");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const util = require(join(pkgRoot, "util"));
    cookieToJson = util.cookieToJson;
  } catch (e) {
    serverLog.error("❌ Failed to scan NcmApi modules:", e);
  }
  serverLog.info(`🌐 NcmApi route map built, ${routeMap.size} routes`);
  return routeMap;
}

function loadModule(filePath: string): (...args: unknown[]) => Promise<{ body: unknown }> {
  const cached = moduleCache.get(filePath);
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(filePath);
  const fn = typeof mod === "function" ? mod : mod.default || mod;
  moduleCache.set(filePath, fn);
  return fn;
}

// 初始化 NcmAPI
export const initNcmAPI = async (fastify: FastifyInstance) => {
  // 主信息
  fastify.get("/netease", (_, reply) => {
    reply.send({
      name: "@neteaseapireborn/api",
      description: "网易云音乐 API Enhanced",
      author: "@MoeFurina",
      license: "MIT",
      url: "https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced",
    });
  });

  // 动态路由处理函数
  const dynamicHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { "*": requestPath } = req.params as { "*": string };
    const map = ensureRouteMap();

    const filePath = map.get(requestPath);
    if (!filePath) {
      return reply.status(404).send({ error: "API not found" });
    }

    serverLog.log("🌐 Request NcmAPI:", requestPath);

    try {
      const moduleFn = loadModule(filePath);

      const rawCookie = req.cookies;
      const cookie =
        typeof rawCookie === "string" && cookieToJson ? cookieToJson(rawCookie) : rawCookie || {};

      const query = {
        ...(req.query as Record<string, unknown>),
        ...(req.body as Record<string, unknown>),
        cookie,
      };

      if (!requestFn) {
        const pkgRoot = join(require.resolve("@neteasecloudmusicapienhanced/api"), "..");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        requestFn = require(join(pkgRoot, "util", "request"));
      }

      const result = await moduleFn(query, requestFn);
      return reply.send(result.body);
    } catch (error: unknown) {
      serverLog.error("❌ NcmAPI Error:", error);
      if (typeof error === "object" && error) {
        const err = error as { status: number; body: unknown; message?: string };
        if ([400, 301].includes(err.status)) {
          return reply.status(err.status).send(err.body);
        }
        return reply
          .status(500)
          .send(err.body || { error: err.message || "Internal Server Error" });
      }
      return reply.status(500).send({ error: String(error) });
    }
  };

  // 注册动态通配符路由
  fastify.get("/netease/*", dynamicHandler);
  fastify.post("/netease/*", dynamicHandler);

  // 获取 TTML 歌词
  fastify.get(
    "/netease/lyric/ttml",
    async (req: FastifyRequest<{ Querystring: { id: string } }>, reply: FastifyReply) => {
      const { id } = req.query;
      if (!id) {
        return reply.status(400).send({ error: "id is required" });
      }
      const store = useStore();
      const server = store.get("amllDbServer") ?? defaultAMLLDbServer;
      const url = server.replace("%s", String(id));
      try {
        const response = await fetch(url);
        if (response.status !== 200) {
          return reply.send(null);
        }
        const data = await response.text();
        return reply.send(data);
      } catch (error) {
        serverLog.error("❌ TTML Lyric Fetch Error:", error);
        return reply.send(null);
      }
    },
  );

  serverLog.info("🌐 Register NcmAPI successfully");
};
