// Cloudflare Worker của Team Tools.
//  1) Đếm sao theo tên máy, không cần đăng nhập. KV binding STARS, khoá "m:<key>|<machine>" = "1".
//  2) Tab "Tài khoản Tripo": mọi endpoint POST /tripo/* cần header X-Pass = mật khẩu nhóm.
//     Secret (đặt bằng `wrangler secret put`, KHÔNG ghi vào repo):
//       TRIPO_PASS     mật khẩu nhóm để vào tab
//       TRIPO_ENC_KEY  chuỗi ngẫu nhiên dài, dùng mã hóa mật khẩu từng tài khoản (AES-GCM)
//     KV: "tripo:accounts" = JSON mảng tài khoản, "tripo:ev:YYYYMM" = JSON mảng sự kiện của tháng đó.
//     Không dùng API Tripo: ai thấy tài khoản hết credit thì bấm "Đã hết", trang đếm theo tháng.
const ORIGIN = "https://minhdv-zz.github.io";
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // chỉ bật khi chạy thử (wrangler dev --var DEV_ORIGIN_OK:1), bản thật không có
const MAX_ACCOUNTS = 200;
const MAX_ADD = 20;          // mỗi lần thêm (gói free: 50 thao tác KV mỗi request)
const USING_HOURS = 12;      // tài khoản "đang dùng" quá số giờ này thì được cấp lại khi có người bấm Lấy
const MAX_EVENTS = 3000;     // mỗi tháng
const MAX_FAILS = 10, FAIL_TTL = 900; // nhập sai 10 lần trong 15 phút thì khoá IP

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const validKey = (v) => typeof v === "string" && v.length <= 100 && /^(skills|addons):[A-Za-z0-9._-]+$/.test(v);
const validMachine = (v) => typeof v === "string" && v.length > 0 && v.length <= 64 && !v.includes("|");

// ---------- sao ----------
async function all(env) {
  const out = []; let cursor;
  do {
    const r = await env.STARS.list({ prefix: "m:", cursor });
    out.push(...r.keys.map((k) => k.name.slice(2)));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out;
}

async function stars(req, env, url) {
  if (req.method === "GET" && url.pathname === "/stars") {
    const me = url.searchParams.get("machine") || "";
    // Lưu ý: GET được cache 30s theo URL (kèm machine).
    const st = {};
    for (const e of await all(env)) {
      const i = e.lastIndexOf("|"); const key = e.slice(0, i), machine = e.slice(i + 1);
      const s = (st[key] ||= { n: 0, mine: false });
      s.n++; if (machine === me) s.mine = true;
    }
    const r = json({ stars: st });
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
  return null;
}

// ---------- mã hóa ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ""; for (const c of u8) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("tripo-enc:" + env.TRIPO_ENC_KEY));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(text)));
  return b64(iv) + "." + b64(ct);
}
async function unseal(env, s) {
  const [iv, ct] = s.split(".");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct)));
}
async function same(a, b) { // so sánh thời gian không đổi
  const k = await crypto.subtle.importKey("raw", enc.encode("cmp"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([crypto.subtle.sign("HMAC", k, enc.encode(a)), crypto.subtle.sign("HMAC", k, enc.encode(b))]);
  const A = new Uint8Array(x), B = new Uint8Array(y); let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
}

// ---------- dữ liệu ----------
const monthOf = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 7); // giờ Việt Nam, "YYYY-MM"
const getAccounts = async (env) => (await env.STARS.get("tripo:accounts", "json")) || [];
const putAccounts = (env, a) => env.STARS.put("tripo:accounts", JSON.stringify(a));
const evKey = (m) => "tripo:ev:" + m.replace("-", "");
// Ghi nhật ký một lần cho cả loạt (KV chỉ cho 1 lần ghi/giây trên cùng khoá). Lỗi nhật ký không làm hỏng thao tác chính.
async function logEvs(env, items, who) {
  if (!items.length) return;
  try {
    const k = evKey(monthOf(Date.now())), t = Date.now();
    const list = (await env.STARS.get(k, "json")) || [];
    for (const [type, acc] of items) list.push({ t, type, email: acc.email, who: who || "" });
    await env.STARS.put(k, JSON.stringify(list.slice(-MAX_EVENTS)));
  } catch { /* bỏ qua */ }
}
const pub = (a) => ({ id: a.id, email: a.email, note: a.note || "", status: a.status, usedBy: a.usedBy || "", usedAt: a.usedAt || 0,
  addedBy: a.addedBy || "", addedAt: a.addedAt || 0, emptyAt: a.emptyAt || 0 });
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const validId = (v) => typeof v === "string" && /^[a-f0-9]{10}$/.test(v);
const newId = () => [...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, "0")).join("");

async function stats(env) {
  const now = Date.now(), months = [];
  for (let i = 0; i < 6; i++) { const d = new Date(now + 7 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const lists = await Promise.all(months.map((m) => env.STARS.get(evKey(m), "json")));
  const out = months.map((m, i) => {
    const ev = lists[i] || [];
    return { month: m, emptied: new Set(ev.filter((e) => e.type === "empty").map((e) => e.email)).size, claimed: ev.filter((e) => e.type === "claim").length };
  });
  return { months: out, recent: (lists[0] || []).slice(-30).reverse() };
}

// ---------- /tripo/* ----------
async function auth(req, env) {
  if (!env.TRIPO_PASS || !env.TRIPO_ENC_KEY) return json({ error: "Server chưa cấu hình mật khẩu" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?", rl = "tripo:rl:" + ip;
  // Lớp 1: Cloudflare Rate Limiting (binding TRIPO_RL, đếm nguyên tử), giới hạn số request mỗi IP.
  if (env.TRIPO_RL) {
    const { success } = await env.TRIPO_RL.limit({ key: ip });
    if (!success) return json({ error: "Thao tác quá nhanh, đợi một phút rồi thử lại" }, 429);
  }
  // Lớp 2: khoá IP sau nhiều lần sai. KV không nguyên tử nên chỉ là lớp phụ, mật khẩu nhóm phải dài và ngẫu nhiên.
  let n = 0;
  try { n = parseInt((await env.STARS.get(rl)) || "0", 10); } catch { /* bỏ qua */ }
  if (n >= MAX_FAILS) return json({ error: "Nhập sai quá nhiều lần, thử lại sau 15 phút" }, 429);
  if (!(await same(req.headers.get("X-Pass") || "", env.TRIPO_PASS))) {
    try { await env.STARS.put(rl, String(n + 1), { expirationTtl: FAIL_TTL }); } catch { /* bỏ qua */ }
    return json({ error: "Sai mật khẩu" }, 401);
  }
  return null;
}

async function tripo(req, env, url) {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  const o = req.headers.get("Origin");
  if (o !== ORIGIN && !(env.DEV_ORIGIN_OK === "1" && o && DEV_ORIGIN.test(o))) return json({ error: "origin" }, 403);
  const bad = await auth(req, env); if (bad) return bad;
  let b; try { b = await req.json(); } catch { b = {}; }
  if (!b || typeof b !== "object") b = {};
  const who = str(b.who, 40), op = url.pathname.slice(7);

  if (op === "list") return json({ accounts: (await getAccounts(env)).map(pub), stats: await stats(env) });

  if (op === "add") {
    const items = Array.isArray(b.items) ? b.items.slice(0, MAX_ADD) : [];
    const accs = await getAccounts(env), added = [], skipped = [];
    for (const it of items) {
      const email = str(it && it.email, 120), password = str(it && it.password, 200);
      if (!email || !password) { skipped.push(email || "(trống)"); continue; }
      if (accs.some((a) => a.email.toLowerCase() === email.toLowerCase())) { skipped.push(email + " (đã có)"); continue; }
      if (accs.length >= MAX_ACCOUNTS) { skipped.push(email + " (quá giới hạn)"); continue; }
      const a = { id: newId(), email, note: str(it.note, 200), status: "ok", usedBy: "", usedAt: 0, addedBy: who, addedAt: Date.now(),
        emptyAt: 0, secret: await seal(env, password) };
      accs.push(a); added.push(a);
    }
    if (added.length) { await putAccounts(env, accs); await logEvs(env, added.map((a) => ["add", a]), who); }
    return json({ added: added.length, skipped, accounts: accs.map(pub), stats: await stats(env) });
  }

  if (op === "claim") {
    const accs = await getAccounts(env);
    // chọn tài khoản còn dùng được, lâu chưa ai dùng nhất (chưa dùng bao giờ thì xếp đầu).
    // Tài khoản "đang dùng" quá USING_HOURS giờ coi như bị bỏ quên, được cấp lại.
    const stale = Date.now() - USING_HOURS * 3600e3;
    const pick = accs.filter((a) => a.status === "ok" || (a.status === "using" && (a.usedAt || 0) < stale))
      .sort((x, y) => (x.usedAt || 0) - (y.usedAt || 0))[0];
    if (!pick) return json({ error: "Hết tài khoản còn dùng được" }, 409);
    const password = await unseal(env, pick.secret); // giải mã trước, lỗi thì chưa đổi trạng thái
    pick.status = "using"; pick.usedBy = who; pick.usedAt = Date.now();
    await putAccounts(env, accs); await logEvs(env, [["claim", pick]], who);
    return json({ account: pub(pick), email: pick.email, password });
  }

  if (!validId(b.id)) return json({ error: "bad id" }, 400);
  const accs = await getAccounts(env), i = accs.findIndex((x) => x.id === b.id), a = accs[i];
  if (!a) return json({ error: "không thấy tài khoản" }, 404);

  if (op === "update") {
    let ev = null;
    if (b.status !== undefined) {
      if (!["ok", "using", "empty"].includes(b.status)) return json({ error: "bad status" }, 400);
      if (b.status === "empty" && a.status !== "empty") { a.emptyAt = Date.now(); ev = "empty"; }
      if (b.status === "using") { a.usedBy = who; a.usedAt = Date.now(); }
      if (b.status === "ok") a.usedBy = "";
      a.status = b.status;
    }
    if (b.note !== undefined) a.note = str(b.note, 200);
    await putAccounts(env, accs);
    if (ev) await logEvs(env, [[ev, a]], who);
    return json({ account: pub(a) });
  }

  if (op === "reveal") return json({ email: a.email, password: await unseal(env, a.secret) });

  if (op === "delete") {
    accs.splice(i, 1);
    await putAccounts(env, accs); await logEvs(env, [["del", a]], who);
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), o = req.headers.get("Origin");
    const allow = o === ORIGIN || (env.DEV_ORIGIN_OK === "1" && o && url.pathname.startsWith("/tripo/") && DEV_ORIGIN.test(o)) ? o : ORIGIN;
    const cors = { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Pass", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await stars(req, env, url);
      if (!res && url.pathname.startsWith("/tripo/")) { res = await tripo(req, env, url); res.headers.set("Cache-Control", "no-store"); }
      if (!res) res = json({ error: "not found" }, 404);
    } catch (e) {
      res = json({ error: "lỗi server" }, 500);
    }
    const h = new Headers(res.headers); for (const k in cors) h.set(k, cors[k]);
    return new Response(res.body, { status: res.status, headers: h });
  },
};
