param([Parameter(Mandatory=$true)][string]$Helper,[Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'CI only'}
# Exercise the production helper with a real task, but fail the deletion API.
# Elevated CI can delete a task despite the attempted per-task DELETE denial.
$backend=Microsoft.PowerShell.Utility\New-Object -ComObject 'Schedule.Service'
$backend.Connect()
$folder=[pscustomobject]@{Backend=$backend.GetFolder('\')}
$folder | Add-Member -MemberType ScriptMethod -Name GetTask -Value {param($name) $this.Backend.GetTask($name)}
$folder | Add-Member -MemberType ScriptMethod -Name DeleteTask -Value {
  param($name,$flags)
  if($name -ne 'YourSQL Daily Reminder' -or $this.Backend.GetTask($name).Enabled){throw 'Expected the target task to be disabled before deletion'}
  throw [UnauthorizedAccessException]::new('Injected task deletion denied')
}
$script:deniedScheduler=[pscustomobject]@{Folder=$folder}
$script:deniedScheduler | Add-Member -MemberType ScriptMethod -Name Connect -Value {}
$script:deniedScheduler | Add-Member -MemberType ScriptMethod -Name GetFolder -Value {param($name) $this.Folder}
function New-Object {
  param([string]$ComObject)
  if($ComObject -eq 'Schedule.Service'){return $script:deniedScheduler}
  Microsoft.PowerShell.Utility\New-Object -ComObject $ComObject
}
& $Helper -InstallDirectory $InstallDirectory
exit $LASTEXITCODE
