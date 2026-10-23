# Kane CLI Hack Day installer for Windows: https://kaneclihack.sh/install.ps1
# Version: 0.1.1
#
# Read me before you run me. This script checks Node, Git, Chrome, Codex
# (optional), Kane CLI, Kane auth, the official Kane CLI skill, the hack skills
# and whether the event API answers. It asks before installing anything, and
# only installs the `kanehack` helper into %USERPROFILE%\.kanehack and the hack-*
# skills into your agents' skill folders, each from a tarball whose sha256 is
# pinned below. No admin rights, no PATH change unless you say yes, no reading
# your repos or chat history.

$ErrorActionPreference = "Stop"
$KanehackVersion = "0.1.1"
$KanehackSha256 = "0e6d9b879c374955d93fa11c09ba8424ce84d665e8ffb91dff4ede1ae933e5fd"
$SkillsSha256 = "15908514717814bae5546024b9718db0cf0b2f07001e0b9c163a0286d3719215"
# The www host directly: Windows PowerShell 5.1 may not follow the apex's 308 redirect.
$Site = if ($env:KANEHACK_SITE) { $env:KANEHACK_SITE } else { "https://www.kaneclihack.sh" }
$Prefix = Join-Path $HOME ".kanehack"
$script:Failed = $false

function Pass($id, $info = "") { Write-Host ("✓ {0,-12} {1}" -f $id, $info) -ForegroundColor Green }
function Warn($id, $info, $fix) { Write-Host ("! {0,-12} {1} → {2}" -f $id, $info, $fix) -ForegroundColor Yellow }
function Fail($id, $info, $fix) { Write-Host ("✗ {0,-12} {1} → {2}" -f $id, $info, $fix) -ForegroundColor Red; $script:Failed = $true }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "Kane CLI Hack Day setup check (installer $KanehackVersion)`n"
Pass "os" "windows-$env:PROCESSOR_ARCHITECTURE"

if (Have node) {
  $nv = (node -v).TrimStart("v"); $major = [int]($nv.Split(".")[0])
  if ($major -ge 18) { Pass "node" $nv } else { Fail "node" $nv "Install Node 18+ from https://nodejs.org" }
} else { Fail "node" "missing" "Install Node 18+ from https://nodejs.org" }

if (Have git) { Pass "git" ((git --version) -replace "git version ", "") } else { Fail "git" "missing" "Install Git: https://git-scm.com" }

$chromePaths = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
if ($chromePaths | Where-Object { $_ -and (Test-Path $_) }) { Pass "chrome" } else { Fail "chrome" "missing" "Install Google Chrome: Kane drives a real browser" }

if (Have codex) { Pass "codex" } else { Warn "codex" "not found" "Optional: any agent works; the web app works without one" }

if (Have kane-cli) {
  Pass "kane_cli" ((kane-cli --version) | Select-Object -First 1)
  kane-cli whoami *> $null
  if ($LASTEXITCODE -eq 0) { Pass "kane_auth" } else { Fail "kane_auth" "signed out" "kane-cli login" }
} else {
  Fail "kane_cli" "missing" "npm i -g @testmuai/kane-cli"
  Warn "kane_auth" "skipped" "Install Kane CLI first"
}

$skill = @(".claude\skills\kane-cli", ".agents\skills\kane-cli", ".codex\skills\kane-cli") | Where-Object { Test-Path (Join-Path $HOME "$_\SKILL.md") }
if ($skill) { Pass "kane_skill" } else { Warn "kane_skill" "not found" "npx @testmuai/kane-cli-skill" }

# Where agents look for personal skills: .agents\skills always, plus Claude Code and Codex when present.
$skillDirs = @(Join-Path $HOME ".agents\skills")
if (Test-Path (Join-Path $HOME ".claude")) { $skillDirs += Join-Path $HOME ".claude\skills" }
if (Test-Path (Join-Path $HOME ".codex")) { $skillDirs += Join-Path $HOME ".codex\skills" }
$needSkills = @($skillDirs | Where-Object { -not (Test-Path (Join-Path $_ "hack-onboard\SKILL.md")) }).Count -gt 0
if (-not $needSkills) { Pass "hack_skills" } else { Warn "hack_skills" "not found" "Offered below" }

# One unauthenticated request: 401 means the API is up and wants a token.
try {
  $r = Invoke-WebRequest -Uri "$Site/api/v1/kane/runs" -Method Get -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
  $code = [int]$r.StatusCode
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
if (@(200, 401, 403) -contains $code) { Pass "api" "$Site (HTTP $code)" } else { Fail "api" "HTTP $code" "Check your network; the web app is $Site" }

Write-Host ""
$bin = Join-Path $Prefix "bin"
$cmdShim = Join-Path $bin "kanehack.cmd"
if (-not ((Have node) -and (Have npm))) {
  Warn "kanehack" "not installed" "Install Node first, then re-run this script"
} elseif ((Read-Host "Install the kanehack helper $KanehackVersion into $Prefix (no admin)? [y/N]") -match "^(y|yes)$") {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("kanehack-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $tgz = Join-Path $tmp "kanehack-$KanehackVersion.tgz"
    Invoke-WebRequest -Uri "$Site/kanehack-$KanehackVersion.tgz" -OutFile $tgz -UseBasicParsing -TimeoutSec 60
    $got = (Get-FileHash -Algorithm SHA256 $tgz).Hash.ToLower()
    if ($got -ne $KanehackSha256) { Fail "kanehack" "checksum mismatch" "Don't use this download; tell the help desk (got $got)"; exit 1 }
    New-Item -ItemType Directory -Force -Path (Join-Path $Prefix "cli"), $bin | Out-Null
    npm install --silent --no-audit --no-fund --prefix (Join-Path $Prefix "cli") $tgz | Out-Null
    $entry = Join-Path $Prefix "cli\node_modules\kanehack\bin\kanehack.mjs"
    Set-Content -Path $cmdShim -Value "@echo off`r`nnode `"$entry`" %*" -Encoding ASCII
    Pass "kanehack" "$KanehackVersion → $cmdShim (sha256 verified)"
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
} else {
  Warn "kanehack" "skipped" "Re-run this script when you're ready"
}

if ($needSkills -and ((Read-Host "Install the 12 hack-* skills into $($skillDirs -join ', ')? [y/N]") -match "^(y|yes)$")) {
  $stmp = Join-Path ([IO.Path]::GetTempPath()) ("hack-skills-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $stmp | Out-Null
  try {
    $stgz = Join-Path $stmp "hack-skills-$KanehackVersion.tgz"
    Invoke-WebRequest -Uri "$Site/hack-skills-$KanehackVersion.tgz" -OutFile $stgz -UseBasicParsing -TimeoutSec 60
    $got = (Get-FileHash -Algorithm SHA256 $stgz).Hash.ToLower()
    if ($got -ne $SkillsSha256) { Fail "hack_skills" "checksum mismatch" "Don't use this download; tell the help desk (got $got)" }
    else {
      # tar.exe ships with Windows 10 1803+. Only the hack-* folders are written.
      foreach ($d in $skillDirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null; tar -xzf $stgz -C $d }
      Pass "hack_skills" "12 skills → $($skillDirs -join ', ') (sha256 verified). Start a new agent session to load them."
    }
  } finally { Remove-Item -Recurse -Force $stmp -ErrorAction SilentlyContinue }
} elseif ($needSkills) { Warn "hack_skills" "skipped" "Re-run this script when you're ready" }

# kanehack lives in .kanehack\bin. If that isn't on PATH, offer to add it (asked, never silent),
# and print the next steps with the full path so they work right now.
$kh = "kanehack"
if ((Test-Path $cmdShim) -and -not ($env:PATH -split ";" | Where-Object { $_ -eq $bin })) {
  if ((Read-Host "Add $bin to your user PATH? [y/N]") -match "^(y|yes)$") {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (($userPath -split ";") -contains $bin)) { [Environment]::SetEnvironmentVariable("Path", (@($bin, $userPath) | Where-Object { $_ }) -join ";", "User") }
    $env:PATH = "$bin;$env:PATH"
    Pass "path" "added (this window and new ones)"
  } else {
    $kh = "& `"$cmdShim`""
    Write-Host "kanehack isn't on your PATH. Use the full path below, or run: `$env:PATH = `"$bin;`$env:PATH`"" -ForegroundColor Yellow
  }
}

Write-Host "`nNext:"
Write-Host "  1. $kh pair        link this machine to your passport"
Write-Host "  2. $kh doctor      re-check your setup"
Write-Host "  3. $kh report -- kane-cli run `"Open $Site and find the schedule`" --agent"
Write-Host "     (your first Kane run, sent to your team's Proof tab)"
Write-Host "Web: $Site/passport"
if ($script:Failed) { Write-Host "Some checks failed. Fix them with the commands above, or ask at the help desk." -ForegroundColor Yellow }
