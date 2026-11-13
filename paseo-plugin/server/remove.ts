import { api } from "./contribute";
import { gitSession } from "./review";

const OWNER = "minhdv-zz";
const SKILLS_REPO = `${OWNER}/team-skills`;
const ADDONS_REPO = `${OWNER}/team-blender-addons`;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

type Sess = NonNullable<Awaited<ReturnType<typeof gitSession>>>;

let ownerCache: { at: number; value: boolean } | null = null;

/** True when this machine's Git sign-in belongs to the repo owner. Cached; used only to show owner-only buttons. */
export async function isOwner(): Promise<boolean> {
  if (ownerCache && Date.now() - ownerCache.at < (ownerCache.value ? 600_000 : 120_000)) return ownerCache.value;
  let value = false;
  try {
    value = (await gitSession()) !== null;
  } catch {
    value = false;
  }
  ownerCache = { at: Date.now(), value };
  return value;
}

async function must(s: Sess, method: string, path: string, body?: unknown): Promise<any> {
  const r = await api(s, method, path, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`GitHub báo lỗi (HTTP ${r.status}) khi gọi ${method} ${path.split("?")[0]}: ${String(r.json?.message ?? "").slice(0, 160)}`);
  return r.json;
}

async function readJsonFile(s: Sess, repo: string, path: string, ref: string): Promise<any[]> {
  const f = await must(s, "GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  return JSON.parse(Buffer.from(String(f.content), "base64").toString("utf8"));
}

/** One commit on the default branch: delete every file under `prefix` (if any) and rewrite some files. Returns files removed. */
async function commitChange(s: Sess, repo: string, prefix: string | null, edits: (ref: string) => Promise<{ path: string; content: string }[]>, message: string): Promise<number> {
  const info = await must(s, "GET", `/repos/${repo}`);
  if (!info.permissions?.push) throw new Error(`Tài khoản này không có quyền ghi vào ${repo}.`);
  const branch = String(info.default_branch);
  const ref = await must(s, "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = String(ref.object.sha);
  const head = await must(s, "GET", `/repos/${repo}/git/commits/${headSha}`);

  const entries: { path: string; mode: string; type: string; sha?: string | null; content?: string }[] = [];
  let removed = 0;
  if (prefix) {
    const tree = await must(s, "GET", `/repos/${repo}/git/trees/${headSha}?recursive=1`);
    if (tree.truncated) throw new Error("Thư mục quá lớn để xóa an toàn bằng cách này.");
    for (const t of tree.tree as { path: string; type: string }[]) {
      if (t.type === "blob" && t.path.startsWith(prefix)) {
        entries.push({ path: t.path, mode: "100644", type: "blob", sha: null });
        removed++;
      }
    }
  }
  for (const e of await edits(branch)) entries.push({ path: e.path, mode: "100644", type: "blob", content: e.content });
  if (entries.length === 0) return 0;

  const newTree = await must(s, "POST", `/repos/${repo}/git/trees`, { base_tree: head.tree.sha, tree: entries });
  const commit = await must(s, "POST", `/repos/${repo}/git/commits`, { message, tree: newTree.sha, parents: [headSha] });
  await must(s, "PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return removed;
}

const asJson = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

/** Owner only: take a skill or addon out of the shared repositories and out of the website lists. */
export async function removeItem(kind: string, name: string): Promise<{ ok: boolean; removed?: number; error?: string }> {
  if ((kind !== "skill" && kind !== "addon") || !NAME_RE.test(name)) return { ok: false, error: "Yêu cầu không hợp lệ." };
  const s = await gitSession();
  if (!s) return { ok: false, error: `Chỉ chủ repo (${OWNER}) mới xóa được, và máy này cần đăng nhập Git bằng tài khoản đó.` };

  try {
    if (kind === "skill") {
      let removed = 0;
      removed = await commitChange(
        s,
        SKILLS_REPO,
        `plugins/${name}/`,
        async (ref) => {
          const skills = await readJsonFile(s, SKILLS_REPO, "docs/skills.json", ref);
          const mp = JSON.parse(Buffer.from(String((await must(s, "GET", `/repos/${SKILLS_REPO}/contents/.claude-plugin/marketplace.json?ref=${encodeURIComponent(ref)}`)).content), "base64").toString("utf8"));
          mp.plugins = (mp.plugins ?? []).filter((p: any) => p.source !== `./plugins/${name}`);
          return [
            { path: "docs/skills.json", content: asJson(skills.filter((x: any) => x.name !== name)) },
            { path: ".claude-plugin/marketplace.json", content: asJson(mp) },
          ];
        },
        `Remove skill ${name} (by owner, from Team Tools)`,
      );
      return { ok: true, removed };
    }

    // addon: its folder lives in the addons repo; the website list lives in the skills repo (docs/addons.json)
    const list = await readJsonFile(s, SKILLS_REPO, "docs/addons.json", "main").catch(() => [] as any[]);
    const entry = list.find((x: any) => x.name === name);
    const folder = String(entry?.folder ?? name);
    if (!NAME_RE.test(folder)) return { ok: false, error: "Tên thư mục addon không hợp lệ." };
    const removed = await commitChange(s, ADDONS_REPO, `addons/${folder}/`, async () => [], `Remove addon ${folder} (by owner, from Team Tools)`);
    await commitChange(
      s,
      SKILLS_REPO,
      null,
      async (ref) => {
        const cur = await readJsonFile(s, SKILLS_REPO, "docs/addons.json", ref);
        return [{ path: "docs/addons.json", content: asJson(cur.filter((x: any) => x.name !== name)) }];
      },
      `Remove addon ${name} from the website list (by owner, from Team Tools)`,
    );
    return { ok: true, removed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
