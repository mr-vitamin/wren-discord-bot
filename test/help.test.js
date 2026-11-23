const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { handleInteraction, commands } = require('../src/index');

async function requestHelp(memberPermissions = { has: () => false }) {
  let reply;
  await handleInteraction({
    isStringSelectMenu: () => false, isChatInputCommand: () => true,
    commandName: 'help', guildId: '1549421190609895557', channelId: 'public-channel',
    memberPermissions,
    reply: async value => { reply = value; },
  });
  return reply;
}

test('/help is registered for everyone and replies publicly without a staff or channel requirement', async () => {
  assert.ok(commands, 'the registration list must be available');
  const help = commands.find(command => command.name === 'help').toJSON();
  assert.equal(help.default_member_permissions, undefined);
  let directory;
  for (const permissions of [null, { has: () => false }, { has: () => true }]) {
    const reply = await requestHelp(permissions);
    assert.equal(reply.embeds.length, 1);
    assert.equal((reply.flags || 0) & MessageFlags.Ephemeral, 0);
    assert.deepEqual(reply.allowedMentions, { parse: [] });
    const currentDirectory = reply.embeds[0].toJSON();
    if (directory) assert.deepEqual(currentDirectory, directory, 'help must not filter by viewer permissions');
    directory = currentDirectory;
  }
});

test('/help lists every registered command and subcommand with its description in a purple embed', async () => {
  const reply = await requestHelp();
  assert.ok(reply, '/help must send a reply');
  const embed = reply.embeds[0].toJSON();
  assert.equal(embed.color, 0xa855f7);
  assert.equal(embed.url, 'https://vtmnarchive.com/archive/wren-discord-bot');
  assert.match(embed.description, /\[Wren[\s\S]*\]\(https:\/\/vtmnarchive\.com\/archive\/wren-discord-bot\)/);
  assert.deepEqual(embed.fields.map(field => field.name), [
    'General', 'Community', 'Editorial Tracking — Staff only', 'Issue Participation — Staff only',
  ]);
  const listing = embed.fields.map(field => field.value).join('\n');
  for (const builder of commands) {
    const command = builder.toJSON();
    const subcommands = command.options?.filter(option => option.type === 1) || [];
    for (const item of subcommands.length ? subcommands : [command]) {
      const name = subcommands.length ? `${command.name} ${item.name}` : command.name;
      assert.ok(listing.includes(`\`/${name}\``), `missing /${name}`);
      assert.ok(listing.includes(item.description), `missing description for /${name}`);
    }
  }
  assert.match(embed.fields[1].value, /<#1549980714064412803>/);
  for (const field of embed.fields.slice(2)) {
    assert.match(field.value, /Manage Roles/);
    assert.match(field.value, /staff command channel/i);
  }
  assert.ok(embed.fields.length <= 25);
  for (const field of embed.fields) {
    assert.ok(field.name.length <= 256);
    assert.ok(field.value.length <= 1024);
  }
  const length = (embed.title || '').length + embed.description.length
    + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  assert.ok(length <= 6000, 'help must fit in one Discord embed');
});

test('registration retains all existing commands and staff permission restrictions', () => {
  assert.ok(commands, 'the registration list must be available');
  assert.deepEqual(commands.map(command => command.name), ['quote', 'sub', 'contributor', 'help']);
  for (const name of ['sub', 'contributor']) {
    const command = commands.find(command => command.name === name).toJSON();
    assert.equal(BigInt(command.default_member_permissions), PermissionFlagsBits.ManageRoles);
    assert.equal(command.dm_permission, false);
  }
  assert.equal(commands.find(command => command.name === 'quote').toJSON().default_member_permissions, undefined);
});
