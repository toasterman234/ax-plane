import type { Hono } from 'hono';
import { z } from 'zod';
import { resolveAxEngineConfig } from '@axplane/flow-canvas';
import type { AxFlowEvalRun, AxFlowTestSet } from '@axplane/eval';

/**
 * Observatory Slice F (F1) — ax-flow LLM-judge eval proxy.
 * Thin pass-through to ax-server `/evals`, `/testset`, `/evals/run` (Studio parity).
 */
export function registerAxFlowEvalsRoutes(app: Hono) {
  app.get('/ax-flow-evals', async (c) => {
    const flowId = c.req.query('flow')?.trim();
    if (!flowId) return c.json({ error: 'Provide ?flow=<id>' }, 400);

    const { axServerUrl } = resolveAxEngineConfig();
    const wantTestset = c.req.query('testset') === '1';
    const path = wantTestset
      ? `/testset?flow=${encodeURIComponent(flowId)}`
      : `/evals?flow=${encodeURIComponent(flowId)}`;

    try {
      const res = await fetch(`${axServerUrl}${path}`, { cache: 'no-store' });
      const data = await res.json();
      return c.json(data, res.ok ? 200 : (res.status as 400 | 404 | 502 | 503));
    } catch (err) {
      return c.json(
        {
          error: `Could not reach ax-server at ${axServerUrl}: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
  });

  const TestSetSchema = z.object({
    flowId: z.string().min(1),
    cases: z.array(
      z.object({
        id: z.string().min(1),
        input: z.string(),
        expected: z.string(),
      }),
    ),
  });

  app.post('/ax-flow-evals', async (c) => {
    const flowId = c.req.query('flow')?.trim();
    const plan = c.req.query('plan') === '1';
    const { axServerUrl } = resolveAxEngineConfig();

    if (!flowId) {
      let body: AxFlowTestSet;
      try {
        body = TestSetSchema.parse(await c.req.json());
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid TestSet body';
        return c.json({ error: msg }, 400);
      }
      try {
        const res = await fetch(`${axServerUrl}/testset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        const data = await res.json();
        return c.json(data, res.ok ? 200 : (res.status as 400 | 404 | 502 | 503));
      } catch (err) {
        return c.json(
          {
            error: `Could not reach ax-server at ${axServerUrl}: ${err instanceof Error ? err.message : String(err)}`,
          },
          502,
        );
      }
    }

    const path = `/evals/run?flow=${encodeURIComponent(flowId)}${plan ? '&plan=1' : ''}`;
    try {
      const res = await fetch(`${axServerUrl}${path}`, { method: 'POST', cache: 'no-store' });
      const data = (await res.json()) as AxFlowEvalRun | { plan: unknown } | { error: string };
      return c.json(data, res.ok ? 200 : (res.status as 400 | 404 | 502 | 503));
    } catch (err) {
      return c.json(
        {
          error: `Could not reach ax-server at ${axServerUrl}: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
  });
}
