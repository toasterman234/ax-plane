import { z } from 'zod';

export const ControlEventTypeSchema = z.enum([
  'request.created',
  'request.classified',
  'run.queued',
  'run.resumed',
  'run.started',
  'run.status',
  'ax.actor_turn',
  'ax.context_event',
  'ax.function_call.requested',
  'ax.function_call.allowed',
  'ax.function_call.blocked',
  'ax.function_call.approval_required',
  'ax.function_call.completed',
  'ax.function_call.reused',
  'ax.model.resolved',
  'memory.injected',
  'memory.saved',
  'graph.started',
  'graph.step.queued',
  'graph.step.started',
  'graph.step.completed',
  'graph.handoff',
  'graph.completed',
  'graph.failed',
  'graph.resumed',
  'axflow.started',
  'axflow.step.started',
  'axflow.step.completed',
  'axflow.step.detail',
  'axflow.completed',
  'axflow.failed',
  'ax.chat_log.captured',
  'ax.usage.captured',
  'ax.traces.captured',
  'approval.created',
  'approval.approved',
  'approval.rejected',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

export type ControlEventType = z.infer<typeof ControlEventTypeSchema>;

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'needs_approval',
  'completed',
  'failed',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ToolRiskSchema = z.enum(['safe', 'medium', 'risky']);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const ControlEventSchema = z.object({
  id: z.string().uuid().optional(),
  runId: z.string().uuid(),
  seq: z.number().int().nonnegative().optional(),
  type: ControlEventTypeSchema,
  payload: z.record(z.any()).default({}),
  createdAt: z.coerce.date().optional(),
});
export type ControlEvent = z.infer<typeof ControlEventSchema>;

export const CreateRequestSchema = z.object({
  body: z.string().min(1),
  agentId: z.string().min(1).optional(),
  autoStart: z.boolean().default(false),
});
export type CreateRequest = z.infer<typeof CreateRequestSchema>;

export const CreateRunSchema = z.object({
  requestId: z.string().uuid(),
  agentId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  axFlowId: z.string().min(1).optional(),
  flowInput: z.string().optional(),
});
export type CreateRun = z.infer<typeof CreateRunSchema>;

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export function assertControlEvent(input: unknown): ControlEvent {
  return ControlEventSchema.parse(input);
}
