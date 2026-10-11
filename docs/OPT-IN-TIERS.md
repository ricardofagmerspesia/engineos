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

1. Have the host bundle `dist/engineos-inprocess.cjs` in the checkout. It is
   committed together with `dist/engineos-hot.cjs` and `dist/runtime/*.cjs` by
   the approved final build of this change, so a released tree carries it.
   `engineos validate` reports any `hooks/hooks.json` command whose
   `${CLAUDE_PLUGIN_ROOT}/<path>` script is missing from the tree (a finding of
   the existing hooks.json check in `src/checks/kernel-router.ts`).
2. Install the adapter as a plugin, for example
   `claude --plugin-dir adapters/claude-code-mod`.
3. Export `ENGINEOS_INPROCESS=1` in the environment Claude Code starts from.

Optional overrides. Each one must be an **absolute path**; a relative or empty
value is ignored and the default is used:
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

### Avoiding double-fire: the presence contract

With the flag set, a shell hook may stand down only for a hook that a live host
is actually serving for that session. The contract has one exception, and it
comes first.

**`git-write-guard` never stands down.** The shell copy of the guard always
runs, whatever the presence record says. With the adapter on, the guard can
therefore fire twice on one Bash call: once from the host and once from the
shell. That is harmless. Both answers are `ask`, and the asks fold into one
permission prompt. The guard is the developer's safety net (`rules/git.md`), so
no presence record, however valid, can silence it.

**Every other hook** stands down only behind a live presence record. The host
publishes the record in a private runtime directory:

```
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.json
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.sock
```

These path and privacy rules have one home, `src/lib/runtime-dir.ts`. The host's
presence writer, the shell-side guard (`src/hooks/adapter.ts`) and the tie-break
client (`src/judge/tiebreak.ts`) all import it. The daemon package cannot import
`src/`, so it keeps its own copy of the directory rule.

The directory and its files are locked down:
- The directory is created `0700`.
- The directory is refused when it is a symlink, owned by another uid, or has
  any group or other bit set.
- The socket is `0600`, and the presence file is written atomically with mode `0600`.

The record is version 2:

```json
{ "v": 2, "pid": 41237, "socket": "<path>", "session": "<id>", "started_at": 1760140800000,
  "served": ["<hook name>", "..."], "root": "<checkout>", "version": "<engineos version>" }
```

- `served` lists the hooks the host actually serves.
- `root` and `version` record which checkout and EngineOS version the host loaded.
- A version-1 record, or any record missing a field, is not a presence record.

**When the record is written.** The host does not write it when the socket
starts listening. It writes it only after the mod's first `GET /v1/routes`
handshake. A host that is listening but has not yet been reached by its mod
leaves no record, so the shell keeps running every hook.

**When a shell hook stands down.** A shell hook exits silently only when every
one of these holds:
1. The hook is not `git-write-guard`.
2. `ENGINEOS_INPROCESS=1`.
3. The envelope carries a raw `session_id` matching `^[A-Za-z0-9._-]{1,128}$`.
4. The platform has a POSIX uid.
5. The runtime directory passes the privacy rule above.
6. The presence file is a regular file, owned by this uid, with no group or
   other bits. It is opened without following a symlink, and it is at most
   4 KiB.
7. The record parses as version 2 with every field present and typed, and its
   pid is a positive integer.
8. The record's `session` equals the envelope's `session_id`, and its `socket`
   equals the expected socket path.
9. A socket owned by this uid exists at that path.
10. The recorded pid is not the hook's own pid.
11. `process.kill(pid, 0)` succeeds for the recorded pid.
12. The hook's name appears in the record's `served` list.

Any failed condition, and any exception, runs the hook normally. Every failure
mode therefore resolves toward running twice, never toward not running.

**The mod's own git fallback.** The mod answers `ask` itself on a Bash call that
may name `git` or `gh` whenever the host cannot answer for it:
- the host is not ready (still starting, failed, timed out or exited);
- the host returned no answer for the call;
- no hook is routed to the call.

The test strips quotes and backslashes (`'`, `"`, `\`) from the command and then
looks for `git` or `gh` anywhere. That is the same over-inclusive test as
`mayNameGitTool` in `src/hooks/git-write-guard.ts`. The mod cannot import `src/`,
so it carries a commented copy. The test may ask on a command that is not a git
write, but it never lets one through unseen.

One more safeguard: a host that misses its 5 s startup deadline is killed. It
never completes the handshake, so it never publishes presence with nobody
serving.

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
   - caps the prompt at twice the prompt-text limit (4,000 characters) before
     redaction, so the redaction patterns never run over unbounded input;
   - redacts it using the `policy.judge.redaction` patterns (the same set the
     judge uses; see the ADR's "Threat model and redaction");
   - trims the redacted prompt and the candidates to the protocol limits;
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
npm --prefix tools/embedding-daemon ci --ignore-scripts
```

- **The lockfile is pending.** `npm ci` needs
  `tools/embedding-daemon/package-lock.json`. Generating it needs network access
  and an install, so it is deferred to the approved final stage of this change
  under explicit consent. Until that lockfile is committed and reviewed, the
  daemon is not installable.
- **Always pass `--ignore-scripts`.** It stops every dependency's lifecycle
  scripts, including the `onnxruntime-node` postinstall, which would otherwise
  download CUDA libraries from NuGet on linux/x64. The CPU binaries ship inside
  the package, so the daemon needs nothing from that download.
  `tools/embedding-daemon/.npmrc` also sets `onnxruntime-node-install=skip`, as
  a second guard for an install run without the flag.

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
| `ENGINEOS_EMBED_CACHE` | `$XDG_CACHE_HOME/engineos/models` (or `~/.cache/...`) | Model cache root. The model is stored in a subdirectory per pinned revision, so a revision bump never reads weights cached for another revision |
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

## Related: the V8 compile cache

This is not an opt-in tier, but it is a local cache, so its privacy rule is
recorded here. The committed loaders in front of `dist/runtime/` (generated by
`scripts/build.mjs`) enable V8's compile cache on node 22.8 and later. They use
it only in a private per-user directory:
- The loader creates the directory `0700`.
- It then verifies that the directory is owned by the current uid, has no group
  or other bits, and is not a symlink.
- When any check fails, the loader skips the cache and runs uncached. It never
  falls back to a shared directory.

`NODE_DISABLE_COMPILE_CACHE=1` still turns the cache off.

## Troubleshooting

| Symptom | Check |
|---|---|
| `git-write-guard` asks twice, or fires from both host and shell | Expected: the guard never stands down. The two asks fold into one permission prompt |
| Other hooks fire twice with the adapter on | Expected while the host is starting, before the mod's first `GET /v1/routes` handshake, or after the host exits. Expected too for a hook missing from the record's `served` list. Check the debug log for `host-exited`, and check that `dist/engineos-inprocess.cjs` exists |
| `ENGINEOS_ROOT` or `ENGINEOS_NODE` seems ignored | Both must be absolute paths; a relative value falls back to the default |
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
