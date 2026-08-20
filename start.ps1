$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceUrl = 'http://127.0.0.1:3000'
$entryUrl = "$serviceUrl/admin"
$healthUrl = "$serviceUrl/api/health"
$packagePath = Join-Path $projectRoot 'package.json'

try {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    $expectedVersion = [string]$package.version
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($pnpmCommand) {
        $packageManager = $pnpmCommand.Source
        $startArguments = @('dev')
    } else {
        $npmCommand = Get-Command npm.cmd -ErrorAction Stop
        $packageManager = $npmCommand.Source
        $startArguments = @('run', 'dev')
    }
    Set-Location -LiteralPath $projectRoot

    $runningHealth = $null
    try {
        $runningHealth = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    } catch {
        # No service is running. Continue with a fresh start.
    }

    if ($runningHealth -and $runningHealth.ok -eq $true -and [string]$runningHealth.version -eq $expectedVersion) {
        Start-Process $entryUrl
        Write-Host "Application is already running (v$expectedVersion)." -ForegroundColor Green
        exit 0
    }

    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $commandLine = [string]$processInfo.CommandLine
        if ($commandLine -notmatch 'yaxin-main' -or ($commandLine -notmatch 'next' -and $commandLine -notmatch 'pnpm')) {
            throw 'Port 3000 is already used by another application.'
        }

        Write-Host "Updating the old application to v$expectedVersion..." -ForegroundColor Yellow
        $staleServers = Get-CimInstance Win32_Process | Where-Object {
            ([string]$_.CommandLine) -match 'yaxin-main' -and (([string]$_.CommandLine) -match 'next' -or ([string]$_.CommandLine) -match 'pnpm')
        }
        foreach ($staleServer in $staleServers) {
            Stop-Process -Id $staleServer.ProcessId -Force -ErrorAction SilentlyContinue
        }

        $deadline = (Get-Date).AddSeconds(8)
        do {
            Start-Sleep -Milliseconds 250
            $stillListening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        } while ($stillListening -and (Get-Date) -lt $deadline)
        if ($stillListening) {
            throw 'The old application did not stop within 8 seconds.'
        }
    }

    Write-Host "Starting the application v$expectedVersion..." -ForegroundColor Cyan
    & $packageManager @startArguments
    if ($LASTEXITCODE -ne 0) {
        throw "The server exited with code $LASTEXITCODE."
    }
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
