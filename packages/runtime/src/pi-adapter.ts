import type { RuntimeAdapter } from './types';

export const piRuntimeAdapter: RuntimeAdapter = {
  runtime: 'pi',
  async runAgent() {
    throw new Error(
      'PI runtime is not wired yet. Use runtime: "ax" or wait for governed pi adapter.',
    );
  },
};
