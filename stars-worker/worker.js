// Cloudflare Worker: đếm sao theo tên máy, không cần đăng nhập.
// KV binding: STARS. Khoá: "m:<key>|<machine>" = "1".
const ORIGIN = "https://minhdv-zz.github.io";
const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const validKey = (v) => typeof v === "string" && v.length <= 100 && /^(skills|addons):[A-Za-z0-9._-]+$/.test(v);
const validMachine = (v) => typeof v === "string" && v.length > 0 && v.length <= 64 && !v.includes("|");

async function all(env) {
  const out = []; let cursor;
  do {
    const r = await env.STARS.list({ prefix: "m:", cursor });
    out.push(...r.keys.map((k) => k.name.slice(2)));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && url.pathname === "/stars") {
      const me = url.searchParams.get("machine") || "";
      // Lưu ý: GET được cache 30s theo URL (kèm machine).
      const stars = {};
      for (const e of await all(env)) {
        const i = e.lastIndexOf("|"); const key = e.slice(0, i), machine = e.slice(i + 1);
        const st = (stars[key] ||= { n: 0, mine: false });
        st.n++; if (machine === me) st.mine = true;
      }
      const r = json({ stars });
      r.headers.set("Cache-Control", "public, max-age=30");
      return r;
    }
    if (req.method === "POST" && url.pathname === "/star") {
      if (req.headers.get("Origin") !== ORIGIN) return json({ error: "origin" }, 403);
      let b; try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
      if (!b || typeof b !== "object" || !validKey(b.key) || !validMachine(b.machine)) return json({ error: "bad input" }, 400);
      const k = "m:" + b.key + "|" + b.machine;
      if (b.on) await env.STARS.put(k, "1"); else await env.STARS.delete(k);
      return json({ ok: true }); // client giữ số lạc quan: KV list không nhất quán ngay lập tức
    }
    return json({ error: "not found" }, 404);
  },
};
