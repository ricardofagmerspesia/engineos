#!/usr/bin/env pwsh
# EngineOS installer (PowerShell) — links the shared engineering environment into ~/.claude
# Idempotent: safe to re-run after every `git pull`.
# Requires: PowerShell 5.1+ (built into Windows 10/11) or PowerShell 7+
# Symlinks/junctions may require Developer Mode or an elevated (admin) terminal.

$ErrorActionPreference = 'Stop'

$RepoDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $HOME '.claude'
$Settings  = Join-Path $ClaudeDir 'settings.json'

function Write-Red($msg)  { Write-Host $msg -ForegroundColor Red }
function Write-Green($msg){ Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }

Write-Host "EngineOS install from: $RepoDir"

# ---------- 1. Secrets gate ----------
$SecretPatterns = @(
    'sk-ant-[A-Za-z0-9_\-]{10,}'
    'sk-proj-[A-Za-z0-9_\-]{10,}'
    'sk-[A-Za-z0-9]{20,}'
    'AKIA[0-9A-Z]{16}'
    'gh[opsu]_[A-Za-z0-9]{20,}'
    'ghp_[A-Za-z0-9]{20,}'
    'github_pat_[A-Za-z0-9_]{20,}'
    'glpat-[A-Za-z0-9_\-]{20,}'
    'AIza[0-9A-Za-z_\-]{35}'
    'ATATT[A-Za-z0-9_=.\-]{20,}'
    'xox[baprs]-[A-Za-z0-9\-]{10,}'
    '-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----'
    '"private_key_id"\s*:'
    '[a-z][a-z+]+://[^/\s]+:[^@\s]+@'
)
$SecretRegex = $SecretPatterns -join '|'

$SecretHits = @()
$isGitRepo = $false
try {
    $null = & git -C $RepoDir rev-parse --is-inside-work-tree 2>&1
    $isGitRepo = ($LASTEXITCODE -eq 0)
} catch {}

if ($isGitRepo) {
    $trackedFiles = & git -C $RepoDir ls-files 2>$null |
        Where-Object { $_ -ne 'install.sh' -and $_ -ne 'install.ps1' }
    foreach ($rel in $trackedFiles) {
        $full = Join-Path $RepoDir $rel
        if (Test-Path $full -PathType Leaf) {
            try {
                $text = Get-Content $full -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
                if ($text -match $SecretRegex) { $SecretHits += $rel }
            } catch {}
        }
    }
} else {
    Get-ChildItem $RepoDir -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\.git\\' } |
        ForEach-Object {
            try {
                $text = Get-Content $_.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
                if ($text -match $SecretRegex) { $SecretHits += $_.FullName }
            } catch {}
        }
}

if ($SecretHits.Count -gt 0) {
    Write-Red "ABORT: secret-looking strings found in tracked files. Remove + rotate before installing/pushing:"
    $SecretHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# ---------- 2. Warn about secrets in local settings ----------
if (Test-Path $Settings) {
    try {
        $settingsText = Get-Content $Settings -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($settingsText -match $SecretRegex) {
            Write-Warn "WARNING: secret-looking value(s) found in $Settings (API key / token / connection string)."
            Write-Warn "Move them to environment variables and ROTATE."
        }
    } catch {}
}

# ---------- 3. Import EngineOS constitution into global CLAUDE.md ----------
# Absolute @.../CLAUDE.md lines are installer-managed and refreshed on re-run
# (repo moved, reclone, bash vs PowerShell path form). Personal prose and
# relative @imports are left untouched.
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
$ImportLine = "@$RepoDir\CLAUDE.md"
$ClaudeMdPath = Join-Path $ClaudeDir 'CLAUDE.md'
if (-not (Test-Path $ClaudeMdPath)) {
    New-Item -ItemType File -Path $ClaudeMdPath | Out-Null
}
$claudeLines = @(Get-Content $ClaudeMdPath -Encoding UTF8 -ErrorAction SilentlyContinue)
$importRe = '^@\S+[/\\]CLAUDE\.md\s*$'
$managed = @($claudeLines | Where-Object { $_ -match $importRe })
$alreadyCurrent = ($managed.Count -eq 1) -and ($managed[0] -eq $ImportLine)
if ($alreadyCurrent) {
    Write-Host "CLAUDE.md import already up to date."
} else {
    $kept = @($claudeLines | Where-Object { $_ -notmatch $importRe })
    # drop trailing blank lines so we don't accumulate empties across re-runs
    while ($kept.Count -gt 0 -and [string]::IsNullOrWhiteSpace($kept[-1])) {
        $kept = $kept[0..($kept.Count - 2)]
    }
    if ($kept.Count -gt 0) {
        $newContent = ($kept -join "`n") + "`n`n" + $ImportLine + "`n"
    } else {
        $newContent = $ImportLine + "`n"
    }
    Set-Content -Path $ClaudeMdPath -Value $newContent -Encoding UTF8 -NoNewline
    if ($managed.Count -gt 0) {
        Write-Green "Updated EngineOS import in ~/.claude/CLAUDE.md -> $ImportLine"
    } else {
        Write-Green "Added EngineOS import to ~/.claude/CLAUDE.md (personal lines untouched)."
    }
}

# ---------- Helper: create a symlink/junction idempotently ----------
# Returns $true if the target is usable (already existed as a link, or was just created).
function New-Link {
    param(
        [string]$Target,   # path to create
        [string]$Value,    # path it points to
        [bool]$IsDir
    )

    if (Test-Path $Target) {
        $existing = Get-Item $Target -Force -ErrorAction SilentlyContinue
        if ($existing -and ($existing.LinkType -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint))) {
            return $true   # already a link — idempotent
        }
        Write-Warn "skip: $Target exists and is not a symlink (local file with same name?)"
        return $false
    }

    if ($IsDir) {
        try {
            # Junction points work without admin/Developer Mode on Windows
            New-Item -ItemType Junction -Path $Target -Value $Value -ErrorAction Stop | Out-Null
            return $true
        } catch {
            Write-Warn "Could not create junction '$Target': $_"
            return $false
        }
    }

    # Files: try symbolic link first, fall back to hard link (same volume, no admin needed)
    try {
        New-Item -ItemType SymbolicLink -Path $Target -Value $Value -ErrorAction Stop | Out-Null
        return $true
    } catch {}

    try {
        New-Item -ItemType HardLink -Path $Target -Value $Value -ErrorAction Stop | Out-Null
        Write-Warn "  (used hard link for '$($Target | Split-Path -Leaf)' — symlink needs Developer Mode or admin)"
        return $true
    } catch {
        Write-Warn "Could not create link '$Target': $_"
        Write-Warn "  -> Enable Developer Mode: Settings > Privacy & Security > For developers > On"
        Write-Warn "     Or run this script as Administrator."
        return $false
    }
}

# ---------- 4. Link skills (directories -> junctions) ----------
$skillsDest = Join-Path $ClaudeDir 'skills'
New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null
$skillsSrc = Join-Path $RepoDir 'skills'
if (Test-Path $skillsSrc) {
    Get-ChildItem $skillsSrc -Directory | ForEach-Object {
        $target = Join-Path $skillsDest $_.Name
        if (New-Link -Target $target -Value $_.FullName -IsDir $true) {
            Write-Host "skill linked: $($_.Name)"
        }
    }
}

# ---------- 4b. Link agents (markdown files -> symlinks) ----------
$agentsDest = Join-Path $ClaudeDir 'agents'
New-Item -ItemType Directory -Force -Path $agentsDest | Out-Null
$agentsSrc = Join-Path $RepoDir 'agents'
if (Test-Path $agentsSrc) {
    Get-ChildItem $agentsSrc -Filter '*.md' | ForEach-Object {
        $target = Join-Path $agentsDest $_.Name
        if (New-Link -Target $target -Value $_.FullName -IsDir $false) {
            Write-Host "agent linked: $($_.BaseName)"
        }
    }
}

# ---------- 4c. Link commands (flat into ~/.claude/commands/) ----------
$commandsSrc = Join-Path $RepoDir 'commands'
if (Test-Path $commandsSrc) {
    $commandsDest = Join-Path $ClaudeDir 'commands'
    New-Item -ItemType Directory -Force -Path $commandsDest | Out-Null

    Get-ChildItem $commandsSrc -Filter '*.md' | ForEach-Object {
        $target = Join-Path $commandsDest $_.Name
        if (New-Link -Target $target -Value $_.FullName -IsDir $false) {
            Write-Host "command linked: /$($_.BaseName)"
        }
    }

    $agentCmdsSrc = Join-Path $commandsSrc 'agents'
    if (Test-Path $agentCmdsSrc) {
        Get-ChildItem $agentCmdsSrc -Filter '*.md' | ForEach-Object {
            $target = Join-Path $commandsDest $_.Name
            if (New-Link -Target $target -Value $_.FullName -IsDir $false) {
                Write-Host "command linked: /$($_.BaseName)"
            }
        }
    }
}

# ---------- 5. Merge hooks into settings.json ----------
# Hook scripts are bash. On Windows they MUST be invoked through Git Bash's
# bash.exe: a bare `...\foo.sh` command is resolved by the .sh file association,
# which Git for Windows points at git-bash.exe -- a mintty *terminal launcher*.
# That pops a visible console window on every single hook fire (every prompt,
# every edit, every stop). bash.exe is a plain console binary and stays invisible.
if (-not (Test-Path $Settings)) { '{}' | Set-Content $Settings -Encoding UTF8 }
if (-not (Test-Path "$Settings.engineos.bak")) {
    Copy-Item $Settings "$Settings.engineos.bak"
}

$hooksDir = Join-Path $RepoDir 'hooks'

# Use forward-slash paths so Claude Code (cross-platform) handles them uniformly
function ToUnixPath($p) { $p -replace '\\', '/' }

# Locate Git Bash's bash.exe. Never fall back to a bare `bash`: on Windows that
# resolves to C:\Windows\System32\bash.exe (WSL), which cannot read C:/... paths.
function Resolve-GitBash {
    $candidates = @()
    try {
        # git.exe lives at <root>\cmd\git.exe -> bash.exe at <root>\bin\bash.exe
        $gitRoot = Split-Path -Parent (Split-Path -Parent (Get-Command git -ErrorAction Stop).Source)
        $candidates += (Join-Path $gitRoot 'bin\bash.exe')
        $candidates += (Join-Path $gitRoot 'usr\bin\bash.exe')
    } catch {}
    $candidates += (Join-Path $env:ProgramFiles 'Git\bin\bash.exe')
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe')
    }
    $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe')

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate -PathType Leaf)) { return (ToUnixPath $candidate) }
    }
    return $null
}

$BashExe = Resolve-GitBash

# A hook command: quoted interpreter + quoted script, or the bare script when no
# Git Bash was found (broken either way at that point, but no silent path change).
function New-HookCommand([string]$ScriptPath) {
    if ($BashExe) { return '"{0}" "{1}"' -f $BashExe, $ScriptPath }
    return $ScriptPath
}

$hookPaths = @{
    stop   = ToUnixPath (Join-Path $hooksDir 'stop-verify.sh')
    route  = ToUnixPath (Join-Path $hooksDir 'route-before-change.sh')
    mark   = ToUnixPath (Join-Path $hooksDir 'mark-unrecorded.sh')
    record = ToUnixPath (Join-Path $hooksDir 'record-verify.sh')
    ensure = ToUnixPath (Join-Path $hooksDir 'ensure-project-layout.sh')
    scale  = ToUnixPath (Join-Path $hooksDir 'task-scale-advisor.sh')
}

$settingsObj = Get-Content $Settings -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not (Get-Member -InputObject $settingsObj -Name 'hooks' -MemberType NoteProperty)) {
    $settingsObj | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([PSCustomObject]@{})
}

function Add-HookEntry {
    param($SettingsObj, [string]$Event, [string]$Matcher, [string]$Cmd)

    if (-not (Get-Member -InputObject $SettingsObj.hooks -Name $Event -MemberType NoteProperty)) {
        $SettingsObj.hooks | Add-Member -NotePropertyName $Event -NotePropertyValue @()
    }

    $existing = @($SettingsObj.hooks.$Event)
    $alreadyPresent = $existing | ForEach-Object {
        if ($_.hooks) {
            @($_.hooks) | Where-Object { $_.command -eq $Cmd }
        }
    } | Where-Object { $_ -ne $null }

    if (-not $alreadyPresent) {
        $entry = [PSCustomObject]@{
            matcher = $Matcher
            hooks   = @([PSCustomObject]@{ type = 'command'; command = $Cmd })
        }
        $SettingsObj.hooks.$Event = @($existing) + @($entry)
    }
}

# Drop every previously installed EngineOS hook entry before re-adding, so an
# earlier install's bare-`.sh` command (the terminal-window spawner) is replaced
# rather than left firing alongside the wrapped one.
function Remove-EngineOSHooks {
    param($SettingsObj, [string]$HooksDirUnix)

    foreach ($event in @('PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit')) {
        if (-not (Get-Member -InputObject $SettingsObj.hooks -Name $event -MemberType NoteProperty)) { continue }

        $kept = @()
        foreach ($entry in @($SettingsObj.hooks.$event)) {
            # Compare slash-normalized so both C:/... and C:\... forms are caught.
            $inner = @($entry.hooks) | Where-Object {
                -not ($_.command -and ($_.command -replace '\\', '/').Contains("$HooksDirUnix/"))
            }
            if ($inner.Count -gt 0) {
                $entry.hooks = @($inner)
                $kept += $entry
            }
        }
        $SettingsObj.hooks.$event = @($kept)
    }
}

Remove-EngineOSHooks $settingsObj (ToUnixPath $hooksDir)

Add-HookEntry $settingsObj 'PreToolUse'       'Edit|Write' (New-HookCommand $hookPaths.route)
Add-HookEntry $settingsObj 'PostToolUse'      'Edit|Write' (New-HookCommand $hookPaths.mark)
# per-edit gate (post-edit-check.sh) retired: verification runs once at Stop
# (rules/testing.md "Verification timing"); Remove-EngineOSHooks above already
# strips any previously installed entry for it.
Add-HookEntry $settingsObj 'Stop'             ''           (New-HookCommand $hookPaths.stop)
Add-HookEntry $settingsObj 'Stop'             ''           (New-HookCommand $hookPaths.record)
Add-HookEntry $settingsObj 'SessionStart'     ''           (New-HookCommand $hookPaths.ensure)
Add-HookEntry $settingsObj 'UserPromptSubmit' ''           (New-HookCommand $hookPaths.scale)

$settingsObj | ConvertTo-Json -Depth 20 | Set-Content $Settings -Encoding UTF8
Write-Green "Hooks merged into settings.json (backup: settings.json.engineos.bak)."
if ($BashExe) {
    Write-Host "  hooks run through: $BashExe (no terminal windows)"
} else {
    Write-Warn "  Git Bash not found -- hooks registered as bare .sh paths. Windows will"
    Write-Warn "  hand those to git-bash.exe and pop a terminal window on every hook fire."
    Write-Warn "  Install Git for Windows, then re-run this script: https://git-scm.com/download/win"
}

# ---------- 5b. Shared permission allowlist ----------
$permsTemplate = Join-Path $RepoDir 'templates\permissions.template.json'
if (Test-Path $permsTemplate) {
    $perms = Get-Content $permsTemplate -Raw -Encoding UTF8 | ConvertFrom-Json
    $shared = if ($perms.allow) { @($perms.allow) } else { @() }

    if (-not (Get-Member -InputObject $settingsObj -Name 'permissions' -MemberType NoteProperty)) {
        $settingsObj | Add-Member -NotePropertyName 'permissions' -NotePropertyValue ([PSCustomObject]@{})
    }
    if (-not (Get-Member -InputObject $settingsObj.permissions -Name 'allow' -MemberType NoteProperty)) {
        $settingsObj.permissions | Add-Member -NotePropertyName 'allow' -NotePropertyValue @()
    }

    $combined = (@($settingsObj.permissions.allow) + $shared) | Sort-Object -Unique
    $settingsObj.permissions.allow = $combined

    $settingsObj | ConvertTo-Json -Depth 20 | Set-Content $Settings -Encoding UTF8
    Write-Green "Shared read-only allowlist merged into permissions."
} else {
    Write-Warn "permissions template missing ($permsTemplate) — skipped allowlist merge."
}

# ---------- 6. Hook prerequisites for Windows ----------
Write-Host ""
Write-Warn "NOTE (Windows): hook scripts are bash and run through Git Bash's bash.exe."
Write-Warn "  - Git for Windows (provides bash.exe): https://git-scm.com/download/win"
Write-Warn "  - WSL is NOT a substitute here: the hook commands carry C:/... paths, which"
Write-Warn "    WSL's bash cannot resolve."

# jq is the hard dependency of every hook that parses tool input. Without it they
# all `exit 0` silently -- routing guidance and the Stop gate just never fire.
$jqFound = $false
if ($BashExe) {
    & $BashExe -lc 'command -v jq >/dev/null 2>&1' 2>$null
    $jqFound = ($LASTEXITCODE -eq 0)
} elseif (Get-Command jq -ErrorAction SilentlyContinue) {
    $jqFound = $true
}
if ($jqFound) {
    Write-Green "jq found -- hooks will parse tool input."
} else {
    Write-Warn "jq NOT found on the hook PATH. Every hook that parses tool input exits 0"
    Write-Warn "silently: no [router] guidance, no change-record Stop gate. Install it:"
    Write-Warn "  winget install jqlang.jq    (then restart Claude Code)"
}

# ---------- 7. MCP reminder ----------
Write-Host ""
Write-Host "MCP baseline: see templates/mcp.template.json — add servers with 'claude mcp add'"
Write-Host "or copy entries into settings.json. Use env var references, never literal tokens."
Write-Host ""
Write-Green "EngineOS installed. Restart Claude Code sessions to pick up changes."
