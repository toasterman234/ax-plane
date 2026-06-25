'use client';

import { useState } from 'react';
import { AgentEditor } from './agent-editor';
import { AgentLab } from './agent-lab';

type Tab = 'editor' | 'lab';

export function AgentShell({ agentId }: { agentId: string }) {
  const [tab, setTab] = useState<Tab>('editor');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-2">
        {([
          ['editor', 'Editor'],
          ['lab', 'Agent Lab'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'editor' ? <AgentEditor agentId={agentId} /> : <AgentLab agentId={agentId} />}
    </div>
  );
}
