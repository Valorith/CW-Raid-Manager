export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface WebMcpToolExecutionOptions {
  signal: AbortSignal;
}

export interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
  execute: (input: unknown, options?: WebMcpToolExecutionOptions) => unknown | Promise<unknown>;
}

export interface WebMcpModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: {
      signal?: AbortSignal;
    }
  ): void | Promise<void>;
}

export interface WebMcpDocument extends Document {
  readonly modelContext?: WebMcpModelContext;
}

export type WebMcpRegistrationStatus = 'disabled' | 'unsupported' | 'registered' | 'failed';

export interface WebMcpRegistration {
  status: WebMcpRegistrationStatus;
  registeredToolNames: string[];
  dispose: () => void;
}
