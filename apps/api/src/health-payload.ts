import { fetchAllFlowEntries, resolveAxEngineConfig, checkDispatcherReachable } from '@axplane/flow-canvas';
import { readWorkerHealth } from '@axplane/runtime-dev';
import { resolveRouterMode } from '@axplane/router';

export type HealthPayload = {
  ok: true;
  service: 'axplane-api';
  worker: ReturnType<typeof readWorkerHealth>;
  axEngine: {
    reachable: boolean;
    flowCount: number;
    url: string;
    dispatcherAvailable: boolean;
  };
  router: {
    mode: ReturnType<typeof resolveRouterMode>;
    executionMode: 'mock' | 'real';
  };
};

export async function buildHealthPayload(): Promise<HealthPayload> {
  const worker = readWorkerHealth(Number(process.env.WORKER_HEARTBEAT_STALE_MS ?? 10_000));
  const axUrls = resolveAxEngineConfig();
  let axEngine: HealthPayload['axEngine'] = {
    reachable: false,
    flowCount: 0,
    url: axUrls.axServerUrl,
    dispatcherAvailable: false,
  };
  try {
    const flows = await fetchAllFlowEntries();
    const dispatcherAvailable = await checkDispatcherReachable();
    axEngine = {
      reachable: flows.length > 0 || dispatcherAvailable,
      flowCount: flows.length,
      url: axUrls.axServerUrl,
      dispatcherAvailable,
    };
  } catch {
    // ax-server optional
  }
  return {
    ok: true,
    service: 'axplane-api',
    worker,
    axEngine,
    router: {
      mode: resolveRouterMode(),
      executionMode: process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock',
    },
  };
}
