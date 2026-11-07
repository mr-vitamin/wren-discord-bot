const fs = require('node:fs');
const path = require('node:path');

const STATUSES = Object.freeze(['submitted', 'editing', 'edited']);

function loadSubmissions(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(records)) throw new Error('Submission data is not an array.');
  return records;
}

function saveSubmissions(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function nextId(records) {
  const highest = records.reduce((max, record) => {
    const match = /^WP-(\d+)$/.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
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

module.exports = { STATUSES, addSubmission, assignSubmission, loadSubmissions, markSubmission, saveSubmissions, submissionSummary };
