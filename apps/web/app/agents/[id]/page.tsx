import { AgentShell } from './agent-shell';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentShell agentId={id} />;
}
