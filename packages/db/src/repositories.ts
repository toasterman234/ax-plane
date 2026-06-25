import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { ControlEventType, RunStatus } from '@axplane/events';
import type { Database } from './client';
import { agents, agentVersions, approvals, requests, runEvents, runs, toolCalls } from './schema';

export type EventSink = {
  emit: (runId: string, type: ControlEventType, payload?: Record<string, unknown>) => Promise<void>;
};

export function createRepositories(db: Database) {
  async function appendRunEvent(runId: string, type: ControlEventType, payload: Record<string, unknown> = {}) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [row] = await db
        .select({ nextSeq: sql<number>`coalesce(max(${runEvents.seq}), -1) + 1` })
        .from(runEvents)
        .where(eq(runEvents.runId, runId));

      const seq = Number(row?.nextSeq ?? 0);
      try {
        const [inserted] = await db
          .insert(runEvents)
          .values({ runId, seq, type, payloadJson: payload })
          .returning();
        return inserted;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('run_events_run_seq_idx') || attempt === 4) throw error;
      }
    }
    throw new Error('Failed to append run event after retries');
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

      const [version] = await db
        .update(agentVersions)
        .set({
          signature: config.signature,
          configJson: config.configJson,
        })
        .where(eq(agentVersions.id, existingCurrent[0]!.id))
        .returning();
      return version;
    },

    async updateAgent(agentId: string, patch: { name?: string; description?: string; enabled?: boolean }) {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.enabled !== undefined) values.enabled = patch.enabled;
      const [agent] = await db.update(agents).set(values).where(eq(agents.id, agentId)).returning();
      return agent;
    },

    async listAgentVersions(agentId: string) {
      return db
        .select()
        .from(agentVersions)
        .where(eq(agentVersions.agentId, agentId))
        .orderBy(desc(agentVersions.version));
    },

    async getAgentVersion(versionId: string) {
      const [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, versionId)).limit(1);
      return version;
    },

    async saveAgentVersion(agentId: string, input: { signature: string; configJson: unknown }) {
      const [maxRow] = await db
        .select({ maxVersion: sql<number>`coalesce(max(${agentVersions.version}), 0)` })
        .from(agentVersions)
        .where(eq(agentVersions.agentId, agentId));
      const nextVersion = Number(maxRow?.maxVersion ?? 0) + 1;

      await db
        .update(agentVersions)
        .set({ isCurrent: false })
        .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.isCurrent, true)));

      const [version] = await db
        .insert(agentVersions)
        .values({
          agentId,
          version: nextVersion,
          signature: input.signature,
          configJson: input.configJson,
          isCurrent: true,
        })
        .returning();

      const config = input.configJson as { name?: string; description?: string };
      const agentPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (config.name) agentPatch.name = config.name;
      if (config.description !== undefined) agentPatch.description = config.description;
      if (Object.keys(agentPatch).length > 1) {
        await db.update(agents).set(agentPatch).where(eq(agents.id, agentId));
      }

      return version;
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

    async listRoutableAgents() {
      const rows = await db.select().from(agents).where(eq(agents.enabled, true)).orderBy(asc(agents.name));
      return Promise.all(rows.map(async (agent) => {
        const version = await this.getCurrentAgentVersion(agent.id);
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          enabled: agent.enabled,
          configJson: version?.configJson ?? { id: agent.id, name: agent.name, signature: version?.signature ?? '' },
        };
      }));
    },

    async createRequest(input: { body: string; agentId: string; routeDecision: unknown }) {
      const [request] = await db
        .insert(requests)
        .values({
          body: input.body,
          agentId: input.agentId,
          status: 'routed',
          routeDecisionJson: input.routeDecision,
        })
        .returning();
      return request;
    },

    async updateRequestRoute(requestId: string, routeDecision: unknown, agentId: string) {
      const [request] = await db
        .update(requests)
        .set({
          agentId,
          routeDecisionJson: routeDecision,
          status: 'routed',
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId))
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
          inputJson: { taskText: request.body },
        })
        .returning();
      await appendRunEvent(run.id, 'run.queued', {
        requestId: input.requestId,
        agentId: input.agentId,
        routeDecision: request.routeDecisionJson,
      });
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

    async patchRunInputJson(runId: string, patch: Record<string, unknown>) {
      const run = await this.getRun(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      const inputJson = {
        ...(typeof run.inputJson === 'object' && run.inputJson !== null ? run.inputJson as Record<string, unknown> : {}),
        ...patch,
      };
      const [updated] = await db.update(runs).set({ inputJson, updatedAt: new Date() }).where(eq(runs.id, runId)).returning();
      return updated;
    },

    async clearRunResume(runId: string) {
      const run = await this.getRun(runId);
      if (!run) return;
      const inputJson = {
        ...(typeof run.inputJson === 'object' && run.inputJson !== null ? run.inputJson as Record<string, unknown> : {}),
      };
      delete inputJson.resume;
      await db.update(runs).set({ inputJson, updatedAt: new Date() }).where(eq(runs.id, runId));
    },

    async getToolCall(id: string) {
      const [toolCall] = await db.select().from(toolCalls).where(eq(toolCalls.id, id)).limit(1);
      return toolCall;
    },

    async listToolCallsForRun(runId: string) {
      return db.select().from(toolCalls).where(eq(toolCalls.runId, runId)).orderBy(asc(toolCalls.createdAt));
    },

    async findCompletedToolCall(runId: string, qualifiedName: string, argsJson: Record<string, unknown>) {
      const rows = await this.listToolCallsForRun(runId);
      return rows.find((row) =>
        row.qualifiedName === qualifiedName
        && row.status === 'completed'
        && JSON.stringify(row.argsJson) === JSON.stringify(argsJson),
      );
    },

    async findPendingApprovalForTool(runId: string, toolName: string) {
      const [approval] = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.runId, runId), eq(approvals.toolName, toolName), eq(approvals.status, 'pending')))
        .limit(1);
      return approval;
    },

    async listRuns() {
      return db.select().from(runs).orderBy(desc(runs.createdAt)).limit(100);
    },

    async claimQueuedRun(runId: string) {
      const [run] = await db
        .update(runs)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(runs.id, runId), eq(runs.status, 'queued')))
        .returning();
      return run;
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
          const requested = (approval.requestedActionJson ?? {}) as { args?: Record<string, unknown> };
          const run = await this.getRun(approval.runId);
          const base = typeof run?.inputJson === 'object' && run?.inputJson !== null
            ? run.inputJson as Record<string, unknown>
            : {};
          await db.update(runs).set({
            status: 'queued',
            updatedAt: new Date(),
            inputJson: {
              ...base,
              resume: {
                approvalId: id,
                toolCallId: approval.toolCallId,
                qualifiedName: approval.toolName,
                toolArgs: requested.args ?? {},
              },
            },
          }).where(eq(runs.id, approval.runId));
          await appendRunEvent(approval.runId, 'run.queued', { reason: 'resuming after approval', resume: true, approvalId: id });
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
