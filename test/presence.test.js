const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityType, Client } = require('discord.js');
const { createClientOptions } = require('../src/client-options');

test('Discord login sends Online with the exact Playing activity without connecting to Discord', async () => {
  const client = new Client(createClientOptions());
  let initialPresence;
  // Exercise the installed SDK login path; replace the network connection only.
  client.ws.connect = async () => { initialPresence = client.options.ws.presence; };
  try {
    await client.login('synthetic-test-token');
    assert.equal(initialPresence.status, 'online');
    assert.equal(initialPresence.activities.length, 1);
    assert.equal(initialPresence.activities[0].type, ActivityType.Playing);
    assert.equal(initialPresence.activities[0].name, '/help | vtmnarchive.com');
  } finally { await client.destroy(); }
});
