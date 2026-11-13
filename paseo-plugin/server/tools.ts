import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
import { runContribute, runListLocal, runLogout } from "./agent";

// These tools are attached to agent sessions by the plugin. Some Paseo setups do not expose plugin tools
// to the agent, so the same workflow is also reachable through the /agent/* endpoints (see http.ts and the
// prompt copied from the website's Contribute tab), which is the path the team actually relies on.

const listLocal = defineAgentTool({
  name: "team_skills_list_local",
  title: "Liệt kê skill và addon trên máy này",
  description:
    "List the Claude skills and Blender addons installed on this machine and whether each already exists in the shared Team Skills lists.",
  input: z.object({}),
  async execute() {
    return runListLocal();
  },
});

const contribute = defineAgentTool({
  name: "team_skills_contribute",
  title: "Đóng góp skill hoặc addon lên Team Skills",
  description:
    "Contribute a local Claude skill or Blender addon to the shared team repositories by opening a GitHub Pull Request that the owner reviews. " +
    "Call with dry_run=true first and fix reported errors; ask the user to confirm publishing (and, for addons, that it is free and redistributable) " +
    "before calling with share_confirmed=true. If the user is not signed in to GitHub, the GitHub sign-in page opens and a code is returned: " +
    "tell the user to enter it, then call again.",
  input: z.object({
    kind: z.enum(["skill", "addon"]),
    name: z.string().optional(),
    path: z.string().optional().describe("Absolute folder path, for skills kept in a project's .claude/skills"),
    dry_run: z.boolean().optional(),
    share_confirmed: z.boolean().optional(),
    replace_existing: z.boolean().optional(),
  }),
  async execute(input) {
    return runContribute(input);
  },
});

const signOut = defineAgentTool({
  name: "team_skills_logout",
  title: "Đăng xuất GitHub của Team Skills",
  description: "Forget the GitHub sign-in used for contributing.",
  input: z.object({}),
  async execute() {
    return runLogout();
  },
});

export const contributeTools = [listLocal, contribute, signOut];
