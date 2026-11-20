# Complete recovery coverage

Prepared November 18, 2026. This is an operator procedure, not a claim that a production
backup exists or has passed a machine-loss restore. Do not execute capture, imaging, migration
or restoration against production without the owner's explicit authorization.

## Two recovery layers

The existing `.wren` maintenance snapshots cover editorial/issue records. They deliberately
do not restore an older privacy ledger. They are useful for operational restore when the
current authoritative ledger is intact; they are not a complete machine-loss recovery set.

Prepare both layers below. Do not replace them with a manual master-key export.

| Layer | Required contents | What it recovers |
|---|---|---|
| Coherent application checkpoint | Entire `data/` including `privacy-state.json`, `privacy-initialized.json`, submissions and issue files; managed snapshots; every registered backup location; unchanged encrypted `token.dat`; reviewed source archive, lockfile, Node version; private task definition/permissions and checksum manifest | Application loss, current deletion decisions, issue generation and identifier allocation |
| Protected Windows volume/system image | All critical OS volumes plus the complete volume containing the production Windows user profile and Wren, using a supported VSS-aware Windows backup process | Windows account/profile and DPAPI protection context, system configuration and runtime dependencies |

On this installation the application and current profile are on C:. DPAPI depends on the
current user/profile context. A newly created account with the same visible name is not proof
of compatibility. The original token loader and new record-encryption helper must both work
under the recovered identity. SYSTEM-only backup or `-systemState` alone is not sufficient:
Microsoft documents that system-state backup does not include user registry hives.

Never copy decrypted tokens, account passwords, private keys, raw DPAPI master keys or recovery
passwords into project folders, logs, ZIP attachments, tickets, email or an unencrypted drive.
No such export was performed during preparation. Back up the protection context through the
approved protected system/volume image, and test it in an isolated recovery environment.

## Destination and access prerequisites

The owner must select a dedicated external backup target. A directory on the same C: disk
does not protect against loss of that disk. Do not assume that source BitLocker encryption
automatically protects backup media or image contents.

An administrator must verify source and destination status with read-only commands. R: below
is an EXAMPLE, not an identified or approved device:

```powershell
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod, LockStatus
Get-BitLockerVolume -MountPoint 'R:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod, LockStatus
```

Do not write recovery material until the selected destination is confirmed protected and
unlocked, with adequate free space and access restricted to the owner/SYSTEM or an explicitly
approved backup principal. The destination must not be a source volume. Use a new checkpoint
directory; do not overwrite an older checkpoint or let insufficient space silently trigger
unreviewed backup retention. Record the approved destination privately. Store the destination's
unlock/recovery material through an approved separate secure method, not beside the backup.
Do not print recovery keys to prove that this prerequisite was met.

## Coherent application checkpoint — approved window only

1. Disable automatic starts and stop only Wren after authorization. Verify its complete
   process chain exited; retain the disabled legacy task and installation. An old pre-hardening
   process does not honor the new storage mutex.
2. Acquire the hardened operation lock for the intended root while capturing the set. Check
   that maintenance is complete, required data files exist, and there are no unresolved `.tmp`
   files. Take the checkpoint after successful conversion and before restart. Refuse reparse
   points, files changing during copy, and unknown/unreadable registered backup locations.
3. Create a NEW private destination on the verified protected target. Set access restrictions
   before writing. Copy the encrypted files intact; do not decrypt records or the bot token.
   Include all of `data/`, not just its two original record files. Preserve the latest ledger
   even though it is not part of the maintenance snapshot payload.
4. Copy managed snapshots and enumerate registered backup roots from the encrypted state
   privately. Include them or explicitly record an unresolved location. Do not treat historical
   plaintext archives as automatically converted by copying the new application state.
5. Record the exact reviewed code version/artifact digest and create a tracked-source archive.
   If the update is uncommitted, preserve BOTH the base source archive and the exact applied
   patch; an archive of old HEAD alone does not contain the update. If committed, archive the
   reviewed commit. Do not copy `.git` configuration/credential stores. Preserve the lockfile and runtime version.
   A system image provides the installed runtime/dependency fallback; otherwise prove those
   can be installed offline. Keep task definition/access metadata private.
6. Compute source/destination hashes without printing contents. Re-read source hashes after
   capture. Every byte must match and the checkpoint must contain the current ledger,
   initialization marker, active data, token ciphertext and all declared snapshots.
7. Create a random DPAPI canary under the production account using the same record helper;
   retain only its encrypted blob and a comparison digest in the protected checkpoint. This
   canary contains no credentials or user content. Include it in the paired Windows image
   recovery proof; a canary alone is not a profile backup.
8. Restore a checkpoint COPY to a NEW protected test directory. Never run the bot entry point
   or enable network access there. Verify `assertReady`, exact issue state, deletion generation,
   allocation watermark, token-ciphertext hash and snapshot validation under the same account.
   A newer checkpoint must be taken after subsequent legitimate deletion/administrative state
   changes. A stale ledger is not authoritative merely because its backup is internally valid.

Capture tooling/procedure must hold the lock through the final source recheck. Do not perform
an unconstrained recursive copy of a running installation. No production capture was executed
in this preparation; the end-to-end checkpoint rehearsal uses disposable synthetic data.

## Windows image — administrator and backup authorization required

The native `wbadmin.exe` tool is available on this machine. The following is a prepared manual
command, NOT a command already executed. Replace R: with the approved protected target first.
Check existing backup products and the time required; capturing a full image while Wren is
stopped can extend the maintenance window substantially.

```powershell
wbadmin start backup -backupTarget:R: -include:C: -allCritical -vssCopy
```

Use a complete C: volume image so the user profile is included, not just critical/system-state
components. Add a relocated profile/application volume if this installation changes. This
command starts a backup, writes to the destination, uses VSS and prompts for confirmation;
it is NOT a read-only check. It must not be run as part of today's read-only preparation.
Do not add `-quiet`, credential arguments, log-truncating full-backup options, or deletion flags.

After an authorized backup, inspect its catalog with read-only commands:

```powershell
wbadmin get versions -backupTarget:R:
wbadmin get items -version:VERSION_FROM_CATALOG -backupTarget:R:
```

Use the actual returned version identifier, not an invented date. Confirm the required volumes
and recovery capabilities. A catalog listing and exit code alone do not prove successful
recovery. If Windows Backup is unavailable for the target configuration, use an equivalently
protected supported full-image solution and document its restore procedure before sign-off.

## Machine-loss acceptance

Recover a copy in Windows Recovery Environment or an isolated test machine/VM. Keep its
network disabled and disable Wren's startup task in the recovered copy before normal network
access; otherwise a restored task could create a duplicate Discord session. Never test a
restored token by starting a second production bot.

Recover the backed-up Windows identity/profile and the latest coherent application checkpoint.
Verify the synthetic DPAPI canary without printing its plaintext. Then validate encrypted
application records and current ledger metadata; token compatibility may be checked locally
without printing it or logging in. Reconcile the latest deletion request history before
accepting a ledger restored from an older image. Do not let image age undo a deletion.

Only a successful recovery test can close the Windows-profile/machine-loss gap. The current
session verified profile-component presence and same-account application recovery, not an
actual Windows image restore. Recovery media, target selection and a tested independent
profile/system image still require manual action.

## Backup retention and deletion scope

Full application checkpoints, canaries and system images must be inventoried alongside
managed snapshots. The bot's deletion tool cannot modify arbitrary disk images, unregistered
folders or unknown archive formats. Do not register them as recognized `.wren` data snapshots
or claim automated per-user erasure for them.

For a legitimate request, scrub active/recognized data using the approved procedure, create
and verify a new protected checkpoint, and separately authorize retirement/sanitization of
affected old images/checkpoints where appropriate. Retention obligations and unresolved copies
must be recorded; do not mark deletion complete while relevant copies remain unreviewed.
No existing recovery material is automatically deleted by this preparation.

## Primary references

- [Windows DPAPI and profile requirements](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=netframework-4.8)
- [Full backup command and VSS copy semantics](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wbadmin-start-backup)
- [Backup catalog inspection](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wbadmin-get-versions)
- [System-state backup omits user registry hives](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wbadmin-start-systemstatebackup)
