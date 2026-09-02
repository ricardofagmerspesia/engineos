#!/usr/bin/env bash
# Deterministic runtime budgets for EngineOS hot paths. Measures warm medians,
# not single noisy samples. ENGINEOS_PERF_MULTIPLIER may be raised explicitly
# for a known-slow CI host; the published budgets remain the source values.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MULTIPLIER="${ENGINEOS_PERF_MULTIPLIER:-1}"

python3 - "$ROOT" "$MULTIPLIER" <<'PY'
import json
import os
import pathlib
import statistics
import subprocess
import sys
import tempfile
import time

root = pathlib.Path(sys.argv[1])
try:
    multiplier = float(sys.argv[2])
except ValueError:
    raise SystemExit("ENGINEOS_PERF_MULTIPLIER must be numeric")
if multiplier <= 0:
    raise SystemExit("ENGINEOS_PERF_MULTIPLIER must be greater than zero")

prompt = "add a paginated orders endpoint and mirror the screen to mobile"

def median_ms(command, *, stdin=None, samples=5, env=None):
    durations = []
    for _ in range(samples):
        started = time.perf_counter()
        subprocess.run(
            command,
            input=stdin,
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            env=env,
        )
        durations.append((time.perf_counter() - started) * 1000)
    return statistics.median(durations)

measurements = []
measurements.append((
    "route-intent",
    median_ms([str(root / "scripts/kernel.sh"), "route-intent", prompt]),
    250.0,
    "ms",
))
measurements.append((
    "resolve-task",
    median_ms([str(root / "scripts/kernel.sh"), "resolve-task", "--prompt", prompt]),
    500.0,
    "ms",
))
prompt_payload = json.dumps({
    "prompt": prompt,
    "cwd": "/tmp",
    "session_id": "performance-budget",
})
hook_env = os.environ.copy()
hook_env.update({
    "ENGINEOS_BYPASS_FLAG": "/nonexistent/engineos.bypass",
    "ENGINEOS_TELEMETRY": "0",
})
measurements.append((
    "prompt-advisor (end to end)",
    median_ms(
        [str(root / "hooks/prompt-advisor.sh")],
        stdin=prompt_payload,
        env=hook_env,
    ),
    600.0,
    "ms",
))

with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["git", "init", "-q", tmp], check=True)
    target = pathlib.Path(tmp) / "src" / "Button.tsx"
    target.parent.mkdir()
    target.touch()
    payload = json.dumps({
        "tool_input": {"file_path": str(target)},
        "cwd": tmp,
        "session_id": "performance-budget",
    })
    hook = str(root / "hooks/route-before-change.sh")
    subprocess.run(
        [hook], input=payload, text=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        env=hook_env,
    )
    measurements.append((
        "route-before-change (cache hit)",
        median_ms([hook], stdin=payload, samples=7, env=hook_env),
        150.0,
        "ms",
    ))

imports = []
for line in (root / "CLAUDE.md").read_text().splitlines():
    if line.startswith("@rules/"):
        imports.append(root / line[1:])
always_on_bytes = (root / "CLAUDE.md").stat().st_size + sum(
    path.stat().st_size for path in imports
)
measurements.append(("always-on context", always_on_bytes, 32_000.0, "bytes"))

failed = False
print("== EngineOS runtime budgets ==")
for name, actual, budget, unit in measurements:
    effective = budget * multiplier
    status = "ok" if actual < effective else "FAIL"
    if status == "FAIL":
        failed = True
    if unit == "ms":
        print(f"{status:4} {name}: median={actual:.1f}ms budget<{effective:.1f}ms")
    else:
        print(f"{status:4} {name}: {int(actual)} bytes budget<{int(effective)} bytes")

raise SystemExit(1 if failed else 0)
PY
