"use strict";

// src/hot-cli.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs18 = require("node:fs");

// src/io.ts
var import_node_fs = require("node:fs");
function processIo() {
  let consumed = false;
  return {
    readStdin() {
      if (consumed) return "";
      consumed = true;
      try {
        return (0, import_node_fs.readFileSync)(0, "utf8");
      } catch {
        return "";
      }
    },
    out(text2) {
      process.stdout.write(text2);
    },
    err(text2) {
      process.stderr.write(text2);
    },
    env: process.env,
    cwd: () => process.cwd()
  };
}
function writeJson(io2, value) {
  io2.out(`${JSON.stringify(value, null, 2)}
`);
}

// src/node-guard.ts
var import_node_fs2 = require("node:fs");
var import_node_path = require("node:path");
var MIN_NODE_MAJOR = 18;
var SILENT_HOOKS = /* @__PURE__ */ new Set(["route-before-change", "mark-unrecorded", "record-verify", "prompt-advisor"]);
function currentMajor(versions = process.versions.node) {
  const major = Number.parseInt(versions.split(".")[0] ?? "0", 10);
  return Number.isNaN(major) ? 0 : major;
}
function toComponent(part) {
  const n = Number.parseInt(part ?? "0", 10);
  return Number.isNaN(n) ? 0 : n;
}
function parseVersion(dirName) {
  const parts = dirName.replace(/^v/, "").split(".");
  return [toComponent(parts[0]), toComponent(parts[1]), toComponent(parts[2])];
}
function defaultIsExecutable(path) {
  try {
    (0, import_node_fs2.accessSync)(path, import_node_fs2.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findNewerNode(env, exists, listDir, isExecutable2 = defaultIsExecutable) {
  const nvmDir = env["NVM_DIR"] ?? (0, import_node_path.join)(env["HOME"] ?? "", ".nvm");
  const versionsDir = (0, import_node_path.join)(nvmDir, "versions", "node");
  if (exists(versionsDir)) {
    let names;
    try {
      names = listDir(versionsDir);
    } catch {
      names = [];
    }
    const candidates = names.filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR).sort((a, b) => {
      const av = parseVersion(a);
      const bv = parseVersion(b);
      return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
    });
    for (const v of candidates) {
      const bin = (0, import_node_path.join)(versionsDir, v, "bin", "node");
      if (exists(bin) && isExecutable2(bin)) return bin;
    }
  }
  for (const bin of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (exists(bin) && isExecutable2(bin)) return bin;
  }
  return null;
}
function guardOutcome(argv2, nodeVersion, newer) {
  if (currentMajor(nodeVersion) >= MIN_NODE_MAJOR) return { kind: "proceed" };
  if (newer !== null) return { kind: "reexec", bin: newer };
  if (argv2[0] === "hook") {
    const hookName = argv2[1] ?? "";
    if (SILENT_HOOKS.has(hookName)) return { kind: "silent" };
    return { kind: "skip", message: `[engineos] ${argv2[1] ?? "hook"} skipped: node >= ${MIN_NODE_MAJOR} required (found v${nodeVersion})` };
  }
  return { kind: "refuse", message: `node >= ${MIN_NODE_MAJOR} required, found v${nodeVersion}` };
}

// src/dispatch.ts
function dispatch(table2, argv2, io2) {
  const [name, ...rest] = argv2;
  if (name === "--version" || name === "-v") {
    const v = true ? "1.7.0" : readPackageVersion();
    io2.out(`engineos ${v}
`);
    return 0;
  }
  const command = name === void 0 ? void 0 : table2[name];
  if (command === void 0) {
    writeJson(io2, { error: `unknown command: ${name ?? ""}` });
    return 1;
  }
  return command(rest, io2);
}
function exitWith(result, exit) {
  if (typeof result === "number") {
    exit(result);
    return;
  }
  void result.then(
    (code) => exit(code),
    () => exit(0)
  );
}

// src/hooks/output.ts
var silent = { kind: "silent" };
function context(event, text2) {
  return { kind: "context", event, text: text2 };
}
function ask(reason) {
  return { kind: "ask", event: "PreToolUse", reason };
}
function message(text2) {
  return { kind: "message", text: text2 };
}
function fail(stderr) {
  return { kind: "fail", stderr };
}
function render(decision, io2) {
  switch (decision.kind) {
    case "silent":
      return 0;
    case "context":
      io2.out(`${JSON.stringify({ hookSpecificOutput: { hookEventName: decision.event, additionalContext: decision.text } })}
`);
      return 0;
    case "block":
      io2.out(`${JSON.stringify({ decision: "block", reason: decision.reason })}
`);
      return 0;
    case "ask":
      io2.out(
        `${JSON.stringify({
          hookSpecificOutput: { hookEventName: decision.event, permissionDecision: "ask", permissionDecisionReason: decision.reason }
        })}
`
      );
      return 0;
    case "message":
      io2.out(`${JSON.stringify({ systemMessage: decision.text })}
`);
      return 0;
    case "fail":
      io2.err(`${decision.stderr}
`);
      return 2;
  }
}

// src/hooks/adapter.ts
var import_node_fs6 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path4 = require("node:path");

// src/lib/runtime-dir.ts
var import_node_crypto = require("node:crypto");
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path2 = require("node:path");
var GROUP_OTHER_BITS = 63;
var PRESENCE_VERSION = 2;
var HOST_SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;
var PRESENCE_STALE_MS = 3e4;
var SESSION_KEY_HEX = 16;
var HOOK_NAME = /^[a-z][a-z0-9-]{0,63}$/;
var MAX_SERVED_HOOKS = 64;
var MAX_ROOT_CHARS = 4096;
var MAX_VERSION_CHARS = 64;
function runtimeDir(env, uid, fallback = import_node_os.tmpdir) {
  const base = nonEmpty(env["XDG_RUNTIME_DIR"]) ?? nonEmpty(env["TMPDIR"]) ?? fallback();
  return (0, import_node_path2.join)(base, `engineos-${uid}`);
}
function sessionPaths(dir, sessionId) {
  const key = (0, import_node_crypto.createHash)("sha256").update(sessionId).digest("hex").slice(0, SESSION_KEY_HEX);
  return { socket: (0, import_node_path2.join)(dir, `h-${key}.sock`), presence: (0, import_node_path2.join)(dir, `h-${key}.json`) };
}
function isPrivateDir(facts, uid) {
  return facts !== null && facts.kind === "directory" && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}
function isPrivateFile(facts, uid) {
  return facts !== null && facts.kind === "file" && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}
function lstatFacts(path) {
  const stat = (0, import_node_fs3.lstatSync)(path, { throwIfNoEntry: false });
  return stat === void 0 ? null : statFacts(stat);
}
function readPrivateFile(path, maxBytes) {
  let fd;
  try {
    fd = (0, import_node_fs3.openSync)(path, import_node_fs3.constants.O_RDONLY | import_node_fs3.constants.O_NOFOLLOW | import_node_fs3.constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const stat = (0, import_node_fs3.fstatSync)(fd);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(maxBytes + 1);
    const read = (0, import_node_fs3.readSync)(fd, buffer, 0, maxBytes + 1, 0);
    if (read > maxBytes) return null;
    return { facts: statFacts(stat), text: buffer.toString("utf8", 0, read), mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  } finally {
    (0, import_node_fs3.closeSync)(fd);
  }
}
function parsePresence(text2) {
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record2 = { ...parsed };
  const { pid, socket, session, started_at: startedAt, root, version } = record2;
  if (record2["v"] !== PRESENCE_VERSION || typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) return null;
  if (typeof socket !== "string" || typeof session !== "string" || session === "" || typeof startedAt !== "number") return null;
  if (!boundedString(root, MAX_ROOT_CHARS) || !root.startsWith("/") || !boundedString(version, MAX_VERSION_CHARS)) return null;
  const served = servedHooks(record2["served"]);
  if (served === null) return null;
  return { v: PRESENCE_VERSION, pid, socket, session, started_at: startedAt, served, root, version };
}
function servedHooks(value) {
  if (!Array.isArray(value) || value.length > MAX_SERVED_HOOKS) return null;
  const names = [];
  for (const item of value) {
    if (typeof item !== "string" || !HOOK_NAME.test(item)) return null;
    names.push(item);
  }
  return names;
}
function boundedString(value, maxChars) {
  return typeof value === "string" && value !== "" && value.length <= maxChars;
}
function statFacts(stat) {
  const kind = stat.isSymbolicLink() ? "symlink" : stat.isSocket() ? "socket" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
  return { kind, uid: stat.uid, mode: stat.mode };
}
function nonEmpty(value) {
  return value === void 0 || value === "" ? null : value;
}

// src/hooks/envelope.ts
var import_node_child_process = require("node:child_process");

// src/lib/json.ts
var import_node_fs4 = require("node:fs");
var KernelError = class extends Error {
  kind = "kernel";
};
function readJsonFile(path) {
  let text2;
  try {
    text2 = (0, import_node_fs4.readFileSync)(path, "utf8");
  } catch {
    throw new KernelError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text2);
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
}
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/registry/paths.ts
var import_node_fs5 = require("node:fs");
var import_node_path3 = require("node:path");
function resolveRoot(env, startDir = __dirname) {
  const forced = env["ENGINEOS_ROOT"];
  if (forced !== void 0 && forced !== "") return forced;
  let dir = startDir;
  for (; ; ) {
    if ((0, import_node_fs5.existsSync)((0, import_node_path3.join)(dir, "registries", "routing.json"))) return dir;
    const parent = (0, import_node_path3.dirname)(dir);
    if (parent === dir) throw new KernelError("cannot locate the EngineOS root (no registries/routing.json above the runtime)");
    dir = parent;
  }
}

// src/hooks/envelope.ts
var NO_SESSION = "nosession";
function text(value) {
  return typeof value === "string" ? value : "";
}
function nested(payload, outer, inner) {
  const child = payload[outer];
  return isRecord(child) ? child[inner] : void 0;
}
function readEnvelope(io2) {
  let parsed;
  try {
    parsed = JSON.parse(io2.readStdin());
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const sessionId = text(parsed["session_id"]);
  return {
    cwd: text(parsed["cwd"]),
    sessionId: sessionId === "" ? NO_SESSION : sessionId,
    prompt: text(parsed["prompt"]),
    file: text(nested(parsed, "tool_input", "file_path")),
    tool: text(parsed["tool_name"]),
    transcriptPath: text(parsed["transcript_path"]),
    stopHookActive: parsed["stop_hook_active"] === true,
    raw: parsed
  };
}
function hookContext(env, io2, spawn = import_node_child_process.spawnSync) {
  void env;
  return {
    io: io2,
    root: resolveRoot(io2.env),
    now: Date.now,
    spawn
  };
}

// src/hooks/adapter.ts
var INPROCESS_ENV = "ENGINEOS_INPROCESS";
var INPROCESS_VALUE = "1";
var MAX_PRESENCE_BYTES = 4096;
var NEVER_SILENCED = /* @__PURE__ */ new Set(["git-write-guard"]);
var MAX_ROOT_DEPTH = 8;
function nodeInProcessGuardDeps() {
  return {
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    pid: process.pid,
    tmpdir: import_node_os2.tmpdir,
    lstat: lstatFacts,
    readPrivateFile,
    probe: (pid) => {
      process.kill(pid, 0);
    },
    now: () => Date.now(),
    version: true ? "1.7.0" : null,
    root: () => registeringRoot(__dirname)
  };
}
function runHookWith(hooks, unknownHint = "", guard = nodeInProcessGuardDeps()) {
  return (argv2, io2) => {
    const name = argv2[0];
    const hook = name === void 0 ? void 0 : hooks[name];
    if (name === void 0 || hook === void 0) {
      return render(fail(`engineos hook: unknown hook: ${name ?? ""}${unknownHint}
`), io2);
    }
    const env = readEnvelope(io2);
    if (env === null) return render(silent, io2);
    if (servedInProcess({ hook: name, envelope: env, env: io2.env }, guard)) return render(silent, io2);
    try {
      const decision = hook(env, hookContext(env, io2));
      if (decision instanceof Promise) {
        return decision.then(
          (settled) => render(settled, io2),
          (e) => failed(name, e, io2)
        );
      }
      return render(decision, io2);
    } catch (e) {
      return failed(name, e, io2);
    }
  };
}
function servedInProcess(query, deps) {
  try {
    if (NEVER_SILENCED.has(query.hook)) return false;
    if (query.env[INPROCESS_ENV] !== INPROCESS_VALUE) return false;
    const sessionId = rawSessionId(query.envelope.raw);
    if (sessionId === null || deps.uid === null || deps.version === null) return false;
    const dir = runtimeDir(query.env, deps.uid, deps.tmpdir);
    if (!isPrivateDir(deps.lstat(dir), deps.uid)) return false;
    const paths = sessionPaths(dir, sessionId);
    const file = deps.readPrivateFile(paths.presence, MAX_PRESENCE_BYTES);
    if (file === null || !isPrivateFile(file.facts, deps.uid)) return false;
    const record2 = parsePresence(file.text);
    if (record2 === null || record2.session !== sessionId || record2.socket !== paths.socket) return false;
    if (!record2.served.includes(query.hook) || record2.version !== deps.version) return false;
    if (Math.abs(deps.now() - file.mtimeMs) > PRESENCE_STALE_MS) return false;
    const socket = deps.lstat(paths.socket);
    if (socket === null || socket.kind !== "socket" || socket.uid !== deps.uid) return false;
    if (record2.pid === deps.pid) return false;
    deps.probe(record2.pid);
    const root = deps.root();
    return root !== null && root === record2.root;
  } catch {
    return false;
  }
}
function registeringRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < MAX_ROOT_DEPTH; depth += 1) {
    if ((0, import_node_fs6.existsSync)((0, import_node_path4.join)(dir, "hooks", "hooks.json"))) return (0, import_node_fs6.realpathSync)(dir);
    const parent = (0, import_node_path4.dirname)(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function rawSessionId(raw) {
  if (typeof raw !== "object" || raw === null || !("session_id" in raw)) return null;
  const value = raw.session_id;
  return typeof value === "string" && HOST_SESSION_ID.test(value) ? value : null;
}
function failed(name, e, io2) {
  io2.err(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}
`);
  return render(silent, io2);
}

// src/hooks/git-write-guard.ts
function gitWriteSetting(env) {
  return env["ENGINEOS_GIT_WRITES"] === "auto" ? "auto" : "ask";
}
var READ_ONLY_GIT = /* @__PURE__ */ new Set([
  "status",
  "log",
  "diff",
  "show",
  "blame",
  "branch",
  "remote",
  "rev-parse",
  "ls-files",
  "check-ignore",
  "describe",
  "shortlog",
  "cat-file",
  "config",
  "merge-base",
  "stash",
  "tag"
]);
var WRAPPER_WORDS = /* @__PURE__ */ new Set([
  "!",
  "{",
  "}",
  "if",
  "then",
  "else",
  "elif",
  "while",
  "until",
  "do",
  "time",
  "command",
  "exec",
  "env",
  "nohup",
  "xargs",
  "sudo"
]);
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
var GIT_VALUE_OPTIONS = /* @__PURE__ */ new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"]);
var GH_VALUE_OPTIONS = /* @__PURE__ */ new Set(["-R", "--repo", "--hostname"]);
function gitCalls(command) {
  const segments = segmentsOf(command);
  if (segments === null) return null;
  const calls = [];
  for (const segment of segments) {
    const call = callOf(segment);
    if (call !== null) calls.push(call);
  }
  return calls;
}
function segmentsOf(command) {
  const scan = { segments: [], current: [], token: null, dropNext: false };
  const stack = [];
  const text2 = command;
  let i = 0;
  while (i < text2.length) {
    const ch = text2[i] ?? "";
    const next = text2[i + 1] ?? "";
    if (stack[stack.length - 1] === "dq") {
      if (ch === "\\") {
        append(scan, '$`"\\\n'.includes(next) ? next : `\\${next}`);
        i += 2;
        continue;
      }
      if (ch === '"') {
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === "$" && next === "(") {
        stack.push("subst");
        endSegment(scan);
        i += 2;
        continue;
      }
      append(scan, ch);
      i += 1;
      continue;
    }
    switch (ch) {
      case " ":
      case "	":
      case "\r":
        flush(scan);
        i += 1;
        continue;
      case "\n":
        endSegment(scan);
        i += 1;
        continue;
      case "'": {
        const close = text2.indexOf("'", i + 1);
        if (close === -1) return null;
        append(scan, text2.slice(i + 1, close));
        i = close + 1;
        continue;
      }
      case '"':
        stack.push("dq");
        append(scan, "");
        i += 1;
        continue;
      case "\\":
        if (next === "\n") {
          flush(scan);
          i += 2;
          continue;
        }
        if (next === "") {
          append(scan, "\\");
          i += 1;
          continue;
        }
        append(scan, next);
        i += 2;
        continue;
      case "#":
        if (scan.token === null) {
          const eol = text2.indexOf("\n", i);
          endSegment(scan);
          i = eol === -1 ? text2.length : eol + 1;
          continue;
        }
        append(scan, ch);
        i += 1;
        continue;
      case ";":
        endSegment(scan);
        i += 1;
        continue;
      case "&":
        if (next === "&") {
          endSegment(scan);
          i += 2;
          continue;
        }
        if (next === ">") {
          i = redirect(scan, text2, i);
          continue;
        }
        endSegment(scan);
        i += 1;
        continue;
      case "|":
        endSegment(scan);
        i += next === "|" || next === "&" ? 2 : 1;
        continue;
      case "$":
        if (next === "(") {
          stack.push("subst");
          endSegment(scan);
          i += 2;
          continue;
        }
        append(scan, ch);
        i += 1;
        continue;
      case "(":
        endSegment(scan);
        i += 1;
        continue;
      case ")":
        endSegment(scan);
        if (stack[stack.length - 1] === "subst") stack.pop();
        i += 1;
        continue;
      case "`":
        endSegment(scan);
        i += 1;
        continue;
      case "<":
        if (next === "<") {
          if (text2[i + 2] === "<") {
            flush(scan);
            scan.dropNext = true;
            i += 3;
            continue;
          }
          return null;
        }
        i = redirect(scan, text2, i);
        continue;
      case ">":
        i = redirect(scan, text2, i);
        continue;
      default:
        append(scan, ch);
        i += 1;
    }
  }
  if (stack.includes("dq")) return null;
  endSegment(scan);
  return scan.segments;
}
function redirect(scan, text2, i) {
  if (scan.token !== null && /^\d+$/.test(scan.token)) scan.token = null;
  else flush(scan);
  let j = i;
  while (j < text2.length && "<>&|".includes(text2[j] ?? "")) j += 1;
  const operator = text2.slice(i, j);
  const dup = /^[-\d]+/.exec(text2.slice(j));
  if (operator.endsWith("&") && dup !== null) return j + dup[0].length;
  scan.dropNext = true;
  return j;
}
function append(scan, piece) {
  scan.token = (scan.token ?? "") + piece;
}
function flush(scan) {
  if (scan.token === null) return;
  if (scan.dropNext) scan.dropNext = false;
  else scan.current.push(scan.token);
  scan.token = null;
}
function endSegment(scan) {
  flush(scan);
  scan.dropNext = false;
  if (scan.current.length > 0) scan.segments.push(scan.current);
  scan.current = [];
}
function callOf(segment) {
  let start = 0;
  while (start < segment.length) {
    const word = segment[start] ?? "";
    if (WRAPPER_WORDS.has(word) || ASSIGNMENT.test(word) || word.startsWith("-")) start += 1;
    else break;
  }
  const head = segment[start];
  if (head === void 0) return null;
  const tool = basename(head);
  if (tool !== "git" && tool !== "gh") return null;
  const valued = tool === "git" ? GIT_VALUE_OPTIONS : GH_VALUE_OPTIONS;
  let at = start + 1;
  while (at < segment.length) {
    const word = segment[at] ?? "";
    if (valued.has(word)) at += 2;
    else if (word.startsWith("-")) at += 1;
    else break;
  }
  return { tool, subcommand: segment[at] ?? "", args: segment.slice(at + 1) };
}
function basename(word) {
  const cut = word.lastIndexOf("/");
  return cut === -1 ? word : word.slice(cut + 1);
}
var BRANCH_LISTING = /* @__PURE__ */ new Set(["-l", "--list", "-a", "--all", "-r", "--remotes", "--show-current", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at"]);
var BRANCH_WRITING = /* @__PURE__ */ new Set(["-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-f", "--force", "-t", "--track", "--no-track"]);
var TAG_LISTING = /* @__PURE__ */ new Set(["-l", "--list", "-n", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "-v", "--verify", "-i", "--ignore-case"]);
var TAG_WRITING = /* @__PURE__ */ new Set(["-a", "--annotate", "-s", "--sign", "-u", "--local-user", "-m", "--message", "-F", "--file", "-d", "--delete", "-f", "--force", "-e", "--edit", "--create-reflog"]);
var REMOTE_READS = /* @__PURE__ */ new Set(["-v", "--verbose", "show", "get-url"]);
var CONFIG_READ_FLAGS = /* @__PURE__ */ new Set(["--get", "--get-all", "--get-regexp", "--list", "-l"]);
var CONFIG_WRITE_FLAGS = /* @__PURE__ */ new Set(["--unset", "--unset-all", "--add", "--replace-all", "--edit", "-e", "--remove-section", "--rename-section"]);
var CONFIG_READ_VERBS = /* @__PURE__ */ new Set(["get", "list"]);
var GH_PR_WRITES = /* @__PURE__ */ new Set(["create", "merge", "close", "edit", "comment", "review", "checkout", "ready", "reopen", "lock", "unlock", "update-branch"]);
var GH_ISSUE_WRITES = /* @__PURE__ */ new Set(["create", "close", "edit", "comment", "reopen", "delete", "transfer", "pin", "unpin", "lock", "unlock", "develop"]);
var GH_ALWAYS_WRITE = /* @__PURE__ */ new Set(["release", "repo", "secret", "variable"]);
var GH_API_WRITE_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
function isWrite(call) {
  return call.tool === "git" ? isGitWrite(call) : isGhWrite(call);
}
function isGitWrite(call) {
  const { subcommand, args } = call;
  if (subcommand === "") return false;
  if (!READ_ONLY_GIT.has(subcommand)) return true;
  switch (subcommand) {
    case "branch":
      return inspectsRefs(args, BRANCH_LISTING, BRANCH_WRITING);
    case "tag":
      return inspectsRefs(args, TAG_LISTING, TAG_WRITING);
    case "stash":
      return args[0] !== "list";
    case "remote":
      return args.length > 0 && !REMOTE_READS.has(args[0] ?? "");
    case "config":
      return isConfigWrite(args);
    default:
      return false;
  }
}
function inspectsRefs(args, listing, writing) {
  const flags = args.filter((arg) => arg.startsWith("-")).map(flagName);
  if (flags.some((flag2) => writing.has(flag2))) return true;
  if (flags.some((flag2) => listing.has(flag2))) return false;
  return args.some((arg) => !arg.startsWith("-"));
}
function isConfigWrite(args) {
  const flags = args.filter((arg) => arg.startsWith("-")).map(flagName);
  if (flags.some((flag2) => CONFIG_WRITE_FLAGS.has(flag2))) return true;
  if (flags.some((flag2) => CONFIG_READ_FLAGS.has(flag2))) return false;
  const positionals = args.filter((arg) => !arg.startsWith("-"));
  if (positionals.length > 0 && CONFIG_READ_VERBS.has(positionals[0] ?? "")) return false;
  return positionals.length > 1;
}
function flagName(arg) {
  const eq = arg.indexOf("=");
  return eq === -1 ? arg : arg.slice(0, eq);
}
function isGhWrite(call) {
  const { subcommand, args } = call;
  const action = args[0] ?? "";
  if (GH_ALWAYS_WRITE.has(subcommand)) return true;
  if (subcommand === "pr") return GH_PR_WRITES.has(action);
  if (subcommand === "issue") return GH_ISSUE_WRITES.has(action);
  if (subcommand === "api") return isGhApiWrite(args);
  return false;
}
function isGhApiWrite(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    const name = flagName(arg);
    if (name === "-X" || name === "--method") {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[i + 1] ?? "";
      if (GH_API_WRITE_METHODS.has(value.toUpperCase())) return true;
    }
    if (name === "-f" || name === "-F" || name === "--field" || name === "--raw-field" || name === "--input") return true;
  }
  return false;
}
var GIT_MENTION = /\b(git|gh)\s/;
var SETTING_NOTE = "ENGINEOS_GIT_WRITES=ask";
var MAY_NAME_TOOL = /g(?:it|h)/;
var WORD_QUOTING = /['"\\]/g;
function mayNameGitTool(command) {
  return MAY_NAME_TOOL.test(command.replace(WORD_QUOTING, ""));
}
function gitWriteGuard(env, ctx) {
  try {
    return decide(env, ctx.io.env);
  } catch {
    return silent;
  }
}
var run = gitWriteGuard;
function decide(env, processEnv) {
  if (gitWriteSetting(processEnv) === "auto") return silent;
  if (env.tool !== "Bash") return silent;
  const command = commandOf(env);
  if (command === null) return silent;
  if (!mayNameGitTool(command)) return silent;
  const calls = gitCalls(command);
  if (calls === null) {
    return GIT_MENTION.test(command) ? ask(`[engineos] git write: unparsable command containing git/gh \u2014 ${SETTING_NOTE}`) : silent;
  }
  const write = calls.find(isWrite);
  if (write === void 0) return silent;
  return ask(`[engineos] git write: ${label(write)} \u2014 ${SETTING_NOTE} (set auto in settings.local.json to disable)`);
}
function commandOf(env) {
  if (!isRecord(env.raw)) return null;
  const input = env.raw["tool_input"];
  if (!isRecord(input)) return null;
  const command = input["command"];
  return typeof command === "string" ? command : null;
}
function label(call) {
  const action = call.tool === "gh" && call.args[0] !== void 0 && !call.args[0].startsWith("-") ? ` ${call.args[0]}` : "";
  return `${call.tool} ${call.subcommand}${action}`;
}

// src/hooks/route-before-change.ts
var import_node_fs12 = require("node:fs");
var import_node_path9 = require("node:path");

// src/registry/load.ts
var import_node_fs7 = require("node:fs");
var import_node_path5 = require("node:path");
function registryPath(root, name) {
  const p = (0, import_node_path5.join)(root, "registries", name);
  if (!(0, import_node_fs7.existsSync)(p)) throw new KernelError(`registry missing: registries/${name}`);
  return p;
}
function loadRegistry(root, name) {
  return readJsonFile(registryPath(root, name));
}

// src/registry/models.ts
var MODEL_TIER_IDS = ["most-capable", "design", "build", "cheap"];
function loadModels(root) {
  const raw = loadRegistry(root, "models.json");
  const r = isRecord(raw) ? raw : {};
  return {
    version: requireString(r["version"], "version"),
    tiers: requireRows(r["tiers"], "tiers").map((tier, index) => ({
      id: requireString(tier["id"], `tiers[${index}].id`),
      model: requireString(tier["model"], `tiers[${index}].model`),
      // The top of the ladder stores null; an absent key reads the same way,
      // because that is what jq's `.escalates_to` answered for both.
      escalates_to: optionalString(tier["escalates_to"], `tiers[${index}].escalates_to`)
    })),
    escalation_order: requireStringArray(r["escalation_order"], "escalation_order"),
    work_types: requireRows(r["work_types"], "work_types").map((work, index) => ({
      id: requireString(work["id"], `work_types[${index}].id`),
      title: requireString(work["title"], `work_types[${index}].title`),
      tier: requireString(work["tier"], `work_types[${index}].tier`)
    }))
  };
}
function fail2(field, expected) {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}
function requireString(value, field) {
  if (typeof value !== "string" || value === "") fail2(field, "a non-empty string");
  return value;
}
function optionalString(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string" || value === "") fail2(field, "a non-empty string or null");
  return value;
}
function requireRows(value, field) {
  const rows = Array.isArray(value) ? value : fail2(field, "an array");
  return rows.map((row, index) => isRecord(row) ? row : fail2(`${field}[${index}]`, "an object"));
}
function requireStringArray(value, field) {
  const items = Array.isArray(value) ? value : fail2(field, "an array");
  return items.map((item, index) => requireString(item, `${field}[${index}]`));
}

// src/registry/agents.ts
var DEFAULT_AGENT_TIER = "build";
function isModelTierId(value) {
  return typeof value === "string" && MODEL_TIER_IDS.some((id) => id === value);
}
function loadAgents(root) {
  let document;
  try {
    document = loadRegistry(root, "agents.json");
  } catch {
    return [];
  }
  const rows = isRecord(document) ? document["agents"] : void 0;
  if (!Array.isArray(rows)) return [];
  const agents = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const name = row["name"];
    if (typeof name !== "string" || name === "") continue;
    const tier = row["model_tier"];
    agents.push({ name, model_tier: isModelTierId(tier) ? tier : null });
  }
  return agents;
}
function agentModelTier(root, name) {
  const match = loadAgents(root).find((agent) => agent.name === name && agent.model_tier !== null);
  return (match == null ? void 0 : match.model_tier) ?? DEFAULT_AGENT_TIER;
}

// src/registry/strict.ts
function strictReader(file) {
  function malformed5(what) {
    throw new KernelError(`registries/${file}: ${what}`);
  }
  function requireRecord6(value, path) {
    if (!isRecord(value)) malformed5(`${path || "the document"} must be an object`);
    return value;
  }
  function requireString7(value, path) {
    if (typeof value !== "string") malformed5(`${path} must be a string`);
    return value;
  }
  function requireNumber5(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value)) malformed5(`${path} must be a number`);
    return value;
  }
  function requireBoolean4(value, path) {
    if (typeof value !== "boolean") malformed5(`${path} must be a boolean`);
    return value;
  }
  function requireStrings4(value, path) {
    if (!Array.isArray(value)) malformed5(`${path} must be an array of strings`);
    return value.map((item, i) => requireString7(item, `${path}[${i}]`));
  }
  function requireRows7(value, path) {
    if (!Array.isArray(value)) malformed5(`${path} must be an array of objects`);
    return value.map((item, i) => requireRecord6(item, `${path}[${i}]`));
  }
  function optionalString4(value, path) {
    if (value === void 0 || value === null) return null;
    return requireString7(value, path);
  }
  function optionalStrings2(value, path) {
    if (value === void 0 || value === null) return [];
    return requireStrings4(value, path);
  }
  return {
    malformed: malformed5,
    requireRecord: requireRecord6,
    requireString: requireString7,
    requireNumber: requireNumber5,
    requireBoolean: requireBoolean4,
    requireStrings: requireStrings4,
    requireRows: requireRows7,
    optionalString: optionalString4,
    optionalStrings: optionalStrings2
  };
}

// src/registry/capabilities.ts
var reader = strictReader("capabilities.json");
function loadCapabilities(root) {
  const document = reader.requireRecord(loadRegistry(root, "capabilities.json"), "");
  return {
    version: reader.requireString(document["version"], ".version"),
    model_tiers: reader.requireStrings(document["model_tiers"], ".model_tiers"),
    // Every field of a row is load-bearing: a capability without its agent or
    // its tier cannot answer the question the registry exists to answer, so the
    // loader refuses the row rather than defaulting it (as models.ts does).
    capabilities: reader.requireRows(document["capabilities"], ".capabilities").map((row, i) => ({
      id: reader.requireString(row["id"], `.capabilities[${i}].id`),
      title: reader.requireString(row["title"], `.capabilities[${i}].title`),
      agent: reader.requireString(row["agent"], `.capabilities[${i}].agent`),
      model_tier: reader.requireString(row["model_tier"], `.capabilities[${i}].model_tier`),
      risk_floor: reader.requireString(row["risk_floor"], `.capabilities[${i}].risk_floor`)
    }))
  };
}

// src/registry/decision-rules.ts
var { malformed, requireRecord, requireString: requireString2, requireNumber, requireStrings, requireRows: requireRows2, optionalString: optionalString2, optionalStrings } = strictReader("decision-rules.json");
var JUDGE_FACT = /^[a-z][a-z0-9_]*$/;
function loadDecisionRules(root) {
  const raw = loadRegistry(root, "decision-rules.json");
  const d = requireRecord(raw, "");
  return {
    version: requireString2(d["version"], ".version"),
    precedence: requireStrings(d["precedence"], ".precedence"),
    conflict_policy: requireString2(d["conflict_policy"], ".conflict_policy"),
    rules: requireRows2(d["rules"], ".rules").map((row, i) => {
      const at = `.rules[${i}]`;
      const then = requireRecord(row["then"], `${at}.then`);
      return {
        id: requireString2(row["id"], `${at}.id`),
        priority: requireNumber(row["priority"], `${at}.priority`),
        source: requireString2(row["source"], `${at}.source`),
        when: requireRecord(row["when"], `${at}.when`),
        then: {
          require: optionalStrings(then["require"], `${at}.then.require`),
          gate: optionalString2(then["gate"], `${at}.then.gate`),
          risk: optionalString2(then["risk"], `${at}.then.risk`),
          prefer: optionalString2(then["prefer"], `${at}.then.prefer`)
        },
        ...judgeFields(row, at),
        signals: optionalStrings(row["signals"], `${at}.signals`)
      };
    })
  };
}
function judgeFields(row, at) {
  const fact = optionalString2(row["judge_fact"], `${at}.judge_fact`);
  if (fact !== null && !JUDGE_FACT.test(fact)) malformed(`${at}.judge_fact must be a lower-case identifier`);
  const threshold = row["judge_threshold"];
  if (threshold === void 0 || threshold === null) return { judge_fact: fact, judge_threshold: null };
  if (fact === null) malformed(`${at}.judge_threshold requires a judge_fact`);
  const cut = requireNumber(threshold, `${at}.judge_threshold`);
  if (cut <= 0 || cut > 1) malformed(`${at}.judge_threshold must be greater than 0 and at most 1`);
  return { judge_fact: fact, judge_threshold: cut };
}

// src/registry/intents.ts
function isRiskTier(value) {
  return value === "low" || value === "medium" || value === "high";
}
var reader2 = strictReader("intents.json");
function loadIntents(root) {
  return parseIntents(loadRegistry(root, "intents.json"));
}
function parseIntents(raw) {
  const document = reader2.requireRecord(raw, "");
  const rows = reader2.requireRows(document["intents"], ".intents");
  if (rows.length === 0) reader2.malformed(".intents must not be empty");
  return {
    version: reader2.requireString(document["version"], ".version"),
    intents: rows.map((row, i) => parseRow(row, `.intents[${i}]`))
  };
}
function parseRow(row, path) {
  const id = reader2.requireString(row["id"], `${path}.id`);
  if (id === "") reader2.malformed(`${path}.id must not be empty`);
  const declared2 = phraseList(row["phrases"], `${path}.phrases`);
  const hasPhrases = declared2.length > 0;
  const signals = hasPhrases ? reader2.optionalStrings(row["signals"], `${path}.signals`) : reader2.requireStrings(row["signals"], `${path}.signals`);
  if (signals.length === 0 && !hasPhrases && !(row["enabled"] === false && row["deprecated"] === true)) reader2.malformed(`${path}.signals must not be empty`);
  return {
    id,
    title: reader2.requireString(row["title"], `${path}.title`),
    signals,
    rules: reader2.optionalStrings(row["rules"], `${path}.rules`),
    skills: reader2.optionalStrings(row["skills"], `${path}.skills`),
    agents: reader2.optionalStrings(row["agents"], `${path}.agents`),
    commands: reader2.optionalStrings(row["commands"], `${path}.commands`),
    mcp: reader2.optionalStrings(row["mcp"], `${path}.mcp`),
    model_tier: reader2.optionalString(row["model_tier"], `${path}.model_tier`),
    risk_floor: riskFloor(row["risk_floor"], `${path}.risk_floor`),
    domain: reader2.optionalString(row["domain"], `${path}.domain`),
    // jq's `{note}` answers null for a row without one, so an absent note and
    // a null note are the same answer downstream.
    note: reader2.optionalString(row["note"], `${path}.note`),
    suppressible: flag(row["suppressible"], `${path}.suppressible`),
    suppressed_by: reader2.optionalStrings(row["suppressed_by"], `${path}.suppressed_by`),
    requires_dispatch_plan: flag(row["requires_dispatch_plan"], `${path}.requires_dispatch_plan`),
    active: row["enabled"] === void 0 || row["enabled"] === null || reader2.requireBoolean(row["enabled"], `${path}.enabled`),
    phrases: hasPhrases ? declared2 : signals.map((text2) => ({ text: text2, weight: 1 })),
    phrases_declared: hasPhrases,
    verb_object: verbObject(row["verb_object"], `${path}.verb_object`),
    negative: phraseList(row["negative"], `${path}.negative`),
    exemplars: nonBlankStrings(row["exemplars"], `${path}.exemplars`, false),
    threshold: judgeCut(row["threshold"], `${path}.threshold`),
    router_row: routerRow(row["router_row"], `${path}.router_row`)
  };
}
function phraseList(value, path) {
  if (value === void 0 || value === null) return [];
  return reader2.requireRows(value, path).map((item, i) => ({
    text: nonBlank(item["text"], `${path}[${i}].text`),
    weight: positiveWeight(item["weight"], `${path}[${i}].weight`)
  }));
}
function verbObject(value, path) {
  if (value === void 0 || value === null) return null;
  const row = reader2.requireRecord(value, path);
  return {
    verbs: nonBlankStrings(row["verbs"], `${path}.verbs`, true),
    objects: nonBlankStrings(row["objects"], `${path}.objects`, true),
    weight: positiveWeight(row["weight"], `${path}.weight`)
  };
}
function routerRow(value, path) {
  if (value === void 0 || value === null) return null;
  const row = reader2.requireRecord(value, path);
  return { intent: nonBlank(row["intent"], `${path}.intent`), load: nonBlank(row["load"], `${path}.load`) };
}
function nonBlank(value, path) {
  const text2 = reader2.requireString(value, path);
  if (text2.trim() === "") reader2.malformed(`${path} must not be empty`);
  return text2;
}
function nonBlankStrings(value, path, required) {
  if (!required && (value === void 0 || value === null)) return [];
  const items = reader2.requireStrings(value, path).map((text2, i) => nonBlank(text2, `${path}[${i}]`));
  if (required && items.length === 0) reader2.malformed(`${path} must not be empty`);
  return items;
}
function positiveWeight(value, path) {
  const weight = reader2.requireNumber(value, path);
  if (weight <= 0) reader2.malformed(`${path} must be greater than 0`);
  return weight;
}
function judgeCut(value, path) {
  if (value === void 0 || value === null) return null;
  const number = reader2.requireNumber(value, path);
  if (number <= 0 || number > 1) reader2.malformed(`${path} must be greater than 0 and at most 1`);
  return number;
}
function riskFloor(value, path) {
  if (value === void 0 || value === null) return null;
  if (isRiskTier(value)) return value;
  return reader2.malformed(`${path} must be low, medium or high`);
}
function flag(value, path) {
  if (value === void 0 || value === null) return false;
  return reader2.requireBoolean(value, path);
}

// src/registry/policy-judge.ts
var import_node_crypto2 = require("node:crypto");

// src/registry/policy-judge-pattern.ts
var RANGE_QUANTIFIER = /^\{[0-9]+(?:,[0-9]*)?\}/;
var OPEN_RANGE = /^\{[0-9]+,\}/;
var GROUP_PREFIX = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][A-Za-z0-9_$]*>)/;
function patternShape(source) {
  var _a;
  const groups = [newFrame()];
  let inClass2 = false;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const current = groups[groups.length - 1];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (inClass2) {
      if (char === "]") inClass2 = false;
      index += 1;
      continue;
    }
    if (char === "[") {
      inClass2 = true;
      index += 1;
      continue;
    }
    if (char === "*" || char === "+") return "unbounded-quantifier";
    if (char === "(") {
      groups.push(newFrame());
      index += 1 + (((_a = GROUP_PREFIX.exec(source.slice(index + 1))) == null ? void 0 : _a[0].length) ?? 0);
      continue;
    }
    if (char === ")") {
      const closed = groups.length > 1 ? groups.pop() : void 0;
      const parent = groups[groups.length - 1];
      if (closed === void 0 || parent === void 0) return "unbalanced-group";
      const ambiguous = closed.alternation || closed.quantifier;
      if (ambiguous && quantifierFollows(source.slice(index + 1))) return "quantified-ambiguous-group";
      parent.alternation = parent.alternation || closed.alternation;
      parent.quantifier = parent.quantifier || closed.quantifier;
      index += 1;
      continue;
    }
    if (current === void 0) return "unbalanced-group";
    if (char === "|") current.alternation = true;
    else if (char === "?") current.quantifier = true;
    else if (char === "{") {
      const rest = source.slice(index);
      if (OPEN_RANGE.test(rest)) return "unbounded-quantifier";
      const range = RANGE_QUANTIFIER.exec(rest);
      if (range !== null) {
        current.quantifier = true;
        index += range[0].length;
        continue;
      }
    }
    index += 1;
  }
  return groups.length === 1 ? "linear" : "unbalanced-group";
}
function newFrame() {
  return { alternation: false, quantifier: false };
}
function quantifierFollows(rest) {
  return rest.startsWith("?") || rest.startsWith("*") || rest.startsWith("+") || RANGE_QUANTIFIER.test(rest) || OPEN_RANGE.test(rest);
}

// src/registry/policy-judge.ts
var JUDGE_MODES = ["shadow", "advisory", "authoritative"];
var KIND = /^[a-z][a-z0-9-]*$/;
var STATE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
var JUDGE_ENDPOINT_ORIGIN = "https://api.typesafe.ai";
var JUDGE_KEY_ENV = "TYPESAFE_API_KEY";
var JUDGE_ENABLED_ENV = "ENGINEOS_JUDGE";
var JUDGE_ENABLED_VALUE = "jev";
var MAX_STATE_BYTES_CAP = 16384;
var REDACTION_PATTERNS_SHA256 = "dffb903c4b0f554d494e3cf78981703f3c85f42c97240de5be2e844d82d86058";
var { malformed: malformed2, requireRecord: requireRecord2, requireString: requireString3, requireNumber: requireNumber2, requireRows: requireRows3 } = strictReader("policy.json");
function parseJudge(value, breakerScopes) {
  const at = ".judge";
  const judge = requireRecord2(value, at);
  const retries = requireNumber2(judge["retries"], `${at}.retries`);
  if (retries !== 0) malformed2(`${at}.retries must be 0`);
  return {
    enabled_env: pinned(judge["enabled_env"], `${at}.enabled_env`, JUDGE_ENABLED_ENV),
    enabled_value: pinned(judge["enabled_value"], `${at}.enabled_value`, JUDGE_ENABLED_VALUE),
    provider: nonBlank2(judge["provider"], `${at}.provider`),
    endpoint: httpsEndpoint(judge["endpoint"], `${at}.endpoint`),
    model: nonBlank2(judge["model"], `${at}.model`),
    timeout_ms: positiveInteger(judge["timeout_ms"], `${at}.timeout_ms`),
    retries,
    key_env: pinned(judge["key_env"], `${at}.key_env`, JUDGE_KEY_ENV),
    mode: judgeMode(judge["mode"], `${at}.mode`),
    max_state_bytes: stateCap(judge["max_state_bytes"], `${at}.max_state_bytes`),
    thresholds: parseThresholds(judge["thresholds"], `${at}.thresholds`),
    redaction: { patterns: parsePatterns(judge["redaction"], `${at}.redaction`) },
    breaker: parseBreaker(judge["breaker"], `${at}.breaker`, breakerScopes)
  };
}
function parseThresholds(value, at) {
  const thresholds = requireRecord2(value, at);
  return {
    intent_default: aboveZero(thresholds["intent_default"], `${at}.intent_default`),
    primary_confidence: unitInterval(thresholds["primary_confidence"], `${at}.primary_confidence`),
    margin: unitInterval(thresholds["margin"], `${at}.margin`),
    rule_default: aboveZero(thresholds["rule_default"], `${at}.rule_default`)
  };
}
function parsePatterns(value, at) {
  const redaction = requireRecord2(value, at);
  const raw = redaction["patterns"];
  const rows = requireRows3(raw, `${at}.patterns`);
  if (rows.length === 0) malformed2(`${at}.patterns must not be empty`);
  const patterns = rows.map((row, i) => {
    const kind = requireString3(row["kind"], `${at}.patterns[${i}].kind`);
    if (!KIND.test(kind)) malformed2(`${at}.patterns[${i}].kind must be a lower-case slug`);
    const pattern = nonBlank2(row["pattern"], `${at}.patterns[${i}].pattern`);
    if (!compiles(pattern)) malformed2(`${at}.patterns[${i}].pattern does not compile as a regular expression`);
    const shape = patternShape(pattern);
    if (shape !== "linear") malformed2(`${at}.patterns[${i}].pattern is not linear-time (${shape})`);
    return { kind, pattern };
  });
  const digest = (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify(raw)).digest("hex");
  if (digest !== REDACTION_PATTERNS_SHA256) malformed2(`${at}.patterns differ from the list pinned in code`);
  return patterns;
}
function compiles(pattern) {
  try {
    new RegExp(pattern, "g");
    return true;
  } catch {
    return false;
  }
}
function parseBreaker(value, at, scopes) {
  const breaker = requireRecord2(value, at);
  const scope = requireString3(breaker["scope"], `${at}.scope`);
  if (!scopes.includes(scope)) malformed2(`${at}.scope must be one of .breaker.scopes`);
  const stateFile = requireString3(breaker["state_file"], `${at}.state_file`);
  if (!STATE_FILE.test(stateFile)) malformed2(`${at}.state_file must be a bare file name`);
  return { scope, state_file: stateFile, cooldown_ms: positiveInteger(breaker["cooldown_ms"], `${at}.cooldown_ms`) };
}
function judgeMode(value, path) {
  const mode = requireString3(value, path);
  const known = JUDGE_MODES.find((candidate) => candidate === mode);
  return known ?? malformed2(`${path} must be shadow, advisory or authoritative`);
}
function pinned(value, path, expected) {
  const text2 = requireString3(value, path);
  if (text2 !== expected) malformed2(`${path} must be ${expected}`);
  return text2;
}
function stateCap(value, path) {
  const bytes = positiveInteger(value, path);
  if (bytes > MAX_STATE_BYTES_CAP) malformed2(`${path} must be at most ${MAX_STATE_BYTES_CAP}`);
  return bytes;
}
function httpsEndpoint(value, path) {
  const endpoint = requireString3(value, path);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return malformed2(`${path} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:") malformed2(`${path} must use https`);
  if (parsed.username !== "" || parsed.password !== "") malformed2(`${path} must not carry credentials`);
  if (parsed.origin !== JUDGE_ENDPOINT_ORIGIN) malformed2(`${path} must be on ${JUDGE_ENDPOINT_ORIGIN}`);
  return endpoint;
}
function nonBlank2(value, path) {
  const text2 = requireString3(value, path);
  if (text2.trim() === "") malformed2(`${path} must not be empty`);
  return text2;
}
function positiveInteger(value, path) {
  const number = requireNumber2(value, path);
  if (!Number.isInteger(number) || number < 1) malformed2(`${path} must be a positive integer`);
  return number;
}
function aboveZero(value, path) {
  const number = requireNumber2(value, path);
  if (number <= 0 || number > 1) malformed2(`${path} must be greater than 0 and at most 1`);
  return number;
}
function unitInterval(value, path) {
  const number = requireNumber2(value, path);
  if (number < 0 || number > 1) malformed2(`${path} must be between 0 and 1`);
  return number;
}

// src/registry/policy-router.ts
var { malformed: malformed3, requireRecord: requireRecord3, requireString: requireString4, requireNumber: requireNumber3, requireBoolean, requireStrings: requireStrings2, requireRows: requireRows4 } = strictReader("policy.json");
function parseRouter(value) {
  const router = requireRecord3(value, ".router");
  const escalateWhen = requireRecord3(router["escalate_when"], ".router.escalate_when");
  return {
    agent: requireString4(router["agent"], ".router.agent"),
    capability: requireString4(router["capability"], ".router.capability"),
    reasons: requireStrings2(router["reasons"], ".router.reasons"),
    escalate_when: {
      multi_agent_intents_min: requireNumber3(
        escalateWhen["multi_agent_intents_min"],
        ".router.escalate_when.multi_agent_intents_min"
      ),
      unrouted_scale_signals: requireStrings2(
        escalateWhen["unrouted_scale_signals"],
        ".router.escalate_when.unrouted_scale_signals"
      )
    },
    scoring: parseScoring(router["scoring"]),
    combination: parseCombination(router["combination"]),
    source_markers: parseSourceMarkers(router["source_markers"]),
    tiebreak: parseTiebreak(router["tiebreak"]),
    fixtures: requireRows4(router["fixtures"], ".router.fixtures").map((row, i) => ({
      prompt: requireString4(row["prompt"], `.router.fixtures[${i}].prompt`),
      escalate: requireBoolean(row["escalate"], `.router.fixtures[${i}].escalate`),
      reasons: requireStrings2(row["reasons"], `.router.fixtures[${i}].reasons`),
      intents: requireStrings2(row["intents"], `.router.fixtures[${i}].intents`)
    }))
  };
}
function parseScoring(value) {
  const at = ".router.scoring";
  const scoring = requireRecord3(value, at);
  return {
    min_score: atLeastZero(scoring["min_score"], `${at}.min_score`),
    threshold: unitInterval2(scoring["threshold"], `${at}.threshold`),
    margin: unitInterval2(scoring["margin"], `${at}.margin`),
    top_k: positiveInteger2(scoring["top_k"], `${at}.top_k`),
    max_intents: positiveInteger2(scoring["max_intents"], `${at}.max_intents`),
    bm25_weight: atLeastZero(scoring["bm25_weight"], `${at}.bm25_weight`),
    path_weight: atLeastZero(scoring["path_weight"], `${at}.path_weight`)
  };
}
function parseCombination(value) {
  const at = ".router.combination";
  const combination = requireRecord3(value, at);
  return {
    gates: literal(combination["gates"], "deterministic-wins", `${at}.gates`),
    judge: literal(combination["judge"], "add-only", `${at}.judge`),
    intents: literal(combination["intents"], "noul-then-primary", `${at}.intents`),
    escalate_on_doubt: literal(combination["escalate_on_doubt"], true, `${at}.escalate_on_doubt`)
  };
}
function literal(value, expected, path) {
  if (value !== expected) return malformed3(`${path} must be ${String(expected)}`);
  return expected;
}
function parseSourceMarkers(value) {
  const at = ".router.source_markers";
  const markers = requireRecord3(value, at);
  return {
    notification: markerList(markers["notification"], `${at}.notification`),
    tool_result: markerList(markers["tool_result"], `${at}.tool_result`),
    hook_echo: markerList(markers["hook_echo"], `${at}.hook_echo`)
  };
}
function markerList(value, path) {
  const list = requireStrings2(value, path);
  if (list.length === 0) malformed3(`${path} must not be empty`);
  list.forEach((marker, i) => {
    if (marker.trim() === "") malformed3(`${path}[${i}] must not be blank`);
  });
  return list;
}
function parseTiebreak(value) {
  const at = ".router.tiebreak";
  const tiebreak = requireRecord3(value, at);
  return {
    min_similarity: aboveZeroAtMostOne(tiebreak["min_similarity"], `${at}.min_similarity`),
    margin: aboveZeroAtMostOne(tiebreak["margin"], `${at}.margin`)
  };
}
function aboveZeroAtMostOne(value, path) {
  const number = requireNumber3(value, path);
  if (number <= 0 || number > 1) malformed3(`${path} must be greater than 0 and at most 1`);
  return number;
}
function atLeastZero(value, path) {
  const number = requireNumber3(value, path);
  if (number < 0) malformed3(`${path} must be at least 0`);
  return number;
}
function unitInterval2(value, path) {
  const number = requireNumber3(value, path);
  if (number < 0 || number > 1) malformed3(`${path} must be between 0 and 1`);
  return number;
}
function positiveInteger2(value, path) {
  const number = requireNumber3(value, path);
  if (!Number.isInteger(number) || number < 1) malformed3(`${path} must be a positive integer`);
  return number;
}

// src/kernel/table.ts
function evaluateFirst(rows, input) {
  requireResolvable(rows.map((row) => row.when), input);
  return rows.find((row) => matches(row.when, input));
}
function evaluateCollect(rows, input) {
  requireResolvable(rows.map((row) => row.when), input);
  return rows.filter((row) => matches(row.when, input));
}
function requireResolvable(whens, input) {
  const problem = whens.flatMap((when) => whenProblems(when, { ...input, facts: Object.keys(input.facts) }))[0];
  if (problem !== void 0) throw new KernelError(`policy table: ${problem}`);
}
function matches(when, input) {
  return Object.entries(when).every(([name, condition]) => {
    const fact = own(input.facts, name) ?? null;
    if (typeof condition !== "object") return fact === condition;
    if (typeof fact !== "string") return false;
    if (isList(condition)) return condition.includes(fact);
    if ("in" in condition) return (own(input.sets ?? {}, condition.in) ?? []).includes(fact);
    const order = own(input.orders ?? {}, name) ?? [];
    return order.indexOf(fact) >= order.indexOf(condition.at_least);
  });
}
function whenProblems(when, vocabulary) {
  return Object.entries(when).flatMap(([name, condition]) => {
    if (!vocabulary.facts.includes(name)) return [`unknown fact ${name}`];
    if (typeof condition !== "object" || isList(condition)) return [];
    if ("in" in condition) return own(vocabulary.sets ?? {}, condition.in) === void 0 ? [`unknown set ${condition.in}`] : [];
    return (own(vocabulary.orders ?? {}, name) ?? []).includes(condition.at_least) ? [] : [`${name} has no order containing ${condition.at_least}`];
  });
}
function parseWhen(value) {
  if (!isRecord(value)) return "must be an object";
  const when = {};
  for (const [name, raw] of Object.entries(value)) {
    const condition = parseCondition(raw);
    if (condition === void 0) return `${name} must be a string, boolean, string array, {"in": <set>} or {"at_least": <value>}`;
    when[name] = condition;
  }
  return when;
}
function parseCondition(raw) {
  if (typeof raw === "string" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) {
    const items = raw.filter((item) => typeof item === "string");
    return items.length === raw.length ? items : void 0;
  }
  if (!isRecord(raw) || Object.keys(raw).length !== 1) return void 0;
  const [set, floor] = [raw["in"], raw["at_least"]];
  if (typeof set === "string") return { in: set };
  return typeof floor === "string" ? { at_least: floor } : void 0;
}
var PLACEHOLDER = /\{([a-z_]+)\}/g;
function fillTemplate(template, values) {
  return template.replace(PLACEHOLDER, (_slot, name) => {
    const value = own(values, name);
    if (value === void 0) throw new KernelError(`policy template names an unknown placeholder: {${name}}`);
    return String(value);
  });
}
var isList = (condition) => Array.isArray(condition);
function own(record2, key) {
  return Object.prototype.hasOwnProperty.call(record2, key) ? record2[key] : void 0;
}

// src/registry/policy-tables.ts
var { malformed: malformed4, requireRecord: requireRecord4, requireString: requireString5, requireBoolean: requireBoolean2, optionalString: optionalString3, requireRows: requireRows5 } = strictReader("policy.json");
function parseAdmitRows(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row["when"], `${at}[${i}].when`),
    action: requireString5(row["action"], `${at}[${i}].action`),
    capacity: capacity(row["capacity"], `${at}[${i}].capacity`),
    reason: requireString5(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseSituations(value, at) {
  return requireRows5(value, at).map((row, i) => {
    const action = optionalString3(row["action"], `${at}[${i}].action`);
    const reason = optionalString3(row["reason"], `${at}[${i}].reason`);
    if (action === null !== (reason === null)) malformed4(`${at}[${i}] must carry both action and reason, or neither`);
    return {
      situation: requireString5(row["situation"], `${at}[${i}].situation`),
      response: requireString5(row["response"], `${at}[${i}].response`),
      action,
      reason
    };
  });
}
function parseRepairAnswer(value, at) {
  const answer = requireRecord4(value, at);
  return { action: requireString5(answer["action"], `${at}.action`), reason: requireString5(answer["reason"], `${at}.reason`) };
}
function parseLadder(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row["when"], `${at}[${i}].when`),
    action: requireString5(row["action"], `${at}[${i}].action`),
    reason: requireString5(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseInfraPatterns(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    runner: requireString5(row["runner"], `${at}[${i}].runner`),
    pattern: requireString5(row["pattern"], `${at}[${i}].pattern`),
    reason: infraReason(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseTransitions(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    from: requireString5(row["from"], `${at}[${i}].from`),
    guard: requireWhen(row["guard"], `${at}[${i}].guard`),
    to: requireString5(row["to"], `${at}[${i}].to`),
    allow: requireBoolean2(row["allow"], `${at}[${i}].allow`),
    reason: requireString5(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseReasonTable(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    reason: requireString5(row["reason"], `${at}[${i}].reason`),
    when: requireWhen(row["when"], `${at}[${i}].when`)
  }));
}
function nonEmptyRows(value, at) {
  const rows = requireRows5(value, at);
  if (rows.length === 0) malformed4(`${at} must not be empty`);
  return rows;
}
function requireWhen(value, path) {
  const when = parseWhen(value);
  return typeof when === "string" ? malformed4(`${path} ${when}`) : when;
}
function capacity(value, path) {
  const text2 = requireString5(value, path);
  if (text2 === "remaining" || text2 === "none") return text2;
  return malformed4(`${path} must be remaining or none`);
}
function infraReason(value, path) {
  const text2 = requireString5(value, path);
  if (text2 === "target-absent" || text2 === "runner-missing") return text2;
  return malformed4(`${path} must be target-absent or runner-missing`);
}

// src/registry/policy.ts
var { requireRecord: requireRecord5, requireString: requireString6, requireNumber: requireNumber4, requireBoolean: requireBoolean3, requireStrings: requireStrings3, requireRows: requireRows6 } = strictReader("policy.json");
function loadPolicy(root) {
  const raw = loadRegistry(root, "policy.json");
  const p = requireRecord5(raw, "");
  const risk = requireRecord5(p["risk"], ".risk");
  const repair = requireRecord5(p["repair"], ".repair");
  const autonomy = requireRecord5(p["autonomy"], ".autonomy");
  const retry = requireRecord5(p["retry"], ".retry");
  const gates = requireRecord5(p["gates"], ".gates");
  const specThreshold = requireRecord5(gates["spec_threshold"], ".gates.spec_threshold");
  const parallelism = requireRecord5(p["parallelism"], ".parallelism");
  const backpressure = requireRecord5(parallelism["backpressure"], ".parallelism.backpressure");
  const promptSignals = requireRecord5(parallelism["prompt_signals"], ".parallelism.prompt_signals");
  const breaker = requireRecord5(p["breaker"], ".breaker");
  const hitl = requireRecord5(p["hitl"], ".hitl");
  const scopes = requireStrings3(breaker["scopes"], ".breaker.scopes");
  return {
    version: requireString6(p["version"], ".version"),
    risk: {
      aggregation: requireString6(risk["aggregation"], ".risk.aggregation"),
      inputs: requireRows6(risk["inputs"], ".risk.inputs").map((row, i) => ({
        id: requireString6(row["id"], `.risk.inputs[${i}].id`)
      })),
      high_floors: requireStrings3(risk["high_floors"], ".risk.high_floors")
    },
    repair: {
      checks: requireStrings3(repair["checks"], ".repair.checks"),
      max_fix_attempts_per_check: requireNumber4(
        repair["max_fix_attempts_per_check"],
        ".repair.max_fix_attempts_per_check"
      ),
      escalations: requireNumber4(repair["escalations"], ".repair.escalations"),
      by_situation: parseSituations(repair["by_situation"], ".repair.by_situation"),
      never_repair: requireStrings3(repair["never_repair"], ".repair.never_repair"),
      never_repair_answer: parseRepairAnswer(repair["never_repair_answer"], ".repair.never_repair_answer"),
      ladder: parseLadder(repair["ladder"], ".repair.ladder"),
      infra_patterns: parseInfraPatterns(repair["infra_patterns"], ".repair.infra_patterns")
    },
    autonomy: {
      levels: requireRows6(autonomy["levels"], ".autonomy.levels").map((row, i) => ({
        id: requireString6(row["id"], `.autonomy.levels[${i}].id`)
      })),
      ceiling_by_risk: requireTierMap(
        autonomy["ceiling_by_risk"],
        ".autonomy.ceiling_by_risk",
        requireString6
      ),
      high_with_thin_evidence: requireString6(
        autonomy["high_with_thin_evidence"],
        ".autonomy.high_with_thin_evidence"
      )
    },
    retry: {
      never_retry: requireStrings3(retry["never_retry"], ".retry.never_retry")
    },
    gates: {
      by_risk: requireTierMap(gates["by_risk"], ".gates.by_risk", requireStringMap),
      spec_threshold: {
        files_greater_than: requireNumber4(
          specThreshold["files_greater_than"],
          ".gates.spec_threshold.files_greater_than"
        ),
        or_any_new_feature: requireBoolean3(
          specThreshold["or_any_new_feature"],
          ".gates.spec_threshold.or_any_new_feature"
        )
      }
    },
    parallelism: {
      wave_concurrency_cap: requireNumber4(
        parallelism["wave_concurrency_cap"],
        ".parallelism.wave_concurrency_cap"
      ),
      backpressure: {
        max_queued_units: requireNumber4(
          backpressure["max_queued_units"],
          ".parallelism.backpressure.max_queued_units"
        ),
        overload_action: requireString6(
          backpressure["overload_action"],
          ".parallelism.backpressure.overload_action"
        ),
        actions: requireStrings3(backpressure["actions"], ".parallelism.backpressure.actions"),
        rows: parseAdmitRows(backpressure["rows"], ".parallelism.backpressure.rows")
      },
      prompt_signals: {
        action: requireString6(promptSignals["action"], ".parallelism.prompt_signals.action"),
        substantive_action: requireString6(
          promptSignals["substantive_action"],
          ".parallelism.prompt_signals.substantive_action"
        ),
        scale: requireString6(promptSignals["scale"], ".parallelism.prompt_signals.scale"),
        spec: requireString6(promptSignals["spec"], ".parallelism.prompt_signals.spec"),
        design_strong: requireString6(
          promptSignals["design_strong"],
          ".parallelism.prompt_signals.design_strong"
        ),
        design_weak: requireString6(
          promptSignals["design_weak"],
          ".parallelism.prompt_signals.design_weak"
        )
      }
    },
    breaker: {
      failure_threshold: requireNumber4(breaker["failure_threshold"], ".breaker.failure_threshold"),
      cooldown_waves: requireNumber4(breaker["cooldown_waves"], ".breaker.cooldown_waves"),
      half_open_probes: requireNumber4(breaker["half_open_probes"], ".breaker.half_open_probes"),
      states: requireStrings3(breaker["states"], ".breaker.states"),
      scopes,
      transitions: parseTransitions(breaker["transitions"], ".breaker.transitions")
    },
    hitl: {
      reasons: requireStrings3(hitl["reasons"], ".hitl.reasons"),
      situations: requireStrings3(hitl["situations"], ".hitl.situations"),
      record_home: requireString6(hitl["record_home"], ".hitl.record_home"),
      reason_table: parseReasonTable(hitl["reason_table"], ".hitl.reason_table")
    },
    router: parseRouter(p["router"]),
    judge: parseJudge(p["judge"], scopes)
  };
}
function requireStringMap(value, path) {
  const row = requireRecord5(value, path);
  const out = {};
  for (const [key, item] of Object.entries(row)) out[key] = requireString6(item, `${path}.${key}`);
  return out;
}
function requireTierMap(value, path, item) {
  const row = requireRecord5(value, path);
  return {
    low: item(row["low"], `${path}.low`),
    medium: item(row["medium"], `${path}.medium`),
    high: item(row["high"], `${path}.high`)
  };
}

// src/registry/routing.ts
var reader3 = strictReader("routing.json");
function loadRouting(root) {
  const document = reader3.requireRecord(loadRegistry(root, "routing.json"), "");
  const excluded = reader3.requireRecord(document["excluded"], ".excluded");
  const precedence = reader3.requireStrings(document["precedence"], ".precedence");
  if (precedence.length === 0) reader3.malformed(".precedence must not be empty");
  const domains = reader3.requireRows(document["domains"], ".domains");
  if (domains.length === 0) reader3.malformed(".domains must not be empty");
  return {
    version: reader3.requireString(document["version"], ".version"),
    precedence,
    excluded: {
      paths: reader3.optionalStrings(excluded["paths"], ".excluded.paths"),
      basenames: reader3.optionalStrings(excluded["basenames"], ".excluded.basenames"),
      self_dirs: reader3.optionalStrings(excluded["self_dirs"], ".excluded.self_dirs")
    },
    domains: domains.map((row, i) => {
      const path = `.domains[${i}]`;
      const match = reader3.requireRecord(row["match"], `${path}.match`);
      const id = reader3.requireString(row["id"], `${path}.id`);
      if (id === "") reader3.malformed(`${path}.id must not be empty`);
      return {
        id,
        match: {
          paths: reader3.optionalStrings(match["paths"], `${path}.match.paths`),
          basenames: reader3.optionalStrings(match["basenames"], `${path}.match.basenames`)
        },
        rules: reader3.optionalStrings(row["rules"], `${path}.rules`),
        skills: reader3.optionalStrings(row["skills"], `${path}.skills`),
        agent: reader3.optionalString(row["agent"], `${path}.agent`),
        hint: reader3.optionalString(row["hint"], `${path}.hint`),
        sample_path: reader3.optionalString(row["sample_path"], `${path}.sample_path`)
      };
    })
  };
}

// src/kernel/skill-state.ts
var import_node_fs8 = require("node:fs");
var import_node_path6 = require("node:path");
var HEAD_BYTES = 64 * 1024;
var FENCE = /^---[ \t\r\v\f]*$/;
var LEADING_BLANK = /^[ \t]*/;
var TRAILING_BLANK = /[ \t\r\v\f]*$/;
var ENABLED_KEY = "enabled:";
function readSkillState(root) {
  const dir = (0, import_node_path6.join)(root, "skills");
  const state = /* @__PURE__ */ new Map();
  let entries;
  try {
    entries = (0, import_node_fs8.readdirSync)(dir);
  } catch {
    return state;
  }
  for (const id of entries) {
    if (id.startsWith(".")) continue;
    if (!isDirectory((0, import_node_path6.join)(dir, id))) continue;
    const file = (0, import_node_path6.join)(dir, id, "SKILL.md");
    if (!isFile(file)) continue;
    const head = readHead(file);
    if (head === null) continue;
    state.set(id, frontmatterReading(head.text, head.truncated));
  }
  return state;
}
function isSkillEnabled(state, id) {
  const reading = state.get(id);
  return reading === void 0 || reading === "enabled";
}
function enabledSkills(declared2, state) {
  return declared2.filter((id) => isSkillEnabled(state, id));
}
function suppressedSkills(declared2, state) {
  return declared2.filter((id) => !isSkillEnabled(state, id)).map((id) => ({ id, reason: state.get(id) === "unreadable" ? "unreadable" : "disabled" }));
}
function frontmatterReading(text2, truncated) {
  const lines = text2.split("\n");
  if (truncated) lines.pop();
  const opener = lines[0];
  if (opener === void 0 || !FENCE.test(opener)) return "enabled";
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) return "enabled";
    if (!line.startsWith(ENABLED_KEY)) continue;
    const value = line.slice(ENABLED_KEY.length).replace(LEADING_BLANK, "").replace(TRAILING_BLANK, "");
    return value === "false" ? "disabled" : "enabled";
  }
  return truncated ? "unreadable" : "enabled";
}
function isDirectory(path) {
  try {
    return (0, import_node_fs8.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile(path) {
  try {
    return (0, import_node_fs8.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function readHead(path) {
  let fd;
  try {
    fd = (0, import_node_fs8.openSync)(path, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = (0, import_node_fs8.readSync)(fd, buffer, 0, HEAD_BYTES, 0);
    const truncated = read === HEAD_BYTES && (0, import_node_fs8.fstatSync)(fd).size > HEAD_BYTES;
    return { text: buffer.subarray(0, read).toString("utf8"), truncated };
  } catch {
    return null;
  } finally {
    (0, import_node_fs8.closeSync)(fd);
  }
}

// src/kernel/context.ts
function lazyRegistries(root) {
  const routing = memo(() => loadRouting(root));
  const intents = memo(() => loadIntents(root));
  const models = memo(() => loadModels(root));
  const policy = memo(() => loadPolicy(root));
  const decisionRules = memo(() => loadDecisionRules(root));
  const capabilities = memo(() => loadCapabilities(root));
  const agents = memo(() => loadAgents(root));
  const skillState = memo(() => readSkillState(root));
  return {
    get routing() {
      return routing();
    },
    get intents() {
      return intents();
    },
    get models() {
      return models();
    },
    get policy() {
      return policy();
    },
    get decisionRules() {
      return decisionRules();
    },
    get capabilities() {
      return capabilities();
    },
    get agents() {
      return agents();
    },
    get skillState() {
      return skillState();
    }
  };
}
function memo(make) {
  let cell = null;
  return () => {
    if (cell === null) cell = { value: make() };
    return cell.value;
  };
}

// src/kernel/admit.ts
function admitSection(facts, regs) {
  requireCount(facts.inflight, "inflight");
  requireCount(facts.queued, "queued");
  const parallelism = regs.policy.parallelism;
  const backpressure = parallelism.backpressure;
  if (!backpressure.actions.includes(backpressure.overload_action)) {
    throw new KernelError(
      "policy.json parallelism.backpressure.overload_action is not one of the declared backpressure.actions \u2014 admit will not emit an action the registry does not declare"
    );
  }
  const cap = parallelism.wave_concurrency_cap;
  const maxQueued = backpressure.max_queued_units;
  const capacity2 = cap - facts.inflight;
  const measured = {
    capacity_available: capacity2 > 0,
    queue_has_room: facts.queued < maxQueued
  };
  const row = evaluateFirst(backpressure.rows, { facts: measured });
  if (row === void 0) {
    throw new KernelError(
      "policy.json parallelism.backpressure.rows has no row for this load \u2014 the ladder must end in a row with an empty when"
    );
  }
  const slots2 = {
    inflight: facts.inflight,
    queued: facts.queued,
    cap,
    max_queued_units: maxQueued,
    overload_action: backpressure.overload_action
  };
  return {
    action: fillTemplate(row.action, slots2),
    capacity: row.capacity === "remaining" ? capacity2 : 0,
    reason: fillTemplate(row.reason, slots2)
  };
}
function requireCount(value, flag2) {
  if (!Number.isInteger(value) || value < 0) {
    throw new KernelError(`admit requires a numeric --${flag2}`);
  }
}

// src/kernel/transitions.ts
function leaves(rows, from) {
  return rows.some((row) => row.from === from);
}
function step(rows, from, input) {
  const leaving = rows.filter((row2) => row2.from === from);
  requireResolvable(leaving.map((row2) => row2.guard), input);
  const row = leaving.find((candidate) => matches(candidate.guard, input));
  if (row === void 0) throw new KernelError(`policy transition table has no edge leaving ${from} for these facts`);
  return row;
}

// src/kernel/breaker.ts
var BREAKER_GUARDS = {
  closed: {
    facts: ["threshold_reached"],
    read: (facts, breaker) => {
      const failures = facts.failures;
      if (failures === void 0 || !Number.isInteger(failures) || failures < 0) {
        throw new KernelError("breaker --state closed requires a numeric --failures");
      }
      return { threshold_reached: failures >= breaker.failure_threshold };
    }
  },
  open: {
    facts: ["cooldown_elapsed"],
    read: (facts) => {
      const elapsed = facts.cooldownElapsed;
      if (elapsed === void 0) {
        throw new KernelError("breaker --state open requires --cooldown-elapsed true|false");
      }
      return { cooldown_elapsed: elapsed };
    }
  },
  "half-open": {
    facts: ["probe_result"],
    read: (facts) => {
      const probe = facts.probeResult;
      if (probe !== "ok" && probe !== "failed") {
        throw new KernelError("breaker --state half-open requires --probe-result ok|failed");
      }
      return { probe_result: probe };
    }
  }
};
function breakerSection(facts, regs) {
  const breaker = regs.policy.breaker;
  const guard = Object.prototype.hasOwnProperty.call(BREAKER_GUARDS, facts.state) ? BREAKER_GUARDS[facts.state] : void 0;
  if (guard === void 0 || !breaker.states.includes(facts.state) || !leaves(breaker.transitions, facts.state)) {
    throw new KernelError("breaker requires --state closed|open|half-open");
  }
  const edge = step(breaker.transitions, facts.state, { facts: guard.read(facts, breaker) });
  return { state: edge.to, allow: edge.allow, reason: fillTemplate(edge.reason, slots(facts, breaker)) };
}
function slots(facts, breaker) {
  const values = {
    failure_threshold: breaker.failure_threshold,
    cooldown_waves: breaker.cooldown_waves,
    half_open_probes: breaker.half_open_probes
  };
  if (facts.failures !== void 0) values["failures"] = facts.failures;
  return values;
}

// src/kernel/scale.ts
function scaleSection(facts, regs) {
  const signals = regs.policy.parallelism.prompt_signals;
  const compiled = compiledSignals(signals);
  const lower = asciiDowncase(facts.prompt);
  const action = compiled.action.test(lower);
  return {
    big_task: action && compiled.scale.test(lower),
    spec_authoring: compiled.spec.test(lower),
    design_work: compiled.designStrong.test(lower) || action && compiled.designWeak.test(lower)
  };
}
function asciiDowncase(prompt) {
  return prompt.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
function compilePromptRegex(source, describe) {
  try {
    return new RegExp(source, "i");
  } catch {
    throw new KernelError(`${describe} is not a valid regex: ${source}`);
  }
}
var cache = /* @__PURE__ */ new WeakMap();
function compiledSignals(signals) {
  const cached = cache.get(signals);
  if (cached !== void 0) return cached;
  const at = "registries/policy.json: .parallelism.prompt_signals";
  const compiled = {
    action: compilePromptRegex(signals.action, `${at}.action`),
    scale: compilePromptRegex(signals.scale, `${at}.scale`),
    spec: compilePromptRegex(signals.spec, `${at}.spec`),
    designStrong: compilePromptRegex(signals.design_strong, `${at}.design_strong`),
    designWeak: compilePromptRegex(signals.design_weak, `${at}.design_weak`)
  };
  cache.set(signals, compiled);
  return compiled;
}

// src/kernel/decisions.ts
function decisionsSection(facts, regs) {
  const lower = asciiDowncase(facts.prompt);
  const matches2 = rulesByPriority(regs.decisionRules).filter((candidate) => candidate.patterns.some((pattern) => pattern.test(lower))).map(({ rule }) => matchOf(rule));
  return {
    matches: matches2,
    any_high: matches2.some((match) => match.risk === "high")
  };
}
function matchFromRule(id, regs) {
  const rule = regs.decisionRules.rules.find((candidate) => candidate.id === id);
  if (rule === void 0) throw new KernelError(`decision-rules.json declares no rule ${id}`);
  return matchOf(rule);
}
function rulesInPriorityOrder(regs) {
  return rulesByPriority(regs.decisionRules).map(({ rule }) => rule);
}
function matchOf(rule) {
  return {
    id: rule.id,
    // Copied, not aliased: a section is an answer, and a caller that edits
    // one must not reach back into the memoised registry.
    require: [...rule.then.require],
    prefer: rule.then.prefer,
    gate: rule.then.gate,
    risk: rule.then.risk
  };
}
var cache2 = /* @__PURE__ */ new WeakMap();
function rulesByPriority(registry) {
  const cached = cache2.get(registry);
  if (cached !== void 0) return cached;
  const ordered = [...registry.rules].sort((a, b) => b.priority - a.priority);
  const compiled = ordered.map((rule) => ({
    rule,
    patterns: rule.signals.map(
      (signal, i) => compilePromptRegex(signal, `registries/decision-rules.json: rule ${rule.id} signals[${i}]`)
    )
  }));
  cache2.set(registry, compiled);
  return compiled;
}

// src/kernel/hitl.ts
var HITL_ORDERED_FACT = "autonomy";
function hitlSection(facts, regs) {
  const policy = regs.policy;
  const risk = facts.riskTier;
  if (!isRiskTier(risk)) throw new KernelError("hitl requires --risk low|medium|high");
  const levels = policy.autonomy.levels.map((level2) => level2.id);
  if (levels.length < 2) {
    throw new KernelError(
      "policy.json .autonomy.levels declares fewer than two levels \u2014 hitl cannot resolve a one-level drop"
    );
  }
  const autonomyIndex = levels.indexOf(facts.autonomy);
  if (autonomyIndex < 0) throw new KernelError("hitl requires --autonomy A0..A4");
  const evidence = facts.evidence ?? "adequate";
  if (evidence !== "thin" && evidence !== "adequate") {
    throw new KernelError("hitl --evidence must be thin|adequate");
  }
  const external = asBoolean(facts.externalEffect, "hitl --external-effect must be true|false");
  const conflict = asBoolean(facts.conflict, "hitl --conflict must be true|false");
  const topology = asBoolean(facts.topology, "hitl --topology must be true|false");
  const recordHome = policy.hitl.record_home;
  if (recordHome === "") {
    throw new KernelError(
      "policy.json has no hitl.record_home \u2014 hitl will not require a human decision without naming where it is recorded"
    );
  }
  const situation = facts.situation ?? "";
  const declaredSituations = [...policy.retry.never_retry, ...policy.hitl.situations];
  if (situation !== "" && !declaredSituations.includes(situation)) {
    throw new KernelError(
      `unknown situation: ${situation} (one of retry.never_retry or hitl.situations)`
    );
  }
  const table2 = policy.hitl.reason_table;
  requireFloorsDeclared(table2, levels);
  const measured = {
    risk,
    evidence,
    external_effect: external,
    autonomy: facts.autonomy,
    conflict,
    situation: situation === "" ? null : situation,
    topology
  };
  const matched = evaluateCollect(table2, {
    facts: measured,
    sets: { "retry.never_retry": policy.retry.never_retry },
    orders: { [HITL_ORDERED_FACT]: levels }
  }).map((row) => row.reason);
  const triggered = [...new Set(matched)];
  const undeclared = triggered.filter((reason) => !policy.hitl.reasons.includes(reason));
  if (undeclared.length > 0) {
    throw new KernelError(
      `policy.json .hitl.reasons does not declare: ${undeclared.join(", ")} \u2014 a gate may cite nothing outside the closed vocabulary`
    );
  }
  const reasons = policy.hitl.reasons.filter((reason) => triggered.includes(reason));
  return {
    required: reasons.length > 0,
    reasons,
    autonomy_after: autonomyAfter({
      evidence,
      risk,
      autonomyIndex,
      levels,
      highWithThinEvidence: policy.autonomy.high_with_thin_evidence
    }),
    record_home: recordHome
  };
}
function requireFloorsDeclared(table2, levels) {
  for (const row of table2) {
    const condition = row.when[HITL_ORDERED_FACT];
    if (isFloor(condition) && !levels.includes(condition.at_least)) {
      throw new KernelError(
        `policy.json .autonomy.levels does not declare ${condition.at_least} \u2014 hitl cannot resolve the ${row.reason} floor`
      );
    }
  }
}
function isFloor(condition) {
  return typeof condition === "object" && !Array.isArray(condition) && "at_least" in condition;
}
function autonomyAfter(drop) {
  const { autonomyIndex, levels } = drop;
  const given = levels[autonomyIndex];
  if (given === void 0) throw new KernelError("hitl requires --autonomy A0..A4");
  if (drop.evidence !== "thin") return given;
  const floorIndex = 1;
  let index = Math.min(autonomyIndex, Math.max(floorIndex, autonomyIndex - 1));
  if (drop.risk === "high") {
    const highWithThinEvidence = drop.highWithThinEvidence;
    if (highWithThinEvidence === "") {
      throw new KernelError(
        "policy.json has no autonomy.high_with_thin_evidence \u2014 hitl cannot resolve the thin-evidence ceiling at risk high"
      );
    }
    const capIndex = levels.indexOf(highWithThinEvidence);
    if (capIndex < 0) {
      throw new KernelError(
        `policy.json autonomy.high_with_thin_evidence is not an autonomy level: ${highWithThinEvidence}`
      );
    }
    index = Math.min(index, capIndex);
  }
  const after = levels[index];
  if (after === void 0) throw new KernelError("hitl requires --autonomy A0..A4");
  return after;
}
function asBoolean(value, message2) {
  if (value === void 0) return false;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new KernelError(message2);
}

// src/kernel/judge-facts.ts
var OTHER_PRIMARY = "other";
var FALLBACK_REASONS = [
  "disabled",
  "no-key",
  "no-fetch",
  "breaker-open",
  "timeout",
  "http-429",
  "http-4xx",
  "http-5xx",
  "network",
  "invalid-response",
  "oversize-state"
];
var RISK_KEYS = [
  "reversibility",
  "blast_radius",
  "data_sensitivity",
  "contract_surface",
  "spend"
];
var FALLBACK_KEYS = ["source", "reason"];
var JEV_KEYS = [
  "source",
  "model",
  "latency_ms",
  "is_project_change",
  "primary",
  "intents",
  "rules",
  "scale",
  "design_work",
  "risk"
];
var PRIMARY_KEYS = ["id", "confidence", "margin"];
var MODEL_SLUG = /^[A-Za-z0-9@_./:-]{1,256}$/;
function judgeSummary(fact) {
  if (fact === null) return { source: "fallback", reason: "no-judge-fact", model: null };
  if (fact.source === "fallback") return { source: "fallback", reason: fact.reason, model: null };
  return { source: "jev", reason: null, model: fact.model };
}
function judgeFact(value, regs) {
  const row = record("judge", value);
  const source = row["source"];
  if (source === "fallback") return fallbackFact(row);
  if (source === "jev") return jevFact(row, regs);
  throw new KernelError("resolve --facts: judge.source must be jev|fallback");
}
function fallbackFact(row) {
  refuseUnknown("judge", row, FALLBACK_KEYS);
  const reason = FALLBACK_REASONS.find((candidate) => candidate === row["reason"]);
  if (reason === void 0) {
    throw new KernelError(`resolve --facts: judge.reason must be one of ${FALLBACK_REASONS.join("|")}`);
  }
  return { source: "fallback", reason };
}
function jevFact(row, regs) {
  refuseUnknown("judge", row, JEV_KEYS);
  const active = new Set(regs.intents.intents.filter((intent) => intent.active).map((intent) => intent.id));
  const ruleFacts = new Set(
    regs.decisionRules.rules.flatMap((rule) => rule.judge_fact === null ? [] : [rule.judge_fact])
  );
  return {
    source: "jev",
    model: modelSlug(row["model"]),
    latency_ms: count("judge.latency_ms", row["latency_ms"]),
    is_project_change: probability("judge.is_project_change", row["is_project_change"]),
    primary: primaryOf(row["primary"], active),
    intents: probabilities("judge.intents", row["intents"], active),
    rules: probabilities("judge.rules", row["rules"], ruleFacts),
    scale: level("judge.scale", row["scale"]),
    design_work: probability("judge.design_work", row["design_work"]),
    risk: riskOf(row["risk"])
  };
}
function primaryOf(value, active) {
  const row = record("judge.primary", value);
  refuseUnknown("judge.primary", row, PRIMARY_KEYS);
  const id = row["id"];
  if (typeof id !== "string" || id !== OTHER_PRIMARY && !active.has(id)) {
    throw new KernelError(`resolve --facts: judge.primary.id must be an active intent id or ${OTHER_PRIMARY}`);
  }
  return {
    id,
    confidence: probability("judge.primary.confidence", row["confidence"]),
    margin: probability("judge.primary.margin", row["margin"])
  };
}
function riskOf(value) {
  const row = record("judge.risk", value);
  refuseUnknown("judge.risk", row, RISK_KEYS);
  return {
    reversibility: level("judge.risk.reversibility", row["reversibility"]),
    blast_radius: level("judge.risk.blast_radius", row["blast_radius"]),
    data_sensitivity: level("judge.risk.data_sensitivity", row["data_sensitivity"]),
    contract_surface: level("judge.risk.contract_surface", row["contract_surface"]),
    spend: level("judge.risk.spend", row["spend"])
  };
}
function probabilities(at, value, known) {
  const row = record(at, value);
  const out = {};
  for (const [key, item] of Object.entries(row)) {
    if (!known.has(key)) throw new KernelError(`resolve --facts: unknown fact ${at}.${key}`);
    out[key] = probability(`${at}.${key}`, item);
  }
  return out;
}
function refuseUnknown(at, row, allowed) {
  for (const key of Object.keys(row)) {
    if (!allowed.includes(key)) throw new KernelError(`resolve --facts: unknown fact ${at}.${key}`);
  }
}
function record(at, value) {
  if (!isRecord(value)) throw new KernelError(`resolve --facts: ${at} must be an object`);
  return value;
}
function modelSlug(value) {
  if (typeof value !== "string" || !MODEL_SLUG.test(value)) {
    throw new KernelError("resolve --facts: judge.model must be a slug of at most 256 characters");
  }
  return value;
}
function probability(at, value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new KernelError(`resolve --facts: ${at} must be a number in [0,1]`);
  }
  return value;
}
function count(at, value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new KernelError(`resolve --facts: ${at} must be an integer >= 0`);
  }
  return value;
}
function level(at, value) {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new KernelError(`resolve --facts: ${at} must be 0|1|2`);
}

// src/kernel/model.ts
function modelSection(facts, regs) {
  const models = regs.models;
  const work = models.work_types.find((w) => w.id === facts.workType);
  if (work === void 0) {
    throw new KernelError(`unknown work type: ${facts.workType} (see registries/models.json work_types)`);
  }
  const tier = tierById(models.tiers, work.tier, `work type ${work.id}`);
  const next = tier.escalates_to === null ? null : tierById(models.tiers, tier.escalates_to, `tier ${tier.id}`);
  return {
    work: work.id,
    tier: tier.id,
    model: tier.model,
    escalates_to: next === null ? null : { tier: next.id, model: next.model }
  };
}
function tierById(tiers, id, referrer) {
  const tier = tiers.find((t) => t.id === id);
  if (tier === void 0) {
    throw new KernelError(`registries/models.json: ${referrer} names an undefined tier: ${id}`);
  }
  return tier;
}

// src/kernel/repair.ts
function repairSection(facts, regs) {
  const repair = regs.policy.repair;
  const check = facts.check;
  if (check === "") throw new KernelError("repair requires --check");
  if (!repair.checks.includes(check)) {
    throw new KernelError(`unknown check: ${check} (must be one of policy.json.repair.checks)`);
  }
  const situation = facts.situation;
  if (situation !== void 0 && situation !== "") {
    if (repair.never_repair.includes(situation)) {
      const answer = repair.never_repair_answer;
      return { check, action: answer.action, reason: fillTemplate(answer.reason, { situation }) };
    }
    const row = repair.by_situation.find((entry) => entry.situation === situation);
    if (row === void 0 || row.action === null || row.reason === null) {
      throw new KernelError(`unknown situation: ${situation}`);
    }
    return { check, action: row.action, reason: row.reason };
  }
  const attempt2 = facts.attempt;
  if (attempt2 === void 0 || !Number.isInteger(attempt2) || attempt2 < 0) {
    throw new KernelError("repair (red ladder) requires a numeric --attempt");
  }
  const bound = repair.max_fix_attempts_per_check;
  const measured = {
    within_fix_attempts: attempt2 < bound,
    within_escalations: attempt2 < bound + repair.escalations
  };
  const rung = evaluateFirst(repair.ladder, { facts: measured });
  if (rung === void 0) {
    throw new KernelError("policy.json repair.ladder has no rung for this attempt \u2014 the ladder must end in a row with an empty when");
  }
  return { check, action: rung.action, reason: rung.reason };
}

// src/kernel/combine-aggregate.ts
var RISK_ORDER = ["low", "medium", "high"];
function aggregateIntents(ids, regs, kept = /* @__PURE__ */ new Set()) {
  const chosen = new Set(ids);
  const rows = ids.flatMap((id) => regs.intents.intents.filter((row) => row.id === id));
  const hasNonSuppressible = rows.some((row) => !row.suppressible);
  const suppressed = [];
  const surviving = [];
  for (const row of rows) {
    const by = kept.has(row.id) ? null : suppressorOf(row, chosen, hasNonSuppressible);
    if (by === null) surviving.push(row);
    else suppressed.push({ id: row.id, by });
  }
  return {
    intents: surviving.map((row) => row.id),
    suppressed,
    agents: [...new Set(surviving.flatMap((row) => row.agents))],
    modelTier: highest(surviving.map((row) => row.model_tier), regs.models.escalation_order),
    riskFloor: highest(surviving.map((row) => row.risk_floor), RISK_ORDER),
    multiAgent: surviving.filter((row) => row.agents.length > 0).length >= regs.policy.router.escalate_when.multi_agent_intents_min,
    dispatchPlan: surviving.some((row) => row.requires_dispatch_plan)
  };
}
function suppressorOf(row, chosen, hasNonSuppressible) {
  if (row.suppressible && hasNonSuppressible) return "more-specific-match";
  return row.suppressed_by.find((id) => chosen.has(id)) ?? null;
}
function highest(values, order) {
  let best = null;
  let bestIndex = -1;
  for (const value of values) {
    if (value === null) continue;
    const index = order.indexOf(value);
    if (index > bestIndex) {
      bestIndex = index;
      best = value;
    }
  }
  return best;
}

// src/kernel/tiebreak-facts.ts
function tiebreakFact(value, regs) {
  if (!isRecord(value)) throw new KernelError("resolve --facts: tiebreak must be an object");
  const active = new Set(regs.intents.intents.filter((intent) => intent.active).map((intent) => intent.id));
  const fact = {};
  for (const [id, score] of Object.entries(value)) {
    if (!active.has(id)) throw new KernelError(`resolve --facts: unknown fact tiebreak.${id}`);
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new KernelError(`resolve --facts: tiebreak.${id} must be a number in [0,1]`);
    }
    fact[id] = score;
  }
  return fact;
}
function refuseUnrankedTiebreak(fact, ranked) {
  const rankedIds = new Set(ranked.map((candidate) => candidate.id));
  for (const id of Object.keys(fact)) {
    if (!rankedIds.has(id)) throw new KernelError(`resolve --facts: tiebreak.${id} is not a ranked candidate`);
  }
}
var MIN_SURVIVORS = 2;
function tiebreakWinner(survivors, ranked, fact, policy) {
  if (survivors.length < MIN_SURVIVORS) return null;
  const scores = new Map(Object.entries(fact));
  const rankedIndexOf = new Map(ranked.map((candidate, index) => [candidate.id, index]));
  const scored = [];
  for (const id of survivors) {
    const score = scores.get(id);
    const rankedIndex = rankedIndexOf.get(id);
    if (score === void 0 || rankedIndex === void 0) return null;
    scored.push({ id, score, rankedIndex });
  }
  scored.sort((a, b) => b.score - a.score || a.rankedIndex - b.rankedIndex);
  const [best, second] = scored;
  if (best === void 0 || second === void 0) return null;
  if (best.score < policy.min_similarity) return null;
  if (best.score - second.score < policy.margin) return null;
  return best.id;
}

// src/kernel/combine.ts
var FANOUT_RULE = "rule-fanout";
var FANOUT_SCALE = 2;
var SPEC_THRESHOLD_RULE = "rule-spec-threshold";
var NEW_FEATURE_INTENT = "new-feature";
var LOW_CONFIDENCE_REASON = "low-confidence";
var MULTI_AGENT_REASON = "multi-agent-dispatch";
var DISPATCH_PLAN_REASON = "requires-dispatch-plan";
var KEPT_FLOOR = "high";
function combine(input) {
  const { judge } = input;
  const jev = judge !== null && judge.source === "jev" ? judge : null;
  const riskProposal = jev === null ? null : proposalOf(jev);
  const summary = judgeSummary(judge);
  if (jev === null || input.mode !== "authoritative") return deterministic(input, summary, riskProposal);
  return folded(input, jev, summary, riskProposal);
}
function deterministic(input, summary, riskProposal) {
  const { route, decisions, regs } = input;
  const winner = input.tiebreak !== void 0 && route.ambiguous ? tiebreakWinner(route.intents, route.ranked, input.tiebreak, regs.policy.router.tiebreak) : null;
  if (winner !== null) return narrowed(input, winner, summary, riskProposal);
  return {
    intents: route.intents,
    ranked: route.ranked,
    ambiguous: route.ambiguous,
    decisionMatches: decisions.matches,
    judgeAdded: [],
    anyHigh: decisions.any_high,
    riskProposal,
    judgeSummary: summary,
    escalateReasons: route.reasons,
    suppressed: route.suppressed,
    agents: route.agents,
    modelTier: route.model_tier,
    riskFloor: decisions.any_high ? "high" : route.risk_floor,
    tiebreakWinner: null
  };
}
function narrowed(input, winner, summary, riskProposal) {
  const { route, decisions, regs } = input;
  const keptFloorIds = highFloorIds(route.intents, regs);
  const kept = route.intents.filter((id) => id === winner || keptFloorIds.has(id));
  const dropped = route.intents.filter((id) => !kept.includes(id));
  const aggregate = aggregateIntents(kept, regs);
  return {
    intents: aggregate.intents,
    ranked: route.ranked,
    ambiguous: false,
    decisionMatches: decisions.matches,
    judgeAdded: [],
    anyHigh: decisions.any_high,
    riskProposal,
    judgeSummary: summary,
    escalateReasons: route.reasons,
    suppressed: [...route.suppressed, ...dropped.map((id) => ({ id, by: winner }))],
    agents: aggregate.agents,
    modelTier: highest([route.model_tier, aggregate.modelTier], regs.models.escalation_order),
    riskFloor: decisions.any_high ? "high" : highest([route.risk_floor, aggregate.riskFloor], RISK_ORDER),
    tiebreakWinner: winner
  };
}
function folded(input, jev, summary, riskProposal) {
  const { route, decisions, regs } = input;
  const thresholds = regs.policy.judge.thresholds;
  const choice = chooseIntents(jev, regs);
  const keptHigh = highFloorIds(route.intents, regs);
  const ids = [...choice.ids, ...route.intents.filter((id) => keptHigh.has(id) && !choice.ids.includes(id))];
  const aggregate = aggregateIntents(ids, regs, keptHigh);
  const added = judgeAddedRules(jev, ids, decisions, regs).map((rule) => matchFromRule(rule.id, regs));
  const decisionMatches = [...decisions.matches, ...added];
  const anyHigh = decisionMatches.some((match) => match.risk === "high");
  const intentFloor = highest([route.risk_floor, aggregate.riskFloor], RISK_ORDER);
  const riskFloor2 = highest([anyHigh ? "high" : intentFloor, riskProposal], RISK_ORDER);
  const doubt = choice.ambiguous || jev.primary.confidence < thresholds.primary_confidence || jev.primary.margin < thresholds.margin;
  const escalateReasons = regs.policy.router.reasons.filter(
    (reason) => route.reasons.includes(reason) || reason === MULTI_AGENT_REASON && aggregate.multiAgent || reason === DISPATCH_PLAN_REASON && aggregate.dispatchPlan || reason === LOW_CONFIDENCE_REASON && doubt
  );
  return {
    intents: aggregate.intents,
    ranked: route.ranked,
    ambiguous: choice.ambiguous,
    decisionMatches,
    judgeAdded: added.map((match) => match.id),
    anyHigh,
    riskProposal,
    judgeSummary: summary,
    escalateReasons,
    suppressed: aggregate.suppressed,
    agents: aggregate.agents,
    // Never below the deterministic tier: uncertainty favours the stronger
    // model (rules/models.md), as in narrowed().
    modelTier: highest([route.model_tier, aggregate.modelTier], regs.models.escalation_order),
    riskFloor: riskFloor2,
    // The judge is the semantic tier above the tie-break, so the fold ignores it.
    tiebreakWinner: null
  };
}
function chooseIntents(jev, regs) {
  const thresholds = regs.policy.judge.thresholds;
  const qualifying = regs.intents.intents.map((row, index) => ({ row, index, p: jev.intents[row.id] ?? 0 })).filter(({ row, p }) => row.active && p >= (row.threshold ?? thresholds.intent_default)).sort((a, b) => b.p - a.p || a.index - b.index).slice(0, regs.policy.router.scoring.max_intents).map(({ row }) => row.id);
  if (qualifying.length > 0) return { ids: qualifying, ambiguous: false };
  if (jev.primary.confidence >= thresholds.primary_confidence) {
    return { ids: jev.primary.id === OTHER_PRIMARY ? [] : [jev.primary.id], ambiguous: false };
  }
  return { ids: [], ambiguous: true };
}
function highFloorIds(survivors, regs) {
  const high = new Set(regs.intents.intents.filter((row) => row.risk_floor === KEPT_FLOOR).map((row) => row.id));
  return new Set(survivors.filter((id) => high.has(id)));
}
function judgeAddedRules(jev, folded2, decisions, regs) {
  const matched = new Set(decisions.matches.map((match) => match.id));
  const ruleDefault = regs.policy.judge.thresholds.rule_default;
  return rulesInPriorityOrder(regs).filter((rule) => {
    if (matched.has(rule.id)) return false;
    if (rule.id === FANOUT_RULE) return jev.scale === FANOUT_SCALE;
    if (rule.id === SPEC_THRESHOLD_RULE) return folded2.includes(NEW_FEATURE_INTENT);
    if (rule.judge_fact === null) return false;
    return (jev.rules[rule.judge_fact] ?? 0) >= (rule.judge_threshold ?? ruleDefault);
  });
}
function proposalOf(jev) {
  const { risk } = jev;
  const top = Math.max(risk.reversibility, risk.blast_radius, risk.data_sensitivity, risk.contract_surface, risk.spend);
  return RISK_ORDER[top] ?? "high";
}

// src/kernel/resolve-task-contract.ts
function composeTaskContract(facts, regs) {
  const { prompt, route, judge, tiebreak } = facts;
  if (tiebreak !== null) refuseUnrankedTiebreak(tiebreak, route.ranked);
  const combined = combine({
    route,
    decisions: decisionsSection({ prompt }, regs),
    scale: route.scale,
    judge,
    mode: judgeMode2(judge, regs),
    regs,
    ...tiebreak === null ? {} : { tiebreak }
  });
  const decisionRules = {
    matches: combined.decisionMatches,
    any_high: combined.anyHigh,
    judge_added: combined.judgeAdded
  };
  const floor = combined.riskFloor;
  const ceiling = floor === null ? null : ceilingAt(floor, regs);
  const topology = topologyRequired(combined.decisionMatches, regs);
  const hitl = (combined.anyHigh || topology) && floor !== null && ceiling !== null ? hitlSection({ riskTier: floor, autonomy: ceiling, topology }, regs) : null;
  return {
    decision_rules: decisionRules,
    hitl,
    task_contract: taskContract({ prompt, route, combined, floor, ceiling }, regs)
  };
}
var POLICY_BUNDLE = ["gates", "models", "parallelism", "risk-autonomy", "verification"];
var AGENT_POLICY_RULE = "subagents";
function judgeMode2(judge, regs) {
  return judge !== null && judge.source === "jev" ? regs.policy.judge.mode : "shadow";
}
function taskContract(inputs, regs) {
  const { prompt, route, combined } = inputs;
  const matches2 = combined.decisionMatches;
  const matched = regs.intents.intents.filter((intent) => combined.intents.includes(intent.id));
  const declaredSkills = unique(matched.flatMap((intent) => intent.skills));
  const substantive = combined.intents.length > 0 || matches2.length > 0 || route.scale.big_task || route.scale.spec_authoring || route.scale.design_work || // A prompt can request real work without matching a registered domain
  // ("update this prose"). The registry-owned action expression is the
  // fallback that keeps such work inside the safety/verification bundle.
  substantiveAction(prompt, regs);
  return {
    substantive,
    intents: [...combined.intents],
    escalates: combined.escalateReasons.length > 0,
    escalation_reasons: [...combined.escalateReasons],
    suppressed: combined.suppressed.map((entry) => ({ ...entry })),
    agents: [...combined.agents],
    rules: unique(matched.flatMap((intent) => intent.rules)),
    // jq's `unique` sorts as well as de-duplicates, and the answer callers
    // already parse carries that ordering.
    policy_rules: [
      .../* @__PURE__ */ new Set([
        ...substantive ? POLICY_BUNDLE : [],
        ...combined.agents.length > 0 ? [AGENT_POLICY_RULE] : []
      ])
    ].sort(),
    skills: enabledSkills(declaredSkills, regs.skillState),
    skills_suppressed: suppressedSkills(declaredSkills, regs.skillState),
    commands: unique(matched.flatMap((intent) => intent.commands)),
    mcp: unique(matched.flatMap((intent) => intent.mcp)),
    model_tier: combined.modelTier,
    risk_floor: inputs.floor,
    autonomy_ceiling_at_floor: inputs.ceiling,
    scale: { ...route.scale },
    decision_rules: matches2.map((match) => match.id),
    required: unique(matches2.flatMap((match) => match.require)),
    // jq's `map(.gate // empty)` drops a null value rather than emitting it, so
    // a rule that names no gate and no preference contributes to neither list.
    gates: unique(declared(matches2.map((match) => match.gate))),
    preferences: unique(declared(matches2.map((match) => match.prefer))),
    judge: { ...combined.judgeSummary },
    risk_proposal: combined.riskProposal,
    tiebreak: combined.tiebreakWinner
  };
}
var TOPOLOGY_WHEN_KEY = "multi_agent_system";
function topologyRequired(matches2, regs) {
  const matched = new Set(matches2.map((match) => match.id));
  return regs.decisionRules.rules.some(
    (rule) => matched.has(rule.id) && rule.when[TOPOLOGY_WHEN_KEY] === true
  );
}
function ceilingAt(floor, regs) {
  const ceiling = regs.policy.autonomy.ceiling_by_risk[floor];
  if (ceiling === "") {
    throw new KernelError(
      `policy.json has no autonomy.ceiling_by_risk[${floor}] \u2014 resolve-task cannot resolve the ceiling hitl needs`
    );
  }
  return ceiling;
}
function substantiveAction(prompt, regs) {
  const source = regs.policy.parallelism.prompt_signals.substantive_action;
  const pattern = compilePromptRegex(source, "registries/policy.json: .parallelism.prompt_signals.substantive_action");
  return pattern.test(asciiDowncase(prompt));
}
function declared(values) {
  return values.filter((value) => value !== null);
}
function unique(values) {
  return [...new Set(values)];
}

// src/kernel/risk.ts
var AGGREGATORS = {
  max: maxTier
};
function riskSection(facts, regs) {
  if (facts.signals !== void 0) return classify(facts.signals, regs);
  if (facts.riskTier !== void 0) return forTier(facts.riskTier, regs);
  throw new KernelError("risk section requires signals or a classified risk tier");
}
function classify(signals, regs) {
  const policy = regs.policy;
  if (!isRecord(signals)) {
    throw new KernelError("risk --signals must be a JSON object with inputs{} and/or floors[]");
  }
  const inputs = optionalRecord(signals["inputs"], "risk --signals .inputs must be an object of input-id to tier");
  const floors = optionalArray(signals["floors"], "risk --signals .floors must be an array of floor ids");
  const entries = Object.entries(inputs);
  if (entries.length === 0 && floors.length === 0) {
    throw new KernelError(
      "risk --signals needs a non-empty inputs{} or floors[] \u2014 an empty payload is not low risk, it is no evidence"
    );
  }
  const knownInputs = policy.risk.inputs.map((input) => input.id);
  const unknownInputs = entries.filter(([id]) => !knownInputs.includes(id)).map(([id]) => id);
  if (unknownInputs.length > 0) {
    throw new KernelError(`unknown risk input(s): ${unknownInputs.join(", ")}`);
  }
  const invalidValues = entries.filter(([, tier2]) => !isRiskTier(tier2)).map(([id]) => id);
  if (invalidValues.length > 0) {
    throw new KernelError(`invalid tier value on input(s): ${invalidValues.join(", ")}`);
  }
  const unknownFloors = floors.filter((floor) => typeof floor !== "string" || !policy.risk.high_floors.includes(floor)).map((floor) => String(floor));
  if (unknownFloors.length > 0) {
    throw new KernelError(`unknown floor(s): ${unknownFloors.join(", ")}`);
  }
  const aggregate = AGGREGATORS[policy.risk.aggregation];
  if (aggregate === void 0) {
    throw new KernelError(
      `unsupported risk aggregation: ${policy.risk.aggregation} (registries/policy.json .risk.aggregation)`
    );
  }
  const applied = floors.filter((floor) => typeof floor === "string");
  const tier = applied.length > 0 ? "high" : aggregate(entries.map(([, value]) => value).filter(isRiskTier));
  return {
    risk: tier,
    autonomy_ceiling: policy.autonomy.ceiling_by_risk[tier],
    gates: policy.gates.by_risk[tier],
    floors_applied: applied
  };
}
function forTier(tier, regs) {
  if (!isRiskTier(tier)) throw new KernelError("gates requires --risk low|medium|high");
  return {
    risk: tier,
    gates: regs.policy.gates.by_risk[tier],
    spec_threshold: regs.policy.gates.spec_threshold
  };
}
function maxTier(tiers) {
  if (tiers.includes("high")) return "high";
  if (tiers.includes("medium")) return "medium";
  return "low";
}
function optionalRecord(value, message2) {
  if (value === void 0 || value === null) return {};
  if (!isRecord(value)) throw new KernelError(message2);
  return value;
}
function optionalArray(value, message2) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message2);
  return value;
}

// src/lib/glob.ts
var REGEX_LITERALS = /[.+^${}()|\\\]/]/g;
function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob.charAt(i);
    if (c === "*") {
      re += ".*";
    } else if (c === "?") {
      re += ".";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end === -1) {
        re += "\\[";
      } else {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith("!")) cls = `^${cls.slice(1)}`;
        re += `[${cls.replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else {
      re += c.replace(REGEX_LITERALS, "\\$&");
    }
  }
  return new RegExp(`${re}$`);
}
function globMatch(glob, value) {
  return globToRegExp(glob).test(value);
}

// src/kernel/score.ts
var K1 = 1.2;
var B = 0.75;
var STOPWORDS = new Set(
  "a an the to of for and or in on at is it this that with be our we i me my you your can could should would will just which what when how all each".split(" ")
);
function scoreIntents(text2, regs) {
  const scoring = regs.policy.router.scoring;
  const compiled = compile(regs.intents);
  const lower = asciiDowncase(text2);
  const query = new Set(tokenize(text2));
  const lexical = exemplarScores(query, compiled.index, compiled.rows.length);
  const maxLexical = Math.max(0, ...lexical);
  const paths = compiled.pathAware ? pathDomains(text2, regs.routing) : /* @__PURE__ */ new Map();
  const candidates = [];
  compiled.rows.forEach((row, order) => {
    const features = [];
    let sum = 0;
    for (const phrase of row.phrases) {
      if (!boundedContains(lower, phrase.lower)) continue;
      sum += phrase.weight;
      features.push(`+${formatNumber(phrase.weight)} "${phrase.text}"`);
    }
    const pair = row.pair === null ? null : pairHit(row.pair, query);
    if (pair !== null) {
      sum += pair.weight;
      features.push(`+${formatNumber(pair.weight)} pair ${pair.label}`);
    }
    for (const phrase of row.negative) {
      if (!boundedContains(lower, phrase.lower)) continue;
      sum -= phrase.weight;
      features.push(`-${formatNumber(phrase.weight)} "${phrase.text}"`);
    }
    const token = row.pathDomain === null ? void 0 : paths.get(row.pathDomain);
    if (token !== void 0 && scoring.path_weight > 0) {
      sum += scoring.path_weight;
      features.push(`+${formatNumber(scoring.path_weight)} path ${token}`);
    }
    const lex = lexical[order] ?? 0;
    if (lex > 0 && maxLexical > 0 && scoring.bm25_weight > 0) {
      const contribution = scoring.bm25_weight * lex / maxLexical;
      sum += contribution;
      features.push(`+${formatNumber(contribution)} exemplar`);
    }
    const score = Math.max(0, round2(sum));
    if (score > 0) candidates.push({ order, id: row.id, score, features });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const total = candidates.reduce((acc, c) => acc + c.score, 0);
  return candidates.map((c) => ({ id: c.id, score: c.score, confidence: round2(c.score / total), features: c.features }));
}
function marginOf(ranked) {
  const top = ranked[0];
  if (top === void 0) return null;
  const second = ranked[1];
  if (second === void 0) return 1;
  return round2((top.score - second.score) / top.score);
}
function tokenize(text2) {
  const out = [];
  for (const word of asciiDowncase(text2).split(/[^a-z0-9]+/)) {
    if (word === "" || STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}
function stem(word) {
  if (word.length > 4 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
function boundedContains(haystack, needle) {
  if (needle === "") return false;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (!isAlnum(haystack[i - 1]) && !isAlnum(haystack[i + needle.length])) return true;
  }
  return false;
}
var ALNUM = /^[\p{Alphabetic}\p{Nd}]$/u;
function isAlnum(char) {
  return char !== void 0 && ALNUM.test(char);
}
function matchPathDomain(file, reg, root) {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const norm = `/${file}`;
  if (root !== null) {
    for (const dir of reg.excluded.self_dirs) {
      if (file.startsWith(`${root}/${dir}/`)) return { kind: "excluded" };
    }
  }
  for (const pattern of reg.excluded.paths) {
    if (globMatch(pattern, norm)) return { kind: "excluded" };
  }
  for (const pattern of reg.excluded.basenames) {
    if (globMatch(pattern, base)) return { kind: "excluded" };
  }
  for (const id of reg.precedence) {
    const domain = reg.domains.find((d) => d.id === id);
    if (domain === void 0) continue;
    const hit = domain.match.paths.some((p) => globMatch(p, norm)) || domain.match.basenames.some((p) => globMatch(p, base));
    if (hit) return { kind: "domain", domain };
  }
  return { kind: "none" };
}
var LEADING_WRAP = /^[`'"([{<]+/;
var TRAILING_WRAP = /[`'",;:!?)\]}>.]+$/;
var FILE_EXTENSION = /\.[A-Za-z0-9]+$/;
function pathDomains(text2, reg) {
  const found = /* @__PURE__ */ new Map();
  for (const raw of text2.split(/\s+/)) {
    const token = raw.replace(LEADING_WRAP, "").replace(TRAILING_WRAP, "");
    if (token === "" || !(token.includes("/") || FILE_EXTENSION.test(token))) continue;
    const match = matchPathDomain(token, reg, null);
    if (match.kind === "domain" && !found.has(match.domain.id)) found.set(match.domain.id, token);
  }
  return found;
}
var compiledByRegistry = /* @__PURE__ */ new WeakMap();
function compile(intents) {
  const cached = compiledByRegistry.get(intents);
  if (cached !== void 0) return cached;
  const rows = intents.intents.map(compileRow);
  const compiled = {
    rows,
    index: buildIndex(intents.intents),
    pathAware: rows.some((row) => row.pathDomain !== null)
  };
  compiledByRegistry.set(intents, compiled);
  return compiled;
}
function compileRow(row) {
  const lowered = (phrase) => ({ ...phrase, lower: asciiDowncase(phrase.text) });
  const terms = (text2) => ({ text: text2, terms: tokenize(text2) });
  return {
    id: row.id,
    phrases: row.phrases.map(lowered),
    negative: row.negative.map(lowered),
    pair: row.verb_object === null ? null : { verbs: row.verb_object.verbs.map(terms), objects: row.verb_object.objects.map(terms), weight: row.verb_object.weight },
    pathDomain: row.phrases_declared ? row.domain : null
  };
}
function pairHit(pair, query) {
  const present = (entry) => entry.terms.length > 0 && entry.terms.every((term) => query.has(term));
  const verb = pair.verbs.find(present);
  const object = pair.objects.find(present);
  return verb === void 0 || object === void 0 ? null : { label: `${verb.text}+${object.text}`, weight: pair.weight };
}
function buildIndex(rows) {
  const documents = [];
  const documentFrequency = /* @__PURE__ */ new Map();
  rows.forEach((row, index) => {
    const tokens = tokenize(row.exemplars.join(" "));
    if (tokens.length === 0) return;
    const frequencies = /* @__PURE__ */ new Map();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    for (const token of frequencies.keys()) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    documents.push({ row: index, frequencies, length: tokens.length });
  });
  const totalLength = documents.reduce((acc, doc) => acc + doc.length, 0);
  return { documents, documentFrequency, averageLength: documents.length === 0 ? 0 : totalLength / documents.length };
}
function exemplarScores(query, index, rowCount) {
  const scores = new Array(rowCount).fill(0);
  const total = index.documents.length;
  if (total === 0 || query.size === 0) return scores;
  for (const doc of index.documents) {
    let sum = 0;
    for (const term of query) {
      const frequency = doc.frequencies.get(term);
      if (frequency === void 0) continue;
      const df = index.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      sum += idf * frequency * (K1 + 1) / (frequency + K1 * (1 - B + B * doc.length / index.averageLength));
    }
    scores[doc.row] = sum;
  }
  return scores;
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function formatNumber(value) {
  return String(round2(value));
}

// src/kernel/route.ts
function renderGuidance(domain) {
  const parts = [];
  if (domain.rules.length > 0) parts.push(`rules/${domain.rules.join(".md+")}.md`);
  for (const skill of domain.skills) parts.push(`skill:${skill}`);
  if (domain.agent !== null) parts.push(`agent:${domain.agent}`);
  const line = parts.join(" | ");
  return domain.hint === null ? line : `${line} (${domain.hint})`;
}
function floorOf(domain, regs) {
  const intent = regs.intents.intents.find((i) => i.domain === domain.id);
  return intent === void 0 ? null : intent.risk_floor;
}
function routeByPath(file, regs, root) {
  const match = matchPathDomain(file, regs.routing, root);
  if (match.kind === "excluded") return { domain: null, excluded: true };
  if (match.kind === "none") return { domain: null, excluded: false };
  const dom = match.domain;
  return {
    domain: dom.id,
    rules: dom.rules,
    skills: enabledSkills(dom.skills, regs.skillState),
    skills_suppressed: suppressedSkills(dom.skills, regs.skillState),
    agent: dom.agent,
    risk_floor: floorOf(dom, regs),
    hook_guidance: renderGuidance(dom),
    excluded: false
  };
}
function routeByIntent(text2, regs) {
  const scoring = regs.policy.router.scoring;
  const candidates = scoreIntents(text2, regs);
  const kept = new Set(
    candidates.filter((candidate) => candidate.score >= scoring.min_score).slice(0, scoring.max_intents).map((candidate) => candidate.id)
  );
  const matches2 = regs.intents.intents.filter((intent) => kept.has(intent.id)).map((intent) => intentMatch(intent, regs));
  const margin = marginOf(candidates);
  const top = candidates[0];
  const ambiguous = matches2.length === 0 || top === void 0 || top.confidence < scoring.threshold || margin !== null && margin < scoring.margin;
  return { matches: matches2, ambiguous, ranked: candidates.slice(0, scoring.top_k), margin };
}
function intentMatch(intent, regs) {
  return {
    id: intent.id,
    title: intent.title,
    rules: intent.rules,
    // Per match, not once for the answer: a disabled skill is never
    // recommended, and never disappears from a match without saying why.
    skills: enabledSkills(intent.skills, regs.skillState),
    skills_suppressed: suppressedSkills(intent.skills, regs.skillState),
    agents: intent.agents,
    commands: intent.commands,
    mcp: intent.mcp,
    model_tier: intent.model_tier,
    risk_floor: intent.risk_floor,
    note: intent.note
  };
}
var RISK_ORDER2 = ["low", "medium", "high"];
function routeEscalate(text2, regs) {
  const router = regs.policy.router;
  const raw = routeByIntent(text2, regs);
  const scale = scaleSection({ prompt: text2 }, regs);
  const rawIds = new Set(raw.matches.map((m) => m.id));
  const matched = regs.intents.intents.filter((i) => rawIds.has(i.id));
  const hasNonSuppressible = matched.some((i) => !i.suppressible);
  const suppressed = [];
  const surviving = [];
  for (const intent of matched) {
    const by = suppressorOf2(intent, hasNonSuppressible, rawIds);
    if (by === null) surviving.push(intent);
    else suppressed.push({ id: intent.id, by });
  }
  const agents = [];
  for (const intent of surviving) {
    for (const agent of intent.agents) {
      if (!agents.includes(agent)) agents.push(agent);
    }
  }
  const scaleFlags = {
    big_task: scale.big_task,
    spec_authoring: scale.spec_authoring,
    design_work: scale.design_work
  };
  const agentIntents = surviving.filter((i) => i.agents.length > 0).length;
  const top = raw.ranked[0];
  const triggered = {
    "multi-agent-dispatch": agentIntents >= router.escalate_when.multi_agent_intents_min,
    // Zero RAW matches, not zero survivors: an intent that matched and was then
    // suppressed still routed the prompt somewhere, so the prompt is not
    // unrouted.
    "unrouted-scale": rawIds.size === 0 && router.escalate_when.unrouted_scale_signals.some((signal) => scaleFlags[signal] === true),
    "requires-dispatch-plan": surviving.some((i) => i.requires_dispatch_plan),
    // Weak top confidence or margin among real candidates. Zero candidates never
    // fire it, so a pure question keeps routing nowhere (§2.3).
    "low-confidence": top !== void 0 && (top.confidence < router.scoring.threshold || raw.margin !== null && raw.margin < router.scoring.margin)
  };
  const reasons = router.reasons.filter((reason) => triggered[reason] === true);
  return {
    escalate: reasons.length > 0,
    reasons,
    intents: surviving.map((i) => i.id),
    suppressed,
    agents,
    model_tier: highest2(
      surviving.map((i) => i.model_tier),
      regs.models.escalation_order
    ),
    risk_floor: highest2(
      surviving.map((i) => i.risk_floor),
      RISK_ORDER2
    ),
    scale,
    ambiguous: raw.ambiguous,
    // Passed through unchanged: suppression edits `intents`, never the ranking,
    // so the router agent sees every candidate.
    ranked: raw.ranked,
    margin: raw.margin
  };
}
function suppressorOf2(intent, hasNonSuppressible, rawIds) {
  if (intent.suppressible && hasNonSuppressible) return "more-specific-match";
  return intent.suppressed_by.find((id) => rawIds.has(id)) ?? null;
}
function highest2(values, order) {
  let best = null;
  let bestIndex = -1;
  for (const value of values) {
    if (value === null) continue;
    const index = order.indexOf(value);
    if (index > bestIndex) {
      bestIndex = index;
      best = value;
    }
  }
  return best;
}

// src/kernel/waves.ts
function wavesSection(facts, regs) {
  const cap = regs.policy.parallelism.wave_concurrency_cap;
  if (!Number.isInteger(cap) || cap < 1) {
    throw new KernelError(
      `policy.json .parallelism.wave_concurrency_cap must be a positive integer, not ${String(cap)}`
    );
  }
  const units = parseUnits(facts.units);
  const ids = units.map((unit) => unit.id);
  if (new Set(ids).size !== ids.length) throw new KernelError("duplicate unit ids");
  const unknown = unique2(units.flatMap((unit) => unit.dependsOn.filter((dep) => !ids.includes(dep))));
  if (unknown.length > 0) {
    throw new KernelError(`depends_on references unknown unit(s): ${unknown.join(", ")}`);
  }
  const layers = kahnLayers(units);
  const violations = layers.flatMap(sameFileViolations);
  const waves = layers.flatMap((layer) => chunk(layer, cap)).map((wave) => wave.map((unit) => unit.id));
  return { waves, violations, fanout_line: fanoutLine(waves) };
}
function parseUnits(value) {
  if (!Array.isArray(value)) throw new KernelError("waves --units must be a JSON array");
  const rows = value;
  return rows.map((raw, i) => {
    const malformed5 = `waves --units[${i}] must be an object with a non-empty string id`;
    if (!isRecord(raw)) throw new KernelError(malformed5);
    const id = raw["id"];
    if (typeof id !== "string" || id === "") throw new KernelError(malformed5);
    return {
      id,
      files: stringList(raw["files"], `waves --units[${i}].files must be an array of file paths`),
      dependsOn: stringList(raw["depends_on"], `waves --units[${i}].depends_on must be an array of unit ids`)
    };
  });
}
function stringList(value, message2) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message2);
  const items = value;
  return items.map((item) => {
    if (typeof item !== "string") throw new KernelError(message2);
    return item;
  });
}
function kahnLayers(units) {
  const layers = [];
  const done = /* @__PURE__ */ new Set();
  let remaining = [...units];
  while (remaining.length > 0) {
    const ready = remaining.filter((unit) => unit.dependsOn.every((dep) => done.has(dep)));
    if (ready.length === 0) {
      throw new KernelError(`dependency cycle among: ${remaining.map((unit) => unit.id).join(", ")}`);
    }
    layers.push(ready);
    for (const unit of ready) done.add(unit.id);
    const readyIds = new Set(ready.map((unit) => unit.id));
    remaining = remaining.filter((unit) => !readyIds.has(unit.id));
  }
  return layers;
}
function sameFileViolations(layer) {
  const byFile = /* @__PURE__ */ new Map();
  for (const unit of layer) {
    for (const file of unit.files) {
      const owners = byFile.get(file);
      if (owners === void 0) byFile.set(file, [unit.id]);
      else owners.push(unit.id);
    }
  }
  return [...byFile.entries()].filter(([, owners]) => owners.length > 1).map(([file, owners]) => ({ file, units: owners })).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}
function chunk(layer, cap) {
  const out = [];
  for (let i = 0; i < layer.length; i += cap) out.push(layer.slice(i, i + cap));
  return out;
}
function fanoutLine(waves) {
  const parts = waves.map((wave, i) => `wave${i + 1}=(${wave.join(", ")})`);
  return `[fanout] waves=${waves.length} ${parts.join(" ")}`;
}
function unique2(values) {
  return [...new Set(values)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

// src/kernel/resolve.ts
function resolve(facts, ctx) {
  const answer = {};
  const { prompt } = facts;
  if (facts.path !== void 0 && prompt !== void 0) {
    throw new KernelError("a path fact and a prompt fact cannot be declared together");
  }
  if (facts.escalate === true && prompt === void 0) {
    throw new KernelError("an escalate fact cannot be declared without a prompt fact");
  }
  if (facts.taskContract === true && facts.decisions !== void 0) {
    throw new KernelError("a task-contract fact and a decisions fact cannot be declared together");
  }
  if (facts.taskContract === true && facts.hitl !== void 0) {
    throw new KernelError("a task-contract fact and a hitl fact cannot be declared together");
  }
  if (facts.judge !== void 0 && facts.taskContract !== true) {
    throw new KernelError("a judge fact cannot be declared without a task-contract fact");
  }
  if (facts.tiebreak !== void 0 && facts.taskContract !== true) {
    throw new KernelError("a tiebreak fact cannot be declared without a task-contract fact");
  }
  const judge = facts.judge === void 0 ? null : judgeFact(facts.judge, ctx.registries);
  const tiebreak = facts.tiebreak === void 0 ? null : tiebreakFact(facts.tiebreak, ctx.registries);
  if (facts.path !== void 0) {
    if (facts.path === "") throw new KernelError("a declared path fact must not be empty");
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (prompt !== void 0) {
    if (prompt === "") throw new KernelError("a declared prompt fact must not be empty");
    answer.route = facts.escalate === true || facts.taskContract === true ? { ...routeEscalate(prompt, ctx.registries), judge: judgeSummary(judge) } : routeByIntent(prompt, ctx.registries);
  }
  if (facts.workType !== void 0) {
    answer.model = modelSection({ workType: facts.workType }, ctx.registries);
  }
  if (facts.signals !== void 0 && facts.riskTier !== void 0) {
    throw new KernelError("a signals fact and a classified risk-tier fact cannot be declared together");
  }
  if (facts.signals !== void 0) {
    answer.risk = riskSection({ signals: facts.signals }, ctx.registries);
  }
  if (facts.riskTier !== void 0) {
    answer.risk = riskSection({ riskTier: facts.riskTier }, ctx.registries);
  }
  if (facts.scale !== void 0) {
    answer.scale = scaleSection(facts.scale, ctx.registries);
  }
  if (facts.decisions !== void 0) {
    answer.decision_rules = decisionsSection(facts.decisions, ctx.registries);
  }
  if (facts.repair !== void 0) {
    answer.repair = repairSection(facts.repair, ctx.registries);
  }
  if (facts.admit !== void 0) {
    answer.admit = admitSection(facts.admit, ctx.registries);
  }
  if (facts.breaker !== void 0) {
    answer.breaker = breakerSection(facts.breaker, ctx.registries);
  }
  if (facts.hitl !== void 0) {
    answer.hitl = hitlSection(facts.hitl, ctx.registries);
  }
  if (facts.waves !== void 0) {
    answer.waves = wavesSection(facts.waves, ctx.registries);
  }
  if (facts.taskContract === true) {
    if (prompt === void 0) {
      throw new KernelError("a task-contract fact cannot be declared without a prompt fact");
    }
    const route = answer.route;
    if (route === void 0 || !("escalate" in route)) {
      throw new KernelError("a task-contract fact answered no escalate route section");
    }
    const composed = composeTaskContract({ prompt, route, judge, tiebreak }, ctx.registries);
    answer.decision_rules = composed.decision_rules;
    if (composed.hitl !== null) answer.hitl = composed.hitl;
    answer.task_contract = composed.task_contract;
  }
  return answer;
}

// src/lib/git.ts
var import_node_fs9 = require("node:fs");
function gitOutput(cwd, args, spawn) {
  const result = spawn("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.error !== void 0 || result.status !== 0) return null;
  const out = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return out === "" ? null : out;
}
function gitDir(cwd, spawn) {
  return gitOutput(cwd, ["rev-parse", "--absolute-git-dir"], spawn);
}
function repoRoot(cwd, spawn) {
  return gitOutput(cwd, ["rev-parse", "--show-toplevel"], spawn);
}
function parentOf(dir) {
  const cut = dir.lastIndexOf("/");
  if (cut === -1) return ".";
  const head = dir.slice(0, cut);
  return head === "" ? "/" : head;
}
function walkUp(start, visit) {
  let dir = start;
  let previous = "";
  while (dir !== "/" && dir !== previous && dir !== "") {
    const hit = visit(dir);
    if (hit !== null) return hit;
    previous = dir;
    dir = parentOf(dir);
  }
  return null;
}
function findUpFile(start, name) {
  return walkUp(start, (dir) => {
    const candidate = `${dir}/${name}`;
    return (0, import_node_fs9.existsSync)(candidate) ? candidate : null;
  });
}

// src/hooks/cache.ts
function routeCachePaths(gitDir2, sid, routingSig, buster, rel) {
  if (gitDir2 === "" || rel === "") return null;
  if (/\/\.\.?\//.test(`/${rel}/`)) return null;
  const key = `${safeSid(sid)}-${routingSig}-${buster === "" ? "0" : buster}`;
  const route = `${gitDir2}/engineos-route-cache/${key}/${rel}.route`;
  return { route, output: `${route}.output` };
}
function safeSid(sid) {
  return sid.replace(/[^A-Za-z0-9._-]/g, "_");
}

// src/hooks/edit-context.ts
var import_node_fs11 = require("node:fs");
var import_node_path8 = require("node:path");

// src/hooks/bypass.ts
var import_node_fs10 = require("node:fs");
var import_node_os3 = require("node:os");
var import_node_path7 = require("node:path");
var MARKER = "ENGINEOS_BYPASS";
function bypassFlagPath(env) {
  const configured = env["ENGINEOS_BYPASS_FLAG"];
  if (configured !== void 0 && configured !== "") return configured;
  const home = env["HOME"];
  return (0, import_node_path7.join)(home !== void 0 && home !== "" ? home : (0, import_node_os3.homedir)(), ".claude", "engineos.bypass");
}
function bypassSwitchedOn(env) {
  return env["ENGINEOS_BYPASS"] === "1" || (0, import_node_fs10.existsSync)(bypassFlagPath(env));
}
function bypassMarkedAt(dir) {
  return dir !== null && (0, import_node_fs10.existsSync)(`${dir}/${MARKER}`);
}
function bypassActive(cwd, env, spawn) {
  if (bypassSwitchedOn(env)) return true;
  return bypassMarkedAt(gitDir(cwd === "" ? process.cwd() : cwd, spawn));
}

// src/hooks/edit-context.ts
var NO_WORKTREE = { repo: "", gitDir: "", prefix: "" };
var NOT_A_REPOSITORY = { worktree: NO_WORKTREE, gitDir: null };
var REV_PARSE_ARGS = ["rev-parse", "--absolute-git-dir", "--is-inside-work-tree", "--show-prefix", "--show-toplevel"];
function editContext(from, ctx) {
  if (bypassSwitchedOn(ctx.io.env)) return { status: "bypassed" };
  const facts = repositoryFacts(from, ctx);
  if (bypassMarkedAt(facts.gitDir)) return { status: "bypassed" };
  return { status: "active", worktree: facts.worktree, gitDir: facts.gitDir };
}
function repositoryFacts(from, ctx) {
  const result = ctx.spawn("git", ["-C", from, ...REV_PARSE_ARGS], { encoding: "utf8" });
  if (result.error !== void 0) return NOT_A_REPOSITORY;
  const lines = (typeof result.stdout === "string" ? result.stdout : "").split("\n");
  const gitDir2 = lines[0] ?? "";
  if (gitDir2 === "") return NOT_A_REPOSITORY;
  const insideWorkTree = lines[1] === "true";
  const repo = lines[3] ?? "";
  if (!insideWorkTree || result.status !== 0 || repo === "") return { worktree: NO_WORKTREE, gitDir: gitDir2 };
  return { worktree: { repo, gitDir: gitDir2, prefix: lines[2] ?? "" }, gitDir: gitDir2 };
}
function routingSignature(root) {
  try {
    const stats = (0, import_node_fs11.statSync)((0, import_node_path8.join)(root, "registries", "routing.json"));
    return `${Math.floor(stats.mtimeMs / 1e3)}-${stats.size}`;
  } catch {
    return "unknown";
  }
}
function routeCacheBuster(env) {
  return env["ENGINEOS_ROUTE_CACHE_BUSTER"] ?? "";
}
function underSelfDir(env, gitDir2, ctx) {
  if (!env.file.startsWith(`${ctx.root}/`)) return false;
  for (const dir of selfDirs(env.sessionId, gitDir2, ctx)) {
    if (dir === "") continue;
    if (env.file.startsWith(`${ctx.root}/${dir}/`)) return true;
  }
  return false;
}
function selfDirs(sessionId, gitDir2, ctx) {
  const cache3 = gitDir2 === null ? null : selfDirsCachePath(gitDir2, sessionId, ctx);
  const cached = cache3 === null ? null : readStrings(cache3);
  if (cached !== null) return cached;
  let dirs;
  try {
    dirs = loadRouting(ctx.root).excluded.self_dirs;
  } catch {
    return [];
  }
  if (cache3 !== null) writeAtomic(cache3, `${JSON.stringify(dirs)}
`);
  return dirs;
}
var SELF_DIRS_PROBE = "engineos-self-dirs";
var PROBE_SUFFIX = `/${SELF_DIRS_PROBE}.route`;
function selfDirsCachePath(gitDir2, sessionId, ctx) {
  const probe = routeCachePaths(gitDir2, sessionId, routingSignature(ctx.root), routeCacheBuster(ctx.io.env), SELF_DIRS_PROBE);
  if (probe === null || !probe.route.endsWith(PROBE_SUFFIX)) return null;
  return `${probe.route.slice(0, -PROBE_SUFFIX.length)}.self-dirs`;
}
function readStrings(path) {
  let parsed;
  try {
    parsed = JSON.parse((0, import_node_fs11.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const strings = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") return null;
    strings.push(entry);
  }
  return strings;
}
function writeAtomic(path, contents) {
  const cut = path.lastIndexOf("/");
  try {
    if (cut > 0) (0, import_node_fs11.mkdirSync)(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    (0, import_node_fs11.writeFileSync)(tmp, contents);
    (0, import_node_fs11.renameSync)(tmp, path);
  } catch {
  }
}

// src/hooks/route-before-change.ts
var EXCLUDED_SENTINEL = "__ENGINEOS_EXCLUDED__";
var DEFAULT_GUIDE = "base.md+git.md only";
var CHANGE_RECORD_NOTE = " | no active .engineos/changes record \u2014 open one (.engineos/changes/_template.md)";
var CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".sql"];
var ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;
function run2(env, ctx) {
  if (env.file === "") return silent;
  const start = dirOf(env.file);
  const from = env.cwd === "" ? start : env.cwd;
  const edit = editContext(from, ctx);
  if (edit.status === "bypassed") return silent;
  const git = edit.worktree;
  const cache3 = cachePaths(env, git, ctx);
  let guide = cache3 === null ? null : readGuide(cache3.route);
  if (guide === null) {
    guide = kernelGuide(env.file, ctx);
    if (cache3 !== null) writeAtomic(cache3.route, `${guide}
`);
  }
  if (guide === EXCLUDED_SENTINEL) return silent;
  const projectClaude = findUpFile(start, "CLAUDE.md");
  const projectNote = projectClaude === null ? "" : ` | follow project CLAUDE.md (project > EngineOS): ${projectClaude}`;
  const changeNote = changeRecordNote(env.file, git.repo);
  if (guide === "" && projectNote === "" && changeNote === "") return silent;
  const reusable = projectNote === "" && changeNote === "" ? cache3 : null;
  if (reusable !== null) {
    const cached = readDecision(reusable.output);
    if (cached !== null) return cached;
  }
  const decision = context("PreToolUse", `[router] ${guide === "" ? DEFAULT_GUIDE : guide}${projectNote}${changeNote}`);
  if (reusable !== null) writeAtomic(reusable.output, `${JSON.stringify(decision)}
`);
  return decision;
}
function dirOf(file) {
  const cut = file.lastIndexOf("/");
  if (cut === -1) return ".";
  return cut === 0 ? "/" : file.slice(0, cut);
}
function cachePaths(env, git, ctx) {
  if (git.gitDir === "") return null;
  const rel = cacheRel(env.file, git, env.cwd);
  if (rel === "") return null;
  return routeCachePaths(git.gitDir, env.sessionId, routingSignature(ctx.root), routeCacheBuster(ctx.io.env), rel);
}
function cacheRel(file, git, cwd) {
  if (git.repo !== "" && file.startsWith(`${git.repo}/`)) return file.slice(git.repo.length + 1);
  const base = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  if (file.startsWith(`${base}/`)) return `${git.prefix}${file.slice(base.length + 1)}`;
  return "";
}
function readGuide(path) {
  let contents;
  try {
    contents = (0, import_node_fs12.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
  if (contents === "") return null;
  const newline = contents.indexOf("\n");
  return newline === -1 ? contents : contents.slice(0, newline);
}
function kernelGuide(file, ctx) {
  try {
    const kernel = { root: ctx.root, registries: lazyRegistries(ctx.root) };
    const route = resolve({ path: file }, kernel).route;
    if (route === void 0 || !("domain" in route)) return "";
    if (route.excluded) return EXCLUDED_SENTINEL;
    return route.domain === null ? "" : route.hook_guidance;
  } catch {
    return "";
  }
}
function readDecision(path) {
  let parsed;
  try {
    parsed = JSON.parse((0, import_node_fs12.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed["kind"] !== "context" || parsed["event"] !== "PreToolUse") return null;
  const text2 = parsed["text"];
  return typeof text2 === "string" ? context("PreToolUse", text2) : null;
}
function changeRecordNote(file, repo) {
  if (repo === "") return "";
  if (!CODE_EXTENSIONS.some((extension) => file.endsWith(extension))) return "";
  const dir = (0, import_node_path9.join)(repo, ".engineos", "changes");
  if (!isDirectory2(dir)) return "";
  return hasActiveRecord(dir) ? "" : CHANGE_RECORD_NOTE;
}
function isDirectory2(path) {
  try {
    return (0, import_node_fs12.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function hasActiveRecord(dir) {
  let entries;
  try {
    entries = (0, import_node_fs12.readdirSync)(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    let contents;
    try {
      contents = (0, import_node_fs12.readFileSync)((0, import_node_path9.join)(dir, entry), "utf8");
    } catch {
      continue;
    }
    if (ACTIVE_RECORD.test(contents)) return true;
  }
  return false;
}

// src/hooks/mark-unrecorded.ts
var import_node_fs13 = require("node:fs");

// src/lib/slug.ts
var SLUG_EXTRA = "@_./:-";
var PATH_EXTRA = "@_:-";
function hookSlug(value) {
  return mapBytes(value, SLUG_EXTRA);
}
function hookPathSlug(value) {
  const narrowed2 = mapBytes(value, PATH_EXTRA);
  return narrowed2 === "" ? null : narrowed2;
}
function mapBytes(value, extra) {
  const bytes = Buffer.from(value, "utf8");
  let out = "";
  for (const byte of bytes) out += inClass(byte, extra) ? String.fromCharCode(byte) : "-";
  return out;
}
function inClass(byte, extra) {
  if (byte >= 48 && byte <= 57) return true;
  if (byte >= 65 && byte <= 90) return true;
  if (byte >= 97 && byte <= 122) return true;
  return extra.includes(String.fromCharCode(byte));
}

// src/hooks/mark-unrecorded.ts
var RECORDED_EXTENSIONS = ["ts", "tsx", "js", "jsx", "py", "go", "rs", "sql"];
var ENGINEOS_META = "*/.engineos/*";
var UNRECORDED_MARKER_PREFIX = "ENGINEOS_UNRECORDED.";
function isRecordedExtension(file) {
  return RECORDED_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}
function run3(env, ctx) {
  if (env.file === "") return silent;
  if (!isRecordedExtension(env.file)) return silent;
  if (globMatch(ENGINEOS_META, env.file)) return silent;
  if (env.cwd === "") return silent;
  const edit = editContext(env.cwd, ctx);
  if (edit.status === "bypassed") return silent;
  if (underSelfDir(env, edit.gitDir, ctx)) return silent;
  const dir = edit.gitDir;
  if (dir === null) return silent;
  const sid = hookPathSlug(env.sessionId);
  if (sid === null) return silent;
  try {
    (0, import_node_fs13.writeFileSync)(`${dir}/${UNRECORDED_MARKER_PREFIX}${sid}`, "");
  } catch {
  }
  return silent;
}

// src/hooks/telemetry.ts
var import_node_crypto3 = require("node:crypto");
var import_node_fs17 = require("node:fs");
var import_node_path13 = require("node:path");

// src/hooks/span-writer.ts
var import_node_fs16 = require("node:fs");
var import_node_path12 = require("node:path");

// src/journal/exec-journal.ts
var import_node_fs14 = require("node:fs");
var import_node_path10 = require("node:path");

// src/registry/policy-exec-journal.ts
var SPAN_STATUSES = ["OK", "BLOCKED", "FAILED", "DEGRADED"];
var MAX_VALUE_LENGTH_FALLBACK = 256;
function loadExecJournalPolicy(root) {
  const r = strictReader("policy.json");
  const raw = loadRegistry(root, "policy.json");
  const telemetry = r.requireRecord(isRecord(raw) ? raw["telemetry"] : void 0, ".telemetry");
  const block = r.requireRecord(telemetry["exec_journal"], ".telemetry.exec_journal");
  return {
    home: r.requireString(block["home"], ".telemetry.exec_journal.home"),
    // bash read this through `// empty` and then a digits-only case statement,
    // so an absent, non-numeric or zero value reached the same fallback.
    max_value_length: positiveInteger3(block["max_value_length"]),
    span_kinds: r.requireStrings(block["span_kinds"], ".telemetry.exec_journal.span_kinds"),
    statuses: r.requireStrings(block["statuses"], ".telemetry.exec_journal.statuses")
  };
}
function positiveInteger3(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return MAX_VALUE_LENGTH_FALLBACK;
  return value;
}

// src/journal/schema.ts
var SLUG_RE = /^[A-Za-z0-9@_./:-]+$/;
var JSON_BOOLEANS = ["true", "false"];
var modelTiers = (regs) => regs.models.tiers.map((tier) => tier.id);
var spanKinds = (regs) => regs.execJournal.span_kinds;
var statuses = (regs) => regs.execJournal.statuses;
var riskTiers = (regs) => Object.keys(regs.policy.autonomy.ceiling_by_risk);
var EXEC_JOURNAL_FIELDS = [
  { name: "timestamp", flag: "--timestamp", guard: "slug", json: "string", presence: "required" },
  { name: "run_id", flag: "--run-id", guard: "slug", json: "string", presence: "required" },
  { name: "capability_id", flag: "--capability-id", guard: "slug", json: "string", presence: "required" },
  { name: "agent", flag: "--agent", guard: "slug", json: "string", presence: "always" },
  { name: "model_tier", flag: "--model-tier", guard: "enum", json: "string", presence: "required", values: modelTiers },
  { name: "status", flag: "--status", guard: "enum", json: "string", presence: "required", values: statuses },
  { name: "tokens_in", flag: "--tokens-in", guard: "int", json: "number", presence: "always" },
  { name: "tokens_out", flag: "--tokens-out", guard: "int", json: "number", presence: "always" },
  { name: "duration_ms", flag: "--duration-ms", guard: "int", json: "number", presence: "required" },
  { name: "note", flag: "--note", guard: "free", json: "string", presence: "always" },
  { name: "trace_id", flag: "--trace-id", guard: "slug", json: "string", presence: "optional" },
  { name: "span_id", flag: "--span-id", guard: "slug", json: "string", presence: "optional" },
  { name: "parent_span_id", flag: "--parent-span-id", guard: "slug", json: "string", presence: "optional" },
  { name: "span_kind", flag: "--span-kind", guard: "enum", json: "string", presence: "optional", values: spanKinds },
  { name: "tool", flag: "--tool", guard: "slug", json: "string", presence: "optional" },
  { name: "provider", flag: "--provider", guard: "slug", json: "string", presence: "optional" },
  { name: "model", flag: "--model", guard: "slug", json: "string", presence: "optional" },
  { name: "cost_micros", flag: "--cost-micros", guard: "int", json: "number", presence: "optional" },
  { name: "retry_attempt", flag: "--retry-attempt", guard: "int", json: "number", presence: "optional" },
  { name: "cache_hit", flag: "--cache-hit", guard: "enum", json: "boolean", presence: "optional", values: () => JSON_BOOLEANS },
  { name: "route", flag: "--route", guard: "slug", json: "string", presence: "optional" },
  { name: "risk", flag: "--risk", guard: "enum", json: "string", presence: "optional", values: riskTiers }
];
function journalRegistries(root) {
  const models = memo2(() => loadModels(root));
  const policy = memo2(() => loadPolicy(root));
  const execJournal = memo2(() => loadExecJournalPolicy(root));
  return {
    get models() {
      return models();
    },
    get policy() {
      return policy();
    },
    get execJournal() {
      return execJournal();
    }
  };
}
function memo2(make) {
  let cell = null;
  return () => {
    if (cell === null) cell = { value: make() };
    return cell.value;
  };
}

// src/journal/exec-journal.ts
var JournalError = class extends Error {
  kind = "journal";
  usage;
  constructor(message2, opts = {}) {
    super(message2);
    this.usage = opts.usage ?? false;
  }
};
var DEFAULTED_FIELD = "timestamp";
var BY_FLAG = new Map(EXEC_JOURNAL_FIELDS.map((spec) => [spec.flag, spec]));
var BY_NAME = new Map(EXEC_JOURNAL_FIELDS.map((spec) => [spec.name, spec]));
function parseAppendArgs(argv2) {
  const [file, ...rest] = argv2;
  if (file === void 0 || file === "") throw new JournalError("", { usage: true });
  const fields = {};
  const pending = [...rest];
  for (; ; ) {
    const flag2 = pending.shift();
    if (flag2 === void 0) break;
    const value = pending.shift();
    if (value === void 0) throw new JournalError("", { usage: true });
    const spec = BY_FLAG.get(flag2);
    if (spec === void 0) throw new JournalError(`unknown arg: ${flag2}`, { usage: true });
    fields[spec.name] = value;
  }
  return { file, fields };
}
function appendLine(root, file, argv2, now, regs) {
  requireModelsRegistry(root);
  const { fields } = parseAppendArgs(argv2);
  const maxLength = regs.execJournal.max_value_length;
  for (const { spec, text: text2 } of setInArgvOrder(fields)) {
    if (text2.length > maxLength) {
      throw new JournalError(`${spec.flag} must be at most ${maxLength} characters, got ${text2.length}`);
    }
  }
  if (unset(fields[DEFAULTED_FIELD])) fields[DEFAULTED_FIELD] = now();
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (spec.presence === "required" && unset(fields[spec.name])) throw new JournalError("", { usage: true });
  }
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === void 0) continue;
    guardValue(spec, String(value), regs);
  }
  writeLine(file, emit(fields));
}
function unset(value) {
  return value === void 0 || value === "";
}
function setInArgvOrder(fields) {
  const rows = [];
  for (const [name, value] of Object.entries(fields)) {
    const spec = BY_NAME.get(name);
    if (spec !== void 0 && value !== void 0) rows.push({ spec, text: String(value) });
  }
  return rows;
}
function requireModelsRegistry(root) {
  const path = (0, import_node_path10.join)(root, "registries", "models.json");
  if (!(0, import_node_fs14.existsSync)(path)) throw new JournalError(`no models registry at ${path}`);
}
function guardValue(spec, value, regs) {
  switch (spec.guard) {
    case "free":
      return;
    case "slug":
      if (!SLUG_RE.test(value)) throw new JournalError(`${spec.flag} must match ${SLUG_RE.source}, got: ${value}`);
      return;
    case "int":
      if (!isNonNegativeInt(value)) {
        throw new JournalError(`${spec.flag} must be a non-negative integer, got: ${value}`);
      }
      return;
    case "bool":
      if (value !== "true" && value !== "false") {
        throw new JournalError(`${spec.flag} must be true or false, got: ${value}`);
      }
      return;
    case "enum": {
      const members = spec.values === void 0 ? [] : spec.values(regs);
      if (members.includes(value)) return;
      if (spec.json === "boolean") {
        throw new JournalError(`${spec.flag} must be true or false, got: ${value}`);
      }
      throw new JournalError(`invalid ${spec.name}: ${value} (must be one of: ${members.join(" ")})`);
    }
  }
}
function isNonNegativeInt(value) {
  return /^[0-9]+$/.test(value);
}
function emit(fields) {
  const row = {};
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === void 0) {
      if (spec.presence === "always") row[spec.name] = null;
      continue;
    }
    const text2 = String(value);
    row[spec.name] = spec.json === "number" ? Number.parseInt(text2, 10) : spec.json === "boolean" ? text2 === "true" : text2;
  }
  return row;
}
function writeLine(file, row) {
  try {
    (0, import_node_fs14.appendFileSync)(file, `${encode(row)}
`);
  } catch {
    throw new JournalError(`cannot append to ${file}`);
  }
}
function encode(row) {
  return JSON.stringify(row).replace(/\u007f/g, "\\u007f");
}

// src/journal/telemetry.ts
var import_node_fs15 = require("node:fs");
var import_node_path11 = require("node:path");

// src/registry/policy-telemetry.ts
var reader4 = strictReader("policy.json");
function loadTelemetryPolicy(root) {
  const document = reader4.requireRecord(loadRegistry(root, "policy.json"), "");
  const telemetry = reader4.requireRecord(document["telemetry"], ".telemetry");
  return {
    home: reader4.requireString(telemetry["home"], ".telemetry.home"),
    retention_days: reader4.requireNumber(telemetry["retention_days"], ".telemetry.retention_days"),
    value_pattern: reader4.requireString(telemetry["value_pattern"], ".telemetry.value_pattern"),
    events: reader4.requireRows(telemetry["events"], ".telemetry.events").map((row, i) => ({
      id: reader4.requireString(row["id"], `.telemetry.events[${i}].id`),
      keys: reader4.requireStrings(row["keys"], `.telemetry.events[${i}].keys`)
    }))
  };
}

// src/journal/telemetry.ts
var TelemetryError = class extends Error {
  kind = "telemetry";
};
function requirePolicyPresent(root) {
  if (!(0, import_node_fs15.existsSync)((0, import_node_path11.join)(root, "registries", "policy.json"))) throw new TelemetryError("policy.json missing");
}
function appendEvent(root, file, options, now = utcNow) {
  requirePolicyPresent(root);
  const policy = loadTelemetryPolicy(root);
  const event = policy.events.find((row) => row.id === options.event);
  if (event === void 0) throw new TelemetryError(`unknown event: ${options.event}`);
  const data = parseData(options.data);
  const pattern = compilePattern(policy.value_pattern);
  if (!dataIsValid(data, event.keys, pattern)) {
    throw new TelemetryError(`data failed schema/value_pattern check for event ${options.event}: ${options.data}`);
  }
  const ts = options.ts === void 0 || options.ts === "" ? now() : options.ts;
  const line = jqCompact({ ts, session_id: options.session, event: options.event, data });
  try {
    (0, import_node_fs15.appendFileSync)(file, `${line}
`);
  } catch {
    throw new TelemetryError(`cannot append to ${file}`);
  }
}
function jqCompact(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return jqNumber(value);
  if (typeof value === "string") return jqString(value);
  if (Array.isArray(value)) return `[${value.map((item) => jqCompact(item)).join(",")}]`;
  if (isRecord(value)) {
    const fields = Object.entries(value).map(([key, item]) => `${jqString(key)}:${jqCompact(item)}`);
    return `{${fields.join(",")}}`;
  }
  return "null";
}
function parseData(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TelemetryError(`--data is not valid JSON: ${raw}`);
  }
  if (parsed === false || parsed === null) throw new TelemetryError(`--data is not valid JSON: ${raw}`);
  return parsed;
}
function dataIsValid(data, keys, pattern) {
  if (!isRecord(data)) return false;
  for (const [key, value] of Object.entries(data)) {
    if (!keys.includes(key)) return false;
    if (!valueIsValid(value, pattern)) return false;
  }
  return true;
}
function valueIsValid(value, pattern) {
  if (typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return pattern.test(value);
  if (Array.isArray(value)) return value.every((item) => typeof item === "string" && pattern.test(item));
  return false;
}
function compilePattern(pattern) {
  try {
    return new RegExp(pattern);
  } catch {
    throw new TelemetryError(`telemetry.value_pattern is not a valid regular expression: ${pattern}`);
  }
}
function utcNow() {
  return `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19)}Z`;
}
function jqString(value) {
  return JSON.stringify(value).replace(/\u007F/gu, "\\u007f");
}
function jqNumber(value) {
  if (!Number.isFinite(value)) return "null";
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  const sign = value < 0 ? "-" : "";
  const [digits, exponent] = shortestDigits(Math.abs(value));
  const decpt = exponent + 1;
  if (decpt <= -4 || decpt > digits.length + 15) {
    const mantissa = digits.length > 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}` : digits;
    const power = decpt - 1;
    const powerSign = power < 0 ? "-" : "+";
    return `${sign}${mantissa}e${powerSign}${Math.abs(power).toString().padStart(2, "0")}`;
  }
  if (decpt <= 0) return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  if (decpt >= digits.length) return `${sign}${digits}${"0".repeat(decpt - digits.length)}`;
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}
function shortestDigits(magnitude) {
  const [mantissa, exponent] = magnitude.toExponential().split("e");
  return [(mantissa ?? "0").replace(".", ""), Number.parseInt(exponent ?? "0", 10)];
}

// src/lib/time.ts
var MS_DIGITS_MIN = 12;
function plausibleMs(value) {
  if (!/^[0-9]+$/.test(value)) return false;
  return value.length >= MS_DIGITS_MIN;
}
function parseMs(text2) {
  const trimmed = text2.trim();
  if (!plausibleMs(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function clampMs(value) {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  return floored > 0 ? floored : 0;
}

// src/hooks/span-writer.ts
function fileSpanWriter(opts) {
  const regs = journalRegistries(opts.root);
  const name = hookPathSlug(opts.session) ?? "nosession";
  const journalFile = (0, import_node_path12.join)(opts.dir, `${name}.exec.jsonl`);
  const eventsFile = (0, import_node_path12.join)(opts.dir, `${name}.jsonl`);
  const markers = (0, import_node_path12.join)(opts.dir, "spans");
  return {
    appendSpan(fields) {
      appendLine(opts.root, journalFile, [journalFile, ...toArgv(fields)], opts.timestamp, regs);
    },
    appendEvent(id, data) {
      appendEvent(
        opts.root,
        eventsFile,
        { session: opts.session, event: id, data: JSON.stringify(data) },
        opts.timestamp
      );
    },
    openMarker(id, ms) {
      const marker = markerPath(markers, id);
      if (marker === null) return;
      (0, import_node_fs16.mkdirSync)(markers, { recursive: true });
      (0, import_node_fs16.writeFileSync)(marker, String(ms));
    },
    closeMarker(id) {
      const marker = markerPath(markers, id);
      if (marker === null) return null;
      const text2 = readMarker(marker);
      if (text2 === null) return null;
      (0, import_node_fs16.rmSync)(marker, { force: true });
      return parseMs(text2);
    }
  };
}
function toArgv(fields) {
  const argv2 = [];
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === void 0) continue;
    argv2.push(spec.flag, String(value));
  }
  return argv2;
}
function readMarker(path) {
  try {
    return (0, import_node_fs16.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
}
function markerPath(dir, id) {
  const name = hookPathSlug(id);
  return name === null ? null : (0, import_node_path12.join)(dir, name);
}

// src/hooks/telemetry.ts
function telemetrySink(env, ctx, opts) {
  if (ctx.io.env["ENGINEOS_TELEMETRY"] === "0") return null;
  if (opts.bypassed) return null;
  if (env.cwd === "") return null;
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !(0, import_node_fs17.existsSync)((0, import_node_path13.join)(project, ".engineos"))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === "") return null;
  const dir = (0, import_node_path13.join)(git, "engineos-telemetry");
  try {
    (0, import_node_fs17.mkdirSync)(dir, { recursive: true });
  } catch {
  }
  const session = hookSlug(env.sessionId === "" ? "nosession" : env.sessionId);
  const now = ctx.now;
  return {
    writer: fileSpanWriter({ root: ctx.root, dir, session, timestamp: () => utcSeconds(now()) }),
    now,
    session
  };
}
function spanIdFrom(env) {
  const payload = isRecord(env.raw) ? env.raw : {};
  const toolUseId = payload["tool_use_id"];
  if (typeof toolUseId === "string" && toolUseId !== "") return hookSlug(toolUseId);
  const input = isRecord(payload["tool_input"]) ? payload["tool_input"] : {};
  const brief = `${orEmpty(input["subagent_type"])}:${orEmpty(input["description"])}
`;
  return hookSlug((0, import_node_crypto3.createHash)("sha1").update(brief, "utf8").digest("hex").slice(0, 12));
}
function openSpan(sink, id) {
  if (sink === null || id === "") return;
  const started = sink.now();
  attempt(() => {
    sink.writer.openMarker(id, started);
  });
}
function closeSpan(sink, id, facts) {
  if (sink === null || id === "") return;
  let start = null;
  try {
    start = sink.writer.closeMarker(id);
  } catch {
    return;
  }
  if (start === null) return;
  writeSpan(sink, facts, clampMs(sink.now() - start), id);
}
function writeSpan(sink, facts, durationMs, spanId) {
  const fields = {
    // run_id and trace_id are both the session, so every span of one session
    // joins without four call sites repeating it. Tokens are DELIBERATELY absent:
    // a hook cannot see a subagent's usage, and the schema emits an unset
    // always-field as null. A zero here would read as "free" to every consumer.
    // A caller that CAN observe usage (the headless runner) passes its own
    // through facts.fields, which is spread after these.
    run_id: sink.session,
    trace_id: sink.session,
    span_kind: facts.kind,
    ...facts.fields ?? {},
    // Named facts last: a fields entry may override the defaults above, but it
    // cannot contradict the four values the signature made the caller state.
    capability_id: facts.capability,
    model_tier: facts.modelTier,
    status: facts.status ?? "OK",
    duration_ms: durationMs
  };
  if (spanId !== null) fields.span_id = spanId;
  const row = sanitize(fields);
  attempt(() => {
    sink.writer.appendSpan(row);
  });
}
function sanitize(fields) {
  const row = {};
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === void 0) continue;
    row[spec.name] = spec.guard === "slug" || spec.guard === "enum" ? hookSlug(String(value)) : value;
  }
  return row;
}
function attempt(write) {
  try {
    write();
  } catch {
  }
}
function orEmpty(value) {
  return typeof value === "string" ? value : "";
}
function utcSeconds(ms) {
  const at = Number.isFinite(ms) && Math.abs(ms) <= 864e13 ? ms : 0;
  return `${new Date(at).toISOString().slice(0, 19)}Z`;
}

// src/hooks/announce-agent-dispatch.ts
var UNNAMED_AGENT = "general-purpose";
var MAX_TYPE_CHARS = 64;
var MAX_DESCRIPTION_CHARS = 160;
var BANNER_UNSAFE = /[\u0000-\u001f\u007f`"()]/g;
function subagentType(env) {
  const input = toolInput(env);
  return firstString(input["subagent_type"], input["agentType"]) ?? UNNAMED_AGENT;
}
function bannerField(value, max) {
  const flattened = value.replace(BANNER_UNSAFE, " ").replace(/\s+/g, " ").trim();
  return flattened.length > max ? `${flattened.slice(0, max)}...` : flattened;
}
function run4(env, ctx) {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const banner = dispatchBanner(
    bannerField(subagentType(env), MAX_TYPE_CHARS),
    bannerField(briefDescription(env), MAX_DESCRIPTION_CHARS)
  );
  try {
    openSpan(telemetrySink(env, ctx, { bypassed }), spanIdFrom(env));
  } catch {
  }
  return context("PreToolUse", banner);
}
function dispatchBanner(type, description) {
  const descPart = description === "" ? "" : `, desc="${description}"`;
  return `[subagent-announce] dispatching agent(type=${type}${descPart}) \u2014 per rules/subagents.md, before any other output for this turn, emit a green diff-fenced line: \`+ [agent] <alias>(<type>) | model: <tier> | mode: AUDIT|IMPLEMENT | scope: <files>\`. One line per agent, its own fenced diff block, blank line above and below. Do not narrate this in prose instead.`;
}
function briefDescription(env) {
  return firstString(toolInput(env)["description"]) ?? "";
}
function toolInput(env) {
  const payload = isRecord(env.raw) ? env.raw : {};
  const input = payload["tool_input"];
  return isRecord(input) ? input : {};
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return null;
}

// src/hooks/announce-agent-return.ts
function run5(env, ctx) {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const type = subagentType(env);
  const banner = returnBanner(bannerField(type, MAX_TYPE_CHARS));
  try {
    const agent = hookSlug(type);
    closeSpan(telemetrySink(env, ctx, { bypassed }), spanIdFrom(env), {
      kind: "agent",
      // `implement`, not a `dispatch` id of its own: dispatching is what the
      // ORCHESTRATOR does, so no capability binds an agent to it. Known
      // imprecision, recorded in rules/observability.md — a consumer grouping
      // agent spans by capability sees them all as `implement` (a
      // security-review dispatch included) and disambiguates on `agent`.
      capability: "implement",
      // The agent's own tier, from the registry, so a design-tier agent is not
      // recorded as build. Absent or unregistered -> build (../registry/agents).
      modelTier: agentModelTier(ctx.root, agent),
      status: responseStatus(env.raw),
      // tokens_in/tokens_out and cost_micros are absent by construction: this
      // hook never sees the subagent's usage. The schema emits the two token
      // fields as null, which is what an unknown is. Prose used to have to warn
      // readers not to take the old zeros for "free"; the data says it now.
      fields: { agent }
    });
  } catch {
  }
  return context("PostToolUse", banner);
}
function responseStatus(raw) {
  const payload = isRecord(raw) ? raw : {};
  const response = payload["tool_response"];
  const flag2 = isRecord(response) ? response["is_error"] : null;
  if (alternative(flag2, payload["is_error"]) === true) return "FAILED";
  if (isRecord(response)) {
    const status = response["status"];
    return typeof status === "string" ? allowlisted(status) : "OK";
  }
  const first = /^(OK|BLOCKED|FAILED|DEGRADED)\b/.exec(typeof response === "string" ? response : "");
  return first === null ? "OK" : allowlisted(first[1]);
}
function returnBanner(type) {
  return `[subagent-announce] agent(type=${type}) returned \u2014 per rules/subagents.md, emit its green diff-fenced return line before continuing: \`+ [agent] <alias> -> done|FAILED | <result summary>\`.`;
}
function alternative(first, second) {
  if (first !== null && first !== void 0 && first !== false) return first;
  if (second !== null && second !== void 0 && second !== false) return second;
  return false;
}
function allowlisted(value) {
  return SPAN_STATUSES.find((status) => status === value) ?? "OK";
}

// src/hot-cli.ts
var io = processIo();
var argv = process.argv.slice(2);
var HOT_HOOKS = {
  "git-write-guard": run,
  "route-before-change": run2,
  "mark-unrecorded": run3,
  "announce-agent-dispatch": run4,
  "announce-agent-return": run5
};
var NOT_HOT = " (not in the per-call bundle; run it through dist/engineos.cjs)";
function isExecutable(path) {
  try {
    (0, import_node_fs18.accessSync)(path, import_node_fs18.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function entryScript() {
  var _a;
  return ((_a = require.main) == null ? void 0 : _a.filename) ?? __filename;
}
function applyOutcome(outcome) {
  switch (outcome.kind) {
    case "proceed":
      return;
    case "reexec": {
      const r = (0, import_node_child_process2.spawnSync)(outcome.bin, [entryScript(), ...argv], { stdio: "inherit", env: { ...process.env, ENGINEOS_REEXEC: "1" } });
      if (r.error === void 0 && r.status !== null) {
        process.exit(r.status);
      }
      applyOutcome(guardOutcome(argv, process.versions.node, null));
      return;
    }
    case "silent":
      process.exit(0);
      break;
    case "skip":
      process.exit(render(message(outcome.message), io));
      break;
    case "refuse":
      writeJson(io, { error: outcome.message });
      process.exit(1);
  }
}
if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env["ENGINEOS_REEXEC"] === "1" ? null : findNewerNode(process.env, import_node_fs18.existsSync, import_node_fs18.readdirSync, isExecutable);
  applyOutcome(guardOutcome(argv, process.versions.node, newer));
}
var table = { hook: runHookWith(HOT_HOOKS, NOT_HOT) };
exitWith(dispatch(table, argv, io), (code) => process.exit(code));
