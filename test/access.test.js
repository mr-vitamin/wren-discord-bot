const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../src/access');
test('staff authorization requires guild, channel and Manage Roles even for reads', () => {
  const base = { guildId: 'g', channelId: 'c', memberPermissions: { has: p => p === PermissionFlagsBits.ManageRoles } };
  assert.equal(isStaff(base, 'g', 'c'), true);
  for (const change of [{ guildId: 'elsewhere' }, { channelId: 'elsewhere' }, { memberPermissions: null }, { memberPermissions: { has: () => false } }]) {
    assert.equal(isStaff({ ...base, ...change }, 'g', 'c'), false);
  }
});
test('editorial commands acknowledge before touching storage so encryption cannot expire the interaction', async () => {
  const { handleSubmissionCommand } = require('../src/index');
  let acknowledged = false, result;
  await handleSubmissionCommand({ guildId: '1549421190609895557', channelId: '1556325587432243281',
    memberPermissions: { has: () => true },
    deferReply: async () => { acknowledged = true; },
    options: { getSubcommand() { assert.equal(acknowledged, true); return 'summary'; } },
    editReply: async value => { result = value; }, reply: async () => { throw new Error('must defer authorized commands'); } });
  assert.equal(acknowledged, true); assert.match(result.content, /Editorial snapshot/);
});
test('unauthorized editorial summary is rejected before accessing local records', async () => {
  const { handleSubmissionCommand } = require('../src/index');
  let reply;
  await handleSubmissionCommand({ guildId: '1549421190609895557', channelId: '1556325587432243281',
    memberPermissions: { has: () => false }, reply: async v => { reply = v; },
    options: { getSubcommand() { throw new Error('must not access records/options'); } } });
  assert.match(reply.content, /Manage Roles/); assert.equal(reply.flags, 64);
});
