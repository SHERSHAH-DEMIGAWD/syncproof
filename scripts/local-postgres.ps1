param(
    [ValidateSet('Start', 'Stop')][string]$Action = 'Start',
    [ValidateRange(1024, 65535)][int]$Port = 55432,
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localRoot = Join-Path $projectRoot '.local'
$dataPath = Join-Path $localRoot 'pgdata'
$logPath = Join-Path $localRoot 'postgres.log'
$control = Join-Path $PostgresBin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $control)) { throw 'PostgreSQL binaries not found; set -PostgresBin.' }

if ($Action -eq 'Stop') {
    if (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION')) {
        & $control -D $dataPath status *> $null
        if ($LASTEXITCODE -eq 0) {
            & $control -D $dataPath -m fast -w stop
            if ($LASTEXITCODE -ne 0) { throw 'Could not stop the project-owned cluster.' }
        }
    }
    return
}

New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    # This is an isolated local educational cluster, never a shared server.
    # Trust authentication permits local processes to connect: bind loopback
    # only and use synthetic data. Use an external password-auth DB if needed.
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataPath -U syncproof --auth-local=trust --auth-host=trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed; no data directory was removed or overwritten.' }
}
& $control -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
    & $control -D $dataPath -l $logPath -o "-h 127.0.0.1 -p $Port" -w start
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the project-owned cluster. Check port availability and .local/postgres.log.' }
}
$sql = Join-Path $PostgresBin 'psql.exe'
foreach ($databaseName in @('syncproof_dev', 'syncproof_test')) {
    $present = & $sql -w -h 127.0.0.1 -p $Port -U syncproof -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='$databaseName'"
    if ($LASTEXITCODE -ne 0) { throw 'Database readiness check failed.' }
    if ($present -ne '1') {
        & (Join-Path $PostgresBin 'createdb.exe') -w -h 127.0.0.1 -p $Port -U syncproof $databaseName
        if ($LASTEXITCODE -ne 0) { throw "Could not create $databaseName." }
    }
}
Write-Output "Project PostgreSQL ready on 127.0.0.1:$Port. Existing system services were not changed."
