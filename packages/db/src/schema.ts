import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentVersions = pgTable('agent_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  signature: text('signature').notNull(),
  configJson: jsonb('config_json').notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentVersionIdx: uniqueIndex('agent_versions_agent_version_idx').on(table.agentId, table.version),
}));

export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  body: text('body').notNull(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  status: text('status').notNull().default('new'),
  routeDecisionJson: jsonb('route_decision_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id),
  agentVersionId: uuid('agent_version_id').references(() => agentVersions.id),
  parentRunId: uuid('parent_run_id').references((): AnyPgColumn => runs.id, { onDelete: 'cascade' }),
  stepKey: text('step_key'),
  runKind: text('run_kind').notNull().default('agent'),
  status: text('status').notNull().default('queued'),
  inputJson: jsonb('input_json').notNull().default(sql`'{}'::jsonb`),
  outputJson: jsonb('output_json'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('runs_status_idx').on(table.status),
  parentIdx: index('runs_parent_idx').on(table.parentRunId),
}));

export const runEvents = pgTable('run_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  type: text('type').notNull(),
  payloadJson: jsonb('payload_json').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  runSeqIdx: uniqueIndex('run_events_run_seq_idx').on(table.runId, table.seq),
  runIdx: index('run_events_run_idx').on(table.runId),
}));

export const toolCalls = pgTable('tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  qualifiedName: text('qualified_name').notNull(),
  argsJson: jsonb('args_json').notNull().default(sql`'{}'::jsonb`),
  resultJson: jsonb('result_json'),
  status: text('status').notNull().default('requested'),
  approvalId: uuid('approval_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  toolCallId: uuid('tool_call_id').references(() => toolCalls.id),
  toolName: text('tool_name').notNull(),
  reason: text('reason').notNull(),
  requestedActionJson: jsonb('requested_action_json').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('pending'),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modelUsage = pgTable('model_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull().default('unknown'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsdMicro: integer('cost_usd_micro'),
  rawJson: jsonb('raw_json').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  path: text('path').notNull(),
  metadataJson: jsonb('metadata_json').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('memory_entries_agent_idx').on(table.agentId),
  createdIdx: index('memory_entries_created_idx').on(table.createdAt),
}));

export const customTools = pgTable('custom_tools', {
  qualifiedName: text('qualified_name').primaryKey(),
  namespace: text('namespace').notNull().default('http'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  risk: text('risk').notNull().default('risky'),
  method: text('method').notNull().default('POST'),
  urlTemplate: text('url_template').notNull(),
  parameters: jsonb('parameters').notNull().default(sql`'{}'::jsonb`),
  headersJson: jsonb('headers_json').notNull().default(sql`'{}'::jsonb`),
  bodyTemplate: text('body_template'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const graphWorkflows = pgTable('graph_workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evalSuites = pgTable('eval_suites', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('eval_suites_agent_idx').on(table.agentId),
}));

export const optimizationRuns = pgTable('optimization_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  suiteId: uuid('suite_id').notNull().references(() => evalSuites.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'),
  optimizerType: text('optimizer_type').notNull().default('ax-native-mock'),
  optimizerConfig: jsonb('optimizer_config').notNull().default(sql`'{}'::jsonb`),
  baselineEvalRunId: uuid('baseline_eval_run_id').references((): AnyPgColumn => evalRuns.id, { onDelete: 'set null' }),
  candidateEvalRunId: uuid('candidate_eval_run_id').references((): AnyPgColumn => evalRuns.id, { onDelete: 'set null' }),
  candidateId: uuid('candidate_id').references((): AnyPgColumn => agentCandidates.id, { onDelete: 'set null' }),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('optimization_runs_agent_idx').on(table.agentId, table.createdAt),
}));

export const agentCandidates = pgTable('agent_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  sourceOptimizationRunId: uuid('source_optimization_run_id').references(() => optimizationRuns.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  artifactJson: jsonb('artifact_json').notNull(),
  artifactText: text('artifact_text'),
  baselineScore: integer('baseline_score'),
  candidateScore: integer('candidate_score'),
  metricsJson: jsonb('metrics_json').notNull().default(sql`'{}'::jsonb`),
  promotedVersionId: uuid('promoted_version_id').references(() => agentVersions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
}, (table) => ({
  agentIdx: index('agent_candidates_agent_idx').on(table.agentId, table.createdAt),
}));

export const forgeSessions = pgTable('forge_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull().default('intake'),
  intakeJson: jsonb('intake_json').notNull().default(sql`'{}'::jsonb`),
  draftJson: jsonb('draft_json'),
  draftMetaJson: jsonb('draft_meta_json'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  suiteId: uuid('suite_id').references(() => evalSuites.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('forge_sessions_status_idx').on(table.status, table.createdAt),
}));

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  suiteId: uuid('suite_id').notNull().references(() => evalSuites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  taskText: text('task_text').notNull(),
  criteria: jsonb('criteria').notNull().default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  suiteIdx: index('eval_cases_suite_idx').on(table.suiteId, table.sortOrder),
}));

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  suiteId: uuid('suite_id').notNull().references(() => evalSuites.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id),
  agentVersionId: uuid('agent_version_id').references(() => agentVersions.id),
  candidateId: uuid('candidate_id').references(() => agentCandidates.id, { onDelete: 'set null' }),
  runLabel: text('run_label'),
  status: text('status').notNull().default('running'),
  mode: text('mode').notNull().default('mock'),
  summaryJson: jsonb('summary_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  suiteIdx: index('eval_runs_suite_idx').on(table.suiteId, table.createdAt),
}));

export const evalCaseResults = pgTable('eval_case_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  evalRunId: uuid('eval_run_id').notNull().references(() => evalRuns.id, { onDelete: 'cascade' }),
  caseId: uuid('case_id').notNull().references(() => evalCases.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  score: integer('score').notNull().default(0),
  detailsJson: jsonb('details_json').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  evalRunIdx: index('eval_case_results_run_idx').on(table.evalRunId),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  versions: many(agentVersions),
  requests: many(requests),
  runs: many(runs),
}));

export const runsRelations = relations(runs, ({ many, one }) => ({
  request: one(requests, { fields: [runs.requestId], references: [requests.id] }),
  events: many(runEvents),
  approvals: many(approvals),
  toolCalls: many(toolCalls),
}));
