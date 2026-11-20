import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * One-time guide for the Tripo auto-login userscript. The first time Team Skills runs on a machine it opens a local
 * page (served by http.ts) in the default browser. The page links to the userscript manager and to the script.
 * Browsers always ask the user to confirm an install, so the user still clicks "Add" and "Install": nothing is installed silently.
 */

export const TRIPO_SETUP_PATH = "/tripo-setup";

const SCRIPT_URL = "https://raw.githubusercontent.com/minhdv-zz/team-skills/main/docs/tripo-autologin.user.js";
const MANAGERS = {
  firefox: { label: "Firefox", name: "Violentmonkey", url: "https://addons.mozilla.org/firefox/addon/violentmonkey/" },
  chrome: { label: "Chrome", name: "Tampermonkey", url: "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" },
  edge: { label: "Edge", name: "Tampermonkey", url: "https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd" },
} as const;
type BrowserKey = keyof typeof MANAGERS;

const MARKER_DIR = join(homedir(), ".team-skills");
const MARKER = join(MARKER_DIR, "tripo-setup-done");

/** The page is opened by the default browser, so its User-Agent tells which store link to show first. Chromium browsers share Chrome's store. */
function browserOf(userAgent: string | undefined): BrowserKey {
  const ua = userAgent ?? "";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\//.test(ua)) return "edge";
  return "chrome";
}

/** Static page: the only input is the User-Agent, which only picks one of three fixed links. */
export function tripoSetupHtml(userAgent: string | undefined): string {
  const mine = browserOf(userAgent);
  const m = MANAGERS[mine];
  const others = (Object.keys(MANAGERS) as BrowserKey[])
    .filter((k) => k !== mine)
    .map((k) => `<a href="${MANAGERS[k].url}" target="_blank" rel="noopener noreferrer">${MANAGERS[k].name} (${MANAGERS[k].label})</a>`)
    .join(" · ");
  const chromium =
    mine === "firefox"
      ? ""
      : `<p class="fine">Nếu cài xong mà script không chạy: vào trang quản lý tiện ích của ${m.label}, bật <b>Allow User Scripts</b> (hoặc <b>Developer mode</b>) cho Tampermonkey.</p>`;
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Team Skills: tự đăng nhập Tripo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1a1a1a}
h1{font-size:22px}.step{border:1px solid #d0d0d0;border-radius:10px;padding:14px 16px;margin:14px 0}
.btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600}
.fine{color:#555;font-size:14px}
</style></head><body>
<h1>Bật tự đăng nhập Tripo (làm một lần)</h1>
<p>Cài xong thì bấm "Mở Tripo Studio" trong tab Tài khoản Tripo của Team Tools là tự đăng nhập. Trình duyệt sẽ hỏi bạn xác nhận ở mỗi bước, không có gì được cài ngầm.</p>
<div class="step"><b>Bước 1.</b> Cài tiện ích ${m.name} cho ${m.label}, bấm <b>Add</b> (Thêm) khi trình duyệt hỏi.<br><br>
<a class="btn" href="${m.url}" target="_blank" rel="noopener noreferrer">Cài ${m.name}</a>
<p class="fine">Trình duyệt khác: ${others}</p></div>
<div class="step"><b>Bước 2.</b> Sau khi xong bước 1, cài script tự đăng nhập, bấm <b>Install</b> (Cài đặt).<br><br>
<a class="btn" href="${SCRIPT_URL}" target="_blank" rel="noopener noreferrer">Cài script Tripo</a>
${chromium}</div>
<p class="fine">Không dùng tài khoản Tripo của nhóm thì đóng tab này. Trang này chỉ tự mở một lần trên máy này.</p>
</body></html>`;
}

/**
 * Open a URL with the operating system's default browser. Resolves false when no opener could be started or it failed fast
 * (for example xdg-open with no default browser). An opener still running after 2 seconds counts as success.
 */
function openUrl(url: string): Promise<boolean> {
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
      const timer = setTimeout(() => {
        child.unref();
        resolve(true);
      }, 2000);
      child.once("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Linux without a graphical session (a server, SSH): there is no browser to open. */
function hasDisplay(): boolean {
  return process.platform !== "linux" || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/**
 * Open the guide page once per machine. Never throws. Set TEAM_SKILLS_NO_OPEN=1 to turn it off.
 * The marker is written only after the opener started, so a machine that could not open a browser tries again next time.
 */
export async function openTripoSetupOnce(port: number): Promise<void> {
  try {
    if (process.env.TEAM_SKILLS_NO_OPEN === "1" || existsSync(MARKER) || !hasDisplay()) return;
    if (!(await openUrl(`http://127.0.0.1:${port}${TRIPO_SETUP_PATH}`))) return;
    mkdirSync(MARKER_DIR, { recursive: true });
    writeFileSync(MARKER, new Date().toISOString() + "\n");
  } catch (e) {
    console.error("[team-skills] tripo setup page not opened: " + (e instanceof Error ? e.message : String(e)));
  }
}
