import { appConfig } from '../config/appConfig.js';

export interface RenderedNotificationMessage {
  text: string;
}

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

export function renderNotificationEvent(
  eventKey: string,
  payload: unknown
): RenderedNotificationMessage {
  const data = asObject(payload);

  switch (eventKey) {
    case 'notification.test':
      return {
        text: `Test message from CW Raid Manager.\n\nYour ${asString(data.provider, 'messenger')} channel is connected and ready.`
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
        text: `Watched item trade activity:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A watched item traded.')}`
      };
    case 'market.item.listing_activity':
      return {
        text: `Watched item listings:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A watched item was listed.')}`
      };
    case 'market.item.price_rule_triggered':
      return {
        text: `Watched item price rule triggered:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A watched item hit your price rule.')}`
      };
    case 'market.character.trade_activity':
      return {
        text: `Watched character trade activity:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A watched character appeared in trades.')}`
      };
    case 'market.character.listing_activity':
      return {
        text: `Watched character listing activity:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A watched character appeared in listings.')}`
      };
    case 'market.trader.listing_activity':
      return {
        text: `Tracked trader listing changes:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A tracked trader refreshed listings.')}`
      };
    case 'market.trader.undercut':
      return {
        text: `Tracked trader undercut alert:\n${asStringArray(data.lines).join('\n') || asString(data.summary, 'A tracked trader was undercut.')}`
      };
    default:
      return {
        text: asString(data.summary, `Notification: ${eventKey}`)
      };
  }
}
