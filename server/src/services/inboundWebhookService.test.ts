import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrashReviewInput,
  dispatchCrashTelemetryAutoFix,
  looksLikeCrashReport,
  sendCustomWebhookRelay,
  extractContentOnlyPayload
} from './inboundWebhookService.js';
import { renderNotificationEvent } from './notificationEventRenderer.js';

const linuxNativeCrash = `[New LWP 321132]
[New LWP 321138]
[Thread debugging using libthread_db enabled]
Using host libthread_db library "/lib/x86_64-linux-gnu/libthread_db.so.1".
0x0000774af0550bd7 in __GI___wait4 (pid=566762, stat_loc=0x0, options=0, usage=0x0) at ../sysdeps/unix/sysv/linux/wait4.c:30
[Current thread is 1 (Thread 0x774af043d0c0 (LWP 320356))]
#0  0x0000774af0550bd7 in __GI___wait4 (pid=566762, stat_loc=0x0, options=0, usage=0x0) at ../sysdeps/unix/sysv/linux/wait4.c:30
#1  0x000055e6c48f73a8 in print_trace() ()
#2  <signal handler called>
#3  0x0000774af04b9267 in __GI_kill () at ../sysdeps/unix/syscall-template.S:120
#4  0x0000774af0a28b3c in Perl_apply () from /lib/x86_64-linux-gnu/libperl.so.5.36
#5  0x0000774af0a1a913 in Perl_pp_chown () from /lib/x86_64-linux-gnu/libperl.so.5.36
#6  0x0000774af09ba356 in Perl_runops_standard () from /lib/x86_64-linux-gnu/libperl.so.5.36`;

test('detects Linux native crash backtraces as crash reports', () => {
  assert.equal(looksLikeCrashReport(linuxNativeCrash), true);
});

test('buildCrashReviewInput extracts snake_case server crash reports', () => {
  assert.equal(
    buildCrashReviewInput({ crash_report: linuxNativeCrash }, null, {}),
    linuxNativeCrash
  );
});

test('crash telemetry Auto-Fix dispatch queues Codex when Codex is selected', async () => {
  const calls: string[] = [];
  const result = await dispatchCrashTelemetryAutoFix(
    'message-codex',
    { enabled: true, provider: 'codex' },
    {
      sendToDevin: async (messageId) => {
        calls.push(`devin:${messageId}`);
        return { endpointId: 'devin-endpoint' };
      },
      queueCodex: async (messageId) => {
        calls.push(`codex:${messageId}`);
        return { job: { id: 'codex-job' } };
      }
    }
  );

  assert.deepEqual(calls, ['codex:message-codex']);
  assert.deepEqual(result, {
    provider: 'codex',
    triggered: true,
    targetId: 'codex-job'
  });
});

test('crash telemetry Auto-Fix dispatch sends Devin when Devin is selected', async () => {
  const calls: string[] = [];
  const result = await dispatchCrashTelemetryAutoFix(
    'message-devin',
    { enabled: true, provider: 'devin' },
    {
      sendToDevin: async (messageId) => {
        calls.push(`devin:${messageId}`);
        return { endpointId: 'devin-endpoint' };
      },
      queueCodex: async (messageId) => {
        calls.push(`codex:${messageId}`);
        return { job: { id: 'codex-job' } };
      }
    }
  );

  assert.deepEqual(calls, ['devin:message-devin']);
  assert.deepEqual(result, {
    provider: 'devin',
    triggered: true,
    targetId: 'devin-endpoint'
  });
});

test('crash telemetry Auto-Fix dispatch does nothing when disabled', async () => {
  const calls: string[] = [];
  const result = await dispatchCrashTelemetryAutoFix(
    'message-disabled',
    { enabled: false, provider: 'codex' },
    {
      sendToDevin: async (messageId) => {
        calls.push(`devin:${messageId}`);
        return { endpointId: 'devin-endpoint' };
      },
      queueCodex: async (messageId) => {
        calls.push(`codex:${messageId}`);
        return { job: { id: 'codex-job' } };
      }
    }
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    provider: 'codex',
    triggered: false
  });
});

test('renders crash Auto-Fix trigger notifications', () => {
  const rendered = renderNotificationEvent(
    'webhook.crash_auto_fix_triggered',
    {
      messageId: 'message-codex',
      provider: 'codex',
      providerLabel: 'Codex',
      targetId: 'codex-job',
      targetLabel: 'Codex job codex-job',
      webhookLabel: 'Crash Telemetry',
      summary: 'Segmentation fault while loading zone data.',
      signature: {
        exception: 'SIGSEGV',
        topFrame: 'zone_bootup.cpp:88'
      },
      messageUrl: 'https://nexus.example/admin/webhooks?messageId=message-codex'
    },
    { provider: 'TELEGRAM' }
  );

  assert.match(rendered.text, /Crash Auto-Fix triggered/);
  assert.match(rendered.text, /Provider: Codex/);
  assert.match(rendered.text, /Target: Codex job codex-job/);
  assert.match(rendered.text, /Crash Telemetry/);
  assert.match(rendered.text, /SIGSEGV/);
  assert.match(rendered.text, /message-codex/);
});

test('sendCustomWebhookRelay sends no auth header when secret is not provided', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' });

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(capturedHeaders['Authorization'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay sends Authorization Bearer header by default when secret is provided', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }, {
      secret: 'crsr_test_token_123'
    });

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(capturedHeaders['Authorization'], 'Bearer crsr_test_token_123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay does not double-prefix Bearer when secret already starts with Bearer', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }, {
      secret: 'Bearer crsr_test_token_123'
    });

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['Authorization'], 'Bearer crsr_test_token_123');
    assert.ok(!capturedHeaders['Authorization'].includes('Bearer Bearer'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay uses custom header name when provided', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }, {
      secret: 'my-secret-key',
      secretHeaderName: 'X-Webhook-Secret'
    });

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(capturedHeaders['X-Webhook-Secret'], 'my-secret-key');
    assert.equal(capturedHeaders['Authorization'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay does not add Bearer prefix for custom header names', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }, {
      secret: 'plain-secret',
      secretHeaderName: 'X-API-Key'
    });

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['X-API-Key'], 'plain-secret');
    assert.ok(!capturedHeaders['X-API-Key'].startsWith('Bearer'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay works with existing URL-only action (backward compatibility)', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> | undefined;
  let capturedUrl: string | undefined;
  
  try {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' });

    assert.equal(capturedUrl, 'https://example.com/webhook');
    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(Object.keys(capturedHeaders).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay retries on 5xx errors with exponential backoff', async () => {
  const originalFetch = globalThis.fetch;
  const attemptTimestamps: number[] = [];
  let attemptCount = 0;
  
  try {
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      attemptTimestamps.push(Date.now());
      attemptCount++;
      
      if (attemptCount <= 2) {
        return new Response(JSON.stringify({ code: 'internal', message: 'Error' }), { status: 500 });
      }
      
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' });

    assert.equal(attemptCount, 3, 'Should make 3 attempts (initial + 2 retries)');
    
    if (attemptTimestamps.length >= 2) {
      const firstBackoff = attemptTimestamps[1] - attemptTimestamps[0];
      assert.ok(firstBackoff >= 900, `First backoff should be ~1000ms, got ${firstBackoff}ms`);
    }
    
    if (attemptTimestamps.length >= 3) {
      const secondBackoff = attemptTimestamps[2] - attemptTimestamps[1];
      assert.ok(secondBackoff >= 1900, `Second backoff should be ~2000ms, got ${secondBackoff}ms`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay does not retry on 4xx errors', async () => {
  const originalFetch = globalThis.fetch;
  let attemptCount = 0;
  
  try {
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      attemptCount++;
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });
    };

    await assert.rejects(
      async () => sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }),
      /Custom webhook responded with 400/
    );

    assert.equal(attemptCount, 1, 'Should only attempt once for 4xx errors');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay fails after max retries on persistent 5xx', async () => {
  const originalFetch = globalThis.fetch;
  let attemptCount = 0;
  
  try {
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      attemptCount++;
      return new Response(JSON.stringify({ code: 'internal', message: 'Error' }), { status: 500 });
    };

    await assert.rejects(
      async () => sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' }),
      /Custom webhook responded with 500/
    );

    assert.equal(attemptCount, 3, 'Should attempt 3 times (initial + 2 retries) before failing');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCustomWebhookRelay retries on network errors', async () => {
  const originalFetch = globalThis.fetch;
  let attemptCount = 0;
  
  try {
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      attemptCount++;
      
      if (attemptCount <= 2) {
        throw new Error('Network error: ECONNREFUSED');
      }
      
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await sendCustomWebhookRelay('https://example.com/webhook', { test: 'payload' });

    assert.equal(attemptCount, 3, 'Should retry network errors');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('extractContentOnlyPayload prefers rawBody with content field', () => {
  const rawBody = JSON.stringify({ content: 'Raw body content' });
  const payload = {
    content: 'Payload content',
    crashReport: { hash: 'abc123', exception: 'SIGSEGV' }
  };

  const result = extractContentOnlyPayload(payload, rawBody);
  
  assert.deepEqual(result, { content: 'Raw body content' });
});

test('extractContentOnlyPayload falls back to payload content when rawBody is null', () => {
  const payload = {
    content: 'Payload content',
    crashReport: { hash: 'abc123', exception: 'SIGSEGV' },
    crashReview: { summary: 'Something' }
  };

  const result = extractContentOnlyPayload(payload, null);
  
  assert.deepEqual(result, { content: 'Payload content' });
});

test('extractContentOnlyPayload falls back to payload when rawBody is invalid JSON', () => {
  const payload = {
    content: 'Payload content',
    crashReport: { hash: 'abc123' }
  };

  const result = extractContentOnlyPayload(payload, 'not valid json{');
  
  assert.deepEqual(result, { content: 'Payload content' });
});

test('extractContentOnlyPayload falls back to payload when rawBody has no content field', () => {
  const rawBody = JSON.stringify({ message: 'Something else' });
  const payload = {
    content: 'Payload content',
    crashReport: { hash: 'abc123' }
  };

  const result = extractContentOnlyPayload(payload, rawBody);
  
  assert.deepEqual(result, { content: 'Payload content' });
});

test('extractContentOnlyPayload throws when no content field exists', () => {
  const payload = {
    crashReport: { hash: 'abc123' },
    message: 'Something'
  };

  assert.throws(
    () => extractContentOnlyPayload(payload, null),
    /CUSTOM_WEBHOOK requires a "content" field/
  );
});

test('extractContentOnlyPayload throws when payload is null', () => {
  assert.throws(
    () => extractContentOnlyPayload(null, null),
    /CUSTOM_WEBHOOK requires a "content" field/
  );
});

test('extractContentOnlyPayload extracts content even after CRASH_REVIEW enrichment', () => {
  const payload = {
    content: 'Original crash report text',
    crashReport: {
      hash: 'sha256abc',
      rawHead: '...',
      rawTail: '...',
      symInit: '...',
      exception: 'SIGSEGV',
      osVersion: 'Linux',
      modulesSnippet: '...'
    },
    crashReview: {
      summary: 'Null pointer dereference',
      signature: { exception: 'SIGSEGV', topFrame: 'foo.cpp:42' }
    },
    crashReviewAttempts: 1,
    crashReportText: 'Full report...'
  };

  const result = extractContentOnlyPayload(payload, null);
  
  assert.deepEqual(result, { content: 'Original crash report text' });
  assert.equal(Object.keys(result).length, 1, 'Should only have content field');
  assert.equal('crashReport' in result, false);
  assert.equal('crashReview' in result, false);
});
