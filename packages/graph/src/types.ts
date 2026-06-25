export const GRAPH_ORCHESTRATOR_AGENT_ID = '__graph__';

export type GraphWorkflowStep = {
  id: string;
  agentId: string;
  inputTemplate: string;
};

export type GraphWorkflow = {
  id: string;
  name: string;
  description: string;
  steps: GraphWorkflowStep[];
};

export type GraphStepOutput = {
  output: unknown;
  childRunId: string;
  status: string;
};

export type GraphRunState = {
  stepIndex: number;
  stepOutputs: Record<string, GraphStepOutput>;
};

export type GraphRunInput = {
  runKind: 'graph';
  workflowId: string;
  taskText: string;
  graphState?: GraphRunState;
};
