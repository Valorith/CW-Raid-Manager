import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateWebhookName, buildSuggestedActionName } from './webhookNameValidation.js';

describe('validateWebhookName', () => {
  describe('minimum length validation', () => {
    it('should reject names shorter than 4 characters', () => {
      const result = validateWebhookName('abc', 'inbound');
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('at least 4 characters'));
    });

    it('should reject generic name "test"', () => {
      const result = validateWebhookName('test', 'inbound');
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('too generic'));
    });

    it('should accept names longer than 4 characters', () => {
      const result = validateWebhookName('Live Server Reports', 'inbound');
      assert.equal(result.valid, true);
    });
  });

  describe('letter requirement validation', () => {
    it('should reject names without any letters', () => {
      const result = validateWebhookName('1234', 'inbound');
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('must include at least one letter'));
    });

    it('should accept names with letters and numbers', () => {
      const result = validateWebhookName('Server123', 'inbound');
      assert.equal(result.valid, true);
    });
  });

  describe('generic name rejection', () => {
    const genericNames = [
      'webhook',
      'new webhook',
      'untitled',
      'test',
      'action',
      'new action',
      'custom webhook',
      'crash review',
      'discord relay',
      'slack relay',
      'endpoint',
      'discord',
      'slack',
      'gemini',
      'gemini crash review'
    ];

    genericNames.forEach((name) => {
      it(`should reject generic name "${name}" (case-insensitive)`, () => {
        const lowerResult = validateWebhookName(name, 'inbound');
        assert.equal(lowerResult.valid, false);
        assert.ok(lowerResult.error?.includes('too generic'));

        const upperResult = validateWebhookName(name.toUpperCase(), 'inbound');
        assert.equal(upperResult.valid, false);
        assert.ok(upperResult.error?.includes('too generic'));

        const mixedResult = validateWebhookName(
          name
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          'inbound'
        );
        assert.equal(mixedResult.valid, false);
        assert.ok(mixedResult.error?.includes('too generic'));
      });
    });
  });

  describe('action type name rejection for actions', () => {
    const actionTypeNames = [
      'discord relay',
      'slack relay',
      'gemini crash review',
      'custom webhook'
    ];

    actionTypeNames.forEach((name) => {
      it(`should reject action type name "${name}" for actions`, () => {
        const result = validateWebhookName(name, 'action');
        assert.equal(result.valid, false);
        assert.ok(result.error?.includes('cannot be only the action type'));
      });

      it(`should reject "${name}" for inbound webhooks as generic`, () => {
        const result = validateWebhookName(name, 'inbound');
        assert.equal(result.valid, false);
        assert.ok(result.error?.includes('too generic'));
      });
    });
  });

  describe('valid names', () => {
    it('should accept "Live Server Reports" for inbound', () => {
      const result = validateWebhookName('Live Server Reports', 'inbound');
      assert.equal(result.valid, true);
      assert.equal(result.error, undefined);
    });

    it('should accept "Test Server Crash Telemetry" for inbound', () => {
      const result = validateWebhookName('Test Server Crash Telemetry', 'inbound');
      assert.equal(result.valid, true);
    });

    it('should accept "Devin crash telemetry" for outbound', () => {
      const result = validateWebhookName('Devin crash telemetry', 'outbound');
      assert.equal(result.valid, true);
    });

    it('should accept "Clumsy Ops crash relay" for outbound', () => {
      const result = validateWebhookName('Clumsy Ops crash relay', 'outbound');
      assert.equal(result.valid, true);
    });

    it('should accept "Live Server Slack #crashes-and-errors" for action', () => {
      const result = validateWebhookName('Live Server Slack #crashes-and-errors', 'action');
      assert.equal(result.valid, true);
    });

    it('should accept "Live Server Gemini crash review" for action', () => {
      const result = validateWebhookName('Live Server Gemini crash review', 'action');
      assert.equal(result.valid, true);
    });

    it('should accept "Live Server Clumsy Ops crash relay" for action', () => {
      const result = validateWebhookName('Live Server Clumsy Ops crash relay', 'action');
      assert.equal(result.valid, true);
    });
  });

  describe('context-specific error messages', () => {
    it('should provide inbound-specific error message', () => {
      const result = validateWebhookName('test', 'inbound');
      assert.ok(result.error?.includes('Live Server Reports'));
      assert.ok(result.error?.includes('Test Server Crash Telemetry'));
    });

    it('should provide outbound-specific error message', () => {
      const result = validateWebhookName('test', 'outbound');
      assert.ok(result.error?.includes('Devin crash telemetry'));
      assert.ok(result.error?.includes('Clumsy Ops crash relay'));
    });

    it('should provide action-specific error message', () => {
      const result = validateWebhookName('test', 'action');
      assert.ok(result.error?.includes('Live Server Slack'));
      assert.ok(result.error?.includes('Live Server Gemini crash review'));
    });
  });
});

describe('buildSuggestedActionName', () => {
  it('should build suggested name for DISCORD_RELAY', () => {
    const name = buildSuggestedActionName('Live Server', 'DISCORD_RELAY');
    assert.equal(name, 'Live Server Discord');
  });

  it('should build suggested name for SLACK_RELAY', () => {
    const name = buildSuggestedActionName('Live Server', 'SLACK_RELAY');
    assert.equal(name, 'Live Server Slack');
  });

  it('should build suggested name for GEMINI_CRASH_REVIEW', () => {
    const name = buildSuggestedActionName('Live Server', 'GEMINI_CRASH_REVIEW');
    assert.equal(name, 'Live Server Gemini crash review');
  });

  it('should build suggested name for CUSTOM_WEBHOOK', () => {
    const name = buildSuggestedActionName('Live Server', 'CUSTOM_WEBHOOK');
    assert.equal(name, 'Live Server Custom webhook');
  });

  it('should handle unknown action types', () => {
    const name = buildSuggestedActionName('Live Server', 'UNKNOWN_TYPE');
    assert.equal(name, 'Live Server Action');
  });

  it('should preserve webhook label in suggestion', () => {
    const name = buildSuggestedActionName('Test Environment Alerts', 'SLACK_RELAY');
    assert.equal(name, 'Test Environment Alerts Slack');
  });
});
