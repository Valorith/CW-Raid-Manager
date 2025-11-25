import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

export interface EqTaskDefinition {
  id: number;
  title: string;
  description: string | null;
  type: number | null;
  duration: number | null;
  durationCode: number | null;
  minLevel: number | null;
  maxLevel: number | null;
  repeatable: boolean;
  reward: string | null;
  rewardId: number | null;
  rewardMethod: number | null;
  cashReward: number | null;
  xpReward: number | null;
  completionEmote: string | null;
  dzTemplateId: number | null;
  lockActivityId: number | null;
}

export interface EqTaskActivity {
  taskId: number;
  activityId: number;
  requiredActivityId: number | null;
  step: number;
  activityType: number;
  targetName: string | null;
  goalMethod: number | null;
  goalCount: number | null;
  descriptionOverride: string | null;
  goalId: number | null;
  goalMatchList: string | null;
  itemList: string | null;
  dzSwitchId: number | null;
  minX: number | null;
  minY: number | null;
  minZ: number | null;
  maxX: number | null;
  maxY: number | null;
  maxZ: number | null;
  skillList: string | null;
  spellList: string | null;
  zones: string | null;
  zoneVersion: number | null;
  optional: boolean;
  listGroup: number | null;
}

export interface EqTaskWithActivities {
  task: EqTaskDefinition;
  activities: EqTaskActivity[];
}

export interface EqTaskSearchResult {
  tasks: EqTaskDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

type TaskRow = RowDataPacket & {
  id: number;
  title: string;
  description: string | null;
  type: number | null;
  duration: number | null;
  duration_code: number | null;
  min_level: number | null;
  max_level: number | null;
  repeatable: number | null;
  reward_text: string | null;
  reward_id_list: string | null;
  reward_method: number | null;
  cash_reward: number | null;
  exp_reward: number | null;
  completion_emote: string | null;
  dz_template_id: number | null;
  lock_activity_id: number | null;
};

type ActivityRow = RowDataPacket & {
  taskid: number;
  activityid: number;
  req_activity_id: number | null;
  step: number | null;
  activitytype: number;
  target_name: string | null;
  goalmethod: number | null;
  goalcount: number | null;
  description_override: string | null;
  npc_match_list: string | null;
  item_id_list: string | null;
  item_list: string | null;
  dz_switch_id: number | null;
  min_x: number | null;
  min_y: number | null;
  min_z: number | null;
  max_x: number | null;
  max_y: number | null;
  max_z: number | null;
  skill_list: string | null;
  spell_list: string | null;
  zones: string | null;
  zone_version: number | null;
  optional: number | null;
  list_group: number | null;
};

function mapTaskRow(row: TaskRow): EqTaskDefinition {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description ?? null,
    type: row.type != null ? Number(row.type) : null,
    duration: row.duration != null ? Number(row.duration) : null,
    durationCode: row.duration_code != null ? Number(row.duration_code) : null,
    minLevel: row.min_level != null ? Number(row.min_level) : null,
    maxLevel: row.max_level != null ? Number(row.max_level) : null,
    repeatable: Boolean(row.repeatable),
    reward: row.reward_text ?? null,
    rewardId: row.reward_id_list ? Number.parseInt(String(row.reward_id_list), 10) || null : null,
    rewardMethod: row.reward_method != null ? Number(row.reward_method) : null,
    cashReward: row.cash_reward != null ? Number(row.cash_reward) : null,
    xpReward: row.exp_reward != null ? Number(row.exp_reward) : null,
    completionEmote: row.completion_emote ?? null,
    dzTemplateId: row.dz_template_id != null ? Number(row.dz_template_id) : null,
    lockActivityId: row.lock_activity_id != null ? Number(row.lock_activity_id) : null
  };
}

function mapActivityRow(row: ActivityRow): EqTaskActivity {
  return {
    taskId: Number(row.taskid),
    activityId: Number(row.activityid),
    requiredActivityId: row.req_activity_id != null ? Number(row.req_activity_id) : null,
    step: row.step != null ? Number(row.step) : 0,
    activityType: Number(row.activitytype),
    targetName: row.target_name ?? null,
    goalMethod: row.goalmethod != null ? Number(row.goalmethod) : null,
    goalCount: row.goalcount != null ? Number(row.goalcount) : null,
    descriptionOverride: row.description_override ?? null,
    goalId: row.item_id_list != null ? Number(row.item_id_list) : null,
    goalMatchList: row.npc_match_list ?? null,
    itemList: row.item_list ?? null,
    dzSwitchId: row.dz_switch_id != null ? Number(row.dz_switch_id) : null,
    minX: row.min_x != null ? Number(row.min_x) : null,
    minY: row.min_y != null ? Number(row.min_y) : null,
    minZ: row.min_z != null ? Number(row.min_z) : null,
    maxX: row.max_x != null ? Number(row.max_x) : null,
    maxY: row.max_y != null ? Number(row.max_y) : null,
    maxZ: row.max_z != null ? Number(row.max_z) : null,
    skillList: row.skill_list ?? null,
    spellList: row.spell_list ?? null,
    zones: row.zones ?? null,
    zoneVersion: row.zone_version != null ? Number(row.zone_version) : null,
    optional: Boolean(row.optional),
    listGroup: row.list_group != null ? Number(row.list_group) : null
  };
}

export async function searchEqTasks(options: {
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<EqTaskSearchResult> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 10)));
  const offset = (page - 1) * pageSize;
  const filters: string[] = [];
  const params: Array<string | number> = [];

  if (options.query) {
    const like = `%${options.query.trim()}%`;
    const numericQuery = Number.parseInt(options.query.trim(), 10);
    if (!Number.isNaN(numericQuery)) {
      filters.push('(title LIKE ? OR id = ?)');
      params.push(like, numericQuery);
    } else {
      filters.push('title LIKE ?');
      params.push(like);
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const taskRows = await queryEqDb<TaskRow[]>(
    `SELECT id, title, description, type, duration, duration_code, min_level, max_level, repeatable,
            reward_text,
            reward_id_list,
            reward_method,
            cash_reward,
            exp_reward,
            completion_emote,
            dz_template_id,
            lock_activity_id
     FROM tasks
     ${whereClause}
     ORDER BY id ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const countRows = await queryEqDb<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM tasks ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  return {
    tasks: taskRows.map(mapTaskRow),
    total,
    page,
    pageSize
  };
}

export async function loadEqTaskWithActivities(taskId: number): Promise<EqTaskWithActivities | null> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return null;
  }
  const taskRows = await queryEqDb<TaskRow[]>(
    `SELECT id, title, description, type, duration, duration_code, min_level, max_level, repeatable,
            reward_text,
            reward_id_list,
            reward_method,
            cash_reward,
            exp_reward,
            completion_emote,
            dz_template_id,
            lock_activity_id
     FROM tasks
     WHERE id = ?
     LIMIT 1`,
    [taskId]
  );
  if (!taskRows.length) {
    return null;
  }
  const activityRows = await queryEqDb<ActivityRow[]>(
    `SELECT taskid, activityid, req_activity_id, step, activitytype, target_name, goalmethod, goalcount, description_override,
            npc_match_list, item_id_list, item_list,
            dz_switch_id, min_x, min_y, min_z, max_x, max_y, max_z, skill_list, spell_list, zones, zone_version, optional, list_group
     FROM task_activities
     WHERE taskid = ?
     ORDER BY step ASC, activityid ASC`,
    [taskId]
  );
  return {
    task: mapTaskRow(taskRows[0]),
    activities: activityRows.map(mapActivityRow)
  };
}
