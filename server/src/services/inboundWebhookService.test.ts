import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrashReviewInput,
  dispatchCrashTelemetryAutoFix,
  looksLikeCrashReport
} from './inboundWebhookService.js';

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
