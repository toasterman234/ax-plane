export type RunResumeCheckpoint = {
  approvalId: string;
  toolCallId?: string;
  qualifiedName: string;
  toolArgs: Record<string, unknown>;
};

export function readRunResume(inputJson: unknown): RunResumeCheckpoint | null {
  if (!inputJson || typeof inputJson !== 'object') return null;
  const resume = (inputJson as { resume?: unknown }).resume;
  if (!resume || typeof resume !== 'object') return null;
  const row = resume as Record<string, unknown>;
  if (typeof row.qualifiedName !== 'string') return null;
  return {
    approvalId: typeof row.approvalId === 'string' ? row.approvalId : '',
    toolCallId: typeof row.toolCallId === 'string' ? row.toolCallId : undefined,
    qualifiedName: row.qualifiedName,
    toolArgs: (row.toolArgs && typeof row.toolArgs === 'object' ? row.toolArgs : {}) as Record<string, unknown>,
  };
}
