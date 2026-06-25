'use client';

import { useMemo, useState } from 'react';
import { ThemeGallery } from '@/components/theme-lab/gallery';
import {
  FONT_PRESETS,
  RADIUS_PRESETS,
  THEME_PRESETS,
  themeVarsToCssBlock,
  themeVarsToStyle,
  type ThemePreset,
} from '@/lib/theme-lab/presets';
import './theme-lab.css';

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function exportSnippet(theme: ThemePreset, radius: string, fontId: string): string {
  const font = FONT_PRESETS.find((f) => f.id === fontId);
  return `/* Paste into apps/web/app/globals.css — theme: ${theme.label} */
:root {
${Object.entries({ ...theme.vars, '--radius': radius })
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}
}

/* Font stacks (add next/font or a Google Fonts link in layout.tsx) */
/* sans: ${font?.sans ?? 'system-ui'} */
/* mono: ${font?.mono ?? 'ui-monospace'} */`;
}

export default function ThemesPage() {
  const [themeId, setThemeId] = useState('twitter-light');
  const [fontId, setFontId] = useState('open-sans');
  const [radiusId, setRadiusId] = useState('twitter');
  const [copied, setCopied] = useState(false);

  const theme = THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0]!;
  const font = FONT_PRESETS.find((f) => f.id === fontId) ?? FONT_PRESETS[0]!;
  const radius = RADIUS_PRESETS.find((r) => r.id === radiusId)?.value ?? theme.radius;

  const previewStyle = useMemo(() => {
    return { ...themeVarsToStyle(theme.vars, radius), fontFamily: font.sans };
  }, [theme, font, radius]);

  const snippet = useMemo(() => exportSnippet(theme, radius, fontId), [theme, radius, fontId]);

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Inspect shadcn-compatible palettes and font pairings. The live app uses the{' '}
        <strong className="font-medium text-foreground">tweakcn Twitter</strong> theme in{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">globals.css</code>. Copy CSS from here when you want to switch.
      </p>

      <div className="grid gap-4 rounded-xl border border-border bg-card/50 p-4 md:grid-cols-4">
        <Select
          label="Palette"
          value={themeId}
          onChange={setThemeId}
          options={THEME_PRESETS.map((t) => ({ id: t.id, label: `${t.label} (${t.source})` }))}
        />
        <Select
          label="Font pair"
          value={fontId}
          onChange={setFontId}
          options={FONT_PRESETS.map((f) => ({ id: f.id, label: f.label }))}
        />
        <Select
          label="Corner radius"
          value={radiusId}
          onChange={setRadiusId}
          options={RADIUS_PRESETS.map((r) => ({ id: r.id, label: r.label }))}
        />
        <div className="flex flex-col justify-end gap-2">
          <button
            type="button"
            onClick={copySnippet}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {copied ? 'Copied!' : 'Copy :root CSS'}
          </button>
          <p className="text-xs text-muted-foreground">
            {theme.group} · {theme.source}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/80 px-4 py-2 text-xs text-muted-foreground">
          <span>Live preview — semantic shadcn tokens only</span>
          <span className="font-mono">{theme.label} · {font.label} · r={radius}</span>
        </div>
        <div className="theme-lab-preview bg-background text-foreground" style={previewStyle}>
          <ThemeGallery />
          <div className="border-t border-border px-6 pb-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Monospace sample</p>
            <pre
              className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
              style={{ fontFamily: font.mono }}
            >
{`{
  "event": "tool.call",
  "name": "fake.riskyAction",
  "status": "needs_approval",
  "runId": "ht849j"
}`}
            </pre>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-card/40 p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">CSS export</summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">{snippet}</pre>
        <p className="mt-3 text-xs text-muted-foreground">
          To add a custom palette: paste a tweakcn export into{' '}
          <code className="text-muted-foreground">lib/theme-lab/presets.ts</code> as a new entry in{' '}
          <code className="text-muted-foreground">THEME_PRESETS</code>.
        </p>
        <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {themeVarsToCssBlock(theme.id, theme.vars, radius)}
        </pre>
      </details>
    </div>
  );
}
