export type NotificationProviderKey = 'TELEGRAM' | 'WHATSAPP';
export type NotificationScopeTypeKey = 'GLOBAL' | 'GUILD';
export type NotificationChannelStatusKey = 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | 'FAILED';
export type NotificationDeliveryStatusKey = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

export type NotificationEventDefinition = {
  key: string;
  label: string;
  description: string;
  scopeType: NotificationScopeTypeKey;
  recommended: boolean;
  adminOnly?: boolean;
};

export type ProviderTargets = Partial<Record<NotificationProviderKey, boolean>>;

export type MarketFavoriteNotificationSettings = {
  notifyOnTradeActivity?: boolean;
  notifyOnListingActivity?: boolean;
  notifyOnUndercut?: boolean;
  undercutOnly?: boolean;
  onlyNewUndercuts?: boolean;
  maxListingPriceCopper?: number | null;
  maxTradePriceCopper?: number | null;
  listingBelowRecentAveragePercent?: number | null;
};

export const GUILD_NOTIFICATION_EVENT_DEFINITIONS: NotificationEventDefinition[] = [
  {
    key: 'npc.respawn.window_open',
    label: 'Respawn Window Opens',
    description: 'Alert when a subscribed NPC enters its respawn window.',
    scopeType: 'GUILD',
    recommended: false
  },
  {
    key: 'npc.respawn.up',
    label: 'NPC Up',
    description: 'Alert when a subscribed NPC is due up.',
    scopeType: 'GUILD',
    recommended: true
  },
  {
    key: 'raid.reminder.60m',
    label: 'Raid Reminder',
    description: 'Remind signed-up players 60 minutes before raid start.',
    scopeType: 'GUILD',
    recommended: true
  },
  {
    key: 'raid.changed',
    label: 'Raid Changed',
    description: 'Alert signed-up players when a raid changes.',
    scopeType: 'GUILD',
    recommended: false
  },
  {
    key: 'raid.canceled',
    label: 'Raid Canceled',
    description: 'Alert signed-up players when a raid is canceled.',
    scopeType: 'GUILD',
    recommended: false
  },
  {
    key: 'application.approved',
    label: 'Application Approved',
    description: 'Alert when your guild application is approved.',
    scopeType: 'GUILD',
    recommended: false
  },
  {
    key: 'application.denied',
    label: 'Application Denied',
    description: 'Alert when your guild application is denied.',
    scopeType: 'GUILD',
    recommended: false
  }
];

export const MARKET_NOTIFICATION_EVENT_DEFINITIONS: NotificationEventDefinition[] = [
  {
    key: 'market.all.trade_activity',
    label: 'All Market Sales',
    description: 'Alert when any new market sale is seen in the bazaar feed.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.item.trade_activity',
    label: 'Watched Item Trades',
    description: 'Alert when watched items trade on the market.',
    scopeType: 'GLOBAL',
    recommended: true
  },
  {
    key: 'market.item.listing_activity',
    label: 'Watched Item Listings',
    description: 'Alert when watched items appear in active listings.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.item.price_rule_triggered',
    label: 'Watched Item Price Rules',
    description: 'Alert when watched item price thresholds are crossed.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.character.trade_activity',
    label: 'Watched Character Trades',
    description: 'Alert when watched characters appear in new trades.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.character.listing_activity',
    label: 'Watched Character Listings',
    description: 'Alert when watched characters appear in listings.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.trader.trade_activity',
    label: 'My Trader Sales',
    description: 'Alert when one of your tracked traders makes a sale.',
    scopeType: 'GLOBAL',
    recommended: true
  },
  {
    key: 'market.trader.listing_activity',
    label: 'Trader Listing Changes',
    description: 'Alert when your tracked traders refresh or change listings.',
    scopeType: 'GLOBAL',
    recommended: false
  },
  {
    key: 'market.trader.undercut',
    label: 'Trader Undercut',
    description: 'Alert when a tracked trader gets undercut.',
    scopeType: 'GLOBAL',
    recommended: true
  }
];

export const ADMIN_NOTIFICATION_EVENT_DEFINITIONS: NotificationEventDefinition[] = [
  {
    key: 'webhook.crash_error_report',
    label: 'Crash/Error Reports',
    description: 'Alert when an inbound crash or script error report is reviewed by AI and relayed to Discord.',
    scopeType: 'GLOBAL',
    recommended: false,
    adminOnly: true
  }
];

export const NOTIFICATION_EVENT_DEFINITIONS = [
  ...GUILD_NOTIFICATION_EVENT_DEFINITIONS,
  ...MARKET_NOTIFICATION_EVENT_DEFINITIONS,
  ...ADMIN_NOTIFICATION_EVENT_DEFINITIONS
] as const;

export const NOTIFICATION_EVENT_DEFINITION_MAP = new Map(
  NOTIFICATION_EVENT_DEFINITIONS.map((definition) => [definition.key, definition])
);

export const DEFAULT_PROVIDER_TARGETS: ProviderTargets = Object.freeze({
  TELEGRAM: true,
  WHATSAPP: true
});

export function getDefaultMarketFavoriteNotificationSettings(
  listType: 'FAVORITE_ITEMS' | 'FAVORITE_CHARACTERS' | 'MY_TRADERS'
): MarketFavoriteNotificationSettings {
  if (listType === 'FAVORITE_ITEMS') {
    return {
      notifyOnTradeActivity: true,
      notifyOnListingActivity: true,
      maxListingPriceCopper: null,
      maxTradePriceCopper: null,
      listingBelowRecentAveragePercent: null
    };
  }

  if (listType === 'FAVORITE_CHARACTERS') {
    return {
      notifyOnTradeActivity: true,
      notifyOnListingActivity: true
    };
  }

  return {
    notifyOnTradeActivity: true,
    notifyOnListingActivity: true,
    notifyOnUndercut: true,
    undercutOnly: false,
    onlyNewUndercuts: true
  };
}
