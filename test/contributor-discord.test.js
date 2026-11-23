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
  assert.deepEqual(command.options[0].options.map((option) => option.name), ['issue', 'title', 'description', 'channel', 'message', 'dates', 'submission']);
});

test('staff announce posts one message with the menu and persists its message ID', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-announce-'));
  try {
    const file = path.join(directory, 'issue.json');
    require('../src/secure-storage').secureStore.writeJson(path.join(path.dirname(file), 'privacy-state.json'), { version: 1, subjects: [], highWaterMark: 0, backupRoots: [], requiredFiles: [], pending: null });
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
    assert.equal(sent.embeds[0].toJSON().color, 0xa855f7);
    assert.equal(sent.embeds[0].toJSON().author.name, 'Issue #2');
    assert.equal(sent.embeds[0].toJSON().fields[0].name, 'Participation');
    assert.equal(sent.embeds[0].toJSON().footer, undefined);
    assert.equal(sent.components[0].toJSON().components[0].placeholder, 'Select your participation type...');
    assert.equal(loadIssue(file).messageId, '456');
    assert.match(acknowledgement, /456/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('announce without an intro forwards optional sections and saves only the existing issue metadata', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-optional-announcement-'));
  try {
    const file = path.join(directory, 'issue.json');
    require('../src/secure-storage').secureStore.writeJson(path.join(directory, 'privacy-state.json'), {
      version: 1, subjects: [], highWaterMark: 0, requiredFiles: [], pending: null,
    });
    let sent;
    const channel = { id: '123', guildId: 'guild', send: async payload => {
      sent = payload;
      return { id: '456', url: 'https://discord.com/synthetic' };
    } };
    const input = {
      issue: 'Spring Collection', title: 'Spring Collection — Open Call',
      description: '**Prompt:** A custom theme\n**Categories:** Any genre\n**Word limits:** Staff guidelines',
      dates: '**Deadline:** Staff date\n**Release:** Staff schedule',
      submission: 'Email submissions@example.org; read our community guidelines.',
    };
    await handleStaffCommand({
      guildId: 'guild', channelId: 'staff', memberPermissions: { has: () => true },
      guild: { roles: { cache: new Map([['role', { id: 'role', name: 'Contributor' }]]) } },
      options: {
        getSubcommand: () => 'announce', getChannel: () => channel,
        getString: (key, required) => {
          if (['message', 'dates', 'submission'].includes(key)) assert.notEqual(required, true);
          return input[key] ?? null;
        },
      },
      deferReply: async () => {}, editReply: async () => {},
    }, { file, guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() });
    assert.equal(Object.hasOwn(sent, 'content'), false);
    const embed = sent.embeds[0].toJSON();
    assert.equal(embed.author, undefined);
    assert.equal(embed.description, input.description);
    assert.deepEqual(embed.fields.map(field => field.name), ['Important Dates', 'How to Submit', 'Participation']);
    assert.equal(embed.fields[1].value, input.submission);
    const saved = loadIssue(file);
    assert.equal(saved.enabled, true);
    assert.deepEqual(Object.keys(saved).sort(), ['channelId', 'enabled', 'generation', 'issue', 'messageId']);
    assert.deepEqual(sent.allowedMentions, { parse: [] });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('staff close persists disabled state and disables the existing dropdown', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-close-'));
  try {
    const file = path.join(directory, 'issue.json');
    require('../src/secure-storage').secureStore.writeJson(path.join(path.dirname(file), 'privacy-state.json'), { version: 1, subjects: [], highWaterMark: 0, backupRoots: [], requiredFiles: [], pending: null });
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
    require('../src/secure-storage').secureStore.writeJson(path.join(path.dirname(file), 'privacy-state.json'), { version: 1, subjects: [], highWaterMark: 0, backupRoots: [], requiredFiles: [], pending: null });
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
      channels: { fetch: async () => ({ permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => ({ author: { id: 'bot' }, edit: async () => {} }) } }) },
      members: { fetch: async options => options
        ? { permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles } }
        : new Map([['1', member('1')], ['2', member('2', true)]]) },
    };
    const button = { customId: '', memberPermissions: { has: () => true }, update: async () => {}, editReply: async (value) => { output = value.content; } };
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

test('issue dropdown prompts a participation choice and preserves participate and withdraw values', () => {
  const issue = { issue: 'Issue #2', generation: 'abc', enabled: true };
  const menu = buildMenu(issue).toJSON().components[0];
  assert.equal(menu.placeholder, 'Select your participation type...');
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
