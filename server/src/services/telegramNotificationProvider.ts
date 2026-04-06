import { appConfig } from '../config/appConfig.js';

export interface TelegramSendInput {
  chatId: string;
  text: string;
}

export interface ProviderSendResult {
  providerMessageId?: string | null;
}

export async function sendTelegramMessage(
  input: TelegramSendInput
): Promise<ProviderSendResult> {
  if (!appConfig.telegram?.botToken) {
    throw new Error('Telegram notifications are not configured.');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${appConfig.telegram.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        disable_web_page_preview: true
      })
    }
  );

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: { message_id?: number | string }; description?: string }
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description ?? 'Telegram send failed.');
  }

  return {
    providerMessageId:
      data.result?.message_id != null ? String(data.result.message_id) : null
  };
}
