import type { WebMcpDocument, WebMcpModelContext, WebMcpRegistration, WebMcpTool } from './types';

interface RegisterWebMcpToolsOptions {
  enabled: boolean;
  tools: WebMcpTool[];
  context?: WebMcpModelContext;
  document?: Document;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
}

const NOOP_DISPOSE = () => undefined;
const REGISTRATION_CANCELED = Symbol('WebMCP registration canceled');

function resolveModelContext(documentValue?: Document): WebMcpModelContext | undefined {
  const resolvedDocument =
    documentValue ?? (typeof document === 'undefined' ? undefined : document);
  return (resolvedDocument as WebMcpDocument | undefined)?.modelContext;
}

function validateToolSet(tools: WebMcpTool[]): void {
  const names = new Set<string>();

  for (const tool of tools) {
    if (!tool.name.trim()) {
      throw new Error('WebMCP tool names must not be empty.');
    }
    if (names.has(tool.name)) {
      throw new Error(`Duplicate WebMCP tool name: ${tool.name}`);
    }
    names.add(tool.name);
  }
}

export async function registerWebMcpTools(
  options: RegisterWebMcpToolsOptions
): Promise<WebMcpRegistration> {
  if (!options.enabled) {
    return {
      status: 'disabled',
      registeredToolNames: [],
      dispose: NOOP_DISPOSE
    };
  }

  const context = options.context ?? resolveModelContext(options.document);
  if (!context?.registerTool) {
    return {
      status: 'unsupported',
      registeredToolNames: [],
      dispose: NOOP_DISPOSE
    };
  }

  const lifecycle = new AbortController();
  const abortLifecycle = () => lifecycle.abort();
  const dispose = () => {
    options.signal?.removeEventListener('abort', abortLifecycle);
    lifecycle.abort();
  };

  if (options.signal?.aborted) {
    abortLifecycle();
  } else {
    options.signal?.addEventListener('abort', abortLifecycle, { once: true });
  }

  try {
    validateToolSet(options.tools);
    for (const tool of options.tools) {
      if (lifecycle.signal.aborted) throw REGISTRATION_CANCELED;
      await Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal }));
    }
    if (lifecycle.signal.aborted) throw REGISTRATION_CANCELED;
  } catch (error) {
    dispose();
    if (error !== REGISTRATION_CANCELED) {
      options.onError?.(error);
    }
    return {
      status: 'failed',
      registeredToolNames: [],
      dispose: NOOP_DISPOSE
    };
  }

  return {
    status: 'registered',
    registeredToolNames: options.tools.map((tool) => tool.name),
    dispose
  };
}
