/** HSL triplets for shadcn-style tokens (used as hsl(var(--token))). */

export type ThemeVars = Record<string, string>;

export type ThemePreset = {
  id: string;
  label: string;
  group: 'dark' | 'light';
  source: string;
  radius: string;
  vars: ThemeVars;
};

export type FontPreset = {
  id: string;
  label: string;
  sans: string;
  mono: string;
};

const baseDark = (accent: ThemeVars): ThemeVars => ({
  '--background': '240 10% 3.9%',
  '--foreground': '0 0% 98%',
  '--card': '240 10% 3.9%',
  '--card-foreground': '0 0% 98%',
  '--popover': '240 10% 3.9%',
  '--popover-foreground': '0 0% 98%',
  '--secondary': '240 3.7% 15.9%',
  '--secondary-foreground': '0 0% 98%',
  '--muted': '240 3.7% 15.9%',
  '--muted-foreground': '240 5% 64.9%',
  '--accent': '240 3.7% 15.9%',
  '--accent-foreground': '0 0% 98%',
  '--destructive': '0 62.8% 30.6%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '240 3.7% 15.9%',
  '--input': '240 3.7% 15.9%',
  '--ring': '240 4.9% 83.9%',
  ...accent,
});

const baseLight = (accent: ThemeVars): ThemeVars => ({
  '--background': '0 0% 100%',
  '--foreground': '240 10% 3.9%',
  '--card': '0 0% 100%',
  '--card-foreground': '240 10% 3.9%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '240 10% 3.9%',
  '--secondary': '240 4.8% 95.9%',
  '--secondary-foreground': '240 5.9% 10%',
  '--muted': '240 4.8% 95.9%',
  '--muted-foreground': '240 3.8% 46.1%',
  '--accent': '240 4.8% 95.9%',
  '--accent-foreground': '240 5.9% 10%',
  '--destructive': '0 84.2% 60.2%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '240 5.9% 90%',
  '--input': '240 5.9% 90%',
  '--ring': '240 5.9% 10%',
  ...accent,
});

/** Curated shadcn / tweakcn-compatible presets — add more by pasting exports from tweakcn.com. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'twitter-light',
    label: 'Twitter · light (active)',
    group: 'light',
    source: 'tweakcn',
    radius: '1.3rem',
    vars: {
      '--background': '1 0% 100%',
      '--foreground': '222 47% 11%',
      '--card': '210 20% 98%',
      '--card-foreground': '222 47% 11%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '222 47% 11%',
      '--primary': '203 89% 53%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '222 47% 11%',
      '--secondary-foreground': '0 0% 100%',
      '--muted': '220 14% 96%',
      '--muted-foreground': '220 9% 46%',
      '--accent': '204 94% 94%',
      '--accent-foreground': '203 89% 53%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '214 32% 91%',
      '--input': '214 32% 96%',
      '--ring': '203 89% 53%',
    },
  },
  {
    id: 'zinc-dark',
    label: 'Zinc · dark',
    group: 'dark',
    source: 'shadcn default',
    radius: '0.5rem',
    vars: baseDark({
      '--primary': '0 0% 98%',
      '--primary-foreground': '240 5.9% 10%',
    }),
  },
  {
    id: 'slate-dark',
    label: 'Slate · dark',
    group: 'dark',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseDark({
      '--background': '222.2 84% 4.9%',
      '--card': '222.2 84% 4.9%',
      '--popover': '222.2 84% 4.9%',
      '--primary': '210 40% 98%',
      '--primary-foreground': '222.2 47.4% 11.2%',
      '--secondary': '217.2 32.6% 17.5%',
      '--muted': '217.2 32.6% 17.5%',
      '--accent': '217.2 32.6% 17.5%',
      '--border': '217.2 32.6% 17.5%',
      '--input': '217.2 32.6% 17.5%',
      '--ring': '212.7 26.8% 83.9%',
    }),
  },
  {
    id: 'stone-dark',
    label: 'Stone · dark',
    group: 'dark',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseDark({
      '--background': '20 14.3% 4.1%',
      '--card': '20 14.3% 4.1%',
      '--popover': '20 14.3% 4.1%',
      '--primary': '60 9.1% 97.8%',
      '--primary-foreground': '24 9.8% 10%',
      '--secondary': '12 6.5% 15.1%',
      '--muted': '12 6.5% 15.1%',
      '--accent': '12 6.5% 15.1%',
      '--border': '12 6.5% 15.1%',
      '--input': '12 6.5% 15.1%',
      '--ring': '24 5.7% 82.9%',
    }),
  },
  {
    id: 'violet-dark',
    label: 'Violet · dark',
    group: 'dark',
    source: 'shadcn',
    radius: '0.75rem',
    vars: baseDark({
      '--primary': '263.4 70% 50.4%',
      '--primary-foreground': '210 20% 98%',
      '--ring': '263.4 70% 50.4%',
    }),
  },
  {
    id: 'blue-dark',
    label: 'Blue · dark',
    group: 'dark',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseDark({
      '--primary': '217.2 91.2% 59.8%',
      '--primary-foreground': '222.2 47.4% 11.2%',
      '--ring': '217.2 91.2% 59.8%',
    }),
  },
  {
    id: 'zinc-light',
    label: 'Zinc · light',
    group: 'light',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseLight({
      '--primary': '240 5.9% 10%',
      '--primary-foreground': '0 0% 98%',
    }),
  },
  {
    id: 'neutral-light',
    label: 'Neutral · light',
    group: 'light',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseLight({
      '--primary': '0 0% 9%',
      '--primary-foreground': '0 0% 98%',
    }),
  },
  {
    id: 'rose-light',
    label: 'Rose · light',
    group: 'light',
    source: 'shadcn',
    radius: '0.625rem',
    vars: baseLight({
      '--primary': '346.8 77.2% 49.8%',
      '--primary-foreground': '355.7 100% 97.3%',
      '--ring': '346.8 77.2% 49.8%',
    }),
  },
  {
    id: 'green-light',
    label: 'Green · light',
    group: 'light',
    source: 'shadcn',
    radius: '0.5rem',
    vars: baseLight({
      '--primary': '142.1 76.2% 36.3%',
      '--primary-foreground': '355.7 100% 97.3%',
      '--ring': '142.1 76.2% 36.3%',
    }),
  },
  {
    id: 'orange-dark',
    label: 'Orange · dark',
    group: 'dark',
    source: 'shadcn',
    radius: '0.375rem',
    vars: baseDark({
      '--primary': '20.5 90.2% 48.2%',
      '--primary-foreground': '60 9.1% 97.8%',
      '--ring': '20.5 90.2% 48.2%',
    }),
  },
];

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'open-sans',
    label: 'Open Sans (Twitter)',
    sans: '"Open Sans", system-ui, sans-serif',
    mono: 'Menlo, ui-monospace, monospace',
  },
  {
    id: 'system',
    label: 'System UI',
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'inter',
    label: 'Inter',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: 'geist',
    label: 'Geist',
    sans: '"Geist", "Inter", system-ui, sans-serif',
    mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    sans: '"DM Sans", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'source-sans',
    label: 'Source Sans 3',
    sans: '"Source Sans 3", system-ui, sans-serif',
    mono: '"Source Code Pro", ui-monospace, monospace',
  },
  {
    id: 'ibm-plex',
    label: 'IBM Plex',
    sans: '"IBM Plex Sans", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
];

export const RADIUS_PRESETS = [
  { id: 'twitter', label: 'Twitter (1.3rem)', value: '1.3rem' },
  { id: 'none', label: 'Sharp (0)', value: '0' },
  { id: 'sm', label: 'Small (0.25rem)', value: '0.25rem' },
  { id: 'md', label: 'Default (0.5rem)', value: '0.5rem' },
  { id: 'lg', label: 'Soft (0.75rem)', value: '0.75rem' },
  { id: 'xl', label: 'Round (1rem)', value: '1rem' },
];

export function cssVarValue(raw: string): string {
  if (raw.startsWith('oklch(') || raw.startsWith('hsl(') || raw.startsWith('#')) return raw;
  return `hsl(${raw})`;
}

export function themeVarsToStyle(vars: ThemeVars, radius: string): Record<string, string> {
  const style: Record<string, string> = { '--radius': radius };
  for (const [k, v] of Object.entries(vars)) {
    style[k] = cssVarValue(v);
  }
  return style;
}

export function themeVarsToCssBlock(id: string, vars: ThemeVars, radius: string): string {
  const lines = Object.entries({ ...vars, '--radius': radius })
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `[data-theme="${id}"] {\n${lines}\n}`;
}
