export class NexusApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "NexusApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  token?: string;
}

export class NexusApi {
  readonly baseUrl: string;
  readonly token?: string;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && typeof value !== "undefined" && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const token = options.token ?? this.token;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    let body: string | undefined;
    if (typeof options.body !== "undefined") {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const payload = parsePayload(text);
    if (!response.ok) {
      throw new NexusApiError(
        response.status,
        errorMessage(payload, response.statusText),
        payload,
      );
    }

    return payload as T;
  }
}

function parsePayload(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return fallback || "Nexus API request failed.";
}
