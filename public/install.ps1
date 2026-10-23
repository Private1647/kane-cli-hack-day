# Kane CLI Hack Day installer for Windows: https://kaneclihack.sh/install.ps1
# Version: 0.1.0
#
# Read me before you run me. This script checks Node, Git, Chrome, Codex
# (optional), Kane CLI, Kane auth, the official Kane CLI skill, the hack skills
# and whether the event API answers. It asks before installing anything, and
# only installs the `kanehack` helper into %USERPROFILE%\.kanehack from a
# tarball whose sha256 is pinned below. No admin rights, no profile edits, no
# reading your repos or chat history.

$ErrorActionPreference = "Stop"
$KanehackVersion = "0.1.0"
$KanehackSha256 = "8c77a492117622535f5301a1aeb1e4cb2638df35b7fc77c4d4a149a638a8a27b"
$Site = if ($env:KANEHACK_SITE) { $env:KANEHACK_SITE } else { "https://kaneclihack.sh" }
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

if ((Test-Path (Join-Path $HOME ".agents\skills\hack-onboard\SKILL.md")) -or (Test-Path (Join-Path $HOME ".codex\skills\hack-onboard\SKILL.md"))) { Pass "hack_skills" }
else { Warn "hack_skills" "not found" "Optional: copy plugin\skills\hack-* into %USERPROFILE%\.agents\skills" }

# One unauthenticated request: 401 means the API is up and wants a token.
try {
  $r = Invoke-WebRequest -Uri "$Site/api/v1/kane/runs" -Method Get -TimeoutSec 10 -UseBasicParsing -SkipHttpErrorCheck -ErrorAction Stop
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
    if (-not ($env:PATH -split ";" | Where-Object { $_ -eq $bin })) {
      Write-Host "Add it to your PATH for this session (we don't change your settings): `$env:PATH = `"$bin;`$env:PATH`""
    }
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
} else {
  Warn "kanehack" "skipped" "Re-run this script when you're ready"
}

Write-Host "`nNext: kanehack pair   ·   kanehack doctor   ·   $Site/passport"
if ($script:Failed) { Write-Host "Some checks failed. Fix them with the commands above, or ask at the help desk." -ForegroundColor Yellow }
