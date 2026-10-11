# Opt-in tiers

EngineOS ships two optional tiers. Both are **off by default**, live outside the
root bundle, and do nothing unless their flag is set:

| Tier | Flag | Lives in | What it buys |
|---|---|---|---|
| In-process Claude Code adapter | `ENGINEOS_INPROCESS=1` | `adapters/claude-code-mod/` | Hook decisions served by one warm Node host per session, with no per-call `node` spawn from EngineOS |
| Embedding tie-break daemon | `ENGINEOS_EMBED_DAEMON=1` | `tools/embedding-daemon/` (daemon), `src/judge/tiebreak.ts` (client) | A semantic score per candidate intent when the deterministic route is ambiguous |

With both flags unset:
- `dist/engineos.cjs` loads no file under either directory.
- The root `package.json` carries no dependency for either tier.
- The shell hooks in `hooks/hooks.json` behave exactly as before.

The shell hooks remain the contract for every host (Claude Code, Codex, Cursor).
The adapter is an accelerator for Claude Code only.

## In-process adapter (`adapters/claude-code-mod/`)

### Shape

The Claude Code mod runtime runs plugin code without Node APIs. It cannot import
`src/`, which needs `node:fs` and `spawnSync`. The adapter therefore splits in two:

```
Claude Code ──classic.<Event>──▶ mod (hooks/register.ts)
                                   │  $.http.fetch({ socketPath })
                                   ▼
                     host (host/server.ts, bundled to dist/engineos-inprocess.cjs)
                     one Node process per session, imports src/hooks HOOKS
```

**The mod (`hooks/register.ts`, `host-client.ts`, `classic-map.ts`)**
- Registers the five classic events that `hooks/hooks.json` uses: SessionStart,
  UserPromptSubmit, PreToolUse, PostToolUse and Stop.
- On the first event it spawns the host once with `$.process.spawn`. The child
  lives for the session, and the engine kills it when the module unloads.
- Every hook call after that is an HTTP request over a unix socket.

**The host (`host/server.ts`)**
- Reads the route table from `hooks/hooks.json`, so the two carriers cannot drift.
- Runs each hook's `run` function in-process.
- Answers with the same `HookDecision` the shell CLI would have printed.

### Enabling

1. Build the host bundle. This needs the T09 build entry; see "Wiring" below.
   The output is `dist/engineos-inprocess.cjs`.
2. Install the adapter as a plugin, for example
   `claude --plugin-dir adapters/claude-code-mod`.
3. Export `ENGINEOS_INPROCESS=1` in the environment Claude Code starts from.

Optional overrides:
- `ENGINEOS_ROOT` points at the EngineOS checkout. The default is two directories
  above the adapter.
- `ENGINEOS_NODE` names the Node binary. The default is `node` on `PATH`.

### Decision mapping

| `HookDecision` | PreToolUse | Other events |
|---|---|---|
| `silent` | no opinion | nothing |
| `context` | `additionalContext` | `additionalContext` |
| `block` / `fail` | `deny` with the reason | `block` with the reason |
| `ask` | `ask` with the reason | n/a |
| `message` | transcript row (`$.ui.log`) | transcript row |

How the mod combines its answer with the rest of the chain:
- The mod always calls `next(e)`, so the user's own settings hooks still run.
- Answers are merged. On PreToolUse the most restrictive answer wins:
  `deny` > `ask` > `allow`.

### No double-fire: the presence contract

When the flag is set, the shell hooks must stay quiet only while a live host is
actually serving. The host publishes its presence in a private runtime directory:

```
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.json
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.sock
```

The directory and its files are locked down:
- The directory is created `0700`.
- The directory is refused when it is a symlink, owned by another uid, or has
  any group or other bit set.
- The socket is `0600`, and the presence file is written atomically with mode `0600`.

A shell hook exits silently only when all three of these hold:
1. `ENGINEOS_INPROCESS=1`.
2. The presence record for the envelope's `session_id` exists and is valid.
3. `process.kill(pid, 0)` succeeds for the recorded pid.

Every failure mode resolves toward running twice, never toward not running.
`git-write-guard` therefore never silently disappears.

Two more safeguards back this up:
- If the host does not answer a Bash call that looks like `git` or `gh`, the mod
  answers `ask` itself.
- A host that misses its 5 s startup deadline is killed, so it can never publish
  presence late with nobody serving.

### Known gaps (host API)

- **Zero spawns is not reachable while the root plugin's command hooks stay
  registered.** Claude Code still spawns the shell for each command hook in
  `hooks/hooks.json`. The guard makes that spawn exit immediately, but it does not
  remove it.
  - Reaching zero needs one of two things: a host way to disable one plugin's
    command hooks, or installing EngineOS without its `hooks.json` when the
    adapter is on.
  - Answering classic events without `next` is not an option, because it would
    also suppress the user's own hooks.
- `ClassicResult` has no `systemMessage`. `message` decisions become a transcript
  row instead.
- `classic.PreToolUse` carries no `session_id` or `transcript_path`. The mod
  rebuilds the envelope from `$.session.id()` and `$.session.cwd()`, and leaves
  `transcript_path` empty.
- `$.http.fetch` takes no timeout. Deadlines are enforced with `$.clock.sleep`
  and an `AbortController`.

## Embedding tie-break daemon (`tools/embedding-daemon/`)

### What it does

The deterministic router can tie or nearly tie between candidate intents. In
that case, and only then, the prompt advisor may call `tiebreak()` from
`src/judge/tiebreak.ts`. Each call works like this:

1. The client checks the flag, the ambiguity verdict and the candidates. It then
   runs two `lstat` checks on the private socket. If any check fails, it returns
   `skipped` with no further I/O, which keeps it well inside the 50 ms budget.
2. If the socket is present and private, the client:
   - redacts the prompt using the `policy.judge.redaction` patterns;
   - trims the prompt and the candidates to the protocol limits;
   - sends one NDJSON request with a 150 ms deadline.
3. The daemon answers with `scores`, one value in `[0, 1]` per offered intent.
   Each value is the highest cosine similarity between the prompt and that
   intent's registry exemplars.

How the kernel uses the scores:
- The scores have the shape `combine.ts` reserves as `tiebreak`.
- They may only break a tie among intents that are already ranked. They never
  add a new intent and never lower risk.
- Reading them in `combine.ts` is the kernel owner's change.

Model and runtime:

| Item | Value |
|---|---|
| Model | `Xenova/all-MiniLM-L6-v2` at revision `751bff37182d3f1213fa05d7196b954e230abad9` |
| Weights | int8 (`q8`), mean pooling, normalized vectors |
| Load timing | loaded **before** the socket is bound, so an existing socket means a warm model |
| Model change | requires a new revision constant and a recalibration in the approved eval stage |

### Installing (approved final stage only)

The daemon is a separate package. It is deliberately **not** a workspace of the
root package, so the root lockfile never pulls `onnxruntime-node`:

```sh
npm --prefix tools/embedding-daemon ci   # after its lockfile is created and reviewed
```

`tools/embedding-daemon/.npmrc` sets `onnxruntime-node-install=skip`. This
disables the `onnxruntime-node` postinstall script, which would otherwise
download CUDA libraries from NuGet on linux/x64. The CPU binaries ship inside
the package, so the daemon needs nothing from that download.

### Running

```sh
ENGINEOS_EMBED_DAEMON=1 npm --prefix tools/embedding-daemon start
```

This needs Node 22.6 or later, because the daemon runs its TypeScript through
`--experimental-strip-types`.

The daemon is controlled by these environment variables:

| Variable | Default | Effect |
|---|---|---|
| `ENGINEOS_EMBED_DAEMON` | unset | Must be `1`, otherwise the daemon prints a notice and exits 0 |
| `ENGINEOS_EMBED_CACHE` | `$XDG_CACHE_HOME/engineos/models` (or `~/.cache/...`) | Model cache directory |
| `ENGINEOS_EMBED_OFFLINE` | unset | `1` never contacts the Hugging Face hub; the model must already be cached |
| `ENGINEOS_EMBED_IDLE_MINUTES` | `120` | Exits after this long with no connection |

The client reads `ENGINEOS_EMBED_DAEMON` too. Leave it unset in a session that
should never consult the daemon, even when one is running.

### Socket and limits

The socket path is `<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/embed.sock`.
- It uses the same private-directory rule as the adapter.
- The socket is `0600`, and no TCP port is ever opened.
- There is one daemon per user. A second start finds the socket answering and
  exits 0.

The protocol is one JSON line per connection. The daemon refuses oversize input
rather than trimming it; the client trims before sending:

| Limit | Value |
|---|---|
| Request line | 64 KiB |
| Prompt text | 2,000 characters |
| Candidates | 10 |
| Exemplars per candidate | 10, at most 300 characters each |
| Pending inference queue | 8 (then `busy`) |
| Connection timeout | 5 s |

The daemon logs counts and timings only. Prompt text, exemplars and scores never
reach its logs.

### Client outcomes

| Outcome | Meaning |
|---|---|
| `scores` | The daemon answered; `scores`, `model`, `latency_ms` |
| `skipped: disabled` | Flag unset |
| `skipped: not-ambiguous` | The deterministic route was final |
| `skipped: no-candidates` | No offered intent had exemplars, or redaction left no text |
| `skipped: no-socket` | No daemon is running (or no POSIX uid) |
| `skipped: unsafe-socket` | The directory or socket fails the privacy rule |
| `skipped: oversize` | The bounded request still exceeds the line limit |
| `failed: timeout / network / busy / invalid-response` | The daemon was present but did not give a usable answer |

Only `scores` may influence routing. Every other outcome leaves the
deterministic answer untouched.

## Troubleshooting

| Symptom | Check |
|---|---|
| Hooks fire twice with the adapter on | Expected while the host is starting or after it exits. Check the debug log for `host-exited`, and check that `dist/engineos-inprocess.cjs` exists |
| Hooks never fire from the adapter | Check that `ENGINEOS_INPROCESS=1` is visible to Claude Code (`$.env`), and check the host's stderr in the debug log |
| `socket path is over 100 bytes` | Set `XDG_RUNTIME_DIR` to a short private directory, for example `/run/user/<uid>` |
| `... is reachable by other users` | Remove the stale `engineos-<uid>` directory. It was created by something else with loose permissions |
| Tie-break always `skipped: no-socket` | Start the daemon, and wait for its `ready` log line (the model loads first) |
| Daemon fails in offline mode | Run it once online to fill `ENGINEOS_EMBED_CACHE`, or copy the pinned revision into the cache |

## Wiring owned elsewhere

These changes belong to other owners and are tracked as wiring requests, not
done in these directories:
- The build entry for `dist/engineos-inprocess.cjs`.
- The shell-side presence guard in the hook entry adapters.
- `combine.ts` reading `tiebreak`, and the prompt advisor calling `tiebreak()`.
- The new policy keys `router.tiebreak.{min_similarity, margin}`.
- COMPATIBILITY entries for the new environment variables.
- `.gitignore` entries for the daemon's `node_modules` and model cache.
