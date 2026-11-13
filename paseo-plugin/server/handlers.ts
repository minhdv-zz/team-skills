import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { installSkillRpc } from "../shared/rpc";

const SITE = "https://minhdv-zz.github.io/team-skills";
const SKILLS_ZIP = "https://codeload.github.com/minhdv-zz/team-skills/zip/refs/heads/main";
const ADDONS_ZIP = "https://codeload.github.com/minhdv-zz/team-blender-addons/zip/refs/heads/main";
const ZIP_HOSTS = new Set(["drive.horusvn.com"]);
/** Default port of the "MCP for Blender" addon's local socket server. */
const BLENDER_PORT = 9876;

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

function winTar(): string {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
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
    execFileSync(winTar(), ["-xf", zipPath, "-C", out]);
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

// ---------------------------------------------------------------- talking to a running Blender

/** One JSON command to the MCP for Blender addon's local socket. Rejects if Blender is not reachable. */
function blenderCall(type: string, params: Record<string, unknown>, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host: "127.0.0.1", port: BLENDER_PORT });
    let buf = "";
    let settled = false;
    const finish = (fn: () => void) => {
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
        finish(() => resolve(msg));
      } catch {
        /* wait for more data */
      }
    });
    sock.on("error", (e) => finish(() => reject(e)));
  });
}

/** Run python in the running Blender and return what it printed. */
async function blenderRun(code: string, timeoutMs = 30000): Promise<string> {
  const r = await blenderCall("execute_code", { code }, timeoutMs);
  if (r.status !== "success") throw new Error("Blender: " + String(r.message ?? "error").slice(0, 400));
  return String(r.result?.result ?? "");
}

interface LiveBlender {
  version: string;
  addonsPath: string;
  dirs: string[];
}

/** Ask the running Blender where its user addons folder is and what is already in it. Null if not reachable. */
async function liveBlender(): Promise<LiveBlender | null> {
  try {
    const ping = await blenderCall("ping", {}, 1500);
    if (ping.status !== "success") return null;
    const out = await blenderRun(
      [
        "import bpy, os, json",
        "p = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)",
        "print(json.dumps({'version': '%d.%d' % tuple(bpy.app.version[:2]), 'path': p, 'dirs': sorted(os.listdir(p))}))",
      ].join("\n"),
      8000,
    );
    const j = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    return { version: String(j.version), addonsPath: String(j.path), dirs: (j.dirs as string[]) ?? [] };
  } catch {
    return null;
  }
}

interface EnableResult {
  enabled: boolean;
  note: string;
}

/** Enable an addon folder in the running Blender unless an addon with the same display name is already enabled. */
async function enableInBlender(folder: string): Promise<EnableResult> {
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
    "print(json.dumps(res))",
  ].join("\n");
  try {
    const out = await blenderRun(code);
    const j = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    return { enabled: Boolean(j.enabled), note: String(j.note ?? "") };
  } catch (e) {
    return { enabled: false, note: e instanceof Error ? e.message : String(e) };
  }
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
  const live = await liveBlender();
  const versions = live ? [live.version] : blenderVersions();
  const list = await installableAddons();
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
        versions.map((v) => [v, live ? live.dirs.includes(folderOf(a)) : existsSync(join(addonsDir(v), folderOf(a)))]),
      ),
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
  const tar = winTar();
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

export interface AddonInstallResult {
  paths: string[];
  /** "blender" when installed through the running Blender (and enabled), else "files". */
  via: "blender" | "files";
  notes: { name: string; enabled: boolean; note: string }[];
}

/**
 * Install addons. If a Blender with the MCP socket is running, copy into its real addons folder and
 * enable them there; otherwise copy into scripts/addons of the given Blender version (enable by hand).
 */
export async function installAddons(names: string[], version: string): Promise<AddonInstallResult> {
  const live = await liveBlender();
  if (live ? version !== live.version : !blenderVersions().includes(version)) {
    throw new Error("Blender " + version + " not found on this machine");
  }
  const list = await installableAddons();
  const byName = new Map(list.map((a) => [a.name, a]));
  for (const n of names) if (!byName.has(n)) throw new Error("Unknown addon: " + n);
  if (names.length === 0) return { paths: [], via: live ? "blender" : "files", notes: [] };

  const tmp = mkdtempSync(join(tmpdir(), "team-addons-"));
  try {
    const destRoot = live ? live.addonsPath : addonsDir(version);
    mkdirSync(destRoot, { recursive: true });
    let repoRoot: string | null = null;
    const paths: string[] = [];
    const notes: AddonInstallResult["notes"] = [];
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
      paths.push(dest);
      if (live) {
        const r = await enableInBlender(folder);
        notes.push({ name, enabled: r.enabled, note: r.note });
      }
    }
    return { paths, via: live ? "blender" : "files", notes };
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

/** Folders where the user's Blender addons live: the running Blender's first, then each installed version. */
export async function addonRoots(): Promise<string[]> {
  const live = await liveBlender();
  const roots = live ? [live.addonsPath] : [];
  for (const v of blenderVersions()) roots.push(addonsDir(v));
  return [...new Set(roots)];
}

/** Names already published in the team lists (empty sets if the site cannot be reached). */
export async function teamNames(): Promise<{ skills: Set<string>; addons: Set<string> }> {
  const out = { skills: new Set<string>(), addons: new Set<string>() };
  try {
    for (const s of await fetchJson<SkillEntry[]>("skills.json")) out.skills.add(s.name);
    for (const a of await fetchJson<AddonEntry[]>("addons.json")) {
      out.addons.add(a.name);
      if (a.folder) out.addons.add(a.folder);
    }
  } catch {
    /* offline: report everything as not yet shared */
  }
  return out;
}

// ---------------------------------------------------------------- uninstall

/** Remove a folder, retrying on Windows file locks, and explain the usual causes in plain words. */
function removeFolder(dest: string): void {
  try {
    rmSync(dest, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new Error(
        "Không xóa được vì có file đang được dùng (" + code + "). Hãy đóng Claude Code hoặc Blender đang mở rồi thử lại. Thư mục: " + dest,
      );
    }
    throw e;
  }
}

/** Remove skills from the target skills folder. Only names published in the team list are accepted. */
export async function uninstallSkills(names: string[], target: Target): Promise<string[]> {
  if (!TARGETS.includes(target)) throw new Error("Invalid target: " + String(target));
  const list = await fetchJson<SkillEntry[]>("skills.json");
  const allowed = new Set(list.map((s) => s.name));
  for (const n of names) if (!allowed.has(n)) throw new Error("Unknown skill: " + n);
  const removed: string[] = [];
  for (const name of names) {
    const dest = join(skillsDir(target), name);
    if (existsSync(dest)) {
      removeFolder(dest);
      removed.push(dest);
    }
  }
  return removed;
}

/**
 * Remove addons from Blender. With a running Blender (MCP socket) each addon is disabled first and the
 * preferences saved, then its folder is deleted; otherwise only the folder is deleted.
 * Only addons published in the team list are accepted.
 */
export async function uninstallAddons(names: string[], version: string): Promise<{ paths: string[]; via: "blender" | "files" }> {
  const live = await liveBlender();
  if (live ? version !== live.version : !blenderVersions().includes(version)) {
    throw new Error("Blender " + version + " not found on this machine");
  }
  const list = await installableAddons();
  const byName = new Map(list.map((a) => [a.name, a]));
  for (const n of names) if (!byName.has(n)) throw new Error("Unknown addon: " + n);

  const destRoot = live ? live.addonsPath : addonsDir(version);
  const paths: string[] = [];
  for (const name of names) {
    const folder = folderOf(byName.get(name)!);
    const dest = join(destRoot, folder);
    if (!existsSync(dest)) continue;
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
          "print('ok')",
        ].join("\n"),
      ).catch(() => "");
    }
    removeFolder(dest);
    paths.push(dest);
  }
  return { paths, via: live ? "blender" : "files" };
}
