const GENERIC_NAMES = new Set([
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
]);

const ACTION_TYPE_NAMES = new Set([
  'discord relay',
  'slack relay',
  'gemini crash review',
  'custom webhook'
]);

export interface WebhookNameValidationResult {
  valid: boolean;
  error?: string;
}

export function validateWebhookName(
  name: string,
  context: 'inbound' | 'outbound' | 'action'
): WebhookNameValidationResult {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  if (trimmed.length < 4) {
    return {
      valid: false,
      error:
        context === 'action'
          ? 'Action name must be at least 4 characters.'
          : 'Webhook label must be at least 4 characters.'
    };
  }

  if (!/[a-z]/i.test(trimmed)) {
    return {
      valid: false,
      error:
        context === 'action'
          ? 'Action name must include at least one letter.'
          : 'Webhook label must include at least one letter.'
    };
  }

  if (context === 'action' && ACTION_TYPE_NAMES.has(normalized)) {
    return {
      valid: false,
      error: `Action name cannot be only the action type. Use a descriptive name like "${getSuggestedActionName(normalized)}".`
    };
  }

  if (GENERIC_NAMES.has(normalized)) {
    return {
      valid: false,
      error: getGenericNameError(trimmed, context)
    };
  }

  return { valid: true };
}

function getGenericNameError(name: string, context: 'inbound' | 'outbound' | 'action'): string {
  if (context === 'inbound') {
    return `"${name}" is too generic. Use a descriptive label like "Live Server Reports" or "Test Server Crash Telemetry".`;
  }
  if (context === 'outbound') {
    return `"${name}" is too generic. Use a descriptive label like "Devin crash telemetry" or "Clumsy Ops crash relay".`;
  }
  return `"${name}" is too generic. Use a descriptive name like "Live Server Slack #crashes-and-errors" or "Live Server Gemini crash review".`;
}

function getSuggestedActionName(typeLabel: string): string {
  const suggestions: Record<string, string> = {
    'discord relay': 'Live Server Discord #crashes',
    'slack relay': 'Live Server Slack #crashes-and-errors',
    'gemini crash review': 'Live Server Gemini crash review',
    'custom webhook': 'Live Server Clumsy Ops crash relay'
  };
  return suggestions[typeLabel] || 'Live Server Action';
}

export function buildSuggestedActionName(
  webhookLabel: string,
  actionType: string
): string {
  const typeLabels: Record<string, string> = {
    DISCORD_RELAY: 'Discord',
    SLACK_RELAY: 'Slack',
    GEMINI_CRASH_REVIEW: 'Gemini crash review',
    CUSTOM_WEBHOOK: 'Custom webhook'
  };

  const typeLabel = typeLabels[actionType] || 'Action';
  return `${webhookLabel} ${typeLabel}`;
}
