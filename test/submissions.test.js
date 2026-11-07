const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  addSubmission,
  assignSubmission,
  loadSubmissions,
  markSubmission,
  saveSubmissions,
  submissionSummary,
} = require('../src/submissions');

test('tracks multiple pieces per writer and persists editing status', () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'tmp-'));
  try {
    const filePath = path.join(directory, 'submissions.json');
    const records = loadSubmissions(filePath);
    const first = addSubmission(records, { title: '  The   Moving Village  ', authorId: '123', submittedById: '456' });
    const second = addSubmission(records, { title: 'Another piece', authorId: '123', submittedById: '456' });
    assert.equal(first.id, 'WP-001');
    assert.equal(first.title, 'The Moving Village');
    assert.equal(second.id, 'WP-002');
    markSubmission(records, first.id.toLowerCase(), 'edited', '789');
    saveSubmissions(filePath, records);
    markSubmission(records, second.id, 'editing', '789');
    saveSubmissions(filePath, records);
    const saved = loadSubmissions(filePath);
    assert.equal(saved[0].status, 'edited');
    assert.equal(saved[0].editorId, '789');
    assert.equal(saved[1].status, 'editing');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects duplicate post links and unknown statuses', () => {
  const records = [];
  const input = { title: 'Piece', authorId: '123', link: 'https://discord.com/channels/1/2', submittedById: '456' };
  addSubmission(records, input);
  assert.throws(() => addSubmission(records, input), /already tracked/);
  assert.throws(() => markSubmission(records, 'WP-001', 'published'), /Unknown submission status/);
});

test('assigns an editor and summarizes unfinished work', () => {
  const records = [];
  const first = addSubmission(records, { title: 'First', authorId: '123', submittedById: '456' });
  const second = addSubmission(records, { title: 'Second', authorId: '234', submittedById: '456' });
  assignSubmission(records, first.id, '789');
  markSubmission(records, second.id, 'edited', '890');
  assert.deepEqual(submissionSummary(records), { submitted: 1, editing: 0, edited: 1, unassigned: 0 });
  assignSubmission(records, first.id, null);
  assert.equal(submissionSummary(records).unassigned, 1);
  assert.throws(() => assignSubmission(records, 'WP-999', '789'), /No submission found/);
});
