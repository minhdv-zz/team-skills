import { execFile } from "node:child_process";
import { api, ensureSession, logout, pendingLogin } from "./contribute";

const OWNER = "minhdv-zz";
const REPOS = new Set([`${OWNER}/team-skills`, `${OWNER}/team-blender-addons`]);

export type ReviewResult =
  | { ok: true; done: "merged" | "closed"; note?: string }
  | { ok: false; login?: { code: string; url: string } | null; error?: string; outside?: string[] };

type Sess = Parameters<typeof api>[0];

/**
 * The GitHub sign-in this machine already uses for `git push` (Git Credential Manager). Used only to merge or close
 * a Pull Request, never stored or sent anywhere else, and only accepted when it belongs to the repo owner.
 */
export async function gitSession(requireOwner = true): Promise<Sess | null> {
  const token = await new Promise<string>((resolve) => {
    const child = execFile(
      "git",
      ["credential", "fill"],
      { timeout: 8000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } },
      (err, stdout) => {
        if (err) return resolve("");
        const m = /^password=(.*)$/m.exec(String(stdout));
        resolve(m ? m[1].trim() : "");
      },
    );
    child.stdin?.end("protocol=https\nhost=github.com\n\n");
  });
  if (!token) return null;
  const s: Sess = { token, login: "", expiresAt: Date.now() + 60_000 };
  const me = await api(s, "GET", "/user");
  if (me.status !== 200 || !me.json?.login) return null;
  if (requireOwner && String(me.json.login).toLowerCase() !== OWNER) return null;
  s.login = String(me.json.login);
  return s;
}

/** A contribution may only touch its own folder: plugins/<name>/ (skills) or addons/<name>/ (addons). */
function outsideFiles(repo: string, files: string[]): string[] {
  const prefix = repo.endsWith("team-skills") ? "plugins/" : "addons/";
  const roots = new Set<string>();
  for (const f of files) if (f.startsWith(prefix)) roots.add(f.split("/").slice(0, 2).join("/"));
  const first = [...roots][0];
  return files.filter((f) => roots.size !== 1 || !f.startsWith(first + "/"));
}

/** Merge or close a contribution Pull Request. Only the repo owner's GitHub account can do this. */
export async function reviewPr(repo: string, number: number, action: string, allowOutside: boolean): Promise<ReviewResult> {
  if (!REPOS.has(repo) || !Number.isInteger(number) || number < 1) return { ok: false, error: "Yêu cầu không hợp lệ." };
  if (action !== "merge" && action !== "close") return { ok: false, error: "Hành động không hợp lệ." };

  let session: Sess | null = await gitSession();
  if (!session) {
    // No usable Git sign-in on this machine: fall back to signing in with a code.
    session = (await ensureSession(1500)).session;
    if (!session) return { ok: false, login: pendingLogin() };
  }
  if (session.login.toLowerCase() !== OWNER) {
    return { ok: false, error: `Bạn đang đăng nhập GitHub là ${session.login}. Chỉ chủ repo (${OWNER}) mới duyệt được.` };
  }

  const pr = await api(session, "GET", `/repos/${repo}/pulls/${number}`);
  if (pr.status === 401) {
    logout();
    return { ok: false, error: "Phiên đăng nhập GitHub đã hết hạn. Bấm lại để đăng nhập." };
  }
  if (pr.status !== 200) return { ok: false, error: `Không đọc được Pull Request #${number} (HTTP ${pr.status}).` };
  if (pr.json.state !== "open") return { ok: false, error: `Pull Request #${number} không còn ở trạng thái mở.` };

  if (action === "close") {
    const r = await api(session, "PATCH", `/repos/${repo}/pulls/${number}`, { state: "closed" });
    if (r.status !== 200) return { ok: false, error: `Không từ chối được (HTTP ${r.status}): ${String(r.json?.message ?? "").slice(0, 200)}` };
    clearPendingCache();
    return { ok: true, done: "closed" };
  }

  // Safety net: refuse when the PR changes anything outside its own folder (scripts, workflows, other items...).
  const fl = await api(session, "GET", `/repos/${repo}/pulls/${number}/files?per_page=100`);
  if (fl.status !== 200 || !Array.isArray(fl.json)) return { ok: false, error: `Không đọc được danh sách file (HTTP ${fl.status}).` };
  const outside = outsideFiles(repo, fl.json.map((f: any) => String(f.filename)));
  if (outside.length > 0 && !allowOutside) {
    return { ok: false, outside: outside.slice(0, 20), error: "Pull Request này sửa cả file ngoài thư mục của nó." };
  }

  // First-time contributors' checks wait for approval; approve them (best effort) so they are not left hanging.
  const sha = String(pr.json.head.sha);
  const runs = await api(session, "GET", `/repos/${repo}/actions/runs?head_sha=${sha}&status=action_required`);
  if (runs.status === 200 && Array.isArray(runs.json?.workflow_runs)) {
    for (const run of runs.json.workflow_runs) await api(session, "POST", `/repos/${repo}/actions/runs/${run.id}/approve`);
  }

  const m = await api(session, "PUT", `/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash", sha });
  if (m.status !== 200) return { ok: false, error: `Không gộp được (HTTP ${m.status}): ${String(m.json?.message ?? "").slice(0, 200)}` };
  clearPendingCache();
  return { ok: true, done: "merged" };
}

export interface PendingPr {
  repo: string;
  kind: string;
  n: number;
  title: string;
  user: string;
  url: string;
  sha: string;
  at: string;
  files: string[];
  checks: { status: string; conclusion: string | null }[] | null;
}

let cache: { at: number; list: PendingPr[] } | null = null;

/** Open contribution PRs of both repos, with files and check results. Read with the owner's Git sign-in (higher rate limit). */
export async function listPending(): Promise<PendingPr[] | null> {
  if (cache && Date.now() - cache.at < 20_000) return cache.list;
  const s = await gitSession();
  if (!s) return null;
  const out: PendingPr[] = [];
  for (const repo of REPOS) {
    const r = await api(s, "GET", `/repos/${repo}/pulls?state=open&per_page=30`);
    if (r.status !== 200 || !Array.isArray(r.json)) throw new Error(`Không đọc được ${repo} (HTTP ${r.status}).`);
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
        files: Array.isArray(f.json) ? f.json.map((x: any) => String(x.filename)) : [],
        checks: c.status === 200 && Array.isArray(c.json?.check_runs)
          ? c.json.check_runs.map((x: any) => ({ status: String(x.status), conclusion: x.conclusion ?? null }))
          : null,
      });
    }
  }
  cache = { at: Date.now(), list: out };
  return out;
}

export function clearPendingCache(): void {
  cache = null;
}
