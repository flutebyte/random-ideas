# Registers a Task Scheduler task that starts the agent at logon and restarts it on failure.
# Run once from an elevated or normal PowerShell:  powershell -File scripts\install_task.ps1
# Secrets (ANTHROPIC_API_KEY, TELEGRAM_*, KMD_IMAP_*) must be set as USER environment variables.
$root = Split-Path -Parent $PSScriptRoot
$py   = (Get-Command pythonw.exe).Source
$action   = New-ScheduledTaskAction -Execute $py -Argument "-m kmd run" -WorkingDirectory $root
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
            -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "kmd-job-agent" -Action $action -Trigger $trigger -Settings $settings -Force
Write-Host "Installed. Start now with: Start-ScheduledTask -TaskName kmd-job-agent"
