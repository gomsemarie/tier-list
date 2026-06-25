import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

type NaverImageItem = { title?: string; link?: string; thumbnail?: string };

/**
 * Dev-only proxy for the Naver image search API. Keeps the client secret on the
 * server side (read from .env, never bundled). Exposes GET /api/naver-image?q=…
 * Returns { configured: boolean, items: [{ title, thumbnail }] }.
 * For production, port this same handler to a serverless function.
 */
function naverImageProxy(env: Record<string, string>): Plugin {
  const id = env.NAVER_CLIENT_ID;
  const secret = env.NAVER_CLIENT_SECRET;

  return {
    name: "naver-image-proxy",
    configureServer(server) {
      server.middlewares.use("/api/naver-image", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");

        if (!id || !secret) {
          res.statusCode = 501;
          res.end(JSON.stringify({ configured: false, items: [] }));
          return;
        }

        try {
          const url = new URL(req.url ?? "", "http://localhost");
          const q = url.searchParams.get("q")?.trim();
          if (!q) {
            res.statusCode = 400;
            res.end(JSON.stringify({ configured: true, items: [] }));
            return;
          }

          const api = new URL("https://openapi.naver.com/v1/search/image");
          api.searchParams.set("query", q);
          api.searchParams.set("display", "12");
          api.searchParams.set("sort", "sim");

          const apiRes = await fetch(api, {
            headers: {
              "X-Naver-Client-Id": id,
              "X-Naver-Client-Secret": secret,
            },
          });
          if (!apiRes.ok) {
            res.statusCode = apiRes.status;
            res.end(JSON.stringify({ configured: true, items: [], error: `naver ${apiRes.status}` }));
            return;
          }

          const data = (await apiRes.json()) as { items?: NaverImageItem[] };
          const items = (data.items ?? [])
            .map((it) => ({
              title: String(it.title ?? "").replace(/<[^>]+>/g, "").trim(),
              thumbnail: it.thumbnail || it.link || "",
            }))
            .filter((it) => it.thumbnail);

          res.end(JSON.stringify({ configured: true, items }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ configured: true, items: [], error: String(e) }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Fixed, uncommon port to avoid colliding with other projects.
  // Override with VITE_PORT in .env.local. strictPort fails loudly instead of
  // silently hopping to 5174/5175/…
  const port = Number(env.VITE_PORT ?? 5810);
  const serverPort = Number(env.VITE_SERVER_PORT ?? 5811);

  // Proxy Socket.IO (and its websocket upgrade) to the realtime server so the
  // whole app is reachable through this one port. Then only 5810 needs to be
  // exposed (port-forward or a single tunnel) — no separate 5811.
  const proxy = {
    "/socket.io": {
      target: `http://localhost:${serverPort}`,
      ws: true,
      changeOrigin: true,
    },
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths(),
      naverImageProxy(env),
    ],
    server: {
      // host: true → bind to 0.0.0.0 so other devices/LAN/tunnels can connect.
      host: true,
      port,
      strictPort: true,
      proxy,
      // Allow any Host header (e.g. *.trycloudflare.com, ngrok domains).
      allowedHosts: true,
    },
    preview: {
      host: true,
      port,
      strictPort: true,
      proxy,
      allowedHosts: true,
    },
  };
});
