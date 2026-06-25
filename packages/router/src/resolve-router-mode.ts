export type RouterMode = 'keyword' | 'llm' | 'hybrid';

export function resolveRouterMode(env: NodeJS.ProcessEnv = process.env): RouterMode {
  const raw = (env.AXPLANE_ROUTER_MODE ?? 'keyword').toLowerCase();
  if (raw === 'llm' || raw === 'hybrid') return raw;
  return 'keyword';
}
