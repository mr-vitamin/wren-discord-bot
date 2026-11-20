# Wren privacy hardening design

Date: November 18, 2026. Status: approved by the owner; implemented in the isolated development checkout.

## Purpose and boundaries

Implement the eight requested safeguards while preserving Contributor participation and resets,
editorial tracking, quotes, announcements, record identifiers, token setup, and Windows startup.
Do not change either legal document, transmit private records, rotate credentials, restart the
production task, or delete any existing production data during implementation and testing.
The owner selected Manage Roles as the requirement for all editorial commands.

## Approaches

Use Windows CurrentUser DPAPI, which the existing token setup already uses. Its synthetic
round-trip was verified outside the restricted sandbox. Encrypt records directly through a
hidden PowerShell helper using standard input/output pipes, never command-line data. This adds
no external service or independently managed encryption key. The cost is dependence on the
original Windows account/profile and its recovery arrangements.

BitLocker alone is unsuitable as the implementation dependency because its status could not
be verified here and volume encryption does not replace record access controls. Introducing
a portable encryption key would add key storage, recovery, and rotation requirements that this
locally hosted Windows bot does not currently need. Host disk encryption remains recommended
defense in depth and must be checked separately by the operator.

## Storage and recovery

- Introduce a versioned, strictly validated DPAPI JSON envelope. Keep existing record fields
  and submission identifiers intact. All normal writes, including atomic temporary files,
  must contain ciphertext. No plaintext or alternate-key fallback after decryption failure.
- Use exclusive temporary creation, atomic replace, failure cleanup, and restricted Windows
  ACLs for managed directories/files. Do not follow reparse points outside the selected root.
- Implement migration as a separate operator tool: inspect/dry-run by default, require an
  explicit apply option and proof the exact bot process tree is stopped before conversion.
  It must create encrypted rollback copies of the original bytes and verify decrypted
  equivalence before replacement. Never overwrite the existing bot token.
- Do not run migration against production in this task. New code must clearly refuse
  unmigrated plaintext storage before logging in, rather than silently convert live records.
- Include backup creation/verification and restore tooling for managed encrypted backups.
  A restored backup must preserve submission ID allocation and current deletion decisions.
  Recovery under another machine/account requires a separately verified secure transfer
  under the original account; copying the encrypted files alone is not sufficient.
- Inventory historical backups and legacy installations separately. Unknown/inaccessible
  locations remain explicit gaps. Do not claim old plaintext backups were protected merely
  because future backups are encrypted. Document an explicit approved conversion procedure.

## Logging

- Emit structured events from a fixed allowlist: event name, timestamp, numeric Discord
  error/status code where appropriate, aggregate counts, and process exit status.
- Do not serialize errors, messages, stacks, request bodies, URLs, Discord IDs, display
  names, tokens, command options, or arbitrary exception strings into operational logs.
- Cover all handlers, client errors, startup failures, unhandled rejections, and launcher
  failures. User-facing replies must not echo raw system/Discord failures.
- The Windows runner must validate/regenerate approved structured events and discard
  arbitrary child stdout/stderr. Sanitizing only explicit console.error calls is insufficient.
- Use a new managed log location so the rollout does not delete/rotate historical logs.
  Rotate at 1 MiB or a date boundary. Keep at most 30 days and 32 files, enforcing both bounds.
  Expiry applies to new managed logs after deployment; tests use disposable fixtures only.
- Legacy logs require their own encrypted archival and eventual approved disposal process.

## Legitimate deletion requests

- Add an offline operator command that defaults to dry-run and never connects to Discord.
  Accept the subject ID via hidden prompt or stdin, not a command-line argument or log.
- The operator verifies the requester's identity/authority before applying anything.
- Remove records authored by the subject. For other authors' records, clear the subject's
  editor/submitting-staff reference, preserving unrelated editorial work. Maintain a high-water
  mark so deletion cannot cause old WP identifiers to be reused.
- Inspect and transform all explicitly registered encrypted backups as well as active data;
  inaccessible, unrecognized, legacy plaintext, and external copies must be reported as
  unresolved. Never report complete deletion when any selected location failed.
- Require explicit apply, stopped-bot checks, and encrypted recovery/journal state. Account
  for partial failures, repeatability, and restore: an older backup must not resurrect data
  already deleted. Keep any necessary suppression metadata encrypted and purpose-limited.
- No deletion applies to production in this task. Do not silently enable a production purge.
- Document checking legacy logs for identifiers and free-text personal information; deleting
  whole approved log files may be necessary. No tool can reliably infer every personal
  reference in arbitrary text. New operational logs should contain none of these fields.
- Discord quotes, channel replies, role state, announcements, and Discord's independent
  records require a separate moderator/Discord process. This offline tool must not claim to
  remove them. Record unresolved message links in the operator's private request workflow.

## Caching and authorization

- Require correct guild, staff channel, and Manage Roles on every /sub operation, including
  reads, plus the existing Contributor admin checks. Set command defaults consistently.
- Recheck the confirming member's authorization before a destructive Contributor reset.
- Preserve Guilds and GuildMembers intents; full resets still fetch current membership.
  Disable unnecessary persistent user/member/message caches while keeping required guild,
  channel, role, and bot-member state. Fetch individual members with cache disabled.
  Test the real SDK's member-chunk behavior: full reset collections must still include all
  fetched members even when manager caches do not retain them.
- Do not introduce Message Content or Presence access. Do not change actual Discord role
  permissions, channel configuration, role hierarchy, or application portal settings.

## Implementation and verification

After approval, prepare an isolated checkout beneath the already ignored work directory so
live source remains unchanged; no push, merge, deployment, or task restart. Write behavioral
tests before implementation, then run the full suite. No new runtime dependency is planned.

Verify encryption/decryption with synthetic records, malformed envelopes, denied/wrong-user
decryption, atomic failure paths, migration equivalence, and encrypted backup/restore. Exercise
actual Windows DPAPI outside the sandbox using synthetic files only. Refuse production
fallback when Windows DPAPI is unavailable in the sandbox or on a non-Windows host.

Test seeded secret/PII errors through application and runner logging, arbitrary stderr,
rotation/time/size limits, deletion previews/applies/partial failures/restore, permission
denials, revoked reset permissions, real SDK caching behavior, and all existing features.
Verify scheduled-operation supervision with a stub child, without a real Discord login.
Keep legal files and production record hashes unchanged; log growth from the running bot
is external activity, not evidence of an implementation write.

Update README and internal security, retention, deletion, backup, migration, and rollback
instructions. Clearly distinguish tested code from safeguards not yet active in production.

## Deployment checkpoint

Before a production cutover, explain exact changed paths, scheduled-account requirements,
expected interruption, encrypted backup location, conversion steps, recovery test, and rollback.
The owner must separately approve any live interruption/conversion. Verify the entire old
process chain stopped before file replacement, migrate under the existing account, start only
one bot, and check readiness and controlled live commands. Existing inaccessible backups,
BitLocker status, portal permissions, real staff membership, mailbox handling, and Discord-side
deletion remain manual verification items. No compliance claim follows from tests alone.
