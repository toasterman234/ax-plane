import type { HostToolDefinition } from './catalog';

export type ToolExecutionContext = {
  customTools?: HostToolDefinition[];
};

const DEFAULT_TIMEOUT_MS = Number(process.env.AXPLANE_HTTP_TIMEOUT_MS ?? 15_000);

export function renderTemplate(template: string, args: Record<string, unknown>, encode = false): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = args[key];
    if (value === undefined || value === null) return '';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return encode ? encodeURIComponent(text) : text;
  });
}

function assertAllowedUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`HTTP tool URL must use http or https (got ${parsed.protocol})`);
  }
}

export async function executeHttpTool(
  tool: HostToolDefinition,
  args: Record<string, unknown>,
): Promise<unknown> {
  const http = tool.http;
  if (!http) throw new Error(`Tool ${tool.qualifiedName} is missing HTTP configuration`);

  const url = renderTemplate(http.urlTemplate, args, true);
  assertAllowedUrl(url);

  const method = http.method ?? 'POST';
  const headers: Record<string, string> = {
    'user-agent': 'AxPlane-http-tool/1.0',
    ...http.headers,
  };

  let body: string | undefined;
  if (http.bodyTemplate) {
    body = renderTemplate(http.bodyTemplate, args, false);
    headers['content-type'] ??= 'application/json';
  } else if (method !== 'GET' && Object.keys(args).length > 0) {
    body = JSON.stringify(args);
    headers['content-type'] ??= 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    let parsed: unknown = raw;
    if (contentType.includes('application/json')) {
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = raw;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: parsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`HTTP tool ${tool.qualifiedName} failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
