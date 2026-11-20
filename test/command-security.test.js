const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { handleInteraction, submissionCommand } = require('../src/index');
const { handleStaffCommand, createResetLock } = require('../src/contributor-discord');
test('revoked Manage Roles permission prevents reset before any state file or role mutation', async () => {
  let prompt, result, enumeration = false;
  const button = { customId: '', memberPermissions: { has: () => true }, update: async value => { result = value.content; }, editReply: async value => { result = value.content; } };
  const interaction = { guildId: 'guild', channelId: 'staff', user: { id: 'synthetic' },
    memberPermissions: { has: () => true }, options: { getSubcommand: () => 'reset' },
    reply: async value => { prompt = value; },
    fetchReply: async () => ({ awaitMessageComponent: async () => { button.customId = prompt.components[0].toJSON().components[0].custom_id; return button; } }),
    guild: { channels: { fetch: async () => ({ permissionsFor: () => ({ has: () => false }) }) },
      members: { fetch: async options => { if (!options) enumeration = true; return { permissions: { has: () => true } }; } } } };
  await handleStaffCommand(interaction, { file: 'must-not-read', guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() });
  assert.match(result, /denied/); assert.equal(enumeration, false);
  assert.equal(BigInt(submissionCommand.toJSON().default_member_permissions), PermissionFlagsBits.ManageRoles);
});
test('quote still posts attribution with cache-disabled fetch and no local persistence', async () => {
  let sent, acknowledged, fetchOptions;
  await handleInteraction({ isStringSelectMenu: () => false, isChatInputCommand: () => true,
    commandName: 'quote', guildId: '1549421190609895557', channelId: '1549980714064412803',
    options: { getString: () => 'synthetic quote', getUser: () => ({ id: '111', username: 'synthetic' }) },
    guild: { members: { fetch: async value => { fetchOptions = value; return { displayName: 'Synthetic Speaker' }; } },
      channels: { fetch: async () => ({ isTextBased: () => true, send: async value => { sent = value; } }) } },
    deferReply: async () => {}, editReply: async value => { acknowledged = value; } });
  assert.equal(fetchOptions.cache, false); assert.equal(fetchOptions.force, true);
  assert.match(sent.embeds[0].toJSON().description, /synthetic quote/);
  assert.match(sent.embeds[0].toJSON().description, /Synthetic Speaker/);
  assert.deepEqual(sent.allowedMentions, { parse: [] }); assert.equal(acknowledged, 'Posted.');
});
test('real quote failure path drops request text, token URLs and account names from output', async () => {
  let logged = ''; const original = process.stdout.write; process.stdout.write = line => { logged += line; return true; };
  try {
    await handleInteraction({ isStringSelectMenu: () => false, isChatInputCommand: () => true,
      commandName: 'quote', guildId: '1549421190609895557', channelId: '1549980714064412803',
      options: { getString: () => 'PRIVATE_TEXT', getUser: () => ({ id: '111', username: 'PRIVATE_NAME' }) },
      guild: { members: { fetch: async () => null }, channels: { fetch: async () => { throw Object.assign(new Error('SECRET_TOKEN PRIVATE_NAME'), { code: 50013, requestBody: { content: 'PRIVATE_TEXT' }, url: 'https://example/SECRET_TOKEN' }); } } },
      deferReply: async () => {}, editReply: async () => {} });
  } finally { process.stdout.write = original; }
  assert.match(logged, /quote_failed/); assert.doesNotMatch(logged, /PRIVATE|SECRET|https|requestBody/);
});
test('participation is acknowledged privately before issue storage is decrypted', async () => {
  const steps = [];
  const interaction = { isStringSelectMenu: () => true, customId: 'wren:contributor:abc', channelId: 'channel', message: { id: 'message' },
    deferred: false, deferReply: async value => { assert.equal(value.flags, 64); steps.push('defer'); interaction.deferred = true; },
    editReply: async () => steps.push('reply') };
  await handleInteraction(interaction); assert.deepEqual(steps, ['defer', 'reply']);
});
