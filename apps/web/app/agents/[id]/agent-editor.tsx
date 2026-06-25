'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type AgentModelSlot = {
  provider?: string;
  model?: string;
  temperature?: number;
};

export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  runtime: 'ax' | 'pi';
  mode: 'normal' | 'rlm';
  signature: string;
  contextFields: string[];
  contextPolicy: { preset: string; budget: string };
  tools: string[];
  policies: string[];
  models: {
    primary?: AgentModelSlot;
    fallback?: AgentModelSlot;
    default?: AgentModelSlot;
  };
  routing: { keywords: string[]; priority: number; isDefault: boolean };
};

type AgentVersion = {
  id: string;
  version: number;
  signature: string;
  configJson: AgentConfig;
  isCurrent: boolean;
  createdAt: string;
};

type AgentDetail = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  currentVersion: AgentVersion | null;
};

type ToolDescriptor = {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: 'safe' | 'risky';
  custom?: boolean;
};

const POLICY_OPTIONS = [
  'default_allow',
  'write_tool_requires_approval',
  'block_secret_exfiltration',
] as const;

const CONTEXT_PRESETS = ['full', 'adaptive', 'checkpointed', 'lean'] as const;
const CONTEXT_BUDGETS = ['tight', 'balanced', 'large'] as const;

function configFromVersion(agentId: string, version: AgentVersion | null, agent: AgentDetail): AgentConfig {
  const base = version?.configJson;
  if (base) return { ...base, id: agentId };
  return {
    id: agentId,
    name: agent.name,
    description: agent.description,
    runtime: 'ax',
    mode: 'rlm',
    signature: version?.signature ?? 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    contextFields: ['taskText'],
    contextPolicy: { preset: 'checkpointed', budget: 'balanced' },
    tools: [],
    policies: ['write_tool_requires_approval'],
    models: {},
    routing: { keywords: [], priority: 0, isDefault: false },
  };
}

function groupToolsByNamespace(tools: ToolDescriptor[]) {
  return tools.reduce<Record<string, ToolDescriptor[]>>((acc, tool) => {
    acc[tool.namespace] ??= [];
    acc[tool.namespace].push(tool);
    return acc;
  }, {});
}

export function AgentEditor({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api<AgentDetail>(`/agents/${agentId}`),
  });

  const versionsQuery = useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: () => api<AgentVersion[]>(`/agents/${agentId}/versions`),
  });

  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: () => api<ToolDescriptor[]>('/tools'),
  });

  const previewVersion = versionsQuery.data?.find((v) => v.id === previewVersionId) ?? null;
  const currentVersion = agentQuery.data?.currentVersion ?? null;
  const editingVersion = previewVersion ?? currentVersion;

  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [enabled, setEnabled] = useState(true);

  const form = draft ?? (agentQuery.data ? configFromVersion(agentId, editingVersion, agentQuery.data) : null);
  const isReadOnlyPreview = Boolean(previewVersion && !previewVersion.isCurrent);

  useEffect(() => {
    if (agentQuery.data) setEnabled(agentQuery.data.enabled);
  }, [agentQuery.data?.enabled, agentQuery.data]);

  const toolsByNs = useMemo(() => groupToolsByNamespace(toolsQuery.data ?? []), [toolsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('No config loaded');
      const { id: _id, ...body } = form;
      await api(`/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      return api<{ version: AgentVersion }>(`/agents/${agentId}/versions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setDraft(null);
      setPreviewVersionId(null);
      setMessage('Saved new agent version.');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['agent-versions', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  function updateDraft(patch: Partial<AgentConfig>) {
    if (!form || isReadOnlyPreview) return;
    setDraft({ ...form, ...patch });
  }

  function toggleTool(qualifiedName: string) {
    if (!form || isReadOnlyPreview) return;
    const tools = form.tools.includes(qualifiedName)
      ? form.tools.filter((t) => t !== qualifiedName)
      : [...form.tools, qualifiedName];
    updateDraft({ tools });
  }

  function togglePolicy(policy: string) {
    if (!form || isReadOnlyPreview) return;
    const policies = form.policies.includes(policy)
      ? form.policies.filter((p) => p !== policy)
      : [...form.policies, policy];
    updateDraft({ policies });
  }

  function updateModelSlot(
    slot: 'primary' | 'fallback',
    field: keyof AgentModelSlot,
    raw: string,
  ) {
    if (!form || isReadOnlyPreview) return;
    const current = form.models ?? {};
    const slotConfig = { ...(current[slot] ?? {}) };

    if (field === 'temperature') {
      if (raw.trim() === '') {
        delete slotConfig.temperature;
      } else {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) slotConfig.temperature = parsed;
      }
    } else if (raw.trim() === '') {
      delete slotConfig[field];
    } else {
      slotConfig[field] = raw.trim();
    }

    const nextSlot = Object.keys(slotConfig).length > 0 ? slotConfig : undefined;
    updateDraft({
      models: {
        ...current,
        [slot]: nextSlot,
      },
    });
  }

  function loadVersionIntoEditor(version: AgentVersion, asRestore: boolean) {
    if (!agentQuery.data) return;
    setPreviewVersionId(asRestore ? null : version.id);
    setDraft(configFromVersion(agentId, version, agentQuery.data));
    setMessage(asRestore ? `Restored v${version.version} into editor — save to publish.` : `Viewing v${version.version} (read-only).`);
    setError(null);
  }

  if (agentQuery.isLoading) return <p className="text-sm text-slate-500">Loading agent…</p>;
  if (agentQuery.isError || !agentQuery.data || !form) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">Agent not found or API unreachable.</p>
        <Link href="/agents" className="text-sm text-slate-400 hover:text-white">← Back to agents</Link>
      </div>
    );
  }

  const agent = agentQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/agents" className="text-sm text-slate-500 hover:text-slate-300">← Agents</Link>
          <h1 className="mt-1 text-2xl font-bold">{agent.name}</h1>
          <p className="text-sm text-slate-500">{agent.id}</p>
          {currentVersion ? (
            <p className="mt-1 text-xs text-slate-500">
              Current version: <span className="text-slate-300">v{currentVersion.version}</span>
              {isReadOnlyPreview ? ` · previewing v${previewVersion?.version}` : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={enabled}
              disabled={isReadOnlyPreview}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-slate-600"
            />
            Enabled
          </label>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={isReadOnlyPreview || saveMutation.isPending || form.tools.length === 0}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save new version'}
          </Button>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {isReadOnlyPreview ? (
        <Card className="border-amber-900/50 bg-amber-950/20">
          <p className="text-sm text-amber-200">
            Viewing historical version v{previewVersion?.version}.{' '}
            <button
              type="button"
              className="underline hover:text-white"
              onClick={() => previewVersion && loadVersionIntoEditor(previewVersion, true)}
            >
              Restore into editor
            </button>
            {' '}or{' '}
            <button type="button" className="underline hover:text-white" onClick={() => { setPreviewVersionId(null); setDraft(null); setMessage(null); }}>
              return to current
            </button>
            .
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Identity</h2>
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Name</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  value={form.name}
                  disabled={isReadOnlyPreview}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  rows={3}
                  value={form.description}
                  disabled={isReadOnlyPreview}
                  onChange={(e) => updateDraft({ description: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Signature</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                  value={form.signature}
                  disabled={isReadOnlyPreview}
                  onChange={(e) => updateDraft({ signature: e.target.value })}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Mode</span>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    value={form.mode}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({ mode: e.target.value as AgentConfig['mode'] })}
                  >
                    <option value="rlm">rlm (agent pipeline)</option>
                    <option value="normal">normal</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Runtime</span>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    value={form.runtime}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({ runtime: e.target.value as AgentConfig['runtime'] })}
                  >
                    <option value="ax">ax (@ax-llm/ax)</option>
                    <option value="pi">pi (not wired)</option>
                  </select>
                </label>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold">Tools</h2>
            <p className="mb-4 text-sm text-slate-500">
              {form.tools.length} enabled · risky tools require approval at runtime
            </p>
            <div className="space-y-5">
              {Object.entries(toolsByNs).map(([ns, tools]) => (
                <div key={ns}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{ns}</h3>
                  <div className="space-y-2">
                    {tools.map((tool) => {
                      const checked = form.tools.includes(tool.qualifiedName);
                      return (
                        <label
                          key={tool.qualifiedName}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-slate-600 bg-slate-900/80' : 'border-slate-800'}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={isReadOnlyPreview}
                            onChange={() => toggleTool(tool.qualifiedName)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm">{tool.qualifiedName}</span>
                              {tool.custom ? (
                                <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] uppercase text-indigo-300">http</span>
                              ) : null}
                              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${tool.risk === 'risky' ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}`}>
                                {tool.risk === 'risky' ? 'approval' : 'read-only'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{tool.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Routing</h2>
            <p className="mb-4 text-sm text-slate-500">Keywords used by the request router to pick this agent.</p>
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Keywords (comma-separated)</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  value={(form.routing ?? { keywords: [], priority: 0, isDefault: false }).keywords.join(', ')}
                  disabled={isReadOnlyPreview}
                  onChange={(e) => updateDraft({
                    routing: {
                      ...(form.routing ?? { keywords: [], priority: 0, isDefault: false }),
                      keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
                    },
                  })}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Priority (tie-breaker)</span>
                  <input
                    type="number"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    value={(form.routing ?? { keywords: [], priority: 0, isDefault: false }).priority}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({
                      routing: {
                        ...(form.routing ?? { keywords: [], priority: 0, isDefault: false }),
                        priority: Number(e.target.value) || 0,
                      },
                    })}
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={(form.routing ?? { keywords: [], priority: 0, isDefault: false }).isDefault}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({
                      routing: {
                        ...(form.routing ?? { keywords: [], priority: 0, isDefault: false }),
                        isDefault: e.target.checked,
                      },
                    })}
                  />
                  Default agent when no keywords match
                </label>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold">Models</h2>
            <p className="mb-4 text-sm text-slate-500">
              Per-agent overrides. API keys and base URL come from the worker <code className="text-slate-400">.env</code> — leave fields blank to inherit.
            </p>
            <div className="space-y-6">
              {(['primary', 'fallback'] as const).map((slot) => {
                const slotConfig = form.models?.[slot] ?? {};
                return (
                  <div key={slot} className="rounded-lg border border-slate-800 p-4">
                    <h3 className="mb-3 text-sm font-semibold capitalize text-slate-300">{slot}</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Provider</span>
                        <input
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          placeholder="openai"
                          value={slotConfig.provider ?? ''}
                          disabled={isReadOnlyPreview}
                          onChange={(e) => updateModelSlot(slot, 'provider', e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Model</span>
                        <input
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          placeholder="gemini-3-flash"
                          value={slotConfig.model ?? ''}
                          disabled={isReadOnlyPreview}
                          onChange={(e) => updateModelSlot(slot, 'model', e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Temperature</span>
                        <input
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          placeholder="0"
                          value={slotConfig.temperature ?? ''}
                          disabled={isReadOnlyPreview}
                          onChange={(e) => updateModelSlot(slot, 'temperature', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Policies & context</h2>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Policies</p>
                <div className="flex flex-wrap gap-2">
                  {POLICY_OPTIONS.map((policy) => (
                    <label key={policy} className="flex items-center gap-2 rounded-md border border-slate-800 px-3 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={form.policies.includes(policy)}
                        disabled={isReadOnlyPreview}
                        onChange={() => togglePolicy(policy)}
                      />
                      {policy}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Context preset</span>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    value={form.contextPolicy.preset}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({ contextPolicy: { ...form.contextPolicy, preset: e.target.value } })}
                  >
                    {CONTEXT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Context budget</span>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    value={form.contextPolicy.budget}
                    disabled={isReadOnlyPreview}
                    onChange={(e) => updateDraft({ contextPolicy: { ...form.contextPolicy, budget: e.target.value } })}
                  >
                    {CONTEXT_BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Version history</h2>
            {versionsQuery.isLoading ? <p className="text-xs text-slate-500">Loading…</p> : null}
            <ul className="space-y-2">
              {(versionsQuery.data ?? []).map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => loadVersionIntoEditor(version, false)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${version.isCurrent ? 'border-emerald-800 bg-emerald-950/30' : previewVersionId === version.id ? 'border-slate-500 bg-slate-900' : 'border-slate-800 hover:border-slate-600'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{version.version}</span>
                      {version.isCurrent ? <span className="text-[10px] uppercase text-emerald-400">current</span> : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{version.signature}</p>
                    <p className="text-[10px] text-slate-600">{new Date(version.createdAt).toLocaleString()}</p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
