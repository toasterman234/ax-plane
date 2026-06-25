import * as React from 'react';
import { cn } from '@/lib/utils';

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200 disabled:opacity-50', className)} {...props} />;
}
