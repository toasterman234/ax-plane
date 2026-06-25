import type { ReactNode } from 'react';
import { WorkflowsHub } from './workflows-hub';

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return <WorkflowsHub>{children}</WorkflowsHub>;
}
