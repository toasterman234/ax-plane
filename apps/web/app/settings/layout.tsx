import type { ReactNode } from 'react';
import { SettingsHub } from './settings-hub';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsHub>{children}</SettingsHub>;
}
