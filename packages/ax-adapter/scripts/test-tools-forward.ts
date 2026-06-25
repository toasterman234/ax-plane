import { loadEnv } from '../../db/src/load-env.js';
import { getDefaultAgentConfig } from '@axplane/agents';
import { buildAxFunctions } from '../src/build-functions.js';
import { resolveLlmConfig } from '../src/index.js';

loadEnv();

const config = getDefaultAgentConfig();
const ax = await import('@ax-llm/ax');
const llmConfig = resolveLlmConfig();
const llm = ax.ai({
  name: llmConfig.provider,
  apiKey: llmConfig.apiKey,
  apiURL: llmConfig.apiURL,
  config: { model: llmConfig.model, temperature: 0 },
} as never);

const mockRepo = {
  appendRunEvent: async () => {},
  createToolCall: async () => ({ id: 'x' }),
  updateToolCall: async () => {},
  getToolCall: async () => undefined,
  findCompletedToolCall: async () => undefined,
  getApprovedApprovalForTool: async () => undefined,
  findPendingApprovalForTool: async () => undefined,
  createApproval: async () => ({ id: 'a' }),
} as never;

const functions = buildAxFunctions(mockRepo, 'test-run', config.tools);
console.log('tools', functions.length, functions.map((f) => f.name));
const program = ax.ax(config.signature, { description: config.description, functions });
const out = await program.forward(llm, { taskText: 'tell a short joke about the fake risky tool' }, { debug: false });
console.log('OK', out);
