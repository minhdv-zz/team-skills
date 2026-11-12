import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { installSkillRpc } from "../shared/rpc";

const SITE = "https://minhdv-zz.github.io/team-skills";
const SKILLS_ZIP = "https://codeload.github.com/minhdv-zz/team-skills/zip/refs/heads/main";
const ZIP_HOSTS = new Set(["drive.horusvn.com"]);
const ADDONS_ZIP = "https://codeload.github.com/minhdv-zz/team-blender-addons/zip/refs/heads/main";

export type Target = "claude" | "claude-api";
export const TARGETS: readonly Target[] = ["claude", "claude-api"];
const TARGET_DIRS: Record<Target, string> = { claude: ".claude", "claude-api": ".claude-api" };

interface SkillEntry {
  name: string;
  title: string;
  desc: string;
  needs?: string[];
}

interface AddonEntry {
  name: string;
  title: string;
  desc: string;
  license?: string;
  needs?: string[];
  /** External download page shown on the site (manual download). */
  link?: string;
  /** Direct zip URL the plugin may download and install. Host must be in ZIP_HOSTS. */
  zip?: string;
  /** Top-level folder inside the zip (and name of the folder created in scripts/addons). Defaults to name. */
  folder?: string;
}

function skillsDir(target: Target): string {
  return join(homedir(), TARGET_DIRS[target], "skills");
}

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(SITE + "/" + file + "?t=" + Date.now());
  if (!res.ok) throw new Error("Cannot load " + file + " (HTTP " + res.status + ")");
  return (await res.json()) as T;
}

/** Download a repository zip and extract it into tmp. Returns the extracted repo root folder. */
async function fetchRepo(url: string, tmp: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed (HTTP " + res.status + ")");
  const zipPath = join(tmp, "repo.zip");
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const out = join(tmp, "x");
  mkdirSync(out);
  if (process.platform === "win32") {
    execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zipPath, "-C", out]);
  } else {
    execFileSync("unzip", ["-q", zipPath, "-d", out]);
  }
  return join(out, readdirSync(out)[0]);
}

// ---------------------------------------------------------------- skills

export async function listSkills() {
  const list = await fetchJson<SkillEntry[]>("skills.json");
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

/**
 * Install the given skills into the target skills folder. Only names published in the
 * team list are accepted. The repository zip is downloaded once for the whole batch.
 */
export async function installSkills(names: string[], target: Target): Promise<string[]> {
  if (!TARGETS.includes(target)) throw new Error("Invalid target: " + String(target));
  const list = await fetchJson<SkillEntry[]>("skills.json");
  const allowed = new Set(list.map((s) => s.name));
  for (const n of names) if (!allowed.has(n)) throw new Error("Unknown skill: " + n);
  if (names.length === 0) return [];

  const tmp = mkdtempSync(join(tmpdir(), "team-skills-"));
  try {
    const root = await fetchRepo(SKILLS_ZIP, tmp);
    const destRoot = skillsDir(target);
    mkdirSync(destRoot, { recursive: true });
    const done: string[] = [];
    for (const name of names) {
      const src = join(root, "plugins", name, "skills", name);
      if (!existsSync(src)) throw new Error("Skill folder not found in repository: " + name);
      const dest = join(destRoot, name);
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      done.push(dest);
    }
    return done;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function installSkill({ name, target }: RpcInput<typeof installSkillRpc>) {
  const [path] = await installSkills([name], target);
  return { path };
}

/** Names of skills in the team list that are not yet in the target folder. */
export async function missingSkills(target: Target): Promise<string[]> {
  const { skills } = await listSkills();
  return skills.filter((s) => !s.installed[target]).map((s) => s.name);
}

export async function allSkillNames(): Promise<string[]> {
  return (await listSkills()).skills.map((s) => s.name);
}

// ---------------------------------------------------------------- blender addons

function blenderRoot(): string {
  return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Blender Foundation", "Blender");
}

/** Blender versions that have a user config folder on this machine, newest first. */
export function blenderVersions(): string[] {
  try {
    return readdirSync(blenderRoot(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\.\d+$/.test(d.name))
      .map((d) => d.name)
      .sort((a, b) => {
        const [am, an] = a.split(".").map(Number);
        const [bm, bn] = b.split(".").map(Number);
        return bm - am || bn - an;
      });
  } catch {
    return [];
  }
}

function addonsDir(version: string): string {
  return join(blenderRoot(), version, "scripts", "addons");
}

/** Entries the plugin can install: repo addons, or link entries that also publish a direct zip. */
async function installableAddons(): Promise<AddonEntry[]> {
  return (await fetchJson<AddonEntry[]>("addons.json")).filter((a) => !a.link || a.zip);
}

const folderOf = (a: AddonEntry) => a.folder ?? a.name;

export async function listAddons() {
  const versions = blenderVersions();
  const list = await installableAddons();
  return {
    versions,
    addons: list.map((a) => ({
      name: a.name,
      title: a.title,
      desc: a.desc,
      license: a.license ?? "",
      needs: a.needs ?? [],
      installed: Object.fromEntries(versions.map((v) => [v, existsSync(join(addonsDir(v), folderOf(a)))])),
    })),
  };
}

/** Download a zip from an allowed host and extract it, checking the listing is safe. Returns the extract folder. */
async function fetchZip(url: string, folder: string, tmp: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ZIP_HOSTS.has(u.hostname)) throw new Error("Download host not allowed: " + u.hostname);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed (HTTP " + res.status + ")");
  const zipPath = join(tmp, folder + ".zip");
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const listing = execFileSync(tar, ["-tf", zipPath], { maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  for (const entry of listing) {
    const norm = entry.split("\\").join("/");
    if (norm.startsWith("/") || /^[A-Za-z]:/.test(norm) || norm.split("/").includes("..")) throw new Error("Unsafe path in zip: " + entry);
    if (norm.split("/")[0] !== folder) throw new Error("Zip must contain only the folder '" + folder + "' (found '" + entry + "')");
  }
  const out = join(tmp, "z-" + folder);
  mkdirSync(out);
  execFileSync(tar, ["-xf", zipPath, "-C", out]);
  return out;
}

/** Copy addons into scripts/addons of the given Blender version. Enable them in Preferences afterwards. */
export async function installAddons(names: string[], version: string): Promise<string[]> {
  if (!blenderVersions().includes(version)) throw new Error("Blender " + version + " not found on this machine");
  const list = await installableAddons();
  const byName = new Map(list.map((a) => [a.name, a]));
  for (const n of names) if (!byName.has(n)) throw new Error("Unknown addon: " + n);
  if (names.length === 0) return [];

  const tmp = mkdtempSync(join(tmpdir(), "team-addons-"));
  try {
    const destRoot = addonsDir(version);
    mkdirSync(destRoot, { recursive: true });
    let repoRoot: string | null = null;
    const done: string[] = [];
    for (const name of names) {
      const entry = byName.get(name)!;
      const folder = folderOf(entry);
      let src: string;
      if (entry.zip) {
        src = join(await fetchZip(entry.zip, folder, tmp), folder);
      } else {
        repoRoot ??= await fetchRepo(ADDONS_ZIP, tmp);
        src = join(repoRoot, "addons", name);
      }
      if (!existsSync(src)) throw new Error("Addon folder not found: " + name);
      const dest = join(destRoot, folder);
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      done.push(dest);
    }
    return done;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function missingAddons(version: string): Promise<string[]> {
  const { addons } = await listAddons();
  return addons.filter((a) => !a.installed[version]).map((a) => a.name);
}

export async function allAddonNames(): Promise<string[]> {
  return (await listAddons()).addons.map((a) => a.name);
}
