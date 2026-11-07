# Wren startup migration

This procedure moves an existing Windows installation from the legacy `Foxie Quotes Bot` task and scripts to `Wren Discord Bot`, `start-wren-hidden.vbs`, and `run-wren.ps1`. The alternative legacy task spelling `Foxxie Quotes Bot` is also recognized by the preparation script.

**Preparation is safe while the current bot is running. Applying the migration requires the owner's approval and a controlled interruption.** A reviewed or merged pull request alone does not authorize stopping the bot or changing Windows tasks.

## Prepare without changing the running installation

Work in the updated repository under the same Windows account as the existing task. Run:

```powershell
npm ci
npm run check
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\prepare-startup-migration.ps1
```

`-ExecutionPolicy Bypass` applies only to that PowerShell process; it does not change the machine or user execution policy. If the legacy task uses the alternative spelling, pass `-LegacyTaskName 'Foxxie Quotes Bot'`.

The script checks the existing launcher action and destination files, refuses conflicting tasks, and saves a unique directory under ignored `work/startup-migration/` containing:

- `legacy-task.xml`: the original task definition for review and rollback.
- `Wren Discord Bot.xml`: the replacement definition, explicitly **disabled**.
- `migration-plan.json`: task names, source/destination directories, and observed task state. It contains no token or editorial records.

The replacement retains the executable, action context, principal, user, logon type, run level, triggers, restart behavior, and other task settings. Only the task URI/description, launcher argument, working directory, and enabled flag change. This script supports the existing interactive-user logon type; other account types require a separate review. Nothing is registered or started.

Review the generated files locally. They contain machine-specific paths and account identifiers and must stay out of Git. Keep them with private backups. Preparation does not copy credentials or synchronize live records into an older repository copy.

Also capture the original task's owner, group, and access rules for review. This reads task permissions and writes a private backup; it does not change them:

```powershell
$planDirectory = Read-Host 'Prepared migration-plan directory'
$plan = Get-Content -LiteralPath (Join-Path $planDirectory 'migration-plan.json') -Raw | ConvertFrom-Json
$taskService = New-Object -ComObject 'Schedule.Service'
$taskService.Connect()
$legacyAcl = $taskService.GetFolder('\').GetTask($plan.LegacyTaskName).GetSecurityDescriptor(7)
[IO.File]::WriteAllText((Join-Path $planDirectory 'legacy-task-sddl.txt'), $legacyAcl)
```

## Approval checkpoint

Before any live action, approve the exact source directory, destination directory, task definitions, downtime, private backup location, and rollback plan. Confirm:

1. The replacement launcher and runner passed an isolated test with a stub entry point, including restart and child cleanup, without connecting a second bot to Discord.
2. The destination can decrypt the existing token under the original Windows account without displaying it. Do not run `setup-token.ps1` or rotate the token.
3. The source task definition still matches the prepared backup. Re-run preparation if the task changed.
4. The destination is the intended updated repository. Do not delete either installation or overwrite records based only on timestamps.

## Apply only after approval

Use the paths recorded in the approved `migration-plan.json`. The following commands document the handoff; they are **not** run by the preparation script.

```powershell
$planDirectory = Read-Host 'Approved migration-plan directory'
$plan = Get-Content -LiteralPath (Join-Path $planDirectory 'migration-plan.json') -Raw | ConvertFrom-Json
$legacyName = $plan.LegacyTaskName
$newName = $plan.NewTaskName
$legacyRoot = $plan.LegacyRoot
$destinationRoot = $plan.DestinationRoot
```

1. **Disable the old trigger, then stop the old task.** Disabling first prevents a sign-in or restart trigger from launching it during the handoff. Do not unregister it yet.

   ```powershell
   Disable-ScheduledTask -TaskName $legacyName -TaskPath '\'
   Stop-ScheduledTask -TaskName $legacyName -TaskPath '\'
   ```

2. **Wait for the entire old process chain to exit.** Check the old launcher, PowerShell runner, and Node entry point by their exact source paths. A stopped task alone does not prove its Node child exited. If any remain, stop the migration and review their PIDs; never use a blanket `Stop-Process -Name node` or enable the new task while an old bot process exists. Also check the destination for a manually launched copy.

3. **Back up and synchronize private files while both copies are stopped.** Archive both folders' runtime files before resolving differences. Preserve `token.dat`, the complete `data/` directory, existing logs, and any private configuration. Use the live source's current records as authoritative only after inspecting differences privately. Copy the encrypted token with restricted access for its original Windows account and verify file hashes without printing contents. Keep all historical logs; the new runner writes to `logs/wren.log`. Do not reset identifiers, issue state, or JSON schemas. Recheck file permissions and offline token decryption after copying.

4. **Register the disabled replacement without overwriting an existing task.** Confirm no Wren task already exists. Use the approved XML under the same account; do not pass `-Force`.

   ```powershell
   $xml = Get-Content -LiteralPath (Join-Path $planDirectory 'Wren Discord Bot.xml') -Raw
   Register-ScheduledTask -TaskName $newName -TaskPath '\' -Xml $xml
   ```

   Inspect the registered task's principal, trigger, action, working directory, settings, and disabled state. XML preserves the execution principal and run level; registration permissions/ACLs must also match the approved backup. Restore and verify those rules while the new task is still disabled:

   ```powershell
   $taskService = New-Object -ComObject 'Schedule.Service'
   $taskService.Connect()
   $newTask = $taskService.GetFolder('\').GetTask($newName)
   $legacyAcl = [IO.File]::ReadAllText((Join-Path $planDirectory 'legacy-task-sddl.txt'))
   $newTask.SetSecurityDescriptor($legacyAcl, 0x10)
   if ($newTask.GetSecurityDescriptor(7) -ne $legacyAcl) { throw 'Task access rules differ; do not enable it.' }
   ```

   The flag prevents Task Scheduler from automatically adding a principal access rule. Do not grant broader access to get past a permissions error; stop and review it. Verify Node resolves to the expected executable under the scheduled account. If registration differs from the approved definition, stop here.

5. **Enable and start only the new task.** Recheck that the old task remains disabled and no old or destination bot processes are running first.

   ```powershell
   Enable-ScheduledTask -TaskName $newName -TaskPath '\'
   Start-ScheduledTask -TaskName $newName -TaskPath '\'
   ```

6. **Verify the live handoff.** Confirm one new launcher/runner/Node chain, a fresh readiness message in `logs/wren.log`, correct Discord configuration, and a controlled command check. Confirm that a repeated start does not duplicate that task. Do not infer successful connection from a Running task alone. Verify sign-in behavior at the next approved sign-in/reboot.

7. **Retire the old task only after success and approval.** Keep the original definition and private backups for rollback. The disabled legacy task and old folder remain until the new task is verified and their removal is separately approved. At that point unregister only the exact old task, and remove only files proved unused. Do not delete either project tree wholesale. Do not leave both tasks enabled.

## Rollback

If the new bot fails, disable and stop the new task, then confirm all its children have exited before considering the old task. Preserve any new runtime writes and reconcile them into the rollback installation before starting it; do not discard changes made after cutover. If the old task still exists, inspect and re-enable/start only that task. If it was removed, restore its saved definition and verify its permissions and paths first. Never enable the old task while the new bot is still running.

The updated `install-startup-task.ps1` is for a fresh installation, not this migration. It deliberately refuses a legacy task even if that task is stopped or disabled. `remove-startup-task.ps1` operates only on the root `Wren Discord Bot` task and refuses removal while it is running; it does not retire a legacy installation.

Windows references: [register a task from XML](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask), [task execution security contexts](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks), and [task security descriptors](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask-setsecuritydescriptor).
