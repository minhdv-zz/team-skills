import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TeamSkillsScreen } from "./client/screen";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "team-skills",
    title: "Team Skills",
    icon: "Download",
    Component: TeamSkillsScreen,
  });
  return () => {};
}
