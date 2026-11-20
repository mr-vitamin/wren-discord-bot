# Privacy and security operations

This document describes the hardened implementation. It is not a Privacy Policy, Terms of
Service, or a statement that a running installation has been migrated or is compliant.
The original legal documents are deliberately unchanged and must be reviewed separately.

## Data and safeguards

Wren processes interaction identities/options, user/display names, role memberships,
server/channel/message identifiers and available Discord SDK metadata. Quotes and announcements
are sent to Discord. Editorial records persist author/editor/submitting-staff IDs, titles,
optional Discord links, statuses and timestamps. The issue file contains announcement state,
not a participant roster. Contributor roles remain on Discord. Wren does not monitor ordinary
messages, retrieve manuscripts from links, or integrate a separate analytics/database service.

`data/submissions.json`, `data/contributor-issue.json`, and `data/privacy-state.json` use
versioned CurrentUser DPAPI envelopes. Ciphertext is written before any temporary file is
created; successful writes replace atomically. The data directory and resulting files receive
a protected DACL granting the current Windows account and SYSTEM access. Other users of the
same account and administrators with appropriate system privileges remain part of the threat
model. DPAPI is not a defense against compromise of the running account or its process memory.

`privacy-state.json` retains encrypted deletion fingerprints, the identifier high-water mark,
registered backup roots, required-file markers, deletion generations and interrupted-operation recovery state. Fingerprints are still
purpose-limited pseudonymous information, not a claim of anonymization. They prevent old
backups from restoring deleted references. Do not replace or delete this file during restore.
Loss of the authoritative ledger blocks initialized storage; it is never silently recreated.
New first-time installations must also run the explicit migration/initialization command.
Backups and active records carry a deletion generation. A request covers records and references
present at that generation; genuinely new, authorized activity afterward remains usable. A new
request from the same person applies again. Erasure is not a permanent prohibition on using Wren.
No automatic expiry is configured for editorial records or deletion fingerprints. Review
continued necessity manually. Submission WP identifiers are never reused after deletion.

Temporary plaintext in JS/.NET memory and stdin/stdout pipes is unavoidable during processing.
Payloads never appear in process arguments. The helper clears .NET byte arrays; JavaScript
strings and OS paging/crash dumps are not guaranteed to be securely erased. Check host disk
encryption, crash-dump access, account protection, and backup/sync configuration separately.

No runtime environment variable enables plaintext storage or changes keys. Helpers use a
process-local ExecutionPolicy Bypass to execute this repository's fixed PowerShell scripts,
as the existing Windows launcher does; they do not change the host execution policy.

## Logging and retention

Application output uses fixed event names and optional bounded numeric error/status codes.
No error objects, messages, stack traces, request bodies, URLs, IDs, names, command inputs,
interaction tokens or credentials are intentionally retained. The runner discards arbitrary
stdout and stderr, parses allowed events, and generates its own UTC timestamps. This also
filters an unexpected SDK or runtime diagnostic. Running `node src/index.js` without the
runner lacks this extra stream boundary; use the supervised launcher for production.

New logs are written only beneath `logs/operational/`. Files rotate at 1 MiB or UTC date change;
each write and a once-per-minute supervisor check prune files older than 30 days and keep at
most 32 managed files. Quiet running bots are pruned too. Expiry does not run while the bot is
stopped, so inactive disks may retain old files until the next start/event. Files outside the managed naming pattern are not automatically removed. These new
logs contain operational codes rather than user-linked Discord API records.

Existing `logs/wren.log`, legacy logs and old copies are not rotated, sanitized or deleted by
this change. Inventory them separately. They may contain personal content and must not be
sent through an online log viewer or copied into a public issue.

## Deployment and migration: separate approved interruption

Do not replace the live entry point or runner while the old bot is running. Deploy this
branch only after reviewing its exact diff, intended paths and recovery arrangements.

1. Under the Windows account that runs Wren, confirm available host encryption and inventory
   active data, old installations, `work/startup-cutover`, external copies, logs, sync folders,
   and backups. This code cannot discover every off-machine copy. Do not loosen ACLs to read
   a protected backup; use its owning account or record the coverage gap.
2. Approve a maintenance window. Disable Wren's trigger/restart path, stop the exact task,
   and verify its entire launcher/PowerShell/Node chain stopped. Keep the existing task
   definition, token, role/channel configuration and rollback installation.
3. Deploy the reviewed source/scripts. From the intended installation root, preview:

   ```powershell
   node scripts/privacy-maintenance.js migrate
   ```

4. Only after approval, under the same account, convert:

   ```powershell
   node scripts/privacy-maintenance.js migrate --apply
   node scripts/privacy-maintenance.js inspect
   ```

   `migrate` validates records, creates and decrypt-verifies encrypted original-byte recovery
   snapshots under `backups/managed/`, then converts the live files and writes encrypted
   maintenance state. Original submission fields and issue controls are preserved. It never
   reads or replaces `token.dat`. Failures do not fall back to plaintext. Old code cannot
   read the new envelopes; rollback therefore requires deliberate recovery, not just replacing
   the executable. Do not convert files with a live old process, even if it appears idle.
5. Exercise encrypted backup/restore on a disposable copy before acceptance. Enable/start
   only the approved Wren task. Check an approved `ready` event in the new log location,
   exactly one process chain, and controlled live command checks. Check sign-in/reboot later.
6. Do not delete old installations, historical backups or logs as part of deploying this patch.
   Separately approve conversion/retirement after verifying recovery. Keeping these plaintext
   copies means encryption coverage remains incomplete until they are addressed.

## Backup and recovery

See [complete recovery coverage](complete-recovery-coverage.md) for the ledger-inclusive
application checkpoint and protected Windows-profile/system image, and the ordered
[production deployment checklist](production-deployment-checklist.md). A `.wren` snapshot alone
is not a full disaster-recovery set.

Preview with `node scripts/privacy-maintenance.js backup`; create with `backup --apply`
while stopped. All newly created `.wren` backups are DPAPI-encrypted and read back for
verification. `original-*` snapshots additionally preserve original bytes for pre-migration
recovery. They remain sensitive copies and are included in subsequent deletion processing.

Preview restore with `restore --backup NAME.wren`; add `--apply` only while stopped. Only
basenames from `backups/managed/` are accepted. Restore creates an encrypted pre-restore
snapshot, reapplies current deletion fingerprints, preserves the highest allocated WP number,
and restores only the data files represented in the snapshot. It never rolls back the
deletion ledger, token or Discord role/message state. Original-byte copies are available
inside the encrypted original snapshot; exporting them is a separate sensitive operator
action. Do not restore old plaintext directly into a running hardened installation.

Encrypted backups depend on the original Windows account's DPAPI profile/key material.
Copying files to another machine/account is not a verified recovery method. Verify Windows
profile/system recovery or perform a separately reviewed secure decrypt/re-encrypt transfer
under the authorized identities. Never print/export plaintext records as a recovery test.
This task does not establish off-machine disaster recovery.

Register additional directories of recognized encrypted `.wren` backups before deletion:

```powershell
node scripts/privacy-maintenance.js register-backup --directory APPROVED_DIRECTORY
node scripts/privacy-maintenance.js register-backup --directory APPROVED_DIRECTORY --apply
```

Unknown files, plaintext backups, symlinks/junctions, inaccessible directories and unsupported
formats count as unresolved. Do not move them elsewhere merely to obtain a clean result.
Inventory and protect/retire them through a separately approved process. There is no automatic
backup expiry; review ongoing recovery need and retention manually. Do not reuse old unreviewed
`work/` backup scripts: they were written for plaintext storage and are not the new backup API.

## Legitimate access/correction/deletion requests

1. Monitor the designated contact route, confirm the requester's identity/authority without
   collecting excess identity documents, identify the subject ID privately, and record any
   applicable retention obligation. This tool does not verify identity or decide legal exceptions.
2. Inventory all installations, active records, registered backups, original snapshots, historical
   logs and off-machine copies. Inspect `node scripts/privacy-maintenance.js inspect`.
3. Preview using a hidden prompt (the subject ID is not a shell argument):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/privacy-maintenance.ps1 -Operation erase
   ```

4. With the bot stopped, after verifying the request and inventory, explicitly apply:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/privacy-maintenance.ps1 -Operation erase -Apply -VerifiedRequest -InventoryConfirmed
   ```

   Author-owned records are removed. For other authors' work, editor/submitting-staff references
   matching the subject are cleared. The same transformation reaches every recognized backup
   and its original-byte recovery payload, preserving unrelated work. A deletion fingerprint
   is retained encrypted to prevent restoration of those references. Counts are displayed;
   identities, titles, tokens and paths are not printed.
5. Any inaccessible/unknown registered backup blocks apply. An interrupted write keeps encrypted
   pending state and blocks startup; fix the storage problem and repeat with `-Operation resume`
   and the same apply/verification/inventory flags. Migration/restore can also be resumed with
   `node scripts/privacy-maintenance.js resume --apply` while stopped. Do not clear pending state
   manually to force startup. A pre-restore snapshot and journal preserve the recovery choices.
6. Review legacy logs and free-text titles/messages separately. An ID search cannot find every
   reference by name or quotation. If necessary, approve disposal of entire relevant legacy
   log files and all their backups; the deletion tool intentionally does not guess at arbitrary
   text or delete unknown files. Protect legacy copies at rest in the meantime using verified
   Windows file/volume encryption or a reviewed encrypted archival workflow. Do not assume an
   ACL or Git ignore is encryption. Do not mark a request complete while these remain unresolved.
7. Use a separate moderator process for quotes, announcements, staff-channel replies, current
   roles and any personal text on Discord. Removing a local record does not remove messages.
   Refer independent Discord-held data to Discord where appropriate. The offline CLI never
   connects to Discord and cannot verify Discord-side erasure.
8. Report completion for the reviewed scope only. `registeredScopeComplete` does not mean all
   copies everywhere are gone. Keep private operational evidence of scope, counts and remaining
   exceptions without retaining the deleted content unnecessarily. Access/correction requests
   require a separately authorized private operator workflow; do not expose whole records in logs.

## Locks and failures

On Windows, runtime and applying maintenance share a named OS mutex held by a hidden helper
whose stdin is tied to the owning process. Forced termination closes the pipe and releases
the mutex; no stale persistent lock file blocks scheduled restart. Concurrent operations are
refused. Old pre-hardening processes do not honor this lock, so stopped-process
verification and disabling the old trigger remain mandatory during the first migration.

CLI failure output is intentionally generic. Use this checklist: correct Windows account,
available DPAPI profile, protected data validity, complete backup inventory, permission to inspect
processes, stopped task/process chain, no active lock, and no unfinished journal. Do not
add raw exception printing to diagnose a production failure. Encrypted `.tmp` files remaining
from a process killed during a write count as unresolved copies and block startup and deletion
completeness. Inspect them under the same account and explicitly approve recovery or disposal;
do not move them outside the inventory to obtain a clean result. Required active files may not
silently disappear: recovery preserves the independently reserved identifier watermark.

## Verification boundaries

Automated tests use synthetic records, actual Windows DPAPI, ACLs and filesystem operations,
mocked Discord HTTP boundaries, and the real SDK member chunk/cache path. A temporary hidden
launcher fixture tests restart and cleanup without a token or Discord connection. They cannot
prove live permissions, application portal settings, correct legal notices, mailbox monitoring,
another Windows account's recovery, unknown backup coverage, secure deletion from physical
media, BitLocker state, or a successful production migration. No compliance claim is made.
