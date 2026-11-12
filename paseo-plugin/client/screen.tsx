import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import {
  Loading,
  ScrollView,
  SettingsAction,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { installSkillRpc, listSkillsRpc, skillItemSchema } from "../shared/rpc";

type Target = "claude" | "claude-api";
type Skill = z.output<typeof skillItemSchema>;

export function TeamSkillsScreen(_props: PluginSurfaceProps) {
  const list = useRpc(listSkillsRpc);
  const install = useRpc(installSkillRpc);
  const toast = useToast();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("claude");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSkills((await list({})).skills);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const onInstall = async (name: string) => {
    setBusy(name);
    try {
      const r = await install({ name, target });
      toast.show("Installed " + name + " -> " + r.path, { variant: "success" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView>
      <SettingsSection title="Install to">
        <SettingsSelect<Target>
          label="Skills folder"
          hint="Restart Claude Code after installing."
          value={target}
          options={[
            { label: "Claude Code (~/.claude/skills)", value: "claude" },
            { label: "Claude API profile (~/.claude-api/skills)", value: "claude-api" },
          ]}
          onValueChange={setTarget}
        />
      </SettingsSection>
      <SettingsSection title="Team skills">
        {error ? <SettingsRow label="Could not load skills" error={error} /> : null}
        {!skills && !error ? <Loading /> : null}
        {skills?.map((s) => (
          <SettingsAction
            key={s.name}
            label={s.title + (s.installed[target] ? "  (installed)" : "")}
            hint={s.desc + (s.needs.length ? "  Needs: " + s.needs.join(", ") : "")}
            actionLabel={busy === s.name ? "Installing..." : s.installed[target] ? "Update" : "Install"}
            disabled={busy !== null}
            onPress={() => void onInstall(s.name)}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}
