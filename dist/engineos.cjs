#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_node_child_process = require("node:child_process");
var import_node_fs6 = require("node:fs");

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
    out(text) {
      process.stdout.write(text);
    },
    err(text) {
      process.stderr.write(text);
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
    const v = true ? "1.6.0" : readPackageVersion();
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

// src/lib/json.ts
var import_node_fs3 = require("node:fs");
var KernelError = class extends Error {
  kind = "kernel";
};
function readJsonFile(path) {
  let text;
  try {
    text = (0, import_node_fs3.readFileSync)(path, "utf8");
  } catch {
    throw new KernelError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
}
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function stringArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// src/registry/paths.ts
var import_node_fs4 = require("node:fs");
var import_node_path2 = require("node:path");
function resolveRoot(env, startDir = __dirname) {
  const forced = env["ENGINEOS_ROOT"];
  if (forced !== void 0 && forced !== "") return forced;
  let dir = startDir;
  for (; ; ) {
    if ((0, import_node_fs4.existsSync)((0, import_node_path2.join)(dir, "registries", "routing.json"))) return dir;
    const parent = (0, import_node_path2.dirname)(dir);
    if (parent === dir) throw new KernelError("cannot locate the EngineOS root (no registries/routing.json above the runtime)");
    dir = parent;
  }
}

// src/registry/load.ts
var import_node_fs5 = require("node:fs");
var import_node_path3 = require("node:path");
function registryPath(root, name) {
  const p = (0, import_node_path3.join)(root, "registries", name);
  if (!(0, import_node_fs5.existsSync)(p)) throw new KernelError(`registry missing: registries/${name}`);
  return p;
}
function loadRegistry(root, name) {
  return readJsonFile(registryPath(root, name));
}

// src/registry/intents.ts
function isRiskTier(value) {
  return value === "low" || value === "medium" || value === "high";
}
function loadIntents(root) {
  const raw = loadRegistry(root, "intents.json");
  const r = isRecord(raw) ? raw : {};
  const rows = Array.isArray(r["intents"]) ? r["intents"] : [];
  return {
    intents: rows.filter(isRecord).map((i) => ({
      id: typeof i["id"] === "string" ? i["id"] : "",
      title: typeof i["title"] === "string" ? i["title"] : "",
      signals: stringArray(i["signals"]),
      rules: stringArray(i["rules"]),
      skills: stringArray(i["skills"]),
      agents: stringArray(i["agents"]),
      commands: stringArray(i["commands"]),
      mcp: stringArray(i["mcp"]),
      model_tier: typeof i["model_tier"] === "string" ? i["model_tier"] : null,
      risk_floor: isRiskTier(i["risk_floor"]) ? i["risk_floor"] : null,
      domain: typeof i["domain"] === "string" ? i["domain"] : null,
      // jq's `{note}` answers null for a row without one, so an absent note and
      // a null note are the same answer downstream.
      note: typeof i["note"] === "string" ? i["note"] : null
    }))
  };
}

// src/registry/routing.ts
function loadRouting(root) {
  const raw = loadRegistry(root, "routing.json");
  const r = isRecord(raw) ? raw : {};
  const ex = isRecord(r["excluded"]) ? r["excluded"] : {};
  const domains = Array.isArray(r["domains"]) ? r["domains"] : [];
  return {
    precedence: stringArray(r["precedence"]),
    excluded: {
      paths: stringArray(ex["paths"]),
      basenames: stringArray(ex["basenames"]),
      self_dirs: stringArray(ex["self_dirs"])
    },
    domains: domains.filter(isRecord).map((d) => {
      const m = isRecord(d["match"]) ? d["match"] : {};
      return {
        id: typeof d["id"] === "string" ? d["id"] : "",
        match: { paths: stringArray(m["paths"]), basenames: stringArray(m["basenames"]) },
        rules: stringArray(d["rules"]),
        skills: stringArray(d["skills"]),
        agent: typeof d["agent"] === "string" ? d["agent"] : null,
        hint: typeof d["hint"] === "string" ? d["hint"] : null,
        sample_path: typeof d["sample_path"] === "string" ? d["sample_path"] : null
      };
    })
  };
}

// src/kernel/context.ts
function lazyRegistries(root) {
  const routing = memo(() => loadRouting(root));
  const intents = memo(() => loadIntents(root));
  const models = memo(() => loadRegistry(root, "models.json"));
  const policy = memo(() => loadRegistry(root, "policy.json"));
  const decisionRules = memo(() => loadRegistry(root, "decision-rules.json"));
  const capabilities = memo(() => loadRegistry(root, "capabilities.json"));
  const agents = memo(() => loadRegistry(root, "agents.json"));
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
  const reg = regs.routing;
  const base = file.slice(file.lastIndexOf("/") + 1);
  const norm = `/${file}`;
  for (const dir of reg.excluded.self_dirs) {
    if (file.startsWith(`${root}/${dir}/`)) return { domain: null, excluded: true };
  }
  for (const pattern of reg.excluded.paths) {
    if (globMatch(pattern, norm)) return { domain: null, excluded: true };
  }
  for (const pattern of reg.excluded.basenames) {
    if (globMatch(pattern, base)) return { domain: null, excluded: true };
  }
  for (const id of reg.precedence) {
    const dom = reg.domains.find((d) => d.id === id);
    if (dom === void 0) continue;
    const hit = dom.match.paths.some((p) => globMatch(p, norm)) || dom.match.basenames.some((p) => globMatch(p, base));
    if (hit) {
      return {
        domain: dom.id,
        rules: dom.rules,
        skills: dom.skills,
        agent: dom.agent,
        risk_floor: floorOf(dom, regs),
        hook_guidance: renderGuidance(dom),
        excluded: false
      };
    }
  }
  return { domain: null, excluded: false };
}
function routeByIntent(text, regs) {
  const lower = asciiDowncase(text);
  const matches = [];
  for (const intent of regs.intents.intents) {
    if (!intent.signals.some((signal) => boundedContains(lower, asciiDowncase(signal)))) continue;
    matches.push({
      id: intent.id,
      title: intent.title,
      rules: intent.rules,
      skills: intent.skills,
      agents: intent.agents,
      commands: intent.commands,
      mcp: intent.mcp,
      model_tier: intent.model_tier,
      risk_floor: intent.risk_floor,
      note: intent.note
    });
  }
  return { matches, ambiguous: matches.length === 0 };
}
function asciiDowncase(text) {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
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

// src/kernel/resolve.ts
function resolve(facts, ctx) {
  const answer = {};
  if (facts.path !== void 0 && facts.prompt !== void 0) {
    throw new KernelError("a path fact and a prompt fact cannot be declared together");
  }
  if (facts.path !== void 0) {
    if (facts.path === "") throw new KernelError("a declared path fact must not be empty");
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (facts.prompt !== void 0) {
    if (facts.prompt === "") throw new KernelError("a declared prompt fact must not be empty");
    answer.route = routeByIntent(facts.prompt, ctx.registries);
  }
  return answer;
}

// src/kernel/cli.ts
function requirePositional(cmd, what, args) {
  const first = args[0];
  if (first === void 0 || first === "") throw new KernelError(`${cmd} requires ${what}`);
  if (first.startsWith("-")) throw new KernelError(`${cmd} takes ${what} as a positional argument, not a flag (got ${first})`);
  if (args.length !== 1) throw new KernelError(`${cmd} takes exactly one argument, got ${args.length}`);
  return first;
}
var SUBCOMMANDS = {
  "route-path": (ctx, args) => routePathSection(ctx, requirePositional("route-path", "a file path", args)),
  "route-intent": (ctx, args) => routeIntentSection(ctx, requirePositional("route-intent", "the request text", args))
};
function runKernel(argv2, io2) {
  const [name, ...args] = argv2;
  try {
    const sub = name === void 0 ? void 0 : SUBCOMMANDS[name];
    if (sub === void 0) throw new KernelError(`unknown subcommand: ${name ?? ""}`);
    const root = resolveRoot(io2.env);
    const ctx = { root, registries: lazyRegistries(root) };
    writeJson(io2, sub(ctx, args));
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      writeJson(io2, { error: e.message });
      return 1;
    }
    throw e;
  }
}
function routePathSection(ctx, file) {
  const section = resolve({ path: file }, ctx).route;
  if (section === void 0) throw new KernelError("route-path: the kernel answered no route section");
  return section;
}
function routeIntentSection(ctx, text) {
  const section = resolve({ prompt: text }, ctx).route;
  if (section === void 0) throw new KernelError("route-intent: the kernel answered no route section");
  return section;
}

// src/cli.ts
var io = processIo();
var argv = process.argv.slice(2);
function isExecutable(path) {
  try {
    (0, import_node_fs6.accessSync)(path, import_node_fs6.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function applyOutcome(outcome) {
  switch (outcome.kind) {
    case "proceed":
      return;
    case "reexec": {
      const r = (0, import_node_child_process.spawnSync)(outcome.bin, [__filename, ...argv], { stdio: "inherit", env: { ...process.env, ENGINEOS_REEXEC: "1" } });
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
      writeJson(io, { systemMessage: outcome.message });
      process.exit(0);
      break;
    case "refuse":
      writeJson(io, { error: outcome.message });
      process.exit(1);
  }
}
if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env["ENGINEOS_REEXEC"] === "1" ? null : findNewerNode(process.env, import_node_fs6.existsSync, import_node_fs6.readdirSync, isExecutable);
  applyOutcome(guardOutcome(argv, process.versions.node, newer));
}
var table = { kernel: runKernel };
process.exit(dispatch(table, argv, io));
