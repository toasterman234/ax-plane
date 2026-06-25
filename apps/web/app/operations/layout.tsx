import type { ReactNode } from 'react';
import { OperationsHub } from './operations-hub';

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <OperationsHub>{children}</OperationsHub>;
}
