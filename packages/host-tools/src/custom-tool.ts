import type { HostToolDefinition } from './catalog';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

export type CustomHttpToolInput = {
  name: string;
  description: string;
  method?: HttpMethod;
  urlTemplate: string;
  risk?: 'safe' | 'risky';
  parameters?: Record<string, unknown>;
  headers?: Record<string, string>;
  bodyTemplate?: string;
};

export function httpQualifiedName(name: string): string {
  return `http.${name}`;
}

export function customToolToHostDefinition(input: CustomHttpToolInput & { qualifiedName: string }): HostToolDefinition {
  const parameters = input.parameters ?? {
    type: 'object',
    properties: {
      payload: { type: 'string', description: 'Optional text passed into URL/body templates as {{payload}}' },
    },
  };

  return {
    qualifiedName: input.qualifiedName,
    namespace: 'http',
    name: input.name,
    description: input.description,
    risk: input.risk ?? 'risky',
    parameters,
    http: {
      method: input.method ?? 'POST',
      urlTemplate: input.urlTemplate,
      headers: input.headers ?? {},
      bodyTemplate: input.bodyTemplate,
    },
  };
}

export function hostDefinitionFromCustomToolRow(row: {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: string;
  method: string;
  urlTemplate: string;
  parameters: unknown;
  headersJson: unknown;
  bodyTemplate: string | null;
}): HostToolDefinition {
  return customToolToHostDefinition({
    qualifiedName: row.qualifiedName,
    name: row.name,
    description: row.description,
    method: row.method as HttpMethod,
    urlTemplate: row.urlTemplate,
    risk: row.risk === 'safe' ? 'safe' : 'risky',
    parameters: (row.parameters ?? {}) as Record<string, unknown>,
    headers: (row.headersJson ?? {}) as Record<string, string>,
    bodyTemplate: row.bodyTemplate ?? undefined,
  });
}
