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
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
$ImportLine = "@$RepoDir\CLAUDE.md"
$ClaudeMdPath = Join-Path $ClaudeDir 'CLAUDE.md'
if (-not (Test-Path $ClaudeMdPath)) {
    New-Item -ItemType File -Path $ClaudeMdPath | Out-Null
}
$claudeContent = Get-Content $ClaudeMdPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
if ($claudeContent -and $claudeContent.Contains($ImportLine)) {
    Write-Host "CLAUDE.md import already present."
} else {
    Add-Content -Path $ClaudeMdPath -Value "`n$ImportLine" -Encoding UTF8
    Write-Green "Added EngineOS import to ~/.claude/CLAUDE.md (personal lines untouched)."
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

# ---------- 4d. Link rules + patterns ----------
# Agents/skills reference these by relative path (rules/*.md, patterns/*) — without
# them installed alongside skills/agents/commands, those references resolve to
# nothing on an installed machine.
$rulesDest = Join-Path $ClaudeDir 'rules'
New-Item -ItemType Directory -Force -Path $rulesDest | Out-Null
$rulesSrc = Join-Path $RepoDir 'rules'
if (Test-Path $rulesSrc) {
    Get-ChildItem $rulesSrc -Filter '*.md' | ForEach-Object {
        $target = Join-Path $rulesDest $_.Name
        if (New-Link -Target $target -Value $_.FullName -IsDir $false) {
            Write-Host "rule linked: $($_.Name)"
        }
    }
}

$patternsDest = Join-Path $ClaudeDir 'patterns'
New-Item -ItemType Directory -Force -Path $patternsDest | Out-Null
$patternsSrc = Join-Path $RepoDir 'patterns'
if (Test-Path $patternsSrc) {
    Get-ChildItem $patternsSrc | ForEach-Object {
        $target = Join-Path $patternsDest $_.Name
        if (New-Link -Target $target -Value $_.FullName -IsDir $_.PSIsContainer) {
            Write-Host "pattern linked: $($_.Name)"
        }
    }
}

# ---------- 4e. Prune dangling links ----------
# A rename in the repo (e.g. patterns/1-Analisys -> patterns/1-Analysis.md) otherwise
# leaves a stale link whose target no longer exists — a slash command or reference
# that still "exists" but silently resolves to nothing. Sweep the directories we
# manage and drop any link/junction pointing at a target that no longer exists.
foreach ($dir in @($skillsDest, $agentsDest, $commandsDest)) {
    if (-not $dir -or -not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -Force | Where-Object {
        $_.LinkType -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
    } | ForEach-Object {
        if (-not (Test-Path $_.FullName)) {
            Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
            Write-Host "pruned dangling link: $($_.Name)"
        }
    }
}

# ---------- 5. Merge hooks into settings.json ----------
# Hook scripts are .sh files. On Windows they need Git Bash or WSL (with a distro).
# This installer's own JSON merge doesn't call jq, but every hook script it wires up
# does (route-before-change.sh, mark-unrecorded.sh, record-verify.sh,
# task-scale-advisor.sh) — without jq on PATH those hooks exit 0 silently, so
# routing guidance and the change-record Stop gate simply never fire.
if (Get-Command jq -ErrorAction SilentlyContinue) {
    Write-Host "jq found: $(jq --version)"
} else {
    Write-Warn "jq not found on PATH. The routing and change-record hooks silently no-op without it."
    Write-Warn "Install it (e.g. 'winget install jqlang.jq', or via Git Bash/WSL: 'apt install jq') and re-run."
}

if (-not (Test-Path $Settings)) { '{}' | Set-Content $Settings -Encoding UTF8 }
if (-not (Test-Path "$Settings.engineos.bak")) {
    Copy-Item $Settings "$Settings.engineos.bak"
}

$hooksDir = Join-Path $RepoDir 'hooks'

# Use forward-slash paths so Claude Code (cross-platform) handles them uniformly
function ToUnixPath($p) { $p -replace '\\', '/' }

$hookPaths = @{
    post   = ToUnixPath (Join-Path $hooksDir 'post-edit-check.sh')
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

Add-HookEntry $settingsObj 'PreToolUse'       'Edit|Write' $hookPaths.route
Add-HookEntry $settingsObj 'PostToolUse'      'Edit|Write' $hookPaths.mark
Add-HookEntry $settingsObj 'PostToolUse'      'Edit|Write' $hookPaths.post
Add-HookEntry $settingsObj 'Stop'             ''           $hookPaths.stop
Add-HookEntry $settingsObj 'Stop'             ''           $hookPaths.record
Add-HookEntry $settingsObj 'SessionStart'     ''           $hookPaths.ensure
Add-HookEntry $settingsObj 'UserPromptSubmit' ''           $hookPaths.scale

$settingsObj | ConvertTo-Json -Depth 20 | Set-Content $Settings -Encoding UTF8
Write-Green "Hooks merged into settings.json (backup: settings.json.engineos.bak)."

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

# ---------- 6. Hook warning for Windows ----------
Write-Host ""
Write-Warn "NOTE (Windows): Hook scripts are .sh files and require Git Bash or WSL with a Linux"
Write-Warn "distro to execute. Install one of:"
Write-Warn "  - Git for Windows (includes Git Bash): https://git-scm.com/download/win"
Write-Warn "  - WSL + Ubuntu: wsl --install  (then re-open a WSL terminal and re-run install.sh)"

# ---------- 7. MCP reminder ----------
Write-Host ""
Write-Host "MCP baseline: see templates/mcp.template.json — add servers with 'claude mcp add'"
Write-Host "or copy entries into settings.json. Use env var references, never literal tokens."
Write-Host ""
Write-Green "EngineOS installed. Restart Claude Code sessions to pick up changes."
