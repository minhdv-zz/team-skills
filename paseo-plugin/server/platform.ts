import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

// ------------------------------------------------------------------ paths

/** Show a path with forward slashes. Only Windows paths are rewritten: on Linux/macOS a backslash is a legal file-name character. */
export function toSlash(p: string): string {
  return isWin ? p.split("\\").join("/") : p;
}

/** Key for comparing two paths: Windows and macOS file systems ignore case, Linux does not. */
export function pathKey(p: string): string {
  return isWin || isMac ? p.toLowerCase() : p;
}

// ------------------------------------------------------------------ Blender user folders

/** Folders that can hold Blender's per-version config folders (`5.2`, `4.5`...), in the order they are tried. */
export function blenderRoots(): string[] {
  const home = homedir();
  if (isWin) return [join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Blender Foundation", "Blender")];
  if (isMac) return [join(home, "Library", "Application Support", "Blender")];
  const xdg = process.env.XDG_CONFIG_HOME;
  return [
    join(xdg && xdg.startsWith("/") ? xdg : join(home, ".config"), "blender"),
    join(home, ".var", "app", "org.blender.Blender", "config", "blender"), // Flatpak
    join(home, "snap", "blender", "current", ".config", "blender"), // Snap
  ];
}

/** Blender versions that have a user config folder on this machine, newest first. */
export function blenderVersions(): string[] {
  const found = new Set<string>();
  for (const root of blenderRoots()) {
    try {
      for (const d of readdirSync(root, { withFileTypes: true })) {
        if (d.isDirectory() && /^\d+\.\d+$/.test(d.name)) found.add(d.name);
      }
    } catch {
      /* this root does not exist */
    }
  }
  return [...found].sort((a, b) => {
    const [am, an] = a.split(".").map(Number);
    const [bm, bn] = b.split(".").map(Number);
    return bm - am || bn - an;
  });
}

/** `scripts/addons` of one Blender version: in the root that already has that version, else in the default root. */
export function addonsDir(version: string): string {
  const roots = blenderRoots();
  const root = roots.find((r) => existsSync(join(r, version))) ?? roots[0];
  return join(root, version, "scripts", "addons");
}

/**
 * Ids of the Blender 4.2+ extensions installed for one version: folders in `extensions/<repository>/`.
 * `versionDir` is the version folder of the running Blender when it is known (it can live outside the default roots).
 */
export function extensionIds(version: string, versionDir?: string): Set<string> {
  const dirs = new Set(blenderRoots().map((r) => join(r, version)));
  if (versionDir) dirs.add(versionDir);
  const ids = new Set<string>();
  for (const dir of dirs) {
    try {
      for (const repo of readdirSync(join(dir, "extensions"), { withFileTypes: true })) {
        if (!repo.isDirectory() || repo.name.startsWith(".")) continue;
        for (const ext of readdirSync(join(dir, "extensions", repo.name), { withFileTypes: true })) {
          if (ext.isDirectory() && !ext.name.startsWith(".")) ids.add(ext.name);
        }
      }
    } catch {
      /* no extensions folder for this version */
    }
  }
  return ids;
}

// ------------------------------------------------------------------ zip files

const NO_ZIP_TOOL =
  process.platform === "linux"
    ? "Máy chưa có công cụ giải nén zip. Cài một trong hai: unzip (sudo apt install unzip) hoặc python3."
    : "Không tìm thấy công cụ giải nén zip (tar/unzip) trên máy này.";

const PY_LIST = "import sys, zipfile\nprint('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))";
const PY_EXTRACT = "import sys, zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])";

/** Run a program; null when the program is not installed, so the caller can try the next one. */
function tryRun(cmd: string, args: string[]): Buffer | null {
  try {
    return execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function winTar(): string {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
}

/** File names stored in a zip. */
export function zipList(zipPath: string): string[] {
  const out = isWin
    ? (tryRun(winTar(), ["-tf", zipPath]) ?? tryRun("tar", ["-tf", zipPath]))
    : (tryRun("unzip", ["-Z1", zipPath]) ?? tryRun("bsdtar", ["-tf", zipPath]) ?? tryRun("python3", ["-I", "-c", PY_LIST, zipPath]));
  if (!out) throw new Error(NO_ZIP_TOOL);
  return out.toString("utf8").split(/\r?\n/).filter(Boolean);
}

/** Extract a zip into an existing, empty folder. */
export function zipExtract(zipPath: string, outDir: string): void {
  const done = isWin
    ? (tryRun(winTar(), ["-xf", zipPath, "-C", outDir]) ?? tryRun("tar", ["-xf", zipPath, "-C", outDir]))
    : (tryRun("unzip", ["-q", "-o", zipPath, "-d", outDir]) ??
      tryRun("bsdtar", ["-xf", zipPath, "-C", outDir]) ??
      tryRun("python3", ["-I", "-c", PY_EXTRACT, zipPath, outDir]));
  if (!done) throw new Error(NO_ZIP_TOOL);
}

// ------------------------------------------------------------------ Paseo command line

/** Where the Paseo desktop app puts its `paseo` command when it is not on PATH. */
function paseoCandidates(): string[] {
  const home = homedir();
  if (isWin) return [join(process.env.LOCALAPPDATA ?? "", "Programs", "Paseo", "resources", "bin", "paseo.cmd")];
  if (isMac) {
    return [
      "/Applications/Paseo.app/Contents/Resources/bin/paseo",
      join(home, "Applications", "Paseo.app", "Contents", "Resources", "bin", "paseo"),
      "/usr/local/bin/paseo",
      "/opt/homebrew/bin/paseo",
    ];
  }
  return ["/opt/Paseo/resources/bin/paseo", join(home, ".local", "bin", "paseo"), "/usr/local/bin/paseo", "/usr/bin/paseo"];
}

/** Absolute path of the `paseo` command, or null when it cannot be found. PATH first, then the app's own folder. */
export function findPaseo(): string | null {
  const names = isWin ? ["paseo.cmd", "paseo.exe"] : ["paseo"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) return p;
    }
  }
  return paseoCandidates().find((p) => existsSync(p)) ?? null;
}
