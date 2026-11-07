const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  loadIssue, saveIssue, issueControlId, parseIssueControlId,
  changeParticipation, resetContributors, createResetLock, isCurrentControl,
} = require('../src/contributor');

test('issue state survives restart and old component identifiers become invalid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-issue-'));
  try {
    const file = path.join(dir, 'issue.json');
    const first = { issue: 'Issue 2', channelId: '123', messageId: '456', generation: 'abc', enabled: true };
    saveIssue(file, first);
    assert.deepEqual(loadIssue(file), first);
    assert.deepEqual(parseIssueControlId(issueControlId(first)), { generation: 'abc' });
    const next = { ...first, generation: 'def', enabled: false };
    saveIssue(file, next);
    assert.equal(parseIssueControlId(issueControlId(first)).generation === loadIssue(file).generation, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('only the enabled current issue message accepts its dropdown', () => {
  const issue = { issue: 'Issue 2', channelId: '123', messageId: '456', generation: 'abc', enabled: true };
  assert.equal(isCurrentControl(issue, issueControlId(issue), '123', '456'), true);
  assert.equal(isCurrentControl(issue, issueControlId(issue), '123', 'wrong'), false);
  assert.equal(isCurrentControl({ ...issue, enabled: false }, issueControlId(issue), '123', '456'), false);
  assert.equal(isCurrentControl({ ...issue, generation: 'def' }, issueControlId(issue), '123', '456'), false);
});

test('participation checks current membership and avoids duplicate API calls', async () => {
  const roles = new Set();
  const calls = [];
  const member = { roles: { cache: { has: (id) => roles.has(id) }, add: async (id) => { calls.push('add'); roles.add(id); }, remove: async (id) => { calls.push('remove'); roles.delete(id); } } };
  assert.equal(await changeParticipation(member, 'role', 'participate'), 'joined');
  assert.equal(await changeParticipation(member, 'role', 'participate'), 'already-joined');
  assert.equal(await changeParticipation(member, 'role', 'withdraw'), 'withdrawn');
  assert.equal(await changeParticipation(member, 'role', 'withdraw'), 'already-withdrawn');
  assert.deepEqual(calls, ['add', 'remove']);
});

test('reset continues after one member fails and does not remove other roles', async () => {
  const members = [
    { id: '1', roles: { cache: { has: (id) => id === 'contributor' }, remove: async () => {} } },
    { id: '2', roles: { cache: { has: (id) => id === 'contributor' }, remove: async () => { throw new Error('forbidden'); } } },
    { id: '3', roles: { cache: { has: () => false }, remove: async () => { throw new Error('should not call'); } } },
  ];
  const result = await resetContributors(members, 'contributor');
  assert.deepEqual(result, { removed: 1, failed: 1 });
});

test('reset lock blocks concurrent runs and releases after failures', async () => {
  const lock = createResetLock();
  const started = lock.run(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    throw new Error('failed');
  });
  await assert.rejects(lock.run(async () => {}), /already in progress/);
  await assert.rejects(started, /failed/);
  assert.equal(await lock.run(async () => 'ok'), 'ok');
});

test('reset waits for an in-flight role change and rejects new changes', async () => {
  const lock = createResetLock();
  const order = [];
  let finishChange;
  const change = lock.runParticipation(async () => {
    order.push('change-start');
    await new Promise((resolve) => { finishChange = resolve; });
    order.push('change-end');
  });
  await new Promise((resolve) => setImmediate(resolve));
  const reset = lock.run(async () => { order.push('reset'); });
  await assert.rejects(lock.runParticipation(async () => {}), /reset.*progress/i);
  finishChange();
  await Promise.all([change, reset]);
  assert.deepEqual(order, ['change-start', 'change-end', 'reset']);
});
