/**
 * Contribute a local skill or Blender addon to the team repositories.
 *
 * Flow: validate locally -> sign in to GitHub (device flow, token kept in memory only) ->
 * fork (or branch, if the user can push) -> commit through the Git Data API -> open a Pull Request.
 * Nothing is merged automatically: the repository owner reviews every Pull Request.
 */
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Public client id of the "Team Skills" GitHub OAuth App (device flow enabled). Not a secret. */
export const CLIENT_ID = "Ov23liAkygpxdyD0Snri";

export type Kind = "skill" | "addon";

const REPOS: Record<Kind, { repo: string; base: (name: string) => string }> = {
  skill: { repo: "minhdv-zz/team-skills", base: (n) => `plugins/${n}/skills/${n}` },
  addon: { repo: "minhdv-zz/team-blender-addons", base: (n) => `addons/${n}` },
};

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

// ------------------------------------------------------------------ local sources

export function skillDirs(): string[] {
  return [join(homedir(), ".claude", "skills"), join(homedir(), ".claude-api", "skills")];
}

function isDirLink(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function listDirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => !d.name.startsWith(".") && (d.isDirectory() || (d.isSymbolicLink() && isDirLink(join(root, d.name)))))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function findSkillSource(name: string): string | null {
  for (const root of skillDirs()) {
    const p = join(root, name);
    if (existsSync(join(p, "SKILL.md"))) return p;
  }
  return null;
}

export function findAddonSource(name: string, roots: string[]): string | null {
  for (const root of roots) {
    const p = join(root, name);
    if (existsSync(join(p, "__init__.py")) || existsSync(join(p, "blender_manifest.toml"))) return p;
  }
  return null;
}

// ------------------------------------------------------------------ validation (mirrors scripts/validate.py)

export interface Issue {
  level: "error" | "warning";
  message: string;
}

interface FileEntry {
  rel: string;
  abs: string;
  size: number;
}

const BAD_EXT_SKILL = new Set([".exe", ".dll", ".msi", ".bat", ".cmd", ".com", ".scr", ".so", ".dylib", ".apk", ".jar"]);
const BINARY_EXT_ADDON = new Set([".dll", ".pyd", ".so", ".dylib", ".exe", ".msi", ".bat", ".cmd"]);
const TEXT_EXT = new Set([".md", ".txt", ".json", ".py", ".ps1", ".sh", ".js", ".ts", ".toml", ".yml", ".yaml", ".cfg", ".ini", ".csv", ".xml", ".html"]);
const LICENSE_NAMES = new Set(["license", "license.md", "license.txt", "copying", "copying.md", "copying.txt"]);
const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, "private key"],
  [/\bghp_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/, "GitHub token"],
  [/\bsk-[A-Za-z0-9_-]{32,}\b/, "API key (sk-...)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, "hard-coded credential"],
];

const MAX_FILES = 600;
const MAX_TOTAL = 40 * 1024 * 1024;

function walk(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  const rec = (dir: string, rel: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === ".git" || d.name === "__pycache__" || d.name === "node_modules") continue;
      const abs = join(dir, d.name);
      const r = rel ? rel + "/" + d.name : d.name;
      if (d.isDirectory()) rec(abs, r);
      else if (d.isFile() && !d.name.endsWith(".pyc")) out.push({ rel: r, abs, size: statSync(abs).size });
    }
  };
  rec(root, "");
  return out;
}

function frontMatter(text: string): Record<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function addonAuthor(src: string): string {
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

export interface Checked {
  files: FileEntry[];
  issues: Issue[];
  author: string;
  description: string;
}

export function checkContribution(kind: Kind, name: string, src: string): Checked {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  if (!NAME_RE.test(name)) err("Tên phải gồm 2-64 ký tự chữ, số, '-' hoặc '_'.");
  const files = walk(src);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (files.length === 0) err("Thư mục rỗng.");
  if (files.length > MAX_FILES) err(`Có ${files.length} file, vượt giới hạn ${MAX_FILES}.`);
  if (total > MAX_TOTAL) err(`Tổng dung lượng ${(total / 1e6).toFixed(1)} MB vượt giới hạn ${MAX_TOTAL / 1024 / 1024} MB.`);

  const perFile = kind === "skill" ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
  let author = "";
  let description = "";

  if (kind === "skill") {
    const md = join(src, "SKILL.md");
    if (!existsSync(md)) {
      err("Thiếu SKILL.md.");
    } else {
      const fm = frontMatter(readFileSync(md, "utf8"));
      if (!fm) {
        err("SKILL.md phải bắt đầu bằng phần tiêu đề: --- name / description / author ---");
      } else {
        description = fm.description ?? "";
        author = fm.author ?? "";
        if (!fm.description) err("Tiêu đề SKILL.md thiếu 'description'.");
        if (!fm.author) err("Tiêu đề SKILL.md thiếu 'author:' (tên người đóng góp), để mọi người biết skill của ai.");
        if (fm.name !== name) err(`Tiêu đề SKILL.md có name '${fm.name ?? ""}' nhưng phải trùng tên thư mục '${name}'.`);
      }
    }
  } else {
    if (!existsSync(join(src, "__init__.py")) && !existsSync(join(src, "blender_manifest.toml"))) {
      err("Addon cần __init__.py hoặc blender_manifest.toml ngay trong thư mục.");
    }
    author = addonAuthor(src);
    if (!author) err("Addon chưa có tên tác giả (bl_info 'author' hoặc maintainer trong blender_manifest.toml).");
    if (!readdirSync(src).some((f) => LICENSE_NAMES.has(f.toLowerCase()))) {
      err("Thiếu file giấy phép (LICENSE). Chỉ nhận addon miễn phí và được phép chia sẻ lại.");
    }
  }

  for (const f of files) {
    const ext = f.rel.includes(".") ? "." + f.rel.split(".").pop()!.toLowerCase() : "";
    if (f.size > perFile) err(`${f.rel}: ${(f.size / 1e6).toFixed(1)} MB vượt giới hạn ${perFile / 1024 / 1024} MB.`);
    if (kind === "skill" && BAD_EXT_SKILL.has(ext)) err(`${f.rel}: không nhận file chạy hoặc cài đặt trong skill.`);
    if (kind === "addon" && BINARY_EXT_ADDON.has(ext)) warn(`${f.rel}: file biên dịch, người duyệt sẽ kiểm tra nguồn gốc.`);
    if (TEXT_EXT.has(ext) && f.size <= 2 * 1024 * 1024) {
      const text = readFileSync(f.abs, "utf8");
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(text)) err(`${f.rel}: có vẻ chứa ${label}. Hãy xóa trước khi gửi.`);
      }
      const abs = /\b[A-Za-z]:[\/](?!Windows\b|Program Files\b)[^\s"'`)\]]{3,}/.exec(text);
      if (abs) warn(`${f.rel}: có đường dẫn riêng của máy bạn (ví dụ ${abs[0].slice(0, 60)}). Nên thay bằng đường dẫn chung hoặc để skill hỏi người dùng.`);
    }
  }
  return { files, issues, author, description };
}

// ------------------------------------------------------------------ GitHub sign-in (device flow)

interface Session {
  token: string;
  login: string;
  expiresAt: number;
}

interface Pending {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  done: Promise<Session | null>;
}

/** Only the repo owner's sign-in is remembered on disk (so approving needs no code each time). Others stay in memory. */
const OWNER_LOGIN = "minhdv-zz";
const SESSION_FILE = join(homedir(), ".team-skills", "owner-session.json");

function loadSavedSession(): Session | null {
  try {
    const j = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
    if (j && typeof j.token === "string" && String(j.login).toLowerCase() === OWNER_LOGIN) {
      return { token: j.token, login: String(j.login), expiresAt: Date.now() + 3650 * 86400_000 };
    }
  } catch {
    /* none saved */
  }
  return null;
}

function saveSession(s: Session): void {
  if (s.login.toLowerCase() !== OWNER_LOGIN) return;
  try {
    mkdirSync(join(homedir(), ".team-skills"), { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify({ token: s.token, login: s.login }), { mode: 0o600 });
    try {
      chmodSync(SESSION_FILE, 0o600);
    } catch {
      /* Windows */
    }
  } catch {
    /* keep working from memory */
  }
}

let session: Session | null = loadSavedSession();
let pending: Pending | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function logout(): boolean {
  const had = session !== null || pending !== null;
  try {
    rmSync(SESSION_FILE, { force: true });
  } catch {
    /* ignore */
  }
  session = null;
  pending = null;
  return had;
}

export function pendingLogin(): { code: string; url: string } | null {
  return pending && pending.expiresAt > Date.now() ? { code: pending.userCode, url: pending.verificationUri } : null;
}

export function currentLogin(): string | null {
  return session && session.expiresAt > Date.now() + 60_000 ? session.login : null;
}

async function ghForm(url: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "team-skills-plugin" },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

export function openUrl(url: string): void {
  if (!/^https:\/\/github\.com\//.test(url)) return;
  if (process.platform === "win32") execFile("rundll32", ["url.dll,FileProtocolHandler", url], () => {});
  else if (process.platform === "darwin") execFile("open", [url], () => {});
  else execFile("xdg-open", [url], () => {});
}

async function startDeviceFlow(): Promise<Pending> {
  const dc = await ghForm("https://github.com/login/device/code", { client_id: CLIENT_ID, scope: "public_repo" });
  if (!dc.device_code) throw new Error("GitHub không cấp mã đăng nhập: " + JSON.stringify(dc).slice(0, 200));
  const expiresAt = Date.now() + Number(dc.expires_in ?? 900) * 1000;
  let interval = Number(dc.interval ?? 5);

  const done = (async (): Promise<Session | null> => {
    while (Date.now() < expiresAt) {
      await sleep(interval * 1000);
      const r = await ghForm("https://github.com/login/oauth/access_token", {
        client_id: CLIENT_ID,
        device_code: String(dc.device_code),
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      if (r.access_token) {
        const u = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer " + r.access_token, Accept: "application/vnd.github+json", "User-Agent": "team-skills-plugin" },
        }).then((x) => x.json());
        const s: Session = {
          token: String(r.access_token),
          login: String(u.login),
          // OAuth App tokens do not expire (no expires_in); keep them for the life of the plugin process.
          expiresAt: Date.now() + Number(r.expires_in ?? 3650 * 86400) * 1000,
        };
        session = s;
        saveSession(s);
        return s;
      }
      if (r.error === "slow_down") interval += 5;
      else if (r.error === "authorization_pending") continue;
      else return null; // expired_token, access_denied, ...
    }
    return null;
  })();
  done.catch(() => {});
  return { userCode: String(dc.user_code), verificationUri: String(dc.verification_uri), expiresAt, done };
}

export interface LoginResult {
  session: Session | null;
  message: string;
}

/** Return a valid session, starting the browser sign-in when needed and waiting up to waitMs for it. */
export async function ensureSession(waitMs: number): Promise<LoginResult> {
  if (session && session.expiresAt > Date.now() + 60_000) return { session, message: "" };
  if (!pending || pending.expiresAt < Date.now()) {
    pending = await startDeviceFlow();
    openUrl(pending.verificationUri);
  }
  const p = pending;
  const result = await Promise.race([p.done, sleep(waitMs).then(() => "timeout" as const)]);
  if (result === "timeout") {
    return {
      session: null,
      message:
        `Cần đăng nhập GitHub. Đã mở trang ${p.verificationUri} trong trình duyệt. ` +
        `Nhập mã **${p.userCode}**, bấm Authorize, rồi báo lại để tiếp tục (gọi lại công cụ này).`,
    };
  }
  if (result === null) {
    pending = null;
    return { session: null, message: "Đăng nhập GitHub không thành công hoặc đã hết hạn. Hãy thử lại." };
  }
  pending = null;
  return { session: result, message: "" };
}

// ------------------------------------------------------------------ submit as a Pull Request

export async function api(s: Session, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + s.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "team-skills-plugin",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

function must(r: { status: number; json: any }, what: string): any {
  if (r.status >= 200 && r.status < 300) return r.json;
  throw new Error(`${what} thất bại (HTTP ${r.status}): ${String(r.json?.message ?? "").slice(0, 200)}`);
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export interface SubmitResult {
  prUrl: string;
  branch: string;
  direct: boolean;
}

export async function submitContribution(opts: {
  kind: Kind;
  name: string;
  files: FileEntry[];
  author: string;
  description: string;
  issues: Issue[];
  replace: boolean;
  s: Session;
}): Promise<SubmitResult> {
  const { kind, name, files, author, description, issues, replace, s } = opts;
  const { repo: upstream, base } = REPOS[kind];
  const basePath = base(name);

  const repoInfo = must(await api(s, "GET", `/repos/${upstream}`), "Đọc thông tin repo");
  const defaultBranch: string = repoInfo.default_branch;
  const canPush = Boolean(repoInfo.permissions?.push);

  // Refuse to overwrite an existing entry unless asked to.
  const exists = (await api(s, "GET", `/repos/${upstream}/contents/${basePath}?ref=${encodeURIComponent(defaultBranch)}`)).status === 200;
  if (exists && !replace) {
    throw new Error(`'${name}' đã có trong kho chung. Nếu muốn gửi bản cập nhật, hãy gọi lại với replace_existing=true.`);
  }

  // Work in upstream when we may push, otherwise in a fork.
  let work = upstream;
  if (!canPush) {
    const fork = must(await api(s, "POST", `/repos/${upstream}/forks`, { default_branch_only: true }), "Tạo bản sao (fork)");
    work = String(fork.full_name);
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      ready = (await api(s, "GET", `/repos/${work}/git/ref/heads/${encodeURIComponent(defaultBranch)}`)).status === 200;
      if (!ready) await sleep(2000);
    }
    if (!ready) throw new Error("Bản sao (fork) chưa sẵn sàng, hãy thử lại sau ít phút.");
    await api(s, "POST", `/repos/${work}/merge-upstream`, { branch: defaultBranch }); // best effort: bring the fork up to date
  }

  const headRef = must(await api(s, "GET", `/repos/${work}/git/ref/heads/${encodeURIComponent(defaultBranch)}`), "Đọc nhánh chính");
  const baseSha: string = headRef.object.sha;
  const baseCommit = must(await api(s, "GET", `/repos/${work}/git/commits/${baseSha}`), "Đọc commit gốc");
  const baseTree: string = baseCommit.tree.sha;

  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  await pool(files, 4, async (f) => {
    const blob = must(
      await api(s, "POST", `/repos/${work}/git/blobs`, { content: readFileSync(f.abs).toString("base64"), encoding: "base64" }),
      `Tải lên ${f.rel}`,
    );
    tree.push({ path: `${basePath}/${f.rel}`, mode: "100644", type: "blob", sha: String(blob.sha) });
  });
  tree.sort((a, b) => a.path.localeCompare(b.path));

  const newTree = must(await api(s, "POST", `/repos/${work}/git/trees`, { base_tree: baseTree, tree }), "Tạo cây thư mục");
  const commit = must(
    await api(s, "POST", `/repos/${work}/git/commits`, {
      message: `${exists ? "Update" : "Add"} ${kind} ${name} (by ${author})`,
      tree: newTree.sha,
      parents: [baseSha],
    }),
    "Tạo commit",
  );
  const branch = `contrib/${name}-${Date.now().toString(36)}`;
  must(await api(s, "POST", `/repos/${work}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha }), "Tạo nhánh");

  const warnings = issues.filter((i) => i.level === "warning").map((i) => `- ${i.message}`);
  const body = [
    `**Loại:** ${kind === "skill" ? "Skill" : "Addon Blender"}`,
    `**Tên:** \`${name}\``,
    `**Tác giả khai báo:** ${author}`,
    `**Tài khoản GitHub gửi:** [${s.login}](https://github.com/${s.login})`,
    description ? `**Mô tả:** ${description}` : "",
    `**File:** ${files.length}`,
    "",
    "Gửi tự động từ Team Skills (plugin Paseo hoặc chương trình độc lập).",
    warnings.length ? "\n**Cảnh báo khi kiểm tra cục bộ:**\n" + warnings.join("\n") : "",
    "",
    "**Người duyệt:** đây là mã/hướng dẫn sẽ chạy trên máy người cài. Hãy đọc kỹ nội dung trước khi gộp.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const pr = must(
    await api(s, "POST", `/repos/${upstream}/pulls`, {
      title: `[${kind === "skill" ? "Skill" : "Addon"}] ${name} - ${author}`,
      head: work === upstream ? branch : `${s.login}:${branch}`,
      base: defaultBranch,
      body,
      maintainer_can_modify: true,
    }),
    "Mở Pull Request",
  );
  return { prUrl: String(pr.html_url), branch, direct: work === upstream };
}
