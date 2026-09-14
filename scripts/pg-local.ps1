param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'init')]
  [string]$Command = 'status'
)

$ErrorActionPreference = 'Stop'
$pgBin = Join-Path $env:LOCALAPPDATA 'pgsql\pgsql\bin'
$pgData = Join-Path $env:LOCALAPPDATA 'pgsql\data'
$logFile = Join-Path $env:LOCALAPPDATA 'pgsql\postgres.log'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'

if (-not (Test-Path $pgCtl)) {
  Write-Error "PostgreSQL portable not found at $pgCtl"
}

function Get-PgStatus {
  & $pgCtl -D $pgData status
  return $LASTEXITCODE
}

switch ($Command) {
  'start' {
    $code = Get-PgStatus
    if ($code -eq 0) {
      Write-Host 'PostgreSQL is already running.'
      exit 0
    }
    & $pgCtl -D $pgData -l $logFile start
    exit $LASTEXITCODE
  }
  'stop' {
    & $pgCtl -D $pgData stop -m fast
    exit $LASTEXITCODE
  }
  'status' {
    Get-PgStatus | Out-Host
    exit $LASTEXITCODE
  }
  'init' {
    if (Test-Path $pgData) {
      Write-Host "Data directory already exists: $pgData"
      exit 0
    }
    $pwFile = Join-Path $env:TEMP 'pgpass-init.txt'
    Set-Content -Path $pwFile -Value 'postgres' -NoNewline -Encoding ascii
    $initdb = Join-Path $pgBin 'initdb.exe'
    & $initdb -D $pgData -U postgres -A scram-sha-256 --pwfile=$pwFile -E UTF8 --no-locale --locale=C
    Remove-Item $pwFile -ErrorAction SilentlyContinue
    $conf = Join-Path $pgData 'postgresql.conf'
    (Get-Content $conf) -replace "^#?listen_addresses\s*=.*", "listen_addresses = 'localhost'" | Set-Content $conf
    exit $LASTEXITCODE
  }
}
