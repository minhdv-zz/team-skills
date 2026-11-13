import { api, ensureSession, NAME_RE, pendingLogin } from "./contribute";

const REPO = "minhdv-zz/team-skills";

export type LikeResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false; login: { code: string; url: string } | null; error?: string };

/** Each skill/addon has one GitHub issue titled "like:<kind>:<name>"; a like is a thumbs-up reaction on it. */
async function findIssue(s: Parameters<typeof api>[0], title: string): Promise<number | null> {
  for (let page = 1; page <= 3; page++) {
    const r = await api(s, "GET", `/repos/${REPO}/issues?state=all&per_page=100&sort=created&direction=asc&page=${page}`);
    if (r.status !== 200 || !Array.isArray(r.json)) throw new Error(`Không đọc được danh sách (HTTP ${r.status}).`);
    const hit = r.json.find((i: any) => !i.pull_request && i.title === title);
    if (hit) return hit.number;
    if (r.json.length < 100) break;
  }
  return null;
}

export async function setLike(kind: string, name: string, on: boolean): Promise<LikeResult> {
  if ((kind !== "skill" && kind !== "addon") || !NAME_RE.test(name)) return { ok: false, login: null, error: "Tên không hợp lệ." };
  const { session } = await ensureSession(1500);
  if (!session) return { ok: false, login: pendingLogin() };

  const title = `like:${kind}:${name}`;
  let n = await findIssue(session, title);
  if (n === null) {
    if (!on) return { ok: true, liked: false, count: 0 };
    const c = await api(session, "POST", `/repos/${REPO}/issues`, {
      title,
      body: `Bộ đếm lượt thích cho ${kind} \`${name}\`. Vui lòng không đóng hay sửa issue này.`,
    });
    if (c.status !== 201) throw new Error(`Không tạo được bộ đếm (HTTP ${c.status}).`);
    n = c.json.number as number;
  }
  if (on) {
    const r = await api(session, "POST", `/repos/${REPO}/issues/${n}/reactions`, { content: "+1" });
    if (r.status !== 200 && r.status !== 201) throw new Error(`Không thích được (HTTP ${r.status}).`);
  } else {
    const l = await api(session, "GET", `/repos/${REPO}/issues/${n}/reactions?content=%2B1&per_page=100`);
    const mine = Array.isArray(l.json) ? l.json.filter((x: any) => x.user?.login === session.login) : [];
    for (const m of mine) await api(session, "DELETE", `/repos/${REPO}/issues/${n}/reactions/${m.id}`);
  }
  const i = await api(session, "GET", `/repos/${REPO}/issues/${n}`);
  return { ok: true, liked: on, count: Number(i.json?.reactions?.["+1"] ?? 0) };
}
