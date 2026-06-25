import { z } from 'zod';
import { GRAPH_ORCHESTRATOR_AGENT_ID } from './types';

export const GraphWorkflowIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{2,63}$/, 'Workflow id must be lowercase slug (e.g. lookup_summarize)');

export const GraphWorkflowStepSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,63}$/, 'Step id must be lowercase slug (e.g. lookup)'),
  agentId: z.string().min(1),
  inputTemplate: z.string().min(1).default('{{taskText}}'),
});

export const CreateGraphWorkflowSchema = z
  .object({
    id: GraphWorkflowIdSchema,
    name: z.string().min(1),
    description: z.string().default(''),
    steps: z.array(GraphWorkflowStepSchema).min(1, 'At least one step is required'),
  })
  .superRefine((workflow, ctx) => {
    const stepIds = new Set<string>();
    for (const [index, step] of workflow.steps.entries()) {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step id: ${step.id}`,
          path: ['steps', index, 'id'],
        });
      }
      stepIds.add(step.id);

      if (step.agentId === GRAPH_ORCHESTRATOR_AGENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step agent cannot be the graph orchestrator (${GRAPH_ORCHESTRATOR_AGENT_ID})`,
          path: ['steps', index, 'agentId'],
        });
      }
    }
  });

export type CreateGraphWorkflowInput = z.infer<typeof CreateGraphWorkflowSchema>;
