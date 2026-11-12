import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
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
} from "./contribute";

const text = (t: string, isError = false) => ({ text: t, isError });

const listLocal = defineAgentTool({
  name: "team_skills_list_local",
  title: "Liệt kê skill và addon trên máy này",
  description:
    "List the Claude skills (in ~/.claude/skills and ~/.claude-api/skills) and Blender addons installed on this machine, " +
    "and whether each already exists in the shared Team Skills lists. Use it to find what the user can contribute.",
  input: z.object({}),
  async execute() {
    const team = await teamNames();
    const skills = new Map<string, boolean>();
    for (const root of skillDirs()) for (const n of listDirs(root)) skills.set(n, team.skills.has(n));
    const addons = new Map<string, boolean>();
    for (const root of await addonRoots()) for (const n of listDirs(root)) if (NAME_RE.test(n)) addons.set(n, team.addons.has(n));
    const fmt = (m: Map<string, boolean>) =>
      [...m].map(([n, shared]) => `- ${n}${shared ? " (đã có trong kho chung)" : ""}`).join("\n") || "(không có)";
    return text(`Skill trên máy:\n${fmt(skills)}\n\nAddon Blender trên máy:\n${fmt(addons)}`);
  },
});

const contribute = defineAgentTool({
  name: "team_skills_contribute",
  title: "Đóng góp skill hoặc addon lên Team Skills",
  description:
    "Contribute a local Claude skill or Blender addon to the shared team repositories by opening a GitHub Pull Request " +
    "that the repository owner reviews. Steps: (1) call with dry_run=true to validate; if it reports errors, fix the files " +
    "(e.g. add an `author:` line to SKILL.md, remove secrets or personal paths) after asking the user; " +
    "(2) ASK the user to confirm the content may be made public (and, for addons, that the addon is free and its licence allows redistribution), " +
    "then call again with share_confirmed=true; (3) if the user is not signed in to GitHub the tool opens the GitHub sign-in page and returns a code: " +
    "tell the user to enter it, then call the tool again. Never set share_confirmed=true without the user's explicit agreement.",
  input: z.object({
    kind: z.enum(["skill", "addon"]).describe("skill = a folder in ~/.claude/skills, addon = a Blender addon folder"),
    name: z.string().describe("Folder name of the skill or addon"),
    dry_run: z.boolean().optional().describe("Only validate, do not sign in or send anything"),
    share_confirmed: z.boolean().optional().describe("The user explicitly agreed to publish this content"),
    replace_existing: z.boolean().optional().describe("Send an update for a name that already exists in the shared repo"),
  }),
  async execute(input) {
    const { kind, name } = input;
    if (!NAME_RE.test(name)) return text("Tên không hợp lệ. Dùng 2-64 ký tự gồm chữ, số, '-' hoặc '_'.", true);

    const src = kind === "skill" ? findSkillSource(name) : findAddonSource(name, await addonRoots());
    if (!src) {
      return text(
        kind === "skill"
          ? `Không thấy skill '${name}' (cần thư mục có SKILL.md trong ~/.claude/skills hoặc ~/.claude-api/skills). Dùng team_skills_list_local để xem danh sách.`
          : `Không thấy addon '${name}' (cần thư mục có __init__.py hoặc blender_manifest.toml trong thư mục addons của Blender). Addon một file .py chưa được hỗ trợ.`,
        true,
      );
    }

    const checked = checkContribution(kind, name, src);
    const errors = checked.issues.filter((i) => i.level === "error");
    const warnings = checked.issues.filter((i) => i.level === "warning");
    const report =
      `Nguồn: ${src}\nSố file: ${checked.files.length}\nTác giả khai báo: ${checked.author || "(chưa có)"}\n` +
      (errors.length ? `\nLỖI cần sửa trước khi gửi:\n${errors.map((i) => "- " + i.message).join("\n")}` : "") +
      (warnings.length ? `\nCảnh báo:\n${warnings.map((i) => "- " + i.message).join("\n")}` : "");
    if (errors.length) return text(report + "\n\nChưa gửi gì. Hãy sửa các lỗi trên rồi gọi lại.");
    if (input.dry_run) return text(report + "\n\nKiểm tra đạt. Chưa gửi gì (dry_run).");

    if (!input.share_confirmed) {
      return text(
        report +
          "\n\nCHƯA GỬI. Hãy hỏi người dùng: (1) đồng ý công khai nội dung này trong kho chung" +
          (kind === "addon" ? ", (2) addon này miễn phí và giấy phép cho phép chia sẻ lại" : "") +
          ". Họ đồng ý thì gọi lại với share_confirmed=true.",
      );
    }

    const login = await ensureSession(90_000);
    if (!login.session) return text(login.message);

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
      return text(
        `Đã gửi đóng góp từ tài khoản GitHub '${login.session.login}'.\nPull Request: ${r.prUrl}\n` +
          "Chủ repo sẽ duyệt. Sau khi được gộp, danh sách trên trang web tự cập nhật trong vài phút.",
      );
    } catch (e) {
      return text("Gửi không thành công: " + (e instanceof Error ? e.message : String(e)), true);
    }
  },
});

const signOut = defineAgentTool({
  name: "team_skills_logout",
  title: "Đăng xuất GitHub của Team Skills",
  description: "Forget the GitHub sign-in used for contributing (the token only lives in memory anyway).",
  input: z.object({}),
  async execute() {
    const who = currentLogin();
    const had = logout();
    return text(had ? `Đã đăng xuất${who ? " tài khoản " + who : ""}.` : "Chưa đăng nhập.");
  },
});

export const contributeTools = [listLocal, contribute, signOut];
