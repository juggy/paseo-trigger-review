import { usePaseo, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  DEFAULT_REVIEW_CONFIG,
  FINISH_ACTIONS,
  type FinishAction,
  type Placement,
  type ReviewConfig,
  type ReviewSettingsValues,
  reviewSettings,
} from "../shared/settings";

const DEFAULTS_SCOPE = "__defaults__";

interface ProjectOption {
  id: string;
  name: string;
  path: string;
}

interface ProviderOption {
  id: string;
  label: string;
  ready: boolean;
  defaultModeId: string | null;
  modes: { id: string; label: string }[];
  models: {
    id: string;
    label: string;
    isDefault: boolean;
    thinkingOptions: { id: string; label: string }[];
  }[];
}

const FINISH_ACTION_LABELS: Record<FinishAction, string> = {
  "send-to-source": "Send findings to the original agent",
  "send-to-source-and-archive": "Send findings, then archive the reviewer",
  "prompt-reviewer": "Send a follow-up prompt to the reviewer",
  archive: "Archive the reviewer",
};

function useProjects(): ProjectOption[] {
  const paseo = usePaseo();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  useEffect(() => {
    let active = true;
    paseo.projects
      .list()
      .then((result) => {
        if (!active) return;
        setProjects(
          result.projects
            .map((project) => ({
              id: project.projectId,
              name: project.projectCustomName || project.projectDisplayName,
              path: project.projectRootPath,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch((error: unknown) => console.error("[trigger-review] could not list projects", error));
    return () => {
      active = false;
    };
  }, [paseo]);
  return projects;
}

function useProviders(): ProviderOption[] {
  const paseo = usePaseo();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  useEffect(() => {
    let active = true;
    paseo.providers
      .snapshot()
      .then((result) => {
        if (!active) return;
        setProviders(
          result.entries
            .filter((entry) => entry.enabled !== false)
            .map((entry) => ({
              id: entry.provider,
              label: entry.label || entry.provider,
              ready: entry.status === "ready",
              defaultModeId: entry.defaultModeId ?? null,
              modes: (entry.modes ?? []).map((mode) => ({ id: mode.id, label: mode.label })),
              models: (entry.models ?? [])
                .filter((model) => model.isSelectable !== false)
                .map((model) => ({
                  id: model.id,
                  label: model.label,
                  isDefault: model.isDefault === true,
                  thinkingOptions: (model.thinkingOptions ?? []).map((option) => ({
                    id: option.id,
                    label: option.label,
                  })),
                })),
            })),
        );
      })
      .catch((error: unknown) => console.error("[trigger-review] could not list providers", error));
    return () => {
      active = false;
    };
  }, [paseo]);
  return providers;
}

/** Adds the current value to a select's options when the catalog does not list it. */
function withCurrent(options: { label: string; value: string }[], value: string) {
  if (options.some((option) => option.value === value)) return options;
  return [...options, { label: `${value} (not in catalog)`, value }];
}

export function SettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(reviewSettings);
  const projects = useProjects();
  const providers = useProviders();
  const [scope, setScope] = useState<string>(DEFAULTS_SCOPE);
  const [draft, setDraft] = useState<ReviewSettingsValues | null>(null);
  const [draftRevision, setDraftRevision] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const ready = settings.status === "ready";
  const savedValues = ready ? settings.values : null;
  const savedRevision = ready ? settings.revision : null;

  // Load the saved document unless the user has unsaved edits.
  // Keyed on the revision so a new `values` object per render cannot loop.
  useEffect(() => {
    if (!savedValues || !savedRevision) return;
    if (dirty || savedRevision === draftRevision) return;
    setDraft(savedValues);
    setDraftRevision(savedRevision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRevision, dirty, draftRevision]);

  const styles = useMemo(
    () => ({
      root: { gap: layout.compact ? 16 : 24 },
      textArea: {
        minHeight: 140,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        fontSize: 13,
        textAlignVertical: "top" as const,
      },
      input: {
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        fontSize: 13,
        minWidth: 180,
      },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [theme, layout.compact],
  );

  if (settings.status === "loading" || (ready && !draft)) {
    return <Text style={styles.muted}>Loading settings…</Text>;
  }
  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <View style={styles.root}>
        <Text style={styles.error}>Settings could not be read: {settings.error}</Text>
        {settings.status === "invalid" ? (
          <SettingsCard>
            <SettingsAction
              label="Reset all settings"
              hint="Replaces the stored settings with the defaults."
              actionLabel="Reset"
              onPress={() => void settings.reset()}
            />
          </SettingsCard>
        ) : null}
      </View>
    );
  }
  if (!draft) return null;

  const isDefaults = scope === DEFAULTS_SCOPE;
  const projectConfig = isDefaults ? undefined : draft.projects[scope];
  const overriding = isDefaults || projectConfig !== undefined;
  const config: ReviewConfig = isDefaults ? draft.defaults : (projectConfig ?? draft.defaults);
  const editable = overriding && !settings.saving;

  const edit = (patch: Partial<ReviewConfig>) => {
    setDirty(true);
    setDraft((current) => {
      if (!current) return current;
      if (scope === DEFAULTS_SCOPE) return { ...current, defaults: { ...current.defaults, ...patch } };
      const base = current.projects[scope] ?? current.defaults;
      return { ...current, projects: { ...current.projects, [scope]: { ...base, ...patch } } };
    });
  };

  const setOverride = (enabled: boolean) => {
    setDirty(true);
    setDraft((current) => {
      if (!current || scope === DEFAULTS_SCOPE) return current;
      const projects = { ...current.projects };
      if (enabled) projects[scope] = { ...current.defaults };
      else delete projects[scope];
      return { ...current, projects };
    });
  };

  const save = async () => {
    if (!draft || !draftRevision) return;
    const saved = await settings.save(draft, draftRevision);
    if (saved) setDirty(false);
  };

  const discard = () => {
    setDirty(false);
    setDraftRevision(null);
  };

  const scopeOptions = [
    { label: "Defaults (all projects)", value: DEFAULTS_SCOPE },
    ...projects.map((project) => ({
      label: draft.projects[project.id] ? `${project.name} (custom)` : project.name,
      value: project.id,
    })),
    // Keep configured projects that are no longer registered reachable.
    ...Object.keys(draft.projects)
      .filter((id) => !projects.some((project) => project.id === id))
      .map((id) => ({ label: `${id} (custom, unknown project)`, value: id })),
  ];

  const provider = providers.find((candidate) => candidate.id === config.provider);
  const providerOptions = withCurrent(
    providers.map((candidate) => ({
      label: candidate.ready ? candidate.label : `${candidate.label} (unavailable)`,
      value: candidate.id,
    })),
    config.provider,
  );
  const modelOptions = withCurrent(
    [
      { label: "Provider default", value: "" },
      ...(provider?.models ?? []).map((model) => ({ label: model.label, value: model.id })),
    ],
    config.model,
  );
  const modeOptions = withCurrent(
    [
      { label: "Provider default", value: "" },
      ...(provider?.modes ?? []).map((mode) => ({ label: mode.label, value: mode.id })),
    ],
    config.modeId,
  );
  const selectedModel =
    provider?.models.find((model) => model.id === config.model) ??
    provider?.models.find((model) => model.isDefault);
  const thinkingOptions = withCurrent(
    [
      { label: "Model default", value: "" },
      ...(selectedModel?.thinkingOptions ?? []).map((option) => ({
        label: option.label,
        value: option.id,
      })),
    ],
    config.thinkingOptionId,
  );

  const changeProvider = (id: string) => {
    const next = providers.find((candidate) => candidate.id === id);
    const hasAuto = next?.modes.some((mode) => mode.id === "auto") ?? false;
    edit({
      provider: id,
      model: "",
      thinkingOptionId: "",
      modeId: hasAuto ? "auto" : (next?.defaultModeId ?? ""),
    });
  };

  const showSourceMessage =
    config.finishAction === "send-to-source" || config.finishAction === "send-to-source-and-archive";

  return (
    <View style={styles.root}>
      <SettingsSection title="Scope">
        <SettingsCard>
          <SettingsSelect
            label="Configure"
            hint="Projects without custom settings use the defaults."
            value={scope}
            options={scopeOptions}
            onValueChange={setScope}
          />
          {isDefaults ? null : (
            <SettingsSwitch
              label="Custom settings for this project"
              hint="Off: this project uses the defaults."
              value={overriding}
              disabled={settings.saving}
              onValueChange={setOverride}
            />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Reviewer agent">
        <SettingsCard>
          <SettingsSelect
            label="Provider"
            value={config.provider}
            options={providerOptions}
            disabled={!editable}
            onValueChange={changeProvider}
          />
          <SettingsSelect
            label="Model"
            value={config.model}
            options={modelOptions}
            disabled={!editable}
            onValueChange={(model) => edit({ model, thinkingOptionId: "" })}
          />
          <SettingsSelect
            label="Mode"
            hint="Defaults to auto mode."
            value={config.modeId}
            options={modeOptions}
            disabled={!editable}
            onValueChange={(modeId) => edit({ modeId })}
          />
          <SettingsSelect
            label="Thinking"
            value={config.thinkingOptionId}
            options={thinkingOptions}
            disabled={!editable}
            onValueChange={(thinkingOptionId) => edit({ thinkingOptionId })}
          />
          <SettingsSelect<Placement>
            label="Open reviewer as"
            value={config.placement}
            options={[
              { label: "New tab in the workspace", value: "tab" },
              { label: "Subagent of the reviewed agent", value: "subagent" },
            ]}
            disabled={!editable}
            onValueChange={(placement) => edit({ placement })}
          />
          <SettingsRow
            label="Review prompt"
            hint="Variables: {{sourceAgentTitle}}, {{sourceAgentId}}, {{cwd}}. An instruction to end with a findings-only message is always appended."
          >
            <TextInput
              multiline
              editable={editable}
              value={config.prompt}
              onChangeText={(prompt) => edit({ prompt })}
              style={styles.textArea}
              placeholderTextColor={theme.colors.foregroundMuted}
              accessibilityLabel="Review prompt"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Finish review">
        <SettingsCard>
          <SettingsSelect<FinishAction>
            label="When Finish review is pressed"
            value={config.finishAction}
            options={FINISH_ACTIONS.map((action) => ({
              label: FINISH_ACTION_LABELS[action],
              value: action,
            }))}
            disabled={!editable}
            onValueChange={(finishAction) => edit({ finishAction })}
          />
          {showSourceMessage ? (
            <SettingsRow
              label="Message to the original agent"
              hint="Variables: {{findings}}, {{reviewerTitle}}, {{reviewerAgentId}}, {{sourceAgentTitle}}, {{sourceAgentId}}."
            >
              <TextInput
                multiline
                editable={editable}
                value={config.finishMessageTemplate}
                onChangeText={(finishMessageTemplate) => edit({ finishMessageTemplate })}
                style={styles.textArea}
                accessibilityLabel="Message to the original agent"
              />
            </SettingsRow>
          ) : null}
          {config.finishAction === "prompt-reviewer" ? (
            <SettingsRow
              label="Follow-up prompt for the reviewer"
              hint="Variables: {{sourceAgentTitle}}, {{sourceAgentId}}."
            >
              <TextInput
                multiline
                editable={editable}
                value={config.finishReviewerPrompt}
                onChangeText={(finishReviewerPrompt) => edit({ finishReviewerPrompt })}
                style={styles.textArea}
                accessibilityLabel="Follow-up prompt for the reviewer"
              />
            </SettingsRow>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Save">
        <SettingsCard>
          <SettingsAction
            label={dirty ? "You have unsaved changes" : "All changes saved"}
            error={settings.saveError}
            actionLabel={settings.saving ? "Saving…" : "Save"}
            disabled={!dirty || settings.saving}
            onPress={() => void save()}
          />
          <SettingsAction
            label="Discard changes"
            actionLabel="Discard"
            disabled={!dirty || settings.saving}
            onPress={discard}
          />
          {overriding ? (
            <SettingsAction
              label={isDefaults ? "Restore built-in defaults" : "Copy the defaults into this project"}
              hint="Changes the draft only; press Save to keep it."
              actionLabel="Restore"
              disabled={!editable}
              onPress={() =>
                edit(isDefaults ? { ...DEFAULT_REVIEW_CONFIG } : { ...draft.defaults })
              }
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
