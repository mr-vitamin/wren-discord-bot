# Contributor, help, and presence activation

Reusable procedure for the November 22, 2026 update. Private production verification
records remain local. Following these instructions requires approval for each activation.

## Expected behavior

- Announcing while an issue is open gives an actionable response. Unexpected failures
  retain the sanitized generic response.
- Members voluntarily obtain or withdraw Contributor through the current announcement.
  Closing preserves Contributor roles; staff explicitly reset them when intended.
  Announcing does not automatically assign or remove roles.
- Closing invalidates old controls in saved state even if the old message cannot be
  edited. Announcing after closure creates a fresh generation through the existing
  workflow; no manual edit of the closed issue is necessary.
- `/help` uses the same command list as startup registration and includes all staff
  commands for every viewer. Presence is Online / Playing `/help | vtmnarchive.com`.

## Focused validation

The pre-deployment focused run passed **22 tests**, with no failures or skips, plus
both syntax checks. This covers the Contributor lifecycle, missing announcement,
old dropdown rejection, role preservation, help visibility, and login presence.

Run under the existing Windows account, using temporary synthetic records:

```powershell
node --check src/contributor-discord.js
node --check src/index.js
node --test test/contributor-workflow.test.js test/contributor-discord.test.js test/contributor.test.js test/cache.test.js test/help.test.js test/presence.test.js
```

No live announce, close, reset, or dropdown action is part of these tests.

## One production activation, after owner approval

1. Review the pending source changes in this checkout. Keep the same token, data,
   server/channel IDs, role, task account, task settings, logs, and backup setup.
   No storage migration, dependency installation, or separate registration script
   is required for this update. Do not apply the older privacy-migration checklist.
2. Agree a brief pause in staff commands. Stop only the existing task:

   ```powershell
   Stop-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
   ```

3. Verify this installation's launcher, runner, Node child, and storage-lock helper
   have exited by their exact paths/process chain. If any remain, stop and investigate;
   do not start another copy or terminate unrelated Node processes.
4. Start the existing task once:

   ```powershell
   Start-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
   ```

5. Confirm one Wren process chain and a fresh `ready` event. Startup registers
   `/quote`, `/sub`, `/contributor`, and `/help` together in the configured server
   and supplies the configured presence on login.
6. Verify Online / Playing `/help | vtmnarchive.com`, then run the read-only `/help`
   command as a regular member. It must reply publicly with all commands and labels.
   Confirm the pre-activation issue state is preserved. Do not announce a new issue
   or reset roles as a deployment test.

If startup or registration fails, do not repeatedly restart or alter records. Report
the sanitized failure and agree a correction before another activation attempt.
