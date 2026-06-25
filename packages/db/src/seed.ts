import { makeDatabase, createRepositories } from './index';

const { db, client } = makeDatabase();
const repo = createRepositories(db);

import { HOST_TOOL_CATALOG } from '@axplane/host-tools';

const toolNames = HOST_TOOL_CATALOG.map((t) => t.qualifiedName);

await repo.upsertAgent({
  id: 'demo_ax_agent',
  name: 'Demo Ax Agent',
  description: 'Demo agent with read-only host tools and approval-gated write tools.',
  signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
  configJson: {
    id: 'demo_ax_agent',
    name: 'Demo Ax Agent',
    mode: 'rlm',
    signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    tools: toolNames,
    policies: ['write_tool_requires_approval', 'block_secret_exfiltration'],
  },
});

const request = await repo.createRequest({
  body: 'Create a short plan and use the fake risky tool so I can test approvals.',
  agentId: 'demo_ax_agent',
  routeDecision: {
    selectedAgentId: 'demo_ax_agent',
    reason: 'Seed default route',
    strategy: 'default',
  },
});

console.log(`Seeded demo agent and request ${request.id}`);
await client.end();
