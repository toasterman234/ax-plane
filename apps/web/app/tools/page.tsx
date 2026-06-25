'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ToolDescriptor = {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: 'safe' | 'risky';
  custom?: boolean;
};

export default function ToolsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('webhook_notify');
  const [description, setDescription] = useState('POST JSON to a webhook URL');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH'>('POST');
  const [urlTemplate, setUrlTemplate] = useState('https://example.com/hooks/axplane');
  const [bodyTemplate, setBodyTemplate] = useState('{"text":"{{payload}}"}');
  const [risk, setRisk] = useState<'safe' | 'risky'>('risky');
  const [saving, setSaving] = useState(false);

  const tools = useQuery({ queryKey: ['tools'], queryFn: () => api<ToolDescriptor[]>('/tools') });

  async function registerTool() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const created = await api<ToolDescriptor>('/tools', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          method,
          urlTemplate,
          bodyTemplate: bodyTemplate.trim() || undefined,
          risk,
        }),
      });
      await tools.refetch();
      setMessage(`Registered ${created.qualifiedName} — enable it on an agent in the editor.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register tool');
    } finally {
      setSaving(false);
    }
  }

  async function removeTool(qualifiedName: string) {
    if (!window.confirm(`Delete custom tool ${qualifiedName}?`)) return;
    setMessage(null);
    setError(null);
    try {
      await api(`/tools/${encodeURIComponent(qualifiedName)}`, { method: 'DELETE' });
      await tools.refetch();
      setMessage(`Deleted ${qualifiedName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tool');
    }
  }

  const builtIn = tools.data?.filter((tool) => !tool.custom) ?? [];
  const custom = tools.data?.filter((tool) => tool.custom) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="text-muted-foreground">Built-in host tools plus registered HTTP webhooks.</p>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Register HTTP tool</h2>
        <p className="text-sm text-muted-foreground">
          Creates <code className="text-foreground">http.{'{name}'}</code> with <code>{'{{payload}}'}</code> template support in URL/body. Risky tools require approval.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Name (slug)</span>
            <input className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Method</span>
            <select className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              {(['GET', 'POST', 'PUT', 'PATCH'] as const).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Description</span>
          <input className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">URL template</span>
          <input className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm" value={urlTemplate} onChange={(e) => setUrlTemplate(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Body template (optional JSON)</span>
          <textarea className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm" rows={3} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <span className="text-muted-foreground">Risk</span>
          <select className="rounded-md border border-border bg-muted px-2 py-1" value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)}>
            <option value="risky">risky (approval required)</option>
            <option value="safe">safe</option>
          </select>
        </label>
        <Button onClick={registerTool} disabled={saving}>{saving ? 'Registering…' : 'Register HTTP tool'}</Button>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Custom HTTP tools ({custom.length})</h2>
        {custom.length === 0 ? <p className="text-sm text-muted-foreground">No custom tools yet.</p> : null}
        {custom.map((tool) => (
          <Card key={tool.qualifiedName}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-emerald-300">{tool.qualifiedName}</div>
                <p className="mt-1 text-sm text-foreground">{tool.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tool.risk}</p>
              </div>
              <Button className="bg-red-200 text-red-950 hover:bg-red-300" onClick={() => removeTool(tool.qualifiedName)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Built-in tools ({builtIn.length})</h2>
        <p className="text-sm text-muted-foreground">Enable these per agent in the agent editor.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {builtIn.map((tool) => (
            <div key={tool.qualifiedName} className="rounded-lg border border-border px-3 py-2 text-sm">
              <div className="font-mono text-foreground">{tool.qualifiedName}</div>
              <div className="text-xs text-muted-foreground">{tool.risk}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
