// standalone/main.ts
import { createInterface } from "node:readline";

// server/agent.ts
import { cpSync as cpSync2, existsSync as existsSync3, mkdtempSync as mkdtempSync2, readFileSync as readFileSync3, realpathSync, rmSync as rmSync3, statSync as statSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir3, tmpdir as tmpdir2 } from "node:os";
import { basename, isAbsolute as isAbsolute2, join as join3, resolve } from "node:path";

// server/handlers.ts
import { execFileSync } from "node:child_process";
import { cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, mkdtempSync, readdirSync as readdirSync2, readFileSync as readFileSync2, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { createConnection } from "node:net";
import { homedir as homedir2, tmpdir } from "node:os";
import { join as join2 } from "node:path";

// server/contribute.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
var CLIENT_ID = "Ov23liAkygpxdyD0Snri";
var REPOS = {
  skill: { repo: "minhdv-zz/team-skills", base: (n) => `plugins/${n}/skills/${n}` },
  addon: { repo: "minhdv-zz/team-blender-addons", base: (n) => `addons/${n}` }
};
var NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
function extraDirs(key) {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".team-skills", "config.json"), "utf8").replace(/^\uFEFF/, ""));
    const list = cfg?.[key];
    if (!Array.isArray(list)) return [];
    return list.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.startsWith("~") ? join(homedir(), x.slice(1)) : x).filter((x) => isAbsolute(x));
  } catch {
    return [];
  }
}
function skillDirs() {
  const codex = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills");
  return [.../* @__PURE__ */ new Set([join(homedir(), ".claude", "skills"), join(homedir(), ".claude-api", "skills"), codex, ...extraDirs("skillDirs")])];
}
function hashDir(root) {
  const h = createHash("sha1");
  try {
    for (const f of walk(root).sort((a, b) => a.rel < b.rel ? -1 : 1)) {
      h.update(f.rel + "\0");
      if (f.size <= 5 * 1024 * 1024) h.update(readFileSync(f.abs));
      else h.update(String(f.size));
    }
  } catch {
  }
  return h.digest("hex").slice(0, 12);
}
function isDirLink(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function listDirs(root) {
  try {
    return readdirSync(root, { withFileTypes: true }).filter((d) => !d.name.startsWith(".") && (d.isDirectory() || d.isSymbolicLink() && isDirLink(join(root, d.name)))).map((d) => d.name);
  } catch {
    return [];
  }
}
function findSkillSource(name) {
  for (const root of skillDirs()) {
    const p = join(root, name);
    if (existsSync(join(p, "SKILL.md"))) return p;
  }
  return null;
}
function findAddonSource(name, roots) {
  for (const root of roots) {
    const p = join(root, name);
    if (existsSync(join(p, "__init__.py")) || existsSync(join(p, "blender_manifest.toml"))) return p;
  }
  return null;
}
var BAD_EXT_SKILL = /* @__PURE__ */ new Set([".exe", ".dll", ".msi", ".bat", ".cmd", ".com", ".scr", ".so", ".dylib", ".apk", ".jar"]);
var BINARY_EXT_ADDON = /* @__PURE__ */ new Set([".dll", ".pyd", ".so", ".dylib", ".exe", ".msi", ".bat", ".cmd"]);
var TEXT_EXT = /* @__PURE__ */ new Set([".md", ".txt", ".json", ".py", ".ps1", ".sh", ".js", ".ts", ".toml", ".yml", ".yaml", ".cfg", ".ini", ".csv", ".xml", ".html"]);
var LICENSE_NAMES = /* @__PURE__ */ new Set(["license", "license.md", "license.txt", "copying", "copying.md", "copying.txt"]);
var SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, "private key"],
  [/\bghp_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/, "GitHub token"],
  [/\bsk-[A-Za-z0-9_-]{32,}\b/, "API key (sk-...)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, "hard-coded credential"]
];
var MAX_FILES = 600;
var MAX_TOTAL = 40 * 1024 * 1024;
function walk(root) {
  const out = [];
  const rec = (dir, rel) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === ".git" || d.name === "__pycache__" || d.name === "node_modules") continue;
      const abs = join(dir, d.name);
      const r = rel ? rel + "/" + d.name : d.name;
      if (d.isDirectory()) rec(abs, r);
      else if (d.isFile() && !d.name.endsWith(".pyc")) {
        try {
          out.push({ rel: r, abs, size: statSync(abs).size });
        } catch {
        }
      }
    }
  };
  rec(root, "");
  return out;
}
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}
function addonAuthor(src) {
  const init = join(src, "__init__.py");
  if (existsSync(init)) {
    const m = /["']author["']\s*:\s*["']([^"']+)["']/.exec(readFileSync(init, "utf8"));
    if (m && m[1].trim()) return m[1].trim();
  }
  const mf = join(src, "blender_manifest.toml");
  if (existsSync(mf)) {
    const m = /^(?:maintainer|author)\s*=\s*"([^"]+)"/m.exec(readFileSync(mf, "utf8"));
    if (m) return m[1].replace(/\s*<[^>]*>/, "").trim();
  }
  return "";
}
function checkContribution(kind, name, src) {
  const issues = [];
  const err = (message) => issues.push({ level: "error", message });
  const warn = (message) => issues.push({ level: "warning", message });
  if (!NAME_RE.test(name)) err("T\xEAn ph\u1EA3i g\u1ED3m 2-64 k\xFD t\u1EF1 ch\u1EEF, s\u1ED1, '-' ho\u1EB7c '_'.");
  const files = walk(src);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (files.length === 0) err("Th\u01B0 m\u1EE5c r\u1ED7ng.");
  if (files.length > MAX_FILES) err(`C\xF3 ${files.length} file, v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${MAX_FILES}.`);
  if (total > MAX_TOTAL) err(`T\u1ED5ng dung l\u01B0\u1EE3ng ${(total / 1e6).toFixed(1)} MB v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${MAX_TOTAL / 1024 / 1024} MB.`);
  const perFile = kind === "skill" ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
  let author = "";
  let description = "";
  if (kind === "skill") {
    const md = join(src, "SKILL.md");
    if (!existsSync(md)) {
      err("Thi\u1EBFu SKILL.md.");
    } else {
      const fm = frontMatter(readFileSync(md, "utf8"));
      if (!fm) {
        err("SKILL.md ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng ph\u1EA7n ti\xEAu \u0111\u1EC1: --- name / description / author ---");
      } else {
        description = fm.description ?? "";
        author = fm.author ?? "";
        if (!fm.description) err("Ti\xEAu \u0111\u1EC1 SKILL.md thi\u1EBFu 'description'.");
        if (!fm.author) err("Ti\xEAu \u0111\u1EC1 SKILL.md thi\u1EBFu 'author:' (t\xEAn ng\u01B0\u1EDDi \u0111\xF3ng g\xF3p), \u0111\u1EC3 m\u1ECDi ng\u01B0\u1EDDi bi\u1EBFt skill c\u1EE7a ai.");
        if (fm.name !== name) err(`Ti\xEAu \u0111\u1EC1 SKILL.md c\xF3 name '${fm.name ?? ""}' nh\u01B0ng ph\u1EA3i tr\xF9ng t\xEAn th\u01B0 m\u1EE5c '${name}'.`);
      }
    }
  } else {
    if (!existsSync(join(src, "__init__.py")) && !existsSync(join(src, "blender_manifest.toml"))) {
      err("Addon c\u1EA7n __init__.py ho\u1EB7c blender_manifest.toml ngay trong th\u01B0 m\u1EE5c.");
    }
    author = addonAuthor(src);
    if (!author) err("Addon ch\u01B0a c\xF3 t\xEAn t\xE1c gi\u1EA3 (bl_info 'author' ho\u1EB7c maintainer trong blender_manifest.toml).");
    if (!readdirSync(src).some((f) => LICENSE_NAMES.has(f.toLowerCase()))) {
      err("Thi\u1EBFu file gi\u1EA5y ph\xE9p (LICENSE). Ch\u1EC9 nh\u1EADn addon mi\u1EC5n ph\xED v\xE0 \u0111\u01B0\u1EE3c ph\xE9p chia s\u1EBB l\u1EA1i.");
    }
  }
  for (const f of files) {
    const ext = f.rel.includes(".") ? "." + f.rel.split(".").pop().toLowerCase() : "";
    if (f.size > perFile) err(`${f.rel}: ${(f.size / 1e6).toFixed(1)} MB v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${perFile / 1024 / 1024} MB.`);
    if (kind === "skill" && BAD_EXT_SKILL.has(ext)) err(`${f.rel}: kh\xF4ng nh\u1EADn file ch\u1EA1y ho\u1EB7c c\xE0i \u0111\u1EB7t trong skill.`);
    if (kind === "addon" && BINARY_EXT_ADDON.has(ext)) warn(`${f.rel}: file bi\xEAn d\u1ECBch, ng\u01B0\u1EDDi duy\u1EC7t s\u1EBD ki\u1EC3m tra ngu\u1ED3n g\u1ED1c.`);
    if (TEXT_EXT.has(ext) && f.size <= 2 * 1024 * 1024) {
      const text = readFileSync(f.abs, "utf8");
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(text)) err(`${f.rel}: c\xF3 v\u1EBB ch\u1EE9a ${label}. H\xE3y x\xF3a tr\u01B0\u1EDBc khi g\u1EEDi.`);
      }
      const abs = /\b[A-Za-z]:[\/](?!Windows\b|Program Files\b)[^\s"'`)\]]{3,}/.exec(text);
      if (abs) warn(`${f.rel}: c\xF3 \u0111\u01B0\u1EDDng d\u1EABn ri\xEAng c\u1EE7a m\xE1y b\u1EA1n (v\xED d\u1EE5 ${abs[0].slice(0, 60)}). N\xEAn thay b\u1EB1ng \u0111\u01B0\u1EDDng d\u1EABn chung ho\u1EB7c \u0111\u1EC3 skill h\u1ECFi ng\u01B0\u1EDDi d\xF9ng.`);
    }
  }
  return { files, issues, author, description };
}
var OWNER_LOGIN = "minhdv-zz";
var SESSION_FILE = join(homedir(), ".team-skills", "owner-session.json");
function loadSavedSession() {
  try {
    const j = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
    if (j && typeof j.token === "string" && String(j.login).toLowerCase() === OWNER_LOGIN) {
      return { token: j.token, login: String(j.login), expiresAt: Date.now() + 3650 * 864e5 };
    }
  } catch {
  }
  return null;
}
function saveSession(s) {
  if (s.login.toLowerCase() !== OWNER_LOGIN) return;
  try {
    mkdirSync(join(homedir(), ".team-skills"), { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify({ token: s.token, login: s.login }), { mode: 384 });
    try {
      chmodSync(SESSION_FILE, 384);
    } catch {
    }
  } catch {
  }
}
var session = loadSavedSession();
var pending = null;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function logout() {
  const had = session !== null || pending !== null;
  try {
    rmSync(SESSION_FILE, { force: true });
  } catch {
  }
  session = null;
  pending = null;
  return had;
}
function pendingLogin() {
  return pending && pending.expiresAt > Date.now() ? { code: pending.userCode, url: pending.verificationUri } : null;
}
function currentLogin() {
  return session && session.expiresAt > Date.now() + 6e4 ? session.login : null;
}
async function ghForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "team-skills-plugin" },
    body: new URLSearchParams(params).toString()
  });
  return res.json();
}
function openUrl(url) {
  if (!/^https:\/\/github\.com\//.test(url)) return;
  if (process.platform === "win32") execFile("rundll32", ["url.dll,FileProtocolHandler", url], () => {
  });
  else if (process.platform === "darwin") execFile("open", [url], () => {
  });
  else execFile("xdg-open", [url], () => {
  });
}
async function startDeviceFlow() {
  const dc = await ghForm("https://github.com/login/device/code", { client_id: CLIENT_ID, scope: "public_repo" });
  if (!dc.device_code) throw new Error("GitHub kh\xF4ng c\u1EA5p m\xE3 \u0111\u0103ng nh\u1EADp: " + JSON.stringify(dc).slice(0, 200));
  const expiresAt = Date.now() + Number(dc.expires_in ?? 900) * 1e3;
  let interval = Number(dc.interval ?? 5);
  const done = (async () => {
    while (Date.now() < expiresAt) {
      await sleep(interval * 1e3);
      const r = await ghForm("https://github.com/login/oauth/access_token", {
        client_id: CLIENT_ID,
        device_code: String(dc.device_code),
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      });
      if (r.access_token) {
        const u = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer " + r.access_token, Accept: "application/vnd.github+json", "User-Agent": "team-skills-plugin" }
        }).then((x) => x.json());
        const s = {
          token: String(r.access_token),
          login: String(u.login),
          // OAuth App tokens do not expire (no expires_in); keep them for the life of the plugin process.
          expiresAt: Date.now() + Number(r.expires_in ?? 3650 * 86400) * 1e3
        };
        session = s;
        saveSession(s);
        return s;
      }
      if (r.error === "slow_down") interval += 5;
      else if (r.error === "authorization_pending") continue;
      else return null;
    }
    return null;
  })();
  done.catch(() => {
  });
  return { userCode: String(dc.user_code), verificationUri: String(dc.verification_uri), expiresAt, done };
}
async function ensureSession(waitMs) {
  if (session && session.expiresAt > Date.now() + 6e4) return { session, message: "" };
  if (!pending || pending.expiresAt < Date.now()) {
    pending = await startDeviceFlow();
    openUrl(pending.verificationUri);
  }
  const p = pending;
  const result = await Promise.race([p.done, sleep(waitMs).then(() => "timeout")]);
  if (result === "timeout") {
    return {
      session: null,
      message: `C\u1EA7n \u0111\u0103ng nh\u1EADp GitHub. \u0110\xE3 m\u1EDF trang ${p.verificationUri} trong tr\xECnh duy\u1EC7t. Nh\u1EADp m\xE3 **${p.userCode}**, b\u1EA5m Authorize, r\u1ED3i b\xE1o l\u1EA1i \u0111\u1EC3 ti\u1EBFp t\u1EE5c (g\u1ECDi l\u1EA1i c\xF4ng c\u1EE5 n\xE0y).`
    };
  }
  if (result === null) {
    pending = null;
    return { session: null, message: "\u0110\u0103ng nh\u1EADp GitHub kh\xF4ng th\xE0nh c\xF4ng ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n. H\xE3y th\u1EED l\u1EA1i." };
  }
  pending = null;
  return { session: result, message: "" };
}
async function api(s, method, path, body) {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + s.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "team-skills-plugin",
      ...body ? { "Content-Type": "application/json" } : {}
    },
    body: body ? JSON.stringify(body) : void 0
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
  }
  return { status: res.status, json };
}
function must(r, what) {
  if (r.status >= 200 && r.status < 300) return r.json;
  throw new Error(`${what} th\u1EA5t b\u1EA1i (HTTP ${r.status}): ${String(r.json?.message ?? "").slice(0, 200)}`);
}
async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}
async function submitContribution(opts) {
  const { kind, name, files, author, description, issues, replace, s } = opts;
  const { repo: upstream, base } = REPOS[kind];
  const basePath = base(name);
  const repoInfo = must(await api(s, "GET", `/repos/${upstream}`), "\u0110\u1ECDc th\xF4ng tin repo");
  const defaultBranch = repoInfo.default_branch;
  const canPush = Boolean(repoInfo.permissions?.push);
  const exists = (await api(s, "GET", `/repos/${upstream}/contents/${basePath}?ref=${encodeURIComponent(defaultBranch)}`)).status === 200;
  if (exists && !replace) {
    throw new Error(`'${name}' \u0111\xE3 c\xF3 trong kho chung. N\u1EBFu mu\u1ED1n g\u1EEDi b\u1EA3n c\u1EADp nh\u1EADt, h\xE3y g\u1ECDi l\u1EA1i v\u1EDBi replace_existing=true.`);
  }
  let work = upstream;
  if (!canPush) {
    const fork = must(await api(s, "POST", `/repos/${upstream}/forks`, { default_branch_only: true }), "T\u1EA1o b\u1EA3n sao (fork)");
    work = String(fork.full_name);
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      ready = (await api(s, "GET", `/repos/${work}/git/ref/heads/${encodeURIComponent(defaultBranch)}`)).status === 200;
      if (!ready) await sleep(2e3);
    }
    if (!ready) throw new Error("B\u1EA3n sao (fork) ch\u01B0a s\u1EB5n s\xE0ng, h\xE3y th\u1EED l\u1EA1i sau \xEDt ph\xFAt.");
    await api(s, "POST", `/repos/${work}/merge-upstream`, { branch: defaultBranch });
  }
  const headRef = must(await api(s, "GET", `/repos/${work}/git/ref/heads/${encodeURIComponent(defaultBranch)}`), "\u0110\u1ECDc nh\xE1nh ch\xEDnh");
  const baseSha = headRef.object.sha;
  const baseCommit = must(await api(s, "GET", `/repos/${work}/git/commits/${baseSha}`), "\u0110\u1ECDc commit g\u1ED1c");
  const baseTree = baseCommit.tree.sha;
  const tree = [];
  await pool(files, 4, async (f) => {
    const blob = must(
      await api(s, "POST", `/repos/${work}/git/blobs`, { content: readFileSync(f.abs).toString("base64"), encoding: "base64" }),
      `T\u1EA3i l\xEAn ${f.rel}`
    );
    tree.push({ path: `${basePath}/${f.rel}`, mode: "100644", type: "blob", sha: String(blob.sha) });
  });
  tree.sort((a, b) => a.path.localeCompare(b.path));
  const newTree = must(await api(s, "POST", `/repos/${work}/git/trees`, { base_tree: baseTree, tree }), "T\u1EA1o c\xE2y th\u01B0 m\u1EE5c");
  const commit = must(
    await api(s, "POST", `/repos/${work}/git/commits`, {
      message: `${exists ? "Update" : "Add"} ${kind} ${name} (by ${author})`,
      tree: newTree.sha,
      parents: [baseSha]
    }),
    "T\u1EA1o commit"
  );
  const branch = `contrib/${name}-${Date.now().toString(36)}`;
  must(await api(s, "POST", `/repos/${work}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha }), "T\u1EA1o nh\xE1nh");
  const warnings = issues.filter((i) => i.level === "warning").map((i) => `- ${i.message}`);
  const body = [
    `**Lo\u1EA1i:** ${kind === "skill" ? "Skill" : "Addon Blender"}`,
    `**T\xEAn:** \`${name}\``,
    `**T\xE1c gi\u1EA3 khai b\xE1o:** ${author}`,
    `**T\xE0i kho\u1EA3n GitHub g\u1EEDi:** [${s.login}](https://github.com/${s.login})`,
    description ? `**M\xF4 t\u1EA3:** ${description}` : "",
    `**File:** ${files.length}`,
    "",
    "G\u1EEDi t\u1EF1 \u0111\u1ED9ng t\u1EEB Team Skills (plugin Paseo ho\u1EB7c ch\u01B0\u01A1ng tr\xECnh \u0111\u1ED9c l\u1EADp).",
    warnings.length ? "\n**C\u1EA3nh b\xE1o khi ki\u1EC3m tra c\u1EE5c b\u1ED9:**\n" + warnings.join("\n") : "",
    "",
    "**Ng\u01B0\u1EDDi duy\u1EC7t:** \u0111\xE2y l\xE0 m\xE3/h\u01B0\u1EDBng d\u1EABn s\u1EBD ch\u1EA1y tr\xEAn m\xE1y ng\u01B0\u1EDDi c\xE0i. H\xE3y \u0111\u1ECDc k\u1EF9 n\u1ED9i dung tr\u01B0\u1EDBc khi g\u1ED9p."
  ].filter((l) => l !== "").join("\n");
  const pr = must(
    await api(s, "POST", `/repos/${upstream}/pulls`, {
      title: `[${kind === "skill" ? "Skill" : "Addon"}] ${name} - ${author}`,
      head: work === upstream ? branch : `${s.login}:${branch}`,
      base: defaultBranch,
      body,
      maintainer_can_modify: true
    }),
    "M\u1EDF Pull Request"
  );
  return { prUrl: String(pr.html_url), branch, direct: work === upstream };
}

// server/handlers.ts
var SITE = "https://minhdv-zz.github.io/team-skills";
var SKILLS_ZIP = "https://codeload.github.com/minhdv-zz/team-skills/zip/refs/heads/main";
var ADDONS_ZIP = "https://codeload.github.com/minhdv-zz/team-blender-addons/zip/refs/heads/main";
var ZIP_HOSTS = /* @__PURE__ */ new Set(["drive.horusvn.com"]);
var BLENDER_PORT = 9876;
var TARGETS = ["claude", "claude-api", "codex"];
var TARGET_DIRS = { claude: ".claude", "claude-api": ".claude-api", codex: ".codex" };
function skillsDir(target) {
  if (target === "codex") return join2(process.env.CODEX_HOME || join2(homedir2(), TARGET_DIRS.codex), "skills");
  return join2(homedir2(), TARGET_DIRS[target], "skills");
}
function installedVersion(dir) {
  try {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync2(join2(dir, "SKILL.md"), "utf8"));
    return /^version[ \t]*:[ \t]*(.*)$/m.exec(m?.[1] ?? "")?.[1].trim().replace(/^['"]|['"]$/g, "").slice(0, 40) ?? "";
  } catch {
    return "";
  }
}
async function fetchJson(file) {
  const res = await fetch(SITE + "/" + file + "?t=" + Date.now());
  if (!res.ok) throw new Error("Cannot load " + file + " (HTTP " + res.status + ")");
  return await res.json();
}
function winTar() {
  return join2(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
}
async function fetchRepo(url, tmp) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed (HTTP " + res.status + ")");
  const zipPath = join2(tmp, "repo.zip");
  writeFileSync2(zipPath, Buffer.from(await res.arrayBuffer()));
  const out = join2(tmp, "x");
  mkdirSync2(out);
  if (process.platform === "win32") {
    execFileSync(winTar(), ["-xf", zipPath, "-C", out]);
  } else {
    execFileSync("unzip", ["-q", zipPath, "-d", out]);
  }
  return join2(out, readdirSync2(out)[0]);
}
async function listSkills() {
  const list = await fetchJson("skills.json");
  return {
    skills: list.map((s) => ({
      name: s.name,
      title: s.title,
      desc: s.desc,
      needs: s.needs ?? [],
      version: s.version ?? "",
      installed: {
        claude: existsSync2(join2(skillsDir("claude"), s.name)),
        "claude-api": existsSync2(join2(skillsDir("claude-api"), s.name)),
        codex: existsSync2(join2(skillsDir("codex"), s.name))
      },
      installedVersion: {
        claude: installedVersion(join2(skillsDir("claude"), s.name)),
        "claude-api": installedVersion(join2(skillsDir("claude-api"), s.name)),
        codex: installedVersion(join2(skillsDir("codex"), s.name))
      }
    }))
  };
}
async function installSkills(names, target) {
  if (!TARGETS.includes(target)) throw new Error("Invalid target: " + String(target));
  const list = await fetchJson("skills.json");
  const allowed = new Set(list.map((s) => s.name));
  for (const n of names) if (!allowed.has(n)) throw new Error("Unknown skill: " + n);
  if (names.length === 0) return [];
  const tmp = mkdtempSync(join2(tmpdir(), "team-skills-"));
  try {
    const root = await fetchRepo(SKILLS_ZIP, tmp);
    const destRoot = skillsDir(target);
    mkdirSync2(destRoot, { recursive: true });
    const done = [];
    for (const name of names) {
      const src = join2(root, "plugins", name, "skills", name);
      if (!existsSync2(src)) throw new Error("Skill folder not found in repository: " + name);
      const dest = join2(destRoot, name);
      rmSync2(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      done.push(dest);
    }
    return done;
  } finally {
    rmSync2(tmp, { recursive: true, force: true });
  }
}
async function missingSkills(target) {
  const { skills } = await listSkills();
  return skills.filter((s) => !s.installed[target]).map((s) => s.name);
}
async function allSkillNames() {
  return (await listSkills()).skills.map((s) => s.name);
}
function blenderCall(type, params, timeoutMs) {
  return new Promise((resolve2, reject) => {
    const sock = createConnection({ host: "127.0.0.1", port: BLENDER_PORT });
    let buf = "";
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("Blender did not answer in time"))), timeoutMs);
    sock.on("connect", () => sock.write(JSON.stringify({ type, params })));
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      try {
        const msg = JSON.parse(buf);
        finish(() => resolve2(msg));
      } catch {
      }
    });
    sock.on("error", (e) => finish(() => reject(e)));
  });
}
async function blenderRun(code, timeoutMs = 3e4) {
  const r = await blenderCall("execute_code", { code }, timeoutMs);
  if (r.status !== "success") throw new Error("Blender: " + String(r.message ?? "error").slice(0, 400));
  return String(r.result?.result ?? "");
}
async function liveBlender() {
  try {
    const ping = await blenderCall("ping", {}, 1500);
    if (ping.status !== "success") return null;
    const out = await blenderRun(
      [
        "import bpy, os, json",
        "p = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)",
        "print(json.dumps({'version': '%d.%d' % tuple(bpy.app.version[:2]), 'path': p, 'dirs': sorted(os.listdir(p))}))"
      ].join("\n"),
      8e3
    );
    const j = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    return { version: String(j.version), addonsPath: String(j.path), dirs: j.dirs ?? [] };
  } catch {
    return null;
  }
}
async function enableInBlender(folder) {
  const code = [
    "import bpy, addon_utils, json",
    "folder = " + JSON.stringify(folder),
    "res = {'enabled': False, 'note': ''}",
    "try:",
    "    mods = {m.__name__: m for m in addon_utils.modules(refresh=True)}",
    "    mod = mods.get(folder)",
    "    active = set(bpy.context.preferences.addons.keys())",
    "    if mod is None:",
    "        res['note'] = 'Blender did not find the addon after copying'",
    "    elif folder in active:",
    "        res['enabled'] = True; res['note'] = 'already enabled'",
    "    else:",
    "        disp = getattr(mod, 'bl_info', {}).get('name')",
    "        dup = [n for n, m in mods.items() if n != folder and n in active and disp and getattr(m, 'bl_info', {}).get('name') == disp]",
    "        if dup:",
    "            res['note'] = 'not enabled: an addon with the same name is already enabled (' + dup[0] + ')'",
    "        else:",
    "            addon_utils.enable(folder, default_set=True, persistent=True)",
    "            res['enabled'] = folder in set(bpy.context.preferences.addons.keys())",
    "            res['note'] = '' if res['enabled'] else 'enable failed, see the Blender console'",
    "            try:",
    "                bpy.ops.wm.save_userpref()",
    "            except Exception:",
    "                pass",
    "except Exception as e:",
    "    res['note'] = 'error: ' + str(e)[:200]",
    "print(json.dumps(res))"
  ].join("\n");
  try {
    const out = await blenderRun(code);
    const j = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    return { enabled: Boolean(j.enabled), note: String(j.note ?? "") };
  } catch (e) {
    return { enabled: false, note: e instanceof Error ? e.message : String(e) };
  }
}
function blenderRoot() {
  return join2(process.env.APPDATA ?? join2(homedir2(), "AppData", "Roaming"), "Blender Foundation", "Blender");
}
function blenderVersions() {
  try {
    return readdirSync2(blenderRoot(), { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d+\.\d+$/.test(d.name)).map((d) => d.name).sort((a, b) => {
      const [am, an] = a.split(".").map(Number);
      const [bm, bn] = b.split(".").map(Number);
      return bm - am || bn - an;
    });
  } catch {
    return [];
  }
}
function addonsDir(version) {
  return join2(blenderRoot(), version, "scripts", "addons");
}
async function installableAddons() {
  return (await fetchJson("addons.json")).filter((a) => !a.link || a.zip);
}
async function knownAddons() {
  return fetchJson("addons.json");
}
var folderOf = (a) => a.folder ?? a.name;
async function listAddons() {
  const live = await liveBlender();
  const versions = live ? [live.version] : blenderVersions();
  const list = await knownAddons();
  return {
    /** True when a running Blender answered on the MCP socket; installs then go through it. */
    live: live !== null,
    versions,
    addons: list.map((a) => ({
      name: a.name,
      title: a.title,
      desc: a.desc,
      license: a.license ?? "",
      needs: a.needs ?? [],
      installed: Object.fromEntries(
        versions.map((v) => [v, live ? live.dirs.includes(folderOf(a)) : existsSync2(join2(addonsDir(v), folderOf(a)))])
      )
    }))
  };
}
async function fetchZip(url, folder, tmp) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ZIP_HOSTS.has(u.hostname)) throw new Error("Download host not allowed: " + u.hostname);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed (HTTP " + res.status + ")");
  const zipPath = join2(tmp, folder + ".zip");
  writeFileSync2(zipPath, Buffer.from(await res.arrayBuffer()));
  const tar = winTar();
  const listing = execFileSync(tar, ["-tf", zipPath], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const entry of listing) {
    const norm = entry.split("\\").join("/");
    if (norm.startsWith("/") || /^[A-Za-z]:/.test(norm) || norm.split("/").includes("..")) throw new Error("Unsafe path in zip: " + entry);
    if (norm.split("/")[0] !== folder) throw new Error("Zip must contain only the folder '" + folder + "' (found '" + entry + "')");
  }
  const out = join2(tmp, "z-" + folder);
  mkdirSync2(out);
  execFileSync(tar, ["-xf", zipPath, "-C", out]);
  return out;
}
async function installAddons(names, version) {
  const live = await liveBlender();
  if (live ? version !== live.version : !blenderVersions().includes(version)) {
    throw new Error("Blender " + version + " not found on this machine");
  }
  const list = await installableAddons();
  const byName = new Map(list.map((a) => [a.name, a]));
  for (const n of names) if (!byName.has(n)) throw new Error("Unknown addon: " + n);
  if (names.length === 0) return { paths: [], via: live ? "blender" : "files", notes: [] };
  const tmp = mkdtempSync(join2(tmpdir(), "team-addons-"));
  try {
    const destRoot = live ? live.addonsPath : addonsDir(version);
    mkdirSync2(destRoot, { recursive: true });
    let repoRoot = null;
    const paths = [];
    const notes = [];
    for (const name of names) {
      const entry = byName.get(name);
      const folder = folderOf(entry);
      let src;
      if (entry.zip) {
        src = join2(await fetchZip(entry.zip, folder, tmp), folder);
      } else {
        repoRoot ??= await fetchRepo(ADDONS_ZIP, tmp);
        src = join2(repoRoot, "addons", name);
      }
      if (!existsSync2(src)) throw new Error("Addon folder not found: " + name);
      const dest = join2(destRoot, folder);
      rmSync2(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      paths.push(dest);
      if (live) {
        const r = await enableInBlender(folder);
        notes.push({ name, enabled: r.enabled, note: r.note });
      }
    }
    return { paths, via: live ? "blender" : "files", notes };
  } finally {
    rmSync2(tmp, { recursive: true, force: true });
  }
}
async function missingAddons(version) {
  const { addons } = await listAddons();
  return addons.filter((a) => !a.installed[version]).map((a) => a.name);
}
async function allAddonNames() {
  return (await listAddons()).addons.map((a) => a.name);
}
async function addonRoots() {
  const live = await liveBlender();
  const roots = live ? [live.addonsPath] : [];
  for (const v of blenderVersions()) roots.push(addonsDir(v));
  roots.push(...extraDirs("addonDirs"));
  return [...new Set(roots)];
}
async function teamNames() {
  const out = { skills: /* @__PURE__ */ new Set(), addons: /* @__PURE__ */ new Set() };
  try {
    for (const s of await fetchJson("skills.json")) out.skills.add(s.name);
    for (const a of await fetchJson("addons.json")) {
      out.addons.add(a.name);
      if (a.folder) out.addons.add(a.folder);
    }
  } catch {
  }
  return out;
}
function removeFolder(dest) {
  try {
    rmSync2(dest, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  } catch (e) {
    const code = e.code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new Error(
        "Kh\xF4ng x\xF3a \u0111\u01B0\u1EE3c v\xEC c\xF3 file \u0111ang \u0111\u01B0\u1EE3c d\xF9ng (" + code + "). H\xE3y \u0111\xF3ng Claude Code ho\u1EB7c Blender \u0111ang m\u1EDF r\u1ED3i th\u1EED l\u1EA1i. Th\u01B0 m\u1EE5c: " + dest
      );
    }
    throw e;
  }
}
async function uninstallSkills(names, target) {
  if (!TARGETS.includes(target)) throw new Error("Invalid target: " + String(target));
  const list = await fetchJson("skills.json");
  const allowed = new Set(list.map((s) => s.name));
  for (const n of names) if (!allowed.has(n)) throw new Error("Unknown skill: " + n);
  const removed = [];
  for (const name of names) {
    const dest = join2(skillsDir(target), name);
    if (existsSync2(dest)) {
      removeFolder(dest);
      removed.push(dest);
    }
  }
  return removed;
}
async function uninstallAddons(names, version) {
  const live = await liveBlender();
  if (live ? version !== live.version : !blenderVersions().includes(version)) {
    throw new Error("Blender " + version + " not found on this machine");
  }
  const list = await knownAddons();
  const byName = new Map(list.map((a) => [a.name, a]));
  for (const n of names) if (!byName.has(n)) throw new Error("Unknown addon: " + n);
  const destRoot = live ? live.addonsPath : addonsDir(version);
  const paths = [];
  for (const name of names) {
    const folder = folderOf(byName.get(name));
    const dest = join2(destRoot, folder);
    if (!existsSync2(dest)) continue;
    if (live) {
      await blenderRun(
        [
          "import bpy, addon_utils",
          "folder = " + JSON.stringify(folder),
          "try:",
          "    addon_utils.disable(folder, default_set=True)",
          "except Exception:",
          "    pass",
          "try:",
          "    bpy.ops.wm.save_userpref()",
          "except Exception:",
          "    pass",
          "print('ok')"
        ].join("\n")
      ).catch(() => "");
    }
    removeFolder(dest);
    paths.push(dest);
  }
  return { paths, via: live ? "blender" : "files" };
}

// server/review.ts
import { execFile as execFile2 } from "node:child_process";
var OWNER = "minhdv-zz";
var REPOS2 = /* @__PURE__ */ new Set([`${OWNER}/team-skills`, `${OWNER}/team-blender-addons`]);
async function gitSession(requireOwner = true) {
  const token = await new Promise((resolve2) => {
    const child = execFile2(
      "git",
      ["credential", "fill"],
      { timeout: 8e3, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } },
      (err, stdout) => {
        if (err) return resolve2("");
        const m = /^password=(.*)$/m.exec(String(stdout));
        resolve2(m ? m[1].trim() : "");
      }
    );
    child.stdin?.end("protocol=https\nhost=github.com\n\n");
  });
  if (!token) return null;
  const s = { token, login: "", expiresAt: Date.now() + 6e4 };
  const me = await api(s, "GET", "/user");
  if (me.status !== 200 || !me.json?.login) return null;
  if (requireOwner && String(me.json.login).toLowerCase() !== OWNER) return null;
  s.login = String(me.json.login);
  return s;
}
function outsideFiles(repo, files) {
  const prefix = repo.endsWith("team-skills") ? "plugins/" : "addons/";
  const roots = /* @__PURE__ */ new Set();
  for (const f of files) if (f.startsWith(prefix)) roots.add(f.split("/").slice(0, 2).join("/"));
  const first = [...roots][0];
  return files.filter((f) => roots.size !== 1 || !f.startsWith(first + "/"));
}
async function reviewPr(repo, number, action, allowOutside) {
  if (!REPOS2.has(repo) || !Number.isInteger(number) || number < 1) return { ok: false, error: "Y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7." };
  if (action !== "merge" && action !== "close") return { ok: false, error: "H\xE0nh \u0111\u1ED9ng kh\xF4ng h\u1EE3p l\u1EC7." };
  let session2 = await gitSession();
  if (!session2) {
    session2 = (await ensureSession(1500)).session;
    if (!session2) return { ok: false, login: pendingLogin() };
  }
  if (session2.login.toLowerCase() !== OWNER) {
    return { ok: false, error: `B\u1EA1n \u0111ang \u0111\u0103ng nh\u1EADp GitHub l\xE0 ${session2.login}. Ch\u1EC9 ch\u1EE7 repo (${OWNER}) m\u1EDBi duy\u1EC7t \u0111\u01B0\u1EE3c.` };
  }
  const pr = await api(session2, "GET", `/repos/${repo}/pulls/${number}`);
  if (pr.status === 401) {
    logout();
    return { ok: false, error: "Phi\xEAn \u0111\u0103ng nh\u1EADp GitHub \u0111\xE3 h\u1EBFt h\u1EA1n. B\u1EA5m l\u1EA1i \u0111\u1EC3 \u0111\u0103ng nh\u1EADp." };
  }
  if (pr.status !== 200) return { ok: false, error: `Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c Pull Request #${number} (HTTP ${pr.status}).` };
  if (pr.json.state !== "open") return { ok: false, error: `Pull Request #${number} kh\xF4ng c\xF2n \u1EDF tr\u1EA1ng th\xE1i m\u1EDF.` };
  if (action === "close") {
    const r = await api(session2, "PATCH", `/repos/${repo}/pulls/${number}`, { state: "closed" });
    if (r.status !== 200) return { ok: false, error: `Kh\xF4ng t\u1EEB ch\u1ED1i \u0111\u01B0\u1EE3c (HTTP ${r.status}): ${String(r.json?.message ?? "").slice(0, 200)}` };
    clearPendingCache();
    return { ok: true, done: "closed" };
  }
  const fl = await api(session2, "GET", `/repos/${repo}/pulls/${number}/files?per_page=100`);
  if (fl.status !== 200 || !Array.isArray(fl.json)) return { ok: false, error: `Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c danh s\xE1ch file (HTTP ${fl.status}).` };
  const outside = outsideFiles(repo, fl.json.map((f) => String(f.filename)));
  if (outside.length > 0 && !allowOutside) {
    return { ok: false, outside: outside.slice(0, 20), error: "Pull Request n\xE0y s\u1EEDa c\u1EA3 file ngo\xE0i th\u01B0 m\u1EE5c c\u1EE7a n\xF3." };
  }
  const sha = String(pr.json.head.sha);
  const runs = await api(session2, "GET", `/repos/${repo}/actions/runs?head_sha=${sha}&status=action_required`);
  if (runs.status === 200 && Array.isArray(runs.json?.workflow_runs)) {
    for (const run of runs.json.workflow_runs) await api(session2, "POST", `/repos/${repo}/actions/runs/${run.id}/approve`);
  }
  const m = await api(session2, "PUT", `/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash", sha });
  if (m.status !== 200) return { ok: false, error: `Kh\xF4ng g\u1ED9p \u0111\u01B0\u1EE3c (HTTP ${m.status}): ${String(m.json?.message ?? "").slice(0, 200)}` };
  clearPendingCache();
  return { ok: true, done: "merged" };
}
var cache = null;
async function listPending() {
  if (cache && Date.now() - cache.at < 2e4) return cache.list;
  const s = await gitSession();
  if (!s) return null;
  const out = [];
  for (const repo of REPOS2) {
    const r = await api(s, "GET", `/repos/${repo}/pulls?state=open&per_page=30`);
    if (r.status !== 200 || !Array.isArray(r.json)) throw new Error(`Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c ${repo} (HTTP ${r.status}).`);
    for (const p of r.json) {
      const f = await api(s, "GET", `/repos/${repo}/pulls/${p.number}/files?per_page=100`);
      const c = await api(s, "GET", `/repos/${repo}/commits/${p.head.sha}/check-runs`);
      out.push({
        repo,
        kind: repo.endsWith("team-skills") ? "Skill" : "Addon",
        n: p.number,
        title: String(p.title),
        user: String(p.user?.login ?? ""),
        url: String(p.html_url),
        sha: String(p.head.sha),
        at: String(p.created_at),
        files: Array.isArray(f.json) ? f.json.map((x) => String(x.filename)) : [],
        checks: c.status === 200 && Array.isArray(c.json?.check_runs) ? c.json.check_runs.map((x) => ({ status: String(x.status), conclusion: x.conclusion ?? null })) : null
      });
    }
  }
  cache = { at: Date.now(), list: out };
  return out;
}
function clearPendingCache() {
  cache = null;
}

// server/agent.ts
var reply = (text, isError = false) => ({ text, isError });
function skillInfo(dir) {
  try {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync3(join3(dir, "SKILL.md"), "utf8"));
    const get = (k) => new RegExp("^" + k + "[ 	]*:[ 	]*(.*)$", "m").exec(m?.[1] ?? "")?.[1].trim().replace(/^['"]|['"]$/g, "") ?? "";
    return { description: get("description").slice(0, 200), author: get("author"), version: get("version").slice(0, 40) };
  } catch {
    return { description: "", author: "", version: "" };
  }
}
async function localItems() {
  const team = await teamNames();
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const home = homedir3().split("\\").join("/");
  const byName = /* @__PURE__ */ new Map();
  const seenReal = /* @__PURE__ */ new Set();
  for (const root of skillDirs()) {
    for (const name of listDirs(root)) {
      const dir = join3(root, name);
      if (!NAME_RE.test(name) || !existsSync3(join3(dir, "SKILL.md"))) continue;
      let real = dir;
      try {
        real = realpathSync(dir);
      } catch {
      }
      if (seenReal.has(real.toLowerCase())) continue;
      seenReal.add(real.toLowerCase());
      const hash = hashDir(dir);
      const list = byName.get(name) ?? [];
      const same = list.find((i) => i.hash === hash);
      const path = dir.split("\\").join("/");
      if (same) {
        (same.copies ??= []).push(path);
        continue;
      }
      let mtime = 0;
      try {
        mtime = statSync2(join3(dir, "SKILL.md")).mtimeMs;
      } catch {
      }
      const rootSlash = root.split("\\").join("/");
      const source = rootSlash.toLowerCase().startsWith(home.toLowerCase()) ? "~" + rootSlash.slice(home.length) : rootSlash;
      const item = { kind: "skill", name, path, ...skillInfo(dir), shared: team.skills.has(name), hash, source, mtime };
      list.push(item);
      byName.set(name, list);
      out.push(item);
    }
  }
  for (const list of byName.values()) if (list.length > 1) for (const i of list) i.variants = list.length;
  for (const root of await addonRoots()) {
    for (const name of listDirs(root)) {
      const dir = join3(root, name);
      if (!NAME_RE.test(name) || seen.has("addon:" + name)) continue;
      if (!existsSync3(join3(dir, "__init__.py")) && !existsSync3(join3(dir, "blender_manifest.toml"))) continue;
      seen.add("addon:" + name);
      out.push({ kind: "addon", name, path: dir.split("\\").join("/"), description: "", author: "", shared: team.addons.has(name) });
    }
  }
  return out;
}
async function runListLocal() {
  const team = await teamNames();
  const skills = /* @__PURE__ */ new Map();
  for (const root of skillDirs()) for (const n of listDirs(root)) skills.set(n, team.skills.has(n));
  const addons = /* @__PURE__ */ new Map();
  for (const root of await addonRoots()) for (const n of listDirs(root)) if (NAME_RE.test(n)) addons.set(n, team.addons.has(n));
  const fmt = (m) => [...m].map(([n, shared]) => `- ${n}${shared ? " (\u0111\xE3 c\xF3 trong kho chung)" : ""}`).join("\n") || "(kh\xF4ng c\xF3)";
  return reply(
    `Skill trong ~/.claude/skills v\xE0 ~/.claude-api/skills:
${fmt(skills)}

Addon Blender tr\xEAn m\xE1y:
${fmt(addons)}

Skill n\u1EB1m trong th\u01B0 m\u1EE5c .claude/skills c\u1EE7a m\u1ED9t d\u1EF1 \xE1n th\xEC kh\xF4ng c\xF3 trong danh s\xE1ch n\xE0y, h\xE3y truy\u1EC1n path c\u1EE7a th\u01B0 m\u1EE5c skill.`
  );
}
async function runContribute(input) {
  const kind = input.kind;
  if (kind !== "skill" && kind !== "addon") return reply("kind ph\u1EA3i l\xE0 'skill' ho\u1EB7c 'addon'.", true);
  let src = null;
  let name = input.name?.trim() ?? "";
  if (input.path) {
    if (!isAbsolute2(input.path)) return reply("path ph\u1EA3i l\xE0 \u0111\u01B0\u1EDDng d\u1EABn tuy\u1EC7t \u0111\u1ED1i t\u1EDBi th\u01B0 m\u1EE5c skill/addon.", true);
    const p = resolve(input.path);
    if (!existsSync3(p) || !statSync2(p).isDirectory()) return reply(`Kh\xF4ng th\u1EA5y th\u01B0 m\u1EE5c: ${p}`, true);
    src = p;
    if (!name) name = basename(p);
    const ok = kind === "skill" ? existsSync3(resolve(p, "SKILL.md")) : existsSync3(resolve(p, "__init__.py")) || existsSync3(resolve(p, "blender_manifest.toml"));
    if (!ok) {
      return reply(kind === "skill" ? "Th\u01B0 m\u1EE5c n\xE0y kh\xF4ng c\xF3 SKILL.md." : "Th\u01B0 m\u1EE5c n\xE0y kh\xF4ng c\xF3 __init__.py ho\u1EB7c blender_manifest.toml.", true);
    }
  } else {
    if (!name) return reply("C\u1EA7n name ho\u1EB7c path.", true);
    if (!NAME_RE.test(name)) return reply("T\xEAn kh\xF4ng h\u1EE3p l\u1EC7. D\xF9ng 2-64 k\xFD t\u1EF1 g\u1ED3m ch\u1EEF, s\u1ED1, '-' ho\u1EB7c '_'.", true);
    src = kind === "skill" ? findSkillSource(name) : findAddonSource(name, await addonRoots());
    if (!src) {
      return reply(
        kind === "skill" ? `Kh\xF4ng th\u1EA5y skill '${name}' trong ~/.claude/skills ho\u1EB7c ~/.claude-api/skills. N\u1EBFu skill n\u1EB1m trong .claude/skills c\u1EE7a m\u1ED9t d\u1EF1 \xE1n, h\xE3y truy\u1EC1n path.` : `Kh\xF4ng th\u1EA5y addon '${name}' trong th\u01B0 m\u1EE5c addons c\u1EE7a Blender. Addon m\u1ED9t file .py ch\u01B0a \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3.`,
        true
      );
    }
  }
  if (!NAME_RE.test(name)) return reply(`T\xEAn '${name}' kh\xF4ng h\u1EE3p l\u1EC7. D\xF9ng 2-64 k\xFD t\u1EF1 g\u1ED3m ch\u1EEF, s\u1ED1, '-' ho\u1EB7c '_'.`, true);
  const checked = checkContribution(kind, name, src);
  const errors = checked.issues.filter((i) => i.level === "error");
  const warnings = checked.issues.filter((i) => i.level === "warning");
  const report = `Ngu\u1ED3n: ${src}
T\xEAn: ${name}
S\u1ED1 file: ${checked.files.length}
T\xE1c gi\u1EA3 khai b\xE1o: ${checked.author || "(ch\u01B0a c\xF3)"}
` + (errors.length ? `
L\u1ED6I c\u1EA7n s\u1EEDa tr\u01B0\u1EDBc khi g\u1EEDi:
${errors.map((i) => "- " + i.message).join("\n")}` : "") + (warnings.length ? `
C\u1EA2NH B\xC1O (n\xEAn d\u1ECDn tr\u01B0\u1EDBc khi g\u1EEDi):
${warnings.map((i) => "- " + i.message).join("\n")}` : "");
  if (errors.length) return reply(report + "\n\nCh\u01B0a g\u1EEDi g\xEC. H\xE3y s\u1EEDa c\xE1c l\u1ED7i tr\xEAn r\u1ED3i g\u1ECDi l\u1EA1i.");
  if (input.dry_run) return reply(report + "\n\nKi\u1EC3m tra \u0111\u1EA1t. Ch\u01B0a g\u1EEDi g\xEC (dry_run).");
  if (!input.share_confirmed) {
    return reply(
      report + "\n\nCH\u01AFA G\u1EECI. H\xE3y h\u1ECFi ng\u01B0\u1EDDi d\xF9ng: (1) \u0111\u1ED3ng \xFD c\xF4ng khai n\u1ED9i dung n\xE0y trong kho chung" + (kind === "addon" ? ", (2) addon n\xE0y mi\u1EC5n ph\xED v\xE0 gi\u1EA5y ph\xE9p cho ph\xE9p chia s\u1EBB l\u1EA1i" : "") + ". H\u1ECD \u0111\u1ED3ng \xFD th\xEC g\u1ECDi l\u1EA1i v\u1EDBi share_confirmed=true."
    );
  }
  const login = await ensureSession(9e4);
  if (!login.session) return reply(login.message);
  try {
    const r = await submitContribution({
      kind,
      name,
      files: checked.files,
      author: checked.author,
      description: checked.description,
      issues: checked.issues,
      replace: Boolean(input.replace_existing),
      s: login.session
    });
    return reply(
      `\u0110\xE3 g\u1EEDi \u0111\xF3ng g\xF3p t\u1EEB t\xE0i kho\u1EA3n GitHub '${login.session.login}'.
Pull Request: ${r.prUrl}
Ch\u1EE7 repo s\u1EBD duy\u1EC7t. Sau khi \u0111\u01B0\u1EE3c g\u1ED9p, danh s\xE1ch tr\xEAn trang web t\u1EF1 c\u1EADp nh\u1EADt trong v\xE0i ph\xFAt.`
    );
  } catch (e) {
    return reply("G\u1EEDi kh\xF4ng th\xE0nh c\xF4ng: " + (e instanceof Error ? e.message : String(e)), true);
  }
}
function runLogout() {
  const who = currentLogin();
  const had = logout();
  return reply(had ? `\u0110\xE3 \u0111\u0103ng xu\u1EA5t${who ? " t\xE0i kho\u1EA3n " + who : ""}.` : "Ch\u01B0a \u0111\u0103ng nh\u1EADp.");
}
function patchFrontMatter(text, name, author) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return text;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = m[1].split(/\r?\n/);
  const setLine = (key, value, onlyIfMissing) => {
    const i = lines.findIndex((l) => new RegExp("^" + key + "[ 	]*:").test(l));
    if (i >= 0) {
      if (!onlyIfMissing || !lines[i].split(":").slice(1).join(":").trim()) lines[i] = `${key}: ${value}`;
    } else lines.push(`${key}: ${value}`);
  };
  setLine("name", name, false);
  if (author) setLine("author", JSON.stringify(author), true);
  return "---" + nl + lines.join(nl) + nl + "---" + text.slice(m[0].length);
}
var recentSends = /* @__PURE__ */ new Map();
async function webContribute(input) {
  if (!input.confirm) return webContributeOnce(input);
  const key = String(input.path ?? "").split("\\").join("/");
  const prev = recentSends.get(key);
  if (prev && Date.now() - prev.at < 12e4) return prev.result;
  const result = webContributeOnce(input);
  recentSends.set(key, { at: Date.now(), result });
  const r = await result;
  if (r.ok !== true) recentSends.delete(key);
  return r;
}
async function webContributeOnce(input) {
  const wanted = String(input.path ?? "").split("\\").join("/");
  const it = (await localItems()).find((x) => x.path === wanted);
  if (!it) return { ok: false, error: "M\u1EE5c n\xE0y kh\xF4ng n\u1EB1m trong danh s\xE1ch qu\xE9t tr\xEAn m\xE1y. T\u1EA3i l\u1EA1i trang r\u1ED3i th\u1EED l\u1EA1i." };
  if (it.shared) return { ok: false, error: "M\u1EE5c n\xE0y \u0111\xE3 c\xF3 trong kho chung." };
  let tmp = null;
  try {
    let src = it.path;
    const author = String(input.author ?? "").trim().slice(0, 80);
    if (it.kind === "skill") {
      const text = readFileSync3(join3(src, "SKILL.md"), "utf8");
      const fixed = patchFrontMatter(text, it.name, author);
      if (fixed !== text) {
        tmp = mkdtempSync2(join3(tmpdir2(), "team-contrib-"));
        const dest = join3(tmp, it.name);
        cpSync2(src, dest, { recursive: true });
        writeFileSync3(join3(dest, "SKILL.md"), fixed);
        src = dest;
      }
    }
    const checked = checkContribution(it.kind, it.name, src);
    const errors = checked.issues.filter((i) => i.level === "error").map((i) => i.message);
    const warnings = checked.issues.filter((i) => i.level === "warning").map((i) => i.message);
    const base = { ok: true, kind: it.kind, name: it.name, files: checked.files.length, author: checked.author, description: checked.description, errors, warnings };
    if (!input.confirm) return { ...base, stage: "check" };
    if (errors.length) return { ...base, ok: false, error: "C\xF2n l\u1ED7i c\u1EA7n s\u1EEDa tr\u01B0\u1EDBc khi g\u1EEDi." };
    const gitS = await gitSession(false);
    const login = gitS ? { session: gitS } : await ensureSession(1500);
    if (!login.session) return { ok: false, login: pendingLogin() };
    const r = await submitContribution({
      kind: it.kind,
      name: it.name,
      files: checked.files,
      author: checked.author,
      description: checked.description,
      issues: checked.issues,
      replace: false,
      s: login.session
    });
    return { ...base, stage: "sent", prUrl: r.prUrl, as: login.session.login };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (tmp) rmSync3(tmp, { recursive: true, force: true });
  }
}

// server/http.ts
import { hostname } from "node:os";
import { createServer } from "node:http";

// server/remove.ts
var OWNER2 = "minhdv-zz";
var SKILLS_REPO = `${OWNER2}/team-skills`;
var ADDONS_REPO = `${OWNER2}/team-blender-addons`;
var NAME_RE2 = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
var ownerCache = null;
async function isOwner() {
  if (ownerCache && Date.now() - ownerCache.at < (ownerCache.value ? 6e5 : 12e4)) return ownerCache.value;
  let value = false;
  try {
    value = await gitSession() !== null;
  } catch {
    value = false;
  }
  ownerCache = { at: Date.now(), value };
  return value;
}
async function must2(s, method, path, body) {
  const r = await api(s, method, path, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`GitHub b\xE1o l\u1ED7i (HTTP ${r.status}) khi g\u1ECDi ${method} ${path.split("?")[0]}: ${String(r.json?.message ?? "").slice(0, 160)}`);
  return r.json;
}
async function readJsonFile(s, repo, path, ref) {
  const f = await must2(s, "GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  return JSON.parse(Buffer.from(String(f.content), "base64").toString("utf8"));
}
async function commitChange(s, repo, prefix, edits, message) {
  const info = await must2(s, "GET", `/repos/${repo}`);
  if (!info.permissions?.push) throw new Error(`T\xE0i kho\u1EA3n n\xE0y kh\xF4ng c\xF3 quy\u1EC1n ghi v\xE0o ${repo}.`);
  const branch = String(info.default_branch);
  const ref = await must2(s, "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = String(ref.object.sha);
  const head = await must2(s, "GET", `/repos/${repo}/git/commits/${headSha}`);
  const entries = [];
  let removed = 0;
  if (prefix) {
    const tree = await must2(s, "GET", `/repos/${repo}/git/trees/${headSha}?recursive=1`);
    if (tree.truncated) throw new Error("Th\u01B0 m\u1EE5c qu\xE1 l\u1EDBn \u0111\u1EC3 x\xF3a an to\xE0n b\u1EB1ng c\xE1ch n\xE0y.");
    for (const t of tree.tree) {
      if (t.type === "blob" && t.path.startsWith(prefix)) {
        entries.push({ path: t.path, mode: "100644", type: "blob", sha: null });
        removed++;
      }
    }
  }
  for (const e of await edits(branch)) entries.push({ path: e.path, mode: "100644", type: "blob", content: e.content });
  if (entries.length === 0) return 0;
  const newTree = await must2(s, "POST", `/repos/${repo}/git/trees`, { base_tree: head.tree.sha, tree: entries });
  const commit = await must2(s, "POST", `/repos/${repo}/git/commits`, { message, tree: newTree.sha, parents: [headSha] });
  await must2(s, "PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return removed;
}
var asJson = (v) => JSON.stringify(v, null, 2) + "\n";
async function removeItem(kind, name) {
  if (kind !== "skill" && kind !== "addon" || !NAME_RE2.test(name)) return { ok: false, error: "Y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7." };
  const s = await gitSession();
  if (!s) return { ok: false, error: `Ch\u1EC9 ch\u1EE7 repo (${OWNER2}) m\u1EDBi x\xF3a \u0111\u01B0\u1EE3c, v\xE0 m\xE1y n\xE0y c\u1EA7n \u0111\u0103ng nh\u1EADp Git b\u1EB1ng t\xE0i kho\u1EA3n \u0111\xF3.` };
  try {
    if (kind === "skill") {
      let removed2 = 0;
      removed2 = await commitChange(
        s,
        SKILLS_REPO,
        `plugins/${name}/`,
        async (ref) => {
          const skills = await readJsonFile(s, SKILLS_REPO, "docs/skills.json", ref);
          const mp = JSON.parse(Buffer.from(String((await must2(s, "GET", `/repos/${SKILLS_REPO}/contents/.claude-plugin/marketplace.json?ref=${encodeURIComponent(ref)}`)).content), "base64").toString("utf8"));
          mp.plugins = (mp.plugins ?? []).filter((p) => p.source !== `./plugins/${name}`);
          return [
            { path: "docs/skills.json", content: asJson(skills.filter((x) => x.name !== name)) },
            { path: ".claude-plugin/marketplace.json", content: asJson(mp) }
          ];
        },
        `Remove skill ${name} (by owner, from Team Tools)`
      );
      return { ok: true, removed: removed2 };
    }
    const list = await readJsonFile(s, SKILLS_REPO, "docs/addons.json", "main").catch(() => []);
    const entry = list.find((x) => x.name === name);
    const folder = String(entry?.folder ?? name);
    if (!NAME_RE2.test(folder)) return { ok: false, error: "T\xEAn th\u01B0 m\u1EE5c addon kh\xF4ng h\u1EE3p l\u1EC7." };
    const removed = await commitChange(s, ADDONS_REPO, `addons/${folder}/`, async () => [], `Remove addon ${folder} (by owner, from Team Tools)`);
    await commitChange(
      s,
      SKILLS_REPO,
      null,
      async (ref) => {
        const cur = await readJsonFile(s, SKILLS_REPO, "docs/addons.json", ref);
        return [{ path: "docs/addons.json", content: asJson(cur.filter((x) => x.name !== name)) }];
      },
      `Remove addon ${name} from the website list (by owner, from Team Tools)`
    );
    return { ok: true, removed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// server/updater.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync4 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join4 } from "node:path";
var STARTED_AT = Date.now();
var OPT_OUT = join4(homedir4(), ".team-skills", "no-auto-update");
function paseoCommand() {
  if (process.platform === "win32") {
    const p = join4(process.env.LOCALAPPDATA ?? "", "Programs", "Paseo", "resources", "bin", "paseo.cmd");
    return existsSync4(p) ? `"${p}"` : null;
  }
  return "paseo";
}
function runUpdate() {
  const cmd = paseoCommand();
  if (!cmd) return { ok: false, error: "Kh\xF4ng t\xECm th\u1EA5y l\u1EC7nh paseo tr\xEAn m\xE1y n\xE0y (c\xF3 th\u1EC3 kh\xF4ng ch\u1EA1y qua Paseo). H\xE3y d\xF9ng n\xFAt Copy l\u1EDDi nh\u1EDD c\xE0i \u1EDF \u0111\u1EA7u trang." };
  try {
    const child = spawn(`${cmd} plugin update team-skills --yes`, { shell: true, detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {
    });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// server/http.ts
var PORT = 47653;
var FEATURES = ["install", "uninstall", "addons-live", "agent-contribute", "review", "pending", "local-list", "contribute-web", "owner-remove", "self-update", "whoami", "local-variants", "skill-versions", "target-codex"];
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set(["https://minhdv-zz.github.io"]);
var ALLOWED_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1:" + PORT, "localhost:" + PORT]);
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve2, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 1e4) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve2(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
async function handle(req, res) {
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
    if (origin || req.headers["x-team-skills"] !== "1") return send(res, 403, { error: "Not allowed" });
    const plain = (status, text) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(text);
    };
    if (req.method === "GET" && path === "/agent/list") {
      const r = await runListLocal();
      return plain(r.isError ? 422 : 200, r.text);
    }
    if (req.method === "POST" && path === "/agent/contribute") {
      const r = await runContribute(await readJson(req));
      return plain(r.isError ? 422 : 200, r.text);
    }
    if (req.method === "POST" && path === "/agent/logout") {
      const r = runLogout();
      return plain(200, r.text);
    }
    return send(res, 404, { error: "Not found" });
  }
  if (req.method === "GET" && path === "/local") {
    try {
      return send(res, 200, { ok: true, items: await localItems(), scanned: skillDirs().map((d) => d.split("\\").join("/")) });
    } catch (e) {
      return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (req.method === "GET" && path === "/whoami") {
    return send(res, 200, { ok: true, machine: hostname() });
  }
  if (req.method === "GET" && path === "/status") {
    const { skills } = await listSkills();
    let blender = { live: false, versions: [], addons: [] };
    try {
      blender = await listAddons();
    } catch {
    }
    return send(res, 200, { ok: true, plugin: "team-skills", features: FEATURES, startedAt: STARTED_AT, owner: await isOwner(), skills, blender });
  }
  if (req.method === "POST" && path === "/uninstall") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const target = body.target;
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
  if (req.method === "GET" && path === "/pending") {
    try {
      return send(res, 200, { ok: true, list: await listPending() });
    } catch (e) {
      return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (req.method === "POST" && path === "/contribute") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    return send(res, 200, await webContribute(await readJson(req)));
  }
  if (req.method === "POST" && path === "/self-update") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    return send(res, 200, runUpdate());
  }
  if (req.method === "POST" && path === "/remove-item") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    return send(res, 200, await removeItem(String(body.kind), String(body.name)));
  }
  if (req.method === "POST" && path === "/review") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    return send(res, 200, await reviewPr(String(body.repo), Number(body.number), String(body.action), body.allow_outside === true));
  }
  if (req.method === "POST" && path === "/install-addon") {
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const version = String(body.version ?? "");
    let names;
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
    if (!origin) return send(res, 403, { error: "Origin required" });
    const body = await readJson(req);
    const target = body.target;
    if (!TARGETS.includes(target)) return send(res, 400, { error: "Invalid target" });
    let names;
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
function startHttp(opts) {
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });
  server.on("error", (e) => {
    console.error("[team-skills] HTTP endpoint not started: " + (e instanceof Error ? e.message : String(e)));
    opts?.onError?.(e);
  });
  server.listen(PORT, "127.0.0.1", () => opts?.onListening?.());
  return () => {
    server.close();
  };
}

// standalone/main.ts
var VERSION = "1.0.0";
var TOOLS = [
  {
    name: "team_skills_list_local",
    description: "List the Claude skills and Blender addons installed on this machine and whether each already exists in the shared Team Skills lists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "team_skills_contribute",
    description: "Contribute a local Claude skill or Blender addon to the shared team repositories by opening a GitHub Pull Request that the owner reviews. Call with dry_run=true first and fix reported errors; ask the user to confirm publishing (and, for addons, that it is free and redistributable) before calling with share_confirmed=true. If the user is not signed in to GitHub, the sign-in page opens and a code is returned: tell the user to enter it, then call again.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["skill", "addon"] },
        name: { type: "string" },
        path: { type: "string", description: "Absolute folder path, for skills kept in a project's .claude/skills" },
        dry_run: { type: "boolean" },
        share_confirmed: { type: "boolean" },
        replace_existing: { type: "boolean" }
      },
      required: ["kind"],
      additionalProperties: false
    }
  },
  {
    name: "team_skills_logout",
    description: "Forget the GitHub sign-in used for contributing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];
async function callTool(name, args) {
  if (name === "team_skills_list_local") return runListLocal();
  if (name === "team_skills_contribute") return runContribute(args);
  if (name === "team_skills_logout") return runLogout();
  return { text: "Unknown tool: " + name, isError: true };
}
function serveMcp() {
  const send2 = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin });
  let busy = 0;
  let closed = false;
  const done = () => {
    busy--;
    if (closed && busy === 0) process.exit(0);
  };
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send2({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const { id, method, params } = msg;
    if (id === void 0) return;
    const ok = (result) => send2({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => send2({ jsonrpc: "2.0", id, error: { code, message } });
    if (method === "initialize") {
      return ok({
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "team-skills", version: VERSION }
      });
    }
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call") {
      busy++;
      callTool(String(params?.name), params?.arguments ?? {}).then((r) => ok({ content: [{ type: "text", text: r.text }], isError: r.isError })).catch((e) => ok({ content: [{ type: "text", text: String(e instanceof Error ? e.message : e) }], isError: true })).finally(done);
      return;
    }
    fail(-32601, "Method not found: " + method);
  });
  rl.on("close", () => {
    closed = true;
    if (busy === 0) process.exit(0);
  });
}
var mode = process.argv[2] ?? "serve";
if (mode === "mcp") {
  console.log = console.error;
  serveMcp();
} else if (mode === "serve") {
  startHttp({
    onListening: () => console.log(`Team Skills \u0111ang ch\u1EA1y t\u1EA1i http://127.0.0.1:${PORT} . Gi\u1EEF c\u1EEDa s\u1ED5 n\xE0y m\u1EDF, \u0111\xF3ng l\xE0 d\u1EEBng.`),
    onError: (e) => {
      console.error(`Kh\xF4ng m\u1EDF \u0111\u01B0\u1EE3c c\u1ED5ng ${PORT} (${e.message}). C\xF3 th\u1EC3 Team Skills ho\u1EB7c plugin Paseo \u0111\xE3 ch\u1EA1y s\u1EB5n.`);
      process.exit(1);
    }
  });
} else {
  console.error("C\xE1ch d\xF9ng: node team-skills.mjs serve | mcp");
  process.exit(1);
}
