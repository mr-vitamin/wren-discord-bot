# Production deployment checklist

Prepared November 18, 2026. Preparation is authorized; deployment is NOT. Runtime code has
not been changed by this follow-up. Production source, records, token and tasks remain in place.

## Completed now

- Re-ran the isolated application's 63 tests: 63 passed, zero failures/skips.
- Repeated all available read-only BitLocker checks. PowerShell, manage-bde and WMI require
  administrator access here; source volume protection remains UNKNOWN.
- Confirmed the production task/account match and presence of the current Windows profile's
  DPAPI protection directory and registry hive using metadata only. No keys were read/exported.
- Prepared [complete application and Windows-profile recovery coverage](complete-recovery-coverage.md).
- Inventoried the eight historical plaintext record copies in the private preparation report.
  Copies and the complete archive remain untouched; no protection or retirement was applied.
- Prepared the following exact cutover order. Commands in later sections are future actions,
  not evidence that those actions have happened.

The private preparation report contains the fresh recovery rehearsal and final preservation
results. Check those results before sign-off. Policy and Terms files are not edited here.

## Manual read-only BitLocker check

Open Start, search for Windows PowerShell, choose **Run as administrator**, and approve the
Windows elevation prompt. Run:

```powershell
manage-bde.exe -status C:
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod, LockStatus
```

These commands query status only. Return the selected status fields if help is needed. Do not
post recovery passwords, key exports or protector-secret output. Do not run encryption-changing
commands. If either query still fails, report the error category and leave status unverified.
Repeat the selected-field query for the proposed backup destination before using it.

## Gates before requesting a maintenance window

- [ ] Administrator verifies C: and the intended independent backup target's protection status.
- [ ] Owner approves the protected destination and coherent checkpoint/image procedure.
- [ ] A latest-ledger recovery strategy and request-history reconciliation are recorded.
- [ ] Historical plaintext archive protection/retention is decided without erasing originals.
- [ ] Actual editors have Manage Roles, and the existing server/channel configuration is confirmed.
- [ ] The complete updated artifact/source version is reviewed; changes are still isolated.
- [ ] Owner approves exact stop/integration/migration/restart actions and rollback triggers.

## Ordered cutover — explicit authorization required

1. **Freeze the intended version.** Record the updated patch digest or reviewed development
   commit and the current main/base version. Do not merge an uncommitted branch name expecting
   its working changes to be included. Keep original source, token, tasks and all historical copies.
2. **Confirm recovery prerequisites and downtime.** Approve the destination, profile/image
   procedure and expected backup duration. A local same-disk checkpoint alone is insufficient.
3. **Quiesce editorial changes.** Agree the window with the owner; no server permission or role
   changes are implied by this instruction.
4. **Disable and stop only Wren.** After approval:

   ```powershell
   Disable-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
   Stop-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
   ```

   Verify the exact root's wscript/PowerShell/Node chain exited. Keep Foxie disabled and retain
   its installation. Do not stop all Node processes. Capture final hashes and private task
   definition/access metadata while stopped; preserve the original account and task settings.
5. **Integrate the reviewed artifact into main.** Apply/merge only the approved version into
   the intended live root. Preserve `token.dat`, `data/`, `logs/`, private `work/` and backups.
   Do not use `git clean -fdx`, overwrite the task, reinstall the token or start a second copy.
   For the prepared-patch route, first verify its approval digest and, while still stopped:

   ```powershell
   git apply --check --whitespace=error work/privacy-hardening-prepared.patch
   git apply --whitespace=error work/privacy-hardening-prepared.patch
   ```

   The second command modifies the live source and must NOT be run in preparation. A real
   merge is an alternative only after the development changes have been committed/reviewed.
6. **Preview conversion from that root.**

   ```powershell
   node scripts/privacy-maintenance.js migrate
   ```

   The current inventory expects two files. If that changes, stop and review the difference.
7. **Convert only when specifically authorized.**

   ```powershell
   node scripts/privacy-maintenance.js migrate --apply
   node scripts/privacy-maintenance.js inspect
   ```

   Do not proceed if there is pending maintenance, an unresolved temporary copy, unreadable
   storage, a missing ledger or unexpected contents. Resolve the error/resume while stopped;
   do not manually clear the journal. Do not decrypt or regenerate the bot token.
8. **Verify migration invariants.** Under the same account, verify encrypted envelopes and
   ACLs, record count/IDs, issue generation/enabled state, high-water allocation and no pending
   state. Check the token ciphertext hash matches pre-cutover. Print only counts/results.
9. **Capture complete recovery coverage.** In addition to any new `.wren` data snapshot, capture
   the full coherent set including the current privacy ledger and initialization marker. Follow
   complete-recovery-coverage.md for profile/image protection and isolated acceptance. Do not
   overwrite old archives. Preserve source/destination hashes and current deletion authority.
10. **Restore a COPY to a disposable protected location.** Verify the current ledger, DPAPI
    canary, identifiers, issue state and deletion-safe restore. A newer-generation state must
    not be replaced by an older snapshot. The bot entry point must not run in the recovery copy.
11. **Start once, only after approval.**

    ```powershell
    Enable-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
    Start-ScheduledTask -TaskName 'Wren Discord Bot' -TaskPath '\'
    ```

    Confirm a fresh approved `ready` event under `logs/operational/`, one production bot chain
    and its expected mutex helper, no legacy chain, and the task's original identity/settings.
12. **Accept functionality without destructive tests.** Use an authorized `/sub summary`/read,
    verify denial for a user lacking Manage Roles, and an approved quote. Participation changes
    need an expressly approved member action. Do not announce/close/reset an issue or create
    editorial records solely as a production test. Sign-in/reboot testing needs later approval.
13. **Review disclosures and remaining copies.** Legal drafting/publication remains separate.
    Distinguish new encrypted state/log limits from historical copies, manual deletion, retained
    fingerprints and external Discord messages. Record unresolved backup/profile tests honestly.

## Rollback gates

Before acceptance, a rollback needs the stopped new chain, exact old code, verified encrypted
original-byte migration snapshot, unchanged token, and reviewed private staging destination.
The maintenance `restore` command produces hardened-format data; it does not export legacy
plaintext. Recover original bytes only under the same account with authorization, validate
hashes/legacy-reader compatibility, and copy only the exact two original data files while
stopped. Retain restrictive ACLs and every encrypted journal/snapshot. Start only the original
Wren task after permission; keep Foxie disabled.

After new editorial writes or a deletion request, do not downgrade by replaying an old record
set. Preserve/reconcile all new writes and use hardened restore with the CURRENT authoritative
ledger or a forward fix. Unknown ledger freshness is a stop condition. No rollback, journal
clearing, copying of plaintext originals or task change has been performed in preparation.
