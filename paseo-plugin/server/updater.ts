import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findPaseo } from "./platform";

/** When this plugin process started. A new value after an update tells the web page the new build is running. */
export const STARTED_AT = Date.now();

/** Create this file to stop the plugin from updating itself in the background. */
const OPT_OUT = join(homedir(), ".team-skills", "no-auto-update");

/** Run `paseo plugin update team-skills --yes` in the background. The plugin restarts itself when an update is applied. */
export function runUpdate(): { ok: boolean; error?: string } {
  const paseo = findPaseo();
  if (!paseo) return { ok: false, error: "Không tìm thấy lệnh paseo trên máy này (có thể không chạy qua Paseo). Hãy dùng nút Copy lời nhờ cài ở đầu trang." };
  const args = ["plugin", "update", "team-skills", "--yes"];
  try {
    // Windows ships paseo as a .cmd file, which only runs through a shell. Elsewhere it is run directly (no quoting problems).
    const child =
      process.platform === "win32"
        ? spawn(`"${paseo}" ${args.join(" ")}`, { shell: true, detached: true, stdio: "ignore", windowsHide: true })
        : spawn(paseo, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Check for a new version shortly after start and then every 6 hours. Returns a cleanup. */
export function startAutoUpdate(): () => void {
  const tick = () => {
    if (!existsSync(OPT_OUT)) runUpdate();
  };
  const first = setTimeout(tick, 90_000);
  const every = setInterval(tick, 6 * 3600_000);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
