param(
  [Parameter(Mandatory = $true)] [string]$StagingDbUrl,
  [Parameter(Mandatory = $true)] [string]$SnapshotDirectory,
  [string]$SanitizedSeedFile = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$snapshotRoot = [System.IO.Path]::GetFullPath($SnapshotDirectory)

if ($snapshotRoot.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'SnapshotDirectory must be outside the repository.'
}
if ($StagingDbUrl -notmatch '^postgres(?:ql)?://') {
  throw 'StagingDbUrl must be a PostgreSQL connection URL.'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql is required. Install the PostgreSQL client first.'
}

New-Item -ItemType Directory -Force -Path $snapshotRoot | Out-Null
$schemaFile = Join-Path $snapshotRoot 'production-schema.sql'

Push-Location $repoRoot
try {
  & npx supabase db dump --linked --schema public,private --keep-comments --file $schemaFile
  if ($LASTEXITCODE -ne 0) { throw 'Schema dump failed.' }
  & psql $StagingDbUrl -v ON_ERROR_STOP=1 -f $schemaFile
  if ($LASTEXITCODE -ne 0) { throw 'Staging schema restore failed.' }

  if ($SanitizedSeedFile) {
    $seedPath = (Resolve-Path -LiteralPath $SanitizedSeedFile).Path
    & psql $StagingDbUrl -v ON_ERROR_STOP=1 -f $seedPath
    if ($LASTEXITCODE -ne 0) { throw 'Sanitized seed failed.' }
  }

  foreach ($migration in @(
    'supabase\migrations\20260820234029_production_foundation_v1.sql',
    'supabase\migrations\20260821022816_math_content_database_v2.sql'
  )) {
    & psql $StagingDbUrl -v ON_ERROR_STOP=1 -f $migration
    if ($LASTEXITCODE -ne 0) { throw "Migration rehearsal failed: $migration" }
  }

  & npx supabase test db --db-url $StagingDbUrl supabase/tests
  if ($LASTEXITCODE -ne 0) { throw 'Staging pgTAP suite failed.' }
  Write-Output 'STAGING_BOOTSTRAP_RESULT=pass'
  Write-Output "SCHEMA_SNAPSHOT=$schemaFile"
  Write-Output 'PRODUCTION_DATA_EXPORTED=false'
}
finally {
  Pop-Location
}

