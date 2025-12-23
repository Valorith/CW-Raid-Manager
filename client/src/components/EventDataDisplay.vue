<template>
  <div class="event-data-display">
    <!-- LOOT_ITEM -->
    <template v-if="event.eventTypeName === 'LOOT_ITEM'">
      <div class="data-row">
        <span class="data-label">Item:</span>
        <span class="data-value data-value--highlight">{{ eventData.item_name || 'Unknown Item' }}</span>
      </div>
      <div v-if="eventData.item_id" class="data-row">
        <span class="data-label">Item ID:</span>
        <span class="data-value muted">{{ eventData.item_id }}</span>
      </div>
      <div v-if="eventData.npc_name || eventData.corpse_name" class="data-row">
        <span class="data-label">From:</span>
        <span class="data-value">{{ formatCorpseName(eventData.npc_name || eventData.corpse_name) }}</span>
      </div>
      <div v-if="eventData.npc_id" class="data-row">
        <span class="data-label">NPC ID:</span>
        <span class="data-value muted">{{ eventData.npc_id }}</span>
      </div>
      <div v-if="eventData.charges && eventData.charges > 1" class="data-row">
        <span class="data-label">Charges:</span>
        <span class="data-value">{{ eventData.charges }}</span>
      </div>
    </template>

    <!-- DEATH -->
    <template v-else-if="event.eventTypeName === 'DEATH'">
      <div class="data-row">
        <span class="data-label">Killed by:</span>
        <span class="data-value data-value--danger">{{ eventData.killer_name || eventData.killed_by || 'Unknown' }}</span>
      </div>
      <div v-if="eventData.spell_name" class="data-row">
        <span class="data-label">Spell:</span>
        <span class="data-value">{{ eventData.spell_name }}</span>
      </div>
      <div v-if="eventData.skill_name && !eventData.spell_name" class="data-row">
        <span class="data-label">Skill:</span>
        <span class="data-value">{{ eventData.skill_name }}</span>
      </div>
      <div v-if="eventData.damage" class="data-row">
        <span class="data-label">Damage:</span>
        <span class="data-value">{{ eventData.damage }}</span>
      </div>
    </template>

    <!-- KILLED_NPC / KILLED_NAMED_NPC / KILLED_RAID_NPC -->
    <template v-else-if="['KILLED_NPC', 'KILLED_NAMED_NPC', 'KILLED_RAID_NPC'].includes(event.eventTypeName)">
      <div class="data-row">
        <span class="data-label">NPC:</span>
        <span class="data-value data-value--combat">{{ eventData.npc_name || 'Unknown NPC' }}</span>
      </div>
      <div v-if="eventData.npc_id" class="data-row">
        <span class="data-label">NPC ID:</span>
        <span class="data-value muted">{{ eventData.npc_id }}</span>
      </div>
    </template>

    <!-- ZONING -->
    <template v-else-if="event.eventTypeName === 'ZONING'">
      <div class="data-row">
        <span class="data-label">From:</span>
        <span class="data-value">{{ eventData.from_zone_long_name || eventData.from || 'Unknown' }}</span>
      </div>
      <div class="data-row">
        <span class="data-label">To:</span>
        <span class="data-value data-value--highlight">{{ eventData.to_zone_long_name || eventData.to || 'Unknown' }}</span>
      </div>
    </template>

    <!-- LEVEL_GAIN / LEVEL_LOSS -->
    <template v-else-if="event.eventTypeName === 'LEVEL_GAIN' || event.eventTypeName === 'LEVEL_LOSS'">
      <div class="data-row">
        <span class="data-label">From Level:</span>
        <span class="data-value">{{ eventData.from_level || eventData.from || eventData.old_level || '?' }}</span>
      </div>
      <div class="data-row">
        <span class="data-label">To Level:</span>
        <span :class="['data-value', event.eventTypeName === 'LEVEL_GAIN' ? 'data-value--success' : 'data-value--danger']">
          {{ eventData.to_level || eventData.to || eventData.new_level || '?' }}
        </span>
      </div>
      <div v-if="eventData.levels_lost" class="data-row">
        <span class="data-label">Levels Lost:</span>
        <span class="data-value data-value--danger">{{ eventData.levels_lost }}</span>
      </div>
      <div v-if="eventData.levels_gained" class="data-row">
        <span class="data-label">Levels Gained:</span>
        <span class="data-value data-value--success">{{ eventData.levels_gained }}</span>
      </div>
    </template>

    <!-- AA_GAIN / AA_PURCHASE -->
    <template v-else-if="event.eventTypeName === 'AA_GAIN' || event.eventTypeName === 'AA_PURCHASE'">
      <div v-if="eventData.aa_name" class="data-row">
        <span class="data-label">AA:</span>
        <span class="data-value data-value--highlight">{{ eventData.aa_name }}</span>
      </div>
      <div v-if="eventData.aa_id !== undefined" class="data-row">
        <span class="data-label">AA ID:</span>
        <span class="data-value data-value--highlight">{{ eventData.aa_id }}</span>
      </div>
      <div v-if="eventData.points || eventData.amount" class="data-row">
        <span class="data-label">Points:</span>
        <span class="data-value data-value--success">+{{ eventData.points || eventData.amount }}</span>
      </div>
      <div v-if="eventData.aa_cost !== undefined" class="data-row">
        <span class="data-label">Cost:</span>
        <span class="data-value">{{ eventData.aa_cost }}</span>
      </div>
      <div v-if="eventData.total" class="data-row">
        <span class="data-label">Total:</span>
        <span class="data-value">{{ eventData.total }}</span>
      </div>
      <div v-if="eventData.aa_previous_id !== undefined && eventData.aa_previous_id !== -1" class="data-row">
        <span class="data-label">Previous AA:</span>
        <span class="data-value muted">{{ eventData.aa_previous_id }}</span>
      </div>
      <div v-if="eventData.aa_next_id !== undefined && eventData.aa_next_id !== -1" class="data-row">
        <span class="data-label">Next AA:</span>
        <span class="data-value muted">{{ eventData.aa_next_id }}</span>
      </div>
    </template>

    <!-- SKILL_UP -->
    <template v-else-if="event.eventTypeName === 'SKILL_UP'">
      <div class="data-row">
        <span class="data-label">Skill:</span>
        <span class="data-value data-value--highlight">{{ eventData.skill_name || eventData.skill || 'Unknown Skill' }}</span>
      </div>
      <div v-if="eventData.value !== undefined" class="data-row">
        <span class="data-label">New Value:</span>
        <span class="data-value data-value--success">{{ eventData.value }}</span>
      </div>
    </template>

    <!-- TRADE -->
    <template v-else-if="event.eventTypeName === 'TRADE'">
      <!-- Two-sided trade format -->
      <template v-if="eventData.character_1_name && eventData.character_2_name">
        <!-- Character 1's offer -->
        <div class="trade-section">
          <div class="data-row">
            <span class="data-label">{{ eventData.character_1_name }} gives:</span>
            <span v-if="!hasTradeContent(eventData.character_1_give_money, eventData.character_1_give_items)" class="data-value muted">Nothing</span>
          </div>
          <div v-if="hasMoneyValue(eventData.character_1_give_money)" class="data-row data-row--indented">
            <span class="data-label">Money:</span>
            <span class="data-value data-value--highlight">{{ formatMoney(eventData.character_1_give_money) }}</span>
          </div>
          <template v-if="eventData.character_1_give_items && eventData.character_1_give_items.length > 0">
            <div v-for="(item, idx) in eventData.character_1_give_items" :key="'c1-item-' + idx" class="data-row data-row--indented">
              <span class="data-label">{{ idx === 0 ? 'Items:' : '' }}</span>
              <span class="data-value data-value--highlight">{{ formatTradeItem(item) }}</span>
            </div>
          </template>
        </div>
        <!-- Character 2's offer -->
        <div class="trade-section">
          <div class="data-row">
            <span class="data-label">{{ eventData.character_2_name }} gives:</span>
            <span v-if="!hasTradeContent(eventData.character_2_give_money, eventData.character_2_give_items)" class="data-value muted">Nothing</span>
          </div>
          <div v-if="hasMoneyValue(eventData.character_2_give_money)" class="data-row data-row--indented">
            <span class="data-label">Money:</span>
            <span class="data-value data-value--highlight">{{ formatMoney(eventData.character_2_give_money) }}</span>
          </div>
          <template v-if="eventData.character_2_give_items && eventData.character_2_give_items.length > 0">
            <div v-for="(item, idx) in eventData.character_2_give_items" :key="'c2-item-' + idx" class="data-row data-row--indented">
              <span class="data-label">{{ idx === 0 ? 'Items:' : '' }}</span>
              <span class="data-value data-value--highlight">{{ formatTradeItem(item) }}</span>
            </div>
          </template>
        </div>
      </template>
      <!-- Fallback for simple trade format -->
      <template v-else>
        <div class="data-row">
          <span class="data-label">With:</span>
          <span class="data-value data-value--social">{{ eventData.with || eventData.target || 'Unknown' }}</span>
        </div>
        <div v-if="eventData.items && Array.isArray(eventData.items)" class="data-row">
          <span class="data-label">Items:</span>
          <span class="data-value">{{ eventData.items.length }} item(s)</span>
        </div>
        <div v-if="eventData.money" class="data-row">
          <span class="data-label">Money:</span>
          <span class="data-value">{{ formatMoney(eventData.money) }}</span>
        </div>
      </template>
    </template>

    <!-- MERCHANT_PURCHASE / MERCHANT_SELL -->
    <template v-else-if="event.eventTypeName === 'MERCHANT_PURCHASE' || event.eventTypeName === 'MERCHANT_SELL'">
      <div v-if="eventData.item_name" class="data-row">
        <span class="data-label">Item:</span>
        <span class="data-value data-value--highlight">{{ eventData.item_name }}</span>
      </div>
      <div v-if="eventData.merchant_name" class="data-row">
        <span class="data-label">Merchant:</span>
        <span class="data-value">{{ eventData.merchant_name }}</span>
      </div>
      <div v-if="eventData.quantity" class="data-row">
        <span class="data-label">Quantity:</span>
        <span class="data-value">{{ eventData.quantity }}</span>
      </div>
      <div v-if="eventData.price || eventData.cost" class="data-row">
        <span class="data-label">Price:</span>
        <span class="data-value">{{ formatMoney(eventData.price || eventData.cost) }}</span>
      </div>
    </template>

    <!-- NPC_HANDIN -->
    <template v-else-if="event.eventTypeName === 'NPC_HANDIN'">
      <div class="data-row">
        <span class="data-label">NPC:</span>
        <span class="data-value data-value--social">{{ eventData.npc_name || 'Unknown NPC' }}</span>
      </div>
      <div v-if="eventData.npc_id" class="data-row">
        <span class="data-label">NPC ID:</span>
        <span class="data-value muted">{{ eventData.npc_id }}</span>
      </div>
      <div v-if="eventData.is_quest_handin" class="data-row">
        <span class="data-label">Type:</span>
        <span class="data-value data-value--highlight">Quest Handin</span>
      </div>
      <!-- Items handed in -->
      <template v-if="eventData.handin_items && eventData.handin_items.length > 0">
        <div class="handin-section">
          <div class="data-row">
            <span class="data-label">Handed In:</span>
            <span class="data-value muted">{{ eventData.handin_items.length }} item(s)</span>
          </div>
          <div v-for="(item, idx) in eventData.handin_items" :key="'handin-' + idx" class="data-row data-row--indented">
            <span class="data-label"></span>
            <span class="data-value data-value--highlight">{{ formatHandinItem(item) }}</span>
          </div>
        </div>
      </template>
      <!-- Money handed in -->
      <div v-if="hasMoneyValue(eventData.handin_money)" class="data-row">
        <span class="data-label">Money Given:</span>
        <span class="data-value data-value--highlight">{{ formatMoney(eventData.handin_money) }}</span>
      </div>
      <!-- Items returned -->
      <template v-if="eventData.return_items && eventData.return_items.length > 0">
        <div class="handin-section">
          <div class="data-row">
            <span class="data-label">Received:</span>
            <span class="data-value muted">{{ eventData.return_items.length }} item(s)</span>
          </div>
          <div v-for="(item, idx) in eventData.return_items" :key="'return-' + idx" class="data-row data-row--indented">
            <span class="data-label"></span>
            <span class="data-value data-value--success">{{ formatHandinItem(item) }}</span>
          </div>
        </div>
      </template>
      <!-- Money returned -->
      <div v-if="hasMoneyValue(eventData.return_money)" class="data-row">
        <span class="data-label">Money Received:</span>
        <span class="data-value data-value--success">{{ formatMoney(eventData.return_money) }}</span>
      </div>
    </template>

    <!-- COMBINE_SUCCESS / COMBINE_FAILURE -->
    <template v-else-if="event.eventTypeName === 'COMBINE_SUCCESS' || event.eventTypeName === 'COMBINE_FAILURE'">
      <div v-if="eventData.recipe_name || eventData.recipe" class="data-row">
        <span class="data-label">Recipe:</span>
        <span :class="['data-value', event.eventTypeName === 'COMBINE_SUCCESS' ? 'data-value--success' : 'data-value--danger']">
          {{ eventData.recipe_name || eventData.recipe }}
        </span>
      </div>
      <div v-if="eventData.tradeskill" class="data-row">
        <span class="data-label">Tradeskill:</span>
        <span class="data-value">{{ eventData.tradeskill }}</span>
      </div>
    </template>

    <!-- SAY -->
    <template v-else-if="event.eventTypeName === 'SAY'">
      <div class="data-row">
        <span class="data-label">Message:</span>
        <span class="data-value data-value--message">"{{ eventData.message || eventData.text || 'No message' }}"</span>
      </div>
      <div v-if="eventData.target" class="data-row">
        <span class="data-label">To:</span>
        <span class="data-value">{{ eventData.target }}</span>
      </div>
    </template>

    <!-- GM_COMMAND -->
    <template v-else-if="event.eventTypeName === 'GM_COMMAND'">
      <div class="data-row">
        <span class="data-label">Command:</span>
        <span class="data-value data-value--code">{{ eventData.command || eventData.message || 'Unknown Command' }}</span>
      </div>
      <div v-if="eventData.target" class="data-row">
        <span class="data-label">Target:</span>
        <span class="data-value">{{ eventData.target }}</span>
      </div>
    </template>

    <!-- TASK_ACCEPT / TASK_UPDATE / TASK_COMPLETE -->
    <template v-else-if="['TASK_ACCEPT', 'TASK_UPDATE', 'TASK_COMPLETE'].includes(event.eventTypeName)">
      <div class="data-row">
        <span class="data-label">Task:</span>
        <span :class="['data-value', event.eventTypeName === 'TASK_COMPLETE' ? 'data-value--success' : 'data-value--highlight']">
          {{ eventData.task_name || eventData.task || 'Unknown Task' }}
        </span>
      </div>
      <div v-if="eventData.task_id" class="data-row">
        <span class="data-label">Task ID:</span>
        <span class="data-value muted">{{ eventData.task_id }}</span>
      </div>
      <div v-if="eventData.activity_id !== undefined" class="data-row">
        <span class="data-label">Activity ID:</span>
        <span class="data-value muted">{{ eventData.activity_id }}</span>
      </div>
      <div v-if="eventData.done_count !== undefined" class="data-row">
        <span class="data-label">Done Count:</span>
        <span class="data-value data-value--success">{{ eventData.done_count }}</span>
      </div>
    </template>

    <!-- GROUP_JOIN / GROUP_LEAVE / RAID_JOIN / RAID_LEAVE -->
    <template v-else-if="['GROUP_JOIN', 'GROUP_LEAVE', 'RAID_JOIN', 'RAID_LEAVE'].includes(event.eventTypeName)">
      <div v-if="eventData.leader || eventData.group_leader" class="data-row">
        <span class="data-label">Leader:</span>
        <span class="data-value data-value--social">{{ eventData.leader || eventData.group_leader }}</span>
      </div>
      <div v-if="eventData.members" class="data-row">
        <span class="data-label">Members:</span>
        <span class="data-value">{{ Array.isArray(eventData.members) ? eventData.members.length : eventData.members }}</span>
      </div>
    </template>

    <!-- POSSIBLE_HACK -->
    <template v-else-if="event.eventTypeName === 'POSSIBLE_HACK'">
      <div class="data-row">
        <span class="data-label">Reason:</span>
        <span class="data-value data-value--danger">{{ eventData.reason || eventData.message || 'Unknown' }}</span>
      </div>
      <div v-if="eventData.details" class="data-row">
        <span class="data-label">Details:</span>
        <span class="data-value">{{ eventData.details }}</span>
      </div>
    </template>

    <!-- FORAGE_SUCCESS / FISH_SUCCESS -->
    <template v-else-if="event.eventTypeName === 'FORAGE_SUCCESS' || event.eventTypeName === 'FISH_SUCCESS'">
      <div class="data-row">
        <span class="data-label">Item:</span>
        <span class="data-value data-value--success">{{ eventData.item_name || eventData.item || 'Unknown Item' }}</span>
      </div>
    </template>

    <!-- GROUNDSPAWN_PICKUP -->
    <template v-else-if="event.eventTypeName === 'GROUNDSPAWN_PICKUP'">
      <div class="data-row">
        <span class="data-label">Item:</span>
        <span class="data-value data-value--highlight">{{ eventData.item_name || eventData.item || 'Unknown Item' }}</span>
      </div>
    </template>

    <!-- DISCOVER_ITEM -->
    <template v-else-if="event.eventTypeName === 'DISCOVER_ITEM'">
      <div class="data-row">
        <span class="data-label">Item:</span>
        <span class="data-value data-value--success">{{ eventData.item_name || eventData.item || 'Unknown Item' }}</span>
      </div>
      <div v-if="eventData.item_id" class="data-row">
        <span class="data-label">Item ID:</span>
        <span class="data-value muted">{{ eventData.item_id }}</span>
      </div>
    </template>

    <!-- REZ_ACCEPTED -->
    <template v-else-if="event.eventTypeName === 'REZ_ACCEPTED'">
      <div class="data-row">
        <span class="data-label">Rezzer:</span>
        <span class="data-value data-value--social">{{ eventData.resurrecter_name || eventData.rezzer || eventData.from || 'Unknown' }}</span>
      </div>
      <div v-if="eventData.spell_name" class="data-row">
        <span class="data-label">Spell:</span>
        <span class="data-value data-value--highlight">{{ eventData.spell_name }}</span>
      </div>
      <div v-if="eventData.spell_id" class="data-row">
        <span class="data-label">Spell ID:</span>
        <span class="data-value muted">{{ eventData.spell_id }}</span>
      </div>
      <div v-if="eventData.exp_percentage" class="data-row">
        <span class="data-label">Exp Restored:</span>
        <span class="data-value data-value--success">{{ eventData.exp_percentage }}%</span>
      </div>
    </template>

    <!-- Default fallback for unknown event types -->
    <template v-else>
      <div v-for="(value, key) in displayableData" :key="key" class="data-row">
        <span class="data-label">{{ formatKey(key) }}:</span>
        <span class="data-value">{{ formatValue(value) }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerEventLog } from '../services/api';

const props = defineProps<{
  event: PlayerEventLog;
}>();

const eventData = computed(() => {
  return props.event.eventData || {};
});

const displayableData = computed(() => {
  const data = eventData.value;
  if (!data || typeof data !== 'object') return {};

  // Filter out internal/technical fields
  const excludeKeys = ['raw', 'id', 'character_id', 'account_id', 'zone_id', 'instance_id'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!excludeKeys.includes(key) && value !== null && value !== undefined && value !== '') {
      result[key] = value;
    }
  }

  return result;
});

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatMoney(value: unknown): string {
  if (typeof value === 'number') {
    const platinum = Math.floor(value / 1000);
    const gold = Math.floor((value % 1000) / 100);
    const silver = Math.floor((value % 100) / 10);
    const copper = value % 10;

    const parts: string[] = [];
    if (platinum > 0) parts.push(`${platinum}p`);
    if (gold > 0) parts.push(`${gold}g`);
    if (silver > 0) parts.push(`${silver}s`);
    if (copper > 0 || parts.length === 0) parts.push(`${copper}c`);

    return parts.join(' ');
  }
  if (typeof value === 'object' && value !== null) {
    const m = value as { platinum?: number; gold?: number; silver?: number; copper?: number };
    const parts: string[] = [];
    if (m.platinum) parts.push(`${m.platinum}p`);
    if (m.gold) parts.push(`${m.gold}g`);
    if (m.silver) parts.push(`${m.silver}s`);
    if (m.copper) parts.push(`${m.copper}c`);
    return parts.length > 0 ? parts.join(' ') : '0c';
  }
  return String(value);
}

function hasMoneyValue(money: unknown): boolean {
  if (!money || typeof money !== 'object') return false;
  const m = money as { platinum?: number; gold?: number; silver?: number; copper?: number };
  return (m.platinum || 0) > 0 || (m.gold || 0) > 0 || (m.silver || 0) > 0 || (m.copper || 0) > 0;
}

function hasTradeContent(money: unknown, items: unknown): boolean {
  return hasMoneyValue(money) || (Array.isArray(items) && items.length > 0);
}

function formatTradeItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const i = item as { item_name?: string; name?: string; quantity?: number; charges?: number };
    const name = i.item_name || i.name || 'Unknown Item';
    const qty = i.quantity || 1;
    const charges = i.charges;
    let result = qty > 1 ? `${name} x${qty}` : name;
    if (charges !== undefined && charges > 0) {
      result += ` (${charges} charges)`;
    }
    return result;
  }
  return String(item);
}

function formatCorpseName(name: unknown): string {
  if (typeof name !== 'string') return String(name);
  // Replace underscores with spaces and clean up the name
  return name.replace(/_/g, ' ');
}

function formatHandinItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const i = item as {
      item_id?: number;
      item_name?: string;
      name?: string;
      charges?: number;
      attuned?: boolean;
      augment_names?: string[];
    };
    const name = i.item_name || i.name || 'Unknown Item';
    const parts: string[] = [name];

    // Add charges if more than 1
    if (i.charges && i.charges > 1) {
      parts[0] = `${name} x${i.charges}`;
    }

    // Add attuned status
    if (i.attuned) {
      parts.push('(Attuned)');
    }

    // Add augments if any non-empty ones exist
    if (i.augment_names && Array.isArray(i.augment_names)) {
      const augments = i.augment_names.filter(aug => aug && aug.trim() !== '');
      if (augments.length > 0) {
        parts.push(`[${augments.join(', ')}]`);
      }
    }

    return parts.join(' ');
  }
  return String(item);
}
</script>

<style scoped>
.event-data-display {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.data-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.data-row--indented {
  padding-left: 1rem;
}

.trade-section {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.trade-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.trade-section:first-child {
  padding-top: 0;
}

.handin-section {
  margin: 0.25rem 0;
}

.data-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.8);
  min-width: 100px;
  flex-shrink: 0;
}

.data-value {
  font-size: 0.85rem;
  color: #e2e8f0;
  word-break: break-word;
}

.data-value--highlight {
  color: #bae6fd;
  font-weight: 500;
}

.data-value--success {
  color: #86efac;
  font-weight: 500;
}

.data-value--danger {
  color: #fca5a5;
  font-weight: 500;
}

.data-value--social {
  color: #d8b4fe;
  font-weight: 500;
}

.data-value--combat {
  color: #fdba74;
  font-weight: 500;
}

.data-value--message {
  font-style: italic;
  color: #cbd5e1;
}

.data-value--code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: rgba(15, 23, 42, 0.5);
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.8rem;
}

.muted {
  color: #64748b;
}

@media (max-width: 480px) {
  .data-row {
    flex-direction: column;
    gap: 0.2rem;
  }

  .data-label {
    min-width: auto;
  }
}
</style>
