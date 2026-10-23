# Regression tests for public/install.ps1 on Windows, under the PowerShell that runs this file
# (Windows PowerShell 5.1 or pwsh 7). Each scenario runs the installer in a child process the
# way participants and agents do (irm | iex, or a scriptblock with -Yes), with USERPROFILE set to
# a throwaway folder and npm's prefix pointed inside it. Never touches the real profile.
#
#   $env:SITE = "http://localhost:3399"; powershell -NoProfile -File tests\installer\installer.ps1
param([string]$Site = $env:SITE)
$ErrorActionPreference = "Stop"
if (-not $Site) { throw "Set SITE (or -Site) to a server that serves public/." }
$Site = $Site.TrimEnd("/")
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Resolve-Path (Join-Path $Here "..\..")
$Exe = (Get-Process -Id $PID).Path
$Version = ((Get-Content (Join-Path $Repo "public\install.ps1")) | Where-Object { $_ -match '^\$KanehackVersion = "(.*)"' } | Select-Object -First 1) -replace '^\$KanehackVersion = "(.*)"', '$1'
$Work = Join-Path ([IO.Path]::GetTempPath()) ("kh-ps-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $Work | Out-Null
$OrigPath = $env:PATH
$script:N = 0; $script:Fails = 0

function Check($name, [bool]$cond, $log) {
  $script:N++
  if ($cond) { Write-Host "ok $($script:N) - $name" }
  else {
    $script:Fails++
    Write-Host "not ok $($script:N) - $name"
    if ($log -and (Test-Path $log)) { Get-Content $log -Tail 40 | ForEach-Object { Write-Host "  # $_" } }
  }
}
function Fresh($name) {
  $script:H = Join-Path $Work $name
  New-Item -ItemType Directory -Force -Path $script:H | Out-Null
  $script:Npm = Join-Path $script:H "npm-global"
  $script:Log = Join-Path $Work "$name.log"
  $env:PATH = $OrigPath
}
# Run installer code in a child PowerShell with the test home. Returns the exit code.
function RunPS($code, [switch]$Interactive) {
  # The child's stderr must not become a terminating error here (Windows PowerShell 5.1).
  $ErrorActionPreference = "Continue"
  $saved = @{ USERPROFILE = $env:USERPROFILE; HOME = $env:HOME; NPM_CONFIG_PREFIX = $env:NPM_CONFIG_PREFIX; KANEHACK_SITE = $env:KANEHACK_SITE }
  # KANEHACK_SITE so `irm | iex` runs talk to the test server, never production.
  $env:USERPROFILE = $script:H; $env:HOME = $script:H; $env:NPM_CONFIG_PREFIX = $script:Npm; $env:KANEHACK_SITE = $Site
  try {
    $psArgs = @("-NoProfile")
    if (-not $Interactive) { $psArgs += "-NonInteractive" }
    $psArgs += @("-Command", $code)
    & $Exe @psArgs *> $script:Log
    return $LASTEXITCODE
  } finally { foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) } }
}
function LogHas($pattern) { [bool](Select-String -Path $script:Log -Pattern $pattern -SimpleMatch -Quiet) }
function KhVersion { $e = Join-Path $script:H ".kanehack\cli\node_modules\kanehack\bin\kanehack.mjs"; if (Test-Path $e) { (& node $e version) } }
$Sb = "& ([scriptblock]::Create((Invoke-RestMethod '$Site/install.ps1')))"

Write-Host "# install.ps1 $Version under $($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion), site $Site, work $Work"

# 1. irm | iex with no terminal and no -Yes: nothing installed, the exact -Yes command printed.
Fresh "no-tty"
$rc = RunPS "irm '$Site/install.ps1' | iex"
Check "no-tty: exit 0" ($rc -eq 0) $Log
Check "no-tty: nothing installed" (-not (Test-Path (Join-Path $H ".kanehack")) -and -not (Test-Path (Join-Path $H ".agents"))) $Log
Check "no-tty: prints the -Yes command" (LogHas "install.ps1))) -Yes -Site $Site") $Log
Check "no-tty: no prompt left waiting" (-not (LogHas "[y/N]:")) $Log

# 2. Scriptblock with -Yes, npm's prefix on PATH and writable: install, shim there, plain next steps.
Fresh "yes"
New-Item -ItemType Directory -Force -Path $Npm, (Join-Path $H ".claude") | Out-Null
$env:PATH = "$Npm;$OrigPath"
$rc = RunPS "$Sb -Yes -Site '$Site'"
Check "yes: exit 0" ($rc -eq 0) $Log
Check "yes: kanehack $Version installed (sha256 verified)" ((KhVersion) -eq $Version -and (LogHas "sha256 verified")) $Log
Check "yes: 12 skills in .agents and .claude" ((@(Get-ChildItem (Join-Path $H ".agents\skills") -Directory -Filter "hack-*").Count -eq 12) -and (Test-Path (Join-Path $H ".claude\skills\hack-onboard\SKILL.md"))) $Log
Check "yes: kanehack.cmd + sh shim in npm's prefix" ((Test-Path (Join-Path $Npm "kanehack.cmd")) -and (Test-Path (Join-Path $Npm "kanehack"))) $Log
Check "yes: next steps say plain kanehack" ((LogHas "  1. kanehack pair") -and -not (LogHas '& "')) $Log
Check "yes: -Site saved as kanehack's server" ((Get-Content (Join-Path $H ".kanehack\config.json") -Raw) -match [regex]::Escape($Site)) $Log
Check "yes: user PATH not touched" (-not (LogHas "added (this window and new ones)")) $Log
$v = & cmd /c "set USERPROFILE=$H&& kanehack version"
Check "yes: ``kanehack`` runs from cmd/PowerShell via PATH" ($v -eq $Version) $Log
$bash = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path $bash) {
  # Git Bash turns the Windows PATH (which has the npm prefix) into a POSIX one by itself.
  $v = & $bash -c "kanehack version"
  Check "yes: ``kanehack`` runs from Git Bash (Claude Code's Bash tool)" ($v -eq $Version) $Log
} else { Write-Host "# skip Git Bash: not installed" }
$rc = RunPS "$Sb -Yes -Site '$Site'"
Check "re-run: idempotent (already installed, already a command, skills current)" ($rc -eq 0 -and (LogHas "already installed") -and (LogHas ("kanehack " + [char]0x2192)) -and -not (LogHas "y (-Yes)")) $Log
Set-Content -Path (Join-Path $Work "installed-home.txt") -Value $H

# 3. KANEHACK_YES=1 with irm | iex, npm prefix not on PATH: the user PATH offer (auto-yes) instead.
Fresh "env-yes"
$savedUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$rc = RunPS "`$env:KANEHACK_YES = '1'; `$env:KANEHACK_NO_SKILLS = '1'; irm '$Site/install.ps1' | iex"
[Environment]::SetEnvironmentVariable("Path", $savedUserPath, "User")
Check "env KANEHACK_YES: installed, skills skipped, user PATH offered (and restored by the test)" ($rc -eq 0 -and (KhVersion) -eq $Version -and (LogHas "skipped (-NoSkills)") -and (LogHas "added (this window and new ones)")) $Log

# 4. A different kanehack on PATH: left alone.
Fresh "conflict"
$other = Join-Path $H "other"; New-Item -ItemType Directory -Force -Path $other, $Npm | Out-Null
Set-Content -Path (Join-Path $other "kanehack.cmd") -Value "@echo not-ours" -Encoding ASCII
$env:PATH = "$other;$Npm;$OrigPath"
$rc = RunPS "$Sb -Yes -NoSkills -Site '$Site'"
Check "conflict: warned, other kanehack untouched, no shim, full path" ($rc -eq 0 -and (LogHas "another kanehack is on PATH") -and ((Get-Content (Join-Path $other "kanehack.cmd")) -eq "@echo not-ours") -and -not (Test-Path (Join-Path $Npm "kanehack.cmd")) -and (LogHas '& "') -and -not (LogHas "added (this window")) $Log

# 5. -NoPath.
Fresh "nopath"
New-Item -ItemType Directory -Force -Path $Npm | Out-Null
$env:PATH = "$Npm;$OrigPath"
$rc = RunPS "$Sb -Yes -NoPath -NoSkills -Site '$Site'"
Check "-NoPath: installed, no shim, no PATH change" ($rc -eq 0 -and (KhVersion) -eq $Version -and -not (Test-Path (Join-Path $Npm "kanehack.cmd")) -and -not (LogHas "added (this window")) $Log

# 6. Upgrade from 0.1.0.
Fresh "upgrade"
New-Item -ItemType Directory -Force -Path (Join-Path $H ".kanehack\cli"), (Join-Path $H ".kanehack\bin") | Out-Null
& npm install --silent --no-audit --no-fund --prefix (Join-Path $H ".kanehack\cli") (Join-Path $Repo "public\kanehack-0.1.0.tgz") *> $null
Set-Content -Path (Join-Path $H ".kanehack\bin\kanehack.cmd") -Value "@echo off`r`nnode `"$(Join-Path $H '.kanehack\cli\node_modules\kanehack\bin\kanehack.mjs')`" %*" -Encoding ASCII
$before = KhVersion
$rc = RunPS "$Sb -Yes -NoSkills -Site '$Site'"
Check "upgrade: 0.1.0 -> $Version" ($before -eq "0.1.0" -and $rc -eq 0 -and (KhVersion) -eq $Version -and (LogHas "Upgrade the kanehack helper")) $Log

# 7. Tampered tarball: non-zero exit, nothing installed, and `irm | iex` doesn't kill the host.
$T = Join-Path $Work "tampered"; New-Item -ItemType Directory -Force -Path $T | Out-Null
Copy-Item (Join-Path $Repo "public\install.ps1"), (Join-Path $Repo "public\kanehack-$Version.tgz"), (Join-Path $Repo "public\hack-skills-$Version.tgz") $T
Add-Content -Path (Join-Path $T "hack-skills-$Version.tgz") -Value "x"
$mock = Start-Process -FilePath node -ArgumentList @("`"$(Join-Path $Here 'mock-server.mjs')`"", "--port", "3388", "--public", "`"$T`"") -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
Fresh "tamper"
New-Item -ItemType Directory -Force -Path $Npm | Out-Null
$env:PATH = "$Npm;$OrigPath"
$rc = RunPS "& ([scriptblock]::Create((irm 'http://localhost:3388/install.ps1'))) -Yes -Site 'http://localhost:3388'"
Check "tampered skills tarball: non-zero exit, checksum mismatch, nothing installed" ($rc -ne 0 -and (LogHas "checksum mismatch") -and (LogHas "Nothing was installed") -and -not (Test-Path (Join-Path $H ".kanehack\bin")) -and -not (Test-Path (Join-Path $H ".agents\skills\hack-onboard"))) $Log
Fresh "tamper-iex"
$rc = RunPS "`$env:KANEHACK_YES = '1'; `$env:KANEHACK_SITE = 'http://localhost:3388'; try { irm 'http://localhost:3388/install.ps1' | iex } catch { Write-Host ('caught: ' + `$_) }; Write-Host 'host-still-alive'; exit 0"
Check "tampered + irm | iex (KANEHACK_YES): error is catchable, the host keeps running" ((LogHas "host-still-alive") -and (LogHas "caught:")) $Log
Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue

# 8. No node on PATH.
Fresh "no-node"
$nodeDir = Split-Path (Get-Command node).Source -Parent
$env:PATH = (($OrigPath -split ";") | Where-Object { $_ -and ($_.TrimEnd("\") -ine $nodeDir.TrimEnd("\")) -and -not (Test-Path (Join-Path $_ "node.exe")) }) -join ";"
$rc = RunPS "$Sb -Yes -Site '$Site'"
$env:PATH = $OrigPath
Check "no node: exit 0, node missing, kanehack not installed" ($rc -eq 0 -and (LogHas "Install Node (with npm) first") -and -not (Test-Path (Join-Path $H ".kanehack\bin"))) $Log

Write-Host "1..$($script:N)"
Write-Host "# $($script:N - $script:Fails)/$($script:N) passed (install.ps1 under $($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion))"
if (-not $env:KEEP_INSTALLED) { Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue }
if ($script:Fails) { exit 1 } else { exit 0 }
