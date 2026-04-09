import { appConfig } from '../config/appConfig.js';

export interface RenderedNotificationMessage {
  text: string;
}

type NotificationRenderProvider = 'TELEGRAM' | 'WHATSAPP';
type RenderNotificationOptions = {
  provider?: NotificationRenderProvider;
};

function buildAppLink(path: string): string {
  return `${appConfig.clientUrl.replace(/\/+$/, '')}${path}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function formatLines(value: unknown, fallback: string): string {
  const lines = asStringArray(value);
  if (lines.length === 0) {
    return fallback;
  }

  return lines.map((line) => `- ${line}`).join('\n');
}

function formatPlainLines(value: unknown, fallback: string): string {
  const lines = asStringArray(value);
  if (lines.length === 0) {
    return fallback;
  }

  return lines.join('\n');
}

function formatEmojiLines(value: unknown, fallback: string, emoji: string): string {
  const lines = asStringArray(value);
  if (lines.length === 0) {
    return `${emoji} ${fallback}`;
  }

  return lines.map((line) => `${emoji} ${line}`).join('\n');
}

function stripLeadingListingEmoji(line: string): string {
  return line.replace(/^(?:🆕|🟢⬇️|🔴⬆️|🏷️)\s+/u, '');
}

function formatListingLines(
  value: unknown,
  fallback: string,
  options: { preserveEmoji: boolean; bulleted?: boolean }
): string {
  const lines = asStringArray(value);
  if (lines.length === 0) {
    return fallback;
  }

  const normalized = options.preserveEmoji ? lines : lines.map(stripLeadingListingEmoji);
  if (options.bulleted) {
    return normalized.map((line) => `- ${line}`).join('\n');
  }

  return normalized.join('\n');
}

export function renderNotificationEvent(
  eventKey: string,
  payload: unknown,
  options: RenderNotificationOptions = {}
): RenderedNotificationMessage {
  const data = asObject(payload);
  const isTelegram = options.provider === 'TELEGRAM';

  switch (eventKey) {
    case 'notification.test':
      return {
        text: `Test message from CW Nexus.\n\nYour ${asString(data.provider, 'messenger')} channel is connected and ready.`
      };
    case 'npc.respawn.window_open':
      if (typeof data.minutesUntilWindow === 'number' && data.minutesUntilWindow > 0) {
        return {
          text: `${asString(data.npcName, 'A tracked NPC')} enters its respawn window for ${asString(
            data.guildName,
            'your guild'
          )} in about ${data.minutesUntilWindow} minute${data.minutesUntilWindow === 1 ? '' : 's'}.`
        };
      }
      return {
        text: `Respawn window open for ${asString(data.npcName, 'a tracked NPC')} in ${asString(
          data.guildName,
          'your guild'
        )}.`
      };
    case 'npc.respawn.up':
      return {
        text: `${asString(data.npcName, 'A tracked NPC')} is due up for ${asString(
          data.guildName,
          'your guild'
        )}.`
      };
    case 'raid.reminder.60m':
      return {
        text: `Raid reminder: ${asString(data.raidName, 'Upcoming raid')} starts in about 60 minutes.\n${buildAppLink(
          `/raids/${asString(data.raidId)}`
        )}`
      };
    case 'raid.started':
      return {
        text: `Raid started: ${asString(data.raidName, 'Upcoming raid')} is now live.\n${buildAppLink(
          `/raids/${asString(data.raidId)}`
        )}`
      };
    case 'raid.changed':
      return {
        text: `Raid updated: ${asString(data.raidName, 'Upcoming raid')}.\n${buildAppLink(
          `/raids/${asString(data.raidId)}`
        )}`
      };
    case 'raid.canceled':
      return {
        text: `Raid canceled: ${asString(data.raidName, 'Upcoming raid')}.`
      };
    case 'application.approved':
      return {
        text: `Your application to ${asString(data.guildName, 'the guild')} was approved.`
      };
    case 'application.denied':
      return {
        text: `Your application to ${asString(data.guildName, 'the guild')} was denied.`
      };
    case 'market.item.trade_activity':
      return {
        text: `${isTelegram ? '💰 ' : ''}Watched item trade activity:\n${
          isTelegram
            ? formatEmojiLines(data.lines, asString(data.summary, 'A watched item traded.'), '💰')
            : formatPlainLines(data.lines, asString(data.summary, 'A watched item traded.'))
        }`
      };
    case 'market.all.trade_activity':
      return {
        text: `${isTelegram ? '🛒 ' : ''}All market sales:\n${
          isTelegram
            ? formatEmojiLines(data.lines, asString(data.summary, 'A new market sale was recorded.'), '🛒')
            : formatPlainLines(data.lines, asString(data.summary, 'A new market sale was recorded.'))
        }`
      };
    case 'market.item.listing_activity':
      return {
        text: `${isTelegram ? '🏷️ ' : ''}Watched item listings:\n${
          formatListingLines(data.lines, asString(data.summary, 'A watched item was listed.'), {
            preserveEmoji: isTelegram
          })
        }`
      };
    case 'market.item.price_rule_triggered':
      return {
        text: `${isTelegram ? '🟢⬇️ ' : ''}Watched item price rule triggered:\n${
          isTelegram
            ? formatEmojiLines(
                data.lines,
                asString(data.summary, 'A watched item hit your price rule.'),
                '🟢⬇️'
              )
            : formatPlainLines(data.lines, asString(data.summary, 'A watched item hit your price rule.'))
        }`
      };
    case 'market.character.trade_activity':
      return {
        text: `${isTelegram ? '👤💰 ' : ''}Character trade alert:\n${
          isTelegram
            ? formatEmojiLines(
                data.lines,
                asString(data.summary, 'A watched character appeared in trades.'),
                '👤'
              )
            : formatLines(data.lines, asString(data.summary, 'A watched character appeared in trades.'))
        }`
      };
    case 'market.character.listing_activity':
      return {
        text: `${isTelegram ? '👤🏷️ ' : ''}Character listing alert:\n${
          formatListingLines(
            data.lines,
            asString(data.summary, 'A watched character appeared in listings.'),
            {
              preserveEmoji: isTelegram,
              bulleted: !isTelegram
            }
          )
        }`
      };
    case 'market.trader.trade_activity':
      return {
        text: `${isTelegram ? '💸 ' : ''}Tracked trader sale alert:\n${
          isTelegram
            ? formatEmojiLines(
                data.lines,
                asString(data.summary, 'A tracked trader made a sale.'),
                '💸'
              )
            : formatPlainLines(data.lines, asString(data.summary, 'A tracked trader made a sale.'))
        }`
      };
    case 'market.trader.listing_activity':
      return {
        text: `${isTelegram ? '🧾 ' : ''}Tracked trader listing changes:\n${
          formatListingLines(
            data.lines,
            asString(data.summary, 'A tracked trader refreshed listings.'),
            { preserveEmoji: isTelegram }
          )
        }`
      };
    case 'market.trader.undercut':
      return {
        text: `${isTelegram ? '⚠️ ' : ''}Tracked trader undercut alert:\n${
          isTelegram
            ? formatEmojiLines(
                data.lines,
                asString(data.summary, 'A tracked trader was undercut.'),
                '⚠️'
              )
            : formatPlainLines(data.lines, asString(data.summary, 'A tracked trader was undercut.'))
        }`
      };
    default:
      return {
        text: asString(data.summary, `Notification: ${eventKey}`)
      };
  }
}
