import { parseAgentConfigJson } from '@axplane/agents';

export function routingConfig(configJson: unknown) {
  try {
    const config = parseAgentConfigJson(
      typeof configJson === 'object' && configJson !== null && 'id' in (configJson as object)
        ? configJson
        : { id: 'unknown', name: 'Unknown', signature: 'taskText:string -> answer:string', ...(configJson as object) },
    );
    return config.routing ?? { keywords: [], priority: 0, isDefault: false };
  } catch {
    return { keywords: [], priority: 0, isDefault: false };
  }
}
