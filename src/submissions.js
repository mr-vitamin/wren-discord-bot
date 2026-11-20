const fs = require('node:fs');
const path = require('node:path');
const { secureStore } = require('./secure-storage');
const { readLedgerFor } = require('./privacy-ledger');

const STATUSES = Object.freeze(['submitted', 'editing', 'edited']);
const HIGH_WATER = Symbol('submissionHighWater');
const GENERATION = Symbol('deletionGeneration');

function parseSubmissions(data) {
  const records = Array.isArray(data) ? data : data?.format === 'wren-submissions' && data.version === 1 ? data.records : null;
  if (!Array.isArray(records)) throw new Error('Invalid submission storage.');
  let highest = 0;
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || !/^WP-\d+$/.test(r.id) || typeof r.title !== 'string'
      || !r.title.trim() || r.title.length > 120 || typeof r.authorId !== 'string' || !r.authorId
      || !STATUSES.includes(r.status) || !['editorId', 'submittedById'].every(k => r[k] === null || typeof r[k] === 'string')
      || !(r.link === null || typeof r.link === 'string')
      || !['createdAt', 'updatedAt'].every(k => typeof r[k] === 'string' && Number.isFinite(Date.parse(r[k])))) throw new Error('Invalid submission storage.');
    if (Object.keys(r).some(k => !['id', 'title', 'authorId', 'link', 'status', 'editorId', 'submittedById', 'createdAt', 'updatedAt'].includes(k))) throw new Error('Invalid submission storage.');
    highest = Math.max(highest, Number(r.id.slice(3)));
  }
  if (!Number.isSafeInteger(highest) || new Set(records.map(r => r.id)).size !== records.length) throw new Error('Invalid submission storage.');
  if (!Array.isArray(data) && (!Number.isSafeInteger(data.highWaterMark) || data.highWaterMark < highest)) throw new Error('Invalid submission storage.');
  Object.defineProperty(records, HIGH_WATER, { value: Array.isArray(data) ? highest : data.highWaterMark, writable: true, configurable: true });
  const generation = Array.isArray(data) ? 0 : data.deletionGeneration ?? 0;
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid submission storage.');
  Object.defineProperty(records, GENERATION, { value: generation, writable: true, configurable: true });
  return records;
}
function submissionPayload(records) {
  const highWaterMark = Math.max(records[HIGH_WATER] || 0, ...records.map(r => Number(r.id.slice(3))), 0);
  const data = { format: 'wren-submissions', version: 1, highWaterMark, deletionGeneration: records[GENERATION] || 0, records };
  parseSubmissions(data); return data;
}

function loadSubmissions(filePath, store = secureStore) {
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(path.join(path.dirname(filePath), 'privacy-state.json'))) {
      const { state } = readLedgerFor(filePath, store);
      if (state.highWaterMark > 0 || state.requiredFiles.includes('submissions.json')) throw new Error('Required submission storage missing.');
      const records = []; Object.defineProperty(records, GENERATION, { value: state.subjects.length, writable: true, configurable: true }); return records;
    }
    return [];
  }
  const { state } = readLedgerFor(filePath, store);
  const records = parseSubmissions(store.readJson(filePath));
  if (records[GENERATION] !== state.subjects.length) throw new Error('Deletion maintenance must be replayed.');
  records[HIGH_WATER] = Math.max(records[HIGH_WATER], state.highWaterMark); return records;
}

function saveSubmissions(filePath, records, store = secureStore) {
  const { state, ledgerFile } = readLedgerFor(filePath, store);
  const payload = submissionPayload(records);
  state.highWaterMark = Math.max(state.highWaterMark, payload.highWaterMark);
  if (!state.requiredFiles.includes('submissions.json')) state.requiredFiles.push('submissions.json');
  store.writeJson(ledgerFile, state); // Reserve identifiers before committing data; failure may leave a gap, never reuse.
  payload.highWaterMark = state.highWaterMark; payload.deletionGeneration = state.subjects.length;
  store.writeJson(filePath, payload);
}

function nextId(records) {
  const highest = records.reduce((max, record) => {
    const match = /^WP-(\d+)$/.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, records[HIGH_WATER] || 0);
  if (!Number.isSafeInteger(highest + 1)) throw new Error('Submission identifier limit reached.');
  Object.defineProperty(records, HIGH_WATER, { value: highest + 1, writable: true, configurable: true });
  return `WP-${String(highest + 1).padStart(3, '0')}`;
}

function addSubmission(records, { title, authorId, link, submittedById }) {
  const cleanTitle = title.trim().replace(/\s+/g, ' ');
  if (!cleanTitle || cleanTitle.length > 120) throw new Error('Title must be 1–120 characters.');
  if (link && records.some((record) => record.link === link)) {
    throw new Error('That forum post is already tracked.');
  }
  const now = new Date().toISOString();
  const record = {
    id: nextId(records),
    title: cleanTitle,
    authorId,
    link: link || null,
    status: 'submitted',
    editorId: null,
    submittedById,
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  return record;
}

function markSubmission(records, id, status, editorId) {
  if (!STATUSES.includes(status)) throw new Error('Unknown submission status.');
  const record = records.find((item) => item.id.toLowerCase() === id.trim().toLowerCase());
  if (!record) throw new Error(`No submission found for ${id}.`);
  record.status = status;
  if (editorId) record.editorId = editorId;
  record.updatedAt = new Date().toISOString();
  return record;
}

function assignSubmission(records, id, editorId) {
  const record = records.find((item) => item.id.toLowerCase() === id.trim().toLowerCase());
  if (!record) throw new Error(`No submission found for ${id}.`);
  record.editorId = editorId;
  record.updatedAt = new Date().toISOString();
  return record;
}

function submissionSummary(records) {
  return {
    submitted: records.filter((record) => record.status === 'submitted').length,
    editing: records.filter((record) => record.status === 'editing').length,
    edited: records.filter((record) => record.status === 'edited').length,
    unassigned: records.filter((record) => record.status !== 'edited' && !record.editorId).length,
  };
}

module.exports = { STATUSES, addSubmission, assignSubmission, loadSubmissions, markSubmission, saveSubmissions, submissionSummary, parseSubmissions, submissionPayload };
