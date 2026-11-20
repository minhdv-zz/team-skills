/**
 * Team Skills, standalone build: works without Paseo.
 *
 *   node team-skills.mjs serve   local endpoint on 127.0.0.1:47653 (the Team Tools web page talks to it)
 *   node team-skills.mjs mcp     MCP server over stdio (Claude Code, Cursor, Codex and any other MCP client)
 *
 * Built into one file by `npm run build:standalone`; the Paseo plugin uses the same server code.
 */
import { createInterface } from "node:readline";
import { runContribute, runListLocal, runLogout, type ContributeInput } from "../server/agent";
import { PORT, startHttp } from "../server/http";

const VERSION = "1.0.0";

const TOOLS = [
  {
    name: "team_skills_list_local",
    description:
      "List the Claude skills and Blender addons installed on this machine and whether each already exists in the shared Team Skills lists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "team_skills_contribute",
    description:
      "Contribute a local Claude skill or Blender addon to the shared team repositories by opening a GitHub Pull Request that the owner reviews. " +
      "Call with dry_run=true first and fix reported errors; ask the user to confirm publishing (and, for addons, that it is free and redistributable) " +
      "before calling with share_confirmed=true. If the user is not signed in to GitHub, the sign-in page opens and a code is returned: " +
      "tell the user to enter it, then call again.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["skill", "addon"] },
        name: { type: "string" },
        path: { type: "string", description: "Absolute folder path, for skills kept in a project's .claude/skills" },
        dry_run: { type: "boolean" },
        share_confirmed: { type: "boolean" },
        replace_existing: { type: "boolean" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "team_skills_logout",
    description: "Forget the GitHub sign-in used for contributing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "team_skills_list_local") return runListLocal();
  if (name === "team_skills_contribute") return runContribute(args as unknown as ContributeInput);
  if (name === "team_skills_logout") return runLogout();
  return { text: "Unknown tool: " + name, isError: true };
}

function serveMcp() {
  const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin });
  let busy = 0;
  let closed = false;
  const done = () => {
    busy--;
    if (closed && busy === 0) process.exit(0);
  };
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: { id?: number | string; method?: string; params?: any };
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const { id, method, params } = msg;
    if (id === undefined) return; // notification (initialized, cancelled...): nothing to answer
    const ok = (result: unknown) => send({ jsonrpc: "2.0", id, result });
    const fail = (code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });
    if (method === "initialize") {
      return ok({
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "team-skills", version: VERSION },
      });
    }
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call") {
      busy++;
      callTool(String(params?.name), (params?.arguments ?? {}) as Record<string, unknown>)
        .then((r) => ok({ content: [{ type: "text", text: r.text }], isError: r.isError }))
        .catch((e) => ok({ content: [{ type: "text", text: String(e instanceof Error ? e.message : e) }], isError: true }))
        .finally(done);
      return;
    }
    fail(-32601, "Method not found: " + method);
  });
  rl.on("close", () => {
    closed = true;
    if (busy === 0) process.exit(0);
  });
}

const mode = process.argv[2] ?? "serve";
if (mode === "mcp") {
  // stdout carries the protocol: anything printed with console.log would corrupt it.
  console.log = console.error;
  serveMcp();
} else if (mode === "serve") {
  startHttp({
    onListening: () => console.log(`Team Skills đang chạy tại http://127.0.0.1:${PORT} . Giữ cửa sổ này mở, đóng là dừng.`),
    onError: (e) => {
      console.error(`Không mở được cổng ${PORT} (${e.message}). Có thể Team Skills hoặc plugin Paseo đã chạy sẵn.`);
      process.exit(1);
    },
  });
} else {
  console.error("Cách dùng: node team-skills.mjs serve | mcp");
  process.exit(1);
}
