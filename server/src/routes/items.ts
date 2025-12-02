import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getItemStats, getItemStatsBatch, getSpellNamesBatch, searchItemsByName } from '../services/itemStatsService.js';

export async function itemRoutes(server: FastifyInstance) {
  /**
   * GET /items/:itemId/stats
   * Fetches detailed item stats for tooltip display.
   */
  server.get('/items/:itemId/stats', async (request, reply) => {
    const paramsSchema = z.object({
      itemId: z.coerce.number().int().positive()
    });

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid item ID.');
    }

    const item = await getItemStats(params.data.itemId);
    if (!item) {
      return reply.notFound('Item not found.');
    }

    // Collect spell IDs from item effects
    const spellIds: number[] = [];
    if (item.proceffect > 0) spellIds.push(item.proceffect);
    if (item.worneffect > 0) spellIds.push(item.worneffect);
    if (item.clickeffect > 0) spellIds.push(item.clickeffect);
    if (item.focuseffect > 0) spellIds.push(item.focuseffect);
    if (item.scrolleffect > 0) spellIds.push(item.scrolleffect);
    if (item.bardeffect > 0) spellIds.push(item.bardeffect);

    // Fetch spell names if any effects exist
    let spellNames: Record<number, string> = {};
    if (spellIds.length > 0) {
      const namesMap = await getSpellNamesBatch(spellIds);
      spellNames = Object.fromEntries(namesMap);
    }

    return {
      item,
      spellNames
    };
  });

  /**
   * POST /items/stats/batch
   * Fetches stats for multiple items at once.
   */
  server.post('/items/stats/batch', async (request, reply) => {
    const bodySchema = z.object({
      itemIds: z.array(z.number().int().positive()).max(100)
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest('Invalid item IDs. Provide an array of up to 100 positive integers.');
    }

    const itemsMap = await getItemStatsBatch(body.data.itemIds);
    const items = Object.fromEntries(itemsMap);

    // Collect all spell IDs
    const spellIds = new Set<number>();
    for (const item of itemsMap.values()) {
      if (item.proceffect > 0) spellIds.add(item.proceffect);
      if (item.worneffect > 0) spellIds.add(item.worneffect);
      if (item.clickeffect > 0) spellIds.add(item.clickeffect);
      if (item.focuseffect > 0) spellIds.add(item.focuseffect);
      if (item.scrolleffect > 0) spellIds.add(item.scrolleffect);
      if (item.bardeffect > 0) spellIds.add(item.bardeffect);
    }

    // Fetch spell names
    let spellNames: Record<number, string> = {};
    if (spellIds.size > 0) {
      const namesMap = await getSpellNamesBatch(Array.from(spellIds));
      spellNames = Object.fromEntries(namesMap);
    }

    return {
      items,
      spellNames
    };
  });

  /**
   * POST /items/search-by-name
   * Searches items by exact name match (case-insensitive) and returns their IDs and icons.
   */
  server.post('/items/search-by-name', async (request, reply) => {
    const bodySchema = z.object({
      names: z.array(z.string().min(1).max(191)).max(100)
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest('Invalid item names. Provide an array of up to 100 item names.');
    }

    const results = await searchItemsByName(body.data.names);
    return {
      items: Object.fromEntries(results)
    };
  });
}
