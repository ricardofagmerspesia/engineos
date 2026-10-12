"use strict";

// adapters/claude-code-mod/host/server.ts
var import_node_fs30 = require("node:fs");
var import_node_http = require("node:http");

// src/hooks/adapter.ts
var import_node_fs4 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path3 = require("node:path");

// src/lib/runtime-dir.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var GROUP_OTHER_BITS = 63;
var PRESENCE_VERSION = 2;
var HOST_SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;
var PRESENCE_HEARTBEAT_MS = 5e3;
var PRESENCE_STALE_MS = 3e4;
var SESSION_KEY_HEX = 16;
var HOOK_NAME = /^[a-z][a-z0-9-]{0,63}$/;
var MAX_SERVED_HOOKS = 64;
var MAX_ROOT_CHARS = 4096;
var MAX_VERSION_CHARS = 64;
function runtimeDir(env, uid, fallback = import_node_os.tmpdir) {
  const base = nonEmpty(env["XDG_RUNTIME_DIR"]) ?? nonEmpty(env["TMPDIR"]) ?? fallback();
  return (0, import_node_path.join)(base, `engineos-${uid}`);
}
function sessionPaths(dir, sessionId) {
  const key = (0, import_node_crypto.createHash)("sha256").update(sessionId).digest("hex").slice(0, SESSION_KEY_HEX);
  return { socket: (0, import_node_path.join)(dir, `h-${key}.sock`), presence: (0, import_node_path.join)(dir, `h-${key}.json`) };
}
function isPrivateDir(facts, uid) {
  return facts !== null && facts.kind === "directory" && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}
function isPrivateFile(facts, uid) {
  return facts !== null && facts.kind === "file" && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}
function lstatFacts(path) {
  const stat = (0, import_node_fs.lstatSync)(path, { throwIfNoEntry: false });
  return stat === void 0 ? null : statFacts(stat);
}
function readPrivateFile(path, maxBytes) {
  let fd;
  try {
    fd = (0, import_node_fs.openSync)(path, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW | import_node_fs.constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const stat = (0, import_node_fs.fstatSync)(fd);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(maxBytes + 1);
    const read = (0, import_node_fs.readSync)(fd, buffer, 0, maxBytes + 1, 0);
    if (read > maxBytes) return null;
    return { facts: statFacts(stat), text: buffer.toString("utf8", 0, read), mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  } finally {
    (0, import_node_fs.closeSync)(fd);
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
var import_node_fs2 = require("node:fs");
var KernelError = class extends Error {
  kind = "kernel";
};
function readJsonFile(path) {
  let text2;
  try {
    text2 = (0, import_node_fs2.readFileSync)(path, "utf8");
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
var import_node_fs3 = require("node:fs");
var import_node_path2 = require("node:path");
function resolveRoot(env, startDir2 = __dirname) {
  const forced = env["ENGINEOS_ROOT"];
  if (forced !== void 0 && forced !== "") return forced;
  let dir = startDir2;
  for (; ; ) {
    if ((0, import_node_fs3.existsSync)((0, import_node_path2.join)(dir, "registries", "routing.json"))) return dir;
    const parent = (0, import_node_path2.dirname)(dir);
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
function readEnvelope(io) {
  let parsed;
  try {
    parsed = JSON.parse(io.readStdin());
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
function hookContext(env, io, spawn = import_node_child_process.spawnSync) {
  void env;
  return {
    io,
    root: resolveRoot(io.env),
    now: Date.now,
    spawn
  };
}

// src/hooks/output.ts
var silent = { kind: "silent" };
function context(event2, text2) {
  return { kind: "context", event: event2, text: text2 };
}
function block(reason) {
  return { kind: "block", reason };
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
function render(decision, io) {
  switch (decision.kind) {
    case "silent":
      return 0;
    case "context":
      io.out(`${JSON.stringify({ hookSpecificOutput: { hookEventName: decision.event, additionalContext: decision.text } })}
`);
      return 0;
    case "block":
      io.out(`${JSON.stringify({ decision: "block", reason: decision.reason })}
`);
      return 0;
    case "ask":
      io.out(
        `${JSON.stringify({
          hookSpecificOutput: { hookEventName: decision.event, permissionDecision: "ask", permissionDecisionReason: decision.reason }
        })}
`
      );
      return 0;
    case "message":
      io.out(`${JSON.stringify({ systemMessage: decision.text })}
`);
      return 0;
    case "fail":
      io.err(`${decision.stderr}
`);
      return 2;
  }
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
  return (argv, io) => {
    const name = argv[0];
    const hook = name === void 0 ? void 0 : hooks[name];
    if (name === void 0 || hook === void 0) {
      return render(fail(`engineos hook: unknown hook: ${name ?? ""}${unknownHint}
`), io);
    }
    const env = readEnvelope(io);
    if (env === null) return render(silent, io);
    if (servedInProcess({ hook: name, envelope: env, env: io.env }, guard)) return render(silent, io);
    try {
      const decision = hook(env, hookContext(env, io));
      if (decision instanceof Promise) {
        return decision.then(
          (settled) => render(settled, io),
          (e) => failed(name, e, io)
        );
      }
      return render(decision, io);
    } catch (e) {
      return failed(name, e, io);
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
function registeringRoot(startDir2) {
  let dir = startDir2;
  for (let depth = 0; depth < MAX_ROOT_DEPTH; depth += 1) {
    if ((0, import_node_fs4.existsSync)((0, import_node_path3.join)(dir, "hooks", "hooks.json"))) return (0, import_node_fs4.realpathSync)(dir);
    const parent = (0, import_node_path3.dirname)(dir);
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
function failed(name, e, io) {
  io.err(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}
`);
  return render(silent, io);
}

// src/hooks/ensure-project-layout.ts
var import_node_fs11 = require("node:fs");
var import_node_path10 = require("node:path");

// src/hooks/bypass.ts
var import_node_fs6 = require("node:fs");
var import_node_os3 = require("node:os");
var import_node_path4 = require("node:path");

// src/lib/git.ts
var import_node_fs5 = require("node:fs");
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
    return (0, import_node_fs5.existsSync)(candidate) ? candidate : null;
  });
}

// src/hooks/bypass.ts
var MARKER = "ENGINEOS_BYPASS";
function bypassFlagPath(env) {
  const configured = env["ENGINEOS_BYPASS_FLAG"];
  if (configured !== void 0 && configured !== "") return configured;
  const home = env["HOME"];
  return (0, import_node_path4.join)(home !== void 0 && home !== "" ? home : (0, import_node_os3.homedir)(), ".claude", "engineos.bypass");
}
function bypassSwitchedOn(env) {
  return env["ENGINEOS_BYPASS"] === "1" || (0, import_node_fs6.existsSync)(bypassFlagPath(env));
}
function bypassMarkedAt(dir) {
  return dir !== null && (0, import_node_fs6.existsSync)(`${dir}/${MARKER}`);
}
function bypassMarker(cwd, spawn) {
  const dir = gitDir(cwd === "" ? process.cwd() : cwd, spawn);
  return dir === null ? null : `${dir}/${MARKER}`;
}
function bypassActive(cwd, env, spawn) {
  if (bypassSwitchedOn(env)) return true;
  return bypassMarkedAt(gitDir(cwd === "" ? process.cwd() : cwd, spawn));
}

// src/hooks/scaffold.ts
var import_node_fs7 = require("node:fs");
var import_node_path5 = require("node:path");

// src/registry/strict.ts
function strictReader(file) {
  function malformed6(what) {
    throw new KernelError(`registries/${file}: ${what}`);
  }
  function requireRecord8(value, path) {
    if (!isRecord(value)) malformed6(`${path || "the document"} must be an object`);
    return value;
  }
  function requireString9(value, path) {
    if (typeof value !== "string") malformed6(`${path} must be a string`);
    return value;
  }
  function requireNumber5(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value)) malformed6(`${path} must be a number`);
    return value;
  }
  function requireBoolean4(value, path) {
    if (typeof value !== "boolean") malformed6(`${path} must be a boolean`);
    return value;
  }
  function requireStrings4(value, path) {
    if (!Array.isArray(value)) malformed6(`${path} must be an array of strings`);
    return value.map((item, i) => requireString9(item, `${path}[${i}]`));
  }
  function requireRows8(value, path) {
    if (!Array.isArray(value)) malformed6(`${path} must be an array of objects`);
    return value.map((item, i) => requireRecord8(item, `${path}[${i}]`));
  }
  function optionalString4(value, path) {
    if (value === void 0 || value === null) return null;
    return requireString9(value, path);
  }
  function optionalStrings2(value, path) {
    if (value === void 0 || value === null) return [];
    return requireStrings4(value, path);
  }
  return {
    malformed: malformed6,
    requireRecord: requireRecord8,
    requireString: requireString9,
    requireNumber: requireNumber5,
    requireBoolean: requireBoolean4,
    requireStrings: requireStrings4,
    requireRows: requireRows8,
    optionalString: optionalString4,
    optionalStrings: optionalStrings2
  };
}

// src/hooks/scaffold.ts
var { requireRecord, requireString, requireRows } = strictReader("layout-manifest.json");
function loadLayoutManifest(engineosRoot) {
  const raw = readJsonFile((0, import_node_path5.join)(engineosRoot, "registries", "layout-manifest.json"));
  const doc = requireRecord(raw, "");
  return requireRows(doc["entries"], ".entries").map((row, i) => ({
    dir: requireString(row["dir"], `.entries[${i}].dir`),
    seeds: requireRows(row["seeds"], `.entries[${i}].seeds`).map((seed, j) => ({
      src: requireString(seed["src"], `.entries[${i}].seeds[${j}].src`),
      dest: requireString(seed["dest"], `.entries[${i}].seeds[${j}].dest`)
    }))
  }));
}
function scaffoldLayout(projectRoot, engineosRoot, manifest) {
  const created = [];
  for (const entry of manifest) {
    const existed = isDirectory((0, import_node_path5.join)(projectRoot, entry.dir));
    const parent = scaffoldDir(projectRoot, entry.dir);
    if (parent === null) continue;
    if (!existed) created.push(entry.dir);
    for (const seed of entry.seeds) {
      const abs = seed.src.startsWith("@") ? (0, import_node_path5.join)(engineosRoot, seed.src.slice(1)) : (0, import_node_path5.join)(engineosRoot, "templates", "project-layout", seed.src);
      scaffoldSeed(parent, seed.dest, abs);
    }
  }
  return created;
}
function physDir(dir) {
  try {
    const real = (0, import_node_fs7.realpathSync)(dir);
    return (0, import_node_fs7.statSync)(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}
function within(rootPhys, phys) {
  return phys === rootPhys || phys.startsWith(`${rootPhys}/`);
}
function scaffoldDir(root, rel) {
  const rootPhys = physDir(root);
  if (rootPhys === null) return null;
  let cur = rootPhys;
  for (const comp of rel.split("/")) {
    if (comp === "" || comp === ".") continue;
    if (comp === "..") return null;
    const next = `${cur}/${comp}`;
    const entry = lstatOrNull(next);
    if (entry === null) {
      try {
        (0, import_node_fs7.mkdirSync)(next);
      } catch {
        return null;
      }
    } else if (entry.isSymbolicLink() || !entry.isDirectory()) {
      return null;
    }
    cur = next;
  }
  const phys = physDir(cur);
  if (phys === null || !within(rootPhys, phys)) return null;
  return phys;
}
function scaffoldSeed(parent, name, src) {
  if (name === "" || name === "." || name === ".." || name.includes("/")) return;
  if (!isFile(src)) return;
  if (lstatOrNull(`${parent}/${name}`) !== null) return;
  try {
    (0, import_node_fs7.copyFileSync)(src, `${parent}/${name}`);
  } catch {
  }
}
function lstatOrNull(path) {
  try {
    return (0, import_node_fs7.lstatSync)(path);
  } catch {
    return null;
  }
}
function isDirectory(path) {
  try {
    return (0, import_node_fs7.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile(path) {
  try {
    return (0, import_node_fs7.statSync)(path).isFile();
  } catch {
    return false;
  }
}

// src/hooks/stack-question.ts
var import_node_os4 = require("node:os");
var import_node_path7 = require("node:path");

// src/kernel/stack.ts
var import_node_fs8 = require("node:fs");
var import_node_path6 = require("node:path");
var defaultDeps = {
  exists: import_node_fs8.existsSync,
  readFile: (path) => (0, import_node_fs8.readFileSync)(path, "utf8"),
  listDir: (path) => (0, import_node_fs8.readdirSync)(path, { withFileTypes: true })
};
var SKIPPED_DIRS = [
  "node_modules",
  ".venv",
  ".git",
  "dist",
  "build",
  "__pycache__",
  "site-packages",
  ".next"
];
var PYTHON_MARKERS = ["pyproject.toml", "requirements.txt"];
var NODE_MARKER = "package.json";
var NODE_FRAMEWORKS = [
  ["@nestjs/core", "nestjs"],
  ["next", "next"],
  ["react-native", "react-native"],
  ["react", "react"]
];
function resolveStack(root, config, deps = defaultDeps) {
  if (config !== null) return { packages: config.stack.packages, source: "config" };
  return { packages: detectPackages(root, deps), source: "detected" };
}
function detectPackages(root, deps = defaultDeps) {
  const found = [];
  walk(root, ".", deps, found);
  return found;
}
function walk(root, rel, deps, found) {
  const abs = rel === "." ? root : (0, import_node_path6.join)(root, rel);
  found.push(...packagesIn(abs, rel, deps));
  let entries;
  try {
    entries = deps.listDir(abs);
  } catch {
    return;
  }
  const children = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_DIRS.includes(entry.name)).map((entry) => entry.name).sort();
  for (const name of children) walk(root, rel === "." ? name : `${rel}/${name}`, deps, found);
}
function packagesIn(abs, dir, deps) {
  const out = [];
  const packageJson = (0, import_node_path6.join)(abs, NODE_MARKER);
  if (deps.exists(packageJson)) {
    out.push({ dir, language: "node", framework: nodeFramework(packageJson, deps), compose_service: null });
  }
  return out;
}
function nodeFramework(packageJson, deps) {
  const text2 = readOrNull(packageJson, deps);
  if (text2 === null) return null;
  return firstFramework(new Set(packageJsonDependencies(text2)), NODE_FRAMEWORKS);
}
function packageJsonDependencies(text2) {
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  const doc = parsed;
  const names = [];
  for (const field of ["dependencies", "devDependencies"]) {
    const block2 = doc[field];
    if (typeof block2 === "object" && block2 !== null && !Array.isArray(block2)) names.push(...Object.keys(block2));
  }
  return names;
}
function firstFramework(names, table) {
  for (const [dependency, framework] of table) if (names.has(dependency)) return framework;
  return null;
}
function readOrNull(path, deps) {
  if (!deps.exists(path)) return null;
  try {
    return deps.readFile(path);
  } catch {
    return null;
  }
}
var STACK_MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "pubspec.yaml",
  "mix.exs",
  "deno.json"
];
var STACK_MANIFEST_SUFFIXES = [".csproj", ".sln"];
var STACK_SIGNAL_MAX_DEPTH = 3;
var PROJECT_CONFIG = (0, import_node_path6.join)(".engineos", "config.json");
function hasStackSignal(root, deps = defaultDeps) {
  if (existsOrFalse((0, import_node_path6.join)(root, PROJECT_CONFIG), deps)) return true;
  return signalWithin(root, 0, deps);
}
function signalWithin(dir, depth, deps) {
  let entries;
  try {
    entries = deps.listDir(dir);
  } catch {
    return false;
  }
  const children = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      if (isStackManifest(entry.name)) return true;
      continue;
    }
    if (!entry.name.startsWith(".") && !SKIPPED_DIRS.includes(entry.name)) children.push(entry.name);
  }
  if (depth >= STACK_SIGNAL_MAX_DEPTH) return false;
  return children.some((name) => signalWithin((0, import_node_path6.join)(dir, name), depth + 1, deps));
}
function isStackManifest(name) {
  return STACK_MANIFESTS.includes(name) || STACK_MANIFEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
function existsOrFalse(path, deps) {
  try {
    return deps.exists(path);
  } catch {
    return false;
  }
}
function packageLabel(pkg) {
  const label2 = `${pkg.framework ?? pkg.language}@${pkg.dir}`;
  return pkg.language === "python" ? `${label2} (deprecated, unsupported)` : label2;
}
function languagesOf(packages) {
  const out = [];
  for (const pkg of packages) if (!out.includes(pkg.language)) out.push(pkg.language);
  return out;
}

// src/hooks/stack-question.ts
var STACK_QUESTION_NOTE = '[engineos] no stack declared \u2014 this repo has no .engineos/config.json and no package manifest. Before writing any code, state the mandatory NestJS application backend policy within the JavaScript/TypeScript ecosystem. Application backends (including API, worker and LLM service hosts) require NestJS; Node.js is the runtime and tooling environment, not a backend framework choice. Ask only about unresolved backend scope/package paths, frontend/mobile choices (Next.js, React, React Native), and LLM provider/model or storage requirements. LLM applications and chatbots use Mastra inside NestJS providers; do not ask the developer to reconfirm NestJS or Mastra. never offer plain Node.js or standalone Express application backends (rules/base.md "New projects \u2014 stack first"). Persist the answer with `engineos init --stack <framework>[@dir],...` and record it as the project\'s first ADR.';
var STACK_DEPENDENT_INTENTS = [
  "new-feature",
  "backend",
  "frontend",
  "mobile",
  "llm",
  "agent-system"
];
function needsStackQuestion(cwd, root, opts = {}) {
  if (cwd === "" || root === "") return false;
  const home = opts.home ?? (0, import_node_os4.homedir)();
  if (samePath(cwd, home) || samePath(root, home)) return false;
  return !hasStackSignal(root, opts.deps);
}
function promptNeedsStackQuestion(intents, cwd, spawn, opts = {}) {
  if (cwd === "" || !intents.some((intent) => STACK_DEPENDENT_INTENTS.includes(intent))) return false;
  return needsStackQuestion(cwd, repoRoot(cwd, spawn) ?? cwd, opts);
}
function samePath(a, b) {
  return (0, import_node_path7.resolve)(a) === (0, import_node_path7.resolve)(b);
}

// src/registry/load.ts
var import_node_fs9 = require("node:fs");
var import_node_path8 = require("node:path");
function registryPath(root, name) {
  const p = (0, import_node_path8.join)(root, "registries", name);
  if (!(0, import_node_fs9.existsSync)(p)) throw new KernelError(`registry missing: registries/${name}`);
  return p;
}
function loadRegistry(root, name) {
  return readJsonFile(registryPath(root, name));
}

// src/registry/policy-telemetry.ts
var reader = strictReader("policy.json");
function loadTelemetryPolicy(root) {
  const document = reader.requireRecord(loadRegistry(root, "policy.json"), "");
  const telemetry = reader.requireRecord(document["telemetry"], ".telemetry");
  return {
    home: reader.requireString(telemetry["home"], ".telemetry.home"),
    retention_days: reader.requireNumber(telemetry["retention_days"], ".telemetry.retention_days"),
    value_pattern: reader.requireString(telemetry["value_pattern"], ".telemetry.value_pattern"),
    events: reader.requireRows(telemetry["events"], ".telemetry.events").map((row, i) => ({
      id: reader.requireString(row["id"], `.telemetry.events[${i}].id`),
      keys: reader.requireStrings(row["keys"], `.telemetry.events[${i}].keys`)
    }))
  };
}

// src/registry/project-config.ts
var import_node_fs10 = require("node:fs");
var import_node_path9 = require("node:path");
var PROJECT_CONFIG_PATH = ".engineos/config.json";
var LANGUAGES = ["python", "node"];
var FRAMEWORKS = [
  "fastapi",
  "django",
  "flask",
  "nestjs",
  "react",
  "next",
  "react-native"
];
var PYTHON_ENVS = ["venv", "uv", "compose", "auto"];
var FRAMEWORK_LANGUAGE = {
  fastapi: "python",
  django: "python",
  flask: "python",
  nestjs: "node",
  react: "node",
  next: "node",
  "react-native": "node"
};
function isLanguage(value) {
  return typeof value === "string" && LANGUAGES.includes(value);
}
function isFramework(value) {
  return typeof value === "string" && FRAMEWORKS.includes(value);
}
function isPythonEnv(value) {
  return typeof value === "string" && PYTHON_ENVS.includes(value);
}
function normalizeDir(dir) {
  let out = dir.trim();
  while (out.startsWith("./")) out = out.slice(2);
  while (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out === "" || out === "." ? "." : out;
}
var readUtf8 = (path) => (0, import_node_fs10.readFileSync)(path, "utf8");
function loadProjectConfig(root, readFile = readUtf8) {
  const path = (0, import_node_path9.join)(root, PROJECT_CONFIG_PATH);
  let text2;
  try {
    text2 = readFile(path);
  } catch (e) {
    if (isAbsent(e)) return null;
    throw new KernelError(`cannot read ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
  return parseProjectConfig(parsed, path);
}
function parseProjectConfig(parsed, path = PROJECT_CONFIG_PATH) {
  const document = requireRecord2(path, parsed, "");
  rejectUnknownKeys(path, document, "", ["version", "stack"]);
  if (document["version"] !== 1) malformed(path, ".version must be 1");
  const stack = requireRecord2(path, document["stack"], ".stack");
  rejectUnknownKeys(path, stack, ".stack", ["packages"]);
  const rows = stack["packages"];
  if (!Array.isArray(rows)) malformed(path, ".stack.packages must be an array of objects");
  const seen = /* @__PURE__ */ new Set();
  const packages = rows.map((item, i) => {
    const at = `.stack.packages[${i}]`;
    const row = requireRecord2(path, item, at);
    rejectUnknownKeys(path, row, at, ["dir", "language", "framework", "compose_service", "python_env"]);
    const rawDir = requireString2(path, row["dir"], `${at}.dir`);
    if (rawDir.startsWith("/")) malformed(path, `${at}.dir must be relative to the repo root`);
    const dir = normalizeDir(rawDir);
    if (dir.split("/").includes("..")) malformed(path, `${at}.dir must not leave the repo root`);
    if (seen.has(dir)) malformed(path, `${at}.dir "${dir}" is declared twice`);
    seen.add(dir);
    const language = row["language"];
    if (!isLanguage(language)) malformed(path, `${at}.language must be one of ${LANGUAGES.join("|")}`);
    const framework = row["framework"];
    if (framework !== null && !isFramework(framework)) {
      malformed(path, `${at}.framework must be null or one of ${FRAMEWORKS.join("|")}`);
    }
    if (framework !== null && FRAMEWORK_LANGUAGE[framework] !== language) {
      malformed(path, `${at}.framework "${framework}" is a ${FRAMEWORK_LANGUAGE[framework]} framework, not ${language}`);
    }
    const composeService = row["compose_service"];
    if (composeService !== null && typeof composeService !== "string") {
      malformed(path, `${at}.compose_service must be a string or null`);
    }
    const env = row["python_env"];
    if (env !== void 0 && !isPythonEnv(env)) {
      malformed(path, `${at}.python_env must be one of ${PYTHON_ENVS.join("|")}`);
    }
    const pkg = { dir, language, framework, compose_service: composeService };
    if (language === "python") pkg.python_env = env ?? "auto";
    return pkg;
  });
  return { version: 1, stack: { packages } };
}
function malformed(path, what) {
  throw new KernelError(`${path}: ${what}`);
}
function requireRecord2(path, value, at) {
  if (!isRecord(value)) malformed(path, `${at || "the document"} must be an object`);
  return value;
}
function requireString2(path, value, at) {
  if (typeof value !== "string") malformed(path, `${at} must be a string`);
  return value;
}
function rejectUnknownKeys(path, row, at, known) {
  for (const key of Object.keys(row)) {
    if (!known.includes(key)) malformed(path, `${at || "the document"} has an unknown key "${key}"`);
  }
}
function isAbsent(e) {
  return isRecord(e) && e["code"] === "ENOENT";
}

// src/hooks/ensure-project-layout.ts
var DAY_MS = 864e5;
var UNRECORDED_PREFIX = "ENGINEOS_UNRECORDED.";
var UNRECORDED_MAX_AGE_DAYS = 7;
var ROUTE_CACHE = "engineos-route-cache";
var TELEMETRY = "engineos-telemetry";
var SPANS = "spans";
var OPT_IN_HINT = "[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1";
function run(env, ctx) {
  if (env.cwd === "") return silent;
  const marker = bypassMarker(env.cwd, ctx.spawn);
  if (marker !== null) removeFile(marker);
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null) {
    if (ctx.io.env["ENGINEOS_SCAFFOLD"] === "0") return silent;
    return needsStackQuestion(env.cwd, env.cwd) ? context("SessionStart", STACK_QUESTION_NOTE) : silent;
  }
  const git = gitDir(env.cwd, ctx.spawn);
  if (git !== null && isDirectory2(git)) {
    const now = ctx.now();
    reapUnrecordedFlags(git, now);
    wipeTree((0, import_node_path10.join)(git, ROUTE_CACHE));
    reapTelemetry(git, ctx, now);
  }
  if (isFile2((0, import_node_path10.join)(project, "hooks", "layout-manifest.sh")) && isFile2((0, import_node_path10.join)(project, "install.sh"))) return silent;
  const needsStack = needsStackQuestion(env.cwd, project);
  const optIn = ctx.io.env["ENGINEOS_SCAFFOLD"];
  if (optIn === "0") return silent;
  if (optIn !== "1" && !isDirectory2((0, import_node_path10.join)(project, ".engineos"))) {
    return context("SessionStart", needsStack ? `${OPT_IN_HINT}
${STACK_QUESTION_NOTE}` : OPT_IN_HINT);
  }
  const lines = [];
  try {
    const created = scaffoldLayout(project, ctx.root, loadLayoutManifest(ctx.root));
    if (created.length > 0) lines.push(`[engineos] scaffolded standard layout: ${created.join(", ")} (review seeded READMEs)`);
  } catch {
    return silent;
  }
  const stack = stackLine(project);
  if (stack !== null) lines.push(stack);
  if (needsStack) lines.push(STACK_QUESTION_NOTE);
  if (lines.length === 0) return silent;
  return context("SessionStart", lines.join("\n"));
}
var RUNNERS = {
  python: "python: ruff/pyright/pytest",
  node: "node: lint/typecheck scripts"
};
function stackLine(project) {
  let packages;
  try {
    packages = resolveStack(project, loadProjectConfig(project)).packages;
  } catch (e) {
    return e instanceof KernelError ? `[engineos] stack: ${e.message}` : null;
  }
  if (packages.length === 0) return null;
  const labels = packages.map(packageLabel);
  const runners = languagesOf(packages).map((language) => RUNNERS[language]);
  return `[engineos] stack: ${labels.join(" \xB7 ")} \xB7 runners: ${runners.join(", ")}`;
}
function reapUnrecordedFlags(git, now) {
  for (const name of readDirNames(git)) {
    if (!name.startsWith(UNRECORDED_PREFIX)) continue;
    reapIfStale((0, import_node_path10.join)(git, name), UNRECORDED_MAX_AGE_DAYS, now);
  }
}
function reapTelemetry(git, ctx, now) {
  const dir = (0, import_node_path10.join)(git, TELEMETRY);
  if (!isDirectory2(dir)) return;
  let days;
  try {
    days = loadTelemetryPolicy(ctx.root).retention_days;
  } catch {
    return;
  }
  if (!Number.isInteger(days) || days < 0) return;
  for (const name of readDirNames(dir)) {
    if (name.endsWith(".jsonl")) reapIfStale((0, import_node_path10.join)(dir, name), days, now);
  }
  const spans = (0, import_node_path10.join)(dir, SPANS);
  if (isDirectory2(spans)) reapFilesBelow(spans, days, now);
}
function reapFilesBelow(dir, days, now) {
  for (const entry of readDirEntries(dir)) {
    const path = (0, import_node_path10.join)(dir, entry.name);
    if (entry.isDirectory()) reapFilesBelow(path, days, now);
    else if (entry.isFile()) reapIfStale(path, days, now);
  }
}
function reapIfStale(path, days, now) {
  const stat = lstatOrNull2(path);
  if (stat === null || !stat.isFile()) return;
  if (Math.floor((now - stat.mtimeMs) / DAY_MS) > days) removeFile(path);
}
function wipeTree(dir) {
  if (!isDirectory2(dir)) return;
  try {
    (0, import_node_fs11.rmSync)(dir, { recursive: true, force: true });
  } catch {
  }
}
function removeFile(path) {
  try {
    (0, import_node_fs11.unlinkSync)(path);
  } catch {
  }
}
function readDirNames(dir) {
  try {
    return (0, import_node_fs11.readdirSync)(dir);
  } catch {
    return [];
  }
}
function readDirEntries(dir) {
  try {
    return (0, import_node_fs11.readdirSync)(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function lstatOrNull2(path) {
  try {
    return (0, import_node_fs11.lstatSync)(path);
  } catch {
    return null;
  }
}
function isDirectory2(path) {
  try {
    return (0, import_node_fs11.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile2(path) {
  try {
    return (0, import_node_fs11.statSync)(path).isFile();
  } catch {
    return false;
  }
}

// src/hooks/mark-unrecorded.ts
var import_node_fs13 = require("node:fs");

// src/hooks/edit-context.ts
var import_node_fs12 = require("node:fs");
var import_node_path11 = require("node:path");

// src/registry/routing.ts
var reader2 = strictReader("routing.json");
function loadRouting(root) {
  const document = reader2.requireRecord(loadRegistry(root, "routing.json"), "");
  const excluded = reader2.requireRecord(document["excluded"], ".excluded");
  const precedence = reader2.requireStrings(document["precedence"], ".precedence");
  if (precedence.length === 0) reader2.malformed(".precedence must not be empty");
  const domains = reader2.requireRows(document["domains"], ".domains");
  if (domains.length === 0) reader2.malformed(".domains must not be empty");
  return {
    version: reader2.requireString(document["version"], ".version"),
    precedence,
    excluded: {
      paths: reader2.optionalStrings(excluded["paths"], ".excluded.paths"),
      basenames: reader2.optionalStrings(excluded["basenames"], ".excluded.basenames"),
      self_dirs: reader2.optionalStrings(excluded["self_dirs"], ".excluded.self_dirs")
    },
    domains: domains.map((row, i) => {
      const path = `.domains[${i}]`;
      const match = reader2.requireRecord(row["match"], `${path}.match`);
      const id = reader2.requireString(row["id"], `${path}.id`);
      if (id === "") reader2.malformed(`${path}.id must not be empty`);
      return {
        id,
        match: {
          paths: reader2.optionalStrings(match["paths"], `${path}.match.paths`),
          basenames: reader2.optionalStrings(match["basenames"], `${path}.match.basenames`)
        },
        rules: reader2.optionalStrings(row["rules"], `${path}.rules`),
        skills: reader2.optionalStrings(row["skills"], `${path}.skills`),
        agent: reader2.optionalString(row["agent"], `${path}.agent`),
        hint: reader2.optionalString(row["hint"], `${path}.hint`),
        sample_path: reader2.optionalString(row["sample_path"], `${path}.sample_path`)
      };
    })
  };
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
    const stats = (0, import_node_fs12.statSync)((0, import_node_path11.join)(root, "registries", "routing.json"));
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
    parsed = JSON.parse((0, import_node_fs12.readFileSync)(path, "utf8"));
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
    if (cut > 0) (0, import_node_fs12.mkdirSync)(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    (0, import_node_fs12.writeFileSync)(tmp, contents);
    (0, import_node_fs12.renameSync)(tmp, path);
  } catch {
  }
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
function run2(env, ctx) {
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

// src/hooks/record-verify.ts
var import_node_fs14 = require("node:fs");
var DEFERRED_SUFFIX = ".deferred";
function recordGateReason(deferMarker) {
  return `EngineOS gate: code changed but the change was not recorded. Run the record-change skill \u2014 mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag. To defer recording for this session instead, create the marker: touch "${deferMarker}"`;
}
function run3(env, ctx) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.stopHookActive) return silent;
  if (env.cwd === "") return silent;
  const dir = gitDir(env.cwd, ctx.spawn);
  if (dir === null) return silent;
  const sid = hookPathSlug(env.sessionId);
  if (sid === null) return silent;
  const marker = `${dir}/${UNRECORDED_MARKER_PREFIX}${sid}`;
  if (!(0, import_node_fs14.existsSync)(marker)) return silent;
  const deferred = `${marker}${DEFERRED_SUFFIX}`;
  if ((0, import_node_fs14.existsSync)(deferred)) return silent;
  return block(recordGateReason(deferred));
}

// src/hooks/route-before-change.ts
var import_node_fs16 = require("node:fs");
var import_node_path13 = require("node:path");

// src/registry/models.ts
var MODEL_TIER_IDS = ["most-capable", "design", "build", "cheap"];
function loadModels(root) {
  const raw = loadRegistry(root, "models.json");
  const r = isRecord(raw) ? raw : {};
  return {
    version: requireString3(r["version"], "version"),
    tiers: requireRows2(r["tiers"], "tiers").map((tier, index) => ({
      id: requireString3(tier["id"], `tiers[${index}].id`),
      model: requireString3(tier["model"], `tiers[${index}].model`),
      // The top of the ladder stores null; an absent key reads the same way,
      // because that is what jq's `.escalates_to` answered for both.
      escalates_to: optionalString(tier["escalates_to"], `tiers[${index}].escalates_to`)
    })),
    escalation_order: requireStringArray(r["escalation_order"], "escalation_order"),
    work_types: requireRows2(r["work_types"], "work_types").map((work, index) => ({
      id: requireString3(work["id"], `work_types[${index}].id`),
      title: requireString3(work["title"], `work_types[${index}].title`),
      tier: requireString3(work["tier"], `work_types[${index}].tier`)
    }))
  };
}
function fail2(field, expected) {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}
function requireString3(value, field) {
  if (typeof value !== "string" || value === "") fail2(field, "a non-empty string");
  return value;
}
function optionalString(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string" || value === "") fail2(field, "a non-empty string or null");
  return value;
}
function requireRows2(value, field) {
  const rows = Array.isArray(value) ? value : fail2(field, "an array");
  return rows.map((row, index) => isRecord(row) ? row : fail2(`${field}[${index}]`, "an object"));
}
function requireStringArray(value, field) {
  const items = Array.isArray(value) ? value : fail2(field, "an array");
  return items.map((item, index) => requireString3(item, `${field}[${index}]`));
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

// src/registry/capabilities.ts
var reader3 = strictReader("capabilities.json");
function loadCapabilities(root) {
  const document = reader3.requireRecord(loadRegistry(root, "capabilities.json"), "");
  return {
    version: reader3.requireString(document["version"], ".version"),
    model_tiers: reader3.requireStrings(document["model_tiers"], ".model_tiers"),
    // Every field of a row is load-bearing: a capability without its agent or
    // its tier cannot answer the question the registry exists to answer, so the
    // loader refuses the row rather than defaulting it (as models.ts does).
    capabilities: reader3.requireRows(document["capabilities"], ".capabilities").map((row, i) => ({
      id: reader3.requireString(row["id"], `.capabilities[${i}].id`),
      title: reader3.requireString(row["title"], `.capabilities[${i}].title`),
      agent: reader3.requireString(row["agent"], `.capabilities[${i}].agent`),
      model_tier: reader3.requireString(row["model_tier"], `.capabilities[${i}].model_tier`),
      risk_floor: reader3.requireString(row["risk_floor"], `.capabilities[${i}].risk_floor`)
    }))
  };
}

// src/registry/decision-rules.ts
var { malformed: malformed2, requireRecord: requireRecord3, requireString: requireString4, requireNumber, requireStrings, requireRows: requireRows3, optionalString: optionalString2, optionalStrings } = strictReader("decision-rules.json");
var JUDGE_FACT = /^[a-z][a-z0-9_]*$/;
function loadDecisionRules(root) {
  const raw = loadRegistry(root, "decision-rules.json");
  const d = requireRecord3(raw, "");
  return {
    version: requireString4(d["version"], ".version"),
    precedence: requireStrings(d["precedence"], ".precedence"),
    conflict_policy: requireString4(d["conflict_policy"], ".conflict_policy"),
    rules: requireRows3(d["rules"], ".rules").map((row, i) => {
      const at = `.rules[${i}]`;
      const then = requireRecord3(row["then"], `${at}.then`);
      return {
        id: requireString4(row["id"], `${at}.id`),
        priority: requireNumber(row["priority"], `${at}.priority`),
        source: requireString4(row["source"], `${at}.source`),
        when: requireRecord3(row["when"], `${at}.when`),
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
  if (fact !== null && !JUDGE_FACT.test(fact)) malformed2(`${at}.judge_fact must be a lower-case identifier`);
  const threshold = row["judge_threshold"];
  if (threshold === void 0 || threshold === null) return { judge_fact: fact, judge_threshold: null };
  if (fact === null) malformed2(`${at}.judge_threshold requires a judge_fact`);
  const cut = requireNumber(threshold, `${at}.judge_threshold`);
  if (cut <= 0 || cut > 1) malformed2(`${at}.judge_threshold must be greater than 0 and at most 1`);
  return { judge_fact: fact, judge_threshold: cut };
}

// src/registry/intents.ts
function isRiskTier(value) {
  return value === "low" || value === "medium" || value === "high";
}
var reader4 = strictReader("intents.json");
function loadIntents(root) {
  return parseIntents(loadRegistry(root, "intents.json"));
}
function parseIntents(raw) {
  const document = reader4.requireRecord(raw, "");
  const rows = reader4.requireRows(document["intents"], ".intents");
  if (rows.length === 0) reader4.malformed(".intents must not be empty");
  return {
    version: reader4.requireString(document["version"], ".version"),
    intents: rows.map((row, i) => parseRow(row, `.intents[${i}]`))
  };
}
function parseRow(row, path) {
  const id = reader4.requireString(row["id"], `${path}.id`);
  if (id === "") reader4.malformed(`${path}.id must not be empty`);
  const declared4 = phraseList(row["phrases"], `${path}.phrases`);
  const hasPhrases = declared4.length > 0;
  const signals = hasPhrases ? reader4.optionalStrings(row["signals"], `${path}.signals`) : reader4.requireStrings(row["signals"], `${path}.signals`);
  if (signals.length === 0 && !hasPhrases && !(row["enabled"] === false && row["deprecated"] === true)) reader4.malformed(`${path}.signals must not be empty`);
  return {
    id,
    title: reader4.requireString(row["title"], `${path}.title`),
    signals,
    rules: reader4.optionalStrings(row["rules"], `${path}.rules`),
    skills: reader4.optionalStrings(row["skills"], `${path}.skills`),
    agents: reader4.optionalStrings(row["agents"], `${path}.agents`),
    commands: reader4.optionalStrings(row["commands"], `${path}.commands`),
    mcp: reader4.optionalStrings(row["mcp"], `${path}.mcp`),
    model_tier: reader4.optionalString(row["model_tier"], `${path}.model_tier`),
    risk_floor: riskFloor(row["risk_floor"], `${path}.risk_floor`),
    domain: reader4.optionalString(row["domain"], `${path}.domain`),
    // jq's `{note}` answers null for a row without one, so an absent note and
    // a null note are the same answer downstream.
    note: reader4.optionalString(row["note"], `${path}.note`),
    suppressible: flag(row["suppressible"], `${path}.suppressible`),
    suppressed_by: reader4.optionalStrings(row["suppressed_by"], `${path}.suppressed_by`),
    requires_dispatch_plan: flag(row["requires_dispatch_plan"], `${path}.requires_dispatch_plan`),
    active: row["enabled"] === void 0 || row["enabled"] === null || reader4.requireBoolean(row["enabled"], `${path}.enabled`),
    phrases: hasPhrases ? declared4 : signals.map((text2) => ({ text: text2, weight: 1 })),
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
  return reader4.requireRows(value, path).map((item, i) => ({
    text: nonBlank(item["text"], `${path}[${i}].text`),
    weight: positiveWeight(item["weight"], `${path}[${i}].weight`)
  }));
}
function verbObject(value, path) {
  if (value === void 0 || value === null) return null;
  const row = reader4.requireRecord(value, path);
  return {
    verbs: nonBlankStrings(row["verbs"], `${path}.verbs`, true),
    objects: nonBlankStrings(row["objects"], `${path}.objects`, true),
    weight: positiveWeight(row["weight"], `${path}.weight`)
  };
}
function routerRow(value, path) {
  if (value === void 0 || value === null) return null;
  const row = reader4.requireRecord(value, path);
  return { intent: nonBlank(row["intent"], `${path}.intent`), load: nonBlank(row["load"], `${path}.load`) };
}
function nonBlank(value, path) {
  const text2 = reader4.requireString(value, path);
  if (text2.trim() === "") reader4.malformed(`${path} must not be empty`);
  return text2;
}
function nonBlankStrings(value, path, required) {
  if (!required && (value === void 0 || value === null)) return [];
  const items = reader4.requireStrings(value, path).map((text2, i) => nonBlank(text2, `${path}[${i}]`));
  if (required && items.length === 0) reader4.malformed(`${path} must not be empty`);
  return items;
}
function positiveWeight(value, path) {
  const weight = reader4.requireNumber(value, path);
  if (weight <= 0) reader4.malformed(`${path} must be greater than 0`);
  return weight;
}
function judgeCut(value, path) {
  if (value === void 0 || value === null) return null;
  const number = reader4.requireNumber(value, path);
  if (number <= 0 || number > 1) reader4.malformed(`${path} must be greater than 0 and at most 1`);
  return number;
}
function riskFloor(value, path) {
  if (value === void 0 || value === null) return null;
  if (isRiskTier(value)) return value;
  return reader4.malformed(`${path} must be low, medium or high`);
}
function flag(value, path) {
  if (value === void 0 || value === null) return false;
  return reader4.requireBoolean(value, path);
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
var { malformed: malformed3, requireRecord: requireRecord4, requireString: requireString5, requireNumber: requireNumber2, requireRows: requireRows4 } = strictReader("policy.json");
function parseJudge(value, breakerScopes) {
  const at = ".judge";
  const judge2 = requireRecord4(value, at);
  const retries = requireNumber2(judge2["retries"], `${at}.retries`);
  if (retries !== 0) malformed3(`${at}.retries must be 0`);
  return {
    enabled_env: pinned(judge2["enabled_env"], `${at}.enabled_env`, JUDGE_ENABLED_ENV),
    enabled_value: pinned(judge2["enabled_value"], `${at}.enabled_value`, JUDGE_ENABLED_VALUE),
    provider: nonBlank2(judge2["provider"], `${at}.provider`),
    endpoint: httpsEndpoint(judge2["endpoint"], `${at}.endpoint`),
    model: nonBlank2(judge2["model"], `${at}.model`),
    timeout_ms: positiveInteger(judge2["timeout_ms"], `${at}.timeout_ms`),
    retries,
    key_env: pinned(judge2["key_env"], `${at}.key_env`, JUDGE_KEY_ENV),
    mode: judgeMode(judge2["mode"], `${at}.mode`),
    max_state_bytes: stateCap(judge2["max_state_bytes"], `${at}.max_state_bytes`),
    thresholds: parseThresholds(judge2["thresholds"], `${at}.thresholds`),
    redaction: { patterns: parsePatterns(judge2["redaction"], `${at}.redaction`) },
    breaker: parseBreaker(judge2["breaker"], `${at}.breaker`, breakerScopes)
  };
}
function parseThresholds(value, at) {
  const thresholds = requireRecord4(value, at);
  return {
    intent_default: aboveZero(thresholds["intent_default"], `${at}.intent_default`),
    primary_confidence: unitInterval(thresholds["primary_confidence"], `${at}.primary_confidence`),
    margin: unitInterval(thresholds["margin"], `${at}.margin`),
    rule_default: aboveZero(thresholds["rule_default"], `${at}.rule_default`)
  };
}
function parsePatterns(value, at) {
  const redaction = requireRecord4(value, at);
  const raw = redaction["patterns"];
  const rows = requireRows4(raw, `${at}.patterns`);
  if (rows.length === 0) malformed3(`${at}.patterns must not be empty`);
  const patterns = rows.map((row, i) => {
    const kind = requireString5(row["kind"], `${at}.patterns[${i}].kind`);
    if (!KIND.test(kind)) malformed3(`${at}.patterns[${i}].kind must be a lower-case slug`);
    const pattern = nonBlank2(row["pattern"], `${at}.patterns[${i}].pattern`);
    if (!compiles(pattern)) malformed3(`${at}.patterns[${i}].pattern does not compile as a regular expression`);
    const shape = patternShape(pattern);
    if (shape !== "linear") malformed3(`${at}.patterns[${i}].pattern is not linear-time (${shape})`);
    return { kind, pattern };
  });
  const digest = (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify(raw)).digest("hex");
  if (digest !== REDACTION_PATTERNS_SHA256) malformed3(`${at}.patterns differ from the list pinned in code`);
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
  const breaker = requireRecord4(value, at);
  const scope = requireString5(breaker["scope"], `${at}.scope`);
  if (!scopes.includes(scope)) malformed3(`${at}.scope must be one of .breaker.scopes`);
  const stateFile = requireString5(breaker["state_file"], `${at}.state_file`);
  if (!STATE_FILE.test(stateFile)) malformed3(`${at}.state_file must be a bare file name`);
  return { scope, state_file: stateFile, cooldown_ms: positiveInteger(breaker["cooldown_ms"], `${at}.cooldown_ms`) };
}
function judgeMode(value, path) {
  const mode = requireString5(value, path);
  const known = JUDGE_MODES.find((candidate) => candidate === mode);
  return known ?? malformed3(`${path} must be shadow, advisory or authoritative`);
}
function pinned(value, path, expected) {
  const text2 = requireString5(value, path);
  if (text2 !== expected) malformed3(`${path} must be ${expected}`);
  return text2;
}
function stateCap(value, path) {
  const bytes = positiveInteger(value, path);
  if (bytes > MAX_STATE_BYTES_CAP) malformed3(`${path} must be at most ${MAX_STATE_BYTES_CAP}`);
  return bytes;
}
function httpsEndpoint(value, path) {
  const endpoint = requireString5(value, path);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return malformed3(`${path} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:") malformed3(`${path} must use https`);
  if (parsed.username !== "" || parsed.password !== "") malformed3(`${path} must not carry credentials`);
  if (parsed.origin !== JUDGE_ENDPOINT_ORIGIN) malformed3(`${path} must be on ${JUDGE_ENDPOINT_ORIGIN}`);
  return endpoint;
}
function nonBlank2(value, path) {
  const text2 = requireString5(value, path);
  if (text2.trim() === "") malformed3(`${path} must not be empty`);
  return text2;
}
function positiveInteger(value, path) {
  const number = requireNumber2(value, path);
  if (!Number.isInteger(number) || number < 1) malformed3(`${path} must be a positive integer`);
  return number;
}
function aboveZero(value, path) {
  const number = requireNumber2(value, path);
  if (number <= 0 || number > 1) malformed3(`${path} must be greater than 0 and at most 1`);
  return number;
}
function unitInterval(value, path) {
  const number = requireNumber2(value, path);
  if (number < 0 || number > 1) malformed3(`${path} must be between 0 and 1`);
  return number;
}

// src/registry/policy-router.ts
var { malformed: malformed4, requireRecord: requireRecord5, requireString: requireString6, requireNumber: requireNumber3, requireBoolean, requireStrings: requireStrings2, requireRows: requireRows5 } = strictReader("policy.json");
function parseRouter(value) {
  const router = requireRecord5(value, ".router");
  const escalateWhen = requireRecord5(router["escalate_when"], ".router.escalate_when");
  return {
    agent: requireString6(router["agent"], ".router.agent"),
    capability: requireString6(router["capability"], ".router.capability"),
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
    fixtures: requireRows5(router["fixtures"], ".router.fixtures").map((row, i) => ({
      prompt: requireString6(row["prompt"], `.router.fixtures[${i}].prompt`),
      escalate: requireBoolean(row["escalate"], `.router.fixtures[${i}].escalate`),
      reasons: requireStrings2(row["reasons"], `.router.fixtures[${i}].reasons`),
      intents: requireStrings2(row["intents"], `.router.fixtures[${i}].intents`)
    }))
  };
}
function parseScoring(value) {
  const at = ".router.scoring";
  const scoring = requireRecord5(value, at);
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
  const combination = requireRecord5(value, at);
  return {
    gates: literal(combination["gates"], "deterministic-wins", `${at}.gates`),
    judge: literal(combination["judge"], "add-only", `${at}.judge`),
    intents: literal(combination["intents"], "noul-then-primary", `${at}.intents`),
    escalate_on_doubt: literal(combination["escalate_on_doubt"], true, `${at}.escalate_on_doubt`)
  };
}
function literal(value, expected, path) {
  if (value !== expected) return malformed4(`${path} must be ${String(expected)}`);
  return expected;
}
function parseSourceMarkers(value) {
  const at = ".router.source_markers";
  const markers = requireRecord5(value, at);
  return {
    notification: markerList(markers["notification"], `${at}.notification`),
    tool_result: markerList(markers["tool_result"], `${at}.tool_result`),
    hook_echo: markerList(markers["hook_echo"], `${at}.hook_echo`)
  };
}
function markerList(value, path) {
  const list = requireStrings2(value, path);
  if (list.length === 0) malformed4(`${path} must not be empty`);
  list.forEach((marker, i) => {
    if (marker.trim() === "") malformed4(`${path}[${i}] must not be blank`);
  });
  return list;
}
function parseTiebreak(value) {
  const at = ".router.tiebreak";
  const tiebreak2 = requireRecord5(value, at);
  return {
    min_similarity: aboveZeroAtMostOne(tiebreak2["min_similarity"], `${at}.min_similarity`),
    margin: aboveZeroAtMostOne(tiebreak2["margin"], `${at}.margin`)
  };
}
function aboveZeroAtMostOne(value, path) {
  const number = requireNumber3(value, path);
  if (number <= 0 || number > 1) malformed4(`${path} must be greater than 0 and at most 1`);
  return number;
}
function atLeastZero(value, path) {
  const number = requireNumber3(value, path);
  if (number < 0) malformed4(`${path} must be at least 0`);
  return number;
}
function unitInterval2(value, path) {
  const number = requireNumber3(value, path);
  if (number < 0 || number > 1) malformed4(`${path} must be between 0 and 1`);
  return number;
}
function positiveInteger2(value, path) {
  const number = requireNumber3(value, path);
  if (!Number.isInteger(number) || number < 1) malformed4(`${path} must be a positive integer`);
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
var { malformed: malformed5, requireRecord: requireRecord6, requireString: requireString7, requireBoolean: requireBoolean2, optionalString: optionalString3, requireRows: requireRows6 } = strictReader("policy.json");
function parseAdmitRows(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row["when"], `${at}[${i}].when`),
    action: requireString7(row["action"], `${at}[${i}].action`),
    capacity: capacity(row["capacity"], `${at}[${i}].capacity`),
    reason: requireString7(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseSituations(value, at) {
  return requireRows6(value, at).map((row, i) => {
    const action = optionalString3(row["action"], `${at}[${i}].action`);
    const reason = optionalString3(row["reason"], `${at}[${i}].reason`);
    if (action === null !== (reason === null)) malformed5(`${at}[${i}] must carry both action and reason, or neither`);
    return {
      situation: requireString7(row["situation"], `${at}[${i}].situation`),
      response: requireString7(row["response"], `${at}[${i}].response`),
      action,
      reason
    };
  });
}
function parseRepairAnswer(value, at) {
  const answer = requireRecord6(value, at);
  return { action: requireString7(answer["action"], `${at}.action`), reason: requireString7(answer["reason"], `${at}.reason`) };
}
function parseLadder(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row["when"], `${at}[${i}].when`),
    action: requireString7(row["action"], `${at}[${i}].action`),
    reason: requireString7(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseInfraPatterns(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    runner: requireString7(row["runner"], `${at}[${i}].runner`),
    pattern: requireString7(row["pattern"], `${at}[${i}].pattern`),
    reason: infraReason(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseTransitions(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    from: requireString7(row["from"], `${at}[${i}].from`),
    guard: requireWhen(row["guard"], `${at}[${i}].guard`),
    to: requireString7(row["to"], `${at}[${i}].to`),
    allow: requireBoolean2(row["allow"], `${at}[${i}].allow`),
    reason: requireString7(row["reason"], `${at}[${i}].reason`)
  }));
}
function parseReasonTable(value, at) {
  return nonEmptyRows(value, at).map((row, i) => ({
    reason: requireString7(row["reason"], `${at}[${i}].reason`),
    when: requireWhen(row["when"], `${at}[${i}].when`)
  }));
}
function nonEmptyRows(value, at) {
  const rows = requireRows6(value, at);
  if (rows.length === 0) malformed5(`${at} must not be empty`);
  return rows;
}
function requireWhen(value, path) {
  const when = parseWhen(value);
  return typeof when === "string" ? malformed5(`${path} ${when}`) : when;
}
function capacity(value, path) {
  const text2 = requireString7(value, path);
  if (text2 === "remaining" || text2 === "none") return text2;
  return malformed5(`${path} must be remaining or none`);
}
function infraReason(value, path) {
  const text2 = requireString7(value, path);
  if (text2 === "target-absent" || text2 === "runner-missing") return text2;
  return malformed5(`${path} must be target-absent or runner-missing`);
}

// src/registry/policy.ts
var { requireRecord: requireRecord7, requireString: requireString8, requireNumber: requireNumber4, requireBoolean: requireBoolean3, requireStrings: requireStrings3, requireRows: requireRows7 } = strictReader("policy.json");
function loadPolicy(root) {
  const raw = loadRegistry(root, "policy.json");
  const p = requireRecord7(raw, "");
  const risk = requireRecord7(p["risk"], ".risk");
  const repair = requireRecord7(p["repair"], ".repair");
  const autonomy = requireRecord7(p["autonomy"], ".autonomy");
  const retry = requireRecord7(p["retry"], ".retry");
  const gates = requireRecord7(p["gates"], ".gates");
  const specThreshold = requireRecord7(gates["spec_threshold"], ".gates.spec_threshold");
  const parallelism = requireRecord7(p["parallelism"], ".parallelism");
  const backpressure = requireRecord7(parallelism["backpressure"], ".parallelism.backpressure");
  const promptSignals = requireRecord7(parallelism["prompt_signals"], ".parallelism.prompt_signals");
  const breaker = requireRecord7(p["breaker"], ".breaker");
  const hitl = requireRecord7(p["hitl"], ".hitl");
  const scopes = requireStrings3(breaker["scopes"], ".breaker.scopes");
  return {
    version: requireString8(p["version"], ".version"),
    risk: {
      aggregation: requireString8(risk["aggregation"], ".risk.aggregation"),
      inputs: requireRows7(risk["inputs"], ".risk.inputs").map((row, i) => ({
        id: requireString8(row["id"], `.risk.inputs[${i}].id`)
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
      levels: requireRows7(autonomy["levels"], ".autonomy.levels").map((row, i) => ({
        id: requireString8(row["id"], `.autonomy.levels[${i}].id`)
      })),
      ceiling_by_risk: requireTierMap(
        autonomy["ceiling_by_risk"],
        ".autonomy.ceiling_by_risk",
        requireString8
      ),
      high_with_thin_evidence: requireString8(
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
        overload_action: requireString8(
          backpressure["overload_action"],
          ".parallelism.backpressure.overload_action"
        ),
        actions: requireStrings3(backpressure["actions"], ".parallelism.backpressure.actions"),
        rows: parseAdmitRows(backpressure["rows"], ".parallelism.backpressure.rows")
      },
      prompt_signals: {
        action: requireString8(promptSignals["action"], ".parallelism.prompt_signals.action"),
        substantive_action: requireString8(
          promptSignals["substantive_action"],
          ".parallelism.prompt_signals.substantive_action"
        ),
        scale: requireString8(promptSignals["scale"], ".parallelism.prompt_signals.scale"),
        spec: requireString8(promptSignals["spec"], ".parallelism.prompt_signals.spec"),
        design_strong: requireString8(
          promptSignals["design_strong"],
          ".parallelism.prompt_signals.design_strong"
        ),
        design_weak: requireString8(
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
      record_home: requireString8(hitl["record_home"], ".hitl.record_home"),
      reason_table: parseReasonTable(hitl["reason_table"], ".hitl.reason_table")
    },
    router: parseRouter(p["router"]),
    judge: parseJudge(p["judge"], scopes)
  };
}
function requireStringMap(value, path) {
  const row = requireRecord7(value, path);
  const out = {};
  for (const [key, item] of Object.entries(row)) out[key] = requireString8(item, `${path}.${key}`);
  return out;
}
function requireTierMap(value, path, item) {
  const row = requireRecord7(value, path);
  return {
    low: item(row["low"], `${path}.low`),
    medium: item(row["medium"], `${path}.medium`),
    high: item(row["high"], `${path}.high`)
  };
}

// src/kernel/skill-state.ts
var import_node_fs15 = require("node:fs");
var import_node_path12 = require("node:path");
var HEAD_BYTES = 64 * 1024;
var FENCE = /^---[ \t\r\v\f]*$/;
var LEADING_BLANK = /^[ \t]*/;
var TRAILING_BLANK = /[ \t\r\v\f]*$/;
var ENABLED_KEY = "enabled:";
function readSkillState(root) {
  const dir = (0, import_node_path12.join)(root, "skills");
  const state = /* @__PURE__ */ new Map();
  let entries;
  try {
    entries = (0, import_node_fs15.readdirSync)(dir);
  } catch {
    return state;
  }
  for (const id of entries) {
    if (id.startsWith(".")) continue;
    if (!isDirectory3((0, import_node_path12.join)(dir, id))) continue;
    const file = (0, import_node_path12.join)(dir, id, "SKILL.md");
    if (!isFile3(file)) continue;
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
function enabledSkills(declared4, state) {
  return declared4.filter((id) => isSkillEnabled(state, id));
}
function suppressedSkills(declared4, state) {
  return declared4.filter((id) => !isSkillEnabled(state, id)).map((id) => ({ id, reason: state.get(id) === "unreadable" ? "unreadable" : "disabled" }));
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
function isDirectory3(path) {
  try {
    return (0, import_node_fs15.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile3(path) {
  try {
    return (0, import_node_fs15.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function readHead(path) {
  let fd;
  try {
    fd = (0, import_node_fs15.openSync)(path, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = (0, import_node_fs15.readSync)(fd, buffer, 0, HEAD_BYTES, 0);
    const truncated = read === HEAD_BYTES && (0, import_node_fs15.fstatSync)(fd).size > HEAD_BYTES;
    return { text: buffer.subarray(0, read).toString("utf8"), truncated };
  } catch {
    return null;
  } finally {
    (0, import_node_fs15.closeSync)(fd);
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
  const table = policy.hitl.reason_table;
  requireFloorsDeclared(table, levels);
  const measured = {
    risk,
    evidence,
    external_effect: external,
    autonomy: facts.autonomy,
    conflict,
    situation: situation === "" ? null : situation,
    topology
  };
  const matched = evaluateCollect(table, {
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
function requireFloorsDeclared(table, levels) {
  for (const row of table) {
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
var SCORE_GAP_TOLERANCE = 1e-9;
function tiebreakWinner(survivors, ranked, fact, policy) {
  if (survivors.length < MIN_SURVIVORS) return null;
  const scores = new Map(Object.entries(fact));
  const rankedIndexOf = new Map(ranked.map((candidate, index) => [candidate.id, index]));
  const scored2 = [];
  for (const id of survivors) {
    const score = scores.get(id);
    const rankedIndex = rankedIndexOf.get(id);
    if (score === void 0 || rankedIndex === void 0) return null;
    scored2.push({ id, score, rankedIndex });
  }
  scored2.sort((a, b) => b.score - a.score || a.rankedIndex - b.rankedIndex);
  const [best, second] = scored2;
  if (best === void 0 || second === void 0) return null;
  if (best.score < policy.min_similarity) return null;
  if (best.score - second.score + SCORE_GAP_TOLERANCE < policy.margin) return null;
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
  const { judge: judge2 } = input;
  const jev = judge2 !== null && judge2.source === "jev" ? judge2 : null;
  const riskProposal = jev === null ? null : proposalOf(jev);
  const summary = judgeSummary(judge2);
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
  const { prompt, route, judge: judge2, tiebreak: tiebreak2 } = facts;
  if (tiebreak2 !== null) refuseUnrankedTiebreak(tiebreak2, route.ranked);
  const combined = combine({
    route,
    decisions: decisionsSection({ prompt }, regs),
    scale: route.scale,
    judge: judge2,
    mode: judgeMode2(judge2, regs),
    regs,
    ...tiebreak2 === null ? {} : { tiebreak: tiebreak2 }
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
function judgeMode2(judge2, regs) {
  return judge2 !== null && judge2.source === "jev" ? regs.policy.judge.mode : "shadow";
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
  const kept = keptIntentIds(text2, candidates, regs);
  const matches2 = regs.intents.intents.filter((intent) => kept.has(intent.id)).map((intent) => intentMatch(intent, regs));
  const margin = marginOf(candidates);
  const top = candidates[0];
  const ambiguous = matches2.length === 0 || top === void 0 || top.confidence < scoring.threshold || margin !== null && margin < scoring.margin;
  return { matches: matches2, ambiguous, ranked: candidates.slice(0, scoring.top_k), margin };
}
var CAP_EXEMPT_FLOOR = "high";
function keptIntentIds(text2, candidates, regs) {
  const scoring = regs.policy.router.scoring;
  const admitted = candidates.filter((candidate) => candidate.score >= scoring.min_score);
  if (admitted.length <= scoring.max_intents) return new Set(admitted.map((candidate) => candidate.id));
  const highFloor = new Set(regs.intents.intents.filter((row) => row.risk_floor === CAP_EXEMPT_FLOOR).map((row) => row.id));
  const declared4 = new Set(
    scoreIntents(text2, withoutExemplars(regs)).filter((candidate) => candidate.score >= scoring.min_score).map((candidate) => candidate.id)
  );
  const isExempt = (id) => highFloor.has(id) || declared4.has(id);
  const exempt = admitted.filter((candidate) => isExempt(candidate.id));
  const slots2 = Math.max(0, scoring.max_intents - exempt.length);
  const capped = admitted.filter((candidate) => !isExempt(candidate.id)).slice(0, slots2);
  return new Set([...exempt, ...capped].map((candidate) => candidate.id));
}
function withoutExemplars(regs) {
  const policy = regs.policy;
  const declaredOnly = { ...policy, router: { ...policy.router, scoring: { ...policy.router.scoring, bm25_weight: 0 } } };
  return {
    get routing() {
      return regs.routing;
    },
    get intents() {
      return regs.intents;
    },
    get models() {
      return regs.models;
    },
    policy: declaredOnly,
    get decisionRules() {
      return regs.decisionRules;
    },
    get capabilities() {
      return regs.capabilities;
    },
    get agents() {
      return regs.agents;
    },
    get skillState() {
      return regs.skillState;
    }
  };
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
    const malformed6 = `waves --units[${i}] must be an object with a non-empty string id`;
    if (!isRecord(raw)) throw new KernelError(malformed6);
    const id = raw["id"];
    if (typeof id !== "string" || id === "") throw new KernelError(malformed6);
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
function resolve2(facts, ctx) {
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
  const judge2 = facts.judge === void 0 ? null : judgeFact(facts.judge, ctx.registries);
  const tiebreak2 = facts.tiebreak === void 0 ? null : tiebreakFact(facts.tiebreak, ctx.registries);
  if (facts.path !== void 0) {
    if (facts.path === "") throw new KernelError("a declared path fact must not be empty");
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (prompt !== void 0) {
    if (prompt === "") throw new KernelError("a declared prompt fact must not be empty");
    answer.route = facts.escalate === true || facts.taskContract === true ? { ...routeEscalate(prompt, ctx.registries), judge: judgeSummary(judge2) } : routeByIntent(prompt, ctx.registries);
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
    const composed = composeTaskContract({ prompt, route, judge: judge2, tiebreak: tiebreak2 }, ctx.registries);
    answer.decision_rules = composed.decision_rules;
    if (composed.hitl !== null) answer.hitl = composed.hitl;
    answer.task_contract = composed.task_contract;
  }
  return answer;
}

// src/hooks/route-before-change.ts
var EXCLUDED_SENTINEL = "__ENGINEOS_EXCLUDED__";
var DEFAULT_GUIDE = "base.md+git.md only";
var CHANGE_RECORD_NOTE = " | no active .engineos/changes record \u2014 open one (.engineos/changes/_template.md)";
var CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".sql"];
var ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;
function run4(env, ctx) {
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
    contents = (0, import_node_fs16.readFileSync)(path, "utf8");
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
    const route = resolve2({ path: file }, kernel).route;
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
    parsed = JSON.parse((0, import_node_fs16.readFileSync)(path, "utf8"));
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
  const dir = (0, import_node_path13.join)(repo, ".engineos", "changes");
  if (!isDirectory4(dir)) return "";
  return hasActiveRecord(dir) ? "" : CHANGE_RECORD_NOTE;
}
function isDirectory4(path) {
  try {
    return (0, import_node_fs16.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function hasActiveRecord(dir) {
  let entries;
  try {
    entries = (0, import_node_fs16.readdirSync)(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    let contents;
    try {
      contents = (0, import_node_fs16.readFileSync)((0, import_node_path13.join)(dir, entry), "utf8");
    } catch {
      continue;
    }
    if (ACTIVE_RECORD.test(contents)) return true;
  }
  return false;
}

// src/hooks/prompt-advisor-guidance.ts
var MOST_CAPABLE_TIER = "most-capable";
var DESIGN_TIER = "design";
var BUILD_TIER = "build";
function guidanceLookups(regs) {
  var _a;
  const routerAgent = regs.policy.router.agent;
  const routerTier = ((_a = regs.agents.find((agent) => agent.name === routerAgent)) == null ? void 0 : _a.model_tier) ?? DESIGN_TIER;
  return {
    mostCapableModel: tierModel(regs, MOST_CAPABLE_TIER),
    designModel: tierModel(regs, DESIGN_TIER),
    buildModel: tierModel(regs, BUILD_TIER),
    routerModel: tierModel(regs, routerTier),
    highRiskCeiling: regs.policy.autonomy.ceiling_by_risk.high
  };
}
function tierModel(regs, tier) {
  const row = regs.models.tiers.find((candidate) => candidate.id === tier);
  if (row === void 0) throw new KernelError(`registries/models.json: no tier '${tier}' for the prompt advisor`);
  return row.model;
}
function guidanceNotes(task, lookups) {
  return [
    ...scaleNotes(task.contract, lookups),
    ...decisionNote(task.decisions, lookups),
    ...routeNote(task, lookups),
    ...hitlNote(task.hitl),
    ...classifyNote(task)
  ];
}
function scaleNotes(contract, lookups) {
  const notes = [];
  if (contract.scale.big_task) {
    notes.push(
      "[engineos] big-task signal \u2014 apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself."
    );
  }
  if (contract.scale.spec_authoring) {
    notes.push(
      `[engineos] spec/PRD authoring \u2014 rules/models.md: use the most-capable tier (model: ${lookups.mostCapableModel}). If the session model is lower, delegate the authoring to a subagent with that model.`
    );
  }
  if (contract.scale.design_work) {
    notes.push(
      `[engineos] design/architecture work \u2014 rules/models.md: design tier (model: ${lookups.designModel}) for the design pass, build tier (model: ${lookups.buildModel}) for the code that follows.`
    );
  }
  return notes;
}
function decisionNote(decisions, lookups) {
  if (decisions.matches.length === 0) return [];
  const lines = decisions.matches.map(matchLine).join("\n");
  const high = decisions.any_high ? `
[engineos] a matched rule sets risk=high \u2014 autonomy ceiling ${lookups.highRiskCeiling} per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release.` : "";
  return [
    `[engineos] decision rules matched this prompt (registries/decision-rules.json).
${lines}
Confirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only \u2014 apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md.${high}`
  ];
}
function matchLine(match) {
  return `  - ${match.id}` + (match.require.length > 0 ? ` \u2014 require: ${match.require.join(", ")}` : "") + (declared2(match.prefer) ? ` \u2014 prefer: ${match.prefer}` : "") + (declared2(match.gate) ? ` [gate: ${match.gate}]` : "") + (declared2(match.risk) ? ` [risk: ${match.risk}]` : "");
}
function routeNote(task, lookups) {
  const { route, contract } = task;
  if (route.escalate) {
    const scale = Object.entries(route.scale).map(([key, value]) => `${key}=${String(value)}`).join(" ");
    return [
      `[engineos] route escalation \u2014 the kernel could not fully resolve this request: ${route.reasons.join(", ")}. Dispatch the \`router\` agent (agents/router.md, model ${lookups.routerModel}) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=${csv(route.intents)} agents=${csv(route.agents)} scale=(${scale}). A hook cannot dispatch an agent \u2014 you must invoke it.`
    ];
  }
  if (contract.substantive) {
    return [
      `[engineos] task contract (kernel, deterministic): intents=${csv(contract.intents)} agents=${csv(contract.agents)} rules=${csv(contract.rules)} policy_rules=${csv(contract.policy_rules)} skills=${csv(contract.skills)} commands=${csv(contract.commands)} mcp=${csv(contract.mcp)} model_tier=${orDash(contract.model_tier)} risk_floor=${orDash(contract.risk_floor)} autonomy_ceiling_at_floor=${orDash(contract.autonomy_ceiling_at_floor)}${tiebreakField(contract.tiebreak)} \u2014 load these before acting; the risk floor is a floor, not the final tier. No router dispatch needed.`
    ];
  }
  return [];
}
function tiebreakField(winner) {
  return winner === null ? "" : ` tiebreak=${winner}`;
}
function hitlNote(hitl) {
  if (hitl === null || !hitl.required) return [];
  return [
    `[engineos] human-in-the-loop required \u2014 reasons: ${hitl.reasons.join(", ")}. A human decides before any external effect; the autonomy ceiling does not cover this. Record who, when, which reason ids, and what was approved or refused under "## Human decisions" in the change record (rules/risk-autonomy.md "Human-in-the-loop"; rules/gates.md release checklist).`
  ];
}
function classifyNote(task) {
  if (task.contract.risk_floor !== "high" || task.hitl !== null) return [];
  return [
    "[engineos] risk floor is high and no tier has been classified \u2014 classify this task per rules/risk-autonomy.md (reversibility, blast radius, data sensitivity, contract surface, spend; the shortcut floors are high outright) BEFORE claiming that no human decision is owed. None of the gate reasons in registries/policy.json hitl.reasons has fired: a floor is an input to classification, not a verdict, so this is an instruction to classify and not an approval gate."
  ];
}
var PROBABILITY_DIGITS = 2;
function judgeNote(input) {
  const { fact } = input;
  if (input.mode === "shadow" || fact === null) return [];
  if (fact.source === "fallback") {
    if (fact.reason === "disabled") return [];
    return [`[engineos] judge (fallback, ${fact.reason}): no model judgment for this prompt \u2014 the contract above is deterministic only.`];
  }
  const ranked = above(Object.entries(fact.intents), input.intentThreshold);
  const flags = above(
    Object.entries(fact.rules).map(([name, p]) => [input.ruleOf[name] ?? name, p]),
    input.ruleThreshold
  );
  return [
    `[engineos] judge (jev, ${fact.model}): ranked=${scored(ranked)} flags=${scored(flags)} risk_proposal=${orDash(input.riskProposal)} \u2014 model judgment, not a gate`
  ];
}
function above(entries, threshold) {
  return entries.filter(([, p]) => p >= threshold).sort((a, b) => b[1] - a[1]);
}
function scored(entries) {
  return csv(entries.map(([id, p]) => `${id}:${p.toFixed(PROBABILITY_DIGITS)}`));
}
function csv(values) {
  return values.length === 0 ? "-" : values.join(",");
}
function orDash(value) {
  return value === null ? "-" : value;
}
function declared2(value) {
  return value !== null && value !== "";
}

// src/hooks/prompt-judge.ts
var import_node_fs18 = require("node:fs");
var import_node_path16 = require("node:path");

// src/judge/question-text.ts
var PRIMARY_INTENT_INSTRUCTIONS = {
  question: "Which kind of work does `request.text` mainly ask the assistant to do?",
  focus: "Judge what the user wants done, not which topics the text mentions."
};
var INTENT_QUESTION = "Does `request.text` ask the assistant to do this kind of `work`?";
var OTHER_OPTION = "other";
var INTENT_WORK = {
  "new-feature": {
    what: "Build new behavior or a new capability in a project, such as a feature, module, endpoint, screen or integration spanning several files",
    not_for: "Plans, evaluations or decisions about how to build something without building it yet; restructuring that keeps behavior; fixing broken behavior"
  },
  "big-sweep": {
    what: "Apply one change across many places or domains, such as a migration, backfill, rename or upgrade across all modules, services or files",
    not_for: "A change confined to one module or feature"
  },
  bug: {
    what: "Investigate or fix something that is broken, failing, erroring or behaving unexpectedly",
    not_for: "Adding behavior that never existed"
  },
  backend: {
    what: "Server-side application code: NestJS modules, controllers, services, API endpoints, queues or workers",
    not_for: "Database schema or migrations alone; LLM agent logic; Claude Code tooling or the EngineOS framework itself"
  },
  frontend: {
    what: "Web user interface: React or Next.js components, pages, styling, client state or forms",
    not_for: "React Native mobile screens"
  },
  mobile: {
    what: "React Native mobile app work: screens, navigation, native modules, or mirroring a web feature to mobile",
    not_for: "Building, signing or publishing the app to an app store"
  },
  "ios-release": {
    what: "Build, sign or publish the iOS app to TestFlight or the Apple App Store",
    not_for: "Android or Google Play releases"
  },
  "android-release": {
    what: "Build, sign or publish the Android app to Google Play",
    not_for: "iOS or Apple App Store releases"
  },
  llm: {
    what: "Build or change an LLM-powered product feature: a chatbot, prompts, retrieval, embeddings, model tool schemas, evals or Mastra agents inside an application",
    not_for: "Designing how several product agents coordinate; Claude Code subagents, hooks, skills or mods that help the developer work; the EngineOS framework's own agents"
  },
  "agent-system": {
    what: "Design the topology of a product system in which several AI agents cooperate: a supervisor, handoffs or orchestration between agents",
    not_for: "A single chatbot or agent; Claude Code development subagents"
  },
  dba: "Database layer work: SQL, schema design, migrations, indexes or query performance",
  devops: "Infrastructure and delivery: CI/CD pipelines, GitHub workflows, Docker, Kubernetes, Helm, Terraform or cloud resources",
  "security-files": "Change authentication, authorization, guards, middleware, secrets, credentials or environment-file handling",
  "system-comprehension": {
    what: "Write documentation that explains how an existing system works, for onboarding or architecture understanding",
    not_for: "Finding defects or health problems"
  },
  "interview-gaps": "Have the assistant interview the user with questions to fill gaps in system documentation",
  "qa-endpoints": {
    what: "Run end-to-end QA across all API endpoints of an integrated system, for example a Postman or Newman run",
    not_for: "Writing unit or integration tests for specific code"
  },
  audit: {
    what: "Run a read-only health check across a system or several domains to find what is broken or risky",
    not_for: "Reviewing one diff or pull request; writing onboarding documentation"
  },
  refactor: "Restructure or clean up existing code without changing its behavior: simplify, remove technical debt or rename",
  adr: {
    what: "Choose between technical options or decide how to structure something, and record the decision; includes planning or evaluating an architectural change before building it",
    not_for: "Business, career or market decisions"
  },
  "release-notes": "Write release notes or document what changed in a version",
  strategy: {
    what: "Business, market, career, positioning or monetization strategy",
    not_for: "Choosing between technical options"
  },
  review: {
    what: "Review a diff, branch or pull request before merging, or judge whether a specific change is safe",
    not_for: "A system-wide audit"
  },
  "test-writing": "Write or add automated tests or test coverage for specific code",
  "eval-setup": "Set up evaluations or a golden set for an LLM feature",
  "critic-verification": "Independently challenge whether completed high-risk work is actually correct",
  handoff: "Hand work over to another agent, wave or session with a written account of progress",
  retro: {
    what: "Run a retrospective over past work to propose improvements to rules, skills or registries",
    not_for: "Logging a single observation"
  },
  "task-observer": {
    what: "Log one observation about friction with a rule or skill noticed during work",
    not_for: "Running a full retrospective"
  },
  "record-change": {
    what: "Write or close the change record that describes work already done",
    not_for: "Confirming that the work is correct"
  },
  "verify-done": {
    what: "Confirm that work is done, shipped or ready to archive, with evidence",
    not_for: "Writing the change record"
  },
  "route-planning": "Ask which agents should handle a request or how to split it into a dispatch plan"
};
var OTHER_WORK = {
  what: "None of the listed kinds of work: a general question, or work outside these categories, such as configuring Claude Code itself (hooks, settings, mods or the status line)",
  not_for: "Requests that fit one of the listed kinds of work"
};
var IS_PROJECT_CHANGE_QUESTION = {
  type: "noul",
  instructions: "Does `request.text` ask the assistant to change files in a project, such as code, configuration, documentation or design files?",
  criteria: {
    true: "Asks for something to be built, edited, written or removed in the project",
    false: "Only asks for an explanation, an answer, an opinion or advice"
  }
};
var DESIGN_WORK_QUESTION = {
  type: "noul",
  instructions: "Does `request.text` ask for design work, such as an architecture, an interface or contract, a data model or a plan, before implementation?"
};
var FACT_QUESTIONS = {
  large_change: {
    type: "noul",
    instructions: "Does `request.text` ask to rewrite, overhaul or re-architect a large part of a system?"
  },
  affects_public_contract: {
    type: "noul",
    instructions: "Would the work in `request.text` change a public or published API, a database schema, an event payload or another contract that external consumers depend on?"
  },
  handles_sensitive_data: {
    type: "noul",
    instructions: "Does the work in `request.text` involve personal data, payment data, health data, credentials, or data protected by privacy law such as LGPD or GDPR?"
  },
  production_write: {
    type: "noul",
    instructions: "Does `request.text` ask for an action that directly changes a production environment, such as deploying, releasing or writing to live systems?"
  },
  destructive_ddl_or_dml: {
    type: "noul",
    instructions: "Does the work in `request.text` involve deleting data or dropping or truncating database tables, columns, indexes or schemas?"
  },
  secret_reached_git_or_shared_file: {
    type: "noul",
    instructions: "Does `request.text` report that a secret, API key, token, password or credential was committed, pushed, leaked or exposed?"
  },
  knowledge_changes_frequently: {
    type: "noul",
    instructions: "Does the work in `request.text` involve retrieval-augmented generation, embeddings or fine-tuning?"
  },
  retrieval_over_shared_corpus: {
    type: "noul",
    instructions: "Does the work in `request.text` involve retrieving documents from a corpus shared by several users or tenants?"
  },
  multi_agent_system: {
    type: "noul",
    instructions: "Does `request.text` ask to design or build a product system in which more than one AI agent cooperates?",
    criteria: {
      true: "A product with several cooperating agents, such as a supervisor with workers or agents handing off to each other",
      false: "A single agent or chatbot, or Claude Code subagents that the developer uses while working"
    }
  }
};
var SCALE_QUESTION = {
  type: "score",
  instructions: "How widely does the work in `request.text` spread across the project?",
  criteria: [
    "A single focused change or question in one place",
    "Several related changes within one area or domain",
    "Changes spanning several domains, or the same change repeated across many modules, services or files"
  ]
};
var RISK_QUESTIONS = [
  ["reversibility", {
    type: "score",
    instructions: "If the work in `request.text` is carried out, how hard is it to undo?",
    criteria: [
      "Trivially undone, for example by reverting a commit",
      "Can be undone, but only with real effort",
      "Irreversible, or reversible only with data loss"
    ]
  }],
  ["blast_radius", {
    type: "score",
    instructions: "If the work in `request.text` is carried out, how far do its effects reach?",
    criteria: [
      "Confined to one module and the local machine",
      "Affects a whole service or one team's surface",
      "Reaches production, other teams or external consumers"
    ]
  }],
  ["data_sensitivity", {
    type: "score",
    instructions: "What kind of data does the work in `request.text` touch?",
    criteria: [
      "No real data",
      "Internal business data",
      "Personal, credential, financial or clinical data"
    ]
  }],
  ["contract_surface", {
    type: "score",
    instructions: "Which interfaces does the work in `request.text` change?",
    criteria: [
      "Only private internals",
      "An internal module interface",
      "A public or published API, a database schema or an event payload"
    ]
  }],
  ["spend", {
    type: "score",
    instructions: "What money does the work in `request.text` commit?",
    criteria: [
      "A negligible cost",
      "A bounded, known cost",
      "An unbounded cost, or a commitment of real money"
    ]
  }]
];

// src/judge/questions.ts
var PRIMARY_INTENT_KEY = "primary_intent";
var INTENT_KEY_PREFIX = "intent.";
var FACT_KEY_PREFIX = "fact.";
var RISK_KEY_PREFIX = "risk.";
var IS_PROJECT_CHANGE_KEY = "is_project_change";
var DESIGN_WORK_KEY = "design_work";
var SCALE_KEY = "scale";
var QuestionSetError = class extends Error {
  kind = "judge-question-set";
};
function buildQuestionSet(sources) {
  const intentIds = activeIntentIds(sources.intents);
  const facts = judgeFacts(sources.rules);
  const questions = {};
  questions[PRIMARY_INTENT_KEY] = primaryIntentQuestion(intentIds);
  for (const id of intentIds) questions[`${INTENT_KEY_PREFIX}${id}`] = intentNoul(id);
  questions[IS_PROJECT_CHANGE_KEY] = IS_PROJECT_CHANGE_QUESTION;
  questions[DESIGN_WORK_KEY] = DESIGN_WORK_QUESTION;
  for (const fact of facts) questions[`${FACT_KEY_PREFIX}${fact}`] = factNoul(fact);
  questions[SCALE_KEY] = SCALE_QUESTION;
  for (const [name, question] of RISK_QUESTIONS) questions[`${RISK_KEY_PREFIX}${name}`] = question;
  return questions;
}
function activeIntentIds(intents) {
  const ids = [];
  for (const row of intents) {
    if (!row.active) continue;
    if (row.id === OTHER_OPTION) throw new QuestionSetError(`intent id '${OTHER_OPTION}' is reserved for the judge's fallback option`);
    if (ids.includes(row.id)) throw new QuestionSetError(`intent id '${row.id}' appears twice`);
    ids.push(row.id);
  }
  return ids;
}
function judgeFacts(rules) {
  const facts = [];
  for (const rule of rules) {
    if (rule.judge_fact === null) continue;
    if (facts.includes(rule.judge_fact)) throw new QuestionSetError(`judge_fact '${rule.judge_fact}' is declared by more than one rule`);
    facts.push(rule.judge_fact);
  }
  return facts;
}
function workOf(id) {
  const work = INTENT_WORK[id];
  if (work === void 0) throw new QuestionSetError(`active intent '${id}' has no question wording in src/judge/question-text.ts`);
  return work;
}
function primaryIntentQuestion(intentIds) {
  const criteria = {};
  for (const id of intentIds) criteria[id] = workOf(id);
  criteria[OTHER_OPTION] = OTHER_WORK;
  return {
    type: "choice",
    instructions: { question: PRIMARY_INTENT_INSTRUCTIONS.question, focus: PRIMARY_INTENT_INSTRUCTIONS.focus },
    criteria
  };
}
function intentNoul(id) {
  return { type: "noul", instructions: { work: workOf(id), question: INTENT_QUESTION } };
}
function factNoul(fact) {
  const question = FACT_QUESTIONS[fact];
  if (question === void 0) throw new QuestionSetError(`judge_fact '${fact}' has no question wording in src/judge/question-text.ts`);
  return question;
}

// src/judge/response.ts
var MODEL_SLUG2 = /^[A-Za-z0-9@_./:-]{1,256}$/;
var RISK_NAMES = ["reversibility", "blast_radius", "data_sensitivity", "contract_surface", "spend"];
function parseJevResponse(raw, questions, latencyMs) {
  if (!isRecord(raw)) return null;
  const answers = raw["answers"];
  const model = raw["model"];
  if (!isRecord(answers) || typeof model !== "string" || !MODEL_SLUG2.test(model)) return null;
  const primary = choiceAnswer(answers[PRIMARY_INTENT_KEY], questions);
  const isProjectChange = noulAnswer(answers[IS_PROJECT_CHANGE_KEY]);
  const designWork = noulAnswer(answers[DESIGN_WORK_KEY]);
  const scale = scoreAnswer(answers[SCALE_KEY], levelCount(questions, SCALE_KEY));
  const intents = noulsByPrefix(answers, questions, INTENT_KEY_PREFIX);
  const rules = noulsByPrefix(answers, questions, FACT_KEY_PREFIX);
  const risk = riskAnswers(answers, questions);
  if (primary === null || isProjectChange === null || designWork === null || scale === null) return null;
  if (intents === null || rules === null || risk === null) return null;
  return {
    source: "jev",
    model,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    is_project_change: isProjectChange,
    primary,
    intents,
    rules,
    scale,
    design_work: designWork,
    risk
  };
}
function reportedInputTokens(raw) {
  if (!isRecord(raw)) return null;
  const usage = raw["usage"];
  if (!isRecord(usage)) return null;
  const tokens = usage["input_tokens"];
  return typeof tokens === "number" && Number.isInteger(tokens) && tokens >= 0 ? tokens : null;
}
function choiceAnswer(answer, questions) {
  const question = questions[PRIMARY_INTENT_KEY];
  if (question === void 0 || question.type !== "choice") return null;
  if (!isRecord(answer) || answer["type"] !== "choice") return null;
  const choice = answer["choice"];
  const confidence = answer["confidence"];
  const options = Object.keys(question.criteria);
  if (typeof choice !== "string" || !options.includes(choice) || !isUnit(confidence)) return null;
  const probabilities2 = choiceProbabilities(answer["probabilities"], options);
  if (probabilities2 === null) return null;
  const margin = choiceMargin(choice, probabilities2, options);
  if (margin === null) return null;
  return { id: choice, confidence, margin };
}
function choiceMargin(choice, probabilities2, options) {
  const chosen = probabilities2[choice];
  if (chosen === void 0) return null;
  const others = options.filter((option) => option !== choice).map((option) => probabilities2[option] ?? 0);
  if (others.length === 0) return 1;
  return clampUnit(chosen - Math.max(...others));
}
function choiceProbabilities(value, options) {
  if (!isRecord(value)) return null;
  const out = {};
  for (const [key, p] of Object.entries(value)) {
    if (!options.includes(key) || !isUnit(p)) return null;
    out[key] = p;
  }
  return out;
}
function noulAnswer(answer) {
  if (!isRecord(answer) || answer["type"] !== "noul") return null;
  const p = answer["noul"];
  return isUnit(p) ? p : null;
}
function scoreAnswer(answer, levels) {
  if (levels === null || !isRecord(answer) || answer["type"] !== "score") return null;
  const score = answer["score"];
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > levels - 1) return null;
  if (!isRecord(answer["legend"])) return null;
  const keys = Array.from({ length: levels }, (_, i) => String(i));
  const probabilities2 = probabilityMap(answer["probabilities"], keys);
  if (probabilities2 === null) return null;
  let expectation = 0;
  for (let i = 0; i < levels; i += 1) expectation += i * (probabilities2[String(i)] ?? 0);
  return toScoreLevel(Math.round(expectation));
}
function noulsByPrefix(answers, questions, prefix) {
  const out = {};
  for (const key of Object.keys(questions)) {
    if (!key.startsWith(prefix)) continue;
    const p = noulAnswer(answers[key]);
    if (p === null) return null;
    out[key.slice(prefix.length)] = p;
  }
  return out;
}
function riskAnswers(answers, questions) {
  const level2 = (name) => {
    const key = `${RISK_KEY_PREFIX}${name}`;
    return scoreAnswer(answers[key], levelCount(questions, key));
  };
  const [reversibility, blastRadius, dataSensitivity, contractSurface, spend] = RISK_NAMES.map(level2);
  if (reversibility == null || blastRadius == null || dataSensitivity == null) return null;
  if (contractSurface == null || spend == null) return null;
  return {
    reversibility,
    blast_radius: blastRadius,
    data_sensitivity: dataSensitivity,
    contract_surface: contractSurface,
    spend
  };
}
function levelCount(questions, key) {
  const question = questions[key];
  return question !== void 0 && question.type === "score" ? question.criteria.length : null;
}
function probabilityMap(value, keys) {
  if (!isRecord(value)) return null;
  const out = {};
  for (const key of Object.keys(value)) if (!keys.includes(key)) return null;
  for (const key of keys) {
    const p = value[key];
    if (!isUnit(p)) return null;
    out[key] = p;
  }
  return out;
}
function toScoreLevel(n) {
  if (n === 0 || n === 1 || n === 2) return n;
  return null;
}
function isUnit(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
function clampUnit(n) {
  return Math.min(1, Math.max(0, n));
}

// src/judge/redact.ts
var RedactionPatternError = class extends Error {
  kind = "judge-redaction-pattern";
};
function redactText(text2, patterns) {
  let redacted = text2;
  for (const { kind, pattern } of patterns) {
    const marker = placeholder(kind);
    redacted = redacted.replace(compile2(kind, pattern), () => marker);
  }
  return redacted;
}
function redactBounded(text2, patterns, preCapChars) {
  if (text2.length <= preCapChars) return { text: redactText(text2, patterns), capped: false };
  let agreed = cutAtCodeUnit(text2, preCapChars);
  for (const { kind, pattern } of patterns) agreed = redactAgreedPrefix(agreed, kind, pattern);
  return { text: withoutTrailingHighSurrogate(agreed), capped: true };
}
function cutAtCodeUnit(text2, maxChars) {
  if (text2.length <= maxChars) return text2;
  const end = isHighSurrogate(text2.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars;
  return text2.slice(0, Math.max(0, end));
}
function redactAgreedPrefix(text2, kind, pattern) {
  const matches2 = findMatches(text2, compile2(kind, pattern));
  const reach = patternReach(pattern);
  const end = reach === null ? 0 : agreedEnd(text2, matches2, reach);
  return splice(text2, matches2, placeholder(kind), end);
}
function agreedEnd(text2, matches2, reach) {
  const safeBelow = Math.max(0, text2.length - reach.window + 1);
  let position = safeBelow;
  let index = 0;
  for (; index < matches2.length; index += 1) {
    const match = matches2[index];
    if (match === void 0 || match.start >= safeBelow) break;
    position = Math.max(position, match.end);
  }
  while (position < text2.length) {
    if (reach.mayReadPastEnd(text2, position)) return position;
    const match = matches2[index];
    if (match !== void 0 && match.start === position) {
      position = match.end > position ? match.end : position + 1;
      index += 1;
    } else {
      position += 1;
    }
  }
  return text2.length;
}
function findMatches(text2, regex) {
  const found = [];
  for (let match = regex.exec(text2); match !== null; match = regex.exec(text2)) {
    found.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return found;
}
function splice(text2, matches2, marker, end) {
  let output = "";
  let copied = 0;
  for (const { start, end: matchEnd } of matches2) {
    if (start >= end) break;
    output += text2.slice(copied, start) + marker;
    if (matchEnd > end) return output;
    copied = matchEnd;
  }
  return output + text2.slice(copied, end);
}
var reachCache = /* @__PURE__ */ new Map();
function patternReach(pattern) {
  const cached = reachCache.get(pattern);
  if (cached !== void 0) return cached;
  const reach = analyse(pattern);
  reachCache.set(pattern, reach);
  return reach;
}
function analyse(pattern) {
  let root;
  try {
    root = new PatternParser(pattern).parse();
  } catch {
    return null;
  }
  const prefixes = prefixSource(root);
  const window = maxLength(root) + 1;
  if (prefixes === null) return { window, mayReadPastEnd: () => false };
  let regex;
  try {
    regex = new RegExp(`(?:${prefixes})$`, "y");
  } catch {
    return null;
  }
  return {
    window,
    mayReadPastEnd: (text2, start) => {
      regex.lastIndex = start;
      return regex.test(text2);
    }
  };
}
function maxLength(node) {
  switch (node.type) {
    case "unit":
      return 1;
    case "sequence":
      return node.items.reduce((total, item) => total + maxLength(item), 0);
    case "choice":
      return node.options.reduce((longest, option) => Math.max(longest, maxLength(option)), 0);
    case "lookahead":
      return maxLength(node.body);
    case "zero-width":
      return 0;
    case "repeat": {
      const body = maxLength(node.body);
      return body === 0 ? 0 : node.max * body;
    }
  }
}
function render2(node) {
  switch (node.type) {
    case "unit":
      return node.source;
    case "sequence":
      return node.items.map(render2).join("");
    case "choice":
      return `(?:${node.options.map(render2).join("|")})`;
    case "lookahead":
      return "";
    case "zero-width":
      return node.source;
    case "repeat": {
      const body = render2(node.body);
      return body === "" ? "" : `(?:${body})${bounds(node.min, node.max)}`;
    }
  }
}
function prefixSource(node) {
  switch (node.type) {
    case "unit":
      return node.source;
    case "sequence": {
      const options = [];
      node.items.forEach((item, index) => {
        const tail = prefixSource(item);
        if (tail !== null) options.push(node.items.slice(0, index).map(render2).join("") + tail);
      });
      return either(options);
    }
    case "choice":
      return either(node.options.map(prefixSource).filter((option) => option !== null));
    case "lookahead":
      return prefixSource(node.body);
    case "zero-width":
      return null;
    case "repeat": {
      const tail = prefixSource(node.body);
      if (tail === null || node.max === 0) return null;
      if (node.body.type === "unit") return `${node.body.source}${bounds(1, node.max)}`;
      return `(?:${render2(node.body)})${bounds(0, node.max - 1)}(?:${tail})`;
    }
  }
}
function either(options) {
  return options.length === 0 ? null : `(?:${options.join("|")})`;
}
function bounds(min, max) {
  return max === Number.POSITIVE_INFINITY ? `{${min},}` : `{${min},${max}}`;
}
var UnsupportedPatternError = class extends Error {
};
var RANGE_QUANTIFIER2 = /^\{(\d+)(?:(,)(\d*))?\}/;
var PatternParser = class {
  source;
  index = 0;
  constructor(source) {
    this.source = source;
  }
  parse() {
    const root = this.choice();
    if (this.index !== this.source.length) throw new UnsupportedPatternError("unbalanced group");
    return root;
  }
  choice() {
    const options = [this.sequence()];
    while (this.source[this.index] === "|") {
      this.index += 1;
      options.push(this.sequence());
    }
    return options.length === 1 && options[0] !== void 0 ? options[0] : { type: "choice", options };
  }
  sequence() {
    const items = [];
    while (this.index < this.source.length && this.source[this.index] !== "|" && this.source[this.index] !== ")") {
      items.push(this.quantified(this.term()));
    }
    return { type: "sequence", items };
  }
  term() {
    const char = this.source[this.index];
    if (char === "(") return this.group();
    if (char === "[") return this.characterClass();
    if (char === "\\") return this.escape();
    if (char === "^" || char === "$") {
      this.index += 1;
      return { type: "zero-width", source: char };
    }
    if (char === void 0 || "*+?".includes(char)) throw new UnsupportedPatternError("dangling quantifier");
    this.index += 1;
    if (char === "{") {
      if (RANGE_QUANTIFIER2.test(this.source.slice(this.index - 1))) throw new UnsupportedPatternError("dangling quantifier");
      return { type: "unit", source: "\\{" };
    }
    return { type: "unit", source: char };
  }
  group() {
    var _a;
    const start = this.index;
    const rest = this.source.slice(this.index);
    const opener = ((_a = /^\((?:\?:|\?=|\?!|\?<=|\?<!|\?<[A-Za-z_$][\w$]*>)?/.exec(rest)) == null ? void 0 : _a[0]) ?? "(";
    this.index += opener.length;
    const body = this.choice();
    if (this.source[this.index] !== ")") throw new UnsupportedPatternError("unclosed group");
    this.index += 1;
    if (opener === "(?=" || opener === "(?!") return { type: "lookahead", body };
    if (opener === "(?<=" || opener === "(?<!") return { type: "zero-width", source: this.source.slice(start, this.index) };
    return body;
  }
  characterClass() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length && this.source[this.index] !== "]") {
      this.index += this.source[this.index] === "\\" ? 2 : 1;
    }
    if (this.index >= this.source.length) throw new UnsupportedPatternError("unclosed class");
    this.index += 1;
    return { type: "unit", source: this.source.slice(start, this.index) };
  }
  escape() {
    const next = this.source[this.index + 1];
    if (next === void 0 || /[1-9k]/.test(next)) throw new UnsupportedPatternError("backreference");
    if (next === "b" || next === "B") {
      const source2 = this.source.slice(this.index, this.index + 2);
      this.index += 2;
      return { type: "zero-width", source: source2 };
    }
    if (next === "c") throw new UnsupportedPatternError("control escape");
    const rest = this.source.slice(this.index);
    const width = /^\\x[0-9A-Fa-f]{2}/.test(rest) ? 4 : /^\\u[0-9A-Fa-f]{4}/.test(rest) ? 6 : 2;
    const source = rest.slice(0, width);
    this.index += width;
    return { type: "unit", source };
  }
  quantified(body) {
    const char = this.source[this.index];
    let min;
    let max;
    if (char === "?" || char === "*" || char === "+") {
      this.index += 1;
      min = char === "+" ? 1 : 0;
      max = char === "?" ? 1 : Number.POSITIVE_INFINITY;
    } else {
      const braces = RANGE_QUANTIFIER2.exec(this.source.slice(this.index));
      if (braces === null) return body;
      const [whole, minText = "0", comma, maxText = ""] = braces;
      this.index += whole.length;
      min = Number.parseInt(minText, 10);
      max = comma === void 0 ? min : maxText === "" ? Number.POSITIVE_INFINITY : Number.parseInt(maxText, 10);
    }
    if (this.source[this.index] === "?") this.index += 1;
    return { type: "repeat", body, min, max };
  }
};
function placeholder(kind) {
  return `<redacted:${kind}>`;
}
function withoutTrailingHighSurrogate(text2) {
  return text2.length > 0 && isHighSurrogate(text2.charCodeAt(text2.length - 1)) ? text2.slice(0, -1) : text2;
}
function isHighSurrogate(code) {
  return code >= 55296 && code <= 56319;
}
function compile2(kind, pattern) {
  try {
    return new RegExp(pattern, "g");
  } catch {
    throw new RedactionPatternError(`redaction pattern '${kind}' does not compile`);
  }
}

// src/judge/state.ts
var PRE_CAP_FACTOR = 2;
function buildJudgeState(input, policy) {
  const { text: text2, capped } = redactBounded(input.text, policy.redaction.patterns, PRE_CAP_FACTOR * policy.max_state_bytes);
  const full = stateWith(input, text2, capped);
  if (byteLength(full) <= policy.max_state_bytes) return { kind: "ok", state: full };
  return truncateToFit(input, text2, policy.max_state_bytes);
}
function truncateToFit(input, text2, maxBytes) {
  const codePoints = Array.from(text2);
  if (byteLength(stateWith(input, "", true)) > maxBytes) return { kind: "oversize" };
  let low = 0;
  let high = codePoints.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(stateWith(input, codePoints.slice(0, mid).join(""), true)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return { kind: "ok", state: stateWith(input, codePoints.slice(0, low).join(""), true) };
}
function stateWith(input, text2, truncated) {
  return {
    request: truncated ? { text: text2, source: "user", truncated: true } : { text: text2, source: "user" },
    repository: {
      declared_stack: [...input.repository.declared_stack],
      active_spec: input.repository.active_spec,
      open_change_record: input.repository.open_change_record
    },
    session: { last_intent: input.session.last_intent }
  };
}
function byteLength(state) {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

// src/judge/jev.ts
var ALLOWED_ORIGIN = "https://api.typesafe.ai";
async function judge(input, deps) {
  const admission = admit(input, deps);
  if (admission.kind === "skipped") return admission;
  const built = buildJudgeState(input, deps.policy);
  if (built.kind === "oversize") return { kind: "failed", reason: "oversize-state" };
  const body = JSON.stringify({ model: deps.policy.model, state: built.state, questions: deps.questions });
  const startedAt = deps.now();
  const exchange3 = await exchangeWithDeadline(admission.transport, admission.key, body, deps.policy);
  const latencyMs = deps.now() - startedAt;
  if (exchange3.kind === "failed") return fail3(exchange3.reason, deps);
  const facts = parseJevResponse(exchange3.raw, deps.questions, latencyMs);
  if (facts === null) return fail3("invalid-response", deps);
  deps.breaker.recordSuccess();
  return { kind: "facts", facts, tokens_in: reportedInputTokens(exchange3.raw) };
}
function admit(input, deps) {
  const { policy, env } = deps;
  if (input.source !== "user") return { kind: "skipped", reason: "not-user-input" };
  if (env[policy.enabled_env] !== policy.enabled_value) return { kind: "skipped", reason: "disabled" };
  const key = env[policy.key_env];
  if (key === void 0 || key.trim() === "") return { kind: "skipped", reason: "no-key" };
  if (deps.fetch === void 0) return { kind: "skipped", reason: "no-fetch" };
  if (!onAllowedOrigin(policy.endpoint)) return { kind: "skipped", reason: "disabled" };
  const breaker = deps.breaker.read();
  if (breaker.opened_at !== null && deps.now() - breaker.opened_at < policy.breaker.cooldown_ms) {
    return { kind: "skipped", reason: "breaker-open" };
  }
  return { kind: "go", key, transport: deps.fetch };
}
function onAllowedOrigin(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.origin === ALLOWED_ORIGIN && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
function fail3(reason, deps) {
  deps.breaker.recordFailure(deps.now());
  return { kind: "failed", reason };
}
async function exchangeWithDeadline(transport, key, body, policy) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve5) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve5({ kind: "failed", reason: "timeout" });
    }, policy.timeout_ms);
  });
  try {
    return await Promise.race([exchange({ transport, key, body, endpoint: policy.endpoint, signal: controller.signal }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
async function exchange(request) {
  let response2;
  try {
    response2 = await request.transport(request.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.key}`, "Content-Type": "application/json" },
      body: request.body,
      signal: request.signal,
      // A redirect would carry the bearer token to wherever it points; the
      // endpoint is fixed policy data, so any redirect is a failure.
      redirect: "error"
    });
  } catch {
    return { kind: "failed", reason: request.signal.aborted ? "timeout" : "network" };
  }
  const statusFailure = classifyStatus(response2.status);
  if (statusFailure !== null) return { kind: "failed", reason: statusFailure };
  let text2;
  try {
    text2 = await response2.text();
  } catch {
    return { kind: "failed", reason: request.signal.aborted ? "timeout" : "network" };
  }
  try {
    const raw = JSON.parse(text2);
    return { kind: "json", raw };
  } catch {
    return { kind: "failed", reason: "invalid-response" };
  }
}
function classifyStatus(status) {
  if (status >= 200 && status < 300) return null;
  if (status === 429) return "http-429";
  if (status >= 400 && status < 500) return "http-4xx";
  if (status >= 500 && status < 600) return "http-5xx";
  return "invalid-response";
}

// src/judge/breaker.ts
var import_node_fs17 = require("node:fs");
var import_node_path14 = require("node:path");
var TELEMETRY_DIR_NAME = "engineos-telemetry";
var STATE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
var CLOSED = { failures: 0, opened_at: null };
var BreakerConfigError = class extends Error {
  kind = "judge-breaker-config";
};
function createFileBreakerStore(options) {
  if (!STATE_FILE_PATTERN.test(options.stateFile) || options.stateFile.includes("..")) {
    throw new BreakerConfigError("judge.breaker.state_file must be a plain file name");
  }
  if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) {
    throw new BreakerConfigError("breaker.failure_threshold must be a positive integer");
  }
  const dir = (0, import_node_path14.join)(options.gitDir, TELEMETRY_DIR_NAME);
  const path = (0, import_node_path14.join)(dir, options.stateFile);
  const read = () => readState(path);
  return {
    read,
    recordFailure(now) {
      const current = read();
      const failures = current.failures + 1;
      const openedAt = failures >= options.failureThreshold ? now : current.opened_at;
      writeState(dir, path, { failures, opened_at: openedAt });
    },
    recordSuccess() {
      const current = read();
      if (current.failures === 0 && current.opened_at === null) return;
      writeState(dir, path, CLOSED);
    }
  };
}
function readState(path) {
  let raw;
  try {
    raw = JSON.parse((0, import_node_fs17.readFileSync)(path, "utf8"));
  } catch {
    return CLOSED;
  }
  if (!isRecord(raw)) return CLOSED;
  const failures = raw["failures"];
  const openedAt = raw["opened_at"];
  if (typeof failures !== "number" || !Number.isInteger(failures) || failures < 0) return CLOSED;
  if (openedAt === null) return { failures, opened_at: null };
  if (typeof openedAt !== "number" || !Number.isFinite(openedAt) || openedAt < 0) return CLOSED;
  return { failures, opened_at: openedAt };
}
function writeState(dir, path, state) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    (0, import_node_fs17.mkdirSync)(dir, { recursive: true });
    (0, import_node_fs17.writeFileSync)(tmp, `${JSON.stringify(state)}
`);
    (0, import_node_fs17.renameSync)(tmp, path);
  } catch {
    return;
  }
}

// src/judge/tiebreak.ts
var import_node_net = require("node:net");
var import_node_os5 = require("node:os");
var import_node_path15 = require("node:path");
var ENABLE_ENV = "ENGINEOS_EMBED_DAEMON";
var ENABLE_VALUE = "1";
var SOCKET_NAME = "embed.sock";
var PROTOCOL_VERSION = 1;
var DEFAULT_DEADLINE_MS = 150;
var LIMITS = { maxLineBytes: 65536, maxTextChars: 2e3, maxCandidates: 10, maxExemplars: 10, maxExemplarChars: 300 };
var PRE_CAP_FACTOR2 = 2;
var MAX_RESPONSE_BYTES = 16384;
var INTENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
function nodeTiebreakDeps(env, redaction) {
  return {
    env,
    now: Date.now,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    tmpdir: import_node_os5.tmpdir,
    lstat: lstatFacts,
    connect: (path) => (0, import_node_net.connect)(path),
    redaction
  };
}
function tiebreakEnabled(env) {
  return env[ENABLE_ENV] === ENABLE_VALUE;
}
async function tiebreak(input, deps) {
  if (!tiebreakEnabled(deps.env)) return skipped("disabled");
  if (!input.ambiguous) return skipped("not-ambiguous");
  const candidates = boundedCandidates(input.candidates);
  if (candidates.length === 0) return skipped("no-candidates");
  const socket = privateSocket(deps);
  if (socket.kind === "skipped") return socket;
  const { text: redacted } = redactBounded(input.text, deps.redaction, PRE_CAP_FACTOR2 * LIMITS.maxTextChars);
  const text2 = cutAtCodeUnit(redacted, LIMITS.maxTextChars);
  if (text2.trim() === "") return skipped("no-candidates");
  const line = `${JSON.stringify({ v: PROTOCOL_VERSION, op: "rank", text: text2, candidates })}
`;
  if (Buffer.byteLength(line) > LIMITS.maxLineBytes) return skipped("oversize");
  const started = deps.now();
  const reply2 = await exchange2(deps, socket.path, line);
  if (reply2.kind === "failed") return reply2;
  return parseReply(reply2.body, new Set(candidates.map((candidate) => candidate.id)), deps.now() - started);
}
function privateSocket(deps) {
  if (deps.uid === null) return skipped("no-socket");
  const dir = runtimeDir(deps.env, deps.uid, deps.tmpdir);
  const path = (0, import_node_path15.join)(dir, SOCKET_NAME);
  const dirFacts = deps.lstat(dir);
  if (dirFacts === null) return skipped("no-socket");
  if (!isPrivateDir(dirFacts, deps.uid)) return skipped("unsafe-socket");
  const socketFacts = deps.lstat(path);
  if (socketFacts === null) return skipped("no-socket");
  if (socketFacts.kind !== "socket" || socketFacts.uid !== deps.uid) return skipped("unsafe-socket");
  return { kind: "present", path };
}
function boundedCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  const bounded = [];
  for (const candidate of candidates) {
    if (bounded.length === LIMITS.maxCandidates) break;
    if (!INTENT_ID.test(candidate.id) || seen.has(candidate.id)) continue;
    const exemplars = candidate.exemplars.map((exemplar) => exemplar.slice(0, LIMITS.maxExemplarChars)).filter((exemplar) => exemplar.trim() !== "").slice(0, LIMITS.maxExemplars);
    if (exemplars.length === 0) continue;
    seen.add(candidate.id);
    bounded.push({ id: candidate.id, exemplars });
  }
  return bounded;
}
function exchange2(deps, path, line) {
  return new Promise((settle) => {
    let body = "";
    let done = false;
    const socket = deps.connect(path);
    const timer = setTimeout(() => finish({ kind: "failed", reason: "timeout" }), deps.deadlineMs ?? DEFAULT_DEADLINE_MS);
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      settle(result);
    }
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(line));
    socket.on("data", (chunk2) => {
      body += chunk2;
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) return finish({ kind: "failed", reason: "invalid-response" });
      const end = body.indexOf("\n");
      if (end >= 0) finish({ kind: "reply", body: body.slice(0, end) });
    });
    socket.once("end", () => finish({ kind: "reply", body }));
    socket.once("error", () => finish({ kind: "failed", reason: "network" }));
  });
}
function parseReply(body, offered, latency) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return failed2("invalid-response");
  }
  if (!isRecord2(value) || value["v"] !== PROTOCOL_VERSION) return failed2("invalid-response");
  if (value["ok"] === false) return failed2(value["error"] === "busy" ? "busy" : "invalid-response");
  const model = value["model"];
  const scores = value["scores"];
  if (value["ok"] !== true || typeof model !== "string" || !isRecord2(scores)) return failed2("invalid-response");
  const accepted = {};
  for (const [id, score] of Object.entries(scores)) {
    if (!offered.has(id) || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) return failed2("invalid-response");
    accepted[id] = score;
  }
  return { kind: "scores", scores: accepted, model, latency_ms: latency };
}
function skipped(reason) {
  return { kind: "skipped", reason };
}
function failed2(reason) {
  return { kind: "failed", reason };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hooks/prompt-source.ts
var HOST_SOURCE_FIELDS = ["source", "prompt_source"];
var HOST_SOURCE_VALUES = {
  user: "user",
  notification: "notification",
  "tool-result": "tool-result",
  tool_result: "tool-result",
  "hook-echo": "hook-echo",
  hook_echo: "hook-echo"
};
var TAG_FRAME = /^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)/;
function classifyPromptSource(env, markers) {
  const declared4 = hostDeclaredSource(env.raw);
  if (declared4 !== null) return declared4;
  const text2 = env.prompt.trimStart();
  if (startsWithAny(text2, markers.notification)) return "notification";
  if (startsWithAny(text2, markers.tool_result)) return "tool-result";
  if (startsWithAny(text2, markers.hook_echo)) return "hook-echo";
  return "user";
}
function judgeMayReceive(env, markers) {
  try {
    if (classifyPromptSource(env, markers()) !== "user") return false;
    return !TAG_FRAME.test(env.prompt.trimStart());
  } catch {
    return false;
  }
}
function hostDeclaredSource(raw) {
  if (!isRecord(raw)) return null;
  for (const field of HOST_SOURCE_FIELDS) {
    const value = raw[field];
    if (typeof value !== "string") continue;
    const source = HOST_SOURCE_VALUES[value];
    if (source !== void 0) return source;
  }
  return null;
}
function startsWithAny(text2, markers) {
  return markers.some((marker) => marker !== "" && text2.startsWith(marker));
}

// src/hooks/prompt-judge.ts
var NOT_USER_INPUT = "not-user-input";
var JUDGE_GUARD_SLACK_MS = 50;
var GUARD_TIMEOUT = { kind: "failed", reason: "timeout" };
var LATENCY_BUCKETS = [[100, "lt100"], [200, "lt200"], [300, "lt300"], [400, "lt400"]];
var ACTIVE_RECORD2 = /^status:[ \t\f\v\r]*active/m;
var SPEC_LINK = /docs\/specs\//;
var NOT_CONSULTED = { fact: null, policy: null, latencyMs: null, span: null };
async function consultSemantics(env, ctx, kernel) {
  const regs = kernel.registries;
  if (judgeMayFold(ctx, regs)) {
    const consultation2 = await consultJudge(env, ctx, regs);
    const scores2 = folds(consultation2) ? null : await consultTiebreak(env.prompt, ctx, kernel);
    return { consultation: consultation2, tiebreak: scores2 };
  }
  const [consultation, scores] = await Promise.all([consultJudge(env, ctx, regs), consultTiebreak(env.prompt, ctx, kernel)]);
  return { consultation, tiebreak: scores };
}
async function consultTiebreak(prompt, ctx, kernel) {
  if (!tiebreakEnabled(ctx.io.env)) return null;
  try {
    const { route } = resolve2({ prompt, escalate: true }, kernel);
    if (route === void 0 || !("escalate" in route) || !route.ambiguous || route.intents.length < 2) return null;
    const regs = kernel.registries;
    const exemplars = new Map(regs.intents.intents.map((row) => [row.id, row.exemplars]));
    const candidates = route.ranked.map((ranked) => ({ id: ranked.id, exemplars: exemplars.get(ranked.id) ?? [] }));
    const outcome = await tiebreak({ text: prompt, ambiguous: true, candidates }, nodeTiebreakDeps(ctx.io.env, regs.policy.judge.redaction.patterns));
    return outcome.kind === "scores" ? outcome.scores : null;
  } catch {
    return null;
  }
}
async function consultJudge(env, ctx, regs) {
  let policy;
  try {
    policy = regs.policy.judge;
    if (ctx.io.env[policy.enabled_env] !== policy.enabled_value) {
      return { fact: { source: "fallback", reason: "disabled" }, policy, latencyMs: null, span: null };
    }
  } catch {
    return NOT_CONSULTED;
  }
  if (!judgeMayReceive(env, () => regs.policy.router.source_markers)) return { fact: null, policy, latencyMs: null, span: null };
  try {
    const where = env.cwd === "" ? null : editContext(env.cwd, ctx);
    if (where === null || where.status !== "active" || where.gitDir === null) {
      throw new KernelError("judge: no git dir to keep the breaker state in");
    }
    const breaker = firstReadRecorder(
      createFileBreakerStore({ gitDir: where.gitDir, stateFile: policy.breaker.state_file, failureThreshold: regs.policy.breaker.failure_threshold })
    );
    const questions = buildQuestionSet({
      intents: regs.intents.intents.map((row) => ({ id: row.id, active: row.active })),
      rules: regs.decisionRules.rules.map((rule) => ({ id: rule.id, judge_fact: rule.judge_fact }))
    });
    const input = { text: env.prompt, source: "user", repository: repositoryFacts2(where.worktree.repo), session: { last_intent: null } };
    const transport = typeof globalThis.fetch === "function" ? globalThis.fetch : void 0;
    const started = ctx.now();
    const pending = judge(input, { fetch: transport, now: ctx.now, env: ctx.io.env, breaker: breaker.store, policy, questions });
    const outcome = await withinDeadline(pending, policy.timeout_ms + JUDGE_GUARD_SLACK_MS);
    const latencyMs = Math.max(0, ctx.now() - started);
    if (outcome.kind === "skipped") return { fact: factOf(outcome), policy, latencyMs: null, span: null };
    return { fact: factOf(outcome), policy, latencyMs, span: judgeSpanOutcome(outcome, policy, breaker.probe()) };
  } catch {
    return { fact: null, policy, latencyMs: null, span: null };
  }
}
function judgeEventData(consultation) {
  const { fact, policy, latencyMs } = consultation;
  if (policy === null) return null;
  const data = { source: fact === null ? "fallback" : fact.source, mode: policy.mode };
  data.model = fact !== null && fact.source === "jev" ? fact.model : policy.model;
  if (fact === null) data.skipped_reason = "no-judge-fact";
  else if (fact.source === "fallback") data.skipped_reason = fact.reason;
  if (latencyMs !== null) data.latency_bucket = latencyBucket(latencyMs);
  return data;
}
function judgeMayFold(ctx, regs) {
  try {
    const policy = regs.policy.judge;
    return policy.mode === "authoritative" && ctx.io.env[policy.enabled_env] === policy.enabled_value;
  } catch {
    return false;
  }
}
function folds(consultation) {
  const { fact, policy } = consultation;
  return fact !== null && fact.source === "jev" && policy !== null && policy.mode === "authoritative";
}
function factOf(outcome) {
  if (outcome.kind === "facts") return outcome.facts;
  if (outcome.reason === NOT_USER_INPUT) return null;
  return { source: "fallback", reason: outcome.reason };
}
function judgeSpanOutcome(outcome, policy, probe) {
  const base = { provider: policy.provider, model: policy.model };
  if (outcome.kind !== "facts") return { status: "FAILED", fields: { ...base, note: `judge=${outcome.reason}` } };
  const { facts } = outcome;
  const fields = { ...base, model: facts.model, route: facts.primary.id };
  if (outcome.tokens_in !== null) fields.tokens_in = outcome.tokens_in;
  const late = facts.latency_ms > policy.timeout_ms;
  return { status: probe || late ? "DEGRADED" : "OK", fields };
}
function withinDeadline(pending, ms) {
  let timer;
  const guard = new Promise((settle) => {
    timer = setTimeout(() => settle(GUARD_TIMEOUT), ms);
  });
  return Promise.race([pending, guard]).finally(() => clearTimeout(timer));
}
function firstReadRecorder(inner) {
  let first = null;
  const store = {
    read: () => {
      const state = inner.read();
      if (first === null) first = state;
      return state;
    },
    recordFailure: (now) => inner.recordFailure(now),
    recordSuccess: () => inner.recordSuccess()
  };
  return { store, probe: () => first !== null && first.opened_at !== null };
}
function repositoryFacts2(repo) {
  if (repo === "") return { declared_stack: [], active_spec: false, open_change_record: false };
  const records = activeChangeRecords((0, import_node_path16.join)(repo, ".engineos", "changes"));
  return {
    declared_stack: declaredStack(repo),
    active_spec: records.some((text2) => SPEC_LINK.test(text2)),
    open_change_record: records.length > 0
  };
}
function declaredStack(repo) {
  try {
    const config = loadProjectConfig(repo);
    if (config === null) return [];
    const ids = config.stack.packages.flatMap((pkg) => pkg.framework === null ? [pkg.language] : [pkg.language, pkg.framework]);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}
function activeChangeRecords(dir) {
  let entries;
  try {
    entries = (0, import_node_fs18.readdirSync)(dir);
  } catch {
    return [];
  }
  const active = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    try {
      const text2 = (0, import_node_fs18.readFileSync)((0, import_node_path16.join)(dir, entry), "utf8");
      if (ACTIVE_RECORD2.test(text2)) active.push(text2);
    } catch {
      continue;
    }
  }
  return active;
}
function latencyBucket(ms) {
  var _a;
  return ((_a = LATENCY_BUCKETS.find(([bound]) => ms < bound)) == null ? void 0 : _a[1]) ?? "over";
}

// src/hooks/telemetry.ts
var import_node_crypto3 = require("node:crypto");
var import_node_fs22 = require("node:fs");
var import_node_path20 = require("node:path");

// src/hooks/span-writer.ts
var import_node_fs21 = require("node:fs");
var import_node_path19 = require("node:path");

// src/journal/exec-journal.ts
var import_node_fs19 = require("node:fs");
var import_node_path17 = require("node:path");

// src/registry/policy-exec-journal.ts
var SPAN_STATUSES = ["OK", "BLOCKED", "FAILED", "DEGRADED"];
var MAX_VALUE_LENGTH_FALLBACK = 256;
function loadExecJournalPolicy(root) {
  const r = strictReader("policy.json");
  const raw = loadRegistry(root, "policy.json");
  const telemetry = r.requireRecord(isRecord(raw) ? raw["telemetry"] : void 0, ".telemetry");
  const block2 = r.requireRecord(telemetry["exec_journal"], ".telemetry.exec_journal");
  return {
    home: r.requireString(block2["home"], ".telemetry.exec_journal.home"),
    // bash read this through `// empty` and then a digits-only case statement,
    // so an absent, non-numeric or zero value reached the same fallback.
    max_value_length: positiveInteger3(block2["max_value_length"]),
    span_kinds: r.requireStrings(block2["span_kinds"], ".telemetry.exec_journal.span_kinds"),
    statuses: r.requireStrings(block2["statuses"], ".telemetry.exec_journal.statuses")
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
function parseAppendArgs(argv) {
  const [file, ...rest] = argv;
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
function appendLine(root, file, argv, now, regs) {
  requireModelsRegistry(root);
  const { fields } = parseAppendArgs(argv);
  const maxLength2 = regs.execJournal.max_value_length;
  for (const { spec, text: text2 } of setInArgvOrder(fields)) {
    if (text2.length > maxLength2) {
      throw new JournalError(`${spec.flag} must be at most ${maxLength2} characters, got ${text2.length}`);
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
  const path = (0, import_node_path17.join)(root, "registries", "models.json");
  if (!(0, import_node_fs19.existsSync)(path)) throw new JournalError(`no models registry at ${path}`);
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
    (0, import_node_fs19.appendFileSync)(file, `${encode(row)}
`);
  } catch {
    throw new JournalError(`cannot append to ${file}`);
  }
}
function encode(row) {
  return JSON.stringify(row).replace(/\u007f/g, "\\u007f");
}

// src/journal/telemetry.ts
var import_node_fs20 = require("node:fs");
var import_node_path18 = require("node:path");
var TelemetryError = class extends Error {
  kind = "telemetry";
};
function requirePolicyPresent(root) {
  if (!(0, import_node_fs20.existsSync)((0, import_node_path18.join)(root, "registries", "policy.json"))) throw new TelemetryError("policy.json missing");
}
function appendEvent(root, file, options, now = utcNow) {
  requirePolicyPresent(root);
  const policy = loadTelemetryPolicy(root);
  const event2 = policy.events.find((row) => row.id === options.event);
  if (event2 === void 0) throw new TelemetryError(`unknown event: ${options.event}`);
  const data = parseData(options.data);
  const pattern = compilePattern(policy.value_pattern);
  if (!dataIsValid(data, event2.keys, pattern)) {
    throw new TelemetryError(`data failed schema/value_pattern check for event ${options.event}: ${options.data}`);
  }
  const ts = options.ts === void 0 || options.ts === "" ? now() : options.ts;
  const line = jqCompact({ ts, session_id: options.session, event: options.event, data });
  try {
    (0, import_node_fs20.appendFileSync)(file, `${line}
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
  const journalFile = (0, import_node_path19.join)(opts.dir, `${name}.exec.jsonl`);
  const eventsFile = (0, import_node_path19.join)(opts.dir, `${name}.jsonl`);
  const markers = (0, import_node_path19.join)(opts.dir, "spans");
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
      (0, import_node_fs21.mkdirSync)(markers, { recursive: true });
      (0, import_node_fs21.writeFileSync)(marker, String(ms));
    },
    closeMarker(id) {
      const marker = markerPath(markers, id);
      if (marker === null) return null;
      const text2 = readMarker(marker);
      if (text2 === null) return null;
      (0, import_node_fs21.rmSync)(marker, { force: true });
      return parseMs(text2);
    }
  };
}
function toArgv(fields) {
  const argv = [];
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === void 0) continue;
    argv.push(spec.flag, String(value));
  }
  return argv;
}
function readMarker(path) {
  try {
    return (0, import_node_fs21.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
}
function markerPath(dir, id) {
  const name = hookPathSlug(id);
  return name === null ? null : (0, import_node_path19.join)(dir, name);
}

// src/hooks/telemetry.ts
function telemetrySink(env, ctx, opts) {
  if (ctx.io.env["ENGINEOS_TELEMETRY"] === "0") return null;
  if (opts.bypassed) return null;
  if (env.cwd === "") return null;
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !(0, import_node_fs22.existsSync)((0, import_node_path20.join)(project, ".engineos"))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === "") return null;
  const dir = (0, import_node_path20.join)(git, "engineos-telemetry");
  try {
    (0, import_node_fs22.mkdirSync)(dir, { recursive: true });
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
function withSpan(sink, facts, fn) {
  if (sink === null) return fn().result;
  const start = sink.now();
  const outcome = fn();
  const duration = clampMs(sink.now() - start);
  const merged = {
    ...facts,
    status: outcome.status,
    fields: { ...facts.fields ?? {}, ...outcome.fields ?? {} }
  };
  writeSpan(sink, merged, duration, null);
  return outcome.result;
}
function recordSpan(sink, facts, durationMs) {
  if (sink === null) return;
  writeSpan(sink, facts, clampMs(durationMs), null);
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
function event(sink, id, data) {
  if (sink === null) return;
  attempt(() => {
    sink.writer.appendEvent(id, data);
  });
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

// src/hooks/prompt-advisor.ts
var BYPASS_NOTICE = "[engineos] BYPASS ACTIVE \u2014 routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness's own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run `/engineos:bypass off` to restore EngineOS.";
var ROUTER_SPAN = { kind: "router", capability: "route", modelTier: "cheap" };
var JUDGE_SPAN = { kind: "model", capability: "route", modelTier: "cheap" };
var NO_ROUTE = "none";
var REFUSED_JUDGE_FACT = { source: "fallback", reason: "invalid-response" };
async function run5(env, ctx) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return context("UserPromptSubmit", BYPASS_NOTICE);
  if (env.prompt === "") return silent;
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const kernel = { root: ctx.root, registries: lazyRegistries(ctx.root) };
  if (!typedByUser(env, kernel.registries)) {
    event(sink, "route", { skipped: NOT_USER_INPUT });
    return silent;
  }
  const { consultation, tiebreak: tiebreak2 } = await consultSemantics(env, ctx, kernel);
  if (consultation.span !== null && consultation.latencyMs !== null) {
    recordSpan(sink, { ...JUDGE_SPAN, ...consultation.span }, consultation.latencyMs);
  }
  const resolved = resolveTask(env.prompt, [consultation.fact, tiebreak2], kernel, sink);
  if (resolved === null) return silent;
  const { task } = resolved;
  const judged = { ...consultation, fact: resolved.fact };
  writeEvents(sink, task);
  const judgeData = judgeEventData(judged);
  if (judgeData !== null) event(sink, "judge", judgeData);
  const notes = notesFor(task, judged, kernel.registries);
  if (notes === null) return silent;
  if (promptNeedsStackQuestion(task.contract.intents, env.cwd, ctx.spawn)) notes.push(STACK_QUESTION_NOTE);
  if (notes.length === 0) return silent;
  return context("UserPromptSubmit", notes.join("\n"));
}
function typedByUser(env, regs) {
  try {
    return classifyPromptSource(env, regs.policy.router.source_markers) === "user";
  } catch {
    return true;
  }
}
function resolveTask(prompt, declared4, kernel, sink) {
  for (const [fact, scores] of attemptsFor(declared4)) {
    try {
      return withSpan(sink, ROUTER_SPAN, () => {
        const facts = { prompt, taskContract: true };
        if (fact !== null) facts.judge = fact;
        if (scores !== null) facts.tiebreak = scores;
        const task = narrow(resolve2(facts, kernel));
        return { result: { task, fact }, status: "OK", fields: spanFields(task) };
      });
    } catch {
      continue;
    }
  }
  return null;
}
function attemptsFor([fact, scores]) {
  const judgeFacts2 = fact === null || fact.source === "fallback" ? [fact] : [fact, REFUSED_JUDGE_FACT];
  const tiebreaks = scores === null ? [null] : [scores, null];
  return judgeFacts2.flatMap((judgeFact2) => tiebreaks.map((tiebreak2) => [judgeFact2, tiebreak2]));
}
function narrow(answer) {
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (contract === void 0 || decisions === void 0 || route === void 0 || !("escalate" in route)) {
    throw new KernelError("resolve-task: the kernel answered no task contract");
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null };
}
function notesFor(task, consultation, regs) {
  try {
    const notes = guidanceNotes(task, guidanceLookups(regs));
    const { policy } = consultation;
    if (policy === null) return notes;
    const ruleOf = {};
    for (const rule of regs.decisionRules.rules) if (rule.judge_fact !== null) ruleOf[rule.judge_fact] = rule.id;
    notes.push(
      ...judgeNote({
        mode: policy.mode,
        fact: consultation.fact,
        intentThreshold: policy.thresholds.intent_default,
        ruleThreshold: policy.thresholds.rule_default,
        ruleOf,
        riskProposal: task.contract.risk_proposal
      })
    );
    return notes;
  } catch {
    return null;
  }
}
function spanFields(task) {
  const first = task.route.intents[0] ?? task.contract.intents[0] ?? NO_ROUTE;
  const route = hookSlug(first);
  const floor = task.contract.risk_floor;
  return {
    route: route === "" ? NO_ROUTE : route,
    // Allowlisted rather than trusted: `risk` is an enum field of the journal,
    // and a value outside the three tiers would be rejected on append — losing
    // the whole span rather than one field.
    risk: floor !== null && isRiskTier(floor) ? floor : "low"
  };
}
function writeEvents(sink, task) {
  const routeData = {
    escalate: task.route.escalate,
    reasons: task.route.reasons,
    intents: task.route.intents,
    suppressed: task.route.suppressed.map((entry) => entry.id),
    agents: task.route.agents
  };
  event(sink, "route", routeData);
  if (task.decisions.matches.length > 0) {
    event(sink, "decision-rules", {
      rules: task.decisions.matches.map((match) => match.id),
      any_high: task.decisions.any_high
    });
  }
  const { hitl } = task;
  if (hitl !== null && hitl.required) {
    event(sink, "hitl", { required: hitl.required, reasons: hitl.reasons });
  }
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
function run6(env, ctx) {
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
function run7(env, ctx) {
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
  const response2 = payload["tool_response"];
  const flag2 = isRecord(response2) ? response2["is_error"] : null;
  if (alternative(flag2, payload["is_error"]) === true) return "FAILED";
  if (isRecord(response2)) {
    const status = response2["status"];
    return typeof status === "string" ? allowlisted(status) : "OK";
  }
  const first = /^(OK|BLOCKED|FAILED|DEGRADED)\b/.exec(typeof response2 === "string" ? response2 : "");
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

// src/hooks/stop-verify.ts
var import_node_path24 = require("node:path");
var import_node_fs26 = require("node:fs");

// src/hooks/classify-failure.ts
var NODE_FLOOR = 18;
function classify2(evidence, infraPatterns) {
  switch (evidence.kind) {
    case "environment":
      return evidence.nodeMajor < NODE_FLOOR ? { situation: "infra", reason: "node-too-old" } : null;
    case "runner":
      return evidence.found ? null : { situation: "infra", reason: "runner-missing" };
    case "run": {
      if (evidence.timedOut) return { situation: "infra", reason: "timeout" };
      if (evidence.code === 0) return null;
      const row = (infraPatterns ?? registryPatterns()).find((entry) => entry.runner === evidence.runner);
      if (row !== void 0 && infraRegExp(row.pattern, evidence.target).test(evidence.output)) {
        return { situation: "infra", reason: row.reason };
      }
      return { situation: "red" };
    }
  }
}
var loadedPatterns = /* @__PURE__ */ new Map();
function registryPatterns() {
  const root = resolveRoot(process.env);
  const cached = loadedPatterns.get(root);
  if (cached !== void 0) return cached;
  const patterns = loadPolicy(root).repair.infra_patterns;
  loadedPatterns.set(root, patterns);
  return patterns;
}
function infraRegExp(pattern, target2) {
  return new RegExp(pattern.split("<t>").join(escapeRegExp(target2)), "i");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/hooks/runner.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs23 = require("node:fs");
var import_node_path21 = require("node:path");
var defaultSpawn = (command, args, options) => (0, import_node_child_process2.spawnSync)(command, args, options);
var PYTHON_UNAVAILABLE_REASON = "Python verification is deprecated and unsupported; automatic verification supports the JavaScript ecosystem only";
var MODERN_NODE_MAJOR = 20;
function runnerSelect(root, exists = defaultExists) {
  const kind = exists((0, import_node_path21.join)(root, "nx.json")) ? "nx" : "npm-family";
  if (exists((0, import_node_path21.join)(root, "pnpm-lock.yaml"))) return { kind, run: "pnpm run", exec: "pnpm exec" };
  if (exists((0, import_node_path21.join)(root, "yarn.lock"))) return { kind, run: "yarn run", exec: "yarn" };
  return { kind, run: "npm run", exec: "npx --no-install" };
}
function runnerSelectFor(pkgDir, root, config, exists = defaultExists, _spawn = defaultSpawn) {
  if (exists((0, import_node_path21.join)(pkgDir, "package.json")) || exists((0, import_node_path21.join)(pkgDir, "project.json"))) return runnerSelect(root, exists);
  const declared4 = config == null ? void 0 : config.stack.packages.find((pkg) => pkg.dir === ((0, import_node_path21.relative)(root, pkgDir).split(import_node_path21.sep).join("/") || "."));
  if ((declared4 == null ? void 0 : declared4.language) === "python" || isPythonPackage(pkgDir, root, exists)) {
    return { kind: "python-unavailable", reason: PYTHON_UNAVAILABLE_REASON };
  }
  return runnerSelect(root, exists);
}
function isPythonPackage(pkgDir, root, exists = defaultExists) {
  if (exists((0, import_node_path21.join)(pkgDir, "pyproject.toml"))) return true;
  if (!exists((0, import_node_path21.join)(pkgDir, "requirements.txt"))) return false;
  let dir = pkgDir;
  while ((0, import_node_path21.relative)(root, dir) !== "" && isUnder(root, dir)) {
    dir = (0, import_node_path21.dirname)(dir);
    if (exists((0, import_node_path21.join)(dir, "pyproject.toml"))) return false;
  }
  return true;
}
function isUnder(ceiling, path) {
  const inside = (0, import_node_path21.relative)(ceiling, path);
  if (inside === "") return true;
  if ((0, import_node_path21.isAbsolute)(inside)) return false;
  return inside !== ".." && !inside.startsWith(`..${import_node_path21.sep}`);
}
function runnerHandle(sel, pkgDir, readFile = defaultReadFile) {
  if (sel.kind !== "nx") return pkgDir;
  const project = readName(readFile((0, import_node_path21.join)(pkgDir, "project.json")));
  if (project !== null) return project;
  const pkg = readName(readFile((0, import_node_path21.join)(pkgDir, "package.json")));
  return pkg === null ? null : pkg.replace(/^@[^/]*\//, "");
}
function runnerHasTarget(sel, handle2, target2, readFile = defaultReadFile, spawn = defaultSpawn, cwd = process.cwd()) {
  if (sel.kind === "python") {
    return false;
  }
  if (sel.kind === "nx") {
    const argv = [...words(sel.exec), "nx", "show", "project", handle2, "--json"];
    const shown = spawn(argv[0] ?? "", argv.slice(1), { cwd, encoding: "utf8" });
    if (shown.status !== 0) return false;
    return declared3(parseJson(shown.stdout), "targets", target2);
  }
  return declared3(parseJson(readFile((0, import_node_path21.join)(handle2, "package.json"))), "scripts", target2);
}
function runnerRun(sel, handle2, target2, timeoutSeconds, env, spawn = defaultSpawn, cwd = process.cwd()) {
  if (sel.kind === "python") {
    return { code: 1, output: PYTHON_UNAVAILABLE_REASON, timedOut: false };
  }
  const argv = sel.kind === "nx" ? [...words(sel.exec), "nx", "run", `${handle2}:${target2}`] : [...words(sel.run), "-s", target2];
  const runCwd = sel.kind === "nx" ? cwd : handle2;
  const result = spawn(argv[0] ?? "", argv.slice(1), {
    cwd: runCwd,
    env,
    encoding: "utf8",
    timeout: timeoutSeconds * 1e3
  });
  const timedOut = errorCodeOf(result.error) === "ETIMEDOUT" || result.signal === "SIGTERM";
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const code = typeof result.status === "number" ? result.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}
function runnerEnv(env, nodeMajorOnPath, exists = defaultExists, readLink = defaultReadFile, listDir = defaultListDir) {
  if (nodeMajorOnPath >= MODERN_NODE_MAJOR) return env;
  const home = env["HOME"];
  const nvmDir = env["NVM_DIR"] ?? (home === void 0 || home === "" ? null : (0, import_node_path21.join)(home, ".nvm"));
  if (nvmDir === null || nvmDir === "") return env;
  const alias = (0, import_node_path21.join)(nvmDir, "alias", "default");
  if (!exists(alias)) return env;
  const wanted = (readLink(alias) ?? "").trim();
  if (wanted === "") return env;
  const versionsDir = (0, import_node_path21.join)(nvmDir, "versions", "node");
  let bin = null;
  for (const name of listDir(versionsDir).sort()) {
    if (!name.startsWith(`v${wanted}`)) continue;
    if (majorOf(name) < MODERN_NODE_MAJOR) continue;
    const candidate = (0, import_node_path21.join)(versionsDir, name, "bin");
    if (exists((0, import_node_path21.join)(candidate, "node"))) bin = candidate;
  }
  if (bin === null) return env;
  const current = env["PATH"] ?? "";
  return { ...env, PATH: current === "" ? bin : `${bin}${import_node_path21.delimiter}${current}` };
}
function declared3(doc, field, name) {
  if (!isRecord(doc)) return false;
  const table = doc[field];
  if (!isRecord(table)) return false;
  const value = table[name];
  return value !== void 0 && value !== null && value !== false;
}
function errorCodeOf(error) {
  const candidate = error;
  if (!isRecord(candidate)) return null;
  const code = candidate["code"];
  return typeof code === "string" ? code : null;
}
function readName(text2) {
  const doc = parseJson(text2);
  if (!isRecord(doc)) return null;
  const name = doc["name"];
  return typeof name === "string" && name !== "" ? name : null;
}
function parseJson(text2) {
  if (text2 === null || text2 === void 0 || text2 === "") return null;
  try {
    return JSON.parse(text2);
  } catch {
    return null;
  }
}
function words(command) {
  return command.split(" ").filter((part) => part !== "");
}
function majorOf(versionDir) {
  const parsed = Number.parseInt(versionDir.replace(/^v/, ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function defaultExists(p) {
  return (0, import_node_fs23.existsSync)(p);
}
function defaultReadFile(p) {
  try {
    return (0, import_node_fs23.readFileSync)(p, "utf8");
  } catch {
    return null;
  }
}
function defaultListDir(p) {
  try {
    return (0, import_node_fs23.readdirSync)(p);
  } catch {
    return [];
  }
}

// src/hooks/runner-python.ts
var import_node_fs24 = require("node:fs");
var import_node_path22 = require("node:path");
var PYTHON_TOOLS = ["ruff", "pyright", "pytest"];
var PROBE_TIMEOUT_SECONDS = 15;
var PYPROJECT = "pyproject.toml";
function isPythonTool(name) {
  return PYTHON_TOOLS.some((tool) => tool === name);
}
function unpinnedTools(pkgDir, readFile = defaultReadFile2) {
  const doc = readToml(readFile((0, import_node_path22.join)(pkgDir, PYPROJECT)) ?? "");
  const specs = [
    ...doc.strings.get("project.optional-dependencies.dev") ?? [],
    ...doc.strings.get("dependency-groups.dev") ?? []
  ];
  const unpinned = /* @__PURE__ */ new Set();
  for (const spec of specs) {
    const requirement = parseRequirement(spec);
    if (requirement === null || !isPythonTool(requirement.name)) continue;
    if (!EXACT_PIN.test(requirement.specifier)) unpinned.add(requirement.name);
  }
  return PYTHON_TOOLS.filter((tool) => unpinned.has(tool));
}
var EXACT_PIN = /^==\s*\d+(?:\.\d+)*$/;
function parseRequirement(spec) {
  const head = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*([^;]*?)\s*(?:;.*)?$/.exec(spec);
  if (head === null) return null;
  const name = (head[1] ?? "").toLowerCase().replace(/[._]/g, "-");
  return { name, specifier: head[2] ?? "" };
}
function readToml(text2) {
  const entries = /* @__PURE__ */ new Set();
  const strings = /* @__PURE__ */ new Map();
  let table = "";
  let pending = null;
  for (const raw of text2.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (pending !== null) {
      pending.value += ` ${line}`;
      if (balanced(pending.value)) {
        strings.set(pending.key, quotedStrings(pending.value));
        pending = null;
      }
      continue;
    }
    if (line === "") continue;
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header !== null) {
      table = dottedKey(header[1] ?? "");
      entries.add(table);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = dottedKey(line.slice(0, eq));
    const full = table === "" ? key : `${table}.${key}`;
    entries.add(full);
    const value = line.slice(eq + 1).trim();
    if (balanced(value)) strings.set(full, quotedStrings(value));
    else pending = { key: full, value };
  }
  return { entries, strings };
}
function dottedKey(text2) {
  return text2.split(".").map((part) => part.trim().replace(/^["']|["']$/g, "")).join(".");
}
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === "\\" && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}
function balanced(value) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote !== null) {
      if (ch === "\\" && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") depth -= 1;
  }
  return depth <= 0;
}
function quotedStrings(value) {
  const out = [];
  for (const match of value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) {
    out.push(match[1] ?? match[2] ?? "");
  }
  return out;
}
function defaultReadFile2(p) {
  try {
    return (0, import_node_fs24.readFileSync)(p, "utf8");
  } catch {
    return null;
  }
}

// src/hooks/verify-targets.ts
var import_node_fs25 = require("node:fs");
var import_node_path23 = require("node:path");
var NODE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"];
var PYTHON_EXTENSIONS = ["py", "pyi"];
var VERIFY_EXTENSIONS = [...NODE_EXTENSIONS, ...PYTHON_EXTENSIONS];
var NODE_PACKAGE_MARKERS = ["package.json", "project.json"];
var PACKAGE_MARKERS = [...NODE_PACKAGE_MARKERS, ...PYTHON_MARKERS];
var FOREIGN_SEGMENTS = ["node_modules", ".venv", "site-packages", "__pycache__"];
var SUMMARY_LINES = 80;
function hasVerifyExtension(file) {
  return VERIFY_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}
function hasPythonExtension(file) {
  return PYTHON_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}
function projectConfig(root) {
  try {
    return loadProjectConfig(root);
  } catch {
    return null;
  }
}
function findUpAny(start, names, stop) {
  const from = (0, import_node_path23.resolve)(start);
  const ceiling = stop === void 0 ? void 0 : (0, import_node_path23.resolve)(stop);
  if (ceiling !== void 0 && !isWithin(ceiling, from)) return null;
  let dir = from;
  for (; ; ) {
    for (const name of names) {
      if ((0, import_node_fs25.existsSync)((0, import_node_path23.join)(dir, name))) return dir;
    }
    if (ceiling !== void 0 && (0, import_node_path23.relative)(ceiling, dir) === "") return null;
    const parent = (0, import_node_path23.dirname)(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function isWithin(ceiling, path) {
  const inside = (0, import_node_path23.relative)(ceiling, path);
  if (inside === "") return true;
  if ((0, import_node_path23.isAbsolute)(inside)) return false;
  return inside !== ".." && !inside.startsWith(`..${import_node_path23.sep}`);
}
function startDir(file) {
  const dir = (0, import_node_path23.dirname)(file);
  try {
    return (0, import_node_fs25.realpathSync)(dir);
  } catch {
    return (0, import_node_path23.resolve)(dir);
  }
}
function containedIn(root, candidate) {
  let rootReal;
  let candidateReal;
  try {
    rootReal = (0, import_node_fs25.realpathSync)(root);
    candidateReal = (0, import_node_fs25.realpathSync)(candidate);
  } catch {
    return false;
  }
  if (!isWithin(rootReal, candidateReal)) return false;
  return !(0, import_node_path23.relative)(rootReal, candidateReal).split(import_node_path23.sep).some((segment) => FOREIGN_SEGMENTS.includes(segment));
}
function packageOwner(start, stop) {
  const nodeOwner = findUpAny(start, NODE_PACKAGE_MARKERS, stop);
  if (nodeOwner !== null) return nodeOwner;
  const owner = findUpAny(start, PYTHON_MARKERS, stop);
  if (owner === null || !requirementsOnly(owner)) return owner;
  return findUpAny((0, import_node_path23.dirname)(owner), ["pyproject.toml"], stop) ?? owner;
}
function requirementsOnly(dir) {
  if (!(0, import_node_fs25.existsSync)((0, import_node_path23.join)(dir, "requirements.txt"))) return false;
  return !PACKAGE_MARKERS.some((marker) => marker !== "requirements.txt" && (0, import_node_fs25.existsSync)((0, import_node_path23.join)(dir, marker)));
}
function isDirectory5(path) {
  try {
    return (0, import_node_fs25.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile4(path) {
  try {
    return (0, import_node_fs25.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function verifyEnvironment(env, version = process.versions.node) {
  const onPath = majorOf2(version);
  const fixed = runnerEnv(env, onPath);
  if (fixed === env) return { env, nodeMajor: onPath };
  const prepended = (fixed["PATH"] ?? "").split(import_node_path23.delimiter)[0] ?? "";
  const found = /\/v(\d+)[^/]*\/bin$/.exec(prepended);
  const rescued = found === null ? Number.NaN : Number.parseInt(found[1] ?? "", 10);
  return { env: fixed, nodeMajor: Number.isNaN(rescued) ? onPath : rescued };
}
function runnerProbe(sel) {
  if (sel.kind === "python") return [];
  const command = (sel.kind === "nx" ? sel.exec : sel.run).split(" ").find((part) => part !== "");
  return command === void 0 ? [] : [command];
}
function runnerCommand(sel) {
  return runnerProbe(sel)[0] ?? "";
}
function runnerFound(sel, env, spawn, cwd) {
  const [command, ...rest] = runnerProbe(sel);
  if (command === void 0 || command === "") return false;
  return execRun(spawn, command, [...rest, "--version"], cwd, env, PROBE_TIMEOUT_SECONDS).code === 0;
}
function execRun(spawn, command, args, cwd, env, timeoutSeconds) {
  const result = spawn(command, args, { cwd, env, encoding: "utf8", timeout: timeoutSeconds * 1e3 });
  const timedOut = errorCodeOf2(result.error) === "ETIMEDOUT" || result.signal === "SIGTERM";
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const code = typeof result.status === "number" ? result.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}
function failureBlock(target2, subject, output) {
  return `--- ${target2} failed (${subject}) ---
${output.replace(/\n+$/, "")}`;
}
function firstLines(text2, limit) {
  return text2.split("\n").slice(0, limit).join("\n");
}
function majorOf2(version) {
  const parsed = Number.parseInt(version.replace(/^v/, ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function errorCodeOf2(error) {
  if (error === void 0) return null;
  const candidate = error;
  if (!isRecord(candidate)) return null;
  const code = candidate["code"];
  return typeof code === "string" ? code : null;
}

// src/hooks/stop-verify.ts
var EDIT_TOOLS = ["Edit", "Write", "NotebookEdit"];
var DEFAULT_TARGETS = ["lint", "typecheck"];
var TEST_TARGET = "test";
var FIRST_ATTEMPT = 1;
var VERIFICATION_SPAN = { kind: "verification", capability: "validate", modelTier: "cheap" };
function run8(env, ctx) {
  return verify(env, ctx, ctx.spawn);
}
function verify(env, ctx, spawn, nodeVersion = process.versions.node) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.stopHookActive) return silent;
  if (!isFile4(env.transcriptPath)) return silent;
  if (env.cwd === "") return silent;
  const root = repoRoot(env.cwd, ctx.spawn);
  if (root === null) return silent;
  if (!isDirectory5((0, import_node_path24.join)(root, ".engineos"))) return silent;
  const files = changedFiles(env.transcriptPath);
  if (files.length === 0) return silent;
  const skippedFiles = files.filter(hasPythonExtension).map((file) => `[engineos] skipped ${file}: ${PYTHON_UNAVAILABLE_REASON}`);
  const packages = packageDirs(files.filter((file) => !hasPythonExtension(file)), root);
  if (packages.length === 0) return skippedFiles.length === 0 ? silent : message(skippedFiles.join("\n"));
  const targets = DEFAULT_TARGETS;
  const environment = verifyEnvironment(ctx.io.env, nodeVersion);
  const plan = planRuns(packages, targets, root, projectConfig(root), environment, spawn);
  plan.lines.unshift(...skippedFiles);
  if (plan.runs.length === 0) return plan.lines.length === 0 ? silent : message(plan.lines.join("\n"));
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const ladder = withSpan(sink, VERIFICATION_SPAN, () => {
    const result = runLadder(plan.runs, targets, environment.env, spawn, root, lazyRegistries(ctx.root));
    return { result, status: ladderStatus(result) };
  });
  event(sink, "verify", verifyEvent(root, plan.runs, ladder));
  const testNotice = ctx.io.env["ENGINEOS_VERIFY_TESTS"] === "1" ? ["[engineos] ENGINEOS_VERIFY_TESTS is deprecated and ignored: tests require explicit user approval and a separate final command after integration."] : [];
  const lines = [...testNotice, ...plan.lines, ...ladder.infra.map(infraLineOf), ...ladder.advisories];
  if (ladder.failures.length > 0) {
    const reason = blockReason(ctx.root, ladder.failures);
    return block(lines.length === 0 ? reason : `${reason}
${lines.join("\n")}`);
  }
  return lines.length === 0 ? silent : message(lines.join("\n"));
}
function budgetFor(target2, env) {
  const override = Number.parseInt(env["ENGINEOS_VERIFY_BUDGET_S"] ?? "", 10);
  if (Number.isInteger(override) && override > 0) return override;
  return target2 === TEST_TARGET ? 180 : 90;
}
function changedFiles(path) {
  let text2;
  try {
    text2 = (0, import_node_fs26.readFileSync)(path, "utf8");
  } catch {
    return [];
  }
  const files = /* @__PURE__ */ new Set();
  for (const line of text2.split("\n")) {
    if (line === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || parsed["type"] !== "assistant") continue;
    const messageField = parsed["message"];
    if (!isRecord(messageField)) continue;
    const content = messageField["content"];
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (!isRecord(entry) || entry["type"] !== "tool_use") continue;
      const name = entry["name"];
      if (typeof name !== "string" || !EDIT_TOOLS.includes(name)) continue;
      const file = filePathOf(entry);
      if (file !== "" && hasVerifyExtension(file)) files.add(file);
    }
  }
  return [...files].sort();
}
function filePathOf(entry) {
  const input = entry["input"];
  const primary = isRecord(input) ? input["file_path"] : void 0;
  if (typeof primary === "string") return primary;
  const legacy = entry["tool_input"];
  const fallback = isRecord(legacy) ? legacy["file_path"] : void 0;
  return typeof fallback === "string" ? fallback : "";
}
function packageDirs(files, root) {
  let stopReal;
  try {
    stopReal = (0, import_node_fs26.realpathSync)(root);
  } catch {
    return [];
  }
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const owner = packageOwner(startDir(file), stopReal);
    if (owner === null) continue;
    if (containedIn(stopReal, owner)) dirs.add(owner);
  }
  return [...dirs].sort();
}
function planRuns(packages, targets, root, config, environment, spawn) {
  const runs = [];
  const lines = [];
  const tooOld = classify2({ kind: "environment", nodeMajor: environment.nodeMajor });
  let nodeAnnounced = false;
  const probed = /* @__PURE__ */ new Map();
  for (const packageDir of packages) {
    for (const selection of selectionsFor(packageDir, root, config, spawn)) {
      if (selection.kind === "python-unavailable") {
        lines.push(`[engineos] stop-verify skipped for ${relativeToRoot(root, packageDir)}: ${selection.reason}`);
        continue;
      }
      if (selection.kind !== "python" && tooOld !== null && tooOld.situation === "infra") {
        if (!nodeAnnounced) lines.push(infraLine(tooOld.reason, targets, `node ${environment.nodeMajor} cannot start the toolchain`));
        nodeAnnounced = true;
        continue;
      }
      const key = runnerProbe(selection).join(" ");
      let found = probed.get(key);
      if (found === void 0) {
        found = runnerFound(selection, environment.env, spawn, root);
        probed.set(key, found);
        const missing = classify2({ kind: "runner", found });
        if (missing !== null && missing.situation === "infra") lines.push(infraLine(missing.reason, targets, missingSubject(selection)));
      }
      if (found) runs.push({ packageDir, selection });
    }
  }
  return { runs, lines };
}
function selectionsFor(packageDir, root, config, spawn) {
  const primary = runnerSelectFor(packageDir, root, config, void 0, spawn);
  if (primary.kind !== "python" && primary.kind !== "python-unavailable") return [primary];
  const alsoNode = NODE_PACKAGE_MARKERS.some((marker) => isFile4((0, import_node_path24.join)(packageDir, marker)));
  return alsoNode ? [primary, runnerSelect(root)] : [primary];
}
function missingSubject(selection) {
  if (selection.kind === "python") return `${runnerProbe(selection).join(" ")} did not answer --version (${selection.env.source})`;
  return `${runnerCommand(selection)} is not on PATH`;
}
function runLadder(runs, targets, env, spawn, root, registries) {
  const failures = [];
  const infra = [];
  const advisories = [];
  for (const { packageDir, selection } of runs) {
    if (!isDirectory5(packageDir)) continue;
    if (selection.kind === "python") {
      const unpinned = unpinnedTools(packageDir);
      if (unpinned.length > 0) advisories.push(`[engineos] ${relativeToRoot(root, packageDir)}: ${unpinned.join(", ")} not pinned to exact versions (rules/verification.md)`);
    }
    const handle2 = runnerHandle(selection, packageDir);
    if (handle2 === null) continue;
    for (const target2 of targets) {
      if (!runnerHasTarget(selection, handle2, target2, void 0, spawn, root)) continue;
      const seconds = budgetFor(target2, env);
      const result = runnerRun(selection, handle2, target2, seconds, env, spawn, root);
      const verdict = classify2(
        { kind: "run", runner: selection.kind, target: target2, code: result.code, output: result.output, timedOut: result.timedOut },
        registries.policy.repair.infra_patterns
      );
      if (verdict === null) continue;
      if (verdict.situation === "red") {
        failures.push({ target: target2, handle: handle2, output: result.output });
        continue;
      }
      if (verdict.reason === "timeout") infra.push({ target: target2, handle: handle2, reason: verdict.reason, subject: `${handle2} hit its ${seconds}s budget` });
      if (verdict.reason === "runner-missing") infra.push({ target: target2, handle: handle2, reason: verdict.reason, subject: `${handle2}: ${missingToolLine(result.output)}` });
    }
  }
  return { failures, infra, advisories };
}
function missingToolLine(output) {
  const matched = /^.*(?:No module named|command not found|No such file or directory).*$/im.exec(output);
  return ((matched == null ? void 0 : matched[0]) ?? firstLines(output, 1)).trim();
}
function ladderStatus(ladder) {
  if (ladder.failures.length > 0) return "FAILED";
  return ladder.infra.length > 0 ? "DEGRADED" : "OK";
}
function relativeToRoot(root, dir) {
  if (dir === root) return ".";
  return dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir;
}
function verifyEvent(root, runs, ladder) {
  const entered = [...new Set(runs.map((run11) => relativeToRoot(root, run11.packageDir)))];
  const data = {
    failed: ladder.failures.length > 0,
    targets: entered
  };
  if (ladder.failures.length > 0) {
    data["situation"] = "red";
    return data;
  }
  const first = ladder.infra[0];
  if (first !== void 0) {
    data["situation"] = "infra";
    data["reason"] = first.reason;
  }
  return data;
}
var GATE_PREFIX = "EngineOS gate: verification failed.";
function blockReason(engineosRoot, failures) {
  const summary = firstLines(failures.map((f) => failureBlock(f.target, f.handle, f.output)).join("\n"), SUMMARY_LINES);
  const first = failures[0];
  const ladder = first === void 0 ? "" : repairReason(engineosRoot, first.target);
  return ladder === "" ? `${GATE_PREFIX} ${summary}` : `${GATE_PREFIX} ${ladder} ${summary}`;
}
function repairReason(engineosRoot, check) {
  try {
    return repairSection({ check, attempt: FIRST_ATTEMPT }, lazyRegistries(engineosRoot)).reason;
  } catch {
    return "";
  }
}
function infraLine(reason, targets, subject) {
  return `EngineOS gate: ${targets.join(", ")} skipped \u2014 infra (${reason}): ${subject}. No fix attempt is consumed.`;
}
function infraLineOf(finding) {
  return infraLine(finding.reason, [finding.target], finding.subject);
}

// src/hooks/post-edit-check.ts
var import_node_fs27 = require("node:fs");
var TYPECHECK_TARGET = "typecheck";
var WORKSPACE_MARKERS = ["nx.json", "pnpm-workspace.yaml", ".git"];
var LINTERS = [
  { target: "biome", configs: ["biome.json", "biome.jsonc"] },
  { target: "eslint", configs: [".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", "eslint.config.js", "eslint.config.mjs"] }
];
var TYPECHECK_TIMEOUT_SECONDS = 90;
var LINT_TIMEOUT_SECONDS = 45;
function run9(env, ctx) {
  return verify2(env, ctx, ctx.spawn);
}
function verify2(env, ctx, spawn) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.file === "") return silent;
  if (!hasVerifyExtension(env.file)) return silent;
  if (!isFile4(env.file)) return silent;
  if (hasPythonExtension(env.file)) return message(`[engineos] skipped ${env.file}: ${PYTHON_UNAVAILABLE_REASON}`);
  if (env.cwd === "") return silent;
  let stopReal;
  try {
    stopReal = (0, import_node_fs27.realpathSync)(env.cwd);
  } catch {
    return silent;
  }
  const start = startDir(env.file);
  const packageDir = packageOwner(start, stopReal);
  if (packageDir === null) return silent;
  if (!containedIn(stopReal, packageDir)) return silent;
  const workspace = findUpAny(start, WORKSPACE_MARKERS, stopReal);
  const root = workspace !== null && containedIn(stopReal, workspace) ? workspace : packageDir;
  const environment = verifyEnvironment(ctx.io.env);
  const failures = nodeChecks(env.file, start, packageDir, root, stopReal, environment.env, spawn, lazyRegistries(ctx.root));
  if (failures.length === 0) return silent;
  return fail(firstLines(`
${failures.map((f) => failureBlock(f.target, f.subject, f.output)).join("\n")}`, SUMMARY_LINES));
}
function nodeChecks(file, start, packageDir, root, stop, env, spawn, registries) {
  const selection = runnerSelect(root);
  return [...typecheck(selection, packageDir, root, env, spawn, registries), ...lint(selection, file, start, root, stop, env, spawn, registries)];
}
function typecheck(selection, packageDir, root, env, spawn, registries) {
  return target(selection, packageDir, TYPECHECK_TARGET, TYPECHECK_TIMEOUT_SECONDS, root, env, spawn, registries);
}
function target(selection, packageDir, name, timeoutSeconds, root, env, spawn, registries) {
  const handle2 = runnerHandle(selection, packageDir);
  if (handle2 === null) return [];
  if (!runnerHasTarget(selection, handle2, name, void 0, spawn, root)) return [];
  const result = runnerRun(selection, handle2, name, timeoutSeconds, env, spawn, root);
  return redOf(selection, name, handle2, result, registries);
}
function lint(selection, file, start, root, stop, env, spawn, registries) {
  if (selection.kind === "python") return [];
  for (const linter of LINTERS) {
    const configDir = findUpAny(start, linter.configs, stop);
    if (configDir === null || !containedIn(stop, configDir)) continue;
    const exec = selection.exec.split(" ").filter((part) => part !== "");
    const command = exec[0] ?? "";
    if (command === "") return [];
    const rest = exec.slice(1);
    if (execRun(spawn, command, [...rest, linter.target, "--version"], root, env, PROBE_TIMEOUT_SECONDS).code !== 0) return [];
    const args = linter.target === "biome" ? [...rest, linter.target, "check", file] : [...rest, linter.target, file];
    const result = execRun(spawn, command, args, root, env, LINT_TIMEOUT_SECONDS);
    return redOf(selection, linter.target, file, result, registries);
  }
  return [];
}
function redOf(selection, target2, subject, result, registries) {
  const verdict = classify2(
    { kind: "run", runner: selection.kind, target: target2, code: result.code, output: result.output, timedOut: result.timedOut },
    registries.policy.repair.infra_patterns
  );
  if (verdict === null || verdict.situation !== "red") return [];
  return [{ target: target2, subject, output: result.output }];
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
var run10 = gitWriteGuard;
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

// src/hooks/cli.ts
var HOOKS = {
  "ensure-project-layout": run,
  "mark-unrecorded": run2,
  "record-verify": run3,
  "route-before-change": run4,
  "prompt-advisor": run5,
  "announce-agent-dispatch": run6,
  "announce-agent-return": run7,
  "stop-verify": run8,
  "post-edit-check": run9,
  "git-write-guard": run10
};
var runHook = runHookWith(HOOKS);

// adapters/claude-code-mod/host/presence.ts
var import_node_fs28 = require("node:fs");
var MAX_SOCKET_PATH_BYTES = 100;
var PRIVATE_DIR_MODE = 448;
var PRIVATE_FILE_MODE = 384;
var HostSetupError = class extends Error {
  name = "HostSetupError";
};
function currentUid() {
  if (typeof process.getuid !== "function") throw new HostSetupError("the in-process host needs a POSIX user id (unix sockets only)");
  return process.getuid();
}
function privateDir(env, uid) {
  return runtimeDir(env, uid);
}
function hostPaths(dir, sessionId) {
  const paths = { dir, ...sessionPaths(dir, sessionId) };
  if (Buffer.byteLength(paths.socket) > MAX_SOCKET_PATH_BYTES) {
    throw new HostSetupError(`socket path is ${Buffer.byteLength(paths.socket)} bytes, over ${MAX_SOCKET_PATH_BYTES}; set XDG_RUNTIME_DIR to a shorter private directory`);
  }
  return paths;
}
function ensurePrivateDir(dir, uid) {
  try {
    (0, import_node_fs28.mkdirSync)(dir, { mode: PRIVATE_DIR_MODE });
  } catch (e) {
    if (!isCode(e, "EEXIST")) throw new HostSetupError(`cannot create ${dir}: ${messageOf(e)}`);
  }
  const stat = (0, import_node_fs28.lstatSync)(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new HostSetupError(`${dir} is not a directory`);
  if (stat.uid !== uid) throw new HostSetupError(`${dir} is owned by uid ${stat.uid}, not ${uid}`);
  if ((stat.mode & GROUP_OTHER_BITS) !== 0) throw new HostSetupError(`${dir} is reachable by other users (mode ${(stat.mode & 511).toString(8)})`);
}
function writePresence(path, record2) {
  const temp = `${path}.${record2.pid}.tmp`;
  (0, import_node_fs28.writeFileSync)(temp, `${JSON.stringify(record2)}
`, { mode: PRIVATE_FILE_MODE, flag: "w" });
  (0, import_node_fs28.renameSync)(temp, path);
}
function touchPresence(path, now) {
  (0, import_node_fs28.utimesSync)(path, now, now);
}
function presenceRecord(fields) {
  return { v: PRESENCE_VERSION, ...fields };
}
function readPresence(path) {
  let text2;
  try {
    text2 = (0, import_node_fs28.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
  return parsePresence(text2);
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function claimPaths(paths) {
  const existing = readPresence(paths.presence);
  if (existing !== null && existing.pid !== process.pid && isAlive(existing.pid) && isFresh(paths.presence, Date.now())) {
    throw new HostSetupError(`a host (pid ${existing.pid}) already serves this session`);
  }
  (0, import_node_fs28.rmSync)(paths.socket, { force: true });
  (0, import_node_fs28.rmSync)(paths.presence, { force: true });
}
function releasePaths(paths, pid) {
  const existing = readPresence(paths.presence);
  if (existing !== null && existing.pid !== pid) return;
  (0, import_node_fs28.rmSync)(paths.presence, { force: true });
  (0, import_node_fs28.rmSync)(paths.socket, { force: true });
}
function isFresh(path, now) {
  const stat = (0, import_node_fs28.lstatSync)(path, { throwIfNoEntry: false });
  return stat !== void 0 && Math.abs(now - stat.mtimeMs) <= PRESENCE_STALE_MS;
}
function isCode(e, code) {
  return typeof e === "object" && e !== null && "code" in e && e.code === code;
}
function messageOf(e) {
  return e instanceof Error ? e.message : String(e);
}

// adapters/claude-code-mod/host/protocol.ts
var HOST_PROTOCOL_VERSION = 1;
var READY_PREFIX = "engineos-inprocess ready ";
var MAX_ENVELOPE_BYTES = 1048576;
var ROUTES_PATH = "/v1/routes";
var HOOK_PATH_PREFIX = "/v1/hook/";
var HOST_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
var HOOK_DEADLINE_MS = {
  SessionStart: 1e4,
  UserPromptSubmit: 2e3,
  PreToolUse: 1500,
  PostToolUse: 1500,
  Stop: 1e4
};
var STALL_MARGIN_MS = 5e3;
var HOST_STALL_MS = Math.max(...Object.values(HOOK_DEADLINE_MS)) + STALL_MARGIN_MS;

// adapters/claude-code-mod/host/lifetime.ts
function requestClock() {
  const started = /* @__PURE__ */ new Map();
  let nextId = 0;
  return {
    begin: () => {
      const id = nextId;
      nextId += 1;
      started.set(id, Date.now());
      return () => {
        started.delete(id);
      };
    },
    stalled: (now) => {
      for (const at of started.values()) if (now - at > HOST_STALL_MS) return true;
      return false;
    }
  };
}
function watchLifetime(options) {
  const { server, presence, requests, log: log2 } = options;
  const { paths } = presence;
  const parent = process.ppid;
  const stop = (reason) => {
    log2("info", "stopping", { reason });
    server.close();
    releasePaths(paths, process.pid);
    process.exit(0);
  };
  const poll = setInterval(() => {
    if (process.ppid !== parent) {
      stop("orphaned");
      return;
    }
    if (requests.stalled(Date.now())) {
      stop("stalled-hook");
      return;
    }
    if (presence.published) heartbeat(paths, log2);
  }, PRESENCE_HEARTBEAT_MS);
  poll.unref();
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => stop(signal));
  process.on("exit", () => releasePaths(paths, process.pid));
}
function heartbeat(paths, log2) {
  try {
    touchPresence(paths.presence, /* @__PURE__ */ new Date());
  } catch (e) {
    log2("error", "heartbeat-failed", { reason: e instanceof Error ? e.message : String(e) });
  }
}

// adapters/claude-code-mod/host/routes.ts
var import_node_fs29 = require("node:fs");
var import_node_path25 = require("node:path");
var HOOK_COMMAND = /\bhook\s+([a-z][a-z0-9-]*)\s*$/;
function readRouteTable(root, servable) {
  const parsed = JSON.parse((0, import_node_fs29.readFileSync)((0, import_node_path25.join)(root, "hooks", "hooks.json"), "utf8"));
  const events = isRecord(parsed) && isRecord(parsed["hooks"]) ? parsed["hooks"] : {};
  const routes = [];
  const unserved = [];
  for (const [event2, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    const hostEvent = asHostEvent(event2);
    for (const group of groups) {
      const route = routeOf(hostEvent, event2, group, servable, unserved);
      if (route !== null) routes.push(route);
    }
  }
  return { routes, unserved };
}
function routeOf(hostEvent, event2, group, servable, unserved) {
  if (!isRecord(group) || !Array.isArray(group["hooks"])) return null;
  const matcher = typeof group["matcher"] === "string" ? group["matcher"] : "";
  const hooks = [];
  for (const entry of group["hooks"]) {
    const name = hookName(entry);
    if (name === null) continue;
    if (hostEvent === null || !servable.has(name)) unserved.push(`${event2}:${matcher}:${name}`);
    else hooks.push(name);
  }
  return hostEvent === null || hooks.length === 0 ? null : { event: hostEvent, matcher, hooks };
}
function hookName(entry) {
  var _a;
  if (!isRecord(entry) || entry["type"] !== "command" || typeof entry["command"] !== "string") return null;
  return ((_a = HOOK_COMMAND.exec(entry["command"])) == null ? void 0 : _a[1]) ?? null;
}
function asHostEvent(event2) {
  return HOST_EVENTS.find((known) => known === event2) ?? null;
}

// adapters/claude-code-mod/host/server.ts
var ENABLE_ENV2 = "ENGINEOS_INPROCESS";
var ENABLE_VALUE2 = "1";
var SOCKET_MODE = 384;
var REQUEST_TIMEOUT_MS = 3e4;
var SERVICE = "engineos-inprocess";
function main(argv) {
  if (process.env[ENABLE_ENV2] !== ENABLE_VALUE2) return { kind: "exit", code: 0 };
  const sessionId = argv[0] === "serve" && argv[1] === "--session" ? argv[2] ?? "" : "";
  if (!HOST_SESSION_ID.test(sessionId)) {
    log("error", "bad-arguments", {});
    return { kind: "exit", code: 2 };
  }
  const root = (0, import_node_fs30.realpathSync)(resolveRoot(process.env));
  const table = readRouteTable(root, new Set(Object.keys(HOOKS)));
  const served = new Set(table.routes.flatMap((route) => route.hooks));
  const uid = currentUid();
  const dir = privateDir(process.env, uid);
  ensurePrivateDir(dir, uid);
  const paths = hostPaths(dir, sessionId);
  claimPaths(paths);
  const record2 = presenceRecord({
    pid: process.pid,
    socket: paths.socket,
    session: sessionId,
    started_at: Date.now(),
    served: [...served],
    root,
    version: true ? "1.7.0" : UNBUILT_VERSION
  });
  const presence = { paths, record: record2, published: false };
  const state = { table, served, hookEnv: hookEnvironment(process.env), presence, requests: requestClock() };
  const server = (0, import_node_http.createServer)((req, res) => {
    void handle(req, res, state);
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.on("error", (e) => {
    log("error", "listen-failed", { reason: e.message });
    releasePaths(paths, process.pid);
    process.exit(1);
  });
  server.listen(paths.socket, () => {
    (0, import_node_fs30.chmodSync)(paths.socket, SOCKET_MODE);
    process.stdout.write(`${READY_PREFIX}${paths.socket}
`);
    log("info", "ready", { routes: table.routes.length, unserved: table.unserved.length });
  });
  watchLifetime({ server, presence, requests: state.requests, log });
  return { kind: "serving" };
}
function hookEnvironment(env) {
  const copy = { ...env };
  delete copy[ENABLE_ENV2];
  return copy;
}
async function handle(req, res, state) {
  const url = req.url ?? "";
  if (req.method === "GET" && url === ROUTES_PATH) {
    if (!publishPresence(state.presence)) return reply(res, 500, { error: "presence-unwritable" });
    const body2 = { v: HOST_PROTOCOL_VERSION, routes: state.table.routes, unserved: state.table.unserved };
    return reply(res, 200, body2);
  }
  if (!url.startsWith(HOOK_PATH_PREFIX)) return reply(res, 404, { error: "not-found" });
  if (req.method !== "POST") return reply(res, 405, { error: "method" });
  const name = url.slice(HOOK_PATH_PREFIX.length);
  const hook = state.served.has(name) ? HOOKS[name] : void 0;
  if (hook === void 0) return reply(res, 404, { error: "unknown-hook" });
  const body = await readBody(req);
  if (body === null) return reply(res, 413, { error: "too-large" });
  const started = Date.now();
  const done = state.requests.begin();
  try {
    const answer = await runHook2(name, body, state);
    log("info", "hook", { hook: name, kind: answer.decision.kind, durationMs: Date.now() - started });
    return reply(res, 200, answer);
  } finally {
    done();
  }
}
function publishPresence(presence) {
  if (presence.published) return true;
  try {
    writePresence(presence.paths.presence, presence.record);
    presence.published = true;
    return true;
  } catch (e) {
    log("error", "presence-failed", { reason: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
async function runHook2(name, body, state) {
  const stderr = [];
  const io = requestIo(body, state.hookEnv, stderr);
  const envelope = readEnvelope(io);
  if (envelope === null) return response({ kind: "silent" }, stderr);
  const hook = HOOKS[name];
  if (hook === void 0) return response({ kind: "silent" }, stderr);
  try {
    const decision = await hook(envelope, hookContext(envelope, io));
    return response(decision, stderr);
  } catch (e) {
    stderr.push(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}
`);
    return response({ kind: "silent" }, stderr);
  }
}
function response(decision, stderr) {
  return { v: HOST_PROTOCOL_VERSION, decision, stderr: stderr.join("") };
}
function requestIo(body, env, stderr) {
  let consumed = false;
  return {
    readStdin() {
      if (consumed) return "";
      consumed = true;
      return body;
    },
    // A hook never writes stdout (output.ts renders decisions); anything that
    // does is kept off the socket's JSON and reported as stderr.
    out: (text2) => {
      stderr.push(text2);
    },
    err: (text2) => {
      stderr.push(text2);
    },
    env,
    cwd: () => process.cwd()
  };
}
function readBody(req) {
  const declared4 = Number.parseInt(req.headers["content-length"] ?? "0", 10);
  if (Number.isFinite(declared4) && declared4 > MAX_ENVELOPE_BYTES) return Promise.resolve(null);
  return new Promise((settle) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk2) => {
      size += chunk2.length;
      if (size > MAX_ENVELOPE_BYTES) {
        req.destroy();
        settle(null);
        return;
      }
      chunks.push(chunk2);
    });
    req.on("end", () => settle(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => settle(null));
  });
}
function reply(res, status, body) {
  const text2 = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text2) });
  res.end(text2);
}
function log(level2, event2, fields) {
  process.stderr.write(`${JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: level2, event: event2, service: SERVICE, ...fields })}
`);
}
try {
  const started = main(process.argv.slice(2));
  if (started.kind === "exit") process.exit(started.code);
} catch (e) {
  log("error", "setup-failed", { reason: e instanceof Error ? e.message : String(e) });
  process.exit(1);
}
