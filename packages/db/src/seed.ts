import { makeDatabase, createRepositories } from './index';

const { db, client } = makeDatabase();
const repo = createRepositories(db);

await repo.upsertAgent({
  id: 'demo_ax_agent',
  name: 'Demo Ax Agent',
  description: 'MVP demo agent with one safe tool and one fake risky approval-gated tool.',
  signature: 'request:string -> answer:string, nextActions:string[]',
  configJson: {
    id: 'demo_ax_agent',
    name: 'Demo Ax Agent',
    mode: 'rlm',
    signature: 'request:string -> answer:string, nextActions:string[]',
    tools: ['fake.projectLookup', 'fake.riskyAction'],
    policies: ['fake_risky_action_requires_approval'],
  },
});

const request = await repo.createRequest({
  body: 'Create a short plan and use the fake risky tool so I can test approvals.',
  agentId: 'demo_ax_agent',
});

console.log(`Seeded demo agent and request ${request.id}`);
await client.end();
