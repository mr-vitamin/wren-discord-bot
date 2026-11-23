const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags } = require('discord.js');
const { secureStore } = require('../src/secure-storage');
const { loadIssue, saveIssue, issueControlId, createResetLock } = require('../src/contributor');
const { handleStaffCommand, handleChoice } = require('../src/contributor-discord');

function fixture(t, enabled = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-workflow-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'contributor-issue.json');
  secureStore.writeJson(path.join(directory, 'privacy-state.json'), {
    version: 1, subjects: [], highWaterMark: 0, requiredFiles: [], pending: null,
  });
  const issue = { issue: '2', channelId: 'announcements', messageId: 'missing-old-message', generation: 'abc', enabled };
  saveIssue(file, issue);
  return { file, issue, guildId: 'guild', staffChannelId: 'staff', resetLock: createResetLock() };
}

function staffInteraction(action, guild, strings = {}) {
  const replies = [];
  let prompt;
  const button = {
    memberPermissions: { has: () => true },
    update: async value => replies.push(value), editReply: async value => replies.push(value),
  };
  const interaction = {
    guildId: 'guild', channelId: 'staff', user: { id: 'staff-member' }, guild,
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => action, getString: key => strings[key], getChannel: () => guild.destination },
    deferReply: async value => assert.equal(value.flags, MessageFlags.Ephemeral),
    reply: async value => { prompt = value; },
    editReply: async value => replies.push(value),
    fetchReply: async () => ({ awaitMessageComponent: async () => {
      button.customId = prompt.components[0].toJSON().components[0].custom_id;
      return button;
    } }),
  };
  return { interaction, replies };
}

test('an open issue gives actionable help without posting, changing records, or changing roles', async t => {
  const config = fixture(t);
  const files = [config.file, path.join(path.dirname(config.file), 'privacy-state.json')];
  const before = files.map(file => fs.readFileSync(file));
  // No guild methods or announcement inputs should be needed for this rejection.
  const { interaction, replies } = staffInteraction('announce', {});
  interaction.options.getString = () => { throw new Error('must not read new announcement inputs'); };
  await handleStaffCommand(interaction, config);
  const response = replies.at(-1);
  const content = typeof response === 'string' ? response : response.content;
  assert.match(content, /Participation for \*\*2\*\* is already open/);
  assert.match(content, /\/contributor close/);
  assert.match(content, /preserves Contributor roles/);
  assert.match(content, /\/contributor reset/);
  assert.deepEqual(response.allowedMentions, { parse: [] });
  files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
  assert.equal(await config.resetLock.run(async () => 'released'), 'released');
});

test('closed issue and missing announcement do not block the explicit Contributor lifecycle', async t => {
  const config = fixture(t, false);
  const heldRoles = new Set(['unrelated']);
  const roleChanges = [];
  const member = { roles: {
    cache: { has: id => heldRoles.has(id) },
    add: async id => { heldRoles.add(id); roleChanges.push(['add', id]); },
    remove: async id => { heldRoles.delete(id); roleChanges.push(['remove', id]); },
  } };
  let messagesSent = 0;
  const destination = { id: 'announcements', guildId: 'guild', send: async () => {
    messagesSent++;
    return { id: `message-${messagesSent}`, url: 'https://discord.com/synthetic' };
  } };
  const guild = {
    destination, client: { user: { id: 'bot' } },
    roles: { cache: new Map([['role', { id: 'role', name: 'Contributor' }]]) },
    channels: { fetch: async () => ({
      permissionsFor: () => ({ has: () => true }),
      messages: { fetch: async () => { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); } },
    }) },
    members: { fetch: async options => options?.user === 'staff-member'
      ? { permissions: { has: () => true } } : options ? member : new Map([['member', member]]) },
  };
  async function command(action, strings = {}) {
    const { interaction, replies } = staffInteraction(action, guild, strings);
    await handleStaffCommand(interaction, config);
    return replies;
  }
  async function choose(issue, current = loadIssue(config.file)) {
    let response;
    await handleChoice({
      customId: issueControlId(issue), channelId: issue.channelId, message: { id: issue.messageId },
      values: ['participate'], user: { id: 'member' }, guild,
      reply: async value => { response = value; }, deferReply: async () => {},
      editReply: async value => { response = value; },
    }, current, { file: config.file, resetLock: config.resetLock });
    return response;
  }
  const input = issue => ({ issue, title: 'New issue', description: 'Join this issue.', message: 'Participation is open.' });
  await command('announce', input('3'));
  const first = loadIssue(config.file);
  assert.equal(first.enabled, true);
  assert.equal(first.issue, '3');
  assert.notEqual(first.generation, config.issue.generation);
  assert.equal(messagesSent, 1);
  assert.deepEqual([...heldRoles], ['unrelated'], 'announce must not assign or remove roles');
  await choose(first);
  assert.equal(heldRoles.has('role'), true);
  const closedReplies = await command('close');
  const closed = loadIssue(config.file);
  assert.equal(closed.enabled, false);
  assert.notEqual(closed.generation, first.generation);
  assert.equal(heldRoles.has('role'), true, 'closing must preserve Contributor');
  assert.match(closedReplies.at(-1), /old announcement could not be edited/);
  const changesBeforeStale = roleChanges.length;
  assert.match((await choose(first)).content, /closed or outdated/);
  // Even a control matching the closed generation cannot grant participation.
  assert.match((await choose(closed)).content, /closed or outdated/);
  assert.equal(roleChanges.length, changesBeforeStale);
  const resetReplies = await command('reset');
  assert.match(resetReplies.at(-1).content, /Removed: 1\. Failed: 0/);
  assert.deepEqual([...heldRoles], ['unrelated']);
  const zeroResetReplies = await command('reset');
  assert.match(zeroResetReplies.at(-1).content, /Removed: 0\. Failed: 0/);
  const closedBytes = fs.readFileSync(config.file);
  await command('announce', input('4'));
  const next = loadIssue(config.file);
  assert.equal(next.enabled, true);
  assert.equal(next.issue, '4');
  assert.notEqual(next.generation, first.generation);
  assert.notDeepEqual(fs.readFileSync(config.file), closedBytes, 'new announcement saves its own issue state');
  assert.deepEqual([...heldRoles], ['unrelated'], 'the next issue starts without participants');
  assert.match((await choose(first)).content, /closed or outdated/);
  await choose(next);
  assert.equal(heldRoles.has('role'), true, 'participation requires a new voluntary choice');
  assert.deepEqual(roleChanges, [['add', 'role'], ['remove', 'role'], ['add', 'role']]);
});

test('unexpected announcement failures remain sanitized', async t => {
  const config = fixture(t, false);
  const { interaction, replies } = staffInteraction('announce', {
    get roles() { throw new Error('PRIVATE_INTERNAL_ERROR'); },
  });
  const before = fs.readFileSync(config.file);
  await handleStaffCommand(interaction, config);
  assert.equal(replies.at(-1), 'Could not update issue participation. Check the current issue state or contact the operator.');
  assert.deepEqual(fs.readFileSync(config.file), before);
});
