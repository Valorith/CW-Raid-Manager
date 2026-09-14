import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import sensible from '@fastify/sensible';
import { GuildRole, type Prisma } from '@prisma/client';
import Fastify from 'fastify';

// Create a Prisma client without using any configured database. Every DB operation is mocked.
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/nexus_cli_test';
const { prisma } = await import('../utils/prisma.js');
const { authenticate } = await import('../middleware/authenticate.js');
const { cliAuthRoutes } = await import('../routes/cliAuth.js');
const { getCliDeviceLoginForApproval, exchangeCliDeviceCode, authenticateCliBearerToken } =
  await import('./cliAuthService.js');

// Prisma exposes methods through a Proxy with empty property descriptors, so mock.method
// cannot find them. Assign mock functions through that Proxy and restore after each test.
function mockPrismaMethod<T extends object, F extends (...args: never[]) => unknown>(
  t: TestContext,
  target: T,
  method: keyof T,
  implementation: F
) {
  const original = Reflect.get(target, method);
  const mocked = t.mock.fn(implementation);
  assert.equal(Reflect.set(target, method, mocked), true);
  t.after(() => {
    Reflect.set(target, method, original);
  });
  return mocked;
}

const legacyScopes = ['test-manager', 'webhook-inbox'];
const newScopes = [...legacyScopes, 'raids'];
const user = { id: 'user-1', email: 'user@example.test', displayName: 'Raider', nickname: null };
const session = {
  id: 'session-1',
  name: 'Test CLI',
  user,
  userId: user.id,
  createdAt: new Date(),
  lastUsedAt: null,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000)
};

test('device login endpoint stores and returns raids in the requested scopes', async (t) => {
  const create = mockPrismaMethod(
    t,
    prisma.cliDeviceLogin,
    'create',
    async (_args: Prisma.CliDeviceLoginCreateArgs) => ({})
  );
  const app = Fastify();
  t.after(() => app.close());
  await app.register(sensible);
  await app.register(cliAuthRoutes, { prefix: '/api/cli/auth' });
  const result = await app.inject({
    method: 'POST',
    url: '/api/cli/auth/device',
    payload: { clientName: 'Raid ops' }
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json().scopes, newScopes);
  assert.deepEqual(create.mock.calls[0].arguments[0].data.requestedScopes, newScopes);
});

test('authentication keeps stored scopes and never upgrades legacy or malformed sessions', async (t) => {
  let storedScopes: Prisma.JsonValue = null;
  mockPrismaMethod(t, prisma.cliSession, 'findUnique', async () => ({
    ...session,
    scopes: storedScopes
  }));
  const update = mockPrismaMethod(
    t,
    prisma.cliSession,
    'update',
    async (_args: Prisma.CliSessionUpdateArgs) => ({})
  );
  for (const scopes of [
    legacyScopes,
    newScopes,
    [],
    null,
    { invalid: true },
    ['raids', 3, null, '']
  ]) {
    storedScopes = scopes;
    const result = await authenticateCliBearerToken('nxcli_test');
    const expected = Array.isArray(scopes)
      ? scopes.filter((scope) => typeof scope === 'string' && scope.length > 0)
      : legacyScopes;
    assert.deepEqual(result?.cliScopes, expected);
  }
  assert.equal(update.mock.calls.length, 6);
  for (const call of update.mock.calls) {
    assert.deepEqual(Object.keys(call.arguments[0].data), ['lastUsedAt']);
  }
});

test('approval display and token exchange preserve scopes requested before this release', async (t) => {
  let requestedScopes: string[] | null = null;
  mockPrismaMethod(t, prisma.cliDeviceLogin, 'findUnique', async () => ({
    id: 'login-1',
    userCode: 'ABCD-1234',
    clientName: 'Test CLI',
    requestedScopes,
    createdAt: new Date(),
    expiresAt: session.expiresAt,
    approvedAt: new Date(),
    approvedById: user.id,
    approvedBy: user,
    deniedAt: null,
    consumedAt: null
  }));
  mockPrismaMethod(t, prisma.cliDeviceLogin, 'updateMany', async () => ({ count: 1 }));
  const create = mockPrismaMethod(
    t,
    prisma.cliSession,
    'create',
    async (_args: Prisma.CliSessionCreateArgs) => session
  );
  mockPrismaMethod(
    t,
    prisma,
    '$transaction',
    async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)
  );
  for (const scopes of [legacyScopes, newScopes, null]) {
    requestedScopes = scopes;
    const approval = await getCliDeviceLoginForApproval('ABCD-1234');
    assert.deepEqual(approval?.scopes, scopes ?? legacyScopes);
    const result = await exchangeCliDeviceCode('nxdev_test');
    assert.equal(result.status, 'approved');
  }
  assert.deepEqual(
    create.mock.calls.map((call) => call.arguments[0].data.scopes),
    [legacyScopes, newScopes, legacyScopes]
  );
});

test('Bearer authentication enforces raids scope before reaching protected handlers', async (t) => {
  let scopes = legacyScopes;
  mockPrismaMethod(t, prisma.cliSession, 'findUnique', async () => ({ ...session, scopes }));
  mockPrismaMethod(t, prisma.cliSession, 'update', async () => ({}));
  const app = Fastify();
  t.after(() => app.close());
  await app.register(sensible);
  const paths = ['/api/raids/raid-1', '/api/attendance/raid/raid-1', '/api/raids/raid-1/loot'];
  for (const path of paths) {
    app.get(path, { preHandler: [authenticate] }, async (request) => ({
      userId: request.user.userId
    }));
  }
  for (const path of paths) {
    const denied = await app.inject({
      method: 'GET',
      url: path,
      headers: { authorization: 'Bearer nxcli_test' }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().message, 'CLI session is not authorized for this API.');
  }
  scopes = newScopes;
  for (const path of paths) {
    const allowed = await app.inject({
      method: 'GET',
      url: path,
      headers: { authorization: 'Bearer nxcli_test' }
    });
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(allowed.json(), { userId: user.id });
  }
});

test('existing raid list still enforces membership and reports role permissions with raids scope', async (t) => {
  const { raidsRoutes } = await import('../routes/raids.js');
  let role: GuildRole | null = null;
  mockPrismaMethod(t, prisma.cliSession, 'findUnique', async () => ({
    ...session,
    scopes: ['raids']
  }));
  mockPrismaMethod(t, prisma.cliSession, 'update', async () => ({}));
  const membership = mockPrismaMethod(
    t,
    prisma.guildMembership,
    'findUnique',
    async (_args: Prisma.GuildMembershipFindUniqueArgs) => (role ? { role } : null)
  );
  const raids = mockPrismaMethod(
    t,
    prisma.raidEvent,
    'findMany',
    async (_args: Prisma.RaidEventFindManyArgs) => []
  );
  const app = Fastify();
  t.after(() => app.close());
  await app.register(sensible);
  await app.register(raidsRoutes, { prefix: '/api/raids' });
  const request = {
    method: 'GET',
    url: '/api/raids/guild/guild-1',
    headers: { authorization: 'Bearer nxcli_test' }
  } as const;
  const denied = await app.inject(request);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().message, 'You are not a member of this guild.');
  assert.equal(raids.mock.calls.length, 0);
  for (const memberRole of [GuildRole.MEMBER, GuildRole.RAID_LEADER]) {
    role = memberRole;
    const allowed = await app.inject(request);
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(allowed.json(), {
      raids: [],
      permissions: { role, canManage: role === GuildRole.RAID_LEADER }
    });
  }
  assert.deepEqual(membership.mock.calls[0].arguments[0].where, {
    guildId_userId: { guildId: 'guild-1', userId: user.id }
  });
  assert.deepEqual(raids.mock.calls[0].arguments[0].where, { guildId: 'guild-1' });
});
