const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, normalizeEvent } = require('../src/safe-log');
test('API errors cannot put body, URL, personal text, credentials or arbitrary codes into logs', () => {
  const output = []; const log = createLogger(line => output.push(line));
  const error = Object.assign(new Error('PRIVATE_NAME SECRET_TOKEN'), {
    code: 50013, status: 403, url: 'https://discord.com/interactions/PRIVATE_TOKEN',
    requestBody: { content: 'PRIVATE_NAME' }, token: 'SECRET_TOKEN', userId: '123456789012345678',
  });
  log('quote_failed', error);
  const parsed = JSON.parse(output.join('')); assert.equal(parsed.event, 'quote_failed');
  assert.equal(parsed.code, 50013); assert.equal(parsed.status, 403);
  assert.doesNotMatch(output.join(''), /PRIVATE|SECRET|requestBody|userId|https/);
  log('quote_failed', { code: 'SECRET_TOKEN', status: 'PRIVATE_NAME' });
  assert.equal(JSON.parse(output[1]).code, undefined);
});
test('unknown events and malformed or oversized child output are dropped; extra fields are not retained', () => {
  assert.equal(normalizeEvent('PRIVATE_NAME'), null);
  assert.equal(normalizeEvent('{broken'), null);
  assert.equal(normalizeEvent('x'.repeat(9000)), null);
  assert.equal(normalizeEvent(JSON.stringify({ event: 'SECRET_TOKEN' })), null);
  assert.deepEqual(normalizeEvent(JSON.stringify({ event: 'ready', content: 'SECRET_TOKEN', code: 123456789012345678 })), { event: 'ready' });
});
