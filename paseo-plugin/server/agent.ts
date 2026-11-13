/**
 * The contribution workflow, shared by the agent tools (when Paseo exposes them) and the local
 * /agent/* HTTP endpoints (used by the prompt the website generates, through curl).
 */
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { addonRoots, teamNames } from "./handlers";
import {
  NAME_RE,
  checkContribution,
  currentLogin,
  ensureSession,
  findAddonSource,
  findSkillSource,
  listDirs,
  logout,
  skillDirs,
  submitContribution,
  type Kind,
} from "./contribute";

export interface ContributeInput {
  kind: Kind;
  /** Folder name. Optional when `path` is given. */
  name?: string;
  /** Absolute path of the skill/addon folder, for projects that keep skills outside ~/.claude/skills. */
  path?: string;
  dry_run?: boolean;
  share_confirmed?: boolean;
  replace_existing?: boolean;
}

export interface Reply {
  text: string;
  isError: boolean;
}

const reply = (text: string, isError = false): Reply => ({ text, isError });

export async function runListLocal(): Promise<Reply> {
  const team = await teamNames();
  const skills = new Map<string, boolean>();
  for (const root of skillDirs()) for (const n of listDirs(root)) skills.set(n, team.skills.has(n));
  const addons = new Map<string, boolean>();
  for (const root of await addonRoots()) for (const n of listDirs(root)) if (NAME_RE.test(n)) addons.set(n, team.addons.has(n));
  const fmt = (m: Map<string, boolean>) =>
    [...m].map(([n, shared]) => `- ${n}${shared ? " (đã có trong kho chung)" : ""}`).join("\n") || "(không có)";
  return reply(
    `Skill trong ~/.claude/skills và ~/.claude-api/skills:\n${fmt(skills)}\n\nAddon Blender trên máy:\n${fmt(addons)}\n\n` +
      "Skill nằm trong thư mục .claude/skills của một dự án thì không có trong danh sách này, hãy truyền path của thư mục skill.",
  );
}

export async function runContribute(input: ContributeInput): Promise<Reply> {
  const kind = input.kind;
  if (kind !== "skill" && kind !== "addon") return reply("kind phải là 'skill' hoặc 'addon'.", true);

  let src: string | null = null;
  let name = input.name?.trim() ?? "";

  if (input.path) {
    if (!isAbsolute(input.path)) return reply("path phải là đường dẫn tuyệt đối tới thư mục skill/addon.", true);
    const p = resolve(input.path);
    if (!existsSync(p) || !statSync(p).isDirectory()) return reply(`Không thấy thư mục: ${p}`, true);
    src = p;
    if (!name) name = basename(p);
    const ok =
      kind === "skill"
        ? existsSync(resolve(p, "SKILL.md"))
        : existsSync(resolve(p, "__init__.py")) || existsSync(resolve(p, "blender_manifest.toml"));
    if (!ok) {
      return reply(kind === "skill" ? "Thư mục này không có SKILL.md." : "Thư mục này không có __init__.py hoặc blender_manifest.toml.", true);
    }
  } else {
    if (!name) return reply("Cần name hoặc path.", true);
    if (!NAME_RE.test(name)) return reply("Tên không hợp lệ. Dùng 2-64 ký tự gồm chữ, số, '-' hoặc '_'.", true);
    src = kind === "skill" ? findSkillSource(name) : findAddonSource(name, await addonRoots());
    if (!src) {
      return reply(
        kind === "skill"
          ? `Không thấy skill '${name}' trong ~/.claude/skills hoặc ~/.claude-api/skills. Nếu skill nằm trong .claude/skills của một dự án, hãy truyền path.`
          : `Không thấy addon '${name}' trong thư mục addons của Blender. Addon một file .py chưa được hỗ trợ.`,
        true,
      );
    }
  }
  if (!NAME_RE.test(name)) return reply(`Tên '${name}' không hợp lệ. Dùng 2-64 ký tự gồm chữ, số, '-' hoặc '_'.`, true);

  const checked = checkContribution(kind, name, src);
  const errors = checked.issues.filter((i) => i.level === "error");
  const warnings = checked.issues.filter((i) => i.level === "warning");
  const report =
    `Nguồn: ${src}\nTên: ${name}\nSố file: ${checked.files.length}\nTác giả khai báo: ${checked.author || "(chưa có)"}\n` +
    (errors.length ? `\nLỖI cần sửa trước khi gửi:\n${errors.map((i) => "- " + i.message).join("\n")}` : "") +
    (warnings.length ? `\nCẢNH BÁO (nên dọn trước khi gửi):\n${warnings.map((i) => "- " + i.message).join("\n")}` : "");
  if (errors.length) return reply(report + "\n\nChưa gửi gì. Hãy sửa các lỗi trên rồi gọi lại.");
  if (input.dry_run) return reply(report + "\n\nKiểm tra đạt. Chưa gửi gì (dry_run).");

  if (!input.share_confirmed) {
    return reply(
      report +
        "\n\nCHƯA GỬI. Hãy hỏi người dùng: (1) đồng ý công khai nội dung này trong kho chung" +
        (kind === "addon" ? ", (2) addon này miễn phí và giấy phép cho phép chia sẻ lại" : "") +
        ". Họ đồng ý thì gọi lại với share_confirmed=true.",
    );
  }

  const login = await ensureSession(90_000);
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
      s: login.session,
    });
    return reply(
      `Đã gửi đóng góp từ tài khoản GitHub '${login.session.login}'.\nPull Request: ${r.prUrl}\n` +
        "Chủ repo sẽ duyệt. Sau khi được gộp, danh sách trên trang web tự cập nhật trong vài phút.",
    );
  } catch (e) {
    return reply("Gửi không thành công: " + (e instanceof Error ? e.message : String(e)), true);
  }
}

export function runLogout(): Reply {
  const who = currentLogin();
  const had = logout();
  return reply(had ? `Đã đăng xuất${who ? " tài khoản " + who : ""}.` : "Chưa đăng nhập.");
}
