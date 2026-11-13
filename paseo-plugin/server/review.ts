import { api, ensureSession, pendingLogin } from "./contribute";

const OWNER = "minhdv-zz";
const REPOS = new Set([`${OWNER}/team-skills`, `${OWNER}/team-blender-addons`]);

export type ReviewResult =
  | { ok: true; done: "merged" | "closed"; note?: string }
  | { ok: false; login?: { code: string; url: string } | null; error?: string; outside?: string[] };

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

  const { session } = await ensureSession(1500);
  if (!session) return { ok: false, login: pendingLogin() };
  if (session.login.toLowerCase() !== OWNER) {
    return { ok: false, error: `Bạn đang đăng nhập GitHub là ${session.login}. Chỉ chủ repo (${OWNER}) mới duyệt được.` };
  }

  const pr = await api(session, "GET", `/repos/${repo}/pulls/${number}`);
  if (pr.status !== 200) return { ok: false, error: `Không đọc được Pull Request #${number} (HTTP ${pr.status}).` };
  if (pr.json.state !== "open") return { ok: false, error: `Pull Request #${number} không còn ở trạng thái mở.` };

  if (action === "close") {
    const r = await api(session, "PATCH", `/repos/${repo}/pulls/${number}`, { state: "closed" });
    if (r.status !== 200) return { ok: false, error: `Không từ chối được (HTTP ${r.status}): ${String(r.json?.message ?? "").slice(0, 200)}` };
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
  return { ok: true, done: "merged" };
}
