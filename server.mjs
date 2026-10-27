import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchHistory, validCache, saoPauloDate } from "./lib/market.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const CACHE = path.join(ROOT, ".cache", "ibovespa.json");
const HOUR = 60 * 60 * 1000;

export function createHistoryService({ loader = fetchHistory, cacheFile = CACHE, clock = () => new Date() } = {}) {
  let memory = null;
  let pending = null;
  let lastAttempt = 0;
  let lastError = null;
  async function fromDisk() {
    if (memory || !cacheFile) return;
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8"));
      if (validCache(cached)) memory = cached;
    } catch { /* First run or invalid cache: download a new series. */ }
  }
  function result() {
    const lagDays = (Date.parse(saoPauloDate(clock())) - Date.parse(memory.points.at(-1).date)) / 86400000;
    const warnings = [];
    if (lastError) warnings.push("A atualização falhou. Exibindo a última cópia local, obtida em " + memory.fetchedAt + ".");
    if (lagDays > 5) warnings.push("O último fechamento tem mais de cinco dias corridos. Confira a cobertura antes de comparar.");
    return { ...memory, stale: Boolean(lastError) || lagDays > 5, warnings };
  }
  return async function getHistory(force = false) {
    await fromDisk();
    const now = clock().getTime();
    if (pending) { await pending; return result(); }
    if (memory && ((!force && now - Date.parse(memory.fetchedAt) < HOUR) || now - lastAttempt < 60000)) return result();
    if (!memory && lastError && now - lastAttempt < 60000) throw lastError;
    lastAttempt = now;
    pending = (async () => {
      try {
        const data = await loader();
        if (!validCache(data)) throw new Error("A fonte retornou um histórico inválido.");
        // A shorter latest date must not silently replace a more recent local copy.
        if (memory && data.points.at(-1).date < memory.points.at(-1).date) throw new Error("A fonte retornou dados mais antigos que o cache.");
        memory = data;
        lastError = null;
        if (cacheFile) {
          try {
            await mkdir(path.dirname(cacheFile), { recursive: true });
            await writeFile(cacheFile + ".tmp", JSON.stringify(data), "utf8");
            await rename(cacheFile + ".tmp", cacheFile);
          } catch (error) { console.warn("Não foi possível persistir o cache:", error.message); }
        }
      } catch (error) {
        lastError = error;
        if (!memory) throw error;
      }
    })();
    try { await pending; return result(); } finally { pending = null; }
  };
}

export function createApp({ historyService = createHistoryService() } = {}) {
  return http.createServer(async (req, res) => {
    const sendJson = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return sendJson(405, { error: "Método não permitido." });
    }
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { return sendJson(400, { error: "URL inválida." }); }
    try {
      if (url.pathname === "/api/history") return sendJson(200, await historyService(url.searchParams.get("refresh") === "1"));
      if (url.pathname === "/api/mandates") return sendJson(200, JSON.parse(await readFile(path.join(ROOT, "data", "mandates.json"), "utf8")));
      const routes = { "/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/app.js": "app.js", "/model.js": "model.js" };
      const filename = routes[url.pathname];
      if (!filename) return sendJson(404, { error: "Página não encontrada." });
      const content = await readFile(path.join(PUBLIC, filename));
      const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
      res.writeHead(200, {
        "Content-Type": types[path.extname(filename)] + "; charset=utf-8",
        "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (url.pathname === "/api/history") {
        console.warn("Histórico indisponível:", error.message);
        return sendJson(503, { error: "Não foi possível consultar o Yahoo Finance. Verifique a conexão e tente novamente em um minuto. Se já houver um cache, reinicie sem removê-lo." });
      }
      sendJson(500, { error: "Não foi possível carregar este recurso." });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.on("error", error => { console.error(error.code === "EADDRINUSE" ? "Porta em uso. Execute com outra PORT (veja README.md)." : error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log("IBOV em perspectiva → http://localhost:" + port + "\nCtrl+C para encerrar."));
}
