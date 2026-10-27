// Minimal proxy for the Claude API. Holds ANTHROPIC_API_KEY in the server's env,
// streams /v1/messages responses straight through to the browser, and serves the
// frontend from ./public. No dependencies: Node 18+ only.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const APP_PASSWORD = process.env.APP_PASSWORD || ""; // optional: protects your key if the URL is public
const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2026-10-21";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!APP_PASSWORD) return true;
  return req.headers["x-app-password"] === APP_PASSWORD;
}

function anthropicHeaders(extra = {}) {
  return {
    "x-api-key": API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    ...extra,
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/config" && req.method === "GET") {
    return json(res, 200, {
      hasServerKey: Boolean(API_KEY),
      needsPassword: Boolean(APP_PASSWORD),
    });
  }

  if (!authorized(req)) return json(res, 401, { error: "Wrong or missing password." });
  if (!API_KEY) return json(res, 503, { error: "ANTHROPIC_API_KEY is not set on the server." });

  if (url.pathname === "/api/models" && req.method === "GET") {
    const upstream = await fetch(`${ANTHROPIC_BASE}/v1/models?limit=100`, { headers: anthropicHeaders() });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8" });
    return res.end(text);
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: "Body must be JSON." });
    }
    payload.stream = true;

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    let upstream;
    try {
      upstream = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: "POST",
        headers: anthropicHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      return json(res, 502, { error: `Could not reach the Claude API: ${err.message}` });
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8" });
      return res.end(text);
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch {
      // client went away or upstream dropped; nothing more to do
    } finally {
      res.end();
    }
    return;
  }

  json(res, 404, { error: "Not found." });
}

function serveStatic(req, res, url) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "Forbidden." });
  if (url.pathname === "/" || !path.extname(filePath)) filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) return json(res, 404, { error: "Not found." });
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      return serveStatic(req, res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    }
  })
  .listen(PORT, () => {
    console.log(`Claude chat running on http://localhost:${PORT}`);
    if (!API_KEY) console.warn("ANTHROPIC_API_KEY is not set. The UI will ask for a key in-browser instead.");
  });
