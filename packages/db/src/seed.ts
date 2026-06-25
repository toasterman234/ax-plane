import { makeDatabase, createRepositories } from './index';

const { db, client } = makeDatabase();
const repo = createRepositories(db);

import { DEFAULT_AGENT_ID } from '@axplane/agents';
import { HOST_TOOL_CATALOG } from '@axplane/host-tools';

const toolNames = HOST_TOOL_CATALOG.map((t) => t.qualifiedName);

await repo.upsertAgent({
  id: DEFAULT_AGENT_ID,
  name: 'Default Ax Agent',
  description: 'Default agent with read-only host tools and approval-gated write tools.',
  signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
  configJson: {
    id: DEFAULT_AGENT_ID,
    name: 'Default Ax Agent',
    mode: 'rlm',
    signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    tools: toolNames,
    policies: ['write_tool_requires_approval', 'block_secret_exfiltration'],
  },
});

const request = await repo.createRequest({
  body: 'Create a short plan and use the fake risky tool so I can test approvals.',
  agentId: DEFAULT_AGENT_ID,
  routeDecision: {
    selectedAgentId: DEFAULT_AGENT_ID,
    reason: 'Seed default route',
    strategy: 'default',
  },
});

console.log(`Seeded default agent and request ${request.id}`);
await client.end();
