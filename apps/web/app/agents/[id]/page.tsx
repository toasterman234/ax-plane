import { AgentEditor } from './agent-editor';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentEditor agentId={id} />;
}
