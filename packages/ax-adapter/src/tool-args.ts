export function stableToolArgsKey(args: Record<string, unknown>): string {
  return JSON.stringify(args, Object.keys(args).sort());
}
