import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { installSkillRpc } from "../shared/rpc";

const SITE = "https://minhdv-zz.github.io/team-skills";
const ZIP = "https://codeload.github.com/minhdv-zz/team-skills/zip/refs/heads/main";

type Target = "claude" | "claude-api";
const TARGET_DIRS: Record<Target, string> = { claude: ".claude", "claude-api": ".claude-api" };

interface SkillEntry {
  name: string;
  title: string;
  desc: string;
  needs?: string[];
}

function skillsDir(target: Target): string {
  return join(homedir(), TARGET_DIRS[target], "skills");
}

async function fetchList(): Promise<SkillEntry[]> {
  const res = await fetch(SITE + "/skills.json?t=" + Date.now());
  if (!res.ok) throw new Error("Cannot load skills list (HTTP " + res.status + ")");
  return (await res.json()) as SkillEntry[];
}

export async function listSkills() {
  const list = await fetchList();
  return {
    skills: list.map((s) => ({
      name: s.name,
      title: s.title,
      desc: s.desc,
      needs: s.needs ?? [],
      installed: {
        claude: existsSync(join(skillsDir("claude"), s.name)),
        "claude-api": existsSync(join(skillsDir("claude-api"), s.name)),
      },
    })),
  };
}

export async function installSkill({ name, target }: RpcInput<typeof installSkillRpc>) {
  // Only names published in the team list may be installed.
  const list = await fetchList();
  if (!list.some((s) => s.name === name)) throw new Error("Unknown skill: " + name);

  const tmp = mkdtempSync(join(tmpdir(), "team-skills-"));
  try {
    const res = await fetch(ZIP);
    if (!res.ok) throw new Error("Download failed (HTTP " + res.status + ")");
    const zipPath = join(tmp, "repo.zip");
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const out = join(tmp, "x");
    mkdirSync(out);
    if (process.platform === "win32") execFileSync(process.env.SystemRoot + "\System32\tar.exe", ["-xf", zipPath, "-C", out]);
    else execFileSync("unzip", ["-q", zipPath, "-d", out]);

    const root = readdirSync(out)[0];
    const src = join(out, root, "plugins", name, "skills", name);
    if (!existsSync(src)) throw new Error("Skill folder not found in repository: " + name);

    const destRoot = skillsDir(target);
    mkdirSync(destRoot, { recursive: true });
    const dest = join(destRoot, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    return { path: dest };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
