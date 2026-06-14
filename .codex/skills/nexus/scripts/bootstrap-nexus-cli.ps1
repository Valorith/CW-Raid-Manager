param(
  [string] $RepoUrl,
  [string] $RepoPath,
  [string] $Branch,
  [string] $NexusUrl,
  [string] $Profile,
  [switch] $UseDefaultBranch,
  [switch] $SkipNpmInstall,
  [switch] $SkipSetup,
  [switch] $Fresh,
  [switch] $LocalSetup,
  [switch] $SkipMigrations,
  [switch] $SkipDev
)

$ErrorActionPreference = "Stop"

if (-not $RepoUrl) {
  $RepoUrl = $env:NEXUS_REPO_URL
}
if (-not $RepoUrl) {
  $RepoUrl = "https://github.com/Valorith/CW-Raid-Manager.git"
}

if (-not $RepoPath) {
  $RepoPath = $env:NEXUS_REPO_PATH
}
if (-not $RepoPath) {
  $RepoPath = "C:\Github Projects\CWRaidManager"
}

if (-not $Branch) {
  $Branch = $env:NEXUS_REPO_BRANCH
}
if (-not $NexusUrl) {
  $NexusUrl = $env:NEXUS_URL
}
if (-not $Profile) {
  $Profile = $env:NEXUS_PROFILE
}
if (-not $Profile) {
  $Profile = "prod"
}

function Resolve-NativeCommand {
  param([string] $Name)

  if ($env:OS -eq "Windows_NT" -and $Name -eq "npm") {
    return "npm.cmd"
  }

  return $Name
}

function Invoke-NativeStep {
  param(
    [string] $Command,
    [string[]] $Arguments,
    [string] $WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location -LiteralPath $WorkingDirectory
  }

  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  } finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }
}

$git = Resolve-NativeCommand "git"
$npm = Resolve-NativeCommand "npm"

if (-not (Test-Path -LiteralPath $RepoPath)) {
  $parent = Split-Path -Parent $RepoPath
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $cloneArgs = @("clone")
  if (-not $UseDefaultBranch -and $Branch) {
    $cloneArgs += @("--branch", $Branch, "--single-branch")
  }
  $cloneArgs += @($RepoUrl, $RepoPath)

  Invoke-NativeStep $git $cloneArgs $null
} elseif (-not (Test-Path -LiteralPath (Join-Path $RepoPath ".git"))) {
  throw "Path exists but is not a Git checkout: $RepoPath"
}

if (-not $UseDefaultBranch -and $Branch) {
  Invoke-NativeStep $git @("fetch", "origin", $Branch) $RepoPath
  Invoke-NativeStep $git @("checkout", $Branch) $RepoPath
  Invoke-NativeStep $git @("pull", "--ff-only", "origin", $Branch) $RepoPath
}

$packageJsonPath = Join-Path $RepoPath "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  throw "package.json was not found in $RepoPath."
}

$packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
$scripts = $packageJson.scripts
foreach ($requiredScript in @("nexus", "nexus:local", "nexus:setup")) {
  if (-not $scripts.PSObject.Properties.Name.Contains($requiredScript)) {
    throw "Required npm script '$requiredScript' is missing. Check out the CLI branch '$Branch' or a default branch that includes the Nexus CLI."
  }
}

if (-not $SkipNpmInstall) {
  Invoke-NativeStep $npm @("install") $RepoPath
}

if (-not $SkipSetup) {
  if ($LocalSetup) {
    $setupScript = "nexus:setup:local"
    if ($Fresh) {
      $setupScript = "nexus:setup:local:fresh"
    }

    $setupArgs = @("run", $setupScript)
    $passthrough = @()
    if ($SkipMigrations) {
      $passthrough += "--skip-migrations"
    }
    if ($SkipDev) {
      $passthrough += "--skip-dev"
    }
    if ($passthrough.Count -gt 0) {
      $setupArgs += "--"
      $setupArgs += $passthrough
    }

    Invoke-NativeStep $npm $setupArgs $RepoPath
  } elseif ($NexusUrl) {
    Invoke-NativeStep $npm @("run", "nexus:setup", "--", "--url", $NexusUrl, "--profile", $Profile) $RepoPath
    Invoke-NativeStep $npm @("run", "nexus", "--", "profiles", "use", $Profile) $RepoPath
  } else {
    Write-Host "Skipping Nexus CLI auth setup because no hosted URL was provided."
    Write-Host "Run: npm run nexus:setup -- --url <nexus-url> --profile $Profile"
  }
}

Write-Host "Nexus CLI is available at $RepoPath"
