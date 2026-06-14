param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $CliArgs
)

$repo = $env:NEXUS_REPO_PATH
if (-not $repo) {
  $repo = "C:\Github Projects\CWRaidManager"
}

if (-not (Test-Path -LiteralPath $repo)) {
  throw "Nexus repo not found: $repo. Bootstrap it with: powershell -NoProfile -ExecutionPolicy Bypass -File `"C:\Users\rgagn\.codex\skills\nexus\scripts\bootstrap-nexus-cli.ps1`""
}

Push-Location -LiteralPath $repo
try {
  $npmCommand = "npm"
  if ($env:OS -eq "Windows_NT") {
    $npmCommand = "npm.cmd"
  }

  $npmArgs = @("run", "--silent", "nexus", "--") + $CliArgs
  & $npmCommand @npmArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
