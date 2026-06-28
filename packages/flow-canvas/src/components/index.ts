export { FlowCanvas } from './flow-canvas';
export { AxNode } from './ax-node';
export {
  ConversationFlowCanvas,
  reduceFlowTrace,
  type ConversationFlowCanvasProps,
} from './conversation-flow-canvas';
// Re-exported so web-app consumers can type flow-trace events without taking a
// direct dependency on @axplane/flow-trace-bus.
export type { FlowTraceEvent } from '@axplane/flow-trace-bus';
