# Wren Privacy Hardening Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. Track results in work/progress.md.

**Goal:** Implement the approved privacy safeguards without changing production data or operations.
**Architecture:** Windows CurrentUser DPAPI envelopes and explicit offline maintenance; allowlisted application and runner logs; bounded caches and explicit staff authorization.
**Tech Stack:** Node.js/CommonJS, existing discord.js, Windows PowerShell/.NET. No new runtime dependency.
**Spec:** ../specs/2026-11-18-privacy-hardening-design.md.

## Global Constraints

- Preserve production records, credentials, tasks, Discord configuration, and both legal documents.
- Develop in security/privacy-hardening; no live migration, purge, login, commit, push, or merge.
- Require Manage Roles for all editorial commands, as selected by the owner.
- New managed logs: 1 MiB rotation, 30-day retention, maximum 32 files.
- DPAPI unavailable or wrong-account decryption must fail closed, never use plaintext fallback.
- Plan execution is authorized by the owner's 'Approve design and implement' response; proceed inline.

## Review Focus

- Malformed/unreadable data must never be replaced by an empty default.
- Older backups must not resurrect deleted subjects or reuse submission identifiers.
- Raw child stdout/stderr must never bypass application logging safeguards.
- Member cache minimization must preserve complete reset enumeration.
- Revoked permissions during reset confirmation must prevent changes.

## Task 1: Encrypted persistence

Files: src/secure-storage.js, scripts/dpapi.ps1, src/submissions.js, src/contributor.js,
test/secure-storage.test.js, test/helpers/storage.js; adapt persistence fixtures.
Interfaces: createStore({protect,unprotect,restrict}) -> readJson/writeJson/readBytes/writeBytes;
default store uses DPAPI; test-only injected codec never acts as a runtime fallback.

- [x] Write failing tests for ciphertext persistence, plaintext refusal, decryption failures,
  malformed envelopes, atomic replacement, reparse-point refusal, and unchanged record fields.
- [x] Run targeted tests RED; implement and run GREEN.
- [x] Run genuine synthetic DPAPI integration outside sandbox, plus full existing suite.

## Task 2: Logging and retention

Files: src/safe-log.js, scripts/operational-logging.ps1, run-wren.ps1, test/logging.test.js,
test/runner-logging.test.ps1, test/runner.test.js.
Interfaces: emit(event,error?) writes fixed-schema JSON; validateEvent regenerates allowed
fields only. Windows Write-WrenEvent and Receive-WrenEvent implement rotation and filtering.

- [x] Seed secrets, personal text, body/URL fields and unexpected stdout/stderr in failing tests.
- [x] Exercise real rotation at byte/date/age/count boundaries and arbitrary malformed lines.
- [x] Implement allowlists in both layers, remove all raw error logging and raw reply failures.
- [x] Run targeted and full suite GREEN, including supervised stub restart and parent cleanup.

## Task 3: Authorization and caching

Files: src/access.js, src/client-options.js, src/index.js, src/contributor-discord.js,
test/access.test.js, test/cache.test.js, existing command tests.
Interfaces: isStaff(interaction,guildId,channelId); createClientOptions(); recheck confirming member.

- [x] Write failing tests for unauthorized reads/writes, denied/revoked reset confirmation,
  and application behavior with real SDK nonretaining member caches.
- [x] Apply command defaults and runtime checks; add top-level safe handler dispatch.
- [x] Implement cache-disabled individual fetches and complete reset collection handling.
- [x] Run targeted and full suite GREEN, including quotes/announcements and all existing tests.

## Task 4: Maintenance and deletion

Files: src/maintenance.js, scripts/privacy-maintenance.js, scripts/privacy-maintenance.ps1,
test/maintenance.test.js. Backup/journal payloads encrypted; CLI subject arrives over stdin.
Interfaces: inspect/migrate/backup/restore/erase operate on explicit root; previews default;
apply requires stopped process-tree preflight and explicit acknowledgement. Output counts only.

- [x] Write failing tests for migration equivalence, encrypted original-byte recovery,
  backup/restore, author removal and editor/staff redaction, high-water identifiers, replay
  deletion decisions after restoring an old backup, partial failures and inaccessible copies.
- [x] Ensure preflight examines complete selected storage/backup inventory before writes;
  pending deletion journal is completed idempotently before runtime or restore can proceed.
- [x] Implement fail-closed startup validation before token access/login.
- [x] Run targeted and full suite GREEN; never run apply against production.

## Task 5: Documentation and final review

Files: README.md, docs/privacy-operations.md, docs/startup-migration.md, approved design copy.

- [x] Document exact commands, migration downtime, encryption account dependence, recovery,
  historical backup gaps, manual identity checks, Discord-side deletion, and staged deployment.
- [x] Verify all JS syntax, PowerShell parsing, full tests, actual synthetic Windows integration,
  legal/production hashes, Git diff and absence of raw error output.
- [x] Obtain one fresh read-only whole-change review; fix material issues with regression tests.
- [x] Deliver the isolated worktree and reviewable patch; leave deployment and purge unperformed.
