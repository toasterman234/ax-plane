import { runAxAgent } from '@axplane/ax-adapter';
import type { RuntimeAdapter } from './types';

export const axRuntimeAdapter: RuntimeAdapter = {
  runtime: 'ax',
  runAgent: (input) => runAxAgent(input),
};
