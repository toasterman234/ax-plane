import type { FlowEntry } from './types';

export type AxEngineConfig = {
  axServerUrl?: string;
  quantFlowUrl?: string;
  routerFlowUrl?: string;
};

function envOr(defaultUrl: string, key: string): string {
  return process.env[key]?.trim() || defaultUrl;
}

export function resolveAxEngineConfig(overrides?: AxEngineConfig) {
  return {
    axServerUrl: overrides?.axServerUrl ?? envOr('http://127.0.0.1:8810', 'AX_SERVER_URL'),
    quantFlowUrl: overrides?.quantFlowUrl ?? envOr('http://127.0.0.1:8811', 'AX_QUANT_FLOW_URL'),
    routerFlowUrl: overrides?.routerFlowUrl ?? envOr('http://127.0.0.1:8812', 'AX_ROUTER_FLOW_URL'),
  };
}

async function fetchFrom(base: string): Promise<FlowEntry[]> {
  try {
    const res = await fetch(`${base}/flow-specs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { flows?: FlowEntry[] };
    return data.flows ?? [];
  } catch {
    return [];
  }
}

/** Engine flows + optional quant/router sidecars (sidecars win on id collision). */
export async function fetchAllFlowEntries(config?: AxEngineConfig): Promise<FlowEntry[]> {
  const urls = resolveAxEngineConfig(config);
  const [engine, quant, router] = await Promise.all([
    fetchFrom(urls.axServerUrl),
    fetchFrom(urls.quantFlowUrl),
    fetchFrom(urls.routerFlowUrl),
  ]);
  const byId = new Map<string, FlowEntry>();
  for (const entry of engine) byId.set(entry.id, entry);
  for (const entry of quant) byId.set(entry.id, entry);
  for (const entry of router) byId.set(entry.id, entry);
  return [...byId.values()];
}

export async function fetchFlowEntryById(
  flowId: string,
  config?: AxEngineConfig,
): Promise<FlowEntry | null> {
  const flows = await fetchAllFlowEntries(config);
  return flows.find((entry) => entry.id === flowId) ?? null;
}
