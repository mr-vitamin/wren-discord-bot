const fs = require('node:fs');
const path = require('node:path');

function loadIssue(file) {
  if (!fs.existsSync(file)) return null;
  const issue = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!issue || typeof issue.issue !== 'string' || typeof issue.channelId !== 'string'
    || typeof issue.messageId !== 'string' || typeof issue.generation !== 'string'
    || typeof issue.enabled !== 'boolean') throw new Error('Invalid Contributor issue configuration.');
  return issue;
}

function saveIssue(file, issue) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(issue, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function issueControlId(issue) { return `wren:contributor:${issue.generation}`; }
function parseIssueControlId(id) {
  const match = /^wren:contributor:([a-f0-9]{1,32})$/.exec(id);
  return match ? { generation: match[1] } : null;
}

function isCurrentControl(issue, customId, channelId, messageId) {
  const parsed = parseIssueControlId(customId);
  return Boolean(issue?.enabled && parsed && issue.generation === parsed.generation
    && issue.channelId === channelId && issue.messageId === messageId);
}

async function changeParticipation(member, roleId, choice) {
  const hasRole = member.roles.cache.has(roleId);
  if (choice === 'participate') {
    if (hasRole) return 'already-joined';
    await member.roles.add(roleId);
    return 'joined';
  }
  if (choice === 'withdraw') {
    if (!hasRole) return 'already-withdrawn';
    await member.roles.remove(roleId);
    return 'withdrawn';
  }
  throw new Error('Unknown participation choice.');
}

async function resetContributors(members, roleId) {
  let removed = 0;
  let failed = 0;
  for (const member of members) {
    if (!member.roles.cache.has(roleId)) continue;
    try {
      await member.roles.remove(roleId);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}

function createResetLock() {
  let busy = false;
  let participationQueue = Promise.resolve();
  return {
    async runParticipation(operation) {
      if (busy) throw new Error('A Contributor reset is in progress.');
      const pending = participationQueue.then(operation);
      participationQueue = pending.catch(() => {});
      return pending;
    },
    async run(operation) {
      if (busy) throw new Error('A Contributor reset is already in progress.');
      busy = true;
      try {
        await participationQueue;
        return await operation();
      } finally { busy = false; }
    },
  };
}

module.exports = { loadIssue, saveIssue, issueControlId, parseIssueControlId, isCurrentControl, changeParticipation, resetContributors, createResetLock };
