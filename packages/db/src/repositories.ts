import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { ControlEventType, RunStatus } from '@axplane/events';
import type { Database } from './client';
import { agents, agentVersions, approvals, requests, runEvents, runs, toolCalls } from './schema';

export type EventSink = {
  emit: (runId: string, type: ControlEventType, payload?: Record<string, unknown>) => Promise<void>;
};

export function createRepositories(db: Database) {
  async function appendRunEvent(runId: string, type: ControlEventType, payload: Record<string, unknown> = {}) {
    const [row] = await db
      .select({ nextSeq: sql<number>`coalesce(max(${runEvents.seq}), -1) + 1` })
      .from(runEvents)
      .where(eq(runEvents.runId, runId));

    const seq = Number(row?.nextSeq ?? 0);
    const [inserted] = await db
      .insert(runEvents)
      .values({ runId, seq, type, payloadJson: payload })
      .returning();
    return inserted;
  }


  async function setRunStatus(runId: string, status: RunStatus, patch: Partial<{ outputJson: unknown; error: string }> = {}) {
    const values: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'running') values.startedAt = new Date();
    if (['completed', 'failed', 'cancelled'].includes(status)) values.completedAt = new Date();
    if (patch.outputJson !== undefined) values.outputJson = patch.outputJson;
    if (patch.error !== undefined) values.error = patch.error;
    const [run] = await db.update(runs).set(values).where(eq(runs.id, runId)).returning();
    return run;
  }

  return {
    appendRunEvent,

    eventSink(): EventSink {
      return {
        emit: async (runId, type, payload) => {
          await appendRunEvent(runId, type, payload);
        },
      };
    },

    async upsertAgent(config: {
      id: string;
      name: string;
      description?: string;
      signature: string;
      configJson: unknown;
    }) {
      await db
        .insert(agents)
        .values({ id: config.id, name: config.name, description: config.description ?? '' })
        .onConflictDoUpdate({
          target: agents.id,
          set: { name: config.name, description: config.description ?? '', updatedAt: new Date() },
        });

      const existingCurrent = await db
        .select()
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, config.id), eq(agentVersions.isCurrent, true)))
        .limit(1);

      if (existingCurrent.length === 0) {
        const [version] = await db
          .insert(agentVersions)
          .values({ agentId: config.id, version: 1, signature: config.signature, configJson: config.configJson, isCurrent: true })
          .returning();
        return version;
      }

      return existingCurrent[0];
    },

    async listAgents() {
      return db.select().from(agents).orderBy(asc(agents.name));
    },

    async getAgent(id: string) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      return agent;
    },

    async getCurrentAgentVersion(agentId: string) {
      const [version] = await db
        .select()
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.isCurrent, true)))
        .limit(1);
      return version;
    },

    async createRequest(input: { body: string; agentId: string }) {
      const [request] = await db
        .insert(requests)
        .values({ body: input.body, agentId: input.agentId, routeDecisionJson: { selectedAgentId: input.agentId, reason: 'MVP default route' } })
        .returning();
      return request;
    },

    async listRequests() {
      return db.select().from(requests).orderBy(desc(requests.createdAt)).limit(50);
    },

    async createRun(input: { requestId: string; agentId: string }) {
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request) throw new Error(`Request not found: ${input.requestId}`);
      const [version] = await db.select().from(agentVersions).where(and(eq(agentVersions.agentId, input.agentId), eq(agentVersions.isCurrent, true))).limit(1);
      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: input.agentId,
          agentVersionId: version?.id,
          status: 'queued',
          inputJson: { request: request.body },
        })
        .returning();
      await appendRunEvent(run.id, 'run.queued', { requestId: input.requestId, agentId: input.agentId });
      return run;
    },

    async getRequest(id: string) {
      const [request] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
      return request;
    },

    async getRun(id: string) {
      const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
      return run;
    },

    async listRuns() {
      return db.select().from(runs).orderBy(desc(runs.createdAt)).limit(100);
    },

    async listQueuedRuns(limit = 5) {
      return db.select().from(runs).where(eq(runs.status, 'queued')).orderBy(asc(runs.createdAt)).limit(limit);
    },

    async updateRunStatus(runId: string, status: RunStatus, patch: Partial<{ outputJson: unknown; error: string }> = {}) {
      return setRunStatus(runId, status, patch);
    },

    async listRunEvents(runId: string, afterSeq?: number) {
      const where = afterSeq === undefined ? eq(runEvents.runId, runId) : and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq));
      return db.select().from(runEvents).where(where).orderBy(asc(runEvents.seq));
    },

    async createToolCall(input: { runId: string; qualifiedName: string; argsJson?: unknown; status?: string }) {
      const [toolCall] = await db.insert(toolCalls).values({
        runId: input.runId,
        qualifiedName: input.qualifiedName,
        argsJson: input.argsJson ?? {},
        status: input.status ?? 'requested',
      }).returning();
      return toolCall;
    },

    async updateToolCall(id: string, patch: { status?: string; resultJson?: unknown; approvalId?: string }) {
      const [toolCall] = await db.update(toolCalls).set({ ...patch, updatedAt: new Date() }).where(eq(toolCalls.id, id)).returning();
      return toolCall;
    },

    async createApproval(input: { runId: string; toolCallId?: string; toolName: string; reason: string; requestedActionJson?: unknown }) {
      const [approval] = await db.insert(approvals).values({
        runId: input.runId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        reason: input.reason,
        requestedActionJson: input.requestedActionJson ?? {},
        status: 'pending',
      }).returning();
      await appendRunEvent(input.runId, 'approval.created', { approvalId: approval.id, toolName: input.toolName, reason: input.reason });
      return approval;
    },

    async listApprovals(status?: string) {
      const q = status ? db.select().from(approvals).where(eq(approvals.status, status)) : db.select().from(approvals);
      return q.orderBy(desc(approvals.createdAt)).limit(100);
    },

    async getApproval(id: string) {
      const [approval] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
      return approval;
    },

    async getApprovedApprovalForTool(runId: string, toolName: string) {
      const [approval] = await db.select().from(approvals).where(and(eq(approvals.runId, runId), eq(approvals.toolName, toolName), eq(approvals.status, 'approved'))).limit(1);
      return approval;
    },

    async resolveApproval(id: string, status: 'approved' | 'rejected', decidedBy = 'local-user') {
      const [approval] = await db.update(approvals).set({ status, decidedBy, decidedAt: new Date() }).where(eq(approvals.id, id)).returning();
      if (approval) {
        await appendRunEvent(approval.runId, status === 'approved' ? 'approval.approved' : 'approval.rejected', { approvalId: id, toolName: approval.toolName });
        if (status === 'approved') {
          await setRunStatus(approval.runId, 'queued');
          await appendRunEvent(approval.runId, 'run.queued', { reason: 'approval approved; retrying run' });
        } else {
          await setRunStatus(approval.runId, 'failed', { error: `Approval rejected for ${approval.toolName}` });
          await appendRunEvent(approval.runId, 'run.failed', { reason: `Approval rejected for ${approval.toolName}` });
        }
      }
      return approval;
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
