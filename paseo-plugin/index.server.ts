import type { PluginServerContext } from "@getpaseo/plugin/server";
import { installSkillRpc, listSkillsRpc } from "./shared/rpc";
import { installSkill, listSkills } from "./server/handlers";
import { startHttp } from "./server/http";

export default function contribute(server: PluginServerContext) {
  server.handle(listSkillsRpc, listSkills);
  server.handle(installSkillRpc, installSkill);
  const stopHttp = startHttp();
  return () => {
    stopHttp();
  };
}
