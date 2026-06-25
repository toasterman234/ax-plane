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
