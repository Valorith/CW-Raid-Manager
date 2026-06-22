import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSlackPayloadFromText,
  buildSlackPayloadFromUnknown,
  convertDiscordWebhookToSlackPayload,
  getSlackWebhookUrlFromConfig,
  redactSlackConfig,
  sendSlackIncomingWebhook,
  type SlackWebhookConnectionSummary
} from './slackIntegrationService.js';

test('Slack config redaction removes webhook secrets and keeps connection metadata', () => {
  const redacted = redactSlackConfig({
    webhookUrl: 'https://hooks.slack.com/services/T/SECRET/ONE',
    slackWebhookUrl: 'https://hooks.slack.com/services/T/SECRET/TWO',
    slackTemplate: '{{json}}',
    configurationUrl: 'https://slack.com/apps/A123',
    slackTeamId: 'T123',
    slackTeamName: 'Clumsy World',
    slackChannelId: 'C123',
    slackChannelName: '#raid-alerts',
    connectedAt: '2026-06-21T12:00:00.000Z'
  });

  assert.equal('webhookUrl' in redacted, false);
  assert.equal('slackWebhookUrl' in redacted, false);
  assert.equal(redacted.slackTemplate, '{{json}}');

  const connection = redacted.slackConnection as SlackWebhookConnectionSummary;
  assert.deepEqual(connection, {
    hasSlackWebhook: true,
    configurationUrl: 'https://slack.com/apps/A123',
    slackTeamId: 'T123',
    slackTeamName: 'Clumsy World',
    slackChannelId: 'C123',
    slackChannelName: '#raid-alerts',
    connectedAt: '2026-06-21T12:00:00.000Z'
  });
});

test('Slack webhook URL lookup supports current and legacy config field names', () => {
  assert.equal(
    getSlackWebhookUrlFromConfig({ webhookUrl: 'https://hooks.slack.com/services/T/ONE' }),
    'https://hooks.slack.com/services/T/ONE'
  );
  assert.equal(
    getSlackWebhookUrlFromConfig({ slackWebhookUrl: 'https://hooks.slack.com/services/T/TWO' }),
    'https://hooks.slack.com/services/T/TWO'
  );
  assert.equal(getSlackWebhookUrlFromConfig({ webhookUrl: '   ' }), null);
});

test('Slack payload helpers render text fallback and blocks', () => {
  const textPayload = buildSlackPayloadFromText({
    title: 'Crash Review',
    text: 'Zone boot failed <again>',
    url: 'https://nexus.example.test/message-1'
  });
  assert.equal(textPayload.text, 'Crash Review: Zone boot failed <again>');
  assert.ok(textPayload.blocks?.length);

  const genericPayload = buildSlackPayloadFromUnknown(
    { message: 'hello' },
    { title: 'Inbound payload', template: 'Payload:\n{{json}}' }
  );
  assert.match(genericPayload.text, /Inbound payload: Payload:/);
  assert.match(genericPayload.text, /"message": "hello"/);

  const convertedPayload = convertDiscordWebhookToSlackPayload({
    content: 'Fallback content',
    embeds: [
      {
        title: 'Raid Started',
        description: 'Veeshan Peak is underway.',
        fields: [{ name: 'Raid', value: 'VP' }],
        timestamp: '2026-06-21T12:00:00.000Z'
      }
    ]
  });
  assert.equal(convertedPayload.text, 'Raid Started - Veeshan Peak is underway.');
  assert.ok(convertedPayload.blocks?.length);
});

test('Slack Discord-content conversion renders Nexus alerts without dumping JSON', () => {
  const convertedPayload = convertDiscordWebhookToSlackPayload(
    {
      content:
        '[**Cheat**] **Zone** [**tutorial**] [MQGhost] [melmac2001] [Beefy] was caught not sending the proper packets as regularly as they were supposed to.\\n'
    },
    { messageUrl: 'https://nexus.example.test/admin/webhooks?messageId=abc123' }
  );

  assert.match(convertedPayload.text, /^Cheat Alert - was caught not sending/);
  assert.doesNotMatch(convertedPayload.text, /"content"/);

  const fieldBlock = convertedPayload.blocks?.find((block) => Array.isArray(block.fields));
  assert.ok(fieldBlock);
  const fieldText = (fieldBlock.fields as Array<{ text: string }>).map((field) => field.text);
  assert.ok(fieldText.includes('*Category*\nCheat'));
  assert.ok(fieldText.includes('*Zone*\ntutorial'));
  assert.ok(fieldText.includes('*Detector*\nMQGhost'));
  assert.ok(fieldText.includes('*Account*\nmelmac2001'));
  assert.ok(fieldText.includes('*Character*\nBeefy'));

  const actionBlock = convertedPayload.blocks?.find((block) => block.type === 'actions');
  assert.ok(actionBlock);
});

test('Slack Discord-content conversion formats quest debug messages as technical alerts', () => {
  const convertedPayload = convertDiscordWebhookToSlackPayload({
    content: `[**Quest Debug**] **Zone** [**skyshrine**] elsif(((1 == 1 or Client=SCALAR(0x132fecc3928)->GetGM()) and 1 and 1 == GetZoneFaction()-> 1 and (Ranger eq 'Warrior' or Client=SCALAR(0x132fecc3928)->GetGM())))\n`
  });

  assert.match(convertedPayload.text, /^Quest Debug - elsif/);
  assert.doesNotMatch(convertedPayload.text, /"content"/);

  const bodyBlock = convertedPayload.blocks?.find(
    (block) => block.type === 'section' && typeof (block.text as { text?: unknown } | undefined)?.text === 'string'
  );
  assert.ok(bodyBlock);
  assert.match((bodyBlock.text as { text: string }).text, /^```elsif/);
});

test('Slack sender posts JSON payloads and throws on Slack failures', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | URL | Request | null = null;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response('ok', { status: 200 });
  };

  try {
    await sendSlackIncomingWebhook('https://hooks.slack.com/services/T/OK', {
      text: 'Hello Slack'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, 'https://hooks.slack.com/services/T/OK');
  assert.equal(capturedInit?.method, 'POST');
  assert.deepEqual(capturedInit?.headers, { 'content-type': 'application/json' });
  assert.equal(capturedInit?.body, JSON.stringify({ text: 'Hello Slack' }));

  globalThis.fetch = async () => new Response('invalid_payload', { status: 400 });

  try {
    await assert.rejects(
      () =>
        sendSlackIncomingWebhook('https://hooks.slack.com/services/T/FAIL', {
          text: 'Hello Slack'
        }),
      /Slack responded with 400: invalid_payload/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
