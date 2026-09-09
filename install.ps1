#!/usr/bin/env pwsh
# EngineOS installer (PowerShell) - links the shared engineering environment into ~/.claude
# Idempotent: safe to re-run after every `git pull`.
# Requires: PowerShell 5.1+ (built into Windows 10/11) or PowerShell 7+
# Symlinks/junctions may require Developer Mode or an elevated (admin) terminal.

# CI runs this installer against a scratch directory, and PowerShell's $HOME is
# read-only, so it cannot be redirected the way bash's HOME is for install.sh.
param(
    [ValidateNotNullOrEmpty()]
    [string]$ClaudeDir = (Join-Path $HOME '.claude')
)

$ErrorActionPreference = 'Stop'

$RepoDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
# A relative -ClaudeDir would resolve against the caller's location, so it is made
# absolute once here; a target inside the repository would let the installer
# rewrite the repository's own CLAUDE.md, so that is refused outright.
$ClaudeDir = [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $ClaudeDir))
$RepoRoot  = [IO.Path]::GetFullPath($RepoDir)
if ($ClaudeDir -eq $RepoRoot -or $ClaudeDir.StartsWith($RepoRoot + [IO.Path]::DirectorySeparatorChar)) {
    Write-Host "Refusing -ClaudeDir inside the repository: $ClaudeDir" -ForegroundColor Red
    exit 1
}
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
    # Dependency and build output is not "secrets in the repo": JSDoc URLs inside
    # dependencies (e.g. @types/node) match the credential-in-URL pattern, so
    # scanning them would abort a zip install on pure false positives.
    Get-ChildItem $RepoDir -Recurse -File |
        Where-Object {
            $_.FullName -notmatch '\\.git\\' -and
            $_.FullName -notmatch '\\(node_modules|dist-release|build|\.next)\\'
        } |
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
        Write-Green "Updated EngineOS import in $ClaudeMdPath -> $ImportLine"
    } else {
        Write-Green "Added EngineOS import to $ClaudeMdPath (personal lines untouched)."
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
            return $true   # already a link - idempotent
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
        Write-Warn "  (used hard link for '$($Target | Split-Path -Leaf)' - symlink needs Developer Mode or admin)"
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
# Agents/skills reference these by relative path (rules/*.md, patterns/*) - without
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
# leaves a stale link whose target no longer exists - a slash command or reference
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
# The hooks are node now. hooks/hooks.json registers
# `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`, so Claude Code
# spawns node directly and no shell sits between it and the hook. That is why
# this section no longer resolves bash.exe: the old form was a bare `...\foo.sh`
# command, resolved by the .sh file association, which Git for Windows points at
# git-bash.exe -- a mintty *terminal launcher* that popped a visible console
# window on every hook fire (every prompt, every edit, every stop). A `node ...`
# command never touches that association, so bash.exe leaves the hook path.
#
# The hooks/*.sh shims stay on disk -- deprecated in 1.7.0, removed in 2.0 --
# because a consumer may have copied the old `.sh` entries into their own
# settings.json. Those keep firing; a reinstall scrubs and replaces them.
# Mirrors install.sh.
if (-not (Test-Path $Settings)) { '{}' | Set-Content $Settings -Encoding UTF8 }
# write-once backup: never clobber the last known-good with an already-bad file
if (-not (Test-Path "$Settings.engineos.bak")) {
    Copy-Item $Settings "$Settings.engineos.bak"
}

# Use forward-slash paths so Claude Code (cross-platform) handles them uniformly
function ToUnixPath($p) { $p -replace '\\', '/' }

# node is both the hook runtime and this installer's JSON tool: `engineos
# settings-merge` reads hooks/hooks.json (the same file plugin mode loads),
# substitutes the ${CLAUDE_PLUGIN_ROOT} placeholder with this checkout, scrubs
# every prior EngineOS entry -- the old .sh form included -- from every event,
# appends the current list, and merges templates/permissions.template.json into
# permissions.allow. Symlink mode and plugin mode cannot drift, and adding a
# hook means editing hooks.json and nothing else.
$nodeMajor = 0
if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
        $nodeVersion = (& node -p 'process.versions.node.split(".")[0]') | Select-Object -First 1
        if ("$nodeVersion" -match '^\d+$') { $nodeMajor = [int]"$nodeVersion" }
    } catch {
        $nodeMajor = 0
    }
}

if ($nodeMajor -ge 18) {
    $pluginRoot = ToUnixPath $RepoDir
    & node "$pluginRoot/dist/engineos.cjs" settings-merge --settings $Settings --plugin-root $pluginRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Red "ABORT: settings merge failed"
        exit 1
    }
    Write-Green "Hooks merged into settings.json (backup: settings.json.engineos.bak); shared read-only allowlist merged into permissions."
} else {
    # No node means no hooks.json parsing either, so there is no list to print
    # here without hand-copying one. Point at the source of truth instead.
    Write-Warn "node >= 18 not found - hooks NOT registered. Install node and re-run:"
    Write-Warn "  https://nodejs.org/en/download"
    Write-Warn "Or add every entry of $RepoDir\hooks\hooks.json to $Settings by hand,"
    Write-Warn 'replacing the "${CLAUDE_PLUGIN_ROOT}" placeholder with the repo path.'
}

# ---------- 6. Hook prerequisites ----------
Write-Host ""
Write-Warn "NOTE (Windows): hooks need node >= 18 on the PATH Claude Code uses."
Write-Warn "  - Node.js: https://nodejs.org/en/download"
Write-Warn "  - Git Bash is no longer on the hook path. It is still required for"
Write-Warn "    scripts/kernel.sh until 2.0: https://git-scm.com/download/win"
Write-Warn "  - jq is no longer needed by this installer, the hooks or the generators;"
Write-Warn "    only scripts/validate-engineos.sh uses it."

# ---------- 7. MCP reminder ----------
Write-Host ""
Write-Host "MCP baseline: see templates/mcp.template.json - add servers with 'claude mcp add'"
Write-Host "or copy entries into settings.json. Use env var references, never literal tokens."
Write-Host ""
Write-Green "EngineOS installed. Restart Claude Code sessions to pick up changes."
