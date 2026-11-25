// Cloudflare Worker của Team Tools.
//  1) Đếm sao theo tên máy, không cần đăng nhập. KV binding STARS, khoá "m:<key>|<machine>" = "1".
//  2) Tab "Tài khoản Tripo": mọi endpoint POST /tripo/* cần header X-Email = Gmail nằm trong danh sách thành viên
//     (KV "tripo:members", admin sửa trong tab). Admin = chủ (ADMIN_EMAIL) + admin phụ (KV "tripo:admins", quyền ngang chủ, cấp được cho người khác): thêm/xóa tài khoản, xem danh sách đầy đủ.
//     Phải đúng CẢ HAI: Gmail trong danh sách + mật khẩu nhóm (header X-Pass = secret TRIPO_PASS).
//     Secret (đặt bằng `wrangler secret put`, KHÔNG ghi vào repo):
//       TRIPO_PASS     mật khẩu nhóm để vào tab
//       TRIPO_ENC_KEY  chuỗi ngẫu nhiên dài, dùng mã hóa mật khẩu từng tài khoản (AES-GCM)
//     Chống đoán Gmail: Durable Object `Guard` (đếm nguyên tử, đếm TRƯỚC khi so mật khẩu nên bắn song song cũng không lách được).
//     KV: "tripo:accounts" = JSON mảng tài khoản, "tripo:ev:YYYYMM" = JSON mảng sự kiện của tháng đó.
//     Không dùng API Tripo: ai thấy tài khoản hết credit thì bấm "Đã hết", trang đếm theo tháng.
import { DurableObject } from "cloudflare:workers";

const ORIGIN = "https://minhdv-zz.github.io";
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // chỉ bật khi chạy thử (wrangler dev --var DEV_ORIGIN_OK:1), bản thật không có
const ADMIN_EMAIL = "minhdv@horusvn.com";
const MAX_MEMBERS = 200;
const MAX_ACCOUNTS = 200;
const MAX_ADD = 20;          // mỗi lần thêm (gói free: 50 thao tác KV mỗi request)
const MAX_EVENTS = 3000;     // mỗi tháng
// Chống đoán mật khẩu (xem class Guard). Mỗi lượt thử giữ một "chỗ" trước khi so mật khẩu; đúng thì trả chỗ, sai thì thành một lần sai.
// KHÓA VĨNH VIỄN: một IP sai IP_MAX lần (IPv6 gộp theo /64) bị chặn hẳn; cả hệ thống sai GLOBAL_MAX lần thì khóa mọi lượt thử.
// Chỉ chủ Worker mở lại được, bằng mã TRIPO_ADMIN (xem endpoint /admin/*). Số lần sai chỉ tính trong cửa sổ FAIL_WINDOW_S.
const IP_MAX = 10, GLOBAL_MAX = 30, FAIL_WINDOW_S = 24 * 60 * 60;
const PENDING_STALE_S = 60;   // lượt giữ chỗ quá lâu mà chưa có kết quả (Worker bị ngắt giữa chừng) thì tính là lần sai

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
// credit nằm ở khóa KV riêng (bản đồ id -> {c, t}) để không ghi đè danh sách tài khoản khi nhiều người thao tác cùng lúc
const getCredits = async (env) => (await env.STARS.get("tripo:credits", "json")) || {};
const pub = (a, cm) => ({ id: a.id, email: a.email, note: a.note || "", status: a.status, usedBy: a.usedBy || "", usedAt: a.usedAt || 0,
  addedBy: a.addedBy || "", addedAt: a.addedAt || 0, emptyAt: a.emptyAt || 0,
  credit: cm && cm[a.id] ? cm[a.id].c : null, creditAt: cm && cm[a.id] ? cm[a.id].t : 0 });
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
  // Mỗi tài khoản đã có những ai lấy, gộp theo người: nhật ký cũ ghi tên ngắn ("tet"), bản mới ghi email ("tet@horusvn.com") nên lấy phần trước @ và hạ chữ thường làm khóa.
  // claimBy[email tài khoản] = [{ n: tên, c: số lần lấy, t: lần lấy gần nhất }], người lấy gần đây nhất đứng đầu. Tính trên cả 6 tháng nhật ký.
  const claimBy = {}, claimers = {};
  for (const ev of lists) for (const e of ev || []) if (e.type === "claim" && e.who) {
    const n = String(e.who).split("@")[0].trim().toLowerCase(); if (!n) continue;
    const arr = (claimBy[e.email] = claimBy[e.email] || []); let r = arr.find((x) => x.n === n);
    if (!r) arr.push(r = { n, c: 0, t: 0 });
    r.c++; if (e.t > r.t) r.t = e.t;
  }
  for (const k in claimBy) { claimBy[k].sort((x, y) => y.t - x.t); claimers[k] = claimBy[k].map((x) => x.n); }
  return { months: out, recent: (lists[0] || []).slice(-30).reverse(), claimers, claimBy };
}

// ---------- /tripo/* ----------
// IPv6 gộp theo /64: bung dạng nén "::" cho đủ 8 nhóm rồi lấy 4 nhóm đầu, để không đổi địa chỉ trong cùng một dải mà né giới hạn.
function ipKey(ip) {
  const s = ip.toLowerCase();
  if (!s.includes(":")) return s;
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return m[1];
  let g;
  const i = s.indexOf("::");
  if (i >= 0) {
    const head = s.slice(0, i).split(":").filter(Boolean), tail = s.slice(i + 2).split(":").filter(Boolean), fill = 8 - head.length - tail.length;
    if (fill < 0) return "v6:" + s;
    g = head.concat(Array(fill).fill("0"), tail);
  } else g = s.split(":");
  const n = g.slice(0, 4).map((x) => parseInt(x, 16));
  return n.some(Number.isNaN) ? "v6:" + s : "v6:" + n.map((x) => x.toString(16)).join(":");
}

const LOCKED_MSG = "Đã khóa vì nhập sai quá nhiều lần. Liên hệ người quản lý để mở khóa.";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const normEmail = (v) => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 120) : "");
const getMembers = async (env) => (await env.STARS.get("tripo:members", "json")) || [];
// Admin phụ (do chủ cấp, KV "tripo:admins"): luôn nằm trong danh sách thành viên. Chủ (ADMIN_EMAIL) là admin gốc, không nằm trong KV.
const getAdmins = async (env) => (await env.STARS.get("tripo:admins", "json")) || [];

async function auth(req, env) {
  if (!env.TRIPO_PASS || !env.TRIPO_ENC_KEY || !env.GUARD) return { bad: json({ error: "Server chưa cấu hình" }, 503) }; // thiếu GUARD thì đóng cổng, không mở
  const ip = ipKey(req.headers.get("CF-Connecting-IP") || "?");
  // Lớp phụ (xấp xỉ): giới hạn số request mỗi IP bằng Cloudflare Rate Limiting.
  if (env.TRIPO_RL) {
    const { success } = await env.TRIPO_RL.limit({ key: ip });
    if (!success) return { bad: json({ error: "Thao tác quá nhanh, đợi một phút rồi thử lại" }, 429) };
  }
  const guard = env.GUARD.get(env.GUARD.idFromName("tripo"));
  const r = await guard.reserve(ip);
  if (!r.ok) return { bad: r.locked ? json({ error: LOCKED_MSG }, 423) : json({ error: "Thao tác quá nhanh, đợi một lúc rồi thử lại" }, 429) };
  const email = normEmail(req.headers.get("X-Email") || "");
  const owner = email === ADMIN_EMAIL;
  let good = owner, admin = owner;
  if (!good && EMAIL_RE.test(email)) { try { const [m, ad] = await Promise.all([getMembers(env), getAdmins(env)]); good = m.includes(email); admin = good && ad.includes(email); } catch { good = false; admin = false; } }
  const passOk = await same(req.headers.get("X-Pass") || "", env.TRIPO_PASS);
  good = good && passOk;   // cần đủ cả Gmail trong danh sách lẫn mật khẩu nhóm
  try { await guard.settle(r.ids, good); }
  catch { try { await guard.settle(r.ids, good); } catch { /* vẫn lỗi thì lượt giữ chỗ tự thành lần sai sau PENDING_STALE_S, an toàn hơn */ } }
  return good ? { email, admin } : { bad: json({ error: "Gmail hoặc mật khẩu không đúng" }, 401) };
}

// Durable Object (SQLite) đếm lượt thử và giữ trạng thái khóa. Mỗi hàm chạy đồng bộ từ đầu đến cuối nên không có chen ngang.
export class Guard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS f (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL)"); // kind: p = đang xử lý, f = đã sai
    this.sql.exec("CREATE INDEX IF NOT EXISTS f_scope_t ON f (scope, t)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS lk (scope TEXT PRIMARY KEY, t INTEGER NOT NULL)");
  }
  win() { return (this.env.DEV_ORIGIN_OK === "1" && this.env.GUARD_TEST_WINDOW_S ? Number(this.env.GUARD_TEST_WINDOW_S) || FAIL_WINDOW_S : FAIL_WINDOW_S) * 1000; } // biến thử chỉ có tác dụng khi chạy trên máy (cùng cờ DEV_ORIGIN_OK)
  one(q, ...a) { return this.sql.exec(q, ...a).one(); }
  reserve(ip) {
    const now = Date.now(), w = this.win();
    if (this.one("SELECT COUNT(*) c FROM lk WHERE scope IN ('g', ?)", "ip:" + ip).c) return { ok: false, locked: true };
    this.sql.exec("UPDATE f SET kind = 'f' WHERE kind = 'p' AND t < ?", now - PENDING_STALE_S * 1000);
    this.sql.exec("DELETE FROM f WHERE t < ?", now - w);
    const a = this.one("SELECT COUNT(*) c FROM f WHERE scope = ?", "ip:" + ip).c, g = this.one("SELECT COUNT(*) c FROM f WHERE scope = 'g'").c;
    if (a >= IP_MAX || g >= GLOBAL_MAX) return { ok: false, locked: false }; // quá nhiều lượt đang xử lý cùng lúc: chặn tạm, chưa khóa hẳn
    const i1 = this.one("INSERT INTO f (scope, t, kind) VALUES (?, ?, 'p') RETURNING id", "ip:" + ip, now).id;
    const i2 = this.one("INSERT INTO f (scope, t, kind) VALUES ('g', ?, 'p') RETURNING id", now).id;
    return { ok: true, ids: [i1, i2] };
  }
  settle(ids, good) {
    if (!Array.isArray(ids)) return;
    const now = Date.now();
    for (const id of ids.slice(0, 2)) {
      if (!Number.isInteger(id)) continue;
      if (good) {
        const sc = this.sql.exec("SELECT scope FROM f WHERE id = ?", id).toArray()[0];
        this.sql.exec("DELETE FROM f WHERE id = ?", id);
        if (sc && sc.scope !== "g") this.sql.exec("DELETE FROM f WHERE scope = ? AND kind = 'f'", sc.scope); // gõ nhầm trước đó của IP này không cộng dồn mãi
        continue;
      }
      this.sql.exec("UPDATE f SET kind = 'f' WHERE id = ?", id);
      const row = this.sql.exec("SELECT scope FROM f WHERE id = ?", id).toArray()[0];
      if (!row) continue;
      const max = row.scope === "g" ? GLOBAL_MAX : IP_MAX;
      if (this.one("SELECT COUNT(*) c FROM f WHERE scope = ? AND kind = 'f'", row.scope).c >= max) {
        this.sql.exec("INSERT OR IGNORE INTO lk (scope, t) VALUES (?, ?)", row.scope, now);
      }
    }
  }
  status() {
    return { locks: this.sql.exec("SELECT scope, t FROM lk ORDER BY t").toArray(),
      fails: this.sql.exec("SELECT scope, COUNT(*) n FROM f WHERE kind = 'f' GROUP BY scope ORDER BY n DESC").toArray() };
  }
  unlock() { this.sql.exec("DELETE FROM lk"); this.sql.exec("DELETE FROM f"); return this.status(); }
}

// /admin/status và /admin/unlock: chỉ chủ Worker, cần header X-Admin = secret TRIPO_ADMIN (chuỗi ngẫu nhiên dài). Không đếm lần sai vì mã đủ dài để không đoán được.
async function admin(req, env, url) {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  if (!env.TRIPO_ADMIN || env.TRIPO_ADMIN.length < 24 || !env.GUARD) return json({ error: "Chưa cấu hình" }, 503); // mã quá ngắn thì không dùng
  if (!(await same(req.headers.get("X-Admin") || "", env.TRIPO_ADMIN))) return json({ error: "Sai mã quản trị" }, 401);
  const guard = env.GUARD.get(env.GUARD.idFromName("tripo")), op = url.pathname.slice(7);
  if (op === "status") return json(await guard.status());
  if (op === "unlock") return json(await guard.unlock());
  return json({ error: "not found" }, 404);
}

async function tripo(req, env, url) {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  const o = req.headers.get("Origin");
  if (o !== ORIGIN && !(env.DEV_ORIGIN_OK === "1" && o && DEV_ORIGIN.test(o))) return json({ error: "origin" }, 403);
  const au = await auth(req, env); if (au.bad) return au.bad;
  let b; try { b = await req.json(); } catch { b = {}; }
  if (!b || typeof b !== "object") b = {};
  const who = au.email, isAdmin = au.admin, op = url.pathname.slice(7);
  const cm = isAdmin || op === "credit" || op === "list" ? await getCredits(env) : {};   // chỉ đọc khi cần (thành viên thường không dùng số credit)
  // Người không phải chủ chỉ thấy id + trạng thái: không có email, ghi chú, người dùng, credit của tài khoản.
  // Thành viên thấy email + số credit của các tài khoản CÒN token (theo yêu cầu chủ), không thấy ghi chú/người dùng/mật khẩu; tài khoản đã hết thì vẫn ẩn email.
  const P = isAdmin ? (a) => pub(a, cm) : (a) => { const live = a.status !== "empty"; return ({ id: a.id, email: live ? a.email : "", note: "", status: a.status, usedBy: "", usedAt: a.usedAt || 0, addedBy: "", addedAt: a.addedAt || 0, emptyAt: a.emptyAt || 0, credit: live && cm[a.id] ? cm[a.id].c : null, creditAt: live && cm[a.id] ? cm[a.id].t : 0 }); };
  const adminOnly = ["add", "delete", "members", "members_set"];
  if (adminOnly.includes(op) && !isAdmin) return json({ error: "Chỉ admin làm được việc này" }, 403);

  if (op === "list") {
    const [st, accs, members, admins] = await Promise.all([stats(env), getAccounts(env), isAdmin ? getMembers(env) : null, isAdmin ? getAdmins(env) : null]);   // đọc song song, không nối đuôi nhau
    return json({ admin: isAdmin, accounts: accs.map(P), stats: isAdmin ? st : { months: st.months, recent: [] }, members: members || undefined, admins: admins || undefined });
  }

  if (op === "members") return json({ members: await getMembers(env), admins: await getAdmins(env) });
  if (op === "members_set") {
    if (!Array.isArray(b.items)) return json({ error: "Thiếu danh sách" }, 400);
    const raw = b.items, out = [];
    for (const it of raw.slice(0, 1000)) { const e = normEmail(it); if (EMAIL_RE.test(e) && e !== ADMIN_EMAIL && !out.includes(e)) out.push(e); }
    if (out.length > MAX_MEMBERS) return json({ error: "Quá " + MAX_MEMBERS + " thành viên" }, 400);
    // Mọi admin (kể cả admin phụ) đều cấp/thu hồi được admin, quyền ngang chủ. Chủ (ADMIN_EMAIL) không nằm trong danh sách nên không bị gỡ. Bỏ người đã bị xóa khỏi thành viên.
    let adm = await getAdmins(env);
    if (Array.isArray(b.admins)) adm = b.admins.map(normEmail);
    adm = adm.filter((e, i) => out.includes(e) && adm.indexOf(e) === i);
    await env.STARS.put("tripo:members", JSON.stringify(out));
    await env.STARS.put("tripo:admins", JSON.stringify(adm));
    return json({ members: out, admins: adm });
  }

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
    return json({ added: added.length, skipped, accounts: accs.map(P), stats: await stats(env) });
  }

  if (op === "claim") {
    const accs = await getAccounts(env);
    // Cả nhóm dùng chung một tài khoản cho tới khi nó bị đánh dấu "đã hết": còn tài khoản "đang dùng" thì cấp lại đúng tài khoản đó
    // (nếu có nhiều, lấy cái dùng gần nhất). Chỉ khi không còn cái nào đang dùng mới lấy tài khoản còn dùng được kế tiếp (thêm vào sớm nhất).
    const cur = accs.filter((a) => a.status === "using").sort((x, y) => (y.usedAt || 0) - (x.usedAt || 0))[0];
    const pick = cur || accs.filter((a) => a.status === "ok")
      .sort((x, y) => (x.addedAt || 0) - (y.addedAt || 0) || x.email.localeCompare(y.email))[0];
    if (!pick) return json({ error: "Hết tài khoản còn dùng được" }, 409);
    const password = await unseal(env, pick.secret); // giải mã trước, lỗi thì chưa đổi trạng thái
    pick.status = "using"; pick.usedBy = who; pick.usedAt = Date.now();
    await putAccounts(env, accs); await logEvs(env, [["claim", pick]], who);
    return json({ account: P(pick), email: pick.email, password });
  }

  if (!validId(b.id)) return json({ error: "bad id" }, 400);
  const accs = await getAccounts(env), i = accs.findIndex((x) => x.id === b.id), a = accs[i];
  if (!a) return json({ error: "không thấy tài khoản" }, 404);

  if (op === "update") {
    if (!isAdmin && (b.note !== undefined || b.status !== "empty")) return json({ error: "Chỉ admin đổi được mục này" }, 403); // thành viên thường chỉ được báo "đã hết token"
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
    return json({ account: P(a) });
  }

  // Số credit đọc từ trang Tripo (userscript đọc, trang Team Tools gửi lên). Chỉ nhận số nguyên hợp lý.
  if (op === "credit") {
    const c = b.credit, now = Date.now();
    if (!Number.isInteger(c) || c < 0 || c > 10000000) return json({ error: "bad credit" }, 400);
    // thời điểm đọc do script gửi lên (để "x phút trước" đúng thật); không hợp lý thì dùng giờ hiện tại
    const at = Number.isInteger(b.at) && b.at <= now + 60e3 && b.at >= now - 3600e3 ? Math.min(b.at, now) : now;
    const old = cm[a.id];
    if (!old || old.c !== c || at - old.t > 60e3) {   // cùng số và còn mới (dưới 60 giây) thì khỏi ghi lại
      cm[a.id] = { c, t: at };
      await env.STARS.put("tripo:credits", JSON.stringify(cm));
    }
    return json({ credit: cm[a.id].c, creditAt: cm[a.id].t });
  }

  // Chọn tài khoản cả nhóm sẽ dùng (tích trong hộp Lấy tài khoản): tài khoản này thành "đang dùng", cái đang dùng trước đó về "còn dùng được".
  if (op === "select") {
    if (a.status === "empty") return json({ error: "Tài khoản này đã hết token" }, 409);
    const password = await unseal(env, a.secret); // giải mã trước, lỗi thì chưa đổi trạng thái
    for (const x of accs) if (x.status === "using" && x.id !== a.id) { x.status = "ok"; x.usedBy = ""; }
    a.status = "using"; a.usedBy = who; a.usedAt = Date.now();
    await putAccounts(env, accs); await logEvs(env, [["claim", a]], who);
    return json({ account: P(a), email: a.email, password });
  }
  if (op === "reveal" && !isAdmin && a.status !== "using") return json({ error: "Chỉ xem được tài khoản đang dùng chung" }, 403);
  if (op === "reveal") return json({ email: a.email, password: await unseal(env, a.secret) });

  if (op === "delete") {
    accs.splice(i, 1);
    await putAccounts(env, accs);
    if (cm[a.id]) { delete cm[a.id]; await env.STARS.put("tripo:credits", JSON.stringify(cm)).catch(() => {}); } await logEvs(env, [["del", a]], who);
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), o = req.headers.get("Origin");
    const allow = o === ORIGIN || (env.DEV_ORIGIN_OK === "1" && o && url.pathname.startsWith("/tripo/") && DEV_ORIGIN.test(o)) ? o : ORIGIN;
    const cors = { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Email, X-Pass", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await stars(req, env, url);
      if (!res && url.pathname.startsWith("/tripo/")) { res = await tripo(req, env, url); res.headers.set("Cache-Control", "no-store"); }
      if (!res && url.pathname.startsWith("/admin/")) { res = await admin(req, env, url); res.headers.set("Cache-Control", "no-store"); }
      if (!res) res = json({ error: "not found" }, 404);
    } catch (e) {
      res = json({ error: "lỗi server" }, 500);
    }
    const h = new Headers(res.headers); for (const k in cors) h.set(k, cors[k]);
    return new Response(res.body, { status: res.status, headers: h });
  },
};
