import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  allAddonNames,
  allSkillNames,
  installAddons,
  installSkills,
  listAddons,
  listSkills,
  missingAddons,
  missingSkills,
  TARGETS,
  uninstallAddons,
  uninstallSkills,
  type Target,
} from "./handlers";
import { runContribute, runListLocal, runLogout, type ContributeInput } from "./agent";

export const PORT = 47653;
/** Capabilities of this plugin build. The web page checks them to detect an outdated plugin on a machine. */
const FEATURES = ["install", "uninstall", "addons-live", "agent-contribute"];
const ALLOWED_ORIGINS = new Set(["https://minhdv-zz.github.io"]);
const ALLOWED_HOSTS = new Set(["127.0.0.1:" + PORT, "localhost:" + PORT]);

function setCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 10_000) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  // Block DNS-rebinding: only accept requests addressed to loopback on our port.
  if (!ALLOWED_HOSTS.has(String(req.headers.host))) return send(res, 403, { error: "Bad host" });
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: "Origin not allowed" });
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = (req.url ?? "/").split("?")[0];

  if (path.startsWith("/agent/")) {
    // Reserved for local tools (the agent's curl). Browsers always send an Origin header on cross-origin
    // requests and a custom header forces a CORS preflight that is never approved, so web pages cannot use it.
    if (origin || req.headers["x-team-skills"] !== "1") return send(res, 403, { error: "Not allowed" });
    const plain = (status: number, text: string) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(text);
    };
    if (req.method === "GET" && path === "/agent/list") {
      const r = await runListLocal();
      return plain(r.isError ? 422 : 200, r.text);
    }
    if (req.method === "POST" && path === "/agent/contribute") {
      const r = await runContribute((await readJson(req)) as unknown as ContributeInput);
      return plain(r.isError ? 422 : 200, r.text);
    }
    if (req.method === "POST" && path === "/agent/logout") {
      const r = runLogout();
      return plain(200, r.text);
    }
    return send(res, 404, { error: "Not found" });
  }

  if (req.method === "GET" && path === "/status") {
    const { skills } = await listSkills();
    // Addons are optional: a failure here must not break the skills tab.
    let blender: Awaited<ReturnType<typeof listAddons>> = { live: false, versions: [], addons: [] };
    try {
      blender = await listAddons();
    } catch {
      /* keep empty */
    }
    return send(res, 200, { ok: true, plugin: "team-skills", features: FEATURES, skills, blender });
  }

  if (req.method === "POST" && path === "/uninstall") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const target = body.target as Target;
    if (!TARGETS.includes(target)) return send(res, 400, { error: "Invalid target" });
    if (!Array.isArray(body.names) || body.names.length === 0) return send(res, 400, { error: "Provide names" });
    const removed = await uninstallSkills(body.names.map((n) => String(n)), target);
    return send(res, 200, { ok: true, removed });
  }

  if (req.method === "POST" && path === "/uninstall-addon") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    if (!Array.isArray(body.names) || body.names.length === 0) return send(res, 400, { error: "Provide names" });
    const result = await uninstallAddons(body.names.map((n) => String(n)), String(body.version ?? ""));
    return send(res, 200, { ok: true, removed: result.paths, via: result.via });
  }

  if (req.method === "POST" && path === "/install-addon") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const version = String(body.version ?? "");
    let names: string[];
    if (Array.isArray(body.names)) {
      names = body.names.map((n) => String(n));
    } else if (body.mode === "missing") {
      names = await missingAddons(version);
    } else if (body.mode === "all") {
      names = await allAddonNames();
    } else {
      return send(res, 400, { error: "Provide names or mode" });
    }
    const result = await installAddons(names, version);
    return send(res, 200, { ok: true, installed: names, ...result });
  }

  if (req.method === "POST" && path === "/install") {
    // Installing writes files, so only the allowed web page may do it.
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const target = body.target as Target;
    if (!TARGETS.includes(target)) return send(res, 400, { error: "Invalid target" });

    let names: string[];
    if (Array.isArray(body.names)) {
      names = body.names.map((n) => String(n));
    } else if (body.mode === "missing") {
      names = await missingSkills(target);
    } else if (body.mode === "all") {
      names = await allSkillNames();
    } else {
      return send(res, 400, { error: "Provide names or mode" });
    }
    const paths = await installSkills(names, target);
    return send(res, 200, { ok: true, installed: names, paths });
  }

  return send(res, 404, { error: "Not found" });
}

/** Starts the loopback HTTP endpoint used by the team-skills web page. Returns a cleanup. */
export function startHttp(): () => void {
  const server: Server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });
  server.on("error", (e) => {
    console.error("[team-skills] HTTP endpoint not started: " + (e instanceof Error ? e.message : String(e)));
  });
  server.listen(PORT, "127.0.0.1");
  return () => {
    server.close();
  };
}
