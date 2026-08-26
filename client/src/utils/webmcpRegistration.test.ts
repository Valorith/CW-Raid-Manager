// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { registerWebMcpTools } from '../webmcp/registerTools.js';
import type { WebMcpModelContext, WebMcpTool } from '../webmcp/types.js';

function createTool(name: string): WebMcpTool {
  return {
    name,
    description: `Run ${name}`,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    execute: () => ({ ok: true })
  };
}

test('does nothing when WebMCP is disabled', async () => {
  let registrationCount = 0;
  const context: WebMcpModelContext = {
    registerTool: () => {
      registrationCount += 1;
    }
  };

  const registration = await registerWebMcpTools({
    enabled: false,
    context,
    tools: [createTool('read_raids')]
  });

  assert.equal(registration.status, 'disabled');
  assert.equal(registrationCount, 0);
  assert.deepEqual(registration.registeredToolNames, []);
});

test('reports unsupported when the browser has no model context', async () => {
  const registration = await registerWebMcpTools({
    enabled: true,
    document: {} as Document,
    tools: [createTool('read_raids')]
  });

  assert.equal(registration.status, 'unsupported');
  assert.deepEqual(registration.registeredToolNames, []);
});

test('registers a tool set with one lifecycle signal and aborts it on dispose', async () => {
  const registrations: Array<{ name: string; signal?: AbortSignal }> = [];
  const context: WebMcpModelContext = {
    registerTool: (tool, options) => {
      registrations.push({ name: tool.name, signal: options?.signal });
    }
  };

  const registration = await registerWebMcpTools({
    enabled: true,
    context,
    tools: [createTool('read_raids'), createTool('read_raid')]
  });

  assert.equal(registration.status, 'registered');
  assert.deepEqual(registration.registeredToolNames, ['read_raids', 'read_raid']);
  assert.equal(registrations.length, 2);
  assert.equal(registrations[0]?.signal, registrations[1]?.signal);
  assert.equal(registrations[0]?.signal?.aborted, false);

  registration.dispose();
  assert.equal(registrations[0]?.signal?.aborted, true);
});

test('rolls back the complete tool set when registration fails', async () => {
  const signals: AbortSignal[] = [];
  const errors: unknown[] = [];
  const context: WebMcpModelContext = {
    registerTool: (tool, options) => {
      if (options?.signal) signals.push(options.signal);
      if (tool.name === 'read_raid') {
        throw new Error('registration failed');
      }
    }
  };

  const registration = await registerWebMcpTools({
    enabled: true,
    context,
    tools: [createTool('read_raids'), createTool('read_raid')],
    onError: (error) => errors.push(error)
  });

  assert.equal(registration.status, 'failed');
  assert.deepEqual(registration.registeredToolNames, []);
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(errors.length, 1);
});

test('rejects duplicate tool names before registering either tool', async () => {
  let registrationCount = 0;
  const context: WebMcpModelContext = {
    registerTool: () => {
      registrationCount += 1;
    }
  };

  const registration = await registerWebMcpTools({
    enabled: true,
    context,
    tools: [createTool('read_raids'), createTool('read_raids')]
  });

  assert.equal(registration.status, 'failed');
  assert.equal(registrationCount, 0);
});

test('cancels a pending registration before later tools can become active', async () => {
  const lifecycle = new AbortController();
  const registrations: Array<{ name: string; signal?: AbortSignal }> = [];
  let releaseSecondRegistration: () => void = () => undefined;
  const secondRegistrationStarted = new Promise<void>((resolveStarted) => {
    releaseSecondRegistration = resolveStarted;
  });
  const context: WebMcpModelContext = {
    async registerTool(tool, options) {
      registrations.push({ name: tool.name, signal: options?.signal });
      if (tool.name === 'read_raid') {
        await secondRegistrationStarted;
      }
    }
  };

  const registrationPromise = registerWebMcpTools({
    enabled: true,
    signal: lifecycle.signal,
    context,
    tools: [createTool('read_raids'), createTool('read_raid'), createTool('read_loot')]
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  lifecycle.abort();
  releaseSecondRegistration();
  const registration = await registrationPromise;

  assert.equal(registration.status, 'failed');
  assert.deepEqual(
    registrations.map((entry) => entry.name),
    ['read_raids', 'read_raid']
  );
  assert.ok(registrations.every((entry) => entry.signal?.aborted));
});

test('rejects blank tool names before browser registration', async () => {
  let registrationCount = 0;
  const context: WebMcpModelContext = {
    registerTool: () => {
      registrationCount += 1;
    }
  };

  const registration = await registerWebMcpTools({
    enabled: true,
    context,
    tools: [createTool('   ')]
  });

  assert.equal(registration.status, 'failed');
  assert.equal(registrationCount, 0);
});

test('resolves the native context from the provided document and disposes idempotently', async () => {
  const signals: AbortSignal[] = [];
  const documentValue = {
    modelContext: {
      registerTool: (_tool: WebMcpTool, options?: { signal?: AbortSignal }) => {
        if (options?.signal) signals.push(options.signal);
      }
    }
  } as unknown as Document;

  const registration = await registerWebMcpTools({
    enabled: true,
    document: documentValue,
    tools: [createTool('read_raids')]
  });

  assert.equal(registration.status, 'registered');
  registration.dispose();
  registration.dispose();
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.aborted, true);
});
