import { appConfig } from '../config/appConfig.js';

const DEFAULT_GRAPH_API_VERSION = 'v23.0';

export interface WhatsappSendInput {
  toPhoneNumber: string;
  text: string;
}

export interface WhatsappSendResult {
  providerMessageId?: string | null;
}

export async function sendWhatsappMessage(
  input: WhatsappSendInput
): Promise<WhatsappSendResult> {
  if (!appConfig.whatsapp?.accessToken || !appConfig.whatsapp.phoneNumberId) {
    throw new Error('WhatsApp notifications are not configured.');
  }

  const response = await fetch(
    `https://graph.facebook.com/${DEFAULT_GRAPH_API_VERSION}/${appConfig.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appConfig.whatsapp.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.toPhoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: input.text
        }
      })
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'WhatsApp send failed.');
  }

  return {
    providerMessageId: data?.messages?.[0]?.id ?? null
  };
}
