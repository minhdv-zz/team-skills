import type { PluginServerContext } from "@getpaseo/plugin/server";
import { installSkillRpc, listSkillsRpc } from "./shared/rpc";
import { installSkill, listSkills } from "./server/handlers";
import { startHttp } from "./server/http";
import { contributeTools } from "./server/tools";

export default function contribute(server: PluginServerContext) {
  server.handle(listSkillsRpc, listSkills);
  server.handle(installSkillRpc, installSkill);

  // Give every agent session the contribution tools, so a user can just ask Claude to share a skill or addon.
  const removeHook = server.addHook("agent.open.before", async ({ request }) => {
    const have = new Set(request.tools.map((t) => t.name));
    request.tools = [...request.tools, ...contributeTools.filter((t) => !have.has(t.name))];
    return request;
  });

  const stopHttp = startHttp();
  return () => {
    removeHook();
    stopHttp();
  };
}
