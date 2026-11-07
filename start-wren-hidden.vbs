Option Explicit
Dim shell, files, root, powershell, runner, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
runner = files.BuildPath(root, "run-wren.ps1")
command = Chr(34) & powershell & Chr(34) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & runner & Chr(34)
shell.CurrentDirectory = root
' Wait so Task Scheduler continues supervising the entire bot process tree.
WScript.Quit shell.Run(command, 0, True)
