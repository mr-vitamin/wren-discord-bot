const test = require('node:test');
const assert = require('node:assert/strict');
const { Client, Guild } = require('discord.js');
const { createClientOptions } = require('../src/client-options');
test('a complete real-SDK member reset collection survives disabled member/user caches', async () => {
  const client = new Client(createClientOptions());
  try {
    client.user = client.users._add({ id: '111111111111111111', username: 'synthetic-bot', bot: true, discriminator: '0', avatar: null });
    client.users.cache.set(client.user.id, client.user);
    const guild = new Guild(client, { id: '222222222222222222', name: 'synthetic',
      roles: [{ id: '222222222222222222', name: '@everyone', permissions: '0', position: 0 }], channels: [], members: [] });
    client.guilds.cache.set(guild.id, guild);
    guild.roles._add({ id: '555555555555555555', name: 'Contributor', permissions: '0', position: 1 });
    const chunk = require(require('node:path').join(require('node:path').dirname(require.resolve('discord.js')), 'client/websocket/handlers/GUILD_MEMBERS_CHUNK.js'));
    // The actual member-fetch consumer listens to chunk collections, not to manager caches.
    let requested; Object.defineProperty(guild, 'shard', { value: { send: packet => { requested = packet; } } });
    const pending = guild.members.fetch();
    assert.ok(requested);
    chunk(client, { d: { guild_id: guild.id, nonce: requested.d.nonce, chunk_index: 0, chunk_count: 1,
      members: ['333333333333333333', '444444444444444444'].map(id => ({ user: { id, username: 'synthetic', discriminator: '0', avatar: null }, roles: ['555555555555555555'], joined_at: '2026-01-01T00:00:00Z' })) } });
    const members = await pending;
    assert.equal(members.size, 2); assert.equal(guild.members.cache.size, 0); assert.equal(client.users.cache.size, 1);
    assert.equal(members.first().roles.cache.has('555555555555555555'), true);
    let removals = 0; client.rest.delete = async () => { removals++; };
    const result = await require('../src/contributor').resetContributors(members.values(), '555555555555555555');
    assert.deepEqual(result, { removed: 2, failed: 0 }); assert.equal(removals, 2);
  } finally { client.destroy(); }
});
