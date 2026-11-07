const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PermissionFlagsBits } = require('discord.js');
const { createResetLock, loadIssue } = require('../src/contributor');
const {
  contributorCommand, buildMenu, resolveContributorRole, handleChoice, handleStaffCommand,
} = require('../src/contributor-discord');

test('staff commands expose announce, close, and reset with role management permission', () => {
  const command = contributorCommand.toJSON();
  assert.equal(command.name, 'contributor');
  assert.deepEqual(command.options.map((option) => option.name), ['announce', 'close', 'reset']);
  assert.equal(BigInt(command.default_member_permissions), PermissionFlagsBits.ManageRoles);
  assert.deepEqual(command.options[0].options.map((option) => option.name), ['issue', 'title', 'description', 'message', 'channel']);
});

test('staff announce posts one message with the menu and persists its message ID', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-announce-'));
  try {
    const file = path.join(directory, 'issue.json');
    let sent;
    let acknowledgement;
    const channel = { id: '123', guildId: 'guild', send: async (payload) => {
      sent = payload;
      return { id: '456', url: 'https://discord.com/channels/guild/123/456' };
    } };
    const interaction = {
      guildId: 'guild', channelId: 'staff', memberPermissions: { has: () => true },
      guild: { roles: { cache: new Map([['role', { id: 'role', name: 'Contributor' }]]) } },
      options: { getSubcommand: () => 'announce', getString: (key) => ({
        issue: 'Issue #2', title: 'Worlds Collide', description: 'Write a story where two worlds meet.',
        message: 'Our new writing prompt is here. Join in if you want to write for this issue.',
      })[key], getChannel: () => channel },
      deferReply: async () => {}, editReply: async (value) => { acknowledgement = value; },
    };
    await handleStaffCommand(interaction, { file, guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() });
    assert.equal(sent.embeds.length, 1);
    assert.equal(sent.components.length, 1);
    assert.equal(sent.allowedMentions.parse.length, 0);
    assert.equal(sent.content, 'Our new writing prompt is here. Join in if you want to write for this issue.');
    assert.equal(sent.embeds[0].toJSON().title, 'Worlds Collide');
    assert.equal(sent.embeds[0].toJSON().description, 'Write a story where two worlds meet.');
    assert.equal(sent.embeds[0].toJSON().footer, undefined);
    assert.match(sent.components[0].toJSON().components[0].placeholder, /Issue #2/);
    assert.equal(loadIssue(file).messageId, '456');
    assert.match(acknowledgement, /456/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('staff close persists disabled state and disables the existing dropdown', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-close-'));
  try {
    const file = path.join(directory, 'issue.json');
    const { saveIssue } = require('../src/contributor');
    saveIssue(file, { issue: 'Issue #2', channelId: '123', messageId: '456', generation: 'abc', enabled: true });
    let edited;
    const message = { author: { id: 'bot' }, edit: async (payload) => { edited = payload; } };
    const guild = { client: { user: { id: 'bot' } }, channels: { fetch: async () => ({ messages: { fetch: async () => message } }) } };
    let acknowledgement;
    const interaction = {
      guildId: 'guild', channelId: 'staff', memberPermissions: { has: () => true }, guild,
      options: { getSubcommand: () => 'close' }, deferReply: async () => {},
      editReply: async (value) => { acknowledgement = value; },
    };
    await handleStaffCommand(interaction, { file, guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() });
    assert.equal(loadIssue(file).enabled, false);
    assert.equal(edited.components[0].toJSON().components[0].disabled, true);
    assert.match(acknowledgement, /not removed/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('confirmed reset closes issue, removes every available holder, and reports failures', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-reset-'));
  try {
    const file = path.join(directory, 'issue.json');
    const { saveIssue } = require('../src/contributor');
    saveIssue(file, { issue: 'Issue #2', channelId: '123', messageId: '456', generation: 'abc', enabled: true });
    const removed = [];
    let output;
    let prompt;
    const member = (id, fail = false) => ({ id, roles: { cache: { has: (roleId) => roleId === 'role' }, remove: async (roleId) => {
      if (fail) throw new Error('no access');
      removed.push([id, roleId]);
    } } });
    const guild = {
      client: { user: { id: 'bot' } },
      roles: { cache: new Map([['role', { id: 'role', name: 'Contributor' }]]) },
      channels: { fetch: async () => ({ messages: { fetch: async () => ({ author: { id: 'bot' }, edit: async () => {} }) } }) },
      members: { fetch: async () => new Map([['1', member('1')], ['2', member('2', true)]]) },
    };
    const button = { customId: '', update: async () => {}, editReply: async (value) => { output = value.content; } };
    const interaction = {
      guildId: 'guild', channelId: 'staff', user: { id: 'staff-member' },
      memberPermissions: { has: () => true }, guild,
      options: { getSubcommand: () => 'reset' },
      reply: async (value) => { prompt = value; },
      fetchReply: async () => ({ awaitMessageComponent: async () => {
        button.customId = prompt.components[0].toJSON().components[0].custom_id;
        return button;
      } }),
    };
    await handleStaffCommand(interaction, { file, guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() });
    assert.deepEqual(removed, [['1', 'role']]);
    assert.equal(loadIssue(file).enabled, false);
    assert.match(output, /Removed: 1\. Failed: 1/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('issue dropdown identifies the issue and has participate and withdraw choices', () => {
  const issue = { issue: 'Issue #2', generation: 'abc', enabled: true };
  const menu = buildMenu(issue).toJSON().components[0];
  assert.match(menu.placeholder, /Issue #2/);
  assert.deepEqual(menu.options.map((option) => option.value), ['participate', 'withdraw']);
  assert.equal(buildMenu({ ...issue, enabled: false }).toJSON().components[0].disabled, true);
});

test('existing Contributor role must be unique', () => {
  const guild = { roles: { cache: new Map([['one', { id: 'one', name: 'Contributor' }]]) } };
  assert.equal(resolveContributorRole(guild).id, 'one');
  guild.roles.cache.set('two', { id: 'two', name: 'Contributor' });
  assert.throws(() => resolveContributorRole(guild), /more than one/i);
  guild.roles.cache.clear();
  assert.throws(() => resolveContributorRole(guild), /not found/i);
});

test('stale dropdown rejects without fetching or changing member roles', async () => {
  let fetched = false;
  let response;
  const interaction = {
    customId: 'wren:contributor:abc', channelId: '123', message: { id: '456' },
    values: ['participate'], guild: { members: { fetch: async () => { fetched = true; } } },
    reply: async (value) => { response = value; },
  };
  await handleChoice(interaction, { issue: 'Issue #2', channelId: '123', messageId: '456', generation: 'def', enabled: false });
  assert.equal(fetched, false);
  assert.match(response.content, /closed|outdated/i);
});

test('valid dropdown acknowledges privately before fetching or changing roles', async () => {
  const sequence = [];
  const member = { roles: { cache: { has: () => false }, add: async () => { sequence.push('add'); } } };
  const interaction = {
    customId: 'wren:contributor:abc', channelId: '123', message: { id: '456' },
    values: ['participate'], user: { id: 'member' },
    guild: {
      roles: { cache: new Map([['role', { id: 'role', name: 'Contributor' }]]) },
      members: { fetch: async () => { sequence.push('fetch'); return member; } },
    },
    deferReply: async () => { sequence.push('defer'); },
    editReply: async () => { sequence.push('reply'); },
  };
  await handleChoice(interaction, { issue: 'Issue #2', channelId: '123', messageId: '456', generation: 'abc', enabled: true });
  assert.deepEqual(sequence, ['defer', 'fetch', 'add', 'reply']);
});
