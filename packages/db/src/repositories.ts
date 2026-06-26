import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ControlEventType, RunStatus } from '@axplane/events';
import type { EvalCriterion } from '@axplane/eval';
import { GRAPH_ORCHESTRATOR_AGENT_ID, parseWorkflowSteps } from '@axplane/graph';
import { AX_FLOW_ORCHESTRATOR_AGENT_ID, AX_DISPATCHER_ORCHESTRATOR_AGENT_ID } from '@axplane/flow-canvas';
import type { MemoryEntry } from '@axplane/memory';
import { rankMemoryEntries } from '@axplane/memory';
import type { Database } from './client';
import { hostDefinitionFromCustomToolRow, httpQualifiedName, type CustomHttpToolInput } from '@axplane/host-tools';
import { agents, agentCandidates, agentVersions, approvals, customTools, evalCaseResults, evalCases, evalRuns, evalSuites, forgeSessions, graphWorkflows, memoryEntries, modelUsage, optimizationRuns, requests, runEvents, runs, toolCalls } from './schema';

function memoryEntryFromRow(row: typeof memoryEntries.$inferSelect): MemoryEntry {
  return {
    id: row.id,
    agentId: row.agentId,
    runId: row.runId,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    createdAt: row.createdAt,
  };
}

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

    async createAgent(input: {
      id: string;
      name: string;
      description?: string;
      signature: string;
      configJson: unknown;
    }) {
      const existing = await this.getAgent(input.id);
      if (existing) {
        throw new Error(`Agent already exists: ${input.id}`);
      }

      await db.insert(agents).values({
        id: input.id,
        name: input.name,
        description: input.description ?? '',
      });

      const [version] = await db
        .insert(agentVersions)
        .values({
          agentId: input.id,
          version: 1,
          signature: input.signature,
          configJson: input.configJson,
          isCurrent: true,
        })
        .returning();

      return { agent: await this.getAgent(input.id), version };
    },

    async duplicateAgent(input: {
      sourceAgentId: string;
      id: string;
      name: string;
      description?: string;
      signature: string;
      configJson: unknown;
    }) {
      const source = await this.getAgent(input.sourceAgentId);
      if (!source) {
        throw new Error(`Source agent not found: ${input.sourceAgentId}`);
      }

      const currentVersion = await this.getCurrentAgentVersion(input.sourceAgentId);
      if (!currentVersion) {
        throw new Error(`Source agent has no version: ${input.sourceAgentId}`);
      }

      return this.createAgent({
        id: input.id,
        name: input.name,
        description: input.description,
        signature: input.signature,
        configJson: input.configJson,
      });
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

    async createRun(input: {
      requestId: string;
      agentId: string;
      agentVersionId?: string | null;
      inputJson?: Record<string, unknown>;
    }) {
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request) throw new Error(`Request not found: ${input.requestId}`);

      let versionId = input.agentVersionId;
      if (versionId === undefined) {
        const [version] = await db
          .select()
          .from(agentVersions)
          .where(and(eq(agentVersions.agentId, input.agentId), eq(agentVersions.isCurrent, true)))
          .limit(1);
        versionId = version?.id;
      }

      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: input.agentId,
          agentVersionId: versionId ?? null,
          status: 'queued',
          inputJson: input.inputJson ?? { taskText: request.body },
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

    async listModelUsageForRun(runId: string) {
      return db.select().from(modelUsage).where(eq(modelUsage.runId, runId));
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
      return db
        .select()
        .from(runs)
        .where(and(eq(runs.status, 'queued'), isNull(runs.parentRunId)))
        .orderBy(asc(runs.createdAt))
        .limit(limit);
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

    async listCustomTools() {
      const rows = await db.select().from(customTools).orderBy(asc(customTools.qualifiedName));
      return rows.map(hostDefinitionFromCustomToolRow);
    },

    async getCustomToolsByNames(toolNames: string[]) {
      if (toolNames.length === 0) return [];
      const rows = await db.select().from(customTools).where(inArray(customTools.qualifiedName, toolNames));
      return rows.map(hostDefinitionFromCustomToolRow);
    },

    async createCustomHttpTool(input: CustomHttpToolInput) {
      const qualifiedName = httpQualifiedName(input.name);
      const definition = hostDefinitionFromCustomToolRow({
        qualifiedName,
        namespace: 'http',
        name: input.name,
        description: input.description,
        risk: input.risk ?? 'risky',
        method: input.method ?? 'POST',
        urlTemplate: input.urlTemplate,
        parameters: input.parameters ?? {
          type: 'object',
          properties: {
            payload: { type: 'string', description: 'Value for {{payload}} in templates' },
          },
        },
        headersJson: input.headers ?? {},
        bodyTemplate: input.bodyTemplate ?? null,
      });

      const existing = await db.select().from(customTools).where(eq(customTools.qualifiedName, qualifiedName)).limit(1);
      if (existing.length > 0) {
        throw new Error(`Custom tool already exists: ${qualifiedName}`);
      }

      await db.insert(customTools).values({
        qualifiedName,
        namespace: 'http',
        name: input.name,
        description: input.description,
        risk: definition.risk,
        method: definition.http?.method ?? 'POST',
        urlTemplate: input.urlTemplate,
        parameters: definition.parameters,
        headersJson: definition.http?.headers ?? {},
        bodyTemplate: definition.http?.bodyTemplate ?? null,
      });

      return definition;
    },

    async deleteCustomTool(qualifiedName: string) {
      const [deleted] = await db.delete(customTools).where(eq(customTools.qualifiedName, qualifiedName)).returning();
      return deleted;
    },

    async createMemoryEntry(input: {
      agentId: string | null;
      runId: string | null;
      content: string;
      tags: string[];
    }) {
      const [row] = await db
        .insert(memoryEntries)
        .values({
          agentId: input.agentId,
          runId: input.runId,
          content: input.content,
          tags: input.tags,
        })
        .returning();
      return memoryEntryFromRow(row!);
    },

    async listMemoryForAgent(agentId: string | null, limit = 200) {
      const whereClause = agentId
        ? or(eq(memoryEntries.agentId, agentId), isNull(memoryEntries.agentId))
        : isNull(memoryEntries.agentId);

      const rows = await db
        .select()
        .from(memoryEntries)
        .where(whereClause)
        .orderBy(desc(memoryEntries.createdAt))
        .limit(limit);

      return rows.map(memoryEntryFromRow);
    },

    async listMemoryEntries(input: { agentId?: string; query?: string; limit?: number } = {}) {
      const limit = Math.min(input.limit ?? 50, 500);
      let whereClause;
      if (input.agentId === 'global') {
        whereClause = isNull(memoryEntries.agentId);
      } else if (input.agentId) {
        whereClause = or(eq(memoryEntries.agentId, input.agentId), isNull(memoryEntries.agentId));
      }

      const rows = await db
        .select()
        .from(memoryEntries)
        .where(whereClause)
        .orderBy(desc(memoryEntries.createdAt))
        .limit(limit * 4);

      const entries = rows.map(memoryEntryFromRow);
      if (input.query?.trim()) {
        return rankMemoryEntries(entries, input.query.trim(), limit);
      }
      return entries.slice(0, limit);
    },

    async listEvalSuites(agentId?: string) {
      const suites = agentId
        ? await db
          .select()
          .from(evalSuites)
          .where(or(eq(evalSuites.agentId, agentId), isNull(evalSuites.agentId)))
          .orderBy(asc(evalSuites.name))
        : await db.select().from(evalSuites).orderBy(asc(evalSuites.name));
      const cases = await db.select().from(evalCases).orderBy(asc(evalCases.sortOrder));
      const casesBySuite = new Map<string, typeof cases>();
      for (const row of cases) {
        const list = casesBySuite.get(row.suiteId) ?? [];
        list.push(row);
        casesBySuite.set(row.suiteId, list);
      }
      return suites.map((suite) => ({
        ...suite,
        cases: (casesBySuite.get(suite.id) ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          taskText: row.taskText,
          criteria: row.criteria as EvalCriterion[],
          sortOrder: row.sortOrder,
        })),
      }));
    },

    async getEvalSuite(suiteId: string) {
      const [suite] = await db.select().from(evalSuites).where(eq(evalSuites.id, suiteId)).limit(1);
      if (!suite) return null;
      const cases = await db
        .select()
        .from(evalCases)
        .where(eq(evalCases.suiteId, suiteId))
        .orderBy(asc(evalCases.sortOrder));
      return {
        ...suite,
        cases: cases.map((row) => ({
          id: row.id,
          name: row.name,
          taskText: row.taskText,
          criteria: row.criteria as EvalCriterion[],
          sortOrder: row.sortOrder,
        })),
      };
    },

    async createEvalSuite(input: {
      name: string;
      description?: string;
      agentId?: string | null;
      cases: Array<{ name: string; taskText: string; criteria: unknown[]; sortOrder?: number }>;
    }) {
      const [suite] = await db
        .insert(evalSuites)
        .values({
          name: input.name,
          description: input.description ?? '',
          agentId: input.agentId ?? null,
        })
        .returning();
      if (input.cases.length > 0) {
        await db.insert(evalCases).values(
          input.cases.map((row, index) => ({
            suiteId: suite!.id,
            name: row.name,
            taskText: row.taskText,
            criteria: row.criteria as EvalCriterion[],
            sortOrder: row.sortOrder ?? index,
          })),
        );
      }
      return this.getEvalSuite(suite!.id);
    },

    async createEvalRun(input: {
      suiteId: string;
      agentId: string;
      agentVersionId?: string | null;
      candidateId?: string | null;
      runLabel?: string | null;
      mode: 'mock' | 'real';
    }) {
      const [row] = await db
        .insert(evalRuns)
        .values({
          suiteId: input.suiteId,
          agentId: input.agentId,
          agentVersionId: input.agentVersionId ?? null,
          candidateId: input.candidateId ?? null,
          runLabel: input.runLabel ?? null,
          mode: input.mode,
          status: 'running',
        })
        .returning();
      return row!;
    },

    async updateEvalRun(
      evalRunId: string,
      patch: { status: string; summaryJson?: unknown; completedAt?: Date },
    ) {
      const values: Record<string, unknown> = { status: patch.status };
      if (patch.summaryJson !== undefined) values.summaryJson = patch.summaryJson;
      if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;
      const [row] = await db.update(evalRuns).set(values).where(eq(evalRuns.id, evalRunId)).returning();
      return row;
    },

    async createEvalCaseResult(input: {
      evalRunId: string;
      caseId: string;
      runId: string | null;
      status: string;
      score: number;
      detailsJson: unknown;
    }) {
      const [row] = await db.insert(evalCaseResults).values(input).returning();
      return row;
    },

    async listEvalRuns(suiteId?: string) {
      const rows = suiteId
        ? await db.select().from(evalRuns).where(eq(evalRuns.suiteId, suiteId)).orderBy(desc(evalRuns.createdAt))
        : await db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt));
      return rows;
    },

    async getEvalRun(evalRunId: string) {
      const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, evalRunId)).limit(1);
      if (!row) return null;
      const results = await db
        .select({
          id: evalCaseResults.id,
          caseId: evalCaseResults.caseId,
          runId: evalCaseResults.runId,
          status: evalCaseResults.status,
          score: evalCaseResults.score,
          detailsJson: evalCaseResults.detailsJson,
          caseName: evalCases.name,
        })
        .from(evalCaseResults)
        .innerJoin(evalCases, eq(evalCaseResults.caseId, evalCases.id))
        .where(eq(evalCaseResults.evalRunId, evalRunId));
      return { ...row, results };
    },

    async listChildRuns(parentRunId: string) {
      return db
        .select()
        .from(runs)
        .where(eq(runs.parentRunId, parentRunId))
        .orderBy(asc(runs.createdAt));
    },

    async listGraphWorkflows() {
      const rows = await db.select().from(graphWorkflows).orderBy(asc(graphWorkflows.name));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        steps: parseWorkflowSteps(row.steps),
        ...(row.pattern ? { pattern: row.pattern } : {}),
        ...(row.definitionJson != null ? { definitionJson: row.definitionJson } : {}),
      }));
    },

    async getGraphWorkflow(workflowId: string) {
      const [row] = await db.select().from(graphWorkflows).where(eq(graphWorkflows.id, workflowId)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        steps: parseWorkflowSteps(row.steps),
        ...(row.pattern ? { pattern: row.pattern } : {}),
        ...(row.definitionJson != null ? { definitionJson: row.definitionJson } : {}),
      };
    },

    async upsertGraphWorkflow(input: {
      id: string;
      name: string;
      description?: string;
      steps: unknown[];
      pattern?: string;
      definitionJson?: unknown;
    }) {
      await db
        .insert(graphWorkflows)
        .values({
          id: input.id,
          name: input.name,
          description: input.description ?? '',
          steps: input.steps,
          pattern: input.pattern ?? null,
          definitionJson: input.definitionJson ?? null,
        })
        .onConflictDoUpdate({
          target: graphWorkflows.id,
          set: {
            name: input.name,
            description: input.description ?? '',
            steps: input.steps,
            pattern: input.pattern ?? null,
            definitionJson: input.definitionJson ?? null,
          },
        });
      return this.getGraphWorkflow(input.id);
    },

    async ensureGraphOrchestratorAgent() {
      await db
        .insert(agents)
        .values({
          id: GRAPH_ORCHESTRATOR_AGENT_ID,
          name: 'Graph orchestrator',
          description: 'Control-plane workflow runner (not an Ax agent).',
        })
        .onConflictDoNothing();
    },

    async createGraphRun(input: { requestId: string; workflowId: string; taskText: string }) {
      await this.ensureGraphOrchestratorAgent();
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request) throw new Error(`Request not found: ${input.requestId}`);

      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: GRAPH_ORCHESTRATOR_AGENT_ID,
          runKind: 'graph',
          status: 'queued',
          inputJson: {
            runKind: 'graph',
            workflowId: input.workflowId,
            taskText: input.taskText,
            graphState: { stepIndex: 0, stepOutputs: {} },
          },
        })
        .returning();

      await appendRunEvent(run!.id, 'run.queued', {
        requestId: input.requestId,
        workflowId: input.workflowId,
        runKind: 'graph',
      });
      return run!;
    },

    async ensureAxFlowOrchestratorAgent() {
      await db
        .insert(agents)
        .values({
          id: AX_FLOW_ORCHESTRATOR_AGENT_ID,
          name: 'AxFlow orchestrator',
          description: 'Control-plane ax-llm flow() runner (proxies ax-server).',
        })
        .onConflictDoNothing();
    },

    async createAxFlowRun(input: { requestId: string; flowId: string; flowInput: string }) {
      await this.ensureAxFlowOrchestratorAgent();
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request) throw new Error(`Request not found: ${input.requestId}`);

      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: AX_FLOW_ORCHESTRATOR_AGENT_ID,
          runKind: 'axflow',
          status: 'queued',
          inputJson: {
            runKind: 'axflow',
            flowId: input.flowId,
            flowInput: input.flowInput,
          },
        })
        .returning();

      await appendRunEvent(run!.id, 'run.queued', {
        requestId: input.requestId,
        flowId: input.flowId,
        runKind: 'axflow',
      });
      return run!;
    },

    async ensureAxDispatcherOrchestratorAgent() {
      await db
        .insert(agents)
        .values({
          id: AX_DISPATCHER_ORCHESTRATOR_AGENT_ID,
          name: 'Ax dispatcher orchestrator',
          description: 'Control-plane ax-server /dispatcher proxy (team RLM).',
        })
        .onConflictDoNothing();
    },

    async createAxDispatcherRun(input: { requestId: string; query: string }) {
      await this.ensureAxDispatcherOrchestratorAgent();
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request) throw new Error(`Request not found: ${input.requestId}`);

      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: AX_DISPATCHER_ORCHESTRATOR_AGENT_ID,
          runKind: 'axdispatcher',
          status: 'queued',
          inputJson: {
            runKind: 'axdispatcher',
            query: input.query,
          },
        })
        .returning();

      await appendRunEvent(run!.id, 'run.queued', {
        requestId: input.requestId,
        runKind: 'axdispatcher',
      });
      return run!;
    },

    async createChildRun(input: {
      parentRunId: string;
      requestId: string;
      agentId: string;
      stepKey: string;
      taskText: string;
    }) {
      const [version] = await db
        .select()
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, input.agentId), eq(agentVersions.isCurrent, true)))
        .limit(1);

      const [run] = await db
        .insert(runs)
        .values({
          requestId: input.requestId,
          agentId: input.agentId,
          agentVersionId: version?.id ?? null,
          parentRunId: input.parentRunId,
          stepKey: input.stepKey,
          runKind: 'agent',
          status: 'queued',
          inputJson: { taskText: input.taskText, parentRunId: input.parentRunId, stepKey: input.stepKey },
        })
        .returning();

      await appendRunEvent(run!.id, 'run.queued', {
        parentRunId: input.parentRunId,
        stepKey: input.stepKey,
        agentId: input.agentId,
      });
      return run!;
    },

    async createOptimizationRun(input: {
      agentId: string;
      suiteId: string;
      optimizerType: string;
      optimizerConfig?: Record<string, unknown>;
    }) {
      const [row] = await db
        .insert(optimizationRuns)
        .values({
          agentId: input.agentId,
          suiteId: input.suiteId,
          optimizerType: input.optimizerType,
          optimizerConfig: input.optimizerConfig ?? {},
          status: 'running',
        })
        .returning();
      return row!;
    },

    async updateOptimizationRun(
      optimizationRunId: string,
      patch: {
        status?: string;
        baselineEvalRunId?: string | null;
        candidateEvalRunId?: string | null;
        candidateId?: string | null;
        error?: string | null;
        completedAt?: Date;
      },
    ) {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.baselineEvalRunId !== undefined) values.baselineEvalRunId = patch.baselineEvalRunId;
      if (patch.candidateEvalRunId !== undefined) values.candidateEvalRunId = patch.candidateEvalRunId;
      if (patch.candidateId !== undefined) values.candidateId = patch.candidateId;
      if (patch.error !== undefined) values.error = patch.error;
      if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;
      const [row] = await db
        .update(optimizationRuns)
        .set(values)
        .where(eq(optimizationRuns.id, optimizationRunId))
        .returning();
      return row;
    },

    async getOptimizationRun(id: string) {
      const [row] = await db.select().from(optimizationRuns).where(eq(optimizationRuns.id, id)).limit(1);
      return row ?? null;
    },

    async listOptimizationRuns(agentId: string) {
      return db
        .select()
        .from(optimizationRuns)
        .where(eq(optimizationRuns.agentId, agentId))
        .orderBy(desc(optimizationRuns.createdAt));
    },

    async createAgentCandidate(input: {
      agentId: string;
      sourceOptimizationRunId?: string | null;
      name: string;
      status?: string;
      artifactJson: unknown;
      artifactText?: string | null;
      baselineScore?: number | null;
      candidateScore?: number | null;
      metricsJson?: Record<string, unknown>;
    }) {
      const [row] = await db
        .insert(agentCandidates)
        .values({
          agentId: input.agentId,
          sourceOptimizationRunId: input.sourceOptimizationRunId ?? null,
          name: input.name,
          status: input.status ?? 'draft',
          artifactJson: input.artifactJson,
          artifactText: input.artifactText ?? null,
          baselineScore: input.baselineScore ?? null,
          candidateScore: input.candidateScore ?? null,
          metricsJson: input.metricsJson ?? {},
        })
        .returning();
      return row!;
    },

    async updateAgentCandidate(
      candidateId: string,
      patch: {
        status?: string;
        baselineScore?: number | null;
        candidateScore?: number | null;
        metricsJson?: Record<string, unknown>;
        promotedVersionId?: string | null;
        promotedAt?: Date | null;
      },
    ) {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.baselineScore !== undefined) values.baselineScore = patch.baselineScore;
      if (patch.candidateScore !== undefined) values.candidateScore = patch.candidateScore;
      if (patch.metricsJson !== undefined) values.metricsJson = patch.metricsJson;
      if (patch.promotedVersionId !== undefined) values.promotedVersionId = patch.promotedVersionId;
      if (patch.promotedAt !== undefined) values.promotedAt = patch.promotedAt;
      const [row] = await db
        .update(agentCandidates)
        .set(values)
        .where(eq(agentCandidates.id, candidateId))
        .returning();
      return row;
    },

    async getAgentCandidate(id: string) {
      const [row] = await db.select().from(agentCandidates).where(eq(agentCandidates.id, id)).limit(1);
      return row ?? null;
    },

    async listAgentCandidates(agentId: string) {
      return db
        .select()
        .from(agentCandidates)
        .where(eq(agentCandidates.agentId, agentId))
        .orderBy(desc(agentCandidates.createdAt));
    },

    async createForgeSession(input?: { intake?: Record<string, unknown> }) {
      const [row] = await db
        .insert(forgeSessions)
        .values({
          status: 'intake',
          intakeJson: input?.intake ?? {},
        })
        .returning();
      return row!;
    },

    async getForgeSession(id: string) {
      const [row] = await db.select().from(forgeSessions).where(eq(forgeSessions.id, id)).limit(1);
      return row ?? null;
    },

    async listForgeSessions(limit = 50) {
      return db
        .select()
        .from(forgeSessions)
        .orderBy(desc(forgeSessions.createdAt))
        .limit(limit);
    },

    async updateForgeSession(
      id: string,
      patch: {
        status?: string;
        intakeJson?: Record<string, unknown>;
        draftJson?: unknown;
        draftMetaJson?: unknown;
        agentId?: string | null;
        suiteId?: string | null;
        error?: string | null;
      },
    ) {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.intakeJson !== undefined) values.intakeJson = patch.intakeJson;
      if (patch.draftJson !== undefined) values.draftJson = patch.draftJson;
      if (patch.draftMetaJson !== undefined) values.draftMetaJson = patch.draftMetaJson;
      if (patch.agentId !== undefined) values.agentId = patch.agentId;
      if (patch.suiteId !== undefined) values.suiteId = patch.suiteId;
      if (patch.error !== undefined) values.error = patch.error;
      const [row] = await db
        .update(forgeSessions)
        .set(values)
        .where(eq(forgeSessions.id, id))
        .returning();
      return row ?? null;
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
