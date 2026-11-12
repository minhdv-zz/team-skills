import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const targetSchema = z.enum(["claude", "claude-api"]);

export const skillItemSchema = z.object({
  name: z.string(),
  title: z.string(),
  desc: z.string(),
  needs: z.array(z.string()),
  installed: z.object({ claude: z.boolean(), "claude-api": z.boolean() }),
});

export const listSkillsRpc = defineRpc({
  name: "team-skills.list",
  input: z.object({}),
  output: z.object({ skills: z.array(skillItemSchema) }),
});

export const installSkillRpc = defineRpc({
  name: "team-skills.install",
  input: z.object({ name: z.string(), target: targetSchema }),
  output: z.object({ path: z.string() }),
});
