#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_node_child_process8 = require("node:child_process");
var import_node_fs41 = require("node:fs");

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
    out(text3) {
      process.stdout.write(text3);
    },
    err(text3) {
      process.stderr.write(text3);
    },
    env: process.env,
    cwd: () => process.cwd()
  };
}
function memoryIo(opts = {}) {
  let stdin = opts.stdin ?? "";
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    readStdin() {
      const s = stdin;
      stdin = "";
      return s;
    },
    out: (text3) => {
      stdout.push(text3);
    },
    err: (text3) => {
      stderr.push(text3);
    },
    env: opts.env ?? {},
    // '/' is a deliberately non-existent-repo default so a test that forgets to pass
    // cwd never resolves against the real checkout.
    cwd: () => opts.cwd ?? "/"
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
function findNewerNode(env, exists, listDir, isExecutable4 = defaultIsExecutable) {
  const nvmDir = env["NVM_DIR"] ?? (0, import_node_path.join)(env["HOME"] ?? "", ".nvm");
  const versionsDir = (0, import_node_path.join)(nvmDir, "versions", "node");
  if (exists(versionsDir)) {
    let names2;
    try {
      names2 = listDir(versionsDir);
    } catch {
      names2 = [];
    }
    const candidates = names2.filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR).sort((a, b) => {
      const av = parseVersion(a);
      const bv = parseVersion(b);
      return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
    });
    for (const v of candidates) {
      const bin = (0, import_node_path.join)(versionsDir, v, "bin", "node");
      if (exists(bin) && isExecutable4(bin)) return bin;
    }
  }
  for (const bin of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (exists(bin) && isExecutable4(bin)) return bin;
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

// src/hooks/output.ts
var silent = { kind: "silent" };
function context(event2, text3) {
  return { kind: "context", event: event2, text: text3 };
}
function block(reason2) {
  return { kind: "block", reason: reason2 };
}
function message(text3) {
  return { kind: "message", text: text3 };
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

// src/lib/json.ts
var import_node_fs3 = require("node:fs");
var KernelError = class extends Error {
  kind = "kernel";
};
function readJsonFile(path) {
  let text3;
  try {
    text3 = (0, import_node_fs3.readFileSync)(path, "utf8");
  } catch {
    throw new KernelError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text3);
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
function resolveRoot(env, startDir2 = __dirname) {
  const forced = env["ENGINEOS_ROOT"];
  if (forced !== void 0 && forced !== "") return forced;
  let dir = startDir2;
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
  const rows3 = Array.isArray(value) ? value : fail2(field, "an array");
  return rows3.map((row, index) => isRecord(row) ? row : fail2(`${field}[${index}]`, "an object"));
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
  const rows3 = isRecord(document) ? document["agents"] : void 0;
  if (!Array.isArray(rows3)) return [];
  const agents = [];
  for (const row of rows3) {
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
  function malformed(what) {
    throw new KernelError(`registries/${file}: ${what}`);
  }
  function requireRecord4(value, path) {
    if (!isRecord(value)) malformed(`${path || "the document"} must be an object`);
    return value;
  }
  function requireString5(value, path) {
    if (typeof value !== "string") malformed(`${path} must be a string`);
    return value;
  }
  function requireNumber3(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value)) malformed(`${path} must be a number`);
    return value;
  }
  function requireBoolean2(value, path) {
    if (typeof value !== "boolean") malformed(`${path} must be a boolean`);
    return value;
  }
  function requireStrings3(value, path) {
    if (!Array.isArray(value)) malformed(`${path} must be an array of strings`);
    return value.map((item, i) => requireString5(item, `${path}[${i}]`));
  }
  function requireRows5(value, path) {
    if (!Array.isArray(value)) malformed(`${path} must be an array of objects`);
    return value.map((item, i) => requireRecord4(item, `${path}[${i}]`));
  }
  function optionalString3(value, path) {
    if (value === void 0 || value === null) return null;
    return requireString5(value, path);
  }
  function optionalStrings2(value, path) {
    if (value === void 0 || value === null) return [];
    return requireStrings3(value, path);
  }
  return {
    malformed,
    requireRecord: requireRecord4,
    requireString: requireString5,
    requireNumber: requireNumber3,
    requireBoolean: requireBoolean2,
    requireStrings: requireStrings3,
    requireRows: requireRows5,
    optionalString: optionalString3,
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
var { requireRecord, requireString: requireString2, requireNumber, requireStrings, requireRows: requireRows2, optionalString: optionalString2, optionalStrings } = strictReader("decision-rules.json");
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
        signals: optionalStrings(row["signals"], `${at}.signals`)
      };
    })
  };
}

// src/registry/intents.ts
function isRiskTier(value) {
  return value === "low" || value === "medium" || value === "high";
}
var reader2 = strictReader("intents.json");
function loadIntents(root) {
  const document = reader2.requireRecord(loadRegistry(root, "intents.json"), "");
  const rows3 = reader2.requireRows(document["intents"], ".intents");
  if (rows3.length === 0) reader2.malformed(".intents must not be empty");
  return {
    version: reader2.requireString(document["version"], ".version"),
    intents: rows3.map((row, i) => {
      const path = `.intents[${i}]`;
      const id = reader2.requireString(row["id"], `${path}.id`);
      if (id === "") reader2.malformed(`${path}.id must not be empty`);
      const signals2 = reader2.requireStrings(row["signals"], `${path}.signals`);
      if (signals2.length === 0) reader2.malformed(`${path}.signals must not be empty`);
      return {
        id,
        title: reader2.requireString(row["title"], `${path}.title`),
        signals: signals2,
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
        requires_dispatch_plan: flag(row["requires_dispatch_plan"], `${path}.requires_dispatch_plan`)
      };
    })
  };
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

// src/registry/policy.ts
var { requireRecord: requireRecord2, requireString: requireString3, requireNumber: requireNumber2, requireBoolean, requireStrings: requireStrings2, requireRows: requireRows3 } = strictReader("policy.json");
function loadPolicy(root) {
  const raw = loadRegistry(root, "policy.json");
  const p = requireRecord2(raw, "");
  const risk = requireRecord2(p["risk"], ".risk");
  const repair = requireRecord2(p["repair"], ".repair");
  const autonomy = requireRecord2(p["autonomy"], ".autonomy");
  const retry = requireRecord2(p["retry"], ".retry");
  const gates = requireRecord2(p["gates"], ".gates");
  const specThreshold = requireRecord2(gates["spec_threshold"], ".gates.spec_threshold");
  const parallelism = requireRecord2(p["parallelism"], ".parallelism");
  const backpressure = requireRecord2(parallelism["backpressure"], ".parallelism.backpressure");
  const promptSignals = requireRecord2(parallelism["prompt_signals"], ".parallelism.prompt_signals");
  const breaker = requireRecord2(p["breaker"], ".breaker");
  const hitl = requireRecord2(p["hitl"], ".hitl");
  const router = requireRecord2(p["router"], ".router");
  const escalateWhen = requireRecord2(router["escalate_when"], ".router.escalate_when");
  return {
    version: requireString3(p["version"], ".version"),
    risk: {
      aggregation: requireString3(risk["aggregation"], ".risk.aggregation"),
      inputs: requireRows3(risk["inputs"], ".risk.inputs").map((row, i) => ({
        id: requireString3(row["id"], `.risk.inputs[${i}].id`)
      })),
      high_floors: requireStrings2(risk["high_floors"], ".risk.high_floors")
    },
    repair: {
      checks: requireStrings2(repair["checks"], ".repair.checks"),
      max_fix_attempts_per_check: requireNumber2(
        repair["max_fix_attempts_per_check"],
        ".repair.max_fix_attempts_per_check"
      ),
      escalations: requireNumber2(repair["escalations"], ".repair.escalations"),
      by_situation: requireRows3(repair["by_situation"], ".repair.by_situation").map((row, i) => ({
        situation: requireString3(row["situation"], `.repair.by_situation[${i}].situation`),
        response: requireString3(row["response"], `.repair.by_situation[${i}].response`)
      })),
      never_repair: requireStrings2(repair["never_repair"], ".repair.never_repair")
    },
    autonomy: {
      levels: requireRows3(autonomy["levels"], ".autonomy.levels").map((row, i) => ({
        id: requireString3(row["id"], `.autonomy.levels[${i}].id`)
      })),
      ceiling_by_risk: requireTierMap(
        autonomy["ceiling_by_risk"],
        ".autonomy.ceiling_by_risk",
        requireString3
      ),
      high_with_thin_evidence: requireString3(
        autonomy["high_with_thin_evidence"],
        ".autonomy.high_with_thin_evidence"
      )
    },
    retry: {
      never_retry: requireStrings2(retry["never_retry"], ".retry.never_retry")
    },
    gates: {
      by_risk: requireTierMap(gates["by_risk"], ".gates.by_risk", requireStringMap),
      spec_threshold: {
        files_greater_than: requireNumber2(
          specThreshold["files_greater_than"],
          ".gates.spec_threshold.files_greater_than"
        ),
        or_any_new_feature: requireBoolean(
          specThreshold["or_any_new_feature"],
          ".gates.spec_threshold.or_any_new_feature"
        )
      }
    },
    parallelism: {
      wave_concurrency_cap: requireNumber2(
        parallelism["wave_concurrency_cap"],
        ".parallelism.wave_concurrency_cap"
      ),
      backpressure: {
        max_queued_units: requireNumber2(
          backpressure["max_queued_units"],
          ".parallelism.backpressure.max_queued_units"
        ),
        overload_action: requireString3(
          backpressure["overload_action"],
          ".parallelism.backpressure.overload_action"
        ),
        actions: requireStrings2(backpressure["actions"], ".parallelism.backpressure.actions")
      },
      prompt_signals: {
        action: requireString3(promptSignals["action"], ".parallelism.prompt_signals.action"),
        substantive_action: requireString3(
          promptSignals["substantive_action"],
          ".parallelism.prompt_signals.substantive_action"
        ),
        scale: requireString3(promptSignals["scale"], ".parallelism.prompt_signals.scale"),
        spec: requireString3(promptSignals["spec"], ".parallelism.prompt_signals.spec"),
        design_strong: requireString3(
          promptSignals["design_strong"],
          ".parallelism.prompt_signals.design_strong"
        ),
        design_weak: requireString3(
          promptSignals["design_weak"],
          ".parallelism.prompt_signals.design_weak"
        )
      }
    },
    breaker: {
      failure_threshold: requireNumber2(breaker["failure_threshold"], ".breaker.failure_threshold"),
      cooldown_waves: requireNumber2(breaker["cooldown_waves"], ".breaker.cooldown_waves"),
      half_open_probes: requireNumber2(breaker["half_open_probes"], ".breaker.half_open_probes"),
      states: requireStrings2(breaker["states"], ".breaker.states"),
      scopes: requireStrings2(breaker["scopes"], ".breaker.scopes")
    },
    hitl: {
      reasons: requireStrings2(hitl["reasons"], ".hitl.reasons"),
      situations: requireStrings2(hitl["situations"], ".hitl.situations"),
      record_home: requireString3(hitl["record_home"], ".hitl.record_home")
    },
    router: {
      agent: requireString3(router["agent"], ".router.agent"),
      capability: requireString3(router["capability"], ".router.capability"),
      reasons: requireStrings2(router["reasons"], ".router.reasons"),
      escalate_when: {
        multi_agent_intents_min: requireNumber2(
          escalateWhen["multi_agent_intents_min"],
          ".router.escalate_when.multi_agent_intents_min"
        ),
        unrouted_scale_signals: requireStrings2(
          escalateWhen["unrouted_scale_signals"],
          ".router.escalate_when.unrouted_scale_signals"
        )
      },
      fixtures: requireRows3(router["fixtures"], ".router.fixtures").map((row, i) => ({
        prompt: requireString3(row["prompt"], `.router.fixtures[${i}].prompt`),
        escalate: requireBoolean(row["escalate"], `.router.fixtures[${i}].escalate`),
        reasons: requireStrings2(row["reasons"], `.router.fixtures[${i}].reasons`),
        intents: requireStrings2(row["intents"], `.router.fixtures[${i}].intents`)
      }))
    }
  };
}
function requireStringMap(value, path) {
  const row = requireRecord2(value, path);
  const out = {};
  for (const [key, item] of Object.entries(row)) out[key] = requireString3(item, `${path}.${key}`);
  return out;
}
function requireTierMap(value, path, item) {
  const row = requireRecord2(value, path);
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
var import_node_fs6 = require("node:fs");
var import_node_path4 = require("node:path");
var HEAD_BYTES = 64 * 1024;
var FENCE = /^---[ \t\r\v\f]*$/;
var LEADING_BLANK = /^[ \t]*/;
var TRAILING_BLANK = /[ \t\r\v\f]*$/;
var ENABLED_KEY = "enabled:";
function readSkillState(root) {
  const dir = (0, import_node_path4.join)(root, "skills");
  const state = /* @__PURE__ */ new Map();
  let entries;
  try {
    entries = (0, import_node_fs6.readdirSync)(dir);
  } catch {
    return state;
  }
  for (const id of entries) {
    if (id.startsWith(".")) continue;
    if (!isDirectory((0, import_node_path4.join)(dir, id))) continue;
    const file = (0, import_node_path4.join)(dir, id, "SKILL.md");
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
function enabledSkills(declared4, state) {
  return declared4.filter((id) => isSkillEnabled(state, id));
}
function suppressedSkills(declared4, state) {
  return declared4.filter((id) => !isSkillEnabled(state, id)).map((id) => ({ id, reason: state.get(id) === "unreadable" ? "unreadable" : "disabled" }));
}
function skillStateSection(state) {
  const readings = [...state.entries()].sort(byEntryId);
  const section = {
    skills: readings.map(([id, reading]) => ({ id, enabled: reading === "enabled" })),
    // jq sorted this list independently of the first; filtering the already
    // sorted rows is the same answer with one comparator.
    disabled: readings.filter(([, reading]) => reading !== "enabled").map(([id]) => id)
  };
  const unreadable = readings.filter(([, reading]) => reading === "unreadable").map(([id]) => id);
  if (unreadable.length > 0) section.unreadable = unreadable;
  return section;
}
function skillLookupSection(state, id) {
  const section = { id, exists: state.has(id), enabled: isSkillEnabled(state, id) };
  if (state.get(id) === "unreadable") section.unreadable = true;
  return section;
}
function frontmatterReading(text3, truncated) {
  const lines = text3.split("\n");
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
function byEntryId(a, b) {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}
function isDirectory(path) {
  try {
    return (0, import_node_fs6.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile(path) {
  try {
    return (0, import_node_fs6.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function readHead(path) {
  let fd;
  try {
    fd = (0, import_node_fs6.openSync)(path, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = (0, import_node_fs6.readSync)(fd, buffer, 0, HEAD_BYTES, 0);
    const truncated = read === HEAD_BYTES && (0, import_node_fs6.fstatSync)(fd).size > HEAD_BYTES;
    return { text: buffer.subarray(0, read).toString("utf8"), truncated };
  } catch {
    return null;
  } finally {
    (0, import_node_fs6.closeSync)(fd);
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
  const capacity = cap - facts.inflight;
  if (capacity > 0) {
    return {
      action: "dispatch",
      capacity,
      reason: `inflight ${facts.inflight} below cap ${cap}`
    };
  }
  if (facts.queued < maxQueued) {
    return {
      action: backpressure.overload_action,
      capacity: 0,
      reason: `cap ${cap} reached; ${facts.queued} of ${maxQueued} queued \u2014 hold the unit for the next wave`
    };
  }
  return {
    action: "reject",
    capacity: 0,
    reason: `cap ${cap} reached and queue full (${facts.queued}/${maxQueued}) \u2014 stop planning, report BLOCKED, re-plan with a human (hitl: budget-exhausted)`
  };
}
function requireCount(value, flag2) {
  if (!Number.isInteger(value) || value < 0) {
    throw new KernelError(`admit requires a numeric --${flag2}`);
  }
}

// src/kernel/breaker.ts
var TRANSITIONS = {
  closed: fromClosed,
  open: fromOpen,
  "half-open": fromHalfOpen
};
function breakerSection(facts, regs) {
  const breaker = regs.policy.breaker;
  const transition = TRANSITIONS[facts.state];
  if (transition === void 0 || !breaker.states.includes(facts.state)) {
    throw new KernelError("breaker requires --state closed|open|half-open");
  }
  return transition(facts, breaker);
}
function fromClosed(facts, breaker) {
  const failures = facts.failures;
  if (failures === void 0 || !Number.isInteger(failures) || failures < 0) {
    throw new KernelError("breaker --state closed requires a numeric --failures");
  }
  if (failures >= breaker.failure_threshold) {
    return {
      state: "open",
      allow: false,
      reason: `${failures} consecutive failures reached threshold ${breaker.failure_threshold} \u2014 stop calling this resource for ${breaker.cooldown_waves} wave(s); route around or report DEGRADED`
    };
  }
  return {
    state: "closed",
    allow: true,
    reason: `${failures} of ${breaker.failure_threshold} failures \u2014 resource healthy`
  };
}
function fromOpen(facts, breaker) {
  const elapsed = facts.cooldownElapsed;
  if (elapsed === void 0) {
    throw new KernelError("breaker --state open requires --cooldown-elapsed true|false");
  }
  if (elapsed) {
    return {
      state: "half-open",
      allow: true,
      reason: `cooldown elapsed \u2014 allow ${breaker.half_open_probes} probe call(s); no fan-out through this resource until it closes`
    };
  }
  return {
    state: "open",
    allow: false,
    reason: "cooldown not elapsed \u2014 do not call; route around or report DEGRADED"
  };
}
function fromHalfOpen(facts) {
  const probe = facts.probeResult;
  if (probe !== "ok" && probe !== "failed") {
    throw new KernelError("breaker --state half-open requires --probe-result ok|failed");
  }
  if (probe === "ok") {
    return {
      state: "closed",
      allow: true,
      reason: "probe succeeded \u2014 resource recovered; reset the failure count to 0"
    };
  }
  return { state: "open", allow: false, reason: "probe failed \u2014 reopen for another cooldown" };
}

// src/kernel/scale.ts
function scaleSection(facts, regs) {
  const signals2 = regs.policy.parallelism.prompt_signals;
  const compiled = compiledSignals(signals2);
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
function compiledSignals(signals2) {
  const cached = cache.get(signals2);
  if (cached !== void 0) return cached;
  const at = "registries/policy.json: .parallelism.prompt_signals";
  const compiled = {
    action: compilePromptRegex(signals2.action, `${at}.action`),
    scale: compilePromptRegex(signals2.scale, `${at}.scale`),
    spec: compilePromptRegex(signals2.spec, `${at}.spec`),
    designStrong: compilePromptRegex(signals2.design_strong, `${at}.design_strong`),
    designWeak: compilePromptRegex(signals2.design_weak, `${at}.design_weak`)
  };
  cache.set(signals2, compiled);
  return compiled;
}

// src/kernel/decisions.ts
function decisionsSection(facts, regs) {
  const lower = asciiDowncase(facts.prompt);
  const matches = rulesByPriority(regs.decisionRules).filter((candidate) => candidate.patterns.some((pattern) => pattern.test(lower))).map(({ rule }) => ({
    id: rule.id,
    // Copied, not aliased: a section is an answer, and a caller that edits
    // one must not reach back into the memoised registry.
    require: [...rule.then.require],
    prefer: rule.then.prefer,
    gate: rule.then.gate,
    risk: rule.then.risk
  }));
  return {
    matches,
    any_high: matches.some((match) => match.risk === "high")
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
var EXTERNAL_EFFECT_FLOOR = "A3";
function hitlSection(facts, regs) {
  const policy = regs.policy;
  const risk = facts.riskTier;
  if (!isRiskTier(risk)) throw new KernelError("hitl requires --risk low|medium|high");
  const levels = policy.autonomy.levels.map((level) => level.id);
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
  const recordHome2 = policy.hitl.record_home;
  if (recordHome2 === "") {
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
  const externalFloorIndex = levels.indexOf(EXTERNAL_EFFECT_FLOOR);
  if (externalFloorIndex < 0) {
    throw new KernelError(
      `policy.json .autonomy.levels does not declare ${EXTERNAL_EFFECT_FLOOR} \u2014 hitl cannot resolve the external-effect floor`
    );
  }
  const triggered = triggeredReasons({
    risk,
    evidence,
    external,
    conflict,
    situation,
    autonomyIndex,
    externalFloorIndex,
    neverRetry: policy.retry.never_retry
  });
  const undeclared = triggered.filter((reason2) => !policy.hitl.reasons.includes(reason2));
  if (undeclared.length > 0) {
    throw new KernelError(
      `policy.json .hitl.reasons does not declare: ${undeclared.join(", ")} \u2014 a gate may cite nothing outside the closed vocabulary`
    );
  }
  const reasons = policy.hitl.reasons.filter((reason2) => triggered.includes(reason2));
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
    record_home: recordHome2
  };
}
function triggeredReasons(inputs) {
  const reasons = [];
  if (inputs.risk === "high") reasons.push("high-risk");
  if (inputs.evidence === "thin") reasons.push("evidence-insufficient");
  if (inputs.external && inputs.autonomyIndex >= inputs.externalFloorIndex) reasons.push("external-effect");
  if (inputs.conflict) reasons.push("policy-conflict");
  if (inputs.situation !== "" && inputs.neverRetry.includes(inputs.situation)) {
    reasons.push("never-retry-situation");
  }
  if (inputs.situation === "destructive") reasons.push("destructive-action");
  if (inputs.situation === "budget-exhausted" || inputs.situation === "reject") {
    reasons.push("budget-exhausted");
  }
  if (inputs.situation === "breaker-open") reasons.push("breaker-open");
  return reasons;
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
var BY_RESPONSE = {
  "report-tooling-gap-no-attempt-consumed": {
    action: "report-tooling-gap",
    reason: "the check could not run \u2014 that is a tooling gap, not a code defect; report it, consume no fix attempt (hooks/stop-verify.sh: never block on infra quirks)"
  },
  "fix-or-delete-never-rerun-until-green": {
    action: "fix-or-delete",
    reason: "green on re-run with no diff is a broken test, not a pass \u2014 fix or delete within the week, never retry-until-green (rules/testing.md)"
  }
};
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
      return {
        check,
        action: "never-repair",
        reason: `situation ${situation} is on the never-repair list \u2014 a fix that weakens the check or changes behavior is not a fix; escalate to a human on the first occurrence`
      };
    }
    const row = repair.by_situation.find((entry) => entry.situation === situation);
    const answer = row === void 0 ? void 0 : BY_RESPONSE[row.response];
    if (answer === void 0) throw new KernelError(`unknown situation: ${situation}`);
    return { check, action: answer.action, reason: answer.reason };
  }
  const attempt2 = facts.attempt;
  if (attempt2 === void 0 || !Number.isInteger(attempt2) || attempt2 < 0) {
    throw new KernelError("repair (red ladder) requires a numeric --attempt");
  }
  const bound = repair.max_fix_attempts_per_check;
  if (attempt2 < bound) {
    return {
      check,
      action: "fix-same-tier",
      reason: "first red \u2014 fix and re-run the check at the same tier"
    };
  }
  if (attempt2 < bound + repair.escalations) {
    return {
      check,
      action: "escalate-one-tier",
      reason: "the same check failed twice \u2014 escalate one model tier for the fix and re-run once; that is the last attempt (rules/models.md)"
    };
  }
  return {
    check,
    action: "stop-report-red",
    reason: "the bound is exhausted \u2014 stop, report the check red with what was tried; a loop continued past this point is sampling until it looks right, not fixing (rules/parallelism.md)"
  };
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
function classify(signals2, regs) {
  const policy = regs.policy;
  if (!isRecord(signals2)) {
    throw new KernelError("risk --signals must be a JSON object with inputs{} and/or floors[]");
  }
  const inputs = optionalRecord(signals2["inputs"], "risk --signals .inputs must be an object of input-id to tier");
  const floors = optionalArray(signals2["floors"], "risk --signals .floors must be an array of floor ids");
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
        skills: enabledSkills(dom.skills, regs.skillState),
        skills_suppressed: suppressedSkills(dom.skills, regs.skillState),
        agent: dom.agent,
        risk_floor: floorOf(dom, regs),
        hook_guidance: renderGuidance(dom),
        excluded: false
      };
    }
  }
  return { domain: null, excluded: false };
}
function routeByIntent(text3, regs) {
  const lower = asciiDowncase2(text3);
  const matches = [];
  for (const intent of regs.intents.intents) {
    if (!intent.signals.some((signal) => boundedContains(lower, asciiDowncase2(signal)))) continue;
    matches.push({
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
    });
  }
  return { matches, ambiguous: matches.length === 0 };
}
var RISK_ORDER = ["low", "medium", "high"];
function routeEscalate(text3, regs) {
  const router = regs.policy.router;
  const raw = routeByIntent(text3, regs);
  const scale = scaleSection({ prompt: text3 }, regs);
  const rawIds = new Set(raw.matches.map((m) => m.id));
  const matched = regs.intents.intents.filter((i) => rawIds.has(i.id));
  const hasNonSuppressible = matched.some((i) => !i.suppressible);
  const suppressed = [];
  const surviving = [];
  for (const intent of matched) {
    const by = suppressorOf(intent, hasNonSuppressible, rawIds);
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
  const triggered = {
    "multi-agent-dispatch": agentIntents >= router.escalate_when.multi_agent_intents_min,
    // Zero RAW matches, not zero survivors: an intent that matched and was then
    // suppressed still routed the prompt somewhere, so the prompt is not
    // unrouted.
    "unrouted-scale": rawIds.size === 0 && router.escalate_when.unrouted_scale_signals.some((signal) => scaleFlags[signal] === true),
    "requires-dispatch-plan": surviving.some((i) => i.requires_dispatch_plan)
  };
  const reasons = router.reasons.filter((reason2) => triggered[reason2] === true);
  return {
    escalate: reasons.length > 0,
    reasons,
    intents: surviving.map((i) => i.id),
    suppressed,
    agents,
    model_tier: highest(
      surviving.map((i) => i.model_tier),
      regs.models.escalation_order
    ),
    risk_floor: highest(
      surviving.map((i) => i.risk_floor),
      RISK_ORDER
    ),
    scale,
    ambiguous: raw.ambiguous
  };
}
function suppressorOf(intent, hasNonSuppressible, rawIds) {
  if (intent.suppressible && hasNonSuppressible) return "more-specific-match";
  return intent.suppressed_by.find((id) => rawIds.has(id)) ?? null;
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
function asciiDowncase2(text3) {
  return text3.replace(/[A-Z]/g, (c) => c.toLowerCase());
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
  const unknown = unique(units.flatMap((unit) => unit.dependsOn.filter((dep) => !ids.includes(dep))));
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
  const rows3 = value;
  return rows3.map((raw, i) => {
    const malformed = `waves --units[${i}] must be an object with a non-empty string id`;
    if (!isRecord(raw)) throw new KernelError(malformed);
    const id = raw["id"];
    if (typeof id !== "string" || id === "") throw new KernelError(malformed);
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
function unique(values) {
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
  if (facts.path !== void 0) {
    if (facts.path === "") throw new KernelError("a declared path fact must not be empty");
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (prompt !== void 0) {
    if (prompt === "") throw new KernelError("a declared prompt fact must not be empty");
    answer.route = facts.escalate === true || facts.taskContract === true ? routeEscalate(prompt, ctx.registries) : routeByIntent(prompt, ctx.registries);
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
    const decisions = decisionsSection({ prompt }, ctx.registries);
    answer.decision_rules = decisions;
    const floor = decisions.any_high ? "high" : route.risk_floor;
    const ceiling2 = floor === null ? null : ceilingAt(floor, ctx.registries);
    if (decisions.any_high && ceiling2 !== null) {
      answer.hitl = hitlSection({ riskTier: "high", autonomy: ceiling2 }, ctx.registries);
    }
    answer.task_contract = taskContract({ prompt, route, decisions, floor, ceiling: ceiling2 }, ctx.registries);
  }
  return answer;
}
var POLICY_BUNDLE = ["gates", "models", "parallelism", "risk-autonomy", "verification"];
var AGENT_POLICY_RULE = "subagents";
function taskContract(inputs, regs) {
  const { prompt, route, decisions } = inputs;
  const matched = regs.intents.intents.filter((intent) => route.intents.includes(intent.id));
  const declaredSkills = unique2(matched.flatMap((intent) => intent.skills));
  const substantive = route.intents.length > 0 || decisions.matches.length > 0 || route.scale.big_task || route.scale.spec_authoring || route.scale.design_work || // A prompt can request real work without matching a registered domain
  // ("update this prose"). The registry-owned action expression is the
  // fallback that keeps such work inside the safety/verification bundle.
  substantiveAction(prompt, regs);
  return {
    substantive,
    intents: [...route.intents],
    escalates: route.escalate,
    escalation_reasons: [...route.reasons],
    suppressed: route.suppressed.map((entry) => ({ ...entry })),
    agents: [...route.agents],
    rules: unique2(matched.flatMap((intent) => intent.rules)),
    // jq's `unique` sorts as well as de-duplicates, and the answer callers
    // already parse carries that ordering.
    policy_rules: [
      .../* @__PURE__ */ new Set([
        ...substantive ? POLICY_BUNDLE : [],
        ...route.agents.length > 0 ? [AGENT_POLICY_RULE] : []
      ])
    ].sort(),
    skills: enabledSkills(declaredSkills, regs.skillState),
    skills_suppressed: suppressedSkills(declaredSkills, regs.skillState),
    commands: unique2(matched.flatMap((intent) => intent.commands)),
    mcp: unique2(matched.flatMap((intent) => intent.mcp)),
    model_tier: route.model_tier,
    risk_floor: inputs.floor,
    autonomy_ceiling_at_floor: inputs.ceiling,
    scale: { ...route.scale },
    decision_rules: decisions.matches.map((match) => match.id),
    required: unique2(decisions.matches.flatMap((match) => match.require)),
    // jq's `map(.gate // empty)` drops a null value rather than emitting it, so
    // a rule that names no gate and no preference contributes to neither list.
    gates: unique2(declared(decisions.matches.map((match) => match.gate))),
    preferences: unique2(declared(decisions.matches.map((match) => match.prefer)))
  };
}
function ceilingAt(floor, regs) {
  const ceiling2 = regs.policy.autonomy.ceiling_by_risk[floor];
  if (ceiling2 === "") {
    throw new KernelError(
      `policy.json has no autonomy.ceiling_by_risk[${floor}] \u2014 resolve-task cannot resolve the ceiling hitl needs`
    );
  }
  return ceiling2;
}
function substantiveAction(prompt, regs) {
  const source = regs.policy.parallelism.prompt_signals.substantive_action;
  const pattern = compilePromptRegex(source, "registries/policy.json: .parallelism.prompt_signals.substantive_action");
  return pattern.test(asciiDowncase(prompt));
}
function declared(values) {
  return values.filter((value) => value !== null);
}
function unique2(values) {
  return [...new Set(values)];
}

// src/kernel/cli.ts
function requirePositional(cmd, what, args) {
  const first = args[0];
  if (first === void 0 || first === "") throw new KernelError(`${cmd} requires ${what}`);
  if (first.startsWith("-")) throw new KernelError(`${cmd} takes ${what} as a positional argument, not a flag (got ${first})`);
  if (args.length !== 1) throw new KernelError(`${cmd} takes exactly one argument, got ${args.length}`);
  return first;
}
function parseFlags(cmd, args, allowed) {
  const out = /* @__PURE__ */ new Map();
  const rest = [...args];
  for (; ; ) {
    const flag2 = rest.shift();
    if (flag2 === void 0) break;
    if (!allowed.includes(flag2)) throw new KernelError(`${cmd}: unknown flag ${flag2}`);
    const value = rest.shift();
    if (value === void 0) throw new KernelError(`${cmd}: ${flag2} requires a value`);
    out.set(flag2, value);
  }
  return out;
}
var SUBCOMMANDS = {
  "route-path": (ctx, args) => routePathSection(ctx, requirePositional("route-path", "a file path", args)),
  "route-intent": (ctx, args) => routeIntentSection(ctx, requirePositional("route-intent", "the request text", args)),
  model: modelProjection,
  risk: riskProjection,
  gates: gatesProjection,
  repair: repairProjection,
  admit: admitProjection,
  breaker: breakerProjection,
  hitl: hitlProjection,
  waves: wavesProjection,
  "decision-rules": decisionRulesProjection,
  scale: scaleProjection,
  "route-escalate": routeEscalateProjection,
  "resolve-task": resolveTaskProjection,
  resolve: resolveProjection,
  "skill-state": skillStateProjection
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
function routeIntentSection(ctx, text3) {
  const section = resolve({ prompt: text3 }, ctx).route;
  if (section === void 0) throw new KernelError("route-intent: the kernel answered no route section");
  return section;
}
function modelProjection(ctx, args) {
  const flags2 = parseFlags("model", args, ["--work"]);
  const work = flags2.get("--work");
  if (work === void 0 || work === "") throw new KernelError("model requires --work <type>");
  const section = resolve({ workType: work }, ctx).model;
  if (section === void 0) throw new KernelError("model: the kernel answered no model section");
  return section;
}
function riskProjection(ctx, args) {
  const flags2 = parseFlags("risk", args, ["--signals"]);
  const signals2 = flags2.get("--signals");
  if (signals2 === void 0 || signals2 === "") throw new KernelError("risk requires --signals <json>");
  const section = resolve({ signals: parseSignals(signals2) }, ctx).risk;
  if (section === void 0 || !("floors_applied" in section)) {
    throw new KernelError("risk: the kernel answered no classified risk section");
  }
  return {
    risk: section.risk,
    autonomy_ceiling: section.autonomy_ceiling,
    gates: section.gates,
    floors_applied: section.floors_applied
  };
}
function gatesProjection(ctx, args) {
  const flags2 = parseFlags("gates", args, ["--risk"]);
  const tier = flags2.get("--risk");
  if (tier === void 0 || !isRiskTier(tier)) throw new KernelError("gates requires --risk low|medium|high");
  const section = resolve({ riskTier: tier }, ctx).risk;
  if (section === void 0 || !("spec_threshold" in section)) {
    throw new KernelError("gates: the kernel answered no classified-tier risk section");
  }
  return { risk: section.risk, gates: section.gates, spec_threshold: section.spec_threshold };
}
function repairProjection(ctx, args) {
  const flags2 = parseFlags("repair", args, ["--check", "--attempt", "--situation"]);
  const check = flags2.get("--check");
  if (check === void 0 || check === "") throw new KernelError("repair requires --check");
  const repair = { check };
  const attempt2 = flags2.get("--attempt");
  if (attempt2 !== void 0) repair.attempt = parseCount(attempt2);
  const situation = flags2.get("--situation");
  if (situation !== void 0 && situation !== "") repair.situation = situation;
  const section = resolve({ repair }, ctx).repair;
  if (section === void 0) throw new KernelError("repair: the kernel answered no repair section");
  return section;
}
function admitProjection(ctx, args) {
  const flags2 = parseFlags("admit", args, ["--inflight", "--queued"]);
  const admit = {
    inflight: parseCount(flags2.get("--inflight")),
    queued: parseCount(flags2.get("--queued"))
  };
  const section = resolve({ admit }, ctx).admit;
  if (section === void 0) throw new KernelError("admit: the kernel answered no admit section");
  return section;
}
function breakerProjection(ctx, args) {
  const flags2 = parseFlags("breaker", args, ["--state", "--failures", "--cooldown-elapsed", "--probe-result"]);
  const breaker = { state: flags2.get("--state") ?? "" };
  const failures = flags2.get("--failures");
  if (failures !== void 0) breaker.failures = parseCount(failures);
  const cooldown = flags2.get("--cooldown-elapsed");
  if (cooldown === "true" || cooldown === "false") breaker.cooldownElapsed = cooldown === "true";
  const probe = flags2.get("--probe-result");
  if (probe !== void 0) breaker.probeResult = probe;
  const section = resolve({ breaker }, ctx).breaker;
  if (section === void 0) throw new KernelError("breaker: the kernel answered no breaker section");
  return section;
}
function hitlProjection(ctx, args) {
  const flags2 = parseFlags("hitl", args, ["--risk", "--autonomy", "--evidence", "--external-effect", "--conflict", "--situation"]);
  const tier = flags2.get("--risk");
  if (tier === void 0 || !isRiskTier(tier)) throw new KernelError("hitl requires --risk low|medium|high");
  const hitl = { riskTier: tier, autonomy: flags2.get("--autonomy") ?? "" };
  const evidence = flags2.get("--evidence");
  if (evidence !== void 0) hitl.evidence = evidence;
  const external = flags2.get("--external-effect");
  if (external !== void 0) hitl.externalEffect = external;
  const conflict = flags2.get("--conflict");
  if (conflict !== void 0) hitl.conflict = conflict;
  const situation = flags2.get("--situation");
  if (situation !== void 0) hitl.situation = situation;
  const section = resolve({ hitl }, ctx).hitl;
  if (section === void 0) throw new KernelError("hitl: the kernel answered no hitl section");
  return section;
}
function wavesProjection(ctx, args) {
  const flags2 = parseFlags("waves", args, ["--units"]);
  const units = flags2.get("--units");
  if (units === void 0 || units === "") throw new KernelError("waves requires --units <json array>");
  const section = resolve({ waves: { units: parseUnitsJson(units) } }, ctx).waves;
  if (section === void 0) throw new KernelError("waves: the kernel answered no waves section");
  return section;
}
function promptOf(cmd, args) {
  const flags2 = parseFlags(cmd, args, ["--prompt"]);
  const prompt = flags2.get("--prompt");
  if (prompt === void 0 || prompt === "") throw new KernelError(`${cmd} requires --prompt <text>`);
  return prompt;
}
function decisionRulesProjection(ctx, args) {
  const prompt = promptOf("decision-rules", args);
  const section = resolve({ decisions: { prompt } }, ctx).decision_rules;
  if (section === void 0) throw new KernelError("decision-rules: the kernel answered no decision-rules section");
  return section;
}
function scaleProjection(ctx, args) {
  const prompt = promptOf("scale", args);
  const section = resolve({ scale: { prompt } }, ctx).scale;
  if (section === void 0) throw new KernelError("scale: the kernel answered no scale section");
  return section;
}
function routeEscalateProjection(ctx, args) {
  const prompt = promptOf("route-escalate", args);
  const section = resolve({ prompt, escalate: true }, ctx).route;
  if (section === void 0 || !("escalate" in section)) {
    throw new KernelError("route-escalate: the kernel answered no escalate route section");
  }
  return section;
}
function resolveTaskProjection(ctx, args) {
  const prompt = promptOf("resolve-task", args);
  const answer = resolve({ prompt, taskContract: true }, ctx);
  const contract = answer.task_contract;
  const route = answer.route;
  const decisions = answer.decision_rules;
  if (contract === void 0 || decisions === void 0 || route === void 0 || !("escalate" in route)) {
    throw new KernelError("resolve-task: the kernel answered no task contract");
  }
  const hitl = answer.hitl;
  return {
    task_contract: contract,
    route,
    decision_rules: decisions,
    hitl: hitl === void 0 ? null : { required: hitl.required, reasons: hitl.reasons }
  };
}
function resolveProjection(ctx, args) {
  const flags2 = parseFlags("resolve", args, ["--facts"]);
  const facts = flags2.get("--facts");
  if (facts === void 0 || facts === "") throw new KernelError("resolve requires --facts <json>");
  return resolve(parseFacts(facts), ctx);
}
function skillStateProjection(ctx, args) {
  let id = "";
  const rest = [...args];
  for (; ; ) {
    const flag2 = rest.shift();
    if (flag2 === void 0) break;
    if (flag2 !== "--id") throw new KernelError(`skill-state: unknown argument ${flag2}`);
    const value = rest.shift();
    if (value === void 0) throw new KernelError("skill-state: --id requires a value");
    id = value;
  }
  const state = ctx.registries.skillState;
  return id === "" ? skillStateSection(state) : skillLookupSection(state, id);
}
function parseFacts(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new KernelError("resolve --facts must be a JSON object");
  }
  if (!isRecord(parsed)) throw new KernelError("resolve --facts must be a JSON object");
  const facts = {};
  for (const [key, value] of Object.entries(parsed)) {
    switch (key) {
      case "path":
        facts.path = factString(key, value);
        break;
      case "prompt":
        facts.prompt = factString(key, value);
        break;
      case "escalate":
        facts.escalate = factBoolean(key, value);
        break;
      case "taskContract":
        facts.taskContract = factBoolean(key, value);
        break;
      case "workType":
        facts.workType = factString(key, value);
        break;
      // Passed through unread, exactly as the risk arm passes its parsed
      // --signals payload: the risk section owns what a well-formed one is.
      case "signals":
        facts.signals = value;
        break;
      case "riskTier":
        facts.riskTier = factTier(key, value);
        break;
      case "scale":
        facts.scale = { prompt: factString("scale.prompt", factRecord(key, value)["prompt"]) };
        break;
      case "decisions":
        facts.decisions = { prompt: factString("decisions.prompt", factRecord(key, value)["prompt"]) };
        break;
      case "repair":
        facts.repair = repairFacts(factRecord(key, value));
        break;
      case "admit":
        facts.admit = admitFacts(factRecord(key, value));
        break;
      case "breaker":
        facts.breaker = breakerFacts(factRecord(key, value));
        break;
      case "hitl":
        facts.hitl = hitlFacts(factRecord(key, value));
        break;
      // `units` travels unread for the same reason `signals` does; an absent one
      // reaches the waves section, which owns the message for it.
      case "waves":
        facts.waves = { units: factRecord(key, value)["units"] };
        break;
      default:
        throw new KernelError(`resolve --facts: unknown fact ${key}`);
    }
  }
  return facts;
}
function repairFacts(row) {
  const facts = { check: factString("repair.check", row["check"]) };
  if (row["attempt"] !== void 0) facts.attempt = factNumber("repair.attempt", row["attempt"]);
  if (row["situation"] !== void 0) facts.situation = factString("repair.situation", row["situation"]);
  return facts;
}
function admitFacts(row) {
  return {
    inflight: factNumber("admit.inflight", row["inflight"]),
    queued: factNumber("admit.queued", row["queued"])
  };
}
function breakerFacts(row) {
  const facts = { state: factString("breaker.state", row["state"]) };
  if (row["failures"] !== void 0) facts.failures = factNumber("breaker.failures", row["failures"]);
  if (row["cooldownElapsed"] !== void 0) {
    facts.cooldownElapsed = factBoolean("breaker.cooldownElapsed", row["cooldownElapsed"]);
  }
  if (row["probeResult"] !== void 0) facts.probeResult = factString("breaker.probeResult", row["probeResult"]);
  return facts;
}
function hitlFacts(row) {
  const facts = {
    riskTier: factTier("hitl.riskTier", row["riskTier"]),
    autonomy: factString("hitl.autonomy", row["autonomy"])
  };
  if (row["evidence"] !== void 0) facts.evidence = factString("hitl.evidence", row["evidence"]);
  if (row["externalEffect"] !== void 0) {
    facts.externalEffect = factFlag("hitl.externalEffect", row["externalEffect"]);
  }
  if (row["conflict"] !== void 0) facts.conflict = factFlag("hitl.conflict", row["conflict"]);
  if (row["situation"] !== void 0) facts.situation = factString("hitl.situation", row["situation"]);
  return facts;
}
function factRecord(at, value) {
  if (!isRecord(value)) throw new KernelError(`resolve --facts: ${at} must be an object`);
  return value;
}
function factString(at, value) {
  if (typeof value !== "string") throw new KernelError(`resolve --facts: ${at} must be a string`);
  return value;
}
function factBoolean(at, value) {
  if (typeof value !== "boolean") throw new KernelError(`resolve --facts: ${at} must be a boolean`);
  return value;
}
function factNumber(at, value) {
  if (typeof value !== "number") throw new KernelError(`resolve --facts: ${at} must be a number`);
  return value;
}
function factFlag(at, value) {
  if (typeof value !== "boolean" && typeof value !== "string") {
    throw new KernelError(`resolve --facts: ${at} must be a boolean or a string`);
  }
  return value;
}
function factTier(at, value) {
  if (!isRiskTier(value)) throw new KernelError(`resolve --facts: ${at} must be low|medium|high`);
  return value;
}
function parseSignals(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new KernelError("risk --signals is not valid JSON");
  }
}
function parseCount(raw) {
  if (raw === void 0) return Number.NaN;
  return /^[0-9]+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
}
function parseUnitsJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new KernelError("waves --units must be a JSON array");
  }
}

// src/journal/exec-journal.ts
var import_node_fs7 = require("node:fs");
var import_node_path5 = require("node:path");

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
    max_value_length: positiveInteger(block2["max_value_length"]),
    span_kinds: r.requireStrings(block2["span_kinds"], ".telemetry.exec_journal.span_kinds"),
    statuses: r.requireStrings(block2["statuses"], ".telemetry.exec_journal.statuses")
  };
}
function positiveInteger(value) {
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
  for (const { spec, text: text3 } of setInArgvOrder(fields)) {
    if (text3.length > maxLength) {
      throw new JournalError(`${spec.flag} must be at most ${maxLength} characters, got ${text3.length}`);
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
function validateFile(root, file, regs) {
  if (!(0, import_node_fs7.existsSync)(file)) throw new JournalError(`no such file: ${file}`);
  requireModelsRegistry(root);
  let text3;
  try {
    text3 = (0, import_node_fs7.readFileSync)(file, "utf8");
  } catch {
    throw new JournalError(`no such file: ${file}`);
  }
  const lines = text3.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const bad = [];
  lines.forEach((line, index) => {
    if (line === "") return;
    if (!validLine(line, regs)) bad.push(index + 1);
  });
  return { lines: lines.length, bad };
}
function usage(argv0) {
  const flags2 = EXEC_JOURNAL_FIELDS.map((spec) => {
    const term = `${spec.flag} ${placeholder(spec)}`;
    return spec.presence === "required" ? term : `[${term}]`;
  }).join(" ");
  return `usage: ${argv0} append <file> ${flags2}
       ${argv0} validate <file>
`;
}
function unset(value) {
  return value === void 0 || value === "";
}
function setInArgvOrder(fields) {
  const rows3 = [];
  for (const [name, value] of Object.entries(fields)) {
    const spec = BY_NAME.get(name);
    if (spec !== void 0 && value !== void 0) rows3.push({ spec, text: String(value) });
  }
  return rows3;
}
function placeholder(spec) {
  if (spec.json === "boolean") return "true|false";
  if (spec.guard === "int") return "N";
  if (spec.guard === "enum") return "ENUM";
  if (spec.guard === "free") return "TEXT";
  return "ID";
}
function requireModelsRegistry(root) {
  const path = (0, import_node_path5.join)(root, "registries", "models.json");
  if (!(0, import_node_fs7.existsSync)(path)) throw new JournalError(`no models registry at ${path}`);
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
    const text3 = String(value);
    row[spec.name] = spec.json === "number" ? Number.parseInt(text3, 10) : spec.json === "boolean" ? text3 === "true" : text3;
  }
  return row;
}
function writeLine(file, row) {
  try {
    (0, import_node_fs7.appendFileSync)(file, `${encode(row)}
`);
  } catch {
    throw new JournalError(`cannot append to ${file}`);
  }
}
function encode(row) {
  return JSON.stringify(row).replace(/\u007f/g, "\\u007f");
}
function validLine(line, regs) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (!validField(spec, parsed[spec.name], regs)) return false;
  }
  return true;
}
function validField(spec, value, regs) {
  if (spec.guard === "free") return true;
  const required = spec.presence === "required";
  if (spec.guard === "slug") {
    if (!required && (value === void 0 || value === null)) return true;
    return typeof value === "string" && SLUG_RE.test(value);
  }
  if (!required && jqAbsent(value)) return true;
  if (spec.guard === "int") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
  }
  if (spec.guard === "bool" || spec.json === "boolean") return typeof value === "boolean";
  const members = spec.values === void 0 ? [] : spec.values(regs);
  return typeof value === "string" && members.includes(value);
}
function jqAbsent(value) {
  return value === void 0 || value === null || value === false;
}

// src/journal/cli.ts
var ARGV0 = "scripts/exec-journal.sh";
var runJournal = (argv2, io2) => {
  const [name, ...rest] = argv2;
  try {
    if (name === "append") return append(rest, io2);
    if (name === "validate") return validate(rest, io2);
    throw new JournalError("", { usage: true });
  } catch (e) {
    if (e instanceof JournalError) {
      if (e.message !== "") io2.err(`${e.message}
`);
      if (e.usage) io2.err(usage(ARGV0));
      return 1;
    }
    if (e instanceof KernelError) {
      io2.err(`${e.message}
`);
      return 1;
    }
    throw e;
  }
};
function append(argv2, io2) {
  const root = resolveRoot(io2.env);
  const { file } = parseAppendArgs(argv2);
  appendLine(root, file, argv2, isoNow, journalRegistries(root));
  return 0;
}
function validate(argv2, io2) {
  const [file] = argv2;
  if (file === void 0 || file === "") throw new JournalError("", { usage: true });
  const root = resolveRoot(io2.env);
  const result2 = validateFile(root, file, journalRegistries(root));
  for (const line of result2.bad) io2.err(`line ${line}: does not match the exec-journal schema
`);
  if (result2.bad.length > 0) {
    io2.err(`${result2.bad.length} invalid line(s) in ${file}
`);
    return 1;
  }
  io2.out(`${file}: ${result2.lines} line(s), all valid
`);
  return 0;
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.[0-9]{3}Z$/, "Z");
}

// src/journal/telemetry.ts
var import_node_fs8 = require("node:fs");
var import_node_path6 = require("node:path");

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
var TelemetryUsageError = class extends Error {
  kind = "telemetry-usage";
};
var APPEND_USAGE_ARGV0 = "scripts/telemetry.sh";
function usage2(argv0 = APPEND_USAGE_ARGV0) {
  return [
    `usage: ${argv0} append <file> --session SID --event ID --data JSON [--ts TS]`,
    `       ${argv0} validate <file>`,
    ""
  ].join("\n");
}
function parseAppendArgs2(args) {
  const [file, ...rest] = args;
  if (file === void 0) throw new TelemetryUsageError();
  return { file, options: parseAppendFlags(rest) };
}
function requirePolicyPresent(root) {
  if (!(0, import_node_fs8.existsSync)((0, import_node_path6.join)(root, "registries", "policy.json"))) throw new TelemetryError("policy.json missing");
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
    (0, import_node_fs8.appendFileSync)(file, `${line}
`);
  } catch {
    throw new TelemetryError(`cannot append to ${file}`);
  }
}
function validateTelemetry(root, file) {
  if (!isFile2(file)) throw new TelemetryError(`no such file: ${file}`);
  requirePolicyPresent(root);
  const policy = loadTelemetryPolicy(root);
  const pattern = compilePattern(policy.value_pattern);
  const lines = readLines(file);
  const bad = [];
  lines.forEach((line, index) => {
    if (line === "") return;
    if (!lineIsValid(line, policy, pattern)) bad.push(index + 1);
  });
  return { lines: lines.length, bad };
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
var APPEND_FLAGS = ["--session", "--event", "--data", "--ts"];
function parseAppendFlags(args) {
  const values = /* @__PURE__ */ new Map();
  let index = 0;
  while (index < args.length) {
    if (args.length - index < 2) throw new TelemetryUsageError();
    const flag2 = args[index] ?? "";
    if (!APPEND_FLAGS.includes(flag2)) throw new TelemetryUsageError();
    values.set(flag2, args[index + 1] ?? "");
    index += 2;
  }
  const session = values.get("--session") ?? "";
  const event2 = values.get("--event") ?? "";
  const data = values.get("--data") ?? "";
  if (session === "" || event2 === "" || data === "") throw new TelemetryUsageError();
  const ts = values.get("--ts") ?? "";
  return ts === "" ? { session, event: event2, data } : { session, event: event2, data, ts };
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
function lineIsValid(line, policy, pattern) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  const ts = parsed["ts"];
  const session = parsed["session_id"];
  const event2 = parsed["event"];
  if (typeof ts !== "string" || ts.length === 0) return false;
  if (typeof session !== "string" || session.length === 0) return false;
  if (typeof event2 !== "string") return false;
  const known = policy.events.find((row) => row.id === event2);
  if (known === void 0) return false;
  const raw = parsed["data"];
  const data = raw === void 0 || raw === null || raw === false ? {} : raw;
  return dataIsValid(data, known.keys, pattern);
}
function isFile2(path) {
  try {
    return (0, import_node_fs8.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function readLines(file) {
  let text3;
  try {
    text3 = (0, import_node_fs8.readFileSync)(file, "utf8");
  } catch {
    throw new TelemetryError(`no such file: ${file}`);
  }
  if (text3 === "") return [];
  const parts = text3.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
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

// src/journal/telemetry-cli.ts
var runTelemetry = (argv2, io2) => {
  const [name, ...args] = argv2;
  try {
    if (name !== "append" && name !== "validate") throw new TelemetryUsageError();
    return name === "append" ? runAppend(args, io2) : runValidate(args, io2);
  } catch (e) {
    if (e instanceof TelemetryUsageError) {
      io2.err(usage2());
      return 1;
    }
    if (e instanceof TelemetryError || e instanceof KernelError) {
      writeJson(io2, { error: e.message });
      return 1;
    }
    throw e;
  }
};
function runAppend(args, io2) {
  if (args.length === 0) throw new TelemetryUsageError();
  const root = resolveRoot(io2.env);
  requirePolicyPresent(root);
  const { file, options } = parseAppendArgs2(args);
  appendEvent(root, file, options);
  return 0;
}
function runValidate(args, io2) {
  const file = args[0];
  if (file === void 0) throw new TelemetryUsageError();
  const root = resolveRoot(io2.env);
  const { lines, bad } = validateTelemetry(root, file);
  for (const line of bad) io2.err(`line ${line}: does not match the telemetry schema
`);
  if (bad.length > 0) {
    io2.err(`${bad.length} invalid line(s) in ${file}
`);
    return 1;
  }
  io2.out(`${file}: ${lines} line(s), all valid
`);
  return 0;
}

// src/hooks/envelope.ts
var import_node_child_process = require("node:child_process");
var NO_SESSION = "nosession";
function text(value) {
  return typeof value === "string" ? value : "";
}
function nested(payload, outer, inner) {
  const child2 = payload[outer];
  return isRecord(child2) ? child2[inner] : void 0;
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

// src/hooks/ensure-project-layout.ts
var import_node_fs12 = require("node:fs");
var import_node_path9 = require("node:path");

// src/hooks/bypass.ts
var import_node_fs10 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path7 = require("node:path");

// src/lib/git.ts
var import_node_fs9 = require("node:fs");
function gitOutput(cwd, args, spawn) {
  const result2 = spawn("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result2.error !== void 0 || result2.status !== 0) return null;
  const out = typeof result2.stdout === "string" ? result2.stdout.trim() : "";
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

// src/hooks/bypass.ts
function bypassFlagPath(env) {
  const configured = env["ENGINEOS_BYPASS_FLAG"];
  if (configured !== void 0 && configured !== "") return configured;
  const home = env["HOME"];
  return (0, import_node_path7.join)(home !== void 0 && home !== "" ? home : (0, import_node_os.homedir)(), ".claude", "engineos.bypass");
}
function bypassMarker(cwd, spawn) {
  const dir = gitDir(cwd === "" ? process.cwd() : cwd, spawn);
  return dir === null ? null : `${dir}/ENGINEOS_BYPASS`;
}
function bypassActive(cwd, env, spawn) {
  if (env["ENGINEOS_BYPASS"] === "1") return true;
  if ((0, import_node_fs10.existsSync)(bypassFlagPath(env))) return true;
  const marker = bypassMarker(cwd, spawn);
  return marker !== null && (0, import_node_fs10.existsSync)(marker);
}

// src/hooks/scaffold.ts
var import_node_fs11 = require("node:fs");
var import_node_path8 = require("node:path");
var { requireRecord: requireRecord3, requireString: requireString4, requireRows: requireRows4 } = strictReader("layout-manifest.json");
function loadLayoutManifest(engineosRoot) {
  const raw = readJsonFile((0, import_node_path8.join)(engineosRoot, "registries", "layout-manifest.json"));
  const doc = requireRecord3(raw, "");
  return requireRows4(doc["entries"], ".entries").map((row, i) => ({
    dir: requireString4(row["dir"], `.entries[${i}].dir`),
    seeds: requireRows4(row["seeds"], `.entries[${i}].seeds`).map((seed, j) => ({
      src: requireString4(seed["src"], `.entries[${i}].seeds[${j}].src`),
      dest: requireString4(seed["dest"], `.entries[${i}].seeds[${j}].dest`)
    }))
  }));
}
function scaffoldLayout(projectRoot, engineosRoot, manifest) {
  const created = [];
  for (const entry of manifest) {
    const existed = isDirectory2((0, import_node_path8.join)(projectRoot, entry.dir));
    const parent = scaffoldDir(projectRoot, entry.dir);
    if (parent === null) continue;
    if (!existed) created.push(entry.dir);
    for (const seed of entry.seeds) {
      const abs = seed.src.startsWith("@") ? (0, import_node_path8.join)(engineosRoot, seed.src.slice(1)) : (0, import_node_path8.join)(engineosRoot, "templates", "project-layout", seed.src);
      scaffoldSeed(parent, seed.dest, abs);
    }
  }
  return created;
}
function physDir(dir) {
  try {
    const real = (0, import_node_fs11.realpathSync)(dir);
    return (0, import_node_fs11.statSync)(real).isDirectory() ? real : null;
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
        (0, import_node_fs11.mkdirSync)(next);
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
  if (!isFile3(src)) return;
  if (lstatOrNull(`${parent}/${name}`) !== null) return;
  try {
    (0, import_node_fs11.copyFileSync)(src, `${parent}/${name}`);
  } catch {
  }
}
function lstatOrNull(path) {
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
function isFile3(path) {
  try {
    return (0, import_node_fs11.statSync)(path).isFile();
  } catch {
    return false;
  }
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
  if (project === null) return silent;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git !== null && isDirectory3(git)) {
    const now = ctx.now();
    reapUnrecordedFlags(git, now);
    wipeTree((0, import_node_path9.join)(git, ROUTE_CACHE));
    reapTelemetry(git, ctx, now);
  }
  if (isFile4((0, import_node_path9.join)(project, "hooks", "layout-manifest.sh")) && isFile4((0, import_node_path9.join)(project, "install.sh"))) return silent;
  const optIn = ctx.io.env["ENGINEOS_SCAFFOLD"];
  if (optIn === "0") return silent;
  if (optIn !== "1" && !isDirectory3((0, import_node_path9.join)(project, ".engineos"))) return context("SessionStart", OPT_IN_HINT);
  let created;
  try {
    created = scaffoldLayout(project, ctx.root, loadLayoutManifest(ctx.root));
  } catch {
    return silent;
  }
  if (created.length === 0) return silent;
  return context("SessionStart", `[engineos] scaffolded standard layout: ${created.join(", ")} (review seeded READMEs)`);
}
function reapUnrecordedFlags(git, now) {
  for (const name of readDirNames(git)) {
    if (!name.startsWith(UNRECORDED_PREFIX)) continue;
    reapIfStale((0, import_node_path9.join)(git, name), UNRECORDED_MAX_AGE_DAYS, now);
  }
}
function reapTelemetry(git, ctx, now) {
  const dir = (0, import_node_path9.join)(git, TELEMETRY);
  if (!isDirectory3(dir)) return;
  let days;
  try {
    days = loadTelemetryPolicy(ctx.root).retention_days;
  } catch {
    return;
  }
  if (!Number.isInteger(days) || days < 0) return;
  for (const name of readDirNames(dir)) {
    if (name.endsWith(".jsonl")) reapIfStale((0, import_node_path9.join)(dir, name), days, now);
  }
  const spans = (0, import_node_path9.join)(dir, SPANS);
  if (isDirectory3(spans)) reapFilesBelow(spans, days, now);
}
function reapFilesBelow(dir, days, now) {
  for (const entry of readDirEntries(dir)) {
    const path = (0, import_node_path9.join)(dir, entry.name);
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
  if (!isDirectory3(dir)) return;
  try {
    (0, import_node_fs12.rmSync)(dir, { recursive: true, force: true });
  } catch {
  }
}
function removeFile(path) {
  try {
    (0, import_node_fs12.unlinkSync)(path);
  } catch {
  }
}
function readDirNames(dir) {
  try {
    return (0, import_node_fs12.readdirSync)(dir);
  } catch {
    return [];
  }
}
function readDirEntries(dir) {
  try {
    return (0, import_node_fs12.readdirSync)(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function lstatOrNull2(path) {
  try {
    return (0, import_node_fs12.lstatSync)(path);
  } catch {
    return null;
  }
}
function isDirectory3(path) {
  try {
    return (0, import_node_fs12.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile4(path) {
  try {
    return (0, import_node_fs12.statSync)(path).isFile();
  } catch {
    return false;
  }
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
  const narrowed = mapBytes(value, PATH_EXTRA);
  return narrowed === "" ? null : narrowed;
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
function selfDirs(root) {
  try {
    return loadRouting(root).excluded.self_dirs;
  } catch {
    return [];
  }
}
function run2(env, ctx) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.file === "") return silent;
  if (!isRecordedExtension(env.file)) return silent;
  if (globMatch(ENGINEOS_META, env.file)) return silent;
  for (const dir2 of selfDirs(ctx.root)) {
    if (dir2 === "") continue;
    if (env.file.startsWith(`${ctx.root}/${dir2}/`)) return silent;
  }
  if (env.cwd === "") return silent;
  const dir = gitDir(env.cwd, ctx.spawn);
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
var import_node_fs15 = require("node:fs");
var import_node_path10 = require("node:path");

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

// src/hooks/route-before-change.ts
var EXCLUDED_SENTINEL = "__ENGINEOS_EXCLUDED__";
var DEFAULT_GUIDE = "base.md+git.md only";
var CHANGE_RECORD_NOTE = " | no active .engineos/changes record \u2014 open one (.engineos/changes/_template.md)";
var CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".sql"];
var ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;
var NO_GIT = { repo: "", gitDir: "", prefix: "" };
function run4(env, ctx) {
  if (env.file === "") return silent;
  const start = dirOf(env.file);
  const from = env.cwd === "" ? start : env.cwd;
  if (bypassActive(from, ctx.io.env, ctx.spawn)) return silent;
  const git = gitInfo(from, ctx);
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
function gitInfo(cwd, ctx) {
  const result2 = ctx.spawn("git", ["-C", cwd, "rev-parse", "--show-toplevel", "--absolute-git-dir", "--show-prefix"], { encoding: "utf8" });
  if (result2.error !== void 0 || result2.status !== 0) return NO_GIT;
  const lines = (typeof result2.stdout === "string" ? result2.stdout : "").split("\n");
  return { repo: lines[0] ?? "", gitDir: lines[1] ?? "", prefix: lines[2] ?? "" };
}
function cachePaths(env, git, ctx) {
  if (git.gitDir === "") return null;
  const rel = cacheRel(env.file, git, env.cwd);
  if (rel === "") return null;
  return routeCachePaths(git.gitDir, env.sessionId, routingSignature(ctx.root), ctx.io.env["ENGINEOS_ROUTE_CACHE_BUSTER"] ?? "", rel);
}
function cacheRel(file, git, cwd) {
  if (git.repo !== "" && file.startsWith(`${git.repo}/`)) return file.slice(git.repo.length + 1);
  const base = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  if (file.startsWith(`${base}/`)) return `${git.prefix}${file.slice(base.length + 1)}`;
  return "";
}
function routingSignature(root) {
  try {
    const stats = (0, import_node_fs15.statSync)((0, import_node_path10.join)(root, "registries", "routing.json"));
    return `${Math.floor(stats.mtimeMs / 1e3)}-${stats.size}`;
  } catch {
    return "unknown";
  }
}
function readGuide(path) {
  let contents;
  try {
    contents = (0, import_node_fs15.readFileSync)(path, "utf8");
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
    parsed = JSON.parse((0, import_node_fs15.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed["kind"] !== "context" || parsed["event"] !== "PreToolUse") return null;
  const text3 = parsed["text"];
  return typeof text3 === "string" ? context("PreToolUse", text3) : null;
}
function changeRecordNote(file, repo) {
  if (repo === "") return "";
  if (!CODE_EXTENSIONS.some((extension) => file.endsWith(extension))) return "";
  const dir = (0, import_node_path10.join)(repo, ".engineos", "changes");
  if (!isDirectory4(dir)) return "";
  return hasActiveRecord(dir) ? "" : CHANGE_RECORD_NOTE;
}
function isDirectory4(path) {
  try {
    return (0, import_node_fs15.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function hasActiveRecord(dir) {
  let entries;
  try {
    entries = (0, import_node_fs15.readdirSync)(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    let contents;
    try {
      contents = (0, import_node_fs15.readFileSync)((0, import_node_path10.join)(dir, entry), "utf8");
    } catch {
      continue;
    }
    if (ACTIVE_RECORD.test(contents)) return true;
  }
  return false;
}
function writeAtomic(path, contents) {
  const cut = path.lastIndexOf("/");
  try {
    if (cut > 0) (0, import_node_fs15.mkdirSync)(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    (0, import_node_fs15.writeFileSync)(tmp, contents);
    (0, import_node_fs15.renameSync)(tmp, path);
  } catch {
  }
}

// src/hooks/prompt-advisor-guidance.ts
function guidanceNotes(task) {
  return [
    ...scaleNotes(task.contract),
    ...decisionNote(task.decisions),
    ...routeNote(task),
    ...hitlNote(task.hitl),
    ...classifyNote(task)
  ];
}
function scaleNotes(contract) {
  const notes = [];
  if (contract.scale.big_task) {
    notes.push(
      "[engineos] big-task signal \u2014 apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself."
    );
  }
  if (contract.scale.spec_authoring) {
    notes.push(
      "[engineos] spec/PRD authoring \u2014 rules/models.md: use the most-capable tier (model: fable). If the session model is lower, delegate the authoring to a subagent with that model."
    );
  }
  if (contract.scale.design_work) {
    notes.push(
      "[engineos] design/architecture work \u2014 rules/models.md: design tier (model: opus) for the design pass, build tier (model: opus) for the code that follows."
    );
  }
  return notes;
}
function decisionNote(decisions) {
  if (decisions.matches.length === 0) return [];
  const lines = decisions.matches.map(matchLine).join("\n");
  const high = decisions.any_high ? "\n[engineos] a matched rule sets risk=high \u2014 autonomy ceiling A3 per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release." : "";
  return [
    `[engineos] decision rules matched this prompt (registries/decision-rules.json).
${lines}
Confirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only \u2014 apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md.${high}`
  ];
}
function matchLine(match) {
  return `  - ${match.id}` + (match.require.length > 0 ? ` \u2014 require: ${match.require.join(", ")}` : "") + (declared2(match.prefer) ? ` \u2014 prefer: ${match.prefer}` : "") + (declared2(match.gate) ? ` [gate: ${match.gate}]` : "") + (declared2(match.risk) ? ` [risk: ${match.risk}]` : "");
}
function routeNote(task) {
  const { route, contract } = task;
  if (route.escalate) {
    const scale = Object.entries(route.scale).map(([key, value]) => `${key}=${String(value)}`).join(" ");
    return [
      `[engineos] route escalation \u2014 the kernel could not fully resolve this request: ${route.reasons.join(", ")}. Dispatch the \`router\` agent (agents/router.md, model opus) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=${csv(route.intents)} agents=${csv(route.agents)} scale=(${scale}). A hook cannot dispatch an agent \u2014 you must invoke it.`
    ];
  }
  if (contract.substantive) {
    return [
      `[engineos] task contract (kernel, deterministic): intents=${csv(contract.intents)} agents=${csv(contract.agents)} rules=${csv(contract.rules)} policy_rules=${csv(contract.policy_rules)} skills=${csv(contract.skills)} commands=${csv(contract.commands)} mcp=${csv(contract.mcp)} model_tier=${orDash(contract.model_tier)} risk_floor=${orDash(contract.risk_floor)} autonomy_ceiling_at_floor=${orDash(contract.autonomy_ceiling_at_floor)} \u2014 load these before acting; the risk floor is a floor, not the final tier. No router dispatch needed.`
    ];
  }
  return [];
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
function csv(values) {
  return values.length === 0 ? "-" : values.join(",");
}
function orDash(value) {
  return value === null ? "-" : value;
}
function declared2(value) {
  return value !== null && value !== "";
}

// src/hooks/telemetry.ts
var import_node_crypto = require("node:crypto");
var import_node_fs17 = require("node:fs");
var import_node_path12 = require("node:path");

// src/hooks/span-writer.ts
var import_node_fs16 = require("node:fs");
var import_node_path11 = require("node:path");

// src/lib/time.ts
var MS_DIGITS_MIN = 12;
function plausibleMs(value) {
  if (!/^[0-9]+$/.test(value)) return false;
  return value.length >= MS_DIGITS_MIN;
}
function parseMs(text3) {
  const trimmed = text3.trim();
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
  const journalFile = (0, import_node_path11.join)(opts.dir, `${name}.exec.jsonl`);
  const eventsFile = (0, import_node_path11.join)(opts.dir, `${name}.jsonl`);
  const markers = (0, import_node_path11.join)(opts.dir, "spans");
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
      const text3 = readMarker(marker);
      if (text3 === null) return null;
      (0, import_node_fs16.rmSync)(marker, { force: true });
      return parseMs(text3);
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
  return name === null ? null : (0, import_node_path11.join)(dir, name);
}

// src/hooks/telemetry.ts
function telemetrySink(env, ctx, opts) {
  if (ctx.io.env["ENGINEOS_TELEMETRY"] === "0") return null;
  if (opts.bypassed) return null;
  if (env.cwd === "") return null;
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !(0, import_node_fs17.existsSync)((0, import_node_path12.join)(project, ".engineos"))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === "") return null;
  const dir = (0, import_node_path12.join)(git, "engineos-telemetry");
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
function spanIdFrom(env) {
  const payload = isRecord(env.raw) ? env.raw : {};
  const toolUseId = payload["tool_use_id"];
  if (typeof toolUseId === "string" && toolUseId !== "") return hookSlug(toolUseId);
  const input = isRecord(payload["tool_input"]) ? payload["tool_input"] : {};
  const brief = `${orEmpty(input["subagent_type"])}:${orEmpty(input["description"])}
`;
  return hookSlug((0, import_node_crypto.createHash)("sha1").update(brief, "utf8").digest("hex").slice(0, 12));
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
var NO_ROUTE = "none";
function run5(env, ctx) {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return context("UserPromptSubmit", BYPASS_NOTICE);
  if (env.prompt === "") return silent;
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const task = resolveTask(env.prompt, ctx, sink);
  if (task === null) return silent;
  writeEvents(sink, task);
  const notes = guidanceNotes(task);
  if (notes.length === 0) return silent;
  return context("UserPromptSubmit", notes.join("\n"));
}
function resolveTask(prompt, ctx, sink) {
  const kernel = { root: ctx.root, registries: lazyRegistries(ctx.root) };
  try {
    return withSpan(sink, ROUTER_SPAN, () => {
      const task = narrow(resolve({ prompt, taskContract: true }, kernel));
      return { result: task, status: "OK", fields: spanFields(task) };
    });
  } catch {
    return null;
  }
}
function narrow(answer) {
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (contract === void 0 || decisions === void 0 || route === void 0 || !("escalate" in route)) {
    throw new KernelError("resolve-task: the kernel answered no task contract");
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null };
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

// src/hooks/stop-verify.ts
var import_node_path15 = require("node:path");
var import_node_fs20 = require("node:fs");

// src/hooks/classify-failure.ts
var NODE_FLOOR = 18;
var TARGET_ABSENT = {
  nx: "cannot find (project|target) |does not have (a|an) .* target|cannot find configuration for task",
  "npm-family": 'missing script:|command "<t>" not found|find a script named "<t>"'
};
function classify2(evidence) {
  switch (evidence.kind) {
    case "environment":
      return evidence.nodeMajor < NODE_FLOOR ? { situation: "infra", reason: "node-too-old" } : null;
    case "runner":
      return evidence.found ? null : { situation: "infra", reason: "runner-missing" };
    case "run": {
      if (evidence.timedOut) return { situation: "infra", reason: "timeout" };
      if (evidence.code === 0) return null;
      if (targetAbsent(evidence.runner, evidence.target).test(evidence.output)) {
        return { situation: "infra", reason: "target-absent" };
      }
      return { situation: "red" };
    }
  }
}
function targetAbsent(runner, target) {
  return new RegExp(TARGET_ABSENT[runner].split("<t>").join(escapeRegExp(target)), "i");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/hooks/runner.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs18 = require("node:fs");
var import_node_path13 = require("node:path");
var defaultSpawn = (command, args, options) => (0, import_node_child_process2.spawnSync)(command, args, options);
var MODERN_NODE_MAJOR = 20;
function runnerSelect(root, exists = defaultExists) {
  const kind = exists((0, import_node_path13.join)(root, "nx.json")) ? "nx" : "npm-family";
  if (exists((0, import_node_path13.join)(root, "pnpm-lock.yaml"))) return { kind, run: "pnpm run", exec: "pnpm exec" };
  if (exists((0, import_node_path13.join)(root, "yarn.lock"))) return { kind, run: "yarn run", exec: "yarn" };
  return { kind, run: "npm run", exec: "npx --no-install" };
}
function runnerHandle(sel, pkgDir, readFile = defaultReadFile) {
  if (sel.kind !== "nx") return pkgDir;
  const project = readName(readFile((0, import_node_path13.join)(pkgDir, "project.json")));
  if (project !== null) return project;
  const pkg = readName(readFile((0, import_node_path13.join)(pkgDir, "package.json")));
  return pkg === null ? null : pkg.replace(/^@[^/]*\//, "");
}
function runnerHasTarget(sel, handle, target, readFile = defaultReadFile, spawn = defaultSpawn, cwd = process.cwd()) {
  if (sel.kind === "nx") {
    const argv2 = [...words(sel.exec), "nx", "show", "project", handle, "--json"];
    const shown = spawn(argv2[0] ?? "", argv2.slice(1), { cwd, encoding: "utf8" });
    if (shown.status !== 0) return false;
    return declared3(parseJson(shown.stdout), "targets", target);
  }
  return declared3(parseJson(readFile((0, import_node_path13.join)(handle, "package.json"))), "scripts", target);
}
function runnerRun(sel, handle, target, timeoutSeconds, env, spawn = defaultSpawn, cwd = process.cwd()) {
  const argv2 = sel.kind === "nx" ? [...words(sel.exec), "nx", "run", `${handle}:${target}`] : [...words(sel.run), "-s", target];
  const runCwd = sel.kind === "nx" ? cwd : handle;
  const result2 = spawn(argv2[0] ?? "", argv2.slice(1), {
    cwd: runCwd,
    env,
    encoding: "utf8",
    timeout: timeoutSeconds * 1e3
  });
  const timedOut = errorCodeOf(result2.error) === "ETIMEDOUT" || result2.signal === "SIGTERM";
  const output = `${result2.stdout ?? ""}${result2.stderr ?? ""}`;
  const code = typeof result2.status === "number" ? result2.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}
function runnerEnv(env, nodeMajorOnPath, exists = defaultExists, readLink = defaultReadFile, listDir = defaultListDir) {
  if (nodeMajorOnPath >= MODERN_NODE_MAJOR) return env;
  const home = env["HOME"];
  const nvmDir = env["NVM_DIR"] ?? (home === void 0 || home === "" ? null : (0, import_node_path13.join)(home, ".nvm"));
  if (nvmDir === null || nvmDir === "") return env;
  const alias = (0, import_node_path13.join)(nvmDir, "alias", "default");
  if (!exists(alias)) return env;
  const wanted = (readLink(alias) ?? "").trim();
  if (wanted === "") return env;
  const versionsDir = (0, import_node_path13.join)(nvmDir, "versions", "node");
  let bin = null;
  for (const name of listDir(versionsDir).sort()) {
    if (!name.startsWith(`v${wanted}`)) continue;
    if (majorOf(name) < MODERN_NODE_MAJOR) continue;
    const candidate = (0, import_node_path13.join)(versionsDir, name, "bin");
    if (exists((0, import_node_path13.join)(candidate, "node"))) bin = candidate;
  }
  if (bin === null) return env;
  const current = env["PATH"] ?? "";
  return { ...env, PATH: current === "" ? bin : `${bin}${import_node_path13.delimiter}${current}` };
}
function declared3(doc, field, name) {
  if (!isRecord(doc)) return false;
  const table2 = doc[field];
  if (!isRecord(table2)) return false;
  const value = table2[name];
  return value !== void 0 && value !== null && value !== false;
}
function errorCodeOf(error) {
  const candidate = error;
  if (!isRecord(candidate)) return null;
  const code = candidate["code"];
  return typeof code === "string" ? code : null;
}
function readName(text3) {
  const doc = parseJson(text3);
  if (!isRecord(doc)) return null;
  const name = doc["name"];
  return typeof name === "string" && name !== "" ? name : null;
}
function parseJson(text3) {
  if (text3 === null || text3 === void 0 || text3 === "") return null;
  try {
    return JSON.parse(text3);
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
  return (0, import_node_fs18.existsSync)(p);
}
function defaultReadFile(p) {
  try {
    return (0, import_node_fs18.readFileSync)(p, "utf8");
  } catch {
    return null;
  }
}
function defaultListDir(p) {
  try {
    return (0, import_node_fs18.readdirSync)(p);
  } catch {
    return [];
  }
}

// src/hooks/verify-targets.ts
var import_node_fs19 = require("node:fs");
var import_node_path14 = require("node:path");
var VERIFY_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
var PACKAGE_MARKERS = ["package.json", "project.json"];
var NODE_MODULES = "node_modules";
var SUMMARY_LINES = 80;
var PROBE_TIMEOUT_SECONDS = 15;
function hasVerifyExtension(file) {
  return VERIFY_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}
function findUpAny(start, names2, stop) {
  const from = (0, import_node_path14.resolve)(start);
  const ceiling2 = stop === void 0 ? void 0 : (0, import_node_path14.resolve)(stop);
  if (ceiling2 !== void 0 && !isWithin(ceiling2, from)) return null;
  let dir = from;
  for (; ; ) {
    for (const name of names2) {
      if ((0, import_node_fs19.existsSync)((0, import_node_path14.join)(dir, name))) return dir;
    }
    if (ceiling2 !== void 0 && (0, import_node_path14.relative)(ceiling2, dir) === "") return null;
    const parent = (0, import_node_path14.dirname)(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function isWithin(ceiling2, path) {
  const inside = (0, import_node_path14.relative)(ceiling2, path);
  if (inside === "") return true;
  if ((0, import_node_path14.isAbsolute)(inside)) return false;
  return inside !== ".." && !inside.startsWith(`..${import_node_path14.sep}`);
}
function startDir(file) {
  const dir = (0, import_node_path14.dirname)(file);
  try {
    return (0, import_node_fs19.realpathSync)(dir);
  } catch {
    return (0, import_node_path14.resolve)(dir);
  }
}
function containedIn(root, candidate) {
  let rootReal;
  let candidateReal;
  try {
    rootReal = (0, import_node_fs19.realpathSync)(root);
    candidateReal = (0, import_node_fs19.realpathSync)(candidate);
  } catch {
    return false;
  }
  if (!isWithin(rootReal, candidateReal)) return false;
  return !(0, import_node_path14.relative)(rootReal, candidateReal).split(import_node_path14.sep).includes(NODE_MODULES);
}
function isDirectory5(path) {
  try {
    return (0, import_node_fs19.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile5(path) {
  try {
    return (0, import_node_fs19.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function verifyEnvironment(env, version = process.versions.node) {
  const onPath2 = majorOf2(version);
  const fixed = runnerEnv(env, onPath2);
  if (fixed === env) return { env, nodeMajor: onPath2 };
  const prepended = (fixed["PATH"] ?? "").split(import_node_path14.delimiter)[0] ?? "";
  const found = /\/v(\d+)[^/]*\/bin$/.exec(prepended);
  const rescued = found === null ? Number.NaN : Number.parseInt(found[1] ?? "", 10);
  return { env: fixed, nodeMajor: Number.isNaN(rescued) ? onPath2 : rescued };
}
function runnerCommand(sel) {
  const command = (sel.kind === "nx" ? sel.exec : sel.run).split(" ").find((part) => part !== "");
  return command ?? "";
}
function runnerFound(sel, env, spawn, cwd) {
  const command = runnerCommand(sel);
  if (command === "") return false;
  return execRun(spawn, command, ["--version"], cwd, env, PROBE_TIMEOUT_SECONDS).code === 0;
}
function execRun(spawn, command, args, cwd, env, timeoutSeconds) {
  const result2 = spawn(command, args, { cwd, env, encoding: "utf8", timeout: timeoutSeconds * 1e3 });
  const timedOut = errorCodeOf2(result2.error) === "ETIMEDOUT" || result2.signal === "SIGTERM";
  const output = `${result2.stdout ?? ""}${result2.stderr ?? ""}`;
  const code = typeof result2.status === "number" ? result2.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}
function failureBlock(target, subject, output) {
  return `--- ${target} failed (${subject}) ---
${output.replace(/\n+$/, "")}`;
}
function firstLines(text3, limit) {
  return text3.split("\n").slice(0, limit).join("\n");
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
  if (!isFile5(env.transcriptPath)) return silent;
  if (env.cwd === "") return silent;
  const root = repoRoot(env.cwd, ctx.spawn);
  if (root === null) return silent;
  if (!isDirectory5((0, import_node_path15.join)(root, ".engineos"))) return silent;
  const files = changedFiles(env.transcriptPath);
  if (files.length === 0) return silent;
  const environment = verifyEnvironment(ctx.io.env, nodeVersion);
  const tooOld = classify2({ kind: "environment", nodeMajor: environment.nodeMajor });
  if (tooOld !== null && tooOld.situation === "infra") {
    return message(infraLine(tooOld.reason, targetsFor(ctx.io.env), `node ${environment.nodeMajor} cannot start the toolchain`));
  }
  const packages = packageDirs(files, root);
  if (packages.length === 0) return silent;
  const targets = targetsFor(ctx.io.env);
  const selection = runnerSelect(root);
  const missing = classify2({ kind: "runner", found: runnerFound(selection, environment.env, spawn, root) });
  if (missing !== null && missing.situation === "infra") {
    return message(infraLine(missing.reason, targets, `${runnerCommand(selection)} is not on PATH`));
  }
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const ladder = withSpan(sink, VERIFICATION_SPAN, () => {
    const result2 = runLadder(selection, packages, targets, environment.env, spawn, root);
    return { result: result2, status: ladderStatus(result2) };
  });
  event(sink, "verify", verifyEvent(root, packages, ladder));
  if (ladder.failures.length > 0) return block(blockReason(ctx.root, ladder.failures));
  if (ladder.timeouts.length > 0) return message(timeoutLines(ladder.timeouts));
  return silent;
}
function targetsFor(env) {
  return env["ENGINEOS_VERIFY_TESTS"] === "1" ? [...DEFAULT_TARGETS, TEST_TARGET] : DEFAULT_TARGETS;
}
function changedFiles(path) {
  let text3;
  try {
    text3 = (0, import_node_fs20.readFileSync)(path, "utf8");
  } catch {
    return [];
  }
  const files = /* @__PURE__ */ new Set();
  for (const line of text3.split("\n")) {
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
    stopReal = (0, import_node_fs20.realpathSync)(root);
  } catch {
    return [];
  }
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const owner = findUpAny(startDir(file), PACKAGE_MARKERS, stopReal);
    if (owner === null) continue;
    if (containedIn(stopReal, owner)) dirs.add(owner);
  }
  return [...dirs].sort();
}
function runLadder(selection, packages, targets, env, spawn, root) {
  const failures = [];
  const timeouts = [];
  for (const packageDir of packages) {
    if (!isDirectory5(packageDir)) continue;
    const handle = runnerHandle(selection, packageDir);
    if (handle === null) continue;
    for (const target of targets) {
      if (!runnerHasTarget(selection, handle, target, void 0, spawn, root)) continue;
      const seconds = target === TEST_TARGET ? 180 : 90;
      const result2 = runnerRun(selection, handle, target, seconds, env, spawn, root);
      const verdict = classify2({ kind: "run", runner: selection.kind, target, code: result2.code, output: result2.output, timedOut: result2.timedOut });
      if (verdict === null) continue;
      if (verdict.situation === "red") {
        failures.push({ target, handle, output: result2.output });
        continue;
      }
      if (verdict.reason === "timeout") timeouts.push({ target, handle, seconds });
    }
  }
  return { failures, timeouts };
}
function ladderStatus(ladder) {
  if (ladder.failures.length > 0) return "FAILED";
  return ladder.timeouts.length > 0 ? "DEGRADED" : "OK";
}
function relativeToRoot(root, dir) {
  if (dir === root) return ".";
  return dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir;
}
function verifyEvent(root, packages, ladder) {
  const data = {
    failed: ladder.failures.length > 0,
    targets: packages.map((dir) => relativeToRoot(root, dir))
  };
  if (ladder.failures.length > 0) {
    data["situation"] = "red";
    return data;
  }
  if (ladder.timeouts.length > 0) {
    data["situation"] = "infra";
    data["reason"] = "timeout";
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
function infraLine(reason2, targets, subject) {
  return `EngineOS gate: ${targets.join(", ")} skipped \u2014 infra (${reason2}): ${subject}. No fix attempt is consumed.`;
}
function timeoutLines(timeouts) {
  return timeouts.map((t) => infraLine("timeout", [t.target], `${t.handle} hit its ${t.seconds}s budget`)).join("\n");
}

// src/hooks/post-edit-check.ts
var import_node_fs21 = require("node:fs");
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
  if (!isFile5(env.file)) return silent;
  if (env.cwd === "") return silent;
  let stopReal;
  try {
    stopReal = (0, import_node_fs21.realpathSync)(env.cwd);
  } catch {
    return silent;
  }
  const start = startDir(env.file);
  const packageDir = findUpAny(start, PACKAGE_MARKERS, stopReal);
  if (packageDir === null) return silent;
  if (!containedIn(stopReal, packageDir)) return silent;
  const workspace = findUpAny(start, WORKSPACE_MARKERS, stopReal);
  const root = workspace !== null && containedIn(stopReal, workspace) ? workspace : packageDir;
  const environment = verifyEnvironment(ctx.io.env);
  const selection = runnerSelect(root);
  const failures = [
    ...typecheck(selection, packageDir, root, environment.env, spawn),
    ...lint(selection, env.file, start, root, stopReal, environment.env, spawn)
  ];
  if (failures.length === 0) return silent;
  return fail(firstLines(`
${failures.map((f) => failureBlock(f.target, f.subject, f.output)).join("\n")}`, SUMMARY_LINES));
}
function typecheck(selection, packageDir, root, env, spawn) {
  const handle = runnerHandle(selection, packageDir);
  if (handle === null) return [];
  if (!runnerHasTarget(selection, handle, TYPECHECK_TARGET, void 0, spawn, root)) return [];
  const result2 = runnerRun(selection, handle, TYPECHECK_TARGET, TYPECHECK_TIMEOUT_SECONDS, env, spawn, root);
  return redOf(selection, TYPECHECK_TARGET, handle, result2);
}
function lint(selection, file, start, root, stop, env, spawn) {
  for (const linter of LINTERS) {
    const configDir = findUpAny(start, linter.configs, stop);
    if (configDir === null || !containedIn(stop, configDir)) continue;
    const exec = selection.exec.split(" ").filter((part) => part !== "");
    const command = exec[0] ?? "";
    if (command === "") return [];
    const rest = exec.slice(1);
    if (execRun(spawn, command, [...rest, linter.target, "--version"], root, env, PROBE_TIMEOUT_SECONDS).code !== 0) return [];
    const args = linter.target === "biome" ? [...rest, linter.target, "check", file] : [...rest, linter.target, file];
    const result2 = execRun(spawn, command, args, root, env, LINT_TIMEOUT_SECONDS);
    return redOf(selection, linter.target, file, result2);
  }
  return [];
}
function redOf(selection, target, subject, result2) {
  const verdict = classify2({ kind: "run", runner: selection.kind, target, code: result2.code, output: result2.output, timedOut: result2.timedOut });
  if (verdict === null || verdict.situation !== "red") return [];
  return [{ target, subject, output: result2.output }];
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
  "post-edit-check": run9
};
var runHook = (argv2, io2) => {
  const name = argv2[0];
  const hook = name === void 0 ? void 0 : HOOKS[name];
  if (hook === void 0) return render(fail(`engineos hook: unknown hook: ${name ?? ""}
`), io2);
  const env = readEnvelope(io2);
  if (env === null) return render(silent, io2);
  try {
    return render(hook(env, hookContext(env, io2)), io2);
  } catch (e) {
    io2.err(`[engineos] ${name ?? "hook"} failed: ${e instanceof Error ? e.message : String(e)}
`);
    return render(silent, io2);
  }
};

// src/init/cli.ts
var import_node_child_process3 = require("node:child_process");

// src/init/project.ts
var import_node_fs22 = require("node:fs");
var import_node_path16 = require("node:path");
var IMPORT_LINE = /^@\S+[/\\]CLAUDE\.md\s*$/;
var EXIT_OK = 0;
var EXIT_ENVIRONMENT = 1;
var EXIT_NOT_GIT = 2;
var EXIT_SELF = 3;
var EXIT_USAGE = 64;
var USAGE = "usage: engineos init [--dir PATH] [--dry-run]";
var REQUIRED_SIBLINGS = ["hooks/scaffold-layout.sh", "hooks/layout-manifest.sh", "registries/layout-manifest.json"];
var CLAUDE_MD_SEED = [
  { dir: "", seeds: [{ src: "@templates/project-claude.md", dest: "CLAUDE.md" }] }
];
function initProject(argv2, deps) {
  const { io: io2, root } = deps;
  const parsed = parseArgs(argv2, io2.cwd());
  if (!parsed.ok) {
    io2.err(`${parsed.message}
`);
    return EXIT_USAGE;
  }
  const { dir: target, dryRun } = parsed.options;
  const project = repoRoot(target, deps.spawn);
  if (project === null) {
    io2.err(`[engineos] ${target} is not inside a git work tree
`);
    return EXIT_NOT_GIT;
  }
  if (isEngineosCheckout(project, root)) {
    io2.err("[engineos] refusing to init inside the EngineOS repo\n");
    return EXIT_SELF;
  }
  const home = io2.env["HOME"];
  if (home === void 0 || home === "") {
    io2.err("[engineos] HOME is unset or empty \u2014 cannot locate ~/.claude/CLAUDE.md\n");
    return EXIT_ENVIRONMENT;
  }
  if (!hasMachineInstall((0, import_node_path16.join)(home, ".claude", "CLAUDE.md"))) {
    io2.err(`[engineos] machine install not found in ~/.claude/CLAUDE.md \u2014 run once: ${root}/install.sh
`);
    return EXIT_ENVIRONMENT;
  }
  for (const sibling of REQUIRED_SIBLINGS) {
    if (!isFile6(`${root}/${sibling}`)) {
      io2.err(`[engineos] broken checkout: ${root}/${sibling} is missing
`);
      return EXIT_ENVIRONMENT;
    }
  }
  let manifest;
  try {
    manifest = loadLayoutManifest(root);
  } catch {
    io2.err(`[engineos] broken checkout: ${root}/registries/layout-manifest.json is unreadable
`);
    return EXIT_ENVIRONMENT;
  }
  io2.out(`[engineos] adopting EngineOS in ${project}
`);
  if (dryRun) io2.out("(dry run \u2014 nothing written)\n");
  if (dryRun) {
    io2.out(`  would ensure: ${manifest.map((entry) => entry.dir).join(", ")}
`);
  } else {
    const created = scaffoldLayout(project, root, manifest);
    io2.out(created.length > 0 ? `  created: ${created.join(", ")}
` : "  layout: already complete\n");
  }
  writeProjectClaudeMd({ io: io2, project, root, dryRun });
  io2.out(doneMessage(root));
  return EXIT_OK;
}
function writeProjectClaudeMd(opts) {
  const { io: io2, project, root, dryRun } = opts;
  const claudeMd = (0, import_node_path16.join)(project, "CLAUDE.md");
  if (lstatOk(claudeMd)) {
    io2.out("  CLAUDE.md: exists, left untouched (declare your stack there \u2014 see templates/project-claude.md)\n");
    return;
  }
  if (dryRun) {
    io2.out("  would create CLAUDE.md from templates/project-claude.md\n");
    return;
  }
  scaffoldLayout(project, root, CLAUDE_MD_SEED);
  io2.out(
    isFile6(claudeMd) ? "  CLAUDE.md: created from templates/project-claude.md \u2014 fill in the Stack and Commands sections\n" : "  CLAUDE.md: skipped \u2014 the project root did not resolve to a directory inside itself\n"
  );
}
function doneMessage(root) {
  return `
Done. EngineOS is now the default methodology for this project:
  - routing, risk, gates and the change-record Stop gate are active on the next Claude Code session
  - commit .engineos/ and CLAUDE.md so teammates get the same behaviour

Optional next steps (docs/ADOPTION.md sections 4-6):
  - MCP servers for the read-only specialists: ${root}/templates/mcp.template.json
  - CI agents:                                  ${root}/docs/ADOPTION.md#5
  - confirm the gates are live:                 open a session, edit a file, expect a [router] line
`;
}
function parseArgs(argv2, cwd) {
  let dir = cwd;
  let dryRun = false;
  for (let i = 0; i < argv2.length; i += 1) {
    const arg = argv2[i];
    if (arg === "--dir") {
      const value = argv2[i + 1];
      if (value === void 0) return { ok: false, message: "--dir needs a path" };
      dir = value;
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      return { ok: false, message: USAGE };
    }
  }
  return { ok: true, options: { dir, dryRun } };
}
function isEngineosCheckout(project, root) {
  const marked = isFile6((0, import_node_path16.join)(project, "hooks", "layout-manifest.sh")) && isFile6((0, import_node_path16.join)(project, "hooks", "hooks.json")) && isFile6((0, import_node_path16.join)(project, "install.sh"));
  return marked || project === root || physical(project) === physical(root);
}
function hasMachineInstall(claudeMd) {
  let text3;
  try {
    text3 = (0, import_node_fs22.readFileSync)(claudeMd, "utf8");
  } catch {
    return false;
  }
  return text3.split("\n").some((line) => IMPORT_LINE.test(line));
}
function physical(path) {
  try {
    return (0, import_node_fs22.realpathSync)(path);
  } catch {
    return path;
  }
}
function lstatOk(path) {
  try {
    (0, import_node_fs22.lstatSync)(path);
    return true;
  } catch {
    return false;
  }
}
function isFile6(path) {
  try {
    return (0, import_node_fs22.statSync)(path).isFile();
  } catch {
    return false;
  }
}

// src/init/cli.ts
var runInit = (argv2, io2) => {
  let root;
  try {
    root = resolveRoot(io2.env);
  } catch {
    io2.err("[engineos] broken checkout: cannot locate the EngineOS root (no registries/routing.json above the runtime)\n");
    return 1;
  }
  return initProject(argv2, { io: io2, root, spawn: import_node_child_process3.spawnSync });
};

// src/install/cli.ts
var import_node_fs23 = require("node:fs");

// src/install/settings-merge.ts
var SETTINGS_NOT_OBJECT = "settings.json is not a JSON object";
var PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
var QUOTED_PLACEHOLDER = '"${CLAUDE_PLUGIN_ROOT}"';
var OLD_PREFIX = '"${CLAUDE_PLUGIN_ROOT}"/hooks/';
var NEW_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook ';
var EXPECTED_FORMS = 'Expected "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh or node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>';
var RUNTIME_BUNDLE = "dist/engineos.cjs";
var UNPLACEABLE_NAME = /[/\\ ]/;
var SettingsMergeError = class extends Error {
  kind = "settings-merge";
  // Rendered as a second stderr line: the installer's ABORT message carries the
  // accepted forms under it, exactly as the bash `red` pair did.
  detail;
  constructor(message2, detail) {
    super(message2);
    this.name = "SettingsMergeError";
    this.detail = detail;
  }
};
function pluginFile(pluginRoot, relativePath) {
  return `${trimTrailingSeparators(pluginRoot)}/${relativePath}`;
}
function isEngineosCommand(command, pluginRoot) {
  const normalized = toSlashes(command);
  if (normalized.includes(RUNTIME_BUNDLE)) return true;
  return normalized.includes(`${toSlashes(trimTrailingSeparators(pluginRoot))}/hooks/`);
}
function mergeSettings(settings, hooksJson, pluginRoot, permissionsTemplate) {
  if (!isRecord(settings)) throw new SettingsMergeError(SETTINGS_NOT_OBJECT);
  const derived = deriveHooks(hooksJson, pluginRoot);
  const before = JSON.stringify(settings);
  const cloned = JSON.parse(before);
  if (!isRecord(cloned)) throw new SettingsMergeError(SETTINGS_NOT_OBJECT);
  const events = objectField(cloned, "hooks", "hooks");
  const removed = scrubEngineosHooks(events, pluginRoot);
  for (const hook of derived) addHook(events, hook);
  cloned["hooks"] = events;
  if (permissionsTemplate !== null && permissionsTemplate !== void 0) {
    mergePermissions(cloned, permissionsTemplate);
  }
  return {
    settings: cloned,
    // Idempotence is judged on the output, not on the counters: a second run
    // removes and re-adds the same N entries and still reports changed=false.
    result: { added: derived.length, removed, changed: JSON.stringify(cloned) !== before }
  };
}
function deriveHooks(hooksJson, pluginRoot) {
  const root = trimTrailingSeparators(pluginRoot);
  const source = pluginFile(root, "hooks/hooks.json");
  const container = isRecord(hooksJson) ? hooksJson["hooks"] : void 0;
  if (!isRecord(container)) throw new SettingsMergeError(`no .hooks object in ${source}`);
  const derived = [];
  for (const [event2, value] of Object.entries(container)) {
    const entries = asArray(value);
    if (entries === null) throw new SettingsMergeError(`${source}: hooks.${event2} is not an array`);
    for (const entry of entries) {
      if (!isRecord(entry)) throw new SettingsMergeError(`${source}: an entry under hooks.${event2} is not a JSON object`);
      const matcher = typeof entry["matcher"] === "string" ? entry["matcher"] : "";
      const inner = asArray(entry["hooks"]);
      if (inner === null) throw new SettingsMergeError(`${source}: an entry under hooks.${event2} has no hooks array`);
      for (const hook of inner) {
        const raw = isRecord(hook) && typeof hook["command"] === "string" ? hook["command"] : "";
        derived.push({ event: event2, matcher, command: resolveCommand(raw, root, source) });
      }
    }
  }
  return derived;
}
function resolveCommand(raw, root, source) {
  const name = hookNameOf(raw);
  if (name === null || name === "" || UNPLACEABLE_NAME.test(name)) {
    throw new SettingsMergeError(`ABORT: unrecognized hook command in ${source}: ${raw}`, EXPECTED_FORMS);
  }
  return raw.split(QUOTED_PLACEHOLDER).join(root).split(PLACEHOLDER).join(root);
}
function hookNameOf(raw) {
  if (raw.startsWith(OLD_PREFIX)) return raw.slice(OLD_PREFIX.length);
  if (raw.startsWith(NEW_PREFIX)) return raw.slice(NEW_PREFIX.length);
  return null;
}
function scrubEngineosHooks(events, pluginRoot) {
  let removed = 0;
  for (const [event2, value] of Object.entries(events)) {
    if (value === null || value === void 0) continue;
    const entries = asArray(value);
    if (entries === null) throw new SettingsMergeError(`settings.json "hooks.${event2}" is not an array`);
    const kept = [];
    for (const entry of entries) {
      const inner = isRecord(entry) ? asArray(entry["hooks"]) : null;
      if (!isRecord(entry) || inner === null) {
        kept.push(entry);
        continue;
      }
      const survivors = inner.filter((hook) => !isEngineosHook(hook, pluginRoot));
      removed += inner.length - survivors.length;
      if (survivors.length === 0) continue;
      kept.push({ ...entry, hooks: survivors });
    }
    events[event2] = kept;
  }
  return removed;
}
function isEngineosHook(hook, pluginRoot) {
  if (!isRecord(hook)) return false;
  const command = hook["command"];
  return typeof command === "string" && isEngineosCommand(command, pluginRoot);
}
function addHook(events, hook) {
  const existing = asArray(events[hook.event]) ?? [];
  existing.push({ matcher: hook.matcher, hooks: [{ type: "command", command: hook.command }] });
  events[hook.event] = existing;
}
function mergePermissions(settings, template) {
  if (!isRecord(template)) throw new SettingsMergeError("permissions template is not a JSON object");
  const permissions = objectField(settings, "permissions", "permissions");
  const existing = arrayField(permissions, "allow", "permissions.allow");
  const shared = asArray(template["allow"]) ?? [];
  const seen = /* @__PURE__ */ new Set();
  const union = [];
  for (const value of [...existing, ...shared]) {
    const key = typeof value === "string" ? `s:${value}` : `j:${JSON.stringify(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    union.push(value);
  }
  permissions["allow"] = union;
  settings["permissions"] = permissions;
}
function objectField(container, key, label) {
  const value = container[key];
  if (value === void 0 || value === null || value === false) return {};
  if (!isRecord(value)) throw new SettingsMergeError(`settings.json "${label}" is not a JSON object`);
  return value;
}
function arrayField(container, key, label) {
  const value = container[key];
  if (value === void 0 || value === null || value === false) return [];
  const array = asArray(value);
  if (array === null) throw new SettingsMergeError(`settings.json "${label}" is not an array`);
  return array;
}
function asArray(value) {
  return Array.isArray(value) ? value : null;
}
function toSlashes(value) {
  return value.split("\\").join("/");
}
function trimTrailingSeparators(value) {
  return value.replace(/[\\/]+$/, "");
}

// src/install/cli.ts
var EXIT_OK2 = 0;
var EXIT_FAILURE = 1;
var USAGE2 = "usage: engineos settings-merge --settings <path> --plugin-root <path> [--dry-run]";
var runSettingsMerge = (argv2, io2) => {
  const parsed = parseArgs2(argv2);
  if (!parsed.ok) return fail3(io2, parsed.message);
  const { settings: settingsPath, pluginRoot, dryRun } = parsed.options;
  const hooksJsonPath = pluginFile(pluginRoot, "hooks/hooks.json");
  const hooksJson = readJson(hooksJsonPath);
  if (!hooksJson.ok) return fail3(io2, hooksJson.message);
  const settings = readSettings(settingsPath);
  if (!settings.ok) return fail3(io2, settings.message);
  const templatePath = pluginFile(pluginRoot, "templates/permissions.template.json");
  let template = null;
  if ((0, import_node_fs23.existsSync)(templatePath)) {
    const read = readJson(templatePath);
    if (!read.ok) return fail3(io2, read.message);
    template = read.value;
  } else {
    io2.err(`permissions template missing (${templatePath}) \u2014 skipped allowlist merge.
`);
  }
  let merged;
  try {
    merged = mergeSettings(settings.value, hooksJson.value, pluginRoot, template);
  } catch (error) {
    if (error instanceof SettingsMergeError) {
      io2.err(`${error.message}
`);
      if (error.detail !== void 0) io2.err(`${error.detail}
`);
      return EXIT_FAILURE;
    }
    throw error;
  }
  if (dryRun) {
    writeJson(io2, merged.result);
    return EXIT_OK2;
  }
  return writeAtomically(io2, settingsPath, `${JSON.stringify(merged.settings, null, 2)}
`);
};
function parseArgs2(argv2) {
  let settings;
  let pluginRoot;
  let dryRun = false;
  for (let index = 0; index < argv2.length; index += 1) {
    const arg = argv2[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--settings" || arg === "--plugin-root") {
      const value = argv2[index + 1];
      if (value === void 0 || value === "") return { ok: false, message: `${arg} needs a path` };
      if (arg === "--settings") settings = value;
      else pluginRoot = value;
      index += 1;
      continue;
    }
    return { ok: false, message: USAGE2 };
  }
  if (settings === void 0) return { ok: false, message: USAGE2 };
  if (pluginRoot === void 0) return { ok: false, message: USAGE2 };
  return { ok: true, options: { settings, pluginRoot, dryRun } };
}
function readJson(path) {
  try {
    return { ok: true, value: readJsonFile(path) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `cannot read ${path}` };
  }
}
function readSettings(path) {
  if (!(0, import_node_fs23.existsSync)(path)) return { ok: true, value: {} };
  let text3;
  try {
    text3 = (0, import_node_fs23.readFileSync)(path, "utf8");
  } catch {
    return { ok: false, message: `cannot read ${path}` };
  }
  if (text3.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text3) };
  } catch {
    return { ok: false, message: SETTINGS_NOT_OBJECT };
  }
}
function writeAtomically(io2, path, contents) {
  const temporary = `${path}.tmp`;
  try {
    (0, import_node_fs23.writeFileSync)(temporary, contents);
    (0, import_node_fs23.renameSync)(temporary, path);
  } catch (error) {
    discard(temporary);
    return fail3(io2, `cannot write ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return EXIT_OK2;
}
function discard(path) {
  try {
    (0, import_node_fs23.rmSync)(path, { force: true });
  } catch {
    return;
  }
}
function fail3(io2, message2) {
  io2.err(`${message2}
`);
  return EXIT_FAILURE;
}

// src/bypass/cli.ts
var import_node_child_process4 = require("node:child_process");
var import_node_fs24 = require("node:fs");
var EXIT_OK3 = 0;
var EXIT_FAILURE2 = 1;
var EXIT_USAGE2 = 2;
var USAGE3 = "usage: engineos bypass on|off|status [cwd]";
var DEFAULT_DEPS = { spawn: import_node_child_process4.spawnSync };
function runBypass(argv2, io2, deps = DEFAULT_DEPS) {
  const action = argv2[0] ?? "status";
  const target = argv2[1] ?? io2.cwd();
  const marker = bypassMarker(target, deps.spawn);
  if (marker === null) {
    io2.err("engineos: not a git repository \u2014 bypass has no effect here\n");
    return EXIT_FAILURE2;
  }
  const flag2 = bypassFlagPath(io2.env);
  switch (action) {
    case "on":
      try {
        (0, import_node_fs24.writeFileSync)(marker, "");
      } catch (e) {
        io2.err(`engineos: cannot create ${marker}: ${reason(e)}
`);
        return EXIT_FAILURE2;
      }
      io2.out("engineos: BYPASSED \u2014 routing, agent dispatch, and Stop gates are off for this session\n");
      return EXIT_OK3;
    case "off":
      try {
        (0, import_node_fs24.rmSync)(marker, { force: true });
      } catch (e) {
        io2.err(`engineos: cannot clear ${marker}: ${reason(e)}
`);
        return EXIT_FAILURE2;
      }
      if (io2.env["ENGINEOS_BYPASS"] === "1") {
        io2.err("engineos: repo marker cleared, but ENGINEOS_BYPASS=1 still bypasses everything \u2014 unset it to restore\n");
      } else if ((0, import_node_fs24.existsSync)(flag2)) {
        io2.err(`engineos: repo marker cleared, but ${flag2} still bypasses everything \u2014 delete it to restore
`);
      } else {
        io2.out("engineos: active \u2014 routing, agent dispatch, and Stop gates restored\n");
      }
      return EXIT_OK3;
    case "status":
      io2.out(`${statusLine(marker, flag2, io2.env)}
`);
      return EXIT_OK3;
    default:
      io2.err(`${USAGE3}
`);
      return EXIT_USAGE2;
  }
}
function statusLine(marker, flag2, env) {
  if (env["ENGINEOS_BYPASS"] === "1") return "bypassed (ENGINEOS_BYPASS=1)";
  if ((0, import_node_fs24.existsSync)(flag2)) return `bypassed (${flag2})`;
  return (0, import_node_fs24.existsSync)(marker) ? "bypassed (repo marker)" : "active";
}
function reason(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/gen/agent-commands.ts
var import_node_fs25 = require("node:fs");
var import_node_path17 = require("node:path");

// src/gen/frontmatter.ts
var LINE_SPACE = /^[ \t\r\v\f]*/;
function frontmatterValue(text3, field) {
  const prefix = `${field}:`;
  for (const line of text3.split("\n")) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).replace(LINE_SPACE, "");
  }
  return "";
}
var ALIAS = /Alias: [a-z0-9-]+/i;
function frontmatterAlias(text3) {
  const match = ALIAS.exec(dashRanges(text3));
  if (match === null) return "";
  return match[0].replace(/[Aa]lias: /, "");
}
function dashRanges(text3) {
  const kept = [];
  let inRange = false;
  for (const line of text3.split("\n")) {
    if (!inRange) {
      if (line !== "---") continue;
      inRange = true;
      kept.push(line);
      continue;
    }
    kept.push(line);
    if (line === "---") inRange = false;
  }
  return kept.join("\n");
}
function splitCsv(value) {
  return value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

// src/gen/agent-commands.ts
var EXIT_OK4 = 0;
var EXIT_FAILURE3 = 1;
var MARKER = "<!-- @generated by scripts/gen-agent-commands.sh \u2014 do not edit. To customize this command, delete this line and the generator will preserve your changes. -->";
function generateAgentCommands(root, io2) {
  const agentsDir = (0, import_node_path17.join)(root, "agents");
  const outDir = (0, import_node_path17.join)(root, "commands", "agents");
  if (!isDirectory6(agentsDir)) {
    io2.err(`No agents dir at ${agentsDir}
`);
    return EXIT_FAILURE3;
  }
  (0, import_node_fs25.mkdirSync)(outDir, { recursive: true });
  const run10 = { outDir, expected: /* @__PURE__ */ new Set(), counts: { generated: 0, preserved: 0, removed: 0, keptOrphan: 0 }, io: io2 };
  for (const file of agentFiles(agentsDir)) {
    const text3 = readOrEmpty(file);
    const name = frontmatterValue(text3, "name");
    if (name === "") {
      io2.err(`skip (no name): ${file}
`);
      continue;
    }
    const alias = frontmatterAlias(text3);
    const desc = `Invoke the ${name} agent${alias === "" ? "" : ` (alias ${alias})`}.`;
    emit2(run10, { invoke: name, agent: name, alias, desc });
    if (alias !== "" && alias !== name) emit2(run10, { invoke: alias, agent: name, alias, desc });
  }
  prune(run10);
  const { generated, preserved, removed, keptOrphan } = run10.counts;
  io2.out(`Done in ${outDir} \u2014 generated: ${generated}, preserved: ${preserved}, removed stale: ${removed}, kept orphaned customized: ${keptOrphan}
`);
  return EXIT_OK4;
}
function emit2(run10, spec) {
  run10.expected.add(spec.invoke);
  const out = (0, import_node_path17.join)(run10.outDir, `${spec.invoke}.md`);
  if ((0, import_node_fs25.existsSync)(out) && !isGenerated(out)) {
    run10.io.err(`preserved (customized): ${spec.invoke}.md
`);
    run10.counts.preserved += 1;
    return;
  }
  (0, import_node_fs25.writeFileSync)(out, commandBody(spec));
  run10.counts.generated += 1;
}
function prune(run10) {
  for (const file of markdownNames(run10.outDir)) {
    const base = file.slice(0, -".md".length);
    if (run10.expected.has(base)) continue;
    const out = (0, import_node_path17.join)(run10.outDir, file);
    if (isGenerated(out)) {
      (0, import_node_fs25.rmSync)(out, { force: true });
      run10.io.err(`removed stale: ${base}.md
`);
      run10.counts.removed += 1;
    } else {
      run10.io.err(`kept orphaned customized (agent removed/renamed?): ${base}.md
`);
      run10.counts.keptOrphan += 1;
    }
  }
}
function commandBody(spec) {
  const { agent, alias, desc } = spec;
  const aliasSuffix = alias === "" ? "" : ` (alias \`${alias}\`)`;
  return `---
description: ${desc}
argument-hint: [task or question for the agent]
allowed-tools: Task
---
${MARKER}

Dispatch the \`${agent}\` agent${aliasSuffix} via the Task tool, passing
\`$ARGUMENTS\` as its prompt. If \`$ARGUMENTS\` is empty, ask the user what they
want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers AUDIT vs
IMPLEMENT where applicable). Relay its report back verbatim; do not re-do its
work yourself.
`;
}
function isGenerated(path) {
  try {
    return (0, import_node_fs25.readFileSync)(path, "utf8").includes(MARKER);
  } catch {
    return false;
  }
}
function agentFiles(agentsDir) {
  const names2 = markdownNames(agentsDir);
  if (names2.length === 0) return [(0, import_node_path17.join)(agentsDir, "*.md")];
  return names2.map((name) => (0, import_node_path17.join)(agentsDir, name));
}
function markdownNames(dir) {
  let names2;
  try {
    names2 = (0, import_node_fs25.readdirSync)(dir);
  } catch {
    return [];
  }
  return names2.filter((name) => !name.startsWith(".") && name.endsWith(".md")).sort(byCodeUnit);
}
function byCodeUnit(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function isDirectory6(path) {
  try {
    return (0, import_node_fs25.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function readOrEmpty(path) {
  try {
    return (0, import_node_fs25.readFileSync)(path, "utf8");
  } catch {
    return "";
  }
}

// src/gen/agent-registry.ts
var import_node_fs26 = require("node:fs");
var import_node_path18 = require("node:path");
var EXIT_OK5 = 0;
var EXIT_FAILURE4 = 1;
var DOCUMENT_DESCRIPTION = "Generated from agents/*.md frontmatter by scripts/gen-agent-registry.sh \u2014 do not hand-edit. capability_ids is a back-reference from registries/capabilities.json.";
function buildAgentRegistry(agentFiles2, models, capabilities) {
  const entries = [];
  for (const file of agentFiles2) {
    const name = frontmatterValue(file.text, "name");
    if (name === "") continue;
    const model = frontmatterValue(file.text, "model");
    const tier = frontmatterValue(file.text, "tier");
    if (tier === "") {
      const ids = models.tiers.map((row) => row.id).join(", ");
      throw new KernelError(
        `FAIL: ${file.path} has no 'tier:' frontmatter \u2014 the tier cannot be derived from the model (two tiers may share a binding, registries/models.json). Declare one of: ${ids}.`
      );
    }
    const bound = models.tiers.find((row) => row.id === tier);
    if (bound === void 0) {
      throw new KernelError(`FAIL: ${file.path} declares unknown tier '${tier}' \u2014 not a tier id in registries/models.json.`);
    }
    if (bound.model !== model) {
      throw new KernelError(
        `FAIL: ${file.path} declares tier '${tier}' (binds model '${bound.model}' in registries/models.json) but model '${model}' \u2014 fix the frontmatter or rebind the tier.`
      );
    }
    entries.push({
      name,
      alias: emptyToNull(frontmatterAlias(file.text)),
      description: frontmatterValue(file.text, "description"),
      tools: splitCsv(frontmatterValue(file.text, "tools")),
      model,
      model_tier: tier,
      capability_ids: capabilities.capabilities.filter((row) => row.agent === name).map((row) => row.id)
    });
  }
  return {
    version: "1.0.0",
    description: DOCUMENT_DESCRIPTION,
    // Code-point order, which is what jq's sort_by(.name) produced; a locale
    // collation would reorder hyphenated names and move committed bytes.
    agents: entries.sort(byNameCodePoint)
  };
}
function generateAgentRegistry(root, io2) {
  const agentsDir = (0, import_node_path18.join)(root, "agents");
  const capsFile = (0, import_node_path18.join)(root, "registries", "capabilities.json");
  const modelsFile = (0, import_node_path18.join)(root, "registries", "models.json");
  const outFile = (0, import_node_path18.join)(root, "registries", "agents.json");
  if (!isDirectory7(agentsDir)) return fail4(io2, `No agents dir at ${agentsDir}`);
  if (!(0, import_node_fs26.existsSync)(capsFile)) return fail4(io2, `No capabilities registry at ${capsFile}`);
  if (!(0, import_node_fs26.existsSync)(modelsFile)) return fail4(io2, `No models registry at ${modelsFile}`);
  let document;
  try {
    const models = loadModels(root);
    const capabilities = loadCapabilities(root);
    document = buildAgentRegistry(readAgentFiles(agentsDir), models, capabilities);
  } catch (error) {
    if (error instanceof KernelError) return fail4(io2, error.message);
    throw error;
  }
  try {
    (0, import_node_fs26.writeFileSync)(outFile, `${JSON.stringify(document, null, 2)}
`);
  } catch (error) {
    return fail4(io2, `cannot write ${outFile}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  io2.out(`Wrote ${document.agents.length} agents to ${outFile}
`);
  return EXIT_OK5;
}
function readAgentFiles(agentsDir) {
  return (0, import_node_fs26.readdirSync)(agentsDir).filter((entry) => entry.endsWith(".md")).sort().map((entry) => {
    const path = (0, import_node_path18.join)(agentsDir, entry);
    return { path, text: (0, import_node_fs26.readFileSync)(path, "utf8") };
  });
}
function byNameCodePoint(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}
function emptyToNull(value) {
  return value === "" ? null : value;
}
function isDirectory7(path) {
  try {
    return (0, import_node_fs26.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function fail4(io2, message2) {
  io2.err(`${message2}
`);
  return EXIT_FAILURE4;
}

// src/gen/cli.ts
var EXIT_USAGE3 = 1;
var USAGE4 = "usage: engineos gen agent-commands|agent-registry";
var runGen = (argv2, io2) => {
  switch (argv2[0]) {
    case "agent-commands":
      return generateAgentCommands(resolveRoot(io2.env), io2);
    case "agent-registry":
      return generateAgentRegistry(resolveRoot(io2.env), io2);
    default:
      io2.err(`${USAGE4}
`);
      return EXIT_USAGE3;
  }
};

// src/evals/run.ts
var import_node_child_process5 = require("node:child_process");
var import_node_fs29 = require("node:fs");
var import_node_path21 = require("node:path");

// src/evals/deterministic.ts
var import_node_fs28 = require("node:fs");
var import_node_path20 = require("node:path");

// src/lib/deferrals.ts
var import_node_fs27 = require("node:fs");
var import_node_path19 = require("node:path");
var TASK_CONTRACT_RULES = ["gates", "models", "parallelism", "risk-autonomy", "verification"];
var IMPORT_LINE2 = /^@rules\/([a-z-]*)\.md/;
var MD = ".md";
function alwaysOnRules(claudeMdText) {
  const names2 = /* @__PURE__ */ new Set();
  for (const line of claudeMdText.split("\n")) {
    const matched = IMPORT_LINE2.exec(line);
    const name = matched === null ? void 0 : matched[1];
    if (name !== void 0) names2.add(name);
  }
  return [...names2].sort();
}
function ruleNames(root) {
  let entries;
  try {
    entries = (0, import_node_fs27.readdirSync)((0, import_node_path19.join)(root, "rules"));
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(MD)).map((name) => name.slice(0, name.length - MD.length)).sort();
}
function deferralsOf(root, rule, alwaysOn) {
  let text3;
  try {
    text3 = (0, import_node_fs27.readFileSync)((0, import_node_path19.join)(root, "rules", `${rule}.md`), "utf8");
  } catch {
    return [];
  }
  const deferrals = [];
  for (const name of ruleNames(root)) {
    if (name === rule) continue;
    if (alwaysOn.includes(name)) continue;
    if (TASK_CONTRACT_RULES.includes(name)) continue;
    if (mentions(text3, name)) deferrals.push(name);
  }
  return deferrals;
}
function mentions(text3, name) {
  return text3.includes(`${name}${MD}`);
}

// src/evals/deterministic.ts
var INTENTS = "evals/intent-routing-cases.jsonl";
var AGENTS = "evals/agent-cases.jsonl";
var COVERAGE_FLOOR = 25;
var RISK_RANKS = { low: 1, medium: 2, high: 3 };
function grader(io2) {
  let pass = 0;
  let fail6 = 0;
  return {
    ok(message2) {
      pass += 1;
      io2.out(`ok   ${message2}
`);
    },
    bad(message2) {
      fail6 += 1;
      io2.out(`FAIL ${message2}
`);
    },
    counts() {
      return { pass, fail: fail6 };
    }
  };
}
function runDeterministicTier(root, io2) {
  const g = grader(io2);
  io2.out("== deterministic tier ==\n");
  for (const file of [INTENTS, AGENTS]) gradeJsonl(root, file, g);
  const alwaysOn = alwaysOnRules(readTextOrEmpty((0, import_node_path20.join)(root, "CLAUDE.md")));
  gradeIntentCases(root, alwaysOn, g);
  gradeAgentCases(root, g);
  const intentCount = nonEmptyLines(root, INTENTS).length;
  if (intentCount >= COVERAGE_FLOOR) {
    g.ok(`intent set size ${intentCount} (RUBRIC target 30-60; floor ${COVERAGE_FLOOR})`);
  } else {
    g.bad(`intent set has only ${intentCount} cases \u2014 below the floor of ${COVERAGE_FLOOR}, the set is decorative`);
  }
  return { ...g.counts(), intentCount };
}
function gradeJsonl(root, file, g) {
  if (!(0, import_node_fs28.existsSync)((0, import_node_path20.join)(root, file))) {
    g.bad(`${file} missing`);
    return;
  }
  const lines = nonEmptyLines(root, file);
  const malformed = [];
  lines.forEach((line, index) => {
    if (parseCase(line) === void 0) malformed.push(`line${index + 1}`);
  });
  if (malformed.length === 0) g.ok(`${file} is valid JSONL (${lines.length} cases)`);
  else g.bad(`${file} has malformed lines: ${malformed.join(" ")}`);
}
function gradeIntentCases(root, alwaysOn, g) {
  const badRisk = [];
  const badFields = [];
  const badRule = [];
  const badBoth = [];
  const badAlwaysOn = [];
  const badClosed = [];
  const floors = riskFloors(root);
  for (const line of nonEmptyLines(root, INTENTS)) {
    const parsed = parseCase(line);
    const id = jqStringOr(parsed, "id", "");
    const input = jqStringOr(parsed, "input", "");
    const notes = jqStringOr(parsed, "notes", "");
    if (id === "" || input === "" || notes === "") badFields.push(id === "" ? "<no-id>" : id);
    const mustLoad = jqWords(parsed, "must_load");
    const mustNotLoad = jqWords(parsed, "must_not_load");
    for (const rule of [...mustLoad, ...mustNotLoad]) {
      if (!(0, import_node_fs28.existsSync)((0, import_node_path20.join)(root, "rules", `${rule}.md`))) badRule.push(`${id}->${rule}`);
    }
    for (const rule of mustLoad) {
      if (alwaysOn.includes(rule)) badAlwaysOn.push(`${id}->must_load:${rule}`);
      if (mustNotLoad.includes(rule)) badBoth.push(`${id}->${rule}`);
      for (const deferral of deferralsOf(root, rule, alwaysOn)) {
        if (!mustLoad.includes(deferral)) badClosed.push(`${id}(${rule}-defers-to-${deferral})`);
      }
    }
    for (const rule of mustNotLoad) {
      if (alwaysOn.includes(rule)) badAlwaysOn.push(`${id}->must_not_load:${rule}`);
    }
    const expectRisk = jqStringOr(parsed, "expect_risk", "");
    if (expectRisk === "") continue;
    if (rankOf(expectRisk) === 0) badRisk.push(`${id}(tier='${expectRisk}')`);
    for (const domain of jqWords(parsed, "expect_intents")) {
      const floor = floors.get(domain) ?? "";
      if (floor === "") continue;
      if (rankOf(expectRisk) < rankOf(floor)) {
        badRisk.push(`${id}(expects '${expectRisk}' but domain '${domain}' floors at '${floor}')`);
      }
    }
  }
  report(g, badRisk, "expect_risk values are valid and respect registry risk floors", "risk expectation problems");
  report(g, badFields, "every intent case has id, input and notes", "cases missing required fields");
  report(g, badRule, "every asserted rule exists in rules/", "cases naming nonexistent rules");
  report(g, badBoth, "no rule is both required and forbidden in the same case", "contradictory expectations");
  report(g, badAlwaysOn, "no case asserts on an always-on rule (they are implicit)", "always-on rules asserted");
  report(g, badClosed, "every must_load set is closed under rule deferrals", "unclosed must_load sets");
}
function gradeAgentCases(root, g) {
  const badAgent = [];
  const badLists = [];
  for (const line of nonEmptyLines(root, AGENTS)) {
    const parsed = parseCase(line);
    const id = jqStringOr(parsed, "id", "");
    const agent = jqStringOr(parsed, "agent", "");
    if (agent !== "any" && !(0, import_node_fs28.existsSync)((0, import_node_path20.join)(root, "agents", `${agent}.md`))) badAgent.push(`${id}->${agent}`);
    if (jqLength(parsed, "must") === 0 || jqLength(parsed, "must_not") === 0) badLists.push(id);
  }
  report(g, badAgent, "every agent case names an existing agent", "cases naming nonexistent agents");
  report(g, badLists, "every agent case has both must and must_not items", "cases with an empty must/must_not list");
}
function report(g, problems, okMessage, failPrefix) {
  if (problems.length === 0) g.ok(okMessage);
  else g.bad(`${failPrefix}: ${problems.join(" ")}`);
}
function rankOf(tier) {
  return RISK_RANKS[tier] ?? 0;
}
function riskFloors(root) {
  const floors = /* @__PURE__ */ new Map();
  let raw;
  try {
    raw = readJsonFile((0, import_node_path20.join)(root, "registries", "routing.json"));
  } catch {
    return floors;
  }
  const record2 = isRecord(raw) ? raw : {};
  const domains = Array.isArray(record2["domains"]) ? record2["domains"] : [];
  for (const domain of domains.filter(isRecord)) {
    const id = domain["id"];
    if (typeof id !== "string" || floors.has(id)) continue;
    floors.set(id, jqStringOr(domain, "risk_floor", ""));
  }
  return floors;
}
function nonEmptyLines(root, file) {
  return readTextOrEmpty((0, import_node_path20.join)(root, file)).split("\n").filter((line) => line !== "");
}
function parseCase(line) {
  try {
    return JSON.parse(line);
  } catch {
    return void 0;
  }
}
function jqStringOr(value, key, fallback) {
  const field = fieldOf(value, key);
  if (field === void 0 || field === null || field === false) return fallback;
  return jqText(field);
}
function jqString2(value, key) {
  return jqText(fieldOf(value, key));
}
function jqWords(value, key) {
  const field = fieldOf(value, key);
  if (!Array.isArray(field)) return [];
  const elements = field;
  return elements.flatMap((element) => jqText(element).split(/\s+/).filter((word) => word !== ""));
}
function jqLength(value, key) {
  const field = fieldOf(value, key);
  if (field === void 0 || field === null) return 0;
  if (Array.isArray(field)) return field.length;
  if (typeof field === "string") return field.length;
  if (typeof field === "number") return Math.abs(field);
  if (isRecord(field)) return Object.keys(field).length;
  return 0;
}
function fieldOf(value, key) {
  return isRecord(value) ? value[key] : void 0;
}
function jqText(value) {
  if (typeof value === "string") return value;
  if (value === void 0 || value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "null";
}
function readTextOrEmpty(path) {
  try {
    return (0, import_node_fs28.readFileSync)(path, "utf8");
  } catch {
    return "";
  }
}

// src/evals/live.ts
var ROUTER_MARKER = "[router]";
function runLiveTier(root, io2, intentCount, deps) {
  const g = grader(io2);
  io2.out("\n== live tier ==\n");
  if (deps.env["ENGINEOS_EVAL_LIVE"] !== "1") {
    io2.out(`SKIP ${intentCount} intent cases \u2014 set ENGINEOS_EVAL_LIVE=1 to grade against a live model
`);
    return { ...g.counts(), skipped: intentCount };
  }
  if (!deps.hasClaude()) {
    io2.out(`SKIP ${intentCount} intent cases \u2014 ENGINEOS_EVAL_LIVE=1 but the 'claude' CLI is not on PATH
`);
    return { ...g.counts(), skipped: intentCount };
  }
  for (const line of nonEmptyLines(root, INTENTS)) {
    const parsed = parseCase(line);
    const id = jqString2(parsed, "id");
    const mustLoad = jqWords(parsed, "must_load");
    const mustNotLoad = jqWords(parsed, "must_not_load");
    const router = routerLine(deps.runClaude(jqString2(parsed, "input")));
    if (jqLength(parsed, "expect_intents") === 0) {
      if (router === "") g.ok(`${id} (no routing expected)`);
      else g.bad(`${id} over-routed a pure question: ${router}`);
      continue;
    }
    if (router === "") {
      g.bad(`${id} emitted no [router] line`);
      continue;
    }
    const problems = [];
    for (const rule of mustLoad) if (!router.includes(rule)) problems.push(`missing:${rule}`);
    for (const rule of mustNotLoad) if (router.includes(rule)) problems.push(`forbidden:${rule}`);
    if (problems.length === 0) g.ok(id);
    else g.bad(`${id} \u2014 ${problems.join(" ")} | got: ${router}`);
  }
  return { ...g.counts(), skipped: 0 };
}
function routerLine(output) {
  return output.split("\n").find((line) => line.includes(ROUTER_MARKER)) ?? "";
}

// src/evals/run.ts
var EXIT_OK6 = 0;
var EXIT_FAILURE5 = 1;
var runEvals = (_argv, io2) => {
  const root = resolveRoot(io2.env);
  const deterministic = runDeterministicTier(root, io2);
  const live = runLiveTier(root, io2, deterministic.intentCount, liveDeps(io2.env));
  const pass = deterministic.pass + live.pass;
  const fail6 = deterministic.fail + live.fail;
  io2.out(`
passed ${pass}, failed ${fail6}, skipped ${live.skipped}
`);
  return fail6 > 0 ? EXIT_FAILURE5 : EXIT_OK6;
};
function liveDeps(env) {
  return {
    env,
    hasClaude: () => onPath("claude", env),
    // stderr is discarded and a failed call answers with the empty string, as the
    // bash `$(claude -p "$inp" 2>/dev/null)` did: a case whose model call died
    // grades as a missing router line, never as a pass.
    runClaude: (prompt) => {
      const result2 = (0, import_node_child_process5.spawnSync)("claude", ["-p", prompt], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return result2.stdout ?? "";
    }
  };
}
function onPath(name, env) {
  const path = env["PATH"];
  if (path === void 0 || path === "") return false;
  for (const directory of path.split(import_node_path21.delimiter)) {
    if (directory === "") continue;
    if (isExecutable((0, import_node_path21.join)(directory, name))) return true;
  }
  return false;
}
function isExecutable(path) {
  try {
    (0, import_node_fs29.accessSync)(path, import_node_fs29.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// src/bench/run.ts
var import_node_child_process6 = require("node:child_process");
var import_node_fs31 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path25 = require("node:path");
var import_node_perf_hooks = require("node:perf_hooks");

// src/bench/baseline.ts
var import_node_path22 = require("node:path");

// src/bench/host.ts
var import_node_crypto2 = require("node:crypto");
function collectHost(deps, engineosVersion) {
  const cpus2 = deps.cpus();
  const first = cpus2[0];
  return {
    platform: deps.platform(),
    // A container with no readable cpu list reports `unknown` rather than
    // crashing a measurement run that is otherwise valid.
    cpuModel: first === void 0 ? "unknown" : first.model,
    cpuCount: cpus2.length,
    nodeVersion: deps.nodeVersion(),
    engineosVersion
  };
}
function hostId(meta) {
  const material = `${meta.platform}|${meta.cpuModel}|${String(meta.cpuCount)}`;
  const digest = (0, import_node_crypto2.createHash)("sha256").update(material).digest("hex").slice(0, 12);
  return `${slug(meta.platform)}-${String(meta.cpuCount)}x-${digest}`;
}
function slug(value) {
  const lowered = value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

// src/bench/baseline.ts
function baselinePath(root, meta) {
  return (0, import_node_path22.join)(root, "docs", "perf", "baselines", `${hostId(meta)}.json`);
}
function writeBaseline(io2, root, report2) {
  const path = baselinePath(root, report2.host);
  io2.write(path, `${JSON.stringify(report2, null, 2)}
`);
  return path;
}
function readBaseline(io2, root, meta) {
  const text3 = io2.read(baselinePath(root, meta));
  if (text3 === null) return null;
  try {
    return JSON.parse(text3);
  } catch {
    throw new KernelError(`${baselinePath(root, meta)} is not valid JSON \u2014 re-record it with 'engineos bench baseline --write'`);
  }
}
function compare(current, baseline, tolerance) {
  const previous = new Map(baseline.scenarios.map((entry) => [entry.scenario, entry.p50Ms]));
  const found = [];
  for (const scenario of current.scenarios) {
    const before = previous.get(scenario.scenario);
    if (before === void 0) {
      found.push({ scenario: scenario.scenario, reason: "no-baseline", currentP50Ms: scenario.p50Ms, baselineP50Ms: null });
      continue;
    }
    if (scenario.p50Ms > before * (1 + tolerance)) {
      found.push({ scenario: scenario.scenario, reason: "slower", currentP50Ms: scenario.p50Ms, baselineP50Ms: before });
    }
  }
  return found;
}

// src/bench/lifecycle.ts
function percentile(values, rank) {
  if (values.length === 0) throw new KernelError("a percentile has no samples to rank");
  const sorted2 = [...values].sort((a, b) => a - b);
  const index = Math.ceil(rank / 100 * sorted2.length) - 1;
  const clamped = Math.min(Math.max(index, 0), sorted2.length - 1);
  const value = sorted2[clamped];
  if (value === void 0) throw new KernelError("a percentile index fell outside its own series");
  return value;
}
function summarize(scenario, samples, contextBytes, dispatches) {
  const durations = samples.map((entry) => entry.durationMs);
  return {
    scenario,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    dispatches,
    contextBytes,
    samples: samples.map((entry) => ({ ...entry }))
  };
}

// src/bench/measure.ts
var import_node_fs30 = require("node:fs");
var import_node_path23 = require("node:path");
var NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
function parseMultiplier(raw) {
  if (raw === void 0 || raw === "") return 1;
  const text3 = raw.trim();
  if (!NUMERIC.test(text3)) throw new KernelError("ENGINEOS_PERF_MULTIPLIER must be numeric");
  const value = Number.parseFloat(text3);
  if (value <= 0) throw new KernelError("ENGINEOS_PERF_MULTIPLIER must be greater than zero");
  return value;
}
function runOnce(cmd, deps) {
  const bin = cmd.command[0];
  if (bin === void 0) throw new KernelError("bench: cannot run an empty command");
  const args = cmd.command.slice(1);
  const options = {
    input: cmd.stdin ?? "",
    encoding: "utf8",
    // python's stdout=DEVNULL, stderr=DEVNULL: the child's own output would
    // interleave with the budget report and is not what is being measured.
    stdio: ["pipe", "ignore", "ignore"],
    env: cmd.env
  };
  const result2 = deps.spawn(bin, args, options);
  const label = cmd.command.join(" ");
  if (result2.error !== void 0) throw new KernelError(`bench: ${label} exited ${result2.error.message}`);
  if (result2.signal !== null) throw new KernelError(`bench: ${label} exited ${result2.signal}`);
  if (result2.status !== 0) throw new KernelError(`bench: ${label} exited ${String(result2.status)}`);
}
function medianMs(cmd, deps) {
  const durations = [];
  for (let sample = 0; sample < cmd.samples; sample += 1) {
    const started = deps.now();
    runOnce(cmd, deps);
    durations.push(deps.now() - started);
  }
  return median(durations);
}
function alwaysOnBytes(root) {
  const claudeMd = (0, import_node_path23.join)(root, "CLAUDE.md");
  let total = (0, import_node_fs30.statSync)(claudeMd).size;
  for (const line of (0, import_node_fs30.readFileSync)(claudeMd, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("@rules/")) continue;
    total += (0, import_node_fs30.statSync)((0, import_node_path23.join)(root, line.slice(1))).size;
  }
  return total;
}
function formatMeasurement(m, multiplier) {
  const effective = m.budget * multiplier;
  const failed = !(m.actual < effective);
  const head = `${(failed ? "FAIL" : "ok").padEnd(4)} ${m.name}: `;
  const body = m.unit === "ms" ? `median=${m.actual.toFixed(1)}ms budget<${effective.toFixed(1)}ms` : `${Math.trunc(m.actual)} bytes budget<${Math.trunc(effective)} bytes`;
  return { line: `${head}${body}`, failed };
}
function median(values) {
  const sorted2 = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted2.length / 2);
  const upper = sorted2[mid];
  if (upper === void 0) throw new KernelError("bench: cannot take the median of zero samples");
  if (sorted2.length % 2 === 1) return upper;
  const lower = sorted2[mid - 1];
  return lower === void 0 ? upper : (lower + upper) / 2;
}

// src/bench/scenarios.ts
var import_node_path24 = require("node:path");
var PROMPT = "add a paginated orders endpoint and mirror the screen to mobile";
var SESSION_ID = "lifecycle-benchmark";
var SCENARIOS = [
  {
    name: "prompt-routing",
    phase: "routing",
    samples: 5,
    warm: false,
    hook: "hooks/prompt-advisor.sh",
    payload: () => JSON.stringify({ prompt: PROMPT, cwd: "/tmp", session_id: SESSION_ID })
  },
  {
    name: "direct-edit-cold",
    phase: "routing",
    samples: 5,
    warm: false,
    hook: "hooks/route-before-change.sh",
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: "/tmp", session_id: SESSION_ID })
  },
  {
    name: "direct-edit-warm",
    phase: "routing",
    samples: 7,
    warm: true,
    hook: "hooks/route-before-change.sh",
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: "/tmp", session_id: SESSION_ID })
  },
  {
    name: "agent-dispatch",
    phase: "execution",
    samples: 5,
    warm: false,
    hook: "hooks/announce-agent-dispatch.sh",
    payload: () => JSON.stringify({ tool_input: { subagent_type: "backend-coordinator" }, cwd: "/tmp", session_id: SESSION_ID })
  },
  {
    name: "agent-return",
    phase: "integration",
    samples: 5,
    warm: false,
    hook: "hooks/announce-agent-return.sh",
    payload: () => JSON.stringify({ tool_input: { subagent_type: "backend-coordinator" }, cwd: "/tmp", session_id: SESSION_ID })
  },
  {
    name: "final-gate",
    phase: "verification",
    samples: 3,
    warm: false,
    hook: "hooks/stop-verify.sh",
    payload: () => JSON.stringify({ cwd: "/tmp", session_id: SESSION_ID })
  }
];
function runScenario(scenario, root, env, deps) {
  const target = (0, import_node_path24.join)(root, "src", "Button.tsx");
  const command = {
    command: [(0, import_node_path24.join)(root, scenario.hook)],
    stdin: scenario.payload(target),
    env: hookEnv(env),
    samples: 1
  };
  if (scenario.warm) runOnce(command, deps);
  const samples = [];
  for (let i = 0; i < scenario.samples; i += 1) {
    samples.push({
      scenario: scenario.name,
      phase: scenario.phase,
      durationMs: medianMs(command, deps),
      // Not observed by a hook-spawning benchmark. Wave 3's scheduler and a
      // model-owning runner supply these; until then the honest value is null.
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      cacheHit: scenario.warm ? true : null,
      retries: 0
    });
  }
  return samples;
}
function hookEnv(env) {
  return { ...env, ENGINEOS_BYPASS_FLAG: "/nonexistent/engineos.bypass", ENGINEOS_TELEMETRY: "0" };
}

// src/bench/run.ts
var PROMPT2 = "add a paginated orders endpoint and mirror the screen to mobile";
var SESSION_ID2 = "performance-budget";
var HEADER = "== EngineOS runtime budgets ==";
var LIFECYCLE_HEADER = "== EngineOS task lifecycle ==";
var BASELINE_TOLERANCE = 0.1;
var DEFAULT_HOST_DEPS = {
  platform: () => (0, import_node_os2.platform)(),
  cpus: () => (0, import_node_os2.cpus)().map((cpu) => ({ model: cpu.model })),
  nodeVersion: () => process.version
};
var defaultSpawn2 = (command, args, options) => (0, import_node_child_process6.spawnSync)(command, args, options);
var DEFAULT_DEPS2 = {
  spawn: defaultSpawn2,
  now: () => import_node_perf_hooks.performance.now(),
  mkdtemp: () => (0, import_node_fs31.mkdtempSync)((0, import_node_path25.join)((0, import_node_os2.tmpdir)(), "engineos-bench-"))
};
function runBench(argv2, io2, deps = DEFAULT_DEPS2) {
  const sub = argv2[0];
  if (sub !== void 0) {
    if (sub === "lifecycle") return runLifecycle(io2, deps);
    if (sub === "baseline") return runBaseline(argv2.slice(1), io2, deps);
    io2.err(`unknown bench subcommand: ${sub}
`);
    return 1;
  }
  try {
    const multiplier = parseMultiplier(io2.env["ENGINEOS_PERF_MULTIPLIER"]);
    const root = resolveRoot(io2.env);
    const measurements = measureAll(root, io2.env, deps);
    const lines = [HEADER];
    let failed = false;
    for (const measurement of measurements) {
      const rendered = formatMeasurement(measurement, multiplier);
      if (rendered.failed) failed = true;
      lines.push(rendered.line);
    }
    io2.out(`${lines.join("\n")}
`);
    return failed ? 1 : 0;
  } catch (e) {
    if (e instanceof KernelError) {
      io2.err(`${e.message}
`);
      return 1;
    }
    throw e;
  }
}
function lifecycleReport(root, env, deps) {
  const host = collectHost(DEFAULT_HOST_DEPS, true ? "1.7.0" : "unknown");
  const contextBytes = alwaysOnBytes(root);
  const scenarios = SCENARIOS.map(
    (scenario) => (
      // `dispatches` is 0 because a hook-spawning benchmark launches no agent, not
      // because a measured task dispatched none. Wave 3 supplies the real count.
      summarize(scenario.name, runScenario(scenario, root, env, deps), contextBytes, 0)
    )
  );
  return { host, scenarios };
}
function runLifecycle(io2, deps) {
  try {
    const root = resolveRoot(io2.env);
    const report2 = lifecycleReport(root, io2.env, deps);
    const lines = [LIFECYCLE_HEADER];
    for (const scenario of report2.scenarios) {
      lines.push(`${scenario.scenario} p50=${scenario.p50Ms.toFixed(1)}ms p95=${scenario.p95Ms.toFixed(1)}ms`);
    }
    io2.out(`${lines.join("\n")}
`);
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      io2.err(`${e.message}
`);
      return 1;
    }
    throw e;
  }
}
function runBaseline(argv2, io2, deps) {
  try {
    const root = resolveRoot(io2.env);
    const report2 = lifecycleReport(root, io2.env, deps);
    if (argv2.includes("--write")) {
      io2.out(`${writeBaseline(fileBaselineIo(), root, report2)}
`);
      return 0;
    }
    const baseline = readBaseline(fileBaselineIo(), root, report2.host);
    if (baseline === null) {
      io2.err("no baseline for this host \u2014 record one with 'engineos bench baseline --write'\n");
      return 1;
    }
    const found = compare(report2, baseline, BASELINE_TOLERANCE);
    for (const regression of found) {
      const before = regression.baselineP50Ms === null ? "none" : `${regression.baselineP50Ms.toFixed(1)}ms`;
      io2.err(`${regression.scenario}: ${regression.reason} (${regression.currentP50Ms.toFixed(1)}ms vs ${before})
`);
    }
    return found.length === 0 ? 0 : 1;
  } catch (e) {
    if (e instanceof KernelError) {
      io2.err(`${e.message}
`);
      return 1;
    }
    throw e;
  }
}
function fileBaselineIo() {
  return {
    read: (path) => {
      try {
        return (0, import_node_fs31.readFileSync)(path, "utf8");
      } catch {
        return null;
      }
    },
    write: (path, text3) => {
      (0, import_node_fs31.mkdirSync)((0, import_node_path25.dirname)(path), { recursive: true });
      (0, import_node_fs31.writeFileSync)(path, text3);
    }
  };
}
function measureAll(root, env, deps) {
  const kernel = (0, import_node_path25.join)(root, "scripts/kernel.sh");
  const advisor = (0, import_node_path25.join)(root, "hooks/prompt-advisor.sh");
  const routeIntent = medianMs({ command: [kernel, "route-intent", PROMPT2], samples: 5 }, deps);
  const resolveTask2 = medianMs({ command: [kernel, "resolve-task", "--prompt", PROMPT2], samples: 5 }, deps);
  const promptAdvisor = medianMs(
    {
      command: [advisor],
      stdin: JSON.stringify({ prompt: PROMPT2, cwd: "/tmp", session_id: SESSION_ID2 }),
      env: hookEnv2(env),
      samples: 5
    },
    deps
  );
  const routeBeforeChange = routeBeforeChangeMedian(root, env, deps);
  return [
    { name: "route-intent", actual: routeIntent, budget: 250, unit: "ms" },
    { name: "resolve-task", actual: resolveTask2, budget: 500, unit: "ms" },
    { name: "prompt-advisor (end to end)", actual: promptAdvisor, budget: 600, unit: "ms" },
    { name: "route-before-change (cache hit)", actual: routeBeforeChange, budget: 150, unit: "ms" },
    { name: "always-on context", actual: alwaysOnBytes(root), budget: 32e3, unit: "bytes" }
  ];
}
function routeBeforeChangeMedian(root, env, deps) {
  const tmp = deps.mkdtemp();
  try {
    runOnce({ command: ["git", "init", "-q", tmp], samples: 1 }, deps);
    const target = (0, import_node_path25.join)(tmp, "src", "Button.tsx");
    (0, import_node_fs31.mkdirSync)((0, import_node_path25.join)(tmp, "src"), { recursive: true });
    (0, import_node_fs31.writeFileSync)(target, "");
    const cmd = {
      command: [(0, import_node_path25.join)(root, "hooks/route-before-change.sh")],
      stdin: JSON.stringify({ tool_input: { file_path: target }, cwd: tmp, session_id: SESSION_ID2 }),
      env: hookEnv2(env),
      samples: 7
    };
    runOnce(cmd, deps);
    return medianMs(cmd, deps);
  } finally {
    (0, import_node_fs31.rmSync)(tmp, { recursive: true, force: true });
  }
}
function hookEnv2(env) {
  return { ...env, ENGINEOS_BYPASS_FLAG: "/nonexistent/engineos.bypass", ENGINEOS_TELEMETRY: "0" };
}

// src/report/usage.ts
var import_node_child_process7 = require("node:child_process");
var import_node_fs32 = require("node:fs");
var import_node_path26 = require("node:path");
var EXIT_OK7 = 0;
var EXIT_FAILURE6 = 1;
var USAGE5 = "usage: engineos usage-report [days]";
var DEFAULT_DAYS = "30";
var MS_PER_DAY = 864e5;
var RULE = "=".repeat(33);
var REPORTED_SKILLS = [
  "nestjs-patterns",
  "react-patterns",
  "llm-engineering",
  "adr",
  "eval-harness",
  "release-notes",
  "record-change",
  "strategy"
];
var REPORTED_AGENTS = ["security-reviewer", "test-writer"];
var ROUTER_INTENT = /\[router\] intent=([a-zA-Z-]+)/g;
var SKILL_PATTERNS = new Map(
  REPORTED_SKILLS.map((skill) => [skill, new RegExp(`"skill"\\s*:\\s*"${skill}"`)])
);
function collectTranscripts(projectsDir, days, nowMs) {
  const cutoff = nowMs - days * MS_PER_DAY;
  const found = [];
  walk(projectsDir, cutoff, found);
  return found.sort();
}
function renderReport(days, deps, io2) {
  const projectsDir = (0, import_node_path26.join)(deps.env["HOME"] ?? "", ".claude", "projects");
  if (!isDirectory8(projectsDir)) {
    io2.out(`No transcripts at ${projectsDir}
`);
    return EXIT_FAILURE6;
  }
  io2.out(`EngineOS usage \u2014 last ${days} days
`);
  io2.out(`${RULE}
`);
  const files = collectTranscripts(projectsDir, days, deps.now());
  if (files.length === 0) {
    io2.out("No transcripts in window.\n");
    return EXIT_OK7;
  }
  const stats = readTranscripts(files);
  writeIntents(stats, io2);
  writeSkills(stats, io2);
  writeAgents(stats, io2);
  writeGateHits(stats, io2);
  writeTelemetry(days, deps, io2);
  io2.out("\nZero-hit items are prune candidates \u2014 but check the announce habit first.\n");
  return EXIT_OK7;
}
var runUsageReport = (argv2, io2) => {
  const days = parseDays(argv2[0] ?? DEFAULT_DAYS);
  if (days === null) {
    io2.err(`${USAGE5}
`);
    return EXIT_FAILURE6;
  }
  return renderReport(days, { env: io2.env, cwd: io2.cwd(), now: () => Date.now(), spawn: import_node_child_process7.spawnSync }, io2);
};
function parseDays(raw) {
  if (!/^[0-9]+$/.test(raw)) return null;
  const days = Number.parseInt(raw, 10);
  return days > 0 ? days : null;
}
function readEntries(dir) {
  try {
    return (0, import_node_fs32.readdirSync)(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function walk(dir, cutoff, found) {
  for (const entry of readEntries(dir)) {
    const path = (0, import_node_path26.join)(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, cutoff, found);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl") && newerThan(path, cutoff)) {
      found.push(path);
    }
  }
}
function newerThan(path, cutoff) {
  try {
    return (0, import_node_fs32.statSync)(path).mtimeMs > cutoff;
  } catch {
    return false;
  }
}
function isDirectory8(path) {
  try {
    return (0, import_node_fs32.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function readText(path) {
  try {
    return (0, import_node_fs32.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
}
function readTranscripts(files) {
  const stats = {
    intents: /* @__PURE__ */ new Map(),
    skillFiles: /* @__PURE__ */ new Map(),
    agentFiles: /* @__PURE__ */ new Map(),
    gateBlocks: 0
  };
  for (const file of files) {
    const text3 = readText(file);
    if (text3 === null) continue;
    for (const match of text3.matchAll(ROUTER_INTENT)) {
      const intent = match[1];
      if (intent !== void 0) bump(stats.intents, intent);
    }
    for (const [skill, pattern] of SKILL_PATTERNS) {
      if (pattern.test(text3)) bump(stats.skillFiles, skill);
    }
    for (const agent of REPORTED_AGENTS) {
      if (text3.includes(agent)) bump(stats.agentFiles, agent);
    }
    for (const line of text3.split("\n")) {
      if (line.includes("EngineOS gate")) stats.gateBlocks += 1;
    }
  }
  return stats;
}
function bump(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function writeIntents(stats, io2) {
  io2.out("\n## Router intents ([router] announce lines)\n");
  if (stats.intents.size === 0) {
    io2.out("(none found \u2014 router not announcing?)\n");
    return;
  }
  const rows3 = [...stats.intents.entries()].sort((a, b) => b[1] - a[1] || compareDesc(a[0], b[0]));
  for (const [intent, count] of rows3) {
    io2.out(`${String(count).padStart(7)} ${intent}
`);
  }
}
function writeSkills(stats, io2) {
  io2.out("\n## EngineOS skill invocations\n");
  for (const skill of REPORTED_SKILLS) {
    io2.out(`${column(stats.skillFiles.get(skill) ?? 0)}  ${skill}
`);
  }
}
function writeAgents(stats, io2) {
  io2.out("\n## Subagent dispatches\n");
  for (const agent of REPORTED_AGENTS) {
    io2.out(`${column(stats.agentFiles.get(agent) ?? 0)}  ${agent} (sessions mentioning)
`);
  }
}
function writeGateHits(stats, io2) {
  io2.out("\n## Hook gate hits (stop-verify blocks)\n");
  io2.out(`${stats.gateBlocks} blocks
`);
}
function writeTelemetry(days, deps, io2) {
  io2.out("\n## Kernel telemetry (this repo, .git/engineos-telemetry)\n");
  const dir = gitDir(deps.cwd, deps.spawn);
  const telemetryDir = dir === null ? null : (0, import_node_path26.join)(dir, "engineos-telemetry");
  if (telemetryDir === null || !isDirectory8(telemetryDir)) {
    io2.out("(none \u2014 telemetry not adopted here)\n");
    return;
  }
  const events = readEvents(collectTranscripts(telemetryDir, days, deps.now()));
  const routes = events.filter((e) => e.event === "route");
  const unrouted = routes.filter((e) => jqLength2(e.data["intents"]) === 0).length;
  const escalated = routes.filter((e) => jqTruthy(e.data["escalate"])).length;
  io2.out(`prompts routed: ${routes.length} (${unrouted} unrouted, ${escalated} escalated)
`);
  io2.out("intents fired:\n");
  writeGrouped(routes.flatMap((e) => stringArray(e.data["intents"])), io2);
  io2.out("decision rules fired:\n");
  writeGrouped(events.filter((e) => e.event === "decision-rules").flatMap((e) => stringArray(e.data["rules"])), io2);
  const verifies = events.filter((e) => e.event === "verify");
  const red = verifies.filter((e) => jqTruthy(e.data["failed"])).length;
  io2.out(`verify runs: ${verifies.length} (${red} red)
`);
}
function readEvents(files) {
  const events = [];
  for (const file of files) {
    const text3 = readText(file);
    if (text3 === null) continue;
    for (const line of text3.split("\n")) {
      if (line.trim() === "") continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      const event2 = parsed["event"];
      if (typeof event2 !== "string") continue;
      const data = parsed["data"];
      events.push({ event: event2, data: isRecord(data) ? data : {} });
    }
  }
  return events;
}
function writeGrouped(values, io2) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) bump(counts, value);
  const keys = [...counts.keys()].sort();
  for (const key of keys) {
    io2.out(`  ${counts.get(key) ?? 0}  ${key}
`);
  }
}
function jqTruthy(value) {
  return value !== void 0 && value !== null && value !== false;
}
function jqLength2(value) {
  return Array.isArray(value) ? value.length : 0;
}
function column(count) {
  return String(count).padStart(6);
}
function compareDesc(a, b) {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

// src/checks/agents-skills.ts
var import_node_fs34 = require("node:fs");
var import_node_path28 = require("node:path");

// src/checks/findings.ts
var HARNESS_FINDINGS = ["precondition-missing", "artifact-pending"];
var CODE_PATTERN = /^[a-z][a-z0-9-]*$/;
var HARNESS_CODES = new Set(HARNESS_FINDINGS);
function finding(check, code, subject) {
  if (!CODE_PATTERN.test(code)) {
    throw new KernelError(`check ${check} declares an invalid finding code: ${code}`);
  }
  return subject === void 0 ? { code } : { code, subject };
}
function result(check, title, findings, opts) {
  const collected = [...findings];
  return { check, title, status: statusOf(collected.length, (opts == null ? void 0 : opts.pending) === true), findings: collected };
}
function statusOf(count, pending) {
  if (count === 0) return "ok";
  return pending ? "skip" : "fail";
}
function render2(outcome) {
  if (outcome.status === "ok") return `ok   ${outcome.title}`;
  const prefix = outcome.status === "fail" ? "FAIL" : "skip";
  return `${prefix} ${outcome.title}: ${outcome.findings.map(renderFinding).join(" ")}`;
}
function renderFinding(entry) {
  return entry.subject === void 0 ? `[${entry.code}]` : `[${entry.code}:${entry.subject}]`;
}

// src/checks/lib.ts
var import_node_fs33 = require("node:fs");
var import_node_path27 = require("node:path");
function makeContext(root, io2) {
  return {
    root,
    io: io2,
    registries: lazyRegistries(root),
    skipped: /* @__PURE__ */ new Set(),
    readText(rel) {
      try {
        return (0, import_node_fs33.readFileSync)((0, import_node_path27.join)(root, rel), "utf8");
      } catch {
        return void 0;
      }
    },
    exists(rel) {
      return (0, import_node_fs33.existsSync)((0, import_node_path27.join)(root, rel));
    },
    list(relDir) {
      try {
        return (0, import_node_fs33.readdirSync)((0, import_node_path27.join)(root, relDir)).sort(byteOrder);
      } catch {
        return [];
      }
    }
  };
}
function skipOnce(ctx, check, title, token) {
  if (!claim(ctx, `once:${token}`)) return [];
  return [result(check, title, [finding(check, "precondition-missing", token)])];
}
function skipPending(ctx, check, title, path) {
  if (!claim(ctx, `pending:${path}`)) return [];
  return [result(check, title, [finding(check, "artifact-pending", path)], { pending: true })];
}
function deferralsOf2(ctx, rule) {
  return deferralsOf(ctx.root, rule, alwaysOnRules(ctx.readText("CLAUDE.md") ?? ""));
}
function claim(ctx, key) {
  if (ctx.skipped.has(key)) return false;
  ctx.skipped.add(key);
  return true;
}
function byteOrder(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/checks/agents-skills.ts
var C9_FINDINGS = ["name-drifts-from-filename", "description-missing", "tools-missing"];
var C10_FINDINGS = ["return-format-section-missing", "status-enum-missing"];
var C11_FINDINGS = ["command-missing", "alias-command-missing"];
var C12_FINDINGS = ["skill-md-missing", "name-drifts-from-directory", "description-missing"];
var C13_FINDINGS = ["empty-document"];
var C31_FINDINGS = ["unknown-tier", "tier-model-mismatch"];
var AGENTS_SKILLS_CHECKS = [
  { id: "C9", codes: C9_FINDINGS, run: checkC9 },
  { id: "C10", codes: C10_FINDINGS, run: checkC10 },
  { id: "C11", codes: C11_FINDINGS, run: checkC11 },
  { id: "C12", codes: C12_FINDINGS, run: checkC12 },
  { id: "C13", codes: C13_FINDINGS, run: checkC13 },
  { id: "C31", codes: C31_FINDINGS, run: checkC31 }
];
var C9_TITLE = "agent frontmatter complete and name matches filename";
var C10_TITLE = "every agent declares the canonical Return format envelope";
var C11_TITLE = "every agent and alias has a slash command";
var C12_TITLE = "every skill has SKILL.md with matching name and a description";
var C13_TITLE = "no empty rule/agent/skill documents";
var C31_TITLE = "every agent's tier binds the model it declares";
var RETURN_FORMAT_HEADING = "## Return format";
var STATUS_ENUM_LINE = "status: OK | DEGRADED | CRITICAL | BLOCKED | FAILED";
function scanAgentContracts(ctx) {
  const frontmatter = [];
  const returnFormat = [];
  const commands = [];
  for (const base of agentBaseNames(ctx)) {
    const text3 = ctx.readText(`agents/${base}.md`) ?? "";
    const name = frontmatterValue(text3, "name");
    const description = frontmatterValue(text3, "description");
    if (name !== base) {
      frontmatter.push(finding("C9", "name-drifts-from-filename", `${base}:${orNone(name)}`));
    }
    if (description === "") frontmatter.push(finding("C9", "description-missing", base));
    if (frontmatterValue(text3, "tools") === "") frontmatter.push(finding("C9", "tools-missing", base));
    const lines = text3.split("\n");
    if (!lines.some((line) => line.startsWith(RETURN_FORMAT_HEADING))) {
      returnFormat.push(finding("C10", "return-format-section-missing", base));
    }
    if (!lines.includes(STATUS_ENUM_LINE)) returnFormat.push(finding("C10", "status-enum-missing", base));
    if (!ctx.exists(`commands/agents/${base}.md`)) commands.push(finding("C11", "command-missing", base));
    for (const alias of aliasesOf(description)) {
      if (ctx.exists(`commands/agents/${alias}.md`)) continue;
      commands.push(finding("C11", "alias-command-missing", `${base}:${alias}`));
    }
  }
  return { frontmatter, returnFormat, commands };
}
var ALIAS_DECLARATION = /Alias(?:es)?: ([a-z-]+)/g;
function aliasesOf(description) {
  return [...description.matchAll(ALIAS_DECLARATION)].map((match) => match[1]).filter((alias) => alias !== void 0);
}
function checkC9(ctx) {
  return [result("C9", C9_TITLE, scanAgentContracts(ctx).frontmatter)];
}
function checkC10(ctx) {
  return [result("C10", C10_TITLE, scanAgentContracts(ctx).returnFormat)];
}
function checkC11(ctx) {
  return [result("C11", C11_TITLE, scanAgentContracts(ctx).commands)];
}
function checkC12(ctx) {
  const found = [];
  for (const skill of skillDirectories(ctx)) {
    const text3 = ctx.readText(`skills/${skill}/SKILL.md`);
    if (text3 === void 0) {
      found.push(finding("C12", "skill-md-missing", skill));
      continue;
    }
    const name = frontmatterValue(text3, "name");
    if (name !== skill) found.push(finding("C12", "name-drifts-from-directory", `${skill}:${orNone(name)}`));
    if (frontmatterValue(text3, "description") === "") found.push(finding("C12", "description-missing", skill));
  }
  return [result("C12", C12_TITLE, found)];
}
var DOCUMENT_GROUPS = [
  { pattern: "rules/*.md", paths: (ctx) => markdownIn(ctx, "rules") },
  { pattern: "agents/*.md", paths: (ctx) => markdownIn(ctx, "agents") },
  {
    // The glob matches only the SKILL.md files that exist; a skill directory
    // without one contributes nothing here, and C12 owns that absence.
    pattern: "skills/*/SKILL.md",
    paths: (ctx) => skillDirectories(ctx).map((skill) => `skills/${skill}/SKILL.md`).filter((path) => isFile7(ctx.root, path))
  }
];
function checkC13(ctx) {
  const found = [];
  for (const group of DOCUMENT_GROUPS) {
    const paths = group.paths(ctx);
    if (paths.length === 0) {
      found.push(finding("C13", "empty-document", group.pattern));
      continue;
    }
    for (const path of paths) {
      if (sizeOf(ctx.root, path) === 0) found.push(finding("C13", "empty-document", path));
    }
  }
  return [result("C13", C13_TITLE, found)];
}
var MODELS_REGISTRY = "registries/models.json";
function checkC31(ctx) {
  var _a;
  if (!ctx.exists(MODELS_REGISTRY)) return skipOnce(ctx, "C31", C31_TITLE, "models");
  const tiers = modelTiers2(ctx);
  const found = [];
  for (const base of agentBaseNames(ctx)) {
    const text3 = ctx.readText(`agents/${base}.md`) ?? "";
    const tier = frontmatterValue(text3, "tier");
    const model = frontmatterValue(text3, "model");
    if (tier === "" || model === "") continue;
    const bound = ((_a = tiers.find((row) => row.id === tier)) == null ? void 0 : _a.model) ?? "";
    if (bound === "") found.push(finding("C31", "unknown-tier", `${base}:${tier}`));
    else if (bound !== model) found.push(finding("C31", "tier-model-mismatch", `${base}:${bound}!=${model}`));
  }
  return [result("C31", C31_TITLE, found)];
}
function modelTiers2(ctx) {
  try {
    return ctx.registries.models.tiers;
  } catch (error) {
    if (error instanceof KernelError) return [];
    throw error;
  }
}
function agentBaseNames(ctx) {
  return markdownIn(ctx, "agents").map((path) => path.slice("agents/".length, -".md".length));
}
function markdownIn(ctx, directory) {
  return ctx.list(directory).filter((entry) => entry.endsWith(".md")).map((entry) => `${directory}/${entry}`);
}
function skillDirectories(ctx) {
  return ctx.list("skills").filter((entry) => isDirectory9(ctx.root, `skills/${entry}`));
}
function isDirectory9(root, relativePath) {
  try {
    return (0, import_node_fs34.statSync)((0, import_node_path28.join)(root, relativePath)).isDirectory();
  } catch {
    return false;
  }
}
function isFile7(root, relativePath) {
  try {
    return (0, import_node_fs34.statSync)((0, import_node_path28.join)(root, relativePath)).isFile();
  } catch {
    return false;
  }
}
function sizeOf(root, relativePath) {
  try {
    return (0, import_node_fs34.statSync)((0, import_node_path28.join)(root, relativePath)).size;
  } catch {
    return 0;
  }
}
function orNone(value) {
  return value === "" ? "<none>" : value;
}

// src/checks/contracts-archive.ts
var import_node_fs35 = require("node:fs");
var import_node_path30 = require("node:path");

// src/checks/contracts-intents.ts
var import_node_path29 = require("node:path");
var INTENTS_PATH = "registries/intents.json";
function intentRow(ctx, id) {
  let document;
  try {
    document = readJsonFile((0, import_node_path29.join)(ctx.root, INTENTS_PATH));
  } catch {
    return void 0;
  }
  if (!isRecord(document)) return void 0;
  const declared4 = document["intents"];
  if (!Array.isArray(declared4)) return void 0;
  const rows3 = declared4;
  for (const row of rows3) {
    if (isRecord(row) && row["id"] === id) return row;
  }
  return void 0;
}
function stringsAt(source, key) {
  if (source === void 0) return [];
  const value = source[key];
  if (!Array.isArray(value)) return [];
  const items = value;
  return items.filter((item) => typeof item === "string");
}
function recordAt(source, key) {
  if (source === void 0) return void 0;
  const value = source[key];
  return isRecord(value) ? value : void 0;
}
function stringAt(source, key) {
  if (source === void 0) return "";
  const value = source[key];
  return typeof value === "string" ? value : "";
}
var ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
function firstField(text3, key) {
  const prefix = `${key}: `;
  for (const line of text3.split("\n")) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
  return "";
}
function headingsOf(text3) {
  const headings = [];
  for (const line of text3.split("\n")) {
    if (line.startsWith("## ")) headings.push(line.slice(3));
  }
  return headings;
}
function hasHeading(text3, section) {
  const wanted = `## ${section}`;
  return text3.split("\n").some((line) => line === wanted);
}

// src/checks/contracts-archive.ts
var ARCHIVE_DIR = ".engineos/archived";
function archiveContract(ctx) {
  const contract = recordAt(intentRow(ctx, "record-change"), "archive_contract");
  const since = recordAt(contract, "instance_sections_since");
  return {
    grandfatheredBefore: stringAt(contract, "grandfathered_before"),
    instanceSectionsSince: stringAt(since, "date"),
    specPathPrefix: stringAt(contract, "spec_path_prefix"),
    specExemptPattern: compilePattern2(stringAt(contract, "spec_exempt_pattern")),
    domains: new Set(stringsAt(contract, "domains")),
    instanceSections: stringsAt(contract, "instance_sections"),
    sinceSections: stringsAt(since, "sections")
  };
}
function compilePattern2(source) {
  if (source === "") return void 0;
  try {
    return new RegExp(source);
  } catch {
    return void 0;
  }
}
function auditArchive(ctx, contract) {
  const wellFormed = [];
  const specLinks = [];
  for (const record2 of archivedRecords(ctx.root)) {
    const text3 = ctx.readText(record2) ?? "";
    const completed = firstField(text3, "completed");
    const name = firstField(text3, "name");
    const gate = completed !== "" ? completed : name.slice(0, DATE_LENGTH);
    if (gate < contract.grandfatheredBefore) continue;
    const base = (0, import_node_path30.basename)(record2, ".md");
    auditRecord({ record: record2, base, text: text3, completed, name, contract }, wellFormed);
    auditSpecLink({ ctx, base, text: text3, contract }, specLinks);
  }
  return { wellFormed, specLinks };
}
var DATE_LENGTH = 10;
function auditRecord(subject, into) {
  const { record: record2, base, text: text3, completed, name, contract } = subject;
  const status = firstField(text3, "status");
  const domain = firstField(text3, "domain");
  if (status !== "done") into.push(finding("C21c", "status-not-done", `${base}:${status}`));
  if (!ISO_DATE.test(completed)) into.push(finding("C21c", "completed-missing-or-malformed", base));
  if (name !== base) into.push(finding("C21c", "name-drifts-from-filename", base));
  if (!contract.domains.has(domain)) into.push(finding("C21c", "domain-not-in-enum", `${base}:${domain}`));
  const want = `${ARCHIVE_DIR}/${completed.slice(0, 4)}/${completed.slice(5, 7)}/${domain}/${base}.md`;
  if (record2 !== want) into.push(finding("C21c", "filed-at-wrong-path", base));
  if (hasOpenChecklistItem(text3)) into.push(finding("C21c", "unresolved-checklist-item", base));
  for (const section of contract.instanceSections) {
    if (!hasHeading(text3, section)) into.push(finding("C21c", "missing-section", `${base}:${section}`));
  }
  if (!(completed < contract.instanceSectionsSince)) {
    for (const section of contract.sinceSections) {
      if (!hasHeading(text3, section)) into.push(finding("C21c", "missing-section", `${base}:${section}`));
    }
  }
}
function auditSpecLink(subject, into) {
  var _a;
  const { ctx, base, text: text3, contract } = subject;
  const spec = firstField(text3, "spec");
  if (spec === "") {
    into.push(finding("C21c", "spec-field-missing-or-empty", base));
    return;
  }
  if (((_a = contract.specExemptPattern) == null ? void 0 : _a.test(spec)) === true) return;
  if (!spec.startsWith(contract.specPathPrefix)) {
    into.push(finding("C21c", "spec-not-under-prefix", `${base}:${spec}`));
    return;
  }
  if (!isNonEmptyFile((0, import_node_path30.join)(ctx.root, spec))) {
    into.push(finding("C21c", "spec-file-missing-or-empty", `${base}:${spec}`));
  }
}
function archivedRecords(root) {
  const found = [];
  walk2((0, import_node_path30.join)(root, ARCHIVE_DIR), ARCHIVE_DIR, found);
  return found.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
function walk2(absolute, relative2, into) {
  let names2;
  try {
    names2 = (0, import_node_fs35.readdirSync)(absolute);
  } catch {
    return;
  }
  for (const name of names2) {
    const child2 = (0, import_node_path30.join)(absolute, name);
    if (isDirectory10(child2)) walk2(child2, `${relative2}/${name}`, into);
    else if (name.endsWith(".md") && name !== "README.md") into.push(`${relative2}/${name}`);
  }
}
function isDirectory10(path) {
  try {
    return (0, import_node_fs35.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isNonEmptyFile(path) {
  try {
    return (0, import_node_fs35.statSync)(path).size > 0;
  } catch {
    return false;
  }
}
function hasOpenChecklistItem(text3) {
  return text3.split("\n").some((line) => line.startsWith("- [ ]"));
}

// src/checks/mirror.ts
var CAPTURE = "([A-Za-z0-9@_./:-]+)";
var REGISTRY_FILE_BY_NAME = {
  routing: "routing.json",
  intents: "intents.json",
  models: "models.json",
  policy: "policy.json",
  decisionRules: "decision-rules.json",
  capabilities: "capabilities.json",
  agents: "agents.json"
};
var REGISTRY_FILES = new Map(Object.entries(REGISTRY_FILE_BY_NAME));
var SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[\]|\[id=([^\]]+)\])?$/;
function resolveRegistryPath(root, path) {
  const dot = path.indexOf(".");
  if (dot <= 0) throw new KernelError(`registry path '${path}' names no registry`);
  const name = path.slice(0, dot);
  const file = REGISTRY_FILES.get(name);
  if (file === void 0) throw new KernelError(`registry path '${path}' names an unknown registry '${name}'`);
  let cursor = [readJsonFile(registryPath(root, file))];
  for (const segment of path.slice(dot + 1).split(".")) {
    cursor = step(cursor, segment, path);
  }
  const values = [];
  for (const value of cursor) {
    if (Array.isArray(value)) for (const element of value) values.push(scalar(element, path));
    else values.push(scalar(value, path));
  }
  return values;
}
function sliceSection(text3, anchor) {
  const lines = text3.split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== void 0 && line.trimEnd() === anchor) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return void 0;
  const body = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === void 0 || line.startsWith("## ")) break;
    body.push(line);
  }
  return body.join("\n");
}
function runMirrors(rows3, ctx) {
  const findings = [];
  for (const row of rows3) findings.push(...runRow(row, ctx));
  return findings;
}
function runRow(row, ctx) {
  assertPlaceholder(row);
  const text3 = ctx.readText(row.doc);
  if (text3 === void 0) return [fail5(row, `doc-missing:${row.doc}`)];
  const haystack = sliceHaystack(row, text3);
  if (typeof haystack !== "string") return [fail5(row, haystack.subject)];
  let values;
  try {
    values = resolveRegistryPath(ctx.root, row.registry);
  } catch {
    return [fail5(row, `registry-empty:${row.registry}`)];
  }
  if (values.length === 0) return [fail5(row, `registry-empty:${row.registry}`)];
  return row.kind === "names" ? names(row, haystack, values) : quotes(row, haystack, values);
}
function sliceHaystack(row, text3) {
  if (row.scope === "file") return text3;
  const anchor = row.anchor;
  if (anchor === void 0) throw new KernelError(`mirror row '${row.id}' has no anchor and is not scope: 'file'`);
  const section = sliceSection(text3, anchor);
  if (section === void 0) return { subject: `section-missing:${anchor}` };
  if (section.trim() === "") return { subject: `section-empty:${anchor}` };
  return section;
}
function names(row, haystack, values) {
  const findings = [];
  if (row.direction !== "registry-names-doc") {
    for (const value of values) {
      const pattern = new RegExp(fill(row.element, "{x}", escapeRegExp2(value)), flags(row, "m"));
      if (!pattern.test(haystack)) findings.push(fail5(row, value));
    }
  }
  if (row.direction !== "doc-names-registry") {
    const declared4 = new Set(values.map((value) => normalize(row, value)));
    const pattern = new RegExp(fill(row.element, "{x}", CAPTURE), flags(row, "gm"));
    for (const match of haystack.matchAll(pattern)) {
      const captured = match[1];
      if (captured !== void 0 && !declared4.has(normalize(row, captured))) {
        findings.push(fail5(row, `undeclared:${captured}`));
      }
    }
  }
  return findings;
}
function quotes(row, haystack, values) {
  if (values.length > 1) return [fail5(row, `registry-ambiguous:${row.registry}`)];
  const expected = values[0];
  if (expected === void 0) return [fail5(row, `registry-empty:${row.registry}`)];
  const pattern = new RegExp(fill(row.pattern, "{n}", "(\\d+)"), flags(row, "gm"));
  const captured = [...haystack.matchAll(pattern)].map((match) => match[1]).filter((n) => n !== void 0);
  if (captured.length === 0) return [fail5(row, "pattern-missing")];
  if (captured.length > 1) return [fail5(row, "pattern-ambiguous")];
  const found = captured[0];
  if (found === void 0 || found === expected) return [];
  return [fail5(row, `${found}!=${expected}`)];
}
function assertPlaceholder(row) {
  const source = row.kind === "names" ? row.element : row.pattern;
  const placeholder2 = row.kind === "names" ? "{x}" : "{n}";
  if (!source.includes(placeholder2)) {
    throw new KernelError(`mirror row '${row.id}' has no ${placeholder2} placeholder, so it would match vacuously`);
  }
}
function step(cursor, segment, path) {
  const parsed = SEGMENT.exec(segment);
  const key = parsed == null ? void 0 : parsed[1];
  if (parsed === null || key === void 0) throw new KernelError(`registry path '${path}' has an unreadable segment '${segment}'`);
  const wanted = parsed[2];
  const mapped = segment.endsWith("[]");
  const next = [];
  for (const value of cursor) {
    if (!isRecord(value)) throw new KernelError(`registry path '${path}': '${key}' has no object to read from`);
    const child2 = value[key];
    if (child2 === void 0 || child2 === null) throw new KernelError(`registry path '${path}' has no segment '${key}'`);
    if (wanted !== void 0) next.push(selectById(child2, wanted, key, path));
    else if (mapped) next.push(...asArray2(child2, key, path));
    else next.push(child2);
  }
  return next;
}
function asArray2(child2, key, path) {
  if (!Array.isArray(child2)) throw new KernelError(`registry path '${path}': '${key}' is not an array`);
  return child2;
}
function selectById(child2, wanted, key, path) {
  for (const element of asArray2(child2, key, path)) {
    if (isRecord(element) && element["id"] === wanted) return element;
  }
  throw new KernelError(`registry path '${path}': '${key}' has no element with id '${wanted}'`);
}
function scalar(value, path) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  throw new KernelError(`registry path '${path}' does not end on a scalar`);
}
function fail5(row, subject) {
  return { code: row.id, subject };
}
function fill(source, placeholder2, replacement) {
  return source.replace(placeholder2, () => replacement);
}
function flags(row, base) {
  return row.ignoreCase === true ? `${base}i` : base;
}
function normalize(row, value) {
  return row.ignoreCase === true ? value.toLowerCase() : value;
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/checks/mirrors.ts
var ROWS = [
  // --------------------------------------------------------------- C16
  // Stays code in 40-decision-registries.sh: the ADR and code-review rows of
  // rules/models.md (they join work_types[].tier to tiers[].model, and a path
  // resolves one field, never a join); the spelled-out retry bound ("Two
  // attempts per unit, one escalation" carries no numeral to capture); the
  // shared-binding documentation grep; the CLAUDE.md router-row count; and
  // every registry-to-registry assertion in the check.
  {
    id: "model-missing-from-prose",
    check: "C16",
    registry: "models.tiers[].model",
    doc: "rules/models.md",
    // scope: file — the bash greps the whole document, and a tier's model is
    // named in the escalation prose as well as in the table.
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "`{x}`"
  },
  {
    id: "gate-ladder-missing-from-prose",
    check: "C16",
    registry: "policy.gates.ladder",
    doc: "rules/gates.md",
    anchor: "## The ladder",
    // Deviation 5: the bash compared policy.json against a literal string and
    // never opened rules/gates.md. This row reads the ladder table for real.
    direction: "doc-names-registry",
    ignoreCase: true,
    kind: "names",
    element: "^\\| {x} \\|"
  },
  {
    id: "wave-cap-drift",
    check: "C16",
    registry: "policy.parallelism.wave_concurrency_cap",
    doc: "rules/parallelism.md",
    // scope: file — the bash greps the sentence wherever it sits in the file.
    scope: "file",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "Cap concurrency at ~{n}"
  },
  {
    id: "spec-threshold-drift",
    check: "C16",
    registry: "policy.gates.spec_threshold.files_greater_than",
    doc: "CLAUDE.md",
    // scope: file — non-negotiable #1 is prose, not a section of its own.
    scope: "file",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "touching >{n} files"
  },
  {
    id: "fanout-threshold-drift",
    check: "C16",
    registry: "policy.parallelism.fanout_signals.files_greater_than",
    doc: "rules/parallelism.md",
    // scope: file — as above; the threshold sits in the opening paragraph.
    scope: "file",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "\\*\\*>{n} files\\*\\*"
  },
  // --------------------------------------------------------------- C19b
  // Stays code: the reverse assertion (every `## ` heading in the template is
  // declared). Section names are multi-word, and the reverse capture class
  // stops at a space, so reversing here would match nothing and pass.
  {
    id: "template-missing-section",
    check: "C19b",
    registry: "intents.intents[id=handoff].required_sections",
    doc: "templates/handoff.md",
    // scope: file — the whole template is the mirrored surface.
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "^## {x}$"
  },
  {
    id: "template-missing-field",
    check: "C19b",
    registry: "intents.intents[id=handoff].required_fields",
    doc: "templates/handoff.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "^{x}:"
  },
  // --------------------------------------------------------------- C19c
  // The element pins the match to the router row itself rather than to the
  // document, which is what the bash did by extracting the row first.
  {
    id: "claude-row-missing-section",
    check: "C19c",
    registry: "intents.intents[id=handoff].required_sections",
    doc: "CLAUDE.md",
    // scope: file — the row is found by its own load target, not by a heading.
    scope: "file",
    direction: "doc-names-registry",
    ignoreCase: true,
    kind: "names",
    element: "^\\|.*templates/handoff\\.md.*{x}"
  },
  {
    id: "claude-row-missing-field",
    check: "C19c",
    registry: "intents.intents[id=handoff].required_fields",
    doc: "CLAUDE.md",
    scope: "file",
    direction: "doc-names-registry",
    ignoreCase: true,
    kind: "names",
    element: "^\\|.*templates/handoff\\.md.*{x}"
  },
  // --------------------------------------------------------------- C20c
  // Stays code: the two "until clean" canaries and the verify-done note
  // pointer — literal strings, with no registry side to mirror.
  {
    id: "fix-attempt-bound-drift",
    check: "C20c",
    registry: "policy.repair.max_fix_attempts_per_check",
    doc: "CLAUDE.md",
    // scope: file — the bash greps table rows, and the element carries the row
    // shape (`^|` … `kernel.sh repair`) so the file scope stays non-vacuous.
    scope: "file",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "^\\|.*{n} fix attempts per check.*kernel\\.sh repair"
  },
  // --------------------------------------------------------------- C21b
  // Stays code: the reverse assertion, for C19b's reason.
  {
    id: "template-missing-section",
    check: "C21b",
    registry: "intents.intents[id=record-change].required_sections",
    doc: ".engineos/changes/_template.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "^## {x}$"
  },
  {
    id: "template-missing-field",
    check: "C21b",
    registry: "intents.intents[id=record-change].required_fields",
    doc: ".engineos/changes/_template.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "^{x}:"
  },
  // --------------------------------------------------------------- C21e
  // Three homes, one registry list, one row each: a finding must say WHICH
  // home lost the domain. Stays code: the changes/README.md canary that keeps
  // the killed inline schema copy dead.
  {
    id: "skill-missing-domain",
    check: "C21e",
    registry: "intents.intents[id=record-change].archive_contract.domains",
    doc: "skills/record-change/SKILL.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "{x}"
  },
  {
    id: "archive-readme-missing-domain",
    check: "C21e",
    registry: "intents.intents[id=record-change].archive_contract.domains",
    doc: ".engineos/archived/README.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "{x}"
  },
  {
    id: "template-missing-domain",
    check: "C21e",
    registry: "intents.intents[id=record-change].archive_contract.domains",
    doc: ".engineos/changes/_template.md",
    scope: "file",
    direction: "doc-names-registry",
    kind: "names",
    element: "{x}"
  },
  // --------------------------------------------------------------- C23
  // Stays code: the ORDER of the precedence chain (the bash compares the whole
  // rendered sentence, and a per-element row cannot express order), and C23b's
  // CLAUDE.md-to-COMPATIBILITY.md always-on list, which has no registry side.
  {
    id: "precedence-domain-missing",
    check: "C23",
    registry: "routing.precedence",
    doc: "CLAUDE.md",
    anchor: "## Router \u2014 classify before acting",
    // The chain wraps across two lines, so the separator is matched with \s
    // rather than a literal space; 'chain:' carries the first domain.
    direction: "doc-names-registry",
    kind: "names",
    element: "(?:chain:|\u2192)\\s*{x}"
  },
  // --------------------------------------------------------------- C24c
  // Stays code: the 'kernel.sh admit' literal. Anchored to the section the
  // claim is about, where the bash grepped the whole file.
  {
    id: "action-row-missing",
    check: "C24c",
    registry: "policy.parallelism.backpressure.actions",
    doc: "rules/parallelism.md",
    anchor: "## Backpressure",
    // both: actions is a closed answer set, so a table row the kernel never
    // answers is drift in the direction the bash could not see.
    direction: "both",
    kind: "names",
    element: "^\\| `{x}`"
  },
  {
    id: "queue-bound-drift",
    check: "C24c",
    registry: "policy.parallelism.backpressure.max_queued_units",
    doc: "rules/parallelism.md",
    anchor: "## Backpressure",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "max_queued_units[^0-9]*{n}\\b"
  },
  {
    id: "overload-row-missing",
    check: "C24c",
    registry: "policy.parallelism.backpressure.overload_action",
    doc: "rules/parallelism.md",
    anchor: "## Backpressure",
    direction: "doc-names-registry",
    kind: "names",
    element: "^\\| `{x}`.*max_queued_units"
  },
  // --------------------------------------------------------------- C25c
  // Stays code: the 'kernel.sh breaker' literal. The scope row is anchored on
  // the vocabulary SENTENCE, not the section: `provider` and `tool` also occur
  // in the exec-journal paragraph inside this section, so a section-wide
  // element would pass with the vocabulary deleted.
  {
    id: "state-row-missing",
    check: "C25c",
    registry: "policy.breaker.states",
    doc: "rules/parallelism.md",
    anchor: "## Circuit breaker",
    direction: "both",
    kind: "names",
    element: "^\\| `{x}`"
  },
  {
    id: "failure-threshold-drift",
    check: "C25c",
    registry: "policy.breaker.failure_threshold",
    doc: "rules/parallelism.md",
    anchor: "## Circuit breaker",
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "failure_threshold[^0-9]*{n}\\b"
  },
  {
    id: "scope-vocabulary-missing",
    check: "C25c",
    registry: "policy.breaker.scopes",
    doc: "rules/parallelism.md",
    anchor: "## Circuit breaker",
    // [^.] spans the line wrap and stops at the sentence's period, which is the
    // bash's "flatten, split on '.', keep the fragment saying 'scopes over'".
    direction: "doc-names-registry",
    kind: "names",
    element: "scopes over[^.]*`{x}`"
  },
  // --------------------------------------------------------------- C26c
  // Stays code: the 'kernel.sh hitl' literal and the three record_home
  // mirrors, which derive a heading from the value's URL fragment rather than
  // naming the value itself.
  {
    id: "reason-row-missing",
    check: "C26c",
    registry: "policy.hitl.reasons",
    doc: "rules/risk-autonomy.md",
    anchor: "## Human-in-the-loop",
    // both: the registry calls reasons a CLOSED vocabulary, so a reason the
    // prose invents is the failure this row exists to catch.
    direction: "both",
    kind: "names",
    element: "^\\| `{x}`"
  },
  // --------------------------------------------------------------- C27d
  // Stays code: every literal caveat the section must keep (the 0-is-not-free
  // and status-is-a-FLOOR warnings, the all-but-note slug claim, trace_id /
  // span_kind / cost_micros / tokens_in), the span-kind alternation asserted
  // as one ordered string, and the parallelism.md back-reference.
  {
    id: "span-kind-missing",
    check: "C27d",
    registry: "policy.telemetry.exec_journal.span_kinds",
    doc: "rules/observability.md",
    anchor: "## Agent traces",
    // Pinned to the alternation sentence rather than the section: every kind
    // is a substring of some other bullet, which is the vacuity the bash
    // patched by asserting the whole line separately.
    direction: "doc-names-registry",
    kind: "names",
    element: "is one of[^.]*{x}"
  },
  {
    id: "journal-home-missing",
    check: "C27d",
    registry: "policy.telemetry.exec_journal.home",
    doc: "rules/observability.md",
    anchor: "## Agent traces",
    direction: "doc-names-registry",
    kind: "names",
    element: "{x}"
  },
  {
    id: "value-length-drift",
    check: "C27d",
    registry: "policy.telemetry.exec_journal.max_value_length",
    doc: "rules/observability.md",
    anchor: "## Agent traces",
    // The bash asserted only that the field NAME is stated; the number beside
    // it is the same claim, checked.
    direction: "doc-names-registry",
    kind: "quotes",
    pattern: "max_value_length[^0-9]*{n}\\b"
  }
];
var MIRRORS = ROWS;
function rowsOf(check) {
  return MIRRORS.filter((row) => row.check === check);
}

// src/checks/contracts.ts
var C19_FINDINGS = [
  "required-sections-missing-or-empty",
  "required-fields-missing-or-empty",
  "note-carries-the-section-list"
];
var C19b_FINDINGS = [
  "template-missing-section",
  "template-missing-field",
  "template-section-not-declared"
];
var C19c_FINDINGS = [
  "router-row-missing",
  "claude-row-missing-section",
  "claude-row-missing-field"
];
var C21_FINDINGS = [
  "required-sections-missing-or-empty",
  "required-fields-missing-or-empty",
  "domains-missing-or-empty",
  "domains-has-duplicates",
  "date-field-not-a-date",
  "spec-exempt-pattern-missing-or-invalid",
  "instance-section-not-required"
];
var C21b_FINDINGS = [
  "template-missing-section",
  "template-missing-field",
  "template-section-not-declared"
];
var C21c_FINDINGS = [
  "status-not-done",
  "completed-missing-or-malformed",
  "name-drifts-from-filename",
  "domain-not-in-enum",
  "filed-at-wrong-path",
  "unresolved-checklist-item",
  "missing-section",
  "spec-field-missing-or-empty",
  "spec-file-missing-or-empty",
  "spec-not-under-prefix"
];
var C21e_FINDINGS = [
  "skill-missing-domain",
  "archive-readme-missing-domain",
  "template-missing-domain",
  "changes-readme-regrew-inline-schema-copy"
];
var HANDOFF_TEMPLATE = "templates/handoff.md";
var CHANGE_TEMPLATE = ".engineos/changes/_template.md";
var CHANGES_README = ".engineos/changes/README.md";
function checkC19(ctx) {
  const title = "handoff intent carries required_sections/required_fields as data";
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, "C19", title, "handoff");
  const row = intentRow(ctx, "handoff");
  const found = [];
  if (stringsAt(row, "required_sections").length === 0) found.push(finding("C19", "required-sections-missing-or-empty"));
  if (stringsAt(row, "required_fields").length === 0) found.push(finding("C19", "required-fields-missing-or-empty"));
  if (/required sections:/i.test(stringAt(row, "note"))) found.push(finding("C19", "note-carries-the-section-list"));
  return [result("C19", title, found)];
}
function checkC19b(ctx) {
  const sectionTitle = "handoff template carries every registry-required section";
  const fieldTitle = "handoff template carries every registry-required field line";
  const reverseTitle = "every handoff template section is declared in the registry";
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, "C19b", sectionTitle, "handoff");
  const groups = groupByCode(runMirrors(rowsOf("C19b"), ctx));
  const sections = take(groups, "template-missing-section");
  const fields = take(groups, "template-missing-field");
  return [
    result("C19b", sectionTitle, [...sections, ...drain(groups)]),
    result("C19b", fieldTitle, fields),
    result("C19b", reverseTitle, undeclaredHeadings("C19b", ctx, HANDOFF_TEMPLATE, "handoff"))
  ];
}
function checkC19c(ctx) {
  const title = "CLAUDE.md handoff row mirrors every required section and field";
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, "C19c", title, "handoff");
  if (!hasRouterRow(ctx.readText("CLAUDE.md") ?? "", HANDOFF_TEMPLATE)) {
    return [result("C19c", title, [finding("C19c", "router-row-missing", "CLAUDE.md")])];
  }
  return [result("C19c", title, runMirrors(rowsOf("C19c"), ctx))];
}
function checkC21(ctx) {
  const title = "record-change intent carries the change-record contract as data";
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, "C21", title, "change-record");
  const row = intentRow(ctx, "record-change");
  const contract = recordAt(row, "archive_contract");
  const since = recordAt(contract, "instance_sections_since");
  const sections = stringsAt(row, "required_sections");
  const domains = stringsAt(contract, "domains");
  const found = [];
  if (sections.length === 0) found.push(finding("C21", "required-sections-missing-or-empty"));
  if (stringsAt(row, "required_fields").length === 0) found.push(finding("C21", "required-fields-missing-or-empty"));
  if (domains.length === 0) found.push(finding("C21", "domains-missing-or-empty"));
  if (new Set(domains).size !== domains.length) found.push(finding("C21", "domains-has-duplicates"));
  const dated = [
    ["grandfathered_before", stringAt(contract, "grandfathered_before")],
    ["instance_sections_since.date", stringAt(since, "date")]
  ];
  for (const [field, value] of dated) {
    if (!ISO_DATE.test(value)) found.push(finding("C21", "date-field-not-a-date", field));
  }
  if (compilePattern2(stringAt(contract, "spec_exempt_pattern")) === void 0) {
    found.push(finding("C21", "spec-exempt-pattern-missing-or-invalid"));
  }
  const declared4 = new Set(sections);
  for (const section of [...stringsAt(contract, "instance_sections"), ...stringsAt(since, "sections")]) {
    if (!declared4.has(section)) found.push(finding("C21", "instance-section-not-required", section));
  }
  return [result("C21", title, found)];
}
function checkC21b(ctx) {
  const sectionTitle = "change template carries every registry-required section";
  const fieldTitle = "change template carries every registry-required field line";
  const reverseTitle = "every change template section is declared in the registry";
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, "C21b", sectionTitle, "change-record");
  const groups = groupByCode(runMirrors(rowsOf("C21b"), ctx));
  const sections = take(groups, "template-missing-section");
  const fields = take(groups, "template-missing-field");
  return [
    result("C21b", sectionTitle, [...sections, ...drain(groups)]),
    result("C21b", fieldTitle, fields),
    result("C21b", reverseTitle, undeclaredHeadings("C21b", ctx, CHANGE_TEMPLATE, "record-change"))
  ];
}
function checkC21c(ctx) {
  const wellFormedTitle = "every checked-era archived change record is a well-formed done claim";
  const specTitle = "every checked-era archived record's spec link resolves (or is an explicit n/a exemption)";
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, "C21c", wellFormedTitle, "change-record");
  const audit = auditArchive(ctx, archiveContract(ctx));
  return [
    result("C21c", wellFormedTitle, audit.wellFormed),
    result("C21c", specTitle, audit.specLinks)
  ];
}
function checkC21e(ctx) {
  const title = "change-record prose mirrors agree with the registry";
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, "C21e", title, "change-record");
  const found = [...runMirrors(rowsOf("C21e"), ctx)];
  const readme = (ctx.readText(CHANGES_README) ?? "").split("\n");
  if (readme.some((line) => line === "status: active")) {
    found.push(finding("C21e", "changes-readme-regrew-inline-schema-copy", CHANGES_README));
  }
  return [result("C21e", title, found)];
}
function hasHandoffInputs(ctx) {
  return ctx.exists(INTENTS_PATH) && ctx.exists(HANDOFF_TEMPLATE);
}
function hasChangeRecordInputs(ctx) {
  return ctx.exists(INTENTS_PATH) && ctx.exists(CHANGE_TEMPLATE);
}
function hasRouterRow(text3, target) {
  return text3.split("\n").some((line) => line.startsWith("|") && line.includes(target));
}
function undeclaredHeadings(check, ctx, template, intent) {
  const declared4 = new Set(stringsAt(intentRow(ctx, intent), "required_sections"));
  return headingsOf(ctx.readText(template) ?? "").filter((heading) => !declared4.has(heading)).map((heading) => finding(check, "template-section-not-declared", heading));
}
function groupByCode(findings) {
  const groups = /* @__PURE__ */ new Map();
  for (const entry of findings) {
    const bucket = groups.get(entry.code);
    if (bucket === void 0) groups.set(entry.code, [entry]);
    else bucket.push(entry);
  }
  return groups;
}
function take(groups, code) {
  const bucket = groups.get(code) ?? [];
  groups.delete(code);
  return bucket;
}
function drain(groups) {
  return [...groups.values()].flat();
}
var CONTRACTS_CHECKS = [
  { id: "C19", codes: C19_FINDINGS, run: checkC19 },
  { id: "C19b", codes: C19b_FINDINGS, run: checkC19b },
  { id: "C19c", codes: C19c_FINDINGS, run: checkC19c },
  { id: "C21", codes: C21_FINDINGS, run: checkC21 },
  { id: "C21b", codes: C21b_FINDINGS, run: checkC21b },
  { id: "C21c", codes: C21c_FINDINGS, run: checkC21c },
  { id: "C21e", codes: C21e_FINDINGS, run: checkC21e }
];

// src/checks/decision-registries-data.ts
function readRegistry(root, name) {
  const raw = readJsonFile(registryPath(root, name));
  return isRecord(raw) ? raw : {};
}
function readModels(root) {
  const raw = readRegistry(root, "models.json");
  return {
    tiers: rows(raw["tiers"]).map((tier) => ({
      id: text2(tier["id"]),
      model: text2(tier["model"]),
      escalatesTo: optional(tier["escalates_to"])
    })),
    escalationOrder: stringArray(raw["escalation_order"]),
    workTypes: rows(raw["work_types"]).map((work) => ({ id: text2(work["id"]), tier: text2(work["tier"]) }))
  };
}
function readIntents(root) {
  return rows(readRegistry(root, "intents.json")["intents"]).map((intent) => ({
    id: text2(intent["id"]),
    rules: stringArray(intent["rules"]),
    skills: stringArray(intent["skills"]),
    agents: stringArray(intent["agents"]),
    signals: stringArray(intent["signals"]),
    note: text2(intent["note"]),
    // `has("domain") and .domain != null` — an absent key and an explicit null
    // are one answer here, which is what the hook_mirrored assertion compares.
    domain: optional(intent["domain"]),
    hookMirrored: intent["hook_mirrored"] === true,
    modelTier: optional(intent["model_tier"]),
    riskFloor: intent["risk_floor"]
  }));
}
function readRoutingDomains(root) {
  let raw;
  try {
    raw = readRegistry(root, "routing.json");
  } catch {
    return [];
  }
  return rows(raw["domains"]).map((domain) => ({ id: text2(domain["id"]), rules: stringArray(domain["rules"]) }));
}
function readPolicy(root) {
  const raw = readRegistry(root, "policy.json");
  const risk = record(raw["risk"]);
  const autonomy = record(raw["autonomy"]);
  const gates = record(raw["gates"]);
  const retry = record(raw["retry"]);
  const neverRetry2 = retry["never_retry"];
  const byRisk = {};
  for (const [tier, value] of Object.entries(record(gates["by_risk"]))) {
    byRisk[tier] = Object.keys(record(value));
  }
  return {
    riskAggregation: text2(risk["aggregation"]),
    riskInputs: rows(risk["inputs"]).map((input) => text2(input["id"])),
    autonomyLevels: rows(autonomy["levels"]).map((level) => text2(level["id"])),
    ceilingByRisk: record(autonomy["ceiling_by_risk"]),
    gateLadder: stringArray(gates["ladder"]),
    gatesByRisk: byRisk,
    neverRetryCount: Array.isArray(neverRetry2) ? neverRetry2.length : 0,
    retryMaxAttempts: retry["max_attempts_per_unit"] ?? null,
    retryEscalations: retry["escalations"] ?? null
  };
}
function rows(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value) {
  return isRecord(value) ? value : {};
}
function text2(value) {
  return typeof value === "string" ? value : "";
}
function optional(value) {
  return typeof value === "string" ? value : null;
}
function duplicates(values) {
  const seen = /* @__PURE__ */ new Set();
  const repeated = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}
function sortedUnique(values) {
  return [...new Set(values)].sort();
}
function subjectText(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return "absent";
  const collapsed = value.trim().replace(/\s+/g, "-");
  return collapsed === "" ? "empty" : collapsed;
}
function unreadableRegistry(path) {
  return result("C16", `${path} is readable`, [finding("C16", "registry-unreadable", path)]);
}

// src/checks/decision-registries-intents.ts
var METASYNTAX = /\b[XYN]\b|>|≥/;
var RISK_TIER = /^(low|medium|high)$/;
var ROUTER_TABLE_HEADER = "| Intent (signals) | Load |";
function intentsResults(ctx) {
  let intents;
  try {
    intents = readIntents(ctx.root);
  } catch {
    return [unreadableRegistry("registries/intents.json")];
  }
  const domains = readRoutingDomains(ctx.root);
  return [
    result(
      "C16",
      "intent ids are unique",
      duplicates(intents.map((intent) => intent.id)).map((id) => finding("C16", "duplicate-intent-id", id))
    ),
    result("C16", "intents.json rules, skills and agents all resolve", dangling(ctx, intents)),
    result("C16", "no intents.json signal carries placeholder metasyntax", signals(intents)),
    result("C16", "hook_mirrored and domain agree on every intent", mirroredFlag(intents)),
    result("C16", "every hook-mirrored intent matches its routing.json domain (rules)", foreignKeys(intents, domains)),
    result("C16", "every routing.json domain is claimed by exactly one intent", claims(intents, domains)),
    result("C16", "every intent model_tier resolves in models.json", modelTiers3(ctx, intents)),
    result("C16", "every intent risk_floor is a valid tier", riskFloors2(intents)),
    result("C16", "intent count matches the CLAUDE.md router table", drift(ctx, intents))
  ];
}
function dangling(ctx, intents) {
  const findings = [];
  for (const rule of sortedUnique(intents.flatMap((intent) => [...intent.rules]))) {
    if (!ctx.exists(`rules/${rule}.md`)) findings.push(finding("C16", "dangling-reference", `rule:${rule}`));
  }
  for (const agent of sortedUnique(intents.flatMap((intent) => [...intent.agents]))) {
    if (!ctx.exists(`agents/${agent}.md`)) findings.push(finding("C16", "dangling-reference", `agent:${agent}`));
  }
  for (const intent of intents) {
    const external = intent.note.toLowerCase().includes("external");
    for (const skill of intent.skills) {
      if (skill.includes(":")) continue;
      if (ctx.exists(`skills/${skill}/SKILL.md`)) continue;
      if (external) continue;
      findings.push(finding("C16", "dangling-reference", `skill:${skill}`));
    }
  }
  return findings;
}
function signals(intents) {
  const findings = [];
  for (const intent of intents) {
    for (const signal of intent.signals) {
      if (!METASYNTAX.test(signal)) continue;
      findings.push(finding("C16", "unmatchable-signal", `${intent.id}:${subjectText(signal)}`));
    }
  }
  return findings;
}
function mirroredFlag(intents) {
  return intents.filter((intent) => intent.hookMirrored !== (intent.domain !== null)).map((intent) => finding("C16", "hook-mirrored-domain-mismatch", intent.id));
}
function foreignKeys(intents, domains) {
  const findings = [];
  for (const intent of intents) {
    if (!intent.hookMirrored) continue;
    const domain = intent.domain === null ? void 0 : domains.find((row) => row.id === intent.domain);
    if (domain === void 0) {
      findings.push(finding("C16", "intent-routing-mismatch", `${intent.id}->${intent.domain ?? "null"}`));
      continue;
    }
    const wanted = domain.rules.join(",");
    const declared4 = intent.rules.join(",");
    if (declared4 !== wanted) {
      findings.push(finding("C16", "intent-routing-mismatch", `${intent.id}(rules:${declared4}!=${wanted})`));
    }
  }
  return findings;
}
function claims(intents, domains) {
  const findings = [];
  for (const domain of domains) {
    const claimed = intents.filter((intent) => intent.domain === domain.id).length;
    if (claimed !== 1) findings.push(finding("C16", "routing-domain-not-claimed-once", `${domain.id}(x${claimed})`));
  }
  return findings;
}
function modelTiers3(ctx, intents) {
  let tierIds;
  try {
    tierIds = readModels(ctx.root).tiers.map((tier) => tier.id);
  } catch {
    return [];
  }
  return intents.filter((intent) => intent.modelTier !== null && !tierIds.includes(intent.modelTier)).map((intent) => finding("C16", "intent-unknown-model-tier", intent.id));
}
function riskFloors2(intents) {
  return intents.filter((intent) => intent.riskFloor !== null && intent.riskFloor !== void 0).filter((intent) => typeof intent.riskFloor !== "string" || !RISK_TIER.test(intent.riskFloor)).map((intent) => finding("C16", "intent-invalid-risk-floor", intent.id));
}
function drift(ctx, intents) {
  const rows3 = routerTableRows(ctx.readText("CLAUDE.md") ?? "");
  if (intents.length === rows3 + 1) return [];
  return [finding("C16", "intent-count-drift", `registry=${intents.length},claude=${rows3}`)];
}
function routerTableRows(text3) {
  const lines = text3.split("\n");
  const start = lines.findIndex((line) => line.startsWith(ROUTER_TABLE_HEADER));
  if (start === -1) return -2;
  let counted = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index > start && line.startsWith("## ")) break;
    if (line.startsWith("|")) counted += 1;
  }
  return counted - 2;
}

// src/checks/decision-registries-policy.ts
var RISK_INPUTS = ["blast-radius", "contract-surface", "data-sensitivity", "reversibility", "spend"];
var AUTONOMY_LEVELS = "A0 A1 A2 A3 A4";
var RISK_TIER2 = /^(low|medium|high)$/;
var NEVER_RETRY_MINIMUM = 4;
function policyResults(ctx, mirror) {
  let policy;
  try {
    policy = readPolicy(ctx.root);
  } catch {
    return [unreadableRegistry("registries/policy.json")];
  }
  return [
    result("C16", "policy.json risk aggregation is max (risk never averages)", aggregation(policy)),
    result("C16", "policy.json carries the five risk inputs", riskInputs(policy)),
    result("C16", "policy.json autonomy levels are A0..A4 in order", autonomyLevels(policy)),
    result("C16", "policy.json autonomy ceiling covers low/medium/high with valid levels", ceiling(policy)),
    // Deviation 5: the bash compared the ladder against a literal string and
    // never opened rules/gates.md. The row reads the `## The ladder` table.
    result("C16", "policy.json gate ladder matches rules/gates.md", mirror("gate-ladder-missing-from-prose")),
    result("C16", "policy.json gates.by_risk covers every ladder gate for every tier", gateCoverage(policy)),
    result("C16", "policy.json never_retry list intact", neverRetry(policy)),
    result("C16", "wave cap agrees between policy.json and rules/parallelism.md", mirror("wave-cap-drift")),
    result("C16", "retry bound agrees: 2 attempts + 1 escalation in prose and policy.json", retryBound(ctx, policy)),
    result("C16", "spec threshold agrees between CLAUDE.md and policy.json", mirror("spec-threshold-drift")),
    result("C16", "fan-out threshold agrees between rules/parallelism.md and policy.json", mirror("fanout-threshold-drift"))
  ];
}
function aggregation(policy) {
  if (policy.riskAggregation === "max") return [];
  return [finding("C16", "risk-aggregation-not-max", subjectText(policy.riskAggregation))];
}
function riskInputs(policy) {
  const findings = [];
  const declared4 = policy.riskInputs;
  for (const id of RISK_INPUTS) {
    if (!declared4.includes(id)) findings.push(finding("C16", "risk-inputs-drift", `missing:${id}`));
  }
  for (const id of declared4) {
    if (!RISK_INPUTS.includes(id)) findings.push(finding("C16", "risk-inputs-drift", `unexpected:${subjectText(id)}`));
  }
  for (const id of duplicates(declared4)) findings.push(finding("C16", "risk-inputs-drift", `duplicate:${id}`));
  return findings;
}
function autonomyLevels(policy) {
  if (policy.autonomyLevels.join(" ") === AUTONOMY_LEVELS) return [];
  return [finding("C16", "autonomy-levels-drift", subjectText(policy.autonomyLevels.join(",")))];
}
function ceiling(policy) {
  const levels = new Set(policy.autonomyLevels);
  const findings = [];
  for (const [tier, level] of Object.entries(policy.ceilingByRisk)) {
    if (RISK_TIER2.test(tier) && typeof level === "string" && levels.has(level)) continue;
    findings.push(finding("C16", "ceiling-by-risk-invalid", subjectText(tier)));
  }
  const entries = Object.keys(policy.ceilingByRisk).length;
  if (entries !== 3) findings.push(finding("C16", "ceiling-by-risk-invalid", `entries:${entries}`));
  return findings;
}
function gateCoverage(policy) {
  const ladder = [...policy.gateLadder].sort().join(",");
  const findings = [];
  for (const [tier, gates] of Object.entries(policy.gatesByRisk)) {
    if ([...gates].sort().join(",") !== ladder) findings.push(finding("C16", "gates-by-risk-incomplete", subjectText(tier)));
  }
  return findings;
}
function neverRetry(policy) {
  if (policy.neverRetryCount >= NEVER_RETRY_MINIMUM) return [];
  return [finding("C16", "never-retry-shrunk", String(policy.neverRetryCount))];
}
function retryBound(ctx, policy) {
  const findings = [];
  const prose = ctx.readText("rules/parallelism.md") ?? "";
  if (!/two attempts per unit, one escalation/i.test(prose)) findings.push(finding("C16", "retry-bound-drift", "prose"));
  if (String(policy.retryMaxAttempts) !== "2") {
    findings.push(finding("C16", "retry-bound-drift", `max_attempts_per_unit:${subjectText(policy.retryMaxAttempts)}`));
  }
  if (String(policy.retryEscalations) !== "1") {
    findings.push(finding("C16", "retry-bound-drift", `escalations:${subjectText(policy.retryEscalations)}`));
  }
  return findings;
}

// src/checks/decision-registries.ts
var C16_FINDINGS = [
  "registry-unreadable",
  "escalation-order-not-a-permutation",
  "escalates-to-breaks-order",
  "work-type-unknown-tier",
  "duplicate-tier-id",
  "shared-binding-undocumented",
  "model-missing-from-prose",
  "adr-row-model-mismatch",
  "code-review-row-model-mismatch",
  "agent-model-unbound",
  "duplicate-intent-id",
  "dangling-reference",
  "unmatchable-signal",
  "hook-mirrored-domain-mismatch",
  "intent-routing-mismatch",
  "routing-domain-not-claimed-once",
  "intent-unknown-model-tier",
  "intent-invalid-risk-floor",
  "intent-count-drift",
  "risk-aggregation-not-max",
  "risk-inputs-drift",
  "autonomy-levels-drift",
  "ceiling-by-risk-invalid",
  "gate-ladder-missing-from-prose",
  "gates-by-risk-incomplete",
  "never-retry-shrunk",
  "wave-cap-drift",
  "retry-bound-drift",
  "spec-threshold-drift",
  "fanout-threshold-drift"
];
var DECISION_REGISTRIES_CHECKS = [
  { id: "C16", codes: C16_FINDINGS, run: checkC16 }
];
function checkC16(ctx) {
  let cached;
  const mirror = (rowId) => {
    if (cached === void 0) cached = runMirrors(rowsOf("C16"), ctx);
    return cached.filter((entry) => entry.code === rowId);
  };
  return [...modelsResults(ctx, mirror), ...intentsResults(ctx), ...policyResults(ctx, mirror)];
}
function modelsResults(ctx, mirror) {
  let models;
  try {
    models = readModels(ctx.root);
  } catch {
    return [unreadableRegistry("registries/models.json")];
  }
  const tierIds = models.tiers.map((tier) => tier.id);
  const order = models.escalationOrder;
  const prose = ctx.readText("rules/models.md") ?? "";
  return [
    result("C16", "models.json escalation_order covers every tier exactly once", permutation(tierIds, order)),
    result("C16", "models.json escalates_to chain follows escalation_order", chain(models)),
    result(
      "C16",
      "models.json work_type tiers all resolve",
      models.workTypes.filter((work) => !tierIds.includes(work.tier)).map((work) => finding("C16", "work-type-unknown-tier", work.id))
    ),
    result(
      "C16",
      "models.json tier ids are unique",
      duplicates(tierIds).map((id) => finding("C16", "duplicate-tier-id", id))
    ),
    result("C16", "models.json model bindings are unique or documented as shared", sharedBinding(models, prose)),
    result("C16", "every models.json model appears in rules/models.md", mirror("model-missing-from-prose")),
    result(
      "C16",
      "rules/models.md ADR row binds the registry's tier model",
      tableRow(models, prose, "adr", "adr-row-model-mismatch")
    ),
    result(
      "C16",
      "rules/models.md code-review row binds the registry's tier model",
      tableRow(models, prose, "code-review", "code-review-row-model-mismatch")
    ),
    result("C16", "every agent frontmatter model is bound in models.json", agentModels(ctx, models))
  ];
}
function permutation(tierIds, order) {
  const findings = [];
  for (const id of tierIds) {
    if (!order.includes(id)) findings.push(finding("C16", "escalation-order-not-a-permutation", `missing:${id}`));
  }
  for (const entry of order) {
    if (!tierIds.includes(entry)) findings.push(finding("C16", "escalation-order-not-a-permutation", `unknown:${entry}`));
  }
  for (const entry of duplicates(order)) {
    findings.push(finding("C16", "escalation-order-not-a-permutation", `duplicate:${entry}`));
  }
  return findings;
}
function chain(models) {
  const order = models.escalationOrder;
  const findings = [];
  for (const tier of models.tiers) {
    const index = order.indexOf(tier.id);
    if (index === -1) continue;
    const want = index === order.length - 1 ? null : order[index + 1] ?? null;
    if (tier.escalatesTo !== want) findings.push(finding("C16", "escalates-to-breaks-order", tier.id));
  }
  return findings;
}
function sharedBinding(models, prose) {
  const shared = duplicates(models.tiers.map((tier) => tier.model));
  if (shared.length === 0 || prose.includes("bound to the same model")) return [];
  return shared.map((model) => finding("C16", "shared-binding-undocumented", model));
}
function tableRow(models, prose, workTypeId, code) {
  var _a;
  const work = models.workTypes.find((row) => row.id === workTypeId);
  const model = ((_a = models.tiers.find((tier) => tier.id === (work == null ? void 0 : work.tier))) == null ? void 0 : _a.model) ?? "";
  const needle = workTypeId.replace("-", " ");
  const rows3 = prose.split("\n").filter((line) => line.startsWith("|") && line.toLowerCase().includes(needle));
  if (rows3.some((line) => line.includes(`\`${model}\``))) return [];
  return [finding("C16", code, model === "" ? "unresolved" : model)];
}
function agentModels(ctx, models) {
  const known = new Set(models.tiers.map((tier) => tier.model));
  const findings = [];
  for (const name of ctx.list("agents")) {
    if (!name.endsWith(".md")) continue;
    const text3 = ctx.readText(`agents/${name}`);
    if (text3 === void 0) continue;
    const model = frontmatterValue(text3, "model");
    if (model === "" || known.has(model)) continue;
    findings.push(finding("C16", "agent-model-unbound", `${name.replace(/\.md$/, "")}(${model})`));
  }
  return findings;
}

// src/checks/kernel-lib.ts
var import_node_path32 = require("node:path");

// src/checks/runtime-surface-fs.ts
var import_node_fs36 = require("node:fs");
var import_node_path31 = require("node:path");
function executableBit(root, relativePath, platform2 = process.platform) {
  if (platform2 === "win32") return null;
  try {
    return ((0, import_node_fs36.statSync)((0, import_node_path31.join)(root, relativePath)).mode & 73) !== 0;
  } catch {
    return false;
  }
}

// src/checks/kernel-lib.ts
var KERNEL_INPUTS = ["registries/routing.json"];
var ROUTER_INPUTS = [
  "registries/intents.json",
  "registries/capabilities.json",
  "registries/policy.json",
  "registries/models.json"
];
var KERNEL_TOKEN = "kernel";
var ROUTER_TOKEN = "router";
var ROUTER_AGENT_TOKEN = "router-agent";
var ROUTER_MD = "agents/router.md";
function missingInputs(ctx, paths) {
  return paths.some((path) => !ctx.exists(path));
}
function preconditionResult(check, title, path) {
  return result(check, title, [finding(check, "precondition-missing", path)]);
}
function loadedOr(read) {
  try {
    return read();
  } catch (e) {
    if (e instanceof KernelError) return void 0;
    throw e;
  }
}
function rawJson(ctx, relativePath) {
  const parsed = loadedOr(() => readJsonFile((0, import_node_path32.join)(ctx.root, relativePath)));
  return isRecord(parsed) ? parsed : void 0;
}
function subRecord(row, key) {
  const value = row == null ? void 0 : row[key];
  return isRecord(value) ? value : void 0;
}
function rows2(row, key) {
  const value = row == null ? void 0 : row[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function kernelAnswer(ctx, argv2) {
  const io2 = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  let code;
  try {
    code = runKernel([...argv2], io2);
  } catch {
    return void 0;
  }
  if (code !== 0) return void 0;
  const parsed = parseOr(io2.stdout.join(""));
  return isRecord(parsed) ? parsed : void 0;
}
function stringsOf(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
function isExecutable2(ctx, relativePath) {
  return executableBit(ctx.root, relativePath);
}
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
function sorted(values) {
  return [...values].sort();
}
function parseOr(text3) {
  try {
    return JSON.parse(text3);
  } catch {
    return void 0;
  }
}

// src/checks/kernel-suppression.ts
var C18D_FINDINGS = [
  "suppressed-by-unknown-intent",
  "suppressed-by-self",
  "suppression-cycle",
  "all-intents-suppressible",
  "no-dispatch-plan-intent",
  "non-boolean-flag"
];
var INTENTS_JSON = "registries/intents.json";
var C18D_TITLE = "intents.json suppression data is internally consistent";
function checkC18d(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18d", C18D_TITLE, ROUTER_TOKEN);
  const intents = intentRows(ctx);
  const ids = new Set(intents.map((intent) => intent.id));
  const unknownTargets = [];
  const selfReferences = [];
  const nonBoolean = [];
  for (const intent of intents) {
    for (const target of intent.suppressedBy) {
      if (!ids.has(target)) unknownTargets.push(target);
      if (target === intent.id) selfReferences.push(intent.id);
    }
    if (isDeclaredNonBoolean(intent.suppressible) || isDeclaredNonBoolean(intent.requiresDispatchPlan)) {
      nonBoolean.push(intent.id);
    }
  }
  const findings = [
    ...uniqueSorted(unknownTargets).map((id) => finding("C18d", "suppressed-by-unknown-intent", id)),
    ...uniqueSorted(selfReferences).map((id) => finding("C18d", "suppressed-by-self", id)),
    ...uniqueSorted(twoCycles(intents)).map((id) => finding("C18d", "suppression-cycle", id))
  ];
  if (!intents.some((intent) => intent.suppressible !== true)) {
    findings.push(finding("C18d", "all-intents-suppressible"));
  }
  if (!intents.some((intent) => intent.requiresDispatchPlan === true)) {
    findings.push(finding("C18d", "no-dispatch-plan-intent"));
  }
  findings.push(...uniqueSorted(nonBoolean).map((id) => finding("C18d", "non-boolean-flag", id)));
  return [result("C18d", C18D_TITLE, findings)];
}
function intentRows(ctx) {
  return rows2(rawJson(ctx, INTENTS_JSON), "intents").map((row) => ({
    id: typeof row["id"] === "string" ? row["id"] : "",
    suppressedBy: stringsOf(row["suppressed_by"]),
    suppressible: row["suppressible"],
    requiresDispatchPlan: row["requires_dispatch_plan"]
  }));
}
function isDeclaredNonBoolean(value) {
  return value !== void 0 && value !== null && typeof value !== "boolean";
}
function twoCycles(intents) {
  const found = [];
  for (const one of intents) {
    for (const other of intents) {
      if (one.id === other.id) continue;
      if (other.suppressedBy.includes(one.id) && one.suppressedBy.includes(other.id)) found.push(one.id);
    }
  }
  return found;
}
var SUPPRESSION_CHECK = { id: "C18d", codes: C18D_FINDINGS, run: checkC18d };

// src/checks/kernel-router.ts
var C18_FINDINGS = ["capability-not-bound", "router-agent-missing", "tier-model-mismatch"];
var C18B_FINDINGS = ["kernel-fact-missing"];
var C18C_FINDINGS = ["bash-tool-missing", "forbidden-tool"];
var C18E_FINDINGS = [
  "fixture-escalate-mismatch",
  "fixture-reasons-mismatch",
  "fixture-intents-mismatch"
];
var C18F_FINDINGS = [
  "adapter-not-executable",
  "registration-not-single-adapter",
  "resolve-task-call-missing"
];
var C18G_FINDINGS = ["policy-closure-drift", "pure-question-not-lean"];
var POLICY_JSON = "registries/policy.json";
var HOOKS_JSON = "hooks/hooks.json";
var PROMPT_ADVISOR = "hooks/prompt-advisor.sh";
var PROMPT_ADVISOR_TS = "src/hooks/prompt-advisor.ts";
var C18_TITLE = "route capability is bound to the router agent at its declared design-tier model";
var C18B_TITLE = "agents/router.md resolves the plan through one kernel call declaring every required fact";
var C18C_TITLE = "router must not hold Edit/Write/Task";
var C18E_TITLE = "every policy.json router fixture matches the kernel route-escalate answer";
var C18F_TITLE = "hooks/prompt-advisor.sh is the single registered prompt adapter and src/hooks/prompt-advisor.ts calls resolve-task";
var C18G_TITLE = "resolve-task supplies the closed substantive policy bundle and keeps pure questions lean";
function checkC18(ctx) {
  var _a;
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18", C18_TITLE, ROUTER_TOKEN);
  const capabilities = loadedOr(() => loadCapabilities(ctx.root));
  const route = capabilities == null ? void 0 : capabilities.capabilities.find((row) => row.id === "route");
  if (route === void 0 || route.agent !== "router" || route.model_tier !== "design") {
    return [
      result("C18", C18_TITLE, [
        finding("C18", "capability-not-bound", `${orNone2(route == null ? void 0 : route.agent)}/${orNone2(route == null ? void 0 : route.model_tier)}`)
      ])
    ];
  }
  const agentText = ctx.readText(ROUTER_MD);
  if (agentText === void 0) {
    return [result("C18", C18_TITLE, [finding("C18", "router-agent-missing", ROUTER_MD)])];
  }
  const models = loadedOr(() => ctx.registries.models);
  const tierModel = ((_a = models == null ? void 0 : models.tiers.find((tier) => tier.id === route.model_tier)) == null ? void 0 : _a.model) ?? "";
  const declared4 = frontmatterValue(agentText, "model");
  if (tierModel === "" || tierModel !== declared4) {
    return [
      result("C18", C18_TITLE, [
        finding("C18", "tier-model-mismatch", `${orNone2(tierModel)}!=${orNone2(declared4)}`)
      ])
    ];
  }
  return [result("C18", C18_TITLE, [])];
}
var REQUIRED_KERNEL_FACTS = [
  { subject: "resolve-call", literal: "kernel.sh resolve --facts" },
  { subject: "escalate", literal: '"escalate": true' },
  { subject: "signals", literal: '"signals"' },
  { subject: "workType", literal: '"workType"' },
  { subject: "waves", literal: '"waves"' }
];
function checkC18b(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18b", C18B_TITLE, ROUTER_TOKEN);
  const agentText = ctx.readText(ROUTER_MD);
  if (agentText === void 0) return skipOnce(ctx, "C18b", C18B_TITLE, ROUTER_AGENT_TOKEN);
  const findings = REQUIRED_KERNEL_FACTS.filter((fact) => !agentText.includes(fact.literal)).map(
    (fact) => finding("C18b", "kernel-fact-missing", fact.subject)
  );
  return [result("C18b", C18B_TITLE, findings)];
}
var FORBIDDEN_TOOLS = ["Edit", "Write", "Task"];
function checkC18c(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18c", C18C_TITLE, ROUTER_TOKEN);
  const agentText = ctx.readText(ROUTER_MD);
  if (agentText === void 0) return skipOnce(ctx, "C18c", C18C_TITLE, ROUTER_AGENT_TOKEN);
  const tools = frontmatterValue(agentText, "tools");
  const findings = [];
  if (!tools.includes("Bash")) findings.push(finding("C18c", "bash-tool-missing", "Bash"));
  for (const tool of FORBIDDEN_TOOLS) {
    if (tools.includes(tool)) findings.push(finding("C18c", "forbidden-tool", tool));
  }
  return [result("C18c", C18C_TITLE, findings)];
}
function checkC18e(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18e", C18E_TITLE, ROUTER_TOKEN);
  const policy = loadedOr(() => ctx.registries.policy);
  if (policy === void 0) return [preconditionResult("C18e", C18E_TITLE, POLICY_JSON)];
  const findings = [];
  policy.router.fixtures.forEach((fixture, index) => {
    const at = String(index);
    const answer = kernelAnswer(ctx, ["route-escalate", "--prompt", fixture.prompt]);
    if ((answer == null ? void 0 : answer["escalate"]) !== fixture.escalate) {
      findings.push(finding("C18e", "fixture-escalate-mismatch", at));
    }
    if (!sameList(sorted(stringsOf(answer == null ? void 0 : answer["reasons"])), sorted(fixture.reasons))) {
      findings.push(finding("C18e", "fixture-reasons-mismatch", at));
    }
    if (!sameList(sorted(stringsOf(answer == null ? void 0 : answer["intents"])), sorted(fixture.intents))) {
      findings.push(finding("C18e", "fixture-intents-mismatch", at));
    }
  });
  return [result("C18e", C18E_TITLE, findings)];
}
function checkC18f(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18f", C18F_TITLE, ROUTER_TOKEN);
  const findings = [];
  if (isExecutable2(ctx, PROMPT_ADVISOR) === false) {
    findings.push(finding("C18f", "adapter-not-executable", PROMPT_ADVISOR));
  }
  const commands = rows2(subRecord(rawJson(ctx, HOOKS_JSON), "hooks"), "UserPromptSubmit").flatMap((entry) => rows2(entry, "hooks")).map((hook) => hook["command"]).filter((command) => typeof command === "string");
  if (commands.length !== 1 || !(commands[0] ?? "").includes("prompt-advisor")) {
    findings.push(finding("C18f", "registration-not-single-adapter", HOOKS_JSON));
  }
  if (!(ctx.readText(PROMPT_ADVISOR_TS) ?? "").includes("resolve-task")) {
    findings.push(finding("C18f", "resolve-task-call-missing", PROMPT_ADVISOR_TS));
  }
  return [result("C18f", C18F_TITLE, findings)];
}
var SUBSTANTIVE_PROBE = "update the prose in this document";
var PURE_PROBE = "what is the weather";
var AGENT_POLICY_RULE2 = "subagents";
function checkC18g(ctx) {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, "C18g", C18G_TITLE, ROUTER_TOKEN);
  const got = policyRulesFor(ctx, SUBSTANTIVE_PROBE).filter((rule) => rule !== AGENT_POLICY_RULE2);
  const want = uniqueSorted(TASK_CONTRACT_RULES);
  const drift2 = [...want.filter((rule) => !got.includes(rule)), ...got.filter((rule) => !want.includes(rule))];
  const findings = uniqueSorted(drift2).map((rule) => finding("C18g", "policy-closure-drift", rule));
  const pure = policyRulesFor(ctx, PURE_PROBE);
  if (pure.length !== 0) findings.push(finding("C18g", "pure-question-not-lean", String(pure.length)));
  return [result("C18g", C18G_TITLE, findings)];
}
function policyRulesFor(ctx, prompt) {
  var _a;
  const answer = kernelAnswer(ctx, ["resolve-task", "--prompt", prompt]);
  return uniqueSorted(stringsOf((_a = subRecord(answer, "task_contract")) == null ? void 0 : _a["policy_rules"]));
}
function orNone2(value) {
  return value === void 0 || value === "" ? "none" : value;
}
var ROUTER_CHECKS = [
  { id: "C18", codes: C18_FINDINGS, run: checkC18 },
  { id: "C18b", codes: C18B_FINDINGS, run: checkC18b },
  { id: "C18c", codes: C18C_FINDINGS, run: checkC18c },
  SUPPRESSION_CHECK,
  { id: "C18e", codes: C18E_FINDINGS, run: checkC18e },
  { id: "C18f", codes: C18F_FINDINGS, run: checkC18f },
  { id: "C18g", codes: C18G_FINDINGS, run: checkC18g }
];

// src/checks/kernel.ts
var C17_FINDINGS = ["no-patterns", "no-sample"];
var C17B_FINDINGS = ["sample-routes-elsewhere"];
var C17C_FINDINGS = ["excluded-path-routed", "foreign-path-excluded"];
var C17E_FINDINGS = ["signal-missing", "signal-invalid-regex"];
var ROUTING_JSON = "registries/routing.json";
var POLICY_JSON2 = "registries/policy.json";
var C17_TITLE = "every routing domain declares match patterns and a sample_path";
var C17B_TITLE = "every domain sample_path routes to its own domain via the kernel";
var C17C_TITLE = "kernel route-path honors the excluded patterns and self_dirs";
var C17E_TITLE = "policy.json prompt_signals present and valid EREs";
function checkC17(ctx) {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, "C17", C17_TITLE, KERNEL_TOKEN);
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === void 0) return [preconditionResult("C17", C17_TITLE, ROUTING_JSON)];
  const findings = [];
  for (const domain of routing.domains) {
    if (domain.match.paths.length + domain.match.basenames.length === 0) {
      findings.push(finding("C17", "no-patterns", domain.id));
    }
    if (domain.sample_path === null || domain.sample_path === "") {
      findings.push(finding("C17", "no-sample", domain.id));
    }
  }
  return [result("C17", C17_TITLE, findings)];
}
function checkC17b(ctx) {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, "C17b", C17B_TITLE, KERNEL_TOKEN);
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === void 0) return [preconditionResult("C17b", C17B_TITLE, ROUTING_JSON)];
  const findings = [];
  for (const domain of routing.domains) {
    const answer = kernelAnswer(ctx, ["route-path", domain.sample_path ?? ""]);
    const got = answer == null ? void 0 : answer["domain"];
    const routed = typeof got === "string" ? got : "null";
    if (routed !== domain.id) {
      findings.push(finding("C17b", "sample-routes-elsewhere", `${domain.id}->${routed}`));
    }
  }
  return [result("C17b", C17B_TITLE, findings)];
}
function checkC17c(ctx) {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, "C17c", C17C_TITLE, KERNEL_TOKEN);
  const excluded = [
    { subject: "engineos-dir", path: "/tmp/some-repo/.engineos/changes/x.ts" },
    { subject: "markdown", path: "/tmp/some-repo/README.md" },
    { subject: "self-hooks", path: `${ctx.root}/hooks/x.sh` }
  ];
  const findings = [];
  for (const probe of excluded) {
    if (excludedFor(ctx, probe.path) !== true) {
      findings.push(finding("C17c", "excluded-path-routed", probe.subject));
    }
  }
  const foreign = { subject: "foreign-hooks", path: "/tmp/some-repo/hooks/x.ts" };
  if (excludedFor(ctx, foreign.path) !== false) {
    findings.push(finding("C17c", "foreign-path-excluded", foreign.subject));
  }
  return [result("C17c", C17C_TITLE, findings)];
}
var PROMPT_SIGNAL_KEYS = [
  "action",
  "substantive_action",
  "scale",
  "spec",
  "design_strong",
  "design_weak"
];
function checkC17e(ctx) {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, "C17e", C17E_TITLE, KERNEL_TOKEN);
  const signals2 = subRecord(subRecord(rawJson(ctx, POLICY_JSON2), "parallelism"), "prompt_signals");
  const findings = [];
  for (const key of PROMPT_SIGNAL_KEYS) {
    const source = signals2 == null ? void 0 : signals2[key];
    if (typeof source !== "string" || source === "") {
      findings.push(finding("C17e", "signal-missing", key));
      continue;
    }
    try {
      compilePromptRegex(source, key);
    } catch (e) {
      if (!(e instanceof KernelError)) throw e;
      findings.push(finding("C17e", "signal-invalid-regex", key));
    }
  }
  return [result("C17e", C17E_TITLE, findings)];
}
function excludedFor(ctx, path) {
  var _a;
  const value = (_a = kernelAnswer(ctx, ["route-path", path])) == null ? void 0 : _a["excluded"];
  return typeof value === "boolean" ? value : void 0;
}
var KERNEL_CHECKS = [
  { id: "C17", codes: C17_FINDINGS, run: checkC17 },
  { id: "C17b", codes: C17B_FINDINGS, run: checkC17b },
  { id: "C17c", codes: C17C_FINDINGS, run: checkC17c },
  { id: "C17e", codes: C17E_FINDINGS, run: checkC17e },
  ...ROUTER_CHECKS
];

// src/checks/portability.ts
var import_node_fs37 = require("node:fs");
var import_node_path33 = require("node:path");
var C32_FINDINGS = [
  "mirror-missing",
  "file-missing-in-mirror",
  "file-diverged",
  "file-only-in-mirror"
];
var C33_FINDINGS = ["crlf"];
var PORTABILITY_CHECKS = [
  { id: "C32", codes: C32_FINDINGS, run: checkC32 },
  { id: "C33", codes: C33_FINDINGS, run: checkC33 }
];
var C32_TITLE = "the adapter mirrors .trae/skills and .windsurf/skills are byte-identical to .agents/skills";
var C33_TITLE = "every text file a POSIX parser reads is stored with LF line endings, *.ps1 being the one exception .gitattributes declares";
var MIRROR_BASE = ".agents/skills";
var MIRRORS2 = [".trae/skills", ".windsurf/skills"];
var POSIX_TEXT_EXTENSIONS = [
  ".sh",
  ".md",
  ".json",
  ".jsonl",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".yaml",
  ".yml",
  ".py",
  ".sql"
];
var SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "build",
  "dist-release",
  ".next",
  ".claude",
  "coverage"
]);
var CR = 13;
function checkC32(ctx) {
  if (!ctx.exists(MIRROR_BASE)) return skipPending(ctx, "C32", C32_TITLE, MIRROR_BASE);
  const absent = MIRRORS2.filter((mirror) => !ctx.exists(mirror));
  if (absent.length > 0) {
    return [result("C32", C32_TITLE, absent.map((mirror) => finding("C32", "mirror-missing", mirror)))];
  }
  const base = filesUnder(ctx.root, MIRROR_BASE);
  const declared4 = new Set(base);
  const findings = [];
  for (const mirror of MIRRORS2) {
    const mirrored = new Set(filesUnder(ctx.root, mirror));
    for (const relative2 of base) {
      if (!mirrored.has(relative2)) {
        findings.push(finding("C32", "file-missing-in-mirror", `${mirror}/${relative2}`));
        continue;
      }
      if (!sameBytes((0, import_node_path33.join)(ctx.root, MIRROR_BASE, relative2), (0, import_node_path33.join)(ctx.root, mirror, relative2))) {
        findings.push(finding("C32", "file-diverged", `${mirror}/${relative2}`));
      }
    }
    for (const relative2 of mirrored) {
      if (!declared4.has(relative2)) findings.push(finding("C32", "file-only-in-mirror", `${mirror}/${relative2}`));
    }
  }
  return [result("C32", C32_TITLE, findings)];
}
function checkC33(ctx) {
  const findings = crlfOffenders(ctx.root).map((relative2) => finding("C33", "crlf", relative2));
  return [result("C33", C33_TITLE, findings)];
}
function crlfOffenders(root) {
  const offenders = [];
  walk3(root, "", (relative2) => {
    if (!isPosixText(relative2)) return;
    if (containsCr((0, import_node_path33.join)(root, relative2))) offenders.push(relative2);
  });
  return offenders.sort(byteOrder2);
}
function isPosixText(relative2) {
  return POSIX_TEXT_EXTENSIONS.some((extension) => relative2.endsWith(extension));
}
function filesUnder(root, base) {
  const collected = [];
  walk3((0, import_node_path33.join)(root, base), "", (relative2) => collected.push(relative2));
  return collected.sort(byteOrder2);
}
function walk3(directory, prefix, visit) {
  let entries;
  try {
    entries = (0, import_node_fs37.readdirSync)(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative2 = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      walk3((0, import_node_path33.join)(directory, entry.name), relative2, visit);
      continue;
    }
    if (entry.isFile()) visit(relative2);
  }
}
function sameBytes(left, right) {
  const first = bytesOf(left);
  const second = bytesOf(right);
  if (first === void 0 || second === void 0) return false;
  return first.equals(second);
}
function containsCr(path) {
  var _a;
  return ((_a = bytesOf(path)) == null ? void 0 : _a.includes(CR)) === true;
}
function bytesOf(path) {
  try {
    return (0, import_node_fs37.readFileSync)(path);
  } catch {
    return void 0;
  }
}
function byteOrder2(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/checks/ids.ts
var CHECK_IDS = [
  "C1",
  "C2",
  "C3",
  "C5",
  "C5b",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
  "C11",
  "C12",
  "C13",
  "C14",
  "C15",
  "C15b",
  "C16",
  "C17",
  "C17b",
  "C17c",
  "C17e",
  "C18",
  "C18b",
  "C18c",
  "C18d",
  "C18e",
  "C18f",
  "C18g",
  "C19",
  "C19b",
  "C19c",
  "C20",
  "C20b",
  "C20c",
  "C20d",
  "C21",
  "C21b",
  "C21c",
  "C21e",
  "C22",
  "C22b",
  "C22c",
  "C23",
  "C23c",
  "C24",
  "C24b",
  "C24c",
  "C25",
  "C25b",
  "C25c",
  "C26",
  "C26b",
  "C26c",
  "C26d",
  "C27",
  "C27b",
  "C27c",
  "C27d",
  "C28",
  "C29",
  "C30",
  "C31",
  "C32",
  "C33",
  "C34",
  "C35",
  "C36",
  "C37"
];
var DECLARED = new Set(CHECK_IDS);

// src/checks/prose-truth.ts
var C36_FINDINGS = ["command-missing", "pattern-missing", "no-references"];
var C37_FINDINGS = ["count-drift"];
var PROSE_TRUTH_CHECKS = [
  { id: "C36", codes: C36_FINDINGS, run: checkC36 },
  { id: "C37", codes: C37_FINDINGS, run: checkC37 }
];
var C36_TITLE = "router-table command and pattern references resolve";
var C37_TITLE = "check-count claims equal the registered count";
var ROUTER_FILES = ["CLAUDE.md", "AGENTS.md"];
var COUNT_FILES = ["CLAUDE.md", "AGENTS.md", "README.md", "docs/CODEBASE_MAP.md"];
var COMMAND_TOKEN = /^\/(?:engineos:)?([a-z][a-z0-9-]*)$/;
var PATTERN_TOKEN = /^patterns\/([^`]+)$/;
var COUNT_CLAIM = /\b(\d+)[- ](?:self-integrity )?[Cc]hecks?\b/g;
var BACKTICKED = /`([^`]+)`/g;
function checkC36(ctx) {
  const absent = ROUTER_FILES.find((file) => !ctx.exists(file));
  if (absent !== void 0) return skipOnce(ctx, "C36", C36_TITLE, absent);
  const findings = [];
  for (const file of ROUTER_FILES) {
    const references = referencesIn(ctx.readText(file) ?? "");
    if (references.length === 0) {
      findings.push(finding("C36", "no-references", file));
      continue;
    }
    for (const reference of references) {
      if (reference.kind === "command") {
        if (!ctx.exists(`commands/${reference.name}.md`)) {
          findings.push(finding("C36", "command-missing", `${file}:${reference.token}`));
        }
        continue;
      }
      if (!resolvesUnderPatterns(ctx, reference.name)) {
        findings.push(finding("C36", "pattern-missing", `${file}:${reference.token}`));
      }
    }
  }
  return [result("C36", C36_TITLE, findings)];
}
function checkC37(ctx) {
  const absent = COUNT_FILES.find((file) => !ctx.exists(file));
  if (absent !== void 0) return skipOnce(ctx, "C37", C37_TITLE, absent);
  const registered = CHECK_IDS.length;
  const findings = [];
  for (const file of COUNT_FILES) {
    for (const claimed of claimedCounts(ctx.readText(file) ?? "")) {
      if (claimed !== registered) findings.push(finding("C37", "count-drift", `${file}:${claimed}`));
    }
  }
  return [result("C37", C37_TITLE, findings)];
}
function referencesIn(text3) {
  const seen = /* @__PURE__ */ new Set();
  const collected = [];
  for (const line of text3.split("\n")) {
    if (!line.startsWith("|")) continue;
    for (const match of line.matchAll(BACKTICKED)) {
      const token = match[1] ?? "";
      if (seen.has(token)) continue;
      const reference = referenceOf(token);
      if (reference === void 0) continue;
      seen.add(token);
      collected.push(reference);
    }
  }
  return collected;
}
function referenceOf(token) {
  const command = COMMAND_TOKEN.exec(token);
  if (command !== null) return { kind: "command", token, name: command[1] ?? "" };
  const pattern = PATTERN_TOKEN.exec(token);
  if (pattern !== null) return { kind: "pattern", token, name: pattern[1] ?? "" };
  return void 0;
}
function resolvesUnderPatterns(ctx, name) {
  if (name.split("/").includes("..")) return false;
  return ctx.exists(`patterns/${name}`) || ctx.exists(`patterns/${name}.md`);
}
function claimedCounts(text3) {
  const claimed = /* @__PURE__ */ new Set();
  for (const match of text3.matchAll(COUNT_CLAIM)) {
    claimed.add(Number.parseInt(match[1] ?? "", 10));
  }
  return [...claimed];
}

// src/checks/registries-coherence.ts
var import_node_path34 = require("node:path");
var ROUTING = "registries/routing.json";
var DECISION_RULES = "registries/decision-rules.json";
var CAPABILITIES = "registries/capabilities.json";
var AGENTS2 = "registries/agents.json";
function readable(load) {
  try {
    return load();
  } catch (error) {
    if (error instanceof KernelError) return null;
    throw error;
  }
}
function agentRows(ctx) {
  const document = readable(() => readJsonFile((0, import_node_path34.join)(ctx.root, AGENTS2)));
  if (document === null) return null;
  const rows3 = isRecord(document) ? document["agents"] : void 0;
  if (!Array.isArray(rows3)) return [];
  const agents = [];
  for (const row of rows3) {
    if (!isRecord(row)) continue;
    const name = row["name"];
    if (typeof name !== "string" || name === "") continue;
    const tier = row["model_tier"];
    agents.push({ name, tier: typeof tier === "string" ? tier : null });
  }
  return agents;
}
function sortedUnique2(values) {
  return [...new Set(values)].sort(byteOrder3);
}
function byteOrder3(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function checkC14(ctx) {
  return [
    jsonValidity(ctx),
    ...routingCoherence(ctx),
    ...decisionRuleCoherence(ctx),
    ...capabilityCoherence(ctx)
  ];
}
function jsonValidity(ctx) {
  const broken = [];
  for (const name of ctx.list("registries")) {
    if (!name.endsWith(".json")) continue;
    const relative2 = `registries/${name}`;
    if (!parsesAsJson((0, import_node_path34.join)(ctx.root, relative2))) broken.push(finding("C14", "malformed-json", relative2));
  }
  return result("C14", "registries are valid JSON", broken);
}
function parsesAsJson(absolutePath) {
  try {
    readJsonFile(absolutePath);
    return true;
  } catch (error) {
    if (error instanceof KernelError) return false;
    throw error;
  }
}
function routingCoherence(ctx) {
  if (!ctx.exists(ROUTING)) {
    return [result("C14", "registries/routing.json is present", [finding("C14", "missing", ROUTING)])];
  }
  const routing = readable(() => ctx.registries.routing);
  if (routing === null) return [];
  const domainOrder = routing.domains.map((domain) => domain.id);
  const drift2 = firstDifference(routing.precedence, domainOrder);
  const targets = [];
  for (const agent of sortedUnique2(routing.domains.map((d) => d.agent).filter(isPresent))) {
    if (!ctx.exists(`agents/${agent}.md`)) targets.push(finding("C14", "missing-agent", agent));
  }
  for (const skill of sortedUnique2(routing.domains.flatMap((d) => d.skills))) {
    if (!ctx.exists(`skills/${skill}/SKILL.md`)) targets.push(finding("C14", "missing-skill", skill));
  }
  for (const rule of sortedUnique2(routing.domains.flatMap((d) => d.rules))) {
    if (!ctx.exists(`rules/${rule}.md`)) targets.push(finding("C14", "missing-rule", rule));
  }
  return [
    result(
      "C14",
      "registry precedence covers every domain in map order",
      drift2 === null ? [] : [finding("C14", "precedence-order-drift", drift2)]
    ),
    result("C14", "registry agents, skills and rules all exist", targets)
  ];
}
function firstDifference(precedence, domainOrder) {
  const length = Math.max(precedence.length, domainOrder.length);
  for (let index = 0; index < length; index += 1) {
    const listed = precedence[index];
    const declared4 = domainOrder[index];
    if (listed === declared4) continue;
    return listed ?? declared4 ?? null;
  }
  return null;
}
function decisionRuleCoherence(ctx) {
  if (!ctx.exists(DECISION_RULES)) {
    return [result("C14", "registries/decision-rules.json is present", [finding("C14", "missing", DECISION_RULES)])];
  }
  const document = readable(() => readJsonFile((0, import_node_path34.join)(ctx.root, DECISION_RULES)));
  if (document === null) return [];
  const rows3 = isRecord(document) ? document["rules"] : void 0;
  const rules = Array.isArray(rows3) ? rows3.filter(isRecord) : [];
  return [
    result("C14", "decision rule ids are unique", duplicateIds(rules)),
    result("C14", "every decision rule requires or prefers something", emptyOutcomes(rules)),
    result("C14", "every decision rule signal is a valid regex", invalidSignals(rules)),
    result("C14", "verification policy agrees across registry, verification rule and gate", verificationDrift(ctx, rules)),
    result("C14", "every decision rule source names a file that exists", missingSources(ctx, rules))
  ];
}
var SOURCE_TOKEN = /(?<![A-Za-z0-9_/-])(?:(?:rules|docs|commands|skills|agents|templates|registries|patterns)\/[A-Za-z0-9._\/-]+|(?:CLAUDE|AGENTS|README)\.md\b)/g;
function missingSources(ctx, rules) {
  const missing = [];
  rules.forEach((rule, index) => {
    const declared4 = rule["source"];
    if (typeof declared4 !== "string") return;
    for (const token of sortedUnique2(sourceTokens(declared4))) {
      if (sourceResolves(ctx, token)) continue;
      missing.push(finding("C14", "source-file-missing", `${ruleName(rule, index)}:${token}`));
    }
  });
  return missing;
}
function sourceTokens(source) {
  return (source.match(SOURCE_TOKEN) ?? []).map((token) => token.replace(/[./-]+$/, "")).filter((token) => token !== "");
}
function sourceResolves(ctx, token) {
  if (ctx.exists(token)) return true;
  return !token.endsWith(".md") && ctx.exists(`${token}/SKILL.md`);
}
function capabilityCoherence(ctx) {
  if (!ctx.exists(CAPABILITIES) || !ctx.exists(AGENTS2)) return [];
  const capabilities = capabilityRows(ctx);
  const agents = agentCapabilityRows(ctx);
  if (capabilities === null || agents === null) return [];
  const declaredIds = new Set(capabilities.map((row) => row.id));
  const agentNames = new Set(agents.map((row) => row.name));
  const dangling2 = [];
  for (const agent of agents) {
    for (const id of sortedUnique2(agent.capabilityIds)) {
      if (declaredIds.has(id)) continue;
      dangling2.push(finding("C14", "dangling-capability-id", `${agent.name}:${id}`));
    }
  }
  const unknownAgents = [];
  for (const capability of capabilities) {
    if (capability.agent === null || agentNames.has(capability.agent)) continue;
    unknownAgents.push(finding("C14", "unknown-capability-agent", `${capability.id}:${capability.agent}`));
  }
  return [
    result("C14", "agent capability_ids resolve to capabilities.json", dangling2),
    result("C14", "capability agents exist in agents.json", unknownAgents)
  ];
}
function capabilityRows(ctx) {
  const document = readable(() => readJsonFile((0, import_node_path34.join)(ctx.root, CAPABILITIES)));
  if (document === null) return null;
  const rows3 = isRecord(document) ? document["capabilities"] : void 0;
  if (!Array.isArray(rows3)) return [];
  const bindings = [];
  for (const row of rows3) {
    if (!isRecord(row)) continue;
    const id = row["id"];
    if (typeof id !== "string" || id === "") continue;
    const agent = row["agent"];
    bindings.push({ id, agent: typeof agent === "string" && agent !== "" ? agent : null });
  }
  return bindings;
}
function agentCapabilityRows(ctx) {
  const document = readable(() => readJsonFile((0, import_node_path34.join)(ctx.root, AGENTS2)));
  if (document === null) return null;
  const rows3 = isRecord(document) ? document["agents"] : void 0;
  if (!Array.isArray(rows3)) return [];
  const agents = [];
  for (const row of rows3) {
    if (!isRecord(row)) continue;
    const name = row["name"];
    if (typeof name !== "string" || name === "") continue;
    agents.push({ name, capabilityIds: stringArray(row["capability_ids"]) });
  }
  return agents;
}
function duplicateIds(rules) {
  const seen = /* @__PURE__ */ new Set();
  const duplicated = /* @__PURE__ */ new Set();
  for (const rule of rules) {
    const id = rule["id"];
    if (typeof id !== "string") continue;
    if (seen.has(id)) duplicated.add(id);
    seen.add(id);
  }
  return [...duplicated].sort(byteOrder3).map((id) => finding("C14", "duplicate-rule-id", id));
}
function emptyOutcomes(rules) {
  const empty = [];
  rules.forEach((rule, index) => {
    const outcome = isRecord(rule["then"]) ? rule["then"] : {};
    const prefer = outcome["prefer"];
    if (stringArray(outcome["require"]).length > 0) return;
    if (typeof prefer === "string" && prefer !== "") return;
    empty.push(finding("C14", "empty-then", ruleName(rule, index)));
  });
  return empty;
}
function invalidSignals(rules) {
  const broken = /* @__PURE__ */ new Set();
  rules.forEach((rule, index) => {
    for (const signal of stringArray(rule["signals"])) {
      try {
        new RegExp(signal);
      } catch {
        broken.add(ruleName(rule, index));
      }
    }
  });
  return [...broken].sort(byteOrder3).map((name) => finding("C14", "invalid-signal", name));
}
var VERIFICATION_SOURCE = "rules/verification.md";
var VERIFICATION_REQUIRE = "lint output-shown tests-when-in-scope typecheck";
var VERIFICATION_RULE_SENTENCE = "Tests join the gate ONLY when tests were ON";
var VERIFICATION_GATE_SENTENCE = "`rules/verification.md` owns which checks are in";
function verificationDrift(ctx, rules) {
  const rule = rules.find((candidate) => candidate["id"] === "rule-verification");
  const declaredSource = rule == null ? void 0 : rule["source"];
  const source = typeof declaredSource === "string" ? declaredSource : "";
  const outcome = rule !== void 0 && isRecord(rule["then"]) ? rule["then"] : {};
  const required = stringArray(outcome["require"]).slice().sort(byteOrder3);
  const drift2 = [];
  if (source !== VERIFICATION_SOURCE) {
    drift2.push(finding("C14", "verification-source-drift", source === "" ? "absent" : source));
  }
  if (required.join(" ") !== VERIFICATION_REQUIRE) {
    drift2.push(finding("C14", "verification-require-drift", required.length === 0 ? "absent" : required.join(",")));
  }
  if (!(ctx.readText("rules/verification.md") ?? "").includes(VERIFICATION_RULE_SENTENCE)) {
    drift2.push(finding("C14", "verification-rule-prose-missing", "rules/verification.md"));
  }
  if (!(ctx.readText("rules/gates.md") ?? "").includes(VERIFICATION_GATE_SENTENCE)) {
    drift2.push(finding("C14", "verification-gate-prose-missing", "rules/gates.md"));
  }
  return drift2;
}
function ruleName(rule, index) {
  const id = rule["id"];
  return typeof id === "string" && id !== "" ? id : `rules-${index}`;
}
function isPresent(value) {
  return value !== null && value !== "";
}

// src/checks/registries.ts
var C6_FINDINGS = ["missing-agent"];
var C7_FINDINGS = ["missing-skill"];
var C8_FINDINGS = ["missing-rule"];
var C14_FINDINGS = [
  "malformed-json",
  "missing",
  "precedence-order-drift",
  "missing-agent",
  "missing-skill",
  "missing-rule",
  "duplicate-rule-id",
  "empty-then",
  "invalid-signal",
  "verification-source-drift",
  "verification-require-drift",
  "verification-rule-prose-missing",
  "verification-gate-prose-missing",
  "source-file-missing",
  "dangling-capability-id",
  "unknown-capability-agent"
];
var C15_FINDINGS = [
  "missing",
  "capability-missing-agent",
  "capability-invalid-tier",
  "agent-invalid-tier",
  "agent-file-missing"
];
var C15b_FINDINGS = ["tier-mismatch"];
var REGISTRIES_CHECKS = [
  { id: "C6", codes: C6_FINDINGS, run: checkC6 },
  { id: "C7", codes: C7_FINDINGS, run: checkC7 },
  { id: "C8", codes: C8_FINDINGS, run: checkC8 },
  { id: "C14", codes: C14_FINDINGS, run: checkC14 },
  { id: "C15", codes: C15_FINDINGS, run: checkC15 },
  { id: "C15b", codes: C15b_FINDINGS, run: checkC15b }
];
function checkC6(ctx) {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique2(routing.map((domain) => domain.agent).filter(isNamed)).filter((agent) => !ctx.exists(`agents/${agent}.md`)).map((agent) => finding("C6", "missing-agent", agent));
  return [result("C6", "guidance agents all exist", missing)];
}
function checkC7(ctx) {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique2(routing.flatMap((domain) => domain.skills)).filter((skill) => !ctx.exists(`skills/${skill}/SKILL.md`)).map((skill) => finding("C7", "missing-skill", skill));
  return [result("C7", "guidance skills all exist", missing)];
}
function checkC8(ctx) {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique2(routing.flatMap((domain) => domain.rules)).filter((rule) => !ctx.exists(`rules/${rule}.md`)).map((rule) => finding("C8", "missing-rule", rule));
  return [result("C8", "guidance rules all exist", missing)];
}
function checkC15(ctx) {
  return [...capabilityBindings(ctx), ...agentRegistry(ctx)];
}
function capabilityBindings(ctx) {
  if (!ctx.exists(CAPABILITIES)) {
    return [result("C15", "registries/capabilities.json is present", [finding("C15", "missing", CAPABILITIES)])];
  }
  const registry = readable(() => loadCapabilities(ctx.root));
  if (registry === null) return [];
  const missing = sortedUnique2(registry.capabilities.map((capability) => capability.agent).filter(isNamed)).filter((agent) => !ctx.exists(`agents/${agent}.md`)).map((agent) => finding("C15", "capability-missing-agent", agent));
  const tiers = registry.capabilities.filter((capability) => !isModelTier(capability.model_tier)).map((capability) => finding("C15", "capability-invalid-tier", capability.id));
  return [
    result("C15", "every capabilities.json agent binding resolves", missing),
    result("C15", "every capabilities.json entry declares a valid model tier", tiers)
  ];
}
function agentRegistry(ctx) {
  if (!ctx.exists(AGENTS2)) {
    return [result("C15", "registries/agents.json is present", [finding("C15", "missing", AGENTS2)])];
  }
  const rows3 = agentRows(ctx);
  if (rows3 === null) return [];
  const tiers = [];
  const files = [];
  for (const row of rows3) {
    if (row.tier === null || !isModelTier(row.tier)) tiers.push(finding("C15", "agent-invalid-tier", row.name));
    if (!ctx.exists(`agents/${row.name}.md`)) files.push(finding("C15", "agent-file-missing", row.name));
  }
  return [
    result("C15", "every agents.json entry declares a valid model tier", tiers),
    result("C15", "every agents.json entry resolves to a file under agents/", files)
  ];
}
function checkC15b(ctx) {
  if (!ctx.exists(CAPABILITIES) || !ctx.exists(AGENTS2)) return [];
  const registry = readable(() => loadCapabilities(ctx.root));
  const rows3 = agentRows(ctx);
  if (registry === null || rows3 === null) return [];
  const declared4 = tierByAgent(rows3);
  const mismatched = registry.capabilities.filter((capability) => {
    const tier = declared4.get(capability.agent);
    return tier !== void 0 && tier !== capability.model_tier;
  }).map((capability) => finding("C15b", "tier-mismatch", capability.id));
  return [result("C15b", "every capability model_tier agrees with its agent's tier", mismatched)];
}
function isModelTier(value) {
  return MODEL_TIER_IDS.some((tier) => tier === value);
}
function tierByAgent(rows3) {
  const tiers = /* @__PURE__ */ new Map();
  for (const row of rows3) {
    if (row.tier !== null && !tiers.has(row.name)) tiers.set(row.name, row.tier);
  }
  return tiers;
}
function routingDomains(ctx) {
  const routing = readable(() => ctx.registries.routing);
  return routing === null ? null : routing.domains;
}
function isNamed(value) {
  return value !== null && value !== "";
}

// src/checks/rules.ts
var C1_FINDINGS = ["node-too-old"];
var C2_FINDINGS = ["no-always-on-imports", "rule-missing"];
var C3_FINDINGS = ["dangling-reference"];
var C5_FINDINGS = ["row-not-closed"];
var C5b_FINDINGS = ["route-loaded-reference"];
var C1_TITLE = `node >= ${MIN_NODE_MAJOR} present (the runtime every entry point, hook and this validator runs on)`;
var C2_TITLE = "always-on imports resolve";
var C3_TITLE = "all rules/*.md cross-references resolve";
var C5_TITLE = "router load lists are closed";
var C5B_TITLE = "always-on rules reference only always-on rules";
var CLAUDE_MD = "CLAUDE.md";
function checkC1(nodeVersion = process.versions.node) {
  const major = currentMajor(nodeVersion);
  const findings = major >= MIN_NODE_MAJOR ? [] : [finding("C1", "node-too-old", String(major))];
  return [result("C1", C1_TITLE, findings)];
}
function checkC2(ctx) {
  const alwaysOn = alwaysOnRules(ctx.readText(CLAUDE_MD) ?? "");
  if (alwaysOn.length === 0) {
    return [result("C2", C2_TITLE, [finding("C2", "no-always-on-imports")])];
  }
  const findings = alwaysOn.filter((rule) => !ctx.exists(`rules/${rule}.md`)).map((rule) => finding("C2", "rule-missing", rule));
  return [result("C2", C2_TITLE, findings)];
}
function checkC3(ctx) {
  const findings = [];
  for (const file of proseSurfaces(ctx)) {
    const text3 = ctx.readText(file);
    if (text3 === void 0) continue;
    for (const reference of ruleReferencesIn(text3)) {
      if (ctx.exists(reference)) continue;
      findings.push(finding("C3", "dangling-reference", `${file}->${reference}`));
    }
  }
  return [result("C3", C3_TITLE, findings)];
}
function checkC5(ctx) {
  const text3 = ctx.readText(CLAUDE_MD) ?? "";
  const alwaysOn = alwaysOnRules(text3);
  const cached = /* @__PURE__ */ new Map();
  const deferrals = (rule) => {
    const known = cached.get(rule);
    if (known !== void 0) return known;
    const computed = deferralsOf2(ctx, rule);
    cached.set(rule, computed);
    return computed;
  };
  const findings = [];
  let row = 0;
  for (const line of text3.split("\n")) {
    if (!isTableRow(line)) continue;
    if (line.includes("---")) continue;
    if (line.includes("| Load |") || line.includes("Intent (signals)")) continue;
    const loaded = ruleNamesIn(line);
    if (loaded.length === 0) continue;
    row += 1;
    for (const rule of loaded) {
      if (alwaysOn.includes(rule)) continue;
      if (TASK_CONTRACT_RULES.includes(rule)) continue;
      for (const deferral of deferrals(rule)) {
        if (loaded.includes(deferral)) continue;
        findings.push(finding("C5", "row-not-closed", `row${row}:${rule}->${deferral}`));
      }
    }
  }
  return [result("C5", C5_TITLE, findings)];
}
function checkC5b(ctx) {
  const alwaysOn = alwaysOnRules(ctx.readText(CLAUDE_MD) ?? "");
  const corpus = ruleNames(ctx.root);
  const findings = [];
  for (const host of alwaysOn) {
    const text3 = ctx.readText(`rules/${host}.md`);
    if (text3 === void 0) continue;
    for (const named of corpus) {
      if (named === host) continue;
      if (alwaysOn.includes(named)) continue;
      if (!text3.includes(`${named}.md`)) continue;
      findings.push(finding("C5b", "route-loaded-reference", `${host}->${named}`));
    }
  }
  return [result("C5b", C5B_TITLE, findings)];
}
var RULES_CHECKS = [
  { id: "C1", codes: C1_FINDINGS, run: () => checkC1() },
  { id: "C2", codes: C2_FINDINGS, run: checkC2 },
  { id: "C3", codes: C3_FINDINGS, run: checkC3 },
  { id: "C5", codes: C5_FINDINGS, run: checkC5 },
  { id: "C5b", codes: C5b_FINDINGS, run: checkC5b }
];
var RULE_REFERENCE = /rules\/[a-z0-9-]+\.md/g;
var MD2 = ".md";
function proseSurfaces(ctx) {
  const skills = visibleEntries(ctx, "skills");
  return [
    CLAUDE_MD,
    ...markdownIn2(ctx, "rules"),
    ...markdownIn2(ctx, "agents"),
    ...skills.map((skill) => `skills/${skill}/SKILL.md`),
    ...skills.flatMap((skill) => markdownIn2(ctx, `skills/${skill}/references`)),
    ...markdownIn2(ctx, "commands")
  ].filter((path) => ctx.exists(path));
}
function visibleEntries(ctx, dir) {
  return ctx.list(dir).filter((name) => !name.startsWith("."));
}
function markdownIn2(ctx, dir) {
  return visibleEntries(ctx, dir).filter((name) => name.endsWith(MD2)).map((name) => `${dir}/${name}`);
}
function ruleReferencesIn(text3) {
  return unique3(text3.match(RULE_REFERENCE) ?? []);
}
function ruleNamesIn(line) {
  return unique3(
    (line.match(RULE_REFERENCE) ?? []).map(
      (reference) => reference.slice("rules/".length, reference.length - MD2.length)
    )
  );
}
function unique3(values) {
  return [...new Set(values)].sort(byteOrder4);
}
function isTableRow(line) {
  return line.startsWith("|") && line.indexOf("|", 1) !== -1;
}
function byteOrder4(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/checks/runtime-governance-shared.ts
var import_node_fs38 = require("node:fs");
var import_node_os3 = require("node:os");
var import_node_path35 = require("node:path");
var POLICY_JSON3 = "registries/policy.json";
var ROUTING_JSON2 = "registries/routing.json";
function requirePolicy(ctx, check, title, token) {
  if (ctx.exists(POLICY_JSON3)) return void 0;
  return skipOnce(ctx, check, title, token);
}
function requireRouting(ctx, check, title, token) {
  if (ctx.exists(ROUTING_JSON2)) return void 0;
  return skipOnce(ctx, check, title, token);
}
function policyDocument(ctx) {
  const parsed = parseJson2(ctx.readText(POLICY_JSON3) ?? "");
  return isRecord(parsed) ? parsed : {};
}
function child(record2, key) {
  const value = record2 == null ? void 0 : record2[key];
  return isRecord(value) ? value : void 0;
}
function arrayOf(record2, key) {
  const value = record2 == null ? void 0 : record2[key];
  return Array.isArray(value) ? value : void 0;
}
function stringsOf2(record2, key) {
  return (arrayOf(record2, key) ?? []).filter((item) => typeof item === "string");
}
function jqText2(value) {
  if (value === void 0 || value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
var DIGITS = /^[0-9]+$/;
function wholeNumber(value) {
  const text3 = jqText2(value);
  return DIGITS.test(text3) ? Number.parseInt(text3, 10) : void 0;
}
function usableBound(value, minimum) {
  const parsed = wholeNumber(value);
  if (parsed === void 0 || parsed < minimum) return void 0;
  return parsed;
}
function kernelAnswer2(ctx, argv2) {
  const io2 = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  try {
    runKernel([...argv2], io2);
  } catch {
    return {};
  }
  const parsed = parseJson2(io2.stdout.join(""));
  return isRecord(parsed) ? parsed : {};
}
function answerText(answer, key) {
  const value = answer[key];
  return typeof value === "string" ? value : "";
}
function answerStrings(answer, key) {
  const value = answer[key];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function telemetryRun(ctx, argv2) {
  const io2 = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  try {
    return runTelemetry([...argv2], io2) === 0;
  } catch {
    return false;
  }
}
function withTempDir(run10) {
  const dir = (0, import_node_fs38.mkdtempSync)((0, import_node_path35.join)((0, import_node_os3.tmpdir)(), "engineos-check-"));
  try {
    return run10(dir);
  } finally {
    (0, import_node_fs38.rmSync)(dir, { recursive: true, force: true });
  }
}
function fileHas(ctx, path, needle) {
  return (ctx.readText(path) ?? "").includes(needle);
}
function fileMatches(ctx, path, pattern) {
  return pattern.test(ctx.readText(path) ?? "");
}
function linesWith(ctx, path, needle) {
  return (ctx.readText(path) ?? "").split("\n").filter((line) => line.includes(needle));
}
function parseJson2(text3) {
  try {
    return JSON.parse(text3);
  } catch {
    return void 0;
  }
}
function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

// src/checks/runtime-governance-repair.ts
var C20_FINDINGS = [
  "checks-missing-or-empty",
  "checks-has-duplicates",
  "not-a-whole-number",
  "below-1",
  "by-situation-mismatch",
  "by-situation-empty-response",
  "never-repair-missing-or-empty"
];
var C20B_FINDINGS = [
  "breakpoint-uncomputable",
  "ladder-did-not-stop",
  "never-repair-did-not-win"
];
var C20C_FINDINGS = [
  "until-clean-present",
  "verify-done-note-lost-the-pointer",
  // Mirror row id (src/checks/mirrors.ts): CLAUDE.md's verify-done row quotes
  // .repair.max_fix_attempts_per_check.
  "fix-attempt-bound-drift"
];
var C20D_FINDINGS = [
  "missing",
  "does-not-import-kernel-repair",
  "does-not-call-repair-section",
  "hardcoded-number-literal"
];
var TOKEN = "repair";
var C20_TITLE = "policy.json.repair is well-formed";
var C20B_TITLE = "kernel.sh repair's ladder matches policy.json.repair's bound";
var C20C_TITLE = "the until-clean prose mirrors agree with policy.json.repair";
var C20D_TITLE = "src/hooks/stop-verify.ts asks the kernel's repair section for the bound, keeping no private copy";
var STOP_VERIFY = "src/hooks/stop-verify.ts";
var BY_SITUATION = "flaky,infra,red";
function checkC20(ctx) {
  const skipped = requirePolicy(ctx, "C20", C20_TITLE, TOKEN);
  if (skipped !== void 0) return skipped;
  const repair = child(policyDocument(ctx), "repair");
  const findings = [];
  const checks = stringsOf2(repair, "checks");
  if (checks.length < 1) findings.push(finding("C20", "checks-missing-or-empty"));
  const declaredChecks = arrayOf(repair, "checks");
  if (declaredChecks !== void 0 && new Set(declaredChecks.map(jqText2)).size !== declaredChecks.length) {
    findings.push(finding("C20", "checks-has-duplicates"));
  }
  const maxFix = wholeNumber(repair == null ? void 0 : repair["max_fix_attempts_per_check"]);
  if (maxFix === void 0) findings.push(finding("C20", "not-a-whole-number", "max_fix_attempts_per_check"));
  else if (maxFix < 1) findings.push(finding("C20", "below-1", "max_fix_attempts_per_check"));
  if (wholeNumber(repair == null ? void 0 : repair["escalations"]) === void 0) {
    findings.push(finding("C20", "not-a-whole-number", "escalations"));
  }
  const situations = (arrayOf(repair, "by_situation") ?? []).map((row) => typeof row === "object" && row !== null && "situation" in row ? jqText2(row["situation"]) : "").filter((id) => id !== "");
  const sorted2 = [...situations].sort().join(",");
  if (sorted2 !== BY_SITUATION) findings.push(finding("C20", "by-situation-mismatch", sorted2 === "" ? "none" : sorted2));
  const emptyResponses = (arrayOf(repair, "by_situation") ?? []).filter((row) => {
    if (typeof row !== "object" || row === null) return true;
    const response = row["response"];
    return response === void 0 || response === null || response === "";
  });
  if (emptyResponses.length > 0) findings.push(finding("C20", "by-situation-empty-response"));
  if (stringsOf2(repair, "never_repair").length < 1) {
    findings.push(finding("C20", "never-repair-missing-or-empty"));
  }
  return [result("C20", C20_TITLE, findings)];
}
function checkC20b(ctx) {
  const skipped = requirePolicy(ctx, "C20b", C20B_TITLE, TOKEN);
  if (skipped !== void 0) return skipped;
  const repair = child(policyDocument(ctx), "repair");
  const findings = [];
  const maxFix = usableBound(repair == null ? void 0 : repair["max_fix_attempts_per_check"], 0);
  const escalations = usableBound(repair == null ? void 0 : repair["escalations"], 0);
  if (maxFix === void 0 || escalations === void 0) {
    findings.push(finding("C20b", "breakpoint-uncomputable"));
  } else {
    const stopAttempt = maxFix + escalations + 1;
    const action = answerText(
      kernelAnswer2(ctx, ["repair", "--check", "lint", "--attempt", String(stopAttempt)]),
      "action"
    );
    if (action !== "stop-report-red") {
      findings.push(finding("C20b", "ladder-did-not-stop", `attempt-${stopAttempt}:${action === "" ? "none" : action}`));
    }
  }
  const never = answerText(
    kernelAnswer2(ctx, ["repair", "--check", "lint", "--attempt", "1", "--situation", "weaken-the-check"]),
    "action"
  );
  if (never !== "never-repair") {
    findings.push(finding("C20b", "never-repair-did-not-win", never === "" ? "none" : never));
  }
  return [result("C20b", C20B_TITLE, findings)];
}
function checkC20c(ctx) {
  const skipped = requirePolicy(ctx, "C20c", C20C_TITLE, TOKEN);
  if (skipped !== void 0) return skipped;
  const findings = [];
  for (const home of ["CLAUDE.md", "registries/intents.json"]) {
    if (fileMatches(ctx, home, /until clean/i)) findings.push(finding("C20c", "until-clean-present", home));
  }
  if (!verifyDoneNoteNamesRepair(ctx)) findings.push(finding("C20c", "verify-done-note-lost-the-pointer"));
  findings.push(...runMirrors(rowsOf("C20c"), ctx));
  return [result("C20c", C20C_TITLE, findings)];
}
function checkC20d(ctx) {
  const skipped = requirePolicy(ctx, "C20d", C20D_TITLE, TOKEN);
  if (skipped !== void 0) return skipped;
  const findings = [];
  if (ctx.readText(STOP_VERIFY) === void 0) {
    findings.push(finding("C20d", "missing", STOP_VERIFY));
    return [result("C20d", C20D_TITLE, findings)];
  }
  if (!fileHas(ctx, STOP_VERIFY, "from '../kernel/repair'")) {
    findings.push(finding("C20d", "does-not-import-kernel-repair", STOP_VERIFY));
  }
  if (!fileHas(ctx, STOP_VERIFY, "repairSection(")) {
    findings.push(finding("C20d", "does-not-call-repair-section", STOP_VERIFY));
  }
  if (fileMatches(ctx, STOP_VERIFY, /[0-9]+ fix attempts/)) {
    findings.push(finding("C20d", "hardcoded-number-literal", STOP_VERIFY));
  }
  return [result("C20d", C20D_TITLE, findings)];
}
function verifyDoneNoteNamesRepair(ctx) {
  try {
    const row = ctx.registries.intents.intents.find((intent) => intent.id === "verify-done");
    return ((row == null ? void 0 : row.note) ?? "").includes("kernel.sh repair");
  } catch {
    return false;
  }
}

// src/checks/runtime-governance-telemetry.ts
var import_node_path36 = require("node:path");
var import_node_fs39 = require("node:fs");
var C22_FINDINGS = [
  "retention-days-not-a-whole-number",
  "retention-days-below-1",
  "value-pattern-missing-or-invalid",
  "events-missing-or-empty",
  "event-ids-have-duplicates",
  "keys-missing-or-empty",
  "written-by-not-an-array",
  "written-by-has-a-non-string-entry",
  "written-by-names-a-missing-file",
  "sample-keys-not-a-subset"
];
var C22B_FINDINGS = [
  "sample-did-not-round-trip",
  "unknown-event-was-not-rejected",
  "whitespace-value-was-not-rejected"
];
var C22C_FINDINGS = [
  "does-not-emit-event",
  "event-call-references-prompt-text",
  "emits-but-is-not-declared",
  "sink-references-prompt-text",
  "does-not-read-the-registry-field",
  "hardcoded-retention-literal",
  "lost-the-telemetry-source"
];
var TOKEN2 = "telemetry";
var C22_TITLE = "policy.json.telemetry is well-formed";
var C22B_TITLE = "scripts/telemetry.sh round-trips every registry sample and rejects malformed data";
var C22C_TITLE = "telemetry wiring is complete in both directions (every declared writer emits its event, every emitting module is declared), private-copy-free and prompt-text-free";
var HOOKS_DIR = "src/hooks";
var SINK = "src/hooks/telemetry.ts";
var SCAFFOLDER = "src/hooks/ensure-project-layout.ts";
var NOT_A_WRITER = /* @__PURE__ */ new Set([SINK, "src/hooks/span-writer.ts"]);
var TELEMETRY_SOURCE = "engineos-telemetry";
function checkC22(ctx) {
  const skipped = requirePolicy(ctx, "C22", C22_TITLE, TOKEN2);
  if (skipped !== void 0) return skipped;
  const telemetry = child(policyDocument(ctx), "telemetry");
  const findings = [];
  const retention = wholeNumber(telemetry == null ? void 0 : telemetry["retention_days"]);
  if (retention === void 0) findings.push(finding("C22", "retention-days-not-a-whole-number"));
  else if (retention < 1) findings.push(finding("C22", "retention-days-below-1"));
  const valuePattern = telemetry == null ? void 0 : telemetry["value_pattern"];
  if (typeof valuePattern !== "string" || valuePattern === "" || !compiles(valuePattern)) {
    findings.push(finding("C22", "value-pattern-missing-or-invalid"));
  }
  const events = eventRows(telemetry);
  if (events.length < 1) findings.push(finding("C22", "events-missing-or-empty"));
  if (new Set(events.map((event2) => event2.id)).size !== events.length) {
    findings.push(finding("C22", "event-ids-have-duplicates"));
  }
  for (const event2 of events) findings.push(...eventFindings(ctx, event2));
  return [result("C22", C22_TITLE, findings)];
}
function checkC22b(ctx) {
  const skipped = requirePolicy(ctx, "C22b", C22B_TITLE, TOKEN2);
  if (skipped !== void 0) return skipped;
  const events = eventRows(child(policyDocument(ctx), "telemetry"));
  const findings = [];
  withTempDir((dir) => {
    events.forEach((event2, index) => {
      const file = (0, import_node_path36.join)(dir, `sample-${index}.jsonl`);
      const sample = JSON.stringify(event2.row["sample"] ?? null);
      const appended = telemetryRun(ctx, ["append", file, "--session", "canary", "--event", event2.id, "--data", sample, "--ts", "2026-08-06T00:00:00Z"]) && nonEmptyFile(file) && telemetryRun(ctx, ["validate", file]);
      if (!appended) findings.push(finding("C22b", "sample-did-not-round-trip", event2.id));
    });
    const negatives = (0, import_node_path36.join)(dir, "negatives.jsonl");
    if (telemetryRun(ctx, ["append", negatives, "--session", "canary", "--event", "bogus-event", "--data", "{}"])) {
      findings.push(finding("C22b", "unknown-event-was-not-rejected"));
    }
    if (telemetryRun(ctx, ["append", negatives, "--session", "canary", "--event", "route", "--data", '{"intents":["two words"]}'])) {
      findings.push(finding("C22b", "whitespace-value-was-not-rejected"));
    }
  });
  return [result("C22b", C22B_TITLE, findings)];
}
function checkC22c(ctx) {
  const skipped = requirePolicy(ctx, "C22c", C22C_TITLE, TOKEN2);
  if (skipped !== void 0) return skipped;
  const events = eventRows(child(policyDocument(ctx), "telemetry"));
  const findings = [];
  for (const event2 of events) {
    for (const writer of stringsOf2(event2.row, "written_by")) {
      const call = eventCall(event2.id);
      if (!fileHas(ctx, writer, call)) {
        findings.push(finding("C22c", "does-not-emit-event", `${writer}:${event2.id}`));
      }
      if (linesWith(ctx, writer, call).some((line) => /env\.prompt|env\.raw/.test(line))) {
        findings.push(finding("C22c", "event-call-references-prompt-text", writer));
      }
    }
  }
  const modules = ctx.list(HOOKS_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => `${HOOKS_DIR}/${name}`).filter((path) => !NOT_A_WRITER.has(path));
  for (const event2 of events) {
    for (const module2 of modules) {
      if (!fileHas(ctx, module2, eventCall(event2.id))) continue;
      if (!stringsOf2(event2.row, "written_by").includes(module2)) {
        findings.push(finding("C22c", "emits-but-is-not-declared", `${module2}:${event2.id}`));
      }
    }
  }
  if (fileMatches(ctx, SINK, /env\.prompt/)) findings.push(finding("C22c", "sink-references-prompt-text", SINK));
  if (!fileHas(ctx, SCAFFOLDER, "loadTelemetryPolicy(")) {
    findings.push(finding("C22c", "does-not-read-the-registry-field", SCAFFOLDER));
  }
  if (fileMatches(ctx, SCAFFOLDER, /(reapIfStale|reapFilesBelow)\(.*, *[0-9]+, *now\)/)) {
    findings.push(finding("C22c", "hardcoded-retention-literal", SCAFFOLDER));
  }
  for (const reader5 of ["skills/retro/SKILL.md", "scripts/usage-report.sh"]) {
    if (!fileHas(ctx, reader5, TELEMETRY_SOURCE)) {
      findings.push(finding("C22c", "lost-the-telemetry-source", reader5));
    }
  }
  return [result("C22c", C22C_TITLE, findings)];
}
function eventCall(id) {
  return `event(sink, '${id}'`;
}
function eventRows(telemetry) {
  const rows3 = [];
  for (const entry of arrayOf(telemetry, "events") ?? []) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const row = entry;
    rows3.push({ id: jqText2(row["id"]), row });
  }
  return rows3;
}
function eventFindings(ctx, event2) {
  const findings = [];
  const keys = arrayOf(event2.row, "keys");
  if ((keys ?? []).length < 1) findings.push(finding("C22", "keys-missing-or-empty", event2.id));
  const writtenBy = arrayOf(event2.row, "written_by");
  if (writtenBy === void 0 || writtenBy.length < 1) {
    findings.push(finding("C22", "written-by-not-an-array", event2.id));
  } else {
    const writers = writtenBy.filter((item) => typeof item === "string");
    if (writers.length !== writtenBy.length) {
      findings.push(finding("C22", "written-by-has-a-non-string-entry", event2.id));
    }
    for (const writer of writers) {
      if (!ctx.exists(writer)) {
        findings.push(finding("C22", "written-by-names-a-missing-file", `${event2.id}:${writer}`));
      }
    }
  }
  const sample = event2.row["sample"];
  if (keys !== void 0 && typeof sample === "object" && sample !== null && !Array.isArray(sample)) {
    const declared4 = new Set(keys.map(jqText2));
    const extra = Object.keys(sample).filter((key) => !declared4.has(key));
    if (extra.length > 0) findings.push(finding("C22", "sample-keys-not-a-subset", event2.id));
  }
  return findings;
}
function compiles(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
function nonEmptyFile(path) {
  try {
    return (0, import_node_fs39.existsSync)(path) && (0, import_node_fs39.statSync)(path).size > 0;
  } catch {
    return false;
  }
}

// src/checks/runtime-governance-constitution.ts
var import_node_path37 = require("node:path");
var C23_FINDINGS = [
  "precedence-sentence-disagrees",
  "missing-from-compatibility",
  // Mirror row id (src/checks/mirrors.ts): every routing.json precedence domain
  // is named in the chain sentence. The ORDER stays code below — a per-element
  // row cannot express it.
  "precedence-domain-missing"
];
var C23C_FINDINGS = ["authority-claim-reintroduced"];
var TOKEN3 = "constitution";
var C23_TITLE = "CLAUDE.md's precedence sentence and always-on mirror agree with the registry";
var C23C_TITLE = "CLAUDE.md does not reintroduce the retired routing-map.sh authority claim";
var CLAUDE_MD2 = "CLAUDE.md";
var COMPATIBILITY = "docs/COMPATIBILITY.md";
var CHAIN_SEPARATOR = " \u2192 ";
var RETIRED_CLAIM = /authoritative for file-pattern routing/i;
function checkC23(ctx) {
  const skipped = requireRouting(ctx, "C23", C23_TITLE, TOKEN3);
  if (skipped !== void 0) return skipped;
  const findings = [];
  const declared4 = precedenceOf(ctx).join(CHAIN_SEPARATOR);
  const stated = precedenceSentence(ctx.readText(CLAUDE_MD2) ?? "");
  if (stated === "" || stated !== declared4) findings.push(finding("C23", "precedence-sentence-disagrees"));
  const compatibility = ctx.readText(COMPATIBILITY) ?? "";
  for (const rule of alwaysOnImports(ctx.readText(CLAUDE_MD2) ?? "")) {
    const name = (0, import_node_path37.basename)(rule);
    if (!compatibility.includes(`${name}\``)) findings.push(finding("C23", "missing-from-compatibility", name));
  }
  findings.push(...runMirrors(rowsOf("C23"), ctx));
  return [result("C23", C23_TITLE, findings)];
}
function checkC23c(ctx) {
  const skipped = requireRouting(ctx, "C23c", C23C_TITLE, TOKEN3);
  if (skipped !== void 0) return skipped;
  const findings = fileMatches(ctx, CLAUDE_MD2, RETIRED_CLAIM) ? [finding("C23c", "authority-claim-reintroduced", CLAUDE_MD2)] : [];
  return [result("C23c", C23C_TITLE, findings)];
}
function precedenceOf(ctx) {
  try {
    return ctx.registries.routing.precedence;
  } catch {
    return [];
  }
}
function precedenceSentence(text3) {
  var _a;
  const lines = text3.split("\n");
  const window = [];
  lines.forEach((line, index) => {
    if (!line.includes("in this precedence chain:")) return;
    window.push(line, lines[index + 1] ?? "");
  });
  const flat = window.join(" ").replace(/\s+/g, " ");
  return ((_a = /precedence chain: (.*)\. When you route/.exec(flat)) == null ? void 0 : _a[1]) ?? "";
}
function alwaysOnImports(text3) {
  return text3.split("\n").flatMap((line) => {
    var _a;
    return ((_a = /^@(rules\/[a-z-]+\.md)/.exec(line)) == null ? void 0 : _a.slice(1, 2)) ?? [];
  });
}

// src/checks/runtime-governance-backpressure.ts
var C24_FINDINGS = [
  "not-a-whole-number",
  "below-1",
  "overload-action-not-in-actions",
  "max-inflight-copy-of-wave-cap"
];
var C24B_FINDINGS = ["expected-reject-at-cap-with-full-queue", "expected-dispatch-when-idle"];
var C24C_FINDINGS = [
  "does-not-name-kernel-sh-admit",
  // Mirror row ids (src/checks/mirrors.ts): one table row per declared action,
  // the quoted queue bound, and the overload row that explains that bound.
  "action-row-missing",
  "queue-bound-drift",
  "overload-row-missing"
];
var TOKEN4 = "backpressure";
var C24_TITLE = "policy.json.parallelism.backpressure is well-formed";
var C24B_TITLE = "kernel.sh admit dispatches when idle and rejects at cap with a full queue";
var C24C_TITLE = "rules/parallelism.md mirrors backpressure: names kernel.sh admit, quotes the queue bound, one row per declared action";
var PARALLELISM_MD = "rules/parallelism.md";
var ADMIT_CALL = "kernel.sh admit";
var MAX_QUEUED_UNITS = "max_queued_units";
function checkC24(ctx) {
  const skipped = requirePolicy(ctx, "C24", C24_TITLE, TOKEN4);
  if (skipped !== void 0) return skipped;
  const backpressure = backpressureBlock(ctx);
  const findings = [];
  const maxQueued = wholeNumber(backpressure == null ? void 0 : backpressure[MAX_QUEUED_UNITS]);
  if (maxQueued === void 0) findings.push(finding("C24", "not-a-whole-number", MAX_QUEUED_UNITS));
  else if (maxQueued < 1) findings.push(finding("C24", "below-1", MAX_QUEUED_UNITS));
  const overload = overloadAction(backpressure);
  if (!stringsOf2(backpressure, "actions").includes(overload)) {
    findings.push(finding("C24", "overload-action-not-in-actions", overload === "" ? "none" : overload));
  }
  for (const key of Object.keys(backpressure ?? {})) {
    if (key.includes("max_inflight")) findings.push(finding("C24", "max-inflight-copy-of-wave-cap", key));
  }
  return [result("C24", C24_TITLE, findings)];
}
function checkC24b(ctx) {
  var _a;
  const skipped = requirePolicy(ctx, "C24b", C24B_TITLE, TOKEN4);
  if (skipped !== void 0) return skipped;
  const parallelism = child(policyDocument(ctx), "parallelism");
  const findings = [];
  const cap = jqText2(parallelism == null ? void 0 : parallelism["wave_concurrency_cap"]);
  const maxQueued = usableBound((_a = child(parallelism, "backpressure")) == null ? void 0 : _a[MAX_QUEUED_UNITS], 1);
  const full = answerText(kernelAnswer2(ctx, ["admit", "--inflight", cap, "--queued", String(maxQueued ?? 0)]), "action");
  if (full !== "reject") {
    findings.push(finding("C24b", "expected-reject-at-cap-with-full-queue", full === "" ? "none" : full));
  }
  const idle = answerText(kernelAnswer2(ctx, ["admit", "--inflight", "0", "--queued", "0"]), "action");
  if (idle !== "dispatch") {
    findings.push(finding("C24b", "expected-dispatch-when-idle", idle === "" ? "none" : idle));
  }
  return [result("C24b", C24B_TITLE, findings)];
}
function checkC24c(ctx) {
  const skipped = requirePolicy(ctx, "C24c", C24C_TITLE, TOKEN4);
  if (skipped !== void 0) return skipped;
  const findings = [];
  if (!fileHas(ctx, PARALLELISM_MD, ADMIT_CALL)) {
    findings.push(finding("C24c", "does-not-name-kernel-sh-admit", PARALLELISM_MD));
  }
  findings.push(...runMirrors(rowsOf("C24c"), ctx));
  return [result("C24c", C24C_TITLE, findings)];
}
function backpressureBlock(ctx) {
  return child(child(policyDocument(ctx), "parallelism"), "backpressure");
}
function overloadAction(backpressure) {
  const value = backpressure == null ? void 0 : backpressure["overload_action"];
  return typeof value === "string" ? value : "";
}

// src/checks/runtime-governance-breaker.ts
var C25_FINDINGS = [
  "not-a-whole-number",
  "below-1",
  "states-mismatch",
  "scopes-missing-or-empty"
];
var C25B_FINDINGS = ["failure-threshold-unusable", "transition-mismatch"];
var C25C_FINDINGS = [
  "no-circuit-breaker-section",
  "does-not-name-kernel-sh-breaker",
  // Mirror row ids (src/checks/mirrors.ts): one table row per declared state,
  // the quoted failure threshold, and the scope-vocabulary sentence.
  "state-row-missing",
  "failure-threshold-drift",
  "scope-vocabulary-missing"
];
var TOKEN5 = "breaker";
var C25_TITLE = "policy.json.breaker is well-formed: failure_threshold, cooldown_waves and half_open_probes each read as a whole number >= 1, states are exactly closed/half-open/open, scopes is a non-empty array";
var C25B_TITLE = "kernel.sh breaker answers the expected state and allow for all six transitions across the three state arms";
var C25C_TITLE = "rules/parallelism.md mirrors the breaker: a Circuit breaker section naming kernel.sh breaker, the registry's failure threshold, a row per declared state, and a scope-vocabulary sentence naming every declared scope";
var PARALLELISM_MD2 = "rules/parallelism.md";
var BREAKER_CALL = "kernel.sh breaker";
var BREAKER_SECTION = /^## Circuit breaker$/m;
var STATES = "closed,half-open,open";
var NUMERIC_FIELDS = ["failure_threshold", "cooldown_waves", "half_open_probes"];
function checkC25(ctx) {
  const skipped = requirePolicy(ctx, "C25", C25_TITLE, TOKEN5);
  if (skipped !== void 0) return skipped;
  const breaker = breakerBlock(ctx);
  const findings = [];
  for (const field of NUMERIC_FIELDS) {
    const value = wholeNumber(breaker == null ? void 0 : breaker[field]);
    if (value === void 0) findings.push(finding("C25", "not-a-whole-number", field));
    else if (value < 1) findings.push(finding("C25", "below-1", field));
  }
  const states = (arrayOf(breaker, "states") ?? []).map(jqText2).sort().join(",");
  if (states !== STATES) findings.push(finding("C25", "states-mismatch", states === "" ? "none" : states));
  const scopes = arrayOf(breaker, "scopes");
  if (scopes === void 0 || scopes.length === 0) findings.push(finding("C25", "scopes-missing-or-empty"));
  return [result("C25", C25_TITLE, findings)];
}
function checkC25b(ctx) {
  var _a;
  const skipped = requirePolicy(ctx, "C25b", C25B_TITLE, TOKEN5);
  if (skipped !== void 0) return skipped;
  const findings = [];
  const threshold = usableBound((_a = breakerBlock(ctx)) == null ? void 0 : _a["failure_threshold"], 1);
  if (threshold === void 0) findings.push(finding("C25b", "failure-threshold-unusable"));
  else {
    expect(ctx, findings, "at-threshold", ["--state", "closed", "--failures", String(threshold)], "open/false");
    expect(ctx, findings, "one-below-threshold", ["--state", "closed", "--failures", String(threshold - 1)], "closed/true");
  }
  expect(ctx, findings, "cooldown-elapsed", ["--state", "open", "--cooldown-elapsed", "true"], "half-open/true");
  expect(ctx, findings, "cooldown-pending", ["--state", "open", "--cooldown-elapsed", "false"], "open/false");
  expect(ctx, findings, "successful-probe", ["--state", "half-open", "--probe-result", "ok"], "closed/true");
  expect(ctx, findings, "failed-probe", ["--state", "half-open", "--probe-result", "failed"], "open/false");
  return [result("C25b", C25B_TITLE, findings)];
}
function checkC25c(ctx) {
  const skipped = requirePolicy(ctx, "C25c", C25C_TITLE, TOKEN5);
  if (skipped !== void 0) return skipped;
  const findings = [];
  if (!fileMatches(ctx, PARALLELISM_MD2, BREAKER_SECTION)) {
    findings.push(finding("C25c", "no-circuit-breaker-section", PARALLELISM_MD2));
  }
  if (!fileHas(ctx, PARALLELISM_MD2, BREAKER_CALL)) {
    findings.push(finding("C25c", "does-not-name-kernel-sh-breaker", PARALLELISM_MD2));
  }
  findings.push(...runMirrors(rowsOf("C25c"), ctx));
  return [result("C25c", C25C_TITLE, findings)];
}
function breakerBlock(ctx) {
  return child(policyDocument(ctx), "breaker");
}
function expect(ctx, findings, transition, args, wanted) {
  const got = breakerAnswer(ctx, args);
  if (got !== wanted) findings.push(finding("C25b", "transition-mismatch", `${transition}:${got}`));
}
function breakerAnswer(ctx, args) {
  const answer = kernelAnswer2(ctx, ["breaker", ...args]);
  const state = typeof answer["state"] === "string" ? answer["state"] : "none";
  const allow = typeof answer["allow"] === "boolean" ? String(answer["allow"]) : "null";
  return `${state}/${allow}`;
}

// src/checks/runtime-governance-hitl.ts
var C26_FINDINGS = [
  "reasons-below-minimum",
  "reasons-have-duplicates",
  "situations-missing-or-empty",
  "record-home-missing-or-empty",
  "situations-overlap-never-retry"
];
var C26C_FINDINGS = [
  "no-hitl-section",
  "does-not-name-kernel-sh-hitl",
  "record-home-unusable",
  "does-not-name-the-record-home",
  "release-checklist-does-not-name",
  "change-template-has-no-section",
  // Mirror row id (src/checks/mirrors.ts): one table row per declared reason,
  // both directions, because the vocabulary is closed.
  "reason-row-missing"
];
var C26D_FINDINGS = [
  "not-declared-in-both-reasons-and-situations",
  "admit-reject-message-does-not-cite",
  "situation-reject-answered"
];
var TOKEN6 = "hitl";
var HITL_REASONS_MIN = 8;
var C26_TITLE = `policy.json.hitl is well-formed: reasons is ${HITL_REASONS_MIN}+ unique non-empty strings, situations is a non-empty array disjoint from retry.never_retry, record_home is set`;
var C26C_TITLE = "rules/risk-autonomy.md mirrors hitl: a Human-in-the-loop section naming kernel.sh hitl, a row per declared reason and the record home, which the rules/gates.md release checklist and the change-record template also carry";
var C26D_TITLE = "the backpressure/hitl coupling holds: policy.json.hitl declares budget-exhausted in both reasons and situations, kernel.sh admit's reject message cites 'hitl: budget-exhausted', and kernel.sh hitl --situation reject answers with exactly that id";
var RISK_AUTONOMY_MD = "rules/risk-autonomy.md";
var GATES_MD = "rules/gates.md";
var CHANGE_TEMPLATE2 = ".engineos/changes/_template.md";
var ADMIT_TS = "src/kernel/admit.ts";
var HITL_ANCHOR = "## Human-in-the-loop";
var RELEASE_ANCHOR = "## Release gate \u2014 exit criteria";
var HITL_CALL = "kernel.sh hitl";
var BUDGET_EXHAUSTED = "budget-exhausted";
function checkC26(ctx) {
  const skipped = requirePolicy(ctx, "C26", C26_TITLE, TOKEN6);
  if (skipped !== void 0) return skipped;
  const document = policyDocument(ctx);
  const hitl = child(document, "hitl");
  const findings = [];
  const reasons = stringsOf2(hitl, "reasons").filter((reason2) => reason2 !== "");
  if (reasons.length < HITL_REASONS_MIN) {
    findings.push(finding("C26", "reasons-below-minimum", String(reasons.length)));
  }
  if (new Set(reasons).size !== reasons.length) findings.push(finding("C26", "reasons-have-duplicates"));
  const situations = arrayOf(hitl, "situations");
  if (situations === void 0 || situations.length === 0) {
    findings.push(finding("C26", "situations-missing-or-empty"));
  }
  if (recordHome(hitl) === "") findings.push(finding("C26", "record-home-missing-or-empty"));
  const neverRetry2 = new Set(stringsOf2(child(document, "retry"), "never_retry"));
  const overlap = stringsOf2(hitl, "situations").filter((id) => neverRetry2.has(id));
  if (overlap.length > 0) findings.push(finding("C26", "situations-overlap-never-retry", overlap.join(",")));
  return [result("C26", C26_TITLE, findings)];
}
function checkC26c(ctx) {
  const skipped = requirePolicy(ctx, "C26c", C26C_TITLE, TOKEN6);
  if (skipped !== void 0) return skipped;
  const findings = [];
  const section = sliceSection(ctx.readText(RISK_AUTONOMY_MD) ?? "", HITL_ANCHOR);
  if (section === void 0 || section.trim() === "") {
    findings.push(finding("C26c", "no-hitl-section", RISK_AUTONOMY_MD));
  } else {
    if (!section.includes(HITL_CALL)) findings.push(finding("C26c", "does-not-name-kernel-sh-hitl", RISK_AUTONOMY_MD));
    findings.push(...recordHomeMirrors(ctx, section));
  }
  findings.push(...runMirrors(rowsOf("C26c"), ctx));
  return [result("C26c", C26C_TITLE, findings)];
}
function checkC26d(ctx) {
  var _a;
  const skipped = requirePolicy(ctx, "C26d", C26D_TITLE, TOKEN6);
  if (skipped !== void 0) return skipped;
  const document = policyDocument(ctx);
  const hitl = child(document, "hitl");
  const findings = [];
  if (!stringsOf2(hitl, "reasons").includes(BUDGET_EXHAUSTED) || !stringsOf2(hitl, "situations").includes(BUDGET_EXHAUSTED)) {
    findings.push(finding("C26d", "not-declared-in-both-reasons-and-situations", BUDGET_EXHAUSTED));
    return [result("C26d", C26D_TITLE, findings)];
  }
  const code = (ctx.readText(ADMIT_TS) ?? "").split("\n").filter((line) => !/^[ \t]*\/\//.test(line));
  if (!code.some((line) => line.includes(`hitl: ${BUDGET_EXHAUSTED}`))) {
    findings.push(finding("C26d", "admit-reject-message-does-not-cite", ADMIT_TS));
  }
  const low = stringOrEmpty((_a = child(child(document, "autonomy"), "ceiling_by_risk")) == null ? void 0 : _a["low"]);
  const cited = answerStrings(kernelAnswer2(ctx, ["hitl", "--risk", "low", "--autonomy", low, "--situation", "reject"]), "reasons").join(",");
  if (cited !== BUDGET_EXHAUSTED) {
    findings.push(finding("C26d", "situation-reject-answered", cited === "" ? "none" : cited));
  }
  return [result("C26d", C26D_TITLE, findings)];
}
function recordHomeMirrors(ctx, section) {
  const anchor = recordHomeAnchor(ctx);
  if (anchor === "") return [finding("C26c", "record-home-unusable")];
  const heading = anchor.replace(/-/g, " ");
  const findings = [];
  if (!containsIgnoringCase(section, heading)) {
    findings.push(finding("C26c", "does-not-name-the-record-home", anchor));
  }
  const release = sliceSection(ctx.readText(GATES_MD) ?? "", RELEASE_ANCHOR);
  if (release === void 0 || !containsIgnoringCase(release, heading)) {
    findings.push(finding("C26c", "release-checklist-does-not-name", anchor));
  }
  const template = (ctx.readText(CHANGE_TEMPLATE2) ?? "").split("\n");
  if (!template.some((line) => line.toLowerCase() === `## ${heading.toLowerCase()}`)) {
    findings.push(finding("C26c", "change-template-has-no-section", anchor));
  }
  return findings;
}
function recordHomeAnchor(ctx) {
  const home = recordHome(child(policyDocument(ctx), "hitl"));
  const parts = home.split("#");
  return parts[parts.length - 1] ?? "";
}
function recordHome(hitl) {
  return stringOrEmpty(hitl == null ? void 0 : hitl["record_home"]);
}
function containsIgnoringCase(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// src/checks/runtime-governance-hitl-canary.ts
var C26B_FINDINGS = [
  "autonomy-ceilings-unusable",
  "answer-mismatch",
  "thin-target-unusable",
  "thin-target-is-a4",
  "situation-not-required",
  "situation-cites-undeclared-reason",
  "unknown-situation-not-rejected",
  "resolve-task-does-not-carry-hitl",
  "security-files-floor-not-high",
  "resolve-task-folds-hitl-off-a-bare-floor"
];
var C26B_TITLE = "kernel.sh hitl answers the expected required and autonomy_after for the low/high tiers, drops autonomy exactly one level on thin evidence at low and medium and to autonomy.high_with_thin_evidence at high without ever raising it, cites both flag-driven reasons and every declared situation, rejects an unknown situation, and resolve-task carries the answer for a classified tier while claiming none off a bare risk floor";
var TOKEN7 = "hitl";
var UNKNOWN_SITUATION = "engineos-no-such-situation";
var THIN_DROPS = [
  ["low", "A2", "A1"],
  ["medium", "A2", "A1"],
  ["medium", "A3", "A2"],
  ["low", "A4", "A3"],
  ["medium", "A1", "A1"],
  ["low", "A0", "A0"],
  ["high", "A0", "A0"]
];
function checkC26b(ctx) {
  const skipped = requirePolicy(ctx, "C26b", C26B_TITLE, TOKEN7);
  if (skipped !== void 0) return skipped;
  const document = policyDocument(ctx);
  const findings = [];
  const autonomy = child(document, "autonomy");
  const byRisk = child(autonomy, "ceiling_by_risk");
  const ceilings = {
    low: stringOrEmpty(byRisk == null ? void 0 : byRisk["low"]),
    medium: stringOrEmpty(byRisk == null ? void 0 : byRisk["medium"]),
    high: stringOrEmpty(byRisk == null ? void 0 : byRisk["high"])
  };
  if (ceilings.low === "" || ceilings.medium === "" || ceilings.high === "") {
    findings.push(finding("C26b", "autonomy-ceilings-unusable"));
  } else {
    tierCases(ctx, findings, ceilings);
    thinEvidence(ctx, findings, stringOrEmpty(autonomy == null ? void 0 : autonomy["high_with_thin_evidence"]));
    situationCases(ctx, findings, document, ceilings.low);
  }
  resolveTaskFold(ctx, findings);
  return [result("C26b", C26B_TITLE, findings)];
}
function hitlAnswer(ctx, args) {
  const answer = kernelAnswer2(ctx, ["hitl", ...args]);
  const required = typeof answer["required"] === "boolean" ? String(answer["required"]) : "none";
  const after = stringOrEmpty(answer["autonomy_after"]);
  return `${required}/${after === "" ? "none" : after}`;
}
function expectAnswer(ctx, findings, label, args, wanted) {
  const got = hitlAnswer(ctx, args);
  if (got !== wanted) findings.push(finding("C26b", "answer-mismatch", `${label}:${got}`));
}
function tierCases(ctx, findings, ceilings) {
  expectAnswer(ctx, findings, "low-risk", ["--risk", "low", "--autonomy", ceilings.low], `false/${ceilings.low}`);
  expectAnswer(ctx, findings, "high-risk", ["--risk", "high", "--autonomy", ceilings.high], `true/${ceilings.high}`);
  expectAnswer(
    ctx,
    findings,
    "external-effect-at-ceiling",
    ["--risk", "medium", "--autonomy", ceilings.medium, "--external-effect", "true"],
    `true/${ceilings.medium}`
  );
  if (ceilings.low !== "A3" && ceilings.low !== "A4") {
    expectAnswer(
      ctx,
      findings,
      "external-effect-below-a3",
      ["--risk", "medium", "--autonomy", ceilings.low, "--external-effect", "true"],
      `false/${ceilings.low}`
    );
  }
  expectAnswer(
    ctx,
    findings,
    "policy-conflict",
    ["--risk", "low", "--autonomy", ceilings.low, "--conflict", "true"],
    `true/${ceilings.low}`
  );
}
function thinEvidence(ctx, findings, target) {
  for (const [tier, given, wanted] of THIN_DROPS) {
    expectAnswer(
      ctx,
      findings,
      `thin-${tier}-${given}`,
      ["--risk", tier, "--autonomy", given, "--evidence", "thin"],
      `true/${wanted}`
    );
  }
  if (target === "") findings.push(finding("C26b", "thin-target-unusable"));
  else if (target === "A4") findings.push(finding("C26b", "thin-target-is-a4"));
  else expectAnswer(ctx, findings, "thin-high-A4", ["--risk", "high", "--autonomy", "A4", "--evidence", "thin"], `true/${target}`);
}
function situationCases(ctx, findings, document, low) {
  const hitl = child(document, "hitl");
  const declaredReasons = new Set(stringsOf2(hitl, "reasons"));
  const declared4 = [...stringsOf2(child(document, "retry"), "never_retry"), ...stringsOf2(hitl, "situations")];
  for (const situation of declared4) {
    const answer = kernelAnswer2(ctx, ["hitl", "--risk", "low", "--autonomy", low, "--situation", situation]);
    if (answer["required"] !== true) {
      const got = answer["required"] === false ? "false" : "none";
      findings.push(finding("C26b", "situation-not-required", `${situation}:${got}`));
    }
    const undeclared = answerStrings(answer, "reasons").filter((reason2) => !declaredReasons.has(reason2));
    if (undeclared.length > 0) {
      findings.push(finding("C26b", "situation-cites-undeclared-reason", `${situation}:${undeclared.join(",")}`));
    }
  }
  const unknown = kernelAnswer2(ctx, ["hitl", "--risk", "low", "--autonomy", low, "--situation", UNKNOWN_SITUATION]);
  if (unknown["required"] !== void 0) findings.push(finding("C26b", "unknown-situation-not-rejected", UNKNOWN_SITUATION));
}
function resolveTaskFold(ctx, findings) {
  var _a, _b;
  const classified = kernelAnswer2(ctx, ["resolve-task", "--prompt", "drop the users table in production"]);
  const carried = (_a = child(classified, "hitl")) == null ? void 0 : _a["required"];
  if (carried !== true) {
    findings.push(finding("C26b", "resolve-task-does-not-carry-hitl", carried === false ? "false" : "none"));
  }
  const floor = securityFilesFloor(ctx);
  if (floor !== "high") {
    findings.push(finding("C26b", "security-files-floor-not-high", floor === "" ? "none" : floor));
    return;
  }
  const bare = kernelAnswer2(ctx, ["resolve-task", "--prompt", "fix the auth guard bug"]);
  const section = bare["hitl"] === null || bare["hitl"] === void 0 ? "null" : "present";
  const stated = stringOrEmpty((_b = child(bare, "task_contract")) == null ? void 0 : _b["risk_floor"]);
  const got = `${section}/${stated === "" ? "none" : stated}`;
  if (got !== `null/${floor}`) findings.push(finding("C26b", "resolve-task-folds-hitl-off-a-bare-floor", got));
}
function securityFilesFloor(ctx) {
  var _a;
  try {
    return ((_a = ctx.registries.intents.intents.find((intent) => intent.id === "security-files")) == null ? void 0 : _a.risk_floor) ?? "";
  } catch {
    return "";
  }
}

// src/checks/runtime-governance.ts
var RUNTIME_GOVERNANCE_CHECKS = [
  { id: "C20", codes: C20_FINDINGS, run: checkC20 },
  { id: "C20b", codes: C20B_FINDINGS, run: checkC20b },
  { id: "C20c", codes: C20C_FINDINGS, run: checkC20c },
  { id: "C20d", codes: C20D_FINDINGS, run: checkC20d },
  { id: "C22", codes: C22_FINDINGS, run: checkC22 },
  { id: "C22b", codes: C22B_FINDINGS, run: checkC22b },
  { id: "C22c", codes: C22C_FINDINGS, run: checkC22c },
  { id: "C23", codes: C23_FINDINGS, run: checkC23 },
  { id: "C23c", codes: C23C_FINDINGS, run: checkC23c },
  { id: "C24", codes: C24_FINDINGS, run: checkC24 },
  { id: "C24b", codes: C24B_FINDINGS, run: checkC24b },
  { id: "C24c", codes: C24C_FINDINGS, run: checkC24c },
  { id: "C25", codes: C25_FINDINGS, run: checkC25 },
  { id: "C25b", codes: C25B_FINDINGS, run: checkC25b },
  { id: "C25c", codes: C25C_FINDINGS, run: checkC25c },
  { id: "C26", codes: C26_FINDINGS, run: checkC26 },
  { id: "C26b", codes: C26B_FINDINGS, run: checkC26b },
  { id: "C26c", codes: C26C_FINDINGS, run: checkC26c },
  { id: "C26d", codes: C26D_FINDINGS, run: checkC26d }
];

// src/checks/runtime-surface-canary.ts
var import_node_fs40 = require("node:fs");
var import_node_os4 = require("node:os");
var import_node_path39 = require("node:path");

// src/checks/runtime-surface-journal.ts
var import_node_path38 = require("node:path");
var C27_FINDINGS = [
  "block-missing",
  "home-missing",
  "home-does-not-end-in-exec-jsonl",
  "schema-missing",
  "schema-not-executable",
  "enumeration-empty",
  "written-by-empty",
  "written-by-names-a-missing-file",
  "written-by-helper-missing",
  "written-by-helper-names-a-missing-file",
  "max-value-length-not-a-positive-integer",
  "fallback-unreadable",
  "max-value-length-fallback-drift"
];
var C27d_FINDINGS = [
  "section-missing",
  "section-empty",
  "field-not-named",
  "span-kind-alternation-missing",
  "null-is-not-zero-caveat-missing",
  "status-floor-caveat-missing",
  "slug-claim-not-scoped-to-note",
  "classifies-content-reclaimed",
  "parallelism-reference-missing",
  // The mirror rows of rowsOf('C27d'); a row id is its finding code.
  "span-kind-missing",
  "journal-home-missing",
  "value-length-drift"
];
var C27_TITLE = "policy.json.telemetry.exec_journal is well-formed: home ends in .exec.jsonl, schema is executable, span_kinds/statuses are non-empty, max_value_length agrees with the port's standalone fallback, and every writer exists";
var C27d_TITLE = "rules/observability.md mirrors the span schema: an Agent traces section naming the registry home, the span-kind alternation in registry order, trace_id/span_kind/cost_micros, the tokens-are-null and status-is-a-floor caveats, and the all-but-note slug claim with its length bound";
var POLICY = "registries/policy.json";
var EJ_POLICY_TS = "src/registry/policy-exec-journal.ts";
var FALLBACK_PATTERN = /^export const MAX_VALUE_LENGTH_FALLBACK = ([0-9]+);$/m;
var OBSERVABILITY = "rules/observability.md";
var AGENT_TRACES = "## Agent traces";
var PARALLELISM = "rules/parallelism.md";
var NAMED_FIELDS = ["trace_id", "span_kind", "cost_micros", "tokens_in"];
function haveExecJournalInputs(ctx, check, title) {
  if (ctx.exists(POLICY)) return void 0;
  return skipOnce(ctx, check, title, "exec-journal");
}
function execJournalBlock(ctx) {
  let raw;
  try {
    raw = readJsonFile((0, import_node_path38.join)(ctx.root, POLICY));
  } catch {
    return void 0;
  }
  const telemetry = isRecord(raw) ? raw["telemetry"] : void 0;
  const block2 = isRecord(telemetry) ? telemetry["exec_journal"] : void 0;
  return isRecord(block2) ? block2 : void 0;
}
function checkC27(ctx) {
  const skipped = haveExecJournalInputs(ctx, "C27", C27_TITLE);
  if (skipped !== void 0) return skipped;
  const block2 = execJournalBlock(ctx);
  if (block2 === void 0) return [result("C27", C27_TITLE, [finding("C27", "block-missing", POLICY)])];
  const findings = [
    ...homeFindings(block2["home"]),
    ...schemaFindings(ctx, block2["schema"]),
    ...enumerationFindings(block2),
    ...writerFindings(ctx, block2),
    ...boundFindings(ctx, block2["max_value_length"])
  ];
  return [result("C27", C27_TITLE, findings)];
}
function checkC27d(ctx) {
  const skipped = haveExecJournalInputs(ctx, "C27d", C27d_TITLE);
  if (skipped !== void 0) return skipped;
  const findings = [...sectionFindings(ctx), ...runMirrors(rowsOf("C27d"), ctx)];
  if (!(ctx.readText(PARALLELISM) ?? "").includes("Agent traces")) {
    findings.push(finding("C27d", "parallelism-reference-missing", PARALLELISM));
  }
  return [result("C27d", C27d_TITLE, findings)];
}
function homeFindings(home) {
  if (typeof home !== "string" || home === "") return [finding("C27", "home-missing")];
  if (!home.endsWith(".exec.jsonl")) return [finding("C27", "home-does-not-end-in-exec-jsonl", home)];
  return [];
}
function schemaFindings(ctx, schema) {
  if (typeof schema !== "string" || schema === "") return [finding("C27", "schema-missing")];
  if (executableBit(ctx.root, schema) === false) return [finding("C27", "schema-not-executable", schema)];
  return [];
}
function enumerationFindings(block2) {
  const findings = [];
  for (const field of ["span_kinds", "statuses"]) {
    if (stringArray(block2[field]).length < 1) findings.push(finding("C27", "enumeration-empty", field));
  }
  return findings;
}
function writerFindings(ctx, block2) {
  const findings = [];
  const writers = stringArray(block2["written_by"]);
  if (writers.length < 1) findings.push(finding("C27", "written-by-empty"));
  for (const writer of writers) {
    if (!ctx.exists(writer)) findings.push(finding("C27", "written-by-names-a-missing-file", writer));
  }
  const helper = block2["written_by_helper"];
  if (typeof helper !== "string" || helper === "") findings.push(finding("C27", "written-by-helper-missing"));
  else if (!ctx.exists(helper)) findings.push(finding("C27", "written-by-helper-names-a-missing-file", helper));
  return findings;
}
function boundFindings(ctx, bound) {
  var _a;
  if (typeof bound !== "number" || !Number.isInteger(bound) || bound <= 0) {
    return [finding("C27", "max-value-length-not-a-positive-integer", bound === void 0 ? "missing" : String(bound))];
  }
  const source = ctx.readText(EJ_POLICY_TS);
  const declared4 = source === void 0 ? null : ((_a = FALLBACK_PATTERN.exec(source)) == null ? void 0 : _a[1]) ?? null;
  if (declared4 === null) return [finding("C27", "fallback-unreadable", EJ_POLICY_TS)];
  if (declared4 !== String(bound)) {
    return [finding("C27", "max-value-length-fallback-drift", `registry:${bound}-source:${declared4}`)];
  }
  return [];
}
function sectionFindings(ctx) {
  const text3 = ctx.readText(OBSERVABILITY);
  const section = text3 === void 0 ? void 0 : sliceSection(text3, AGENT_TRACES);
  if (section === void 0) return [finding("C27d", "section-missing", AGENT_TRACES)];
  if (section.trim() === "") return [finding("C27d", "section-empty", AGENT_TRACES)];
  const findings = [];
  for (const term of NAMED_FIELDS) {
    if (!section.includes(term)) findings.push(finding("C27d", "field-not-named", term));
  }
  findings.push(...alternationFindings(ctx, section));
  findings.push(...caveatFindings(section));
  return findings;
}
function alternationFindings(ctx, section) {
  var _a;
  const kinds = stringArray((_a = execJournalBlock(ctx)) == null ? void 0 : _a["span_kinds"]);
  if (kinds.length === 0) return [];
  const alternation = `\`${kinds.join(" | ")}\``;
  if (section.includes(alternation)) return [];
  return [finding("C27d", "span-kind-alternation-missing", kinds.join("-"))];
}
function caveatFindings(section) {
  const findings = [];
  if (!section.includes("a null is an unknown rather than a zero")) findings.push(finding("C27d", "null-is-not-zero-caveat-missing"));
  if (!section.includes("FLOOR")) findings.push(finding("C27d", "status-floor-caveat-missing"));
  if (!section.includes("every field EXCEPT `note`")) findings.push(finding("C27d", "slug-claim-not-scoped-to-note"));
  if (!section.includes("does not classify the content")) findings.push(finding("C27d", "classifies-content-reclaimed"));
  return findings;
}

// src/checks/runtime-surface-canary.ts
var C27b_FINDINGS = ["append-contract-broken", "validate-contract-broken"];
var C27b_TITLE = "scripts/exec-journal.sh round-trips a full v2 span and every declared span kind, keeps a v1 line's shape, refuses whitespace in every field but note (run_id and agent included), refuses an over-long value, refuses a status or model_tier outside its enumeration on validate as well as on append, and still accepts a free-text note";
var BASE = [
  "--run-id",
  "canary",
  "--capability-id",
  "route",
  "--model-tier",
  "build",
  "--status",
  "OK",
  "--tokens-in",
  "0",
  "--tokens-out",
  "0",
  "--duration-ms",
  "1"
];
var FALLBACK_MAX_VALUE_LENGTH = 256;
var REJECTED_LINES = [
  {
    subject: "validate-accepted-a-whitespace-span-field",
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"bad id","route":"good"}'
  },
  {
    subject: "validate-accepted-a-whitespace-run_id",
    line: '{"timestamp":"t","run_id":"sess 1","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}'
  },
  // The ENUMERATED v1 fields: append gates them through the member list and
  // validate used to check the type only, so prose in status and a newline in
  // model_tier validated clean on a journal this CLI did not write.
  {
    subject: "validate-accepted-free-text-in-status",
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"it went fine, mostly","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}'
  },
  {
    subject: "validate-accepted-a-newline-in-model_tier",
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build\\nSECRET=leaked","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}'
  }
];
function checkC27b(ctx) {
  const skipped = haveExecJournalInputs(ctx, "C27b", C27b_TITLE);
  if (skipped !== void 0) return skipped;
  const workspace = (0, import_node_fs40.mkdtempSync)((0, import_node_path39.join)((0, import_node_os4.tmpdir)(), "engineos-c27b-"));
  try {
    const findings = [...appendFindings(ctx, workspace), ...validateFindings(ctx, workspace)];
    return [result("C27b", C27b_TITLE, findings)];
  } finally {
    (0, import_node_fs40.rmSync)(workspace, { recursive: true, force: true });
  }
}
function appendFindings(ctx, workspace) {
  const findings = [];
  const spans = (0, import_node_path39.join)(workspace, "spans.exec.jsonl");
  findings.push(...fullSpanFindings(ctx, spans));
  for (const kind of declaredList(ctx, "span_kinds")) {
    if (!append2(ctx, spans, ["--span-kind", kind])) {
      findings.push(broke("append", `declared-span-kind-rejected:${kind}`));
    }
  }
  findings.push(...v1ShapeFindings(ctx, (0, import_node_path39.join)(workspace, "v1.exec.jsonl")));
  findings.push(...refusalFindings(ctx, spans));
  return findings;
}
function fullSpanFindings(ctx, spans) {
  const accepted = append2(ctx, spans, [
    "--status",
    "FAILED",
    "--duration-ms",
    "900",
    "--trace-id",
    "canary-session",
    "--span-id",
    "tu-1",
    "--parent-span-id",
    "tu-0",
    "--span-kind",
    "tool",
    "--tool",
    "mcp.postgres",
    "--provider",
    "anthropic",
    "--model",
    "claude-opus-5",
    "--cost-micros",
    "1200",
    "--retry-attempt",
    "1",
    "--cache-hit",
    "false",
    "--route",
    "dba",
    "--risk",
    "medium"
  ]);
  if (!accepted) return [broke("append", "full-v2-line-was-rejected")];
  const findings = [];
  if (!validate2(ctx, spans)) findings.push(broke("append", "full-v2-line-did-not-validate"));
  const written = lastRecord(spans);
  const expected = {
    trace_id: "canary-session",
    span_id: "tu-1",
    parent_span_id: "tu-0",
    span_kind: "tool",
    tool: "mcp.postgres",
    provider: "anthropic",
    model: "claude-opus-5",
    cost_micros: 1200,
    retry_attempt: 1,
    cache_hit: false,
    route: "dba",
    risk: "medium",
    status: "FAILED"
  };
  if (!roundTrips(written, expected)) findings.push(broke("append", "full-v2-line-did-not-round-trip"));
  return findings;
}
function roundTrips(written, expected) {
  if (written === void 0) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (written[key] !== value) return false;
  }
  return true;
}
function v1ShapeFindings(ctx, file) {
  if (!append2(ctx, file, [])) return [broke("append", "v1-line-was-rejected")];
  const written = lastRecord(file);
  const v2Keys = ["span_kind", "trace_id", "cost_micros"];
  if (written !== void 0 && v2Keys.some((key) => key in written)) {
    return [broke("append", "a-v1-line-now-carries-v2-keys")];
  }
  return [];
}
function refusalFindings(ctx, spans) {
  const findings = [];
  const bound = declaredBound(ctx);
  const long = "a".repeat(bound + 1);
  const mustRefuse = [
    { subject: "whitespace-trace_id-was-not-rejected", args: ["--trace-id", "has space"] },
    { subject: "newline-trace_id-was-not-rejected", args: ["--trace-id", "clean\nthen arbitrary text"] },
    { subject: "unknown-span_kind-was-not-rejected", args: ["--span-kind", "bogus-kind"] },
    { subject: "unknown-risk-was-not-rejected", args: ["--risk", "critical"] },
    { subject: "fractional-cost_micros-was-not-rejected", args: ["--cost-micros", "1.5"] },
    { subject: "non-boolean-cache_hit-was-not-rejected", args: ["--cache-hit", "yes"] },
    { subject: "whitespace-run_id-was-not-rejected", args: ["--run-id", "has space"] },
    { subject: "whitespace-capability_id-was-not-rejected", args: ["--capability-id", "has space"] },
    { subject: "newline-agent-was-not-rejected", args: ["--agent", "agent\nSECRET=leaked prompt text"] },
    { subject: "over-long-trace_id-was-not-rejected", args: ["--trace-id", long] },
    { subject: "over-long-note-was-not-rejected", args: ["--note", long] }
  ];
  for (const { subject, args } of mustRefuse) {
    if (append2(ctx, spans, args)) findings.push(broke("append", subject));
  }
  if (!append2(ctx, spans, ["--note", "a human annotation, with spaces"])) {
    findings.push(broke("append", "free-text-note-was-rejected"));
  }
  return findings;
}
function validateFindings(ctx, workspace) {
  const findings = [];
  const file = (0, import_node_path39.join)(workspace, "foreign.exec.jsonl");
  for (const { subject, line } of REJECTED_LINES) {
    (0, import_node_fs40.writeFileSync)(file, `${line}
`);
    if (validate2(ctx, file)) findings.push(broke("validate", subject));
  }
  for (const status of declaredList(ctx, "statuses")) {
    (0, import_node_fs40.writeFileSync)(file, `${v1Line(JSON.stringify(status), "null")}
`);
    if (!validate2(ctx, file)) findings.push(broke("validate", `validate-rejected-a-declared-status:${status}`));
  }
  (0, import_node_fs40.writeFileSync)(file, `${v1Line('"OK"', '"a human annotation, with spaces"')}
`);
  if (!validate2(ctx, file)) findings.push(broke("validate", "validate-rejected-a-free-text-note"));
  return findings;
}
function v1Line(status, note) {
  return `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":${status},"tokens_in":0,"tokens_out":0,"duration_ms":1,"note":${note}}`;
}
function append2(ctx, file, extra) {
  return runCli(ctx, ["append", file, ...BASE, ...extra]);
}
function validate2(ctx, file) {
  return runCli(ctx, ["validate", file]);
}
function runCli(ctx, argv2) {
  const io2 = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  return runJournal(argv2, io2) === 0;
}
function lastRecord(file) {
  let text3;
  try {
    text3 = (0, import_node_fs40.readFileSync)(file, "utf8");
  } catch {
    return void 0;
  }
  const lines = text3.split("\n").filter((line) => line !== "");
  const last = lines[lines.length - 1];
  if (last === void 0) return void 0;
  try {
    const parsed = JSON.parse(last);
    return isRecord(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function declaredList(ctx, field) {
  var _a;
  return stringArray((_a = execJournalBlock(ctx)) == null ? void 0 : _a[field]);
}
function declaredBound(ctx) {
  var _a;
  const declared4 = (_a = execJournalBlock(ctx)) == null ? void 0 : _a["max_value_length"];
  if (typeof declared4 !== "number" || !Number.isInteger(declared4) || declared4 <= 0) return FALLBACK_MAX_VALUE_LENGTH;
  return declared4;
}
function broke(boundary, subject) {
  return boundary === "append" ? finding("C27b", "append-contract-broken", subject) : finding("C27b", "validate-contract-broken", subject);
}

// src/checks/runtime-surface-adoption.ts
var C28_FINDINGS = [
  "reference-missing",
  "reference-does-not-define",
  "skill-missing",
  "skill-does-not-link-the-reference",
  "rule-missing",
  "rag-section-missing",
  "rag-section-does-not-name"
];
var C29_FINDINGS = [
  "init-script-not-executable",
  "command-missing",
  "command-does-not-name-the-script",
  "scaffolder-missing",
  "hook-does-not-import-the-scaffolder",
  "init-does-not-import-the-scaffolder",
  "adoption-doc-missing",
  "adoption-doc-does-not-name-the-command"
];
var C28_TITLE = "the retrieval-metrics pair holds: skills/eval-harness/references/retrieval-metrics.md defines Recall@K/Precision@K/MRR, skills/eval-harness/SKILL.md links it, and the RAG section of rules/llm-apps.md names all three";
var C29_TITLE = "the adoption entrypoints are wired: scripts/init-project.sh is executable, commands/init.md invokes it, both the SessionStart hook and engineos init import src/hooks/scaffold.ts, and docs/ADOPTION.md names /engineos:init";
var RETRIEVAL_METRICS = ["Recall@K", "Precision@K", "MRR"];
var REFERENCE_DIR = "skills/eval-harness/references";
var REFERENCE = `${REFERENCE_DIR}/retrieval-metrics.md`;
var EVAL_SKILL = "skills/eval-harness/SKILL.md";
var LLM_RULES = "rules/llm-apps.md";
var RAG_ANCHOR = "## RAG";
var INIT_SCRIPT = "scripts/init-project.sh";
var INIT_COMMAND = "commands/init.md";
var SCAFFOLDER2 = "src/hooks/scaffold.ts";
var LAYOUT_HOOK = "src/hooks/ensure-project-layout.ts";
var INIT_MODULE = "src/init/project.ts";
var ADOPTION_DOC = "docs/ADOPTION.md";
function checkC28(ctx) {
  if (!ctx.exists(REFERENCE_DIR)) return skipPending(ctx, "C28", C28_TITLE, REFERENCE_DIR);
  const findings = [
    ...referenceFindings(ctx),
    ...skillFindings(ctx),
    ...ragFindings(ctx)
  ];
  return [result("C28", C28_TITLE, findings)];
}
function checkC29(ctx) {
  if (!ctx.exists(INIT_SCRIPT)) return skipPending(ctx, "C29", C29_TITLE, INIT_SCRIPT);
  const findings = [];
  if (executableBit(ctx.root, INIT_SCRIPT) === false) {
    findings.push(finding("C29", "init-script-not-executable", INIT_SCRIPT));
  }
  findings.push(...commandFindings(ctx));
  findings.push(...scaffolderFindings(ctx));
  findings.push(...adoptionDocFindings(ctx));
  return [result("C29", C29_TITLE, findings)];
}
function referenceFindings(ctx) {
  const text3 = ctx.readText(REFERENCE);
  if (text3 === void 0) return [finding("C28", "reference-missing", REFERENCE)];
  const findings = [];
  for (const metric of RETRIEVAL_METRICS) {
    if (!text3.includes(metric)) findings.push(finding("C28", "reference-does-not-define", metric));
  }
  return findings;
}
function skillFindings(ctx) {
  const text3 = ctx.readText(EVAL_SKILL);
  if (text3 === void 0) return [finding("C28", "skill-missing", EVAL_SKILL)];
  if (text3.includes("references/retrieval-metrics.md")) return [];
  return [finding("C28", "skill-does-not-link-the-reference", EVAL_SKILL)];
}
function ragFindings(ctx) {
  const text3 = ctx.readText(LLM_RULES);
  if (text3 === void 0) return [finding("C28", "rule-missing", LLM_RULES)];
  const section = sliceSection(text3, RAG_ANCHOR);
  if (section === void 0 || section.trim() === "") return [finding("C28", "rag-section-missing", RAG_ANCHOR)];
  const findings = [];
  for (const metric of RETRIEVAL_METRICS) {
    if (!section.includes(metric)) findings.push(finding("C28", "rag-section-does-not-name", metric));
  }
  return findings;
}
function commandFindings(ctx) {
  const text3 = ctx.readText(INIT_COMMAND);
  if (text3 === void 0) return [finding("C29", "command-missing", INIT_COMMAND)];
  if (text3.includes(INIT_SCRIPT)) return [];
  return [finding("C29", "command-does-not-name-the-script", INIT_COMMAND)];
}
function scaffolderFindings(ctx) {
  if (!ctx.exists(SCAFFOLDER2)) return [finding("C29", "scaffolder-missing", SCAFFOLDER2)];
  const findings = [];
  if (!(ctx.readText(LAYOUT_HOOK) ?? "").includes("from './scaffold'")) {
    findings.push(finding("C29", "hook-does-not-import-the-scaffolder", LAYOUT_HOOK));
  }
  if (!(ctx.readText(INIT_MODULE) ?? "").includes("from '../hooks/scaffold'")) {
    findings.push(finding("C29", "init-does-not-import-the-scaffolder", INIT_MODULE));
  }
  return findings;
}
function adoptionDocFindings(ctx) {
  const text3 = ctx.readText(ADOPTION_DOC);
  if (text3 === void 0) return [finding("C29", "adoption-doc-missing", ADOPTION_DOC)];
  if (text3.includes("/engineos:init")) return [];
  return [finding("C29", "adoption-doc-does-not-name-the-command", ADOPTION_DOC)];
}

// src/checks/runtime-surface-modes.ts
var C30_FINDINGS = [
  "library-list-unreadable",
  "listed-library-does-not-exist",
  "listed-library-does-not-introduce-itself-as-one",
  "library-carries-the-executable-bit",
  "hook-entry-point-is-not-executable",
  "introduces-itself-as-a-library-but-is-not-listed",
  "install-decides-executability-from-file-text"
];
var C30_TITLE = "hook modes are the honest signal install.sh treats them as: every hooks/*.sh outside install.sh's library list is executable, every library in it exists, says so in its header and is not executable, and the list \u2014 not the files' own text \u2014 is what the installer reads";
var INSTALLER = "install.sh";
var HOOKS_DIR2 = "hooks";
var LIB_MARKER = "Sourced only";
var HEADER_LINES = 8;
var LIST_PATTERN = /^ENGINEOS_HOOK_LIBRARIES="(.*)"$/m;
function checkC30(ctx) {
  var _a;
  const installer = ctx.readText(INSTALLER);
  if (installer === void 0 || !ctx.exists(HOOKS_DIR2)) {
    return skipOnce(ctx, "C30", C30_TITLE, "hook-modes");
  }
  const declared4 = (_a = LIST_PATTERN.exec(installer)) == null ? void 0 : _a[1];
  if (declared4 === void 0 || declared4.trim() === "") {
    return [result("C30", C30_TITLE, [finding("C30", "library-list-unreadable", INSTALLER)])];
  }
  const libraries = declared4.split(/\s+/).filter((name) => name !== "");
  const findings = [
    ...libraryFindings(ctx, libraries),
    ...entryPointFindings(ctx, new Set(libraries)),
    ...installerFindings(installer)
  ];
  return [result("C30", C30_TITLE, findings)];
}
function libraryFindings(ctx, libraries) {
  const findings = [];
  for (const name of libraries) {
    const text3 = ctx.readText(`${HOOKS_DIR2}/${name}`);
    if (text3 === void 0) {
      findings.push(finding("C30", "listed-library-does-not-exist", name));
      continue;
    }
    if (!header(text3).includes(LIB_MARKER)) {
      findings.push(finding("C30", "listed-library-does-not-introduce-itself-as-one", name));
    }
    if (executableBit(ctx.root, `${HOOKS_DIR2}/${name}`) === true) {
      findings.push(finding("C30", "library-carries-the-executable-bit", name));
    }
  }
  return findings;
}
function entryPointFindings(ctx, libraries) {
  const findings = [];
  for (const name of ctx.list(HOOKS_DIR2)) {
    if (!name.endsWith(".sh") || libraries.has(name)) continue;
    const text3 = ctx.readText(`${HOOKS_DIR2}/${name}`);
    if (text3 === void 0) continue;
    if (executableBit(ctx.root, `${HOOKS_DIR2}/${name}`) === false) {
      findings.push(finding("C30", "hook-entry-point-is-not-executable", name));
    }
    if (header(text3).includes(LIB_MARKER)) {
      findings.push(finding("C30", "introduces-itself-as-a-library-but-is-not-listed", name));
    }
  }
  return findings;
}
function installerFindings(installer) {
  const live = installer.split("\n").some((line) => line.includes(LIB_MARKER) && !/^\s*#/.test(line));
  return live ? [finding("C30", "install-decides-executability-from-file-text", INSTALLER)] : [];
}
function header(text3) {
  return text3.split("\n").slice(0, HEADER_LINES).join("\n");
}

// src/checks/runtime-surface-wiring.ts
var C27c_FINDINGS = [
  "span-kinds-empty",
  "declared-writer-writes-no-span",
  "dispatch-hook-opens-no-span",
  "return-hook-closes-no-span",
  "undeclared-span-writer",
  "span-sink-references-prompt-text",
  "reaper-ignores-exec-jsonl",
  "reaper-ignores-span-markers"
];
var C27c_TITLE = "exec-journal span wiring is complete in both directions (every declared writer writes a span, every span-writing hook is declared), prompt-text-free at the sink, and reaped by src/hooks/ensure-project-layout.ts";
var HOOKS_DIR3 = "src/hooks";
var DISPATCH_HOOK = "src/hooks/announce-agent-dispatch.ts";
var RETURN_HOOK = "src/hooks/announce-agent-return.ts";
var LAYOUT_HOOK2 = "src/hooks/ensure-project-layout.ts";
var NOT_WRITERS = /* @__PURE__ */ new Set(["src/hooks/telemetry.ts", "src/hooks/span-writer.ts"]);
var LIFECYCLE = /openSpan\(|closeSpan\(|withSpan\(/;
function checkC27c(ctx) {
  const skipped = haveExecJournalInputs(ctx, "C27c", C27c_TITLE);
  if (skipped !== void 0) return skipped;
  const block2 = execJournalBlock(ctx);
  const kinds = stringArray(block2 == null ? void 0 : block2["span_kinds"]);
  const writers = stringArray(block2 == null ? void 0 : block2["written_by"]);
  const findings = [];
  if (kinds.length === 0) {
    findings.push(finding("C27c", "span-kinds-empty"));
  } else {
    findings.push(...forwardFindings(ctx, writers));
    findings.push(...pairFindings(ctx));
    findings.push(...reverseFindings(ctx, kinds, writers));
  }
  findings.push(...sinkFindings(ctx, block2 == null ? void 0 : block2["written_by_helper"]));
  findings.push(...reaperFindings(ctx));
  return [result("C27c", C27c_TITLE, findings)];
}
function forwardFindings(ctx, writers) {
  const findings = [];
  for (const writer of writers) {
    const text3 = ctx.readText(writer);
    if (text3 === void 0) continue;
    if (!LIFECYCLE.test(text3)) findings.push(finding("C27c", "declared-writer-writes-no-span", writer));
  }
  return findings;
}
function pairFindings(ctx) {
  const findings = [];
  if (!(ctx.readText(DISPATCH_HOOK) ?? "").includes("openSpan(")) {
    findings.push(finding("C27c", "dispatch-hook-opens-no-span", DISPATCH_HOOK));
  }
  if (!(ctx.readText(RETURN_HOOK) ?? "").includes("closeSpan(")) {
    findings.push(finding("C27c", "return-hook-closes-no-span", RETURN_HOOK));
  }
  return findings;
}
function reverseFindings(ctx, kinds, writers) {
  const declared4 = new Set(writers);
  const emitsKind = new RegExp(`kind: '(${kinds.map(escapeRegExp3).join("|")})'`);
  const findings = [];
  for (const name of ctx.list(HOOKS_DIR3)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const path = `${HOOKS_DIR3}/${name}`;
    if (NOT_WRITERS.has(path)) continue;
    const text3 = ctx.readText(path);
    if (text3 === void 0 || !emitsKind.test(text3)) continue;
    if (!declared4.has(path)) findings.push(finding("C27c", "undeclared-span-writer", path));
  }
  return findings;
}
function sinkFindings(ctx, helper) {
  if (typeof helper !== "string" || helper === "") return [];
  const text3 = ctx.readText(helper);
  if (text3 === void 0 || !text3.includes("env.prompt")) return [];
  return [finding("C27c", "span-sink-references-prompt-text", helper)];
}
function reaperFindings(ctx) {
  const text3 = ctx.readText(LAYOUT_HOOK2) ?? "";
  const findings = [];
  if (!text3.includes("endsWith('.jsonl')")) findings.push(finding("C27c", "reaper-ignores-exec-jsonl", LAYOUT_HOOK2));
  if (!text3.includes("reapFilesBelow(spans")) findings.push(finding("C27c", "reaper-ignores-span-markers", LAYOUT_HOOK2));
  return findings;
}
function escapeRegExp3(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/checks/runtime-surface.ts
var RUNTIME_SURFACE_CHECKS = [
  { id: "C27", codes: C27_FINDINGS, run: checkC27 },
  { id: "C27b", codes: C27b_FINDINGS, run: checkC27b },
  { id: "C27c", codes: C27c_FINDINGS, run: checkC27c },
  { id: "C27d", codes: C27d_FINDINGS, run: checkC27d },
  { id: "C28", codes: C28_FINDINGS, run: checkC28 },
  { id: "C29", codes: C29_FINDINGS, run: checkC29 },
  { id: "C30", codes: C30_FINDINGS, run: checkC30 }
];

// src/checks/skill-enablement.ts
var C34_FINDINGS = ["answer-lacks-suppressed-pair"];
var C35_FINDINGS = ["domain-emptied-by-disablement"];
var SKILL_ENABLEMENT_CHECKS = [
  { id: "C34", codes: C34_FINDINGS, run: checkC34 },
  { id: "C35", codes: C35_FINDINGS, run: checkC35 }
];
var C34_TITLE = "the three kernel answer sites route-path, route-intent and resolve-task each emit skills together with skills_suppressed";
var C35_TITLE = "no routing domain is left without an enabled skill by disablement";
var ROUTING_JSON3 = "registries/routing.json";
var INTENT_PROMPT = "create a new nestjs endpoint";
var SKILLS_KEY = "skills";
var SUPPRESSED_KEY = "skills_suppressed";
function checkC34(ctx) {
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === void 0) return [preconditionResult("C34", C34_TITLE, ROUTING_JSON3)];
  const sample = routing.domains.find(
    (domain) => domain.skills.length > 0 && domain.sample_path !== null && domain.sample_path !== ""
  );
  if (sample === void 0) return skipPending(ctx, "C34", C34_TITLE, ROUTING_JSON3);
  const findings = [
    ...pairFindings2("route-path", kernelAnswer(ctx, ["route-path", sample.sample_path ?? ""])),
    ...pairFindings2("route-intent", kernelAnswer(ctx, ["route-intent", INTENT_PROMPT])),
    ...pairFindings2("resolve-task", kernelAnswer(ctx, ["resolve-task", "--prompt", INTENT_PROMPT]))
  ];
  return [result("C34", C34_TITLE, findings)];
}
function pairFindings2(arm, answer) {
  return carriesPairAt(arm, answer) ? [] : [finding("C34", "answer-lacks-suppressed-pair", arm)];
}
function checkC35(ctx) {
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === void 0) return [preconditionResult("C35", C35_TITLE, ROUTING_JSON3)];
  const state = readSkillState(ctx.root);
  const findings = [];
  for (const domain of routing.domains) {
    if (domain.skills.length === 0) continue;
    if (enabledSkills(domain.skills, state).length === 0) {
      findings.push(finding("C35", "domain-emptied-by-disablement", domain.id));
    }
  }
  return [result("C35", C35_TITLE, findings)];
}
function carriesPairAt(arm, answer) {
  if (arm === "route-path") return carriesPair(answer);
  if (arm === "resolve-task") return carriesPair(isRecord(answer) ? answer["task_contract"] : void 0);
  const matches = isRecord(answer) ? answer["matches"] : void 0;
  if (!Array.isArray(matches)) return false;
  return matches.every(carriesPair);
}
function carriesPair(value) {
  return isRecord(value) && SKILLS_KEY in value && SUPPRESSED_KEY in value;
}

// src/checks/index.ts
var CHECKS = [
  ...RULES_CHECKS,
  ...REGISTRIES_CHECKS,
  ...AGENTS_SKILLS_CHECKS,
  ...DECISION_REGISTRIES_CHECKS,
  ...KERNEL_CHECKS,
  ...CONTRACTS_CHECKS,
  ...RUNTIME_GOVERNANCE_CHECKS,
  ...RUNTIME_SURFACE_CHECKS,
  ...PORTABILITY_CHECKS,
  ...SKILL_ENABLEMENT_CHECKS,
  ...PROSE_TRUTH_CHECKS
];
function orderIds(ids) {
  return [...ids].sort((a, b) => {
    const left = idKey(a);
    const right = idKey(b);
    if (left.numeric !== right.numeric) return left.numeric - right.numeric;
    return byteOrder5(left.suffix, right.suffix);
  });
}
function selectIds(ids, only) {
  if (only === ALL) return { selected: [...ids], unknown: [] };
  const wants = only.split(/[\s,]+/).filter((want) => want !== "");
  const known = /* @__PURE__ */ new Set();
  for (const id of ids) {
    known.add(id);
    known.add(parentOf2(id));
  }
  const unknown = wants.filter((want) => !known.has(want));
  const wanted = new Set(wants);
  const selected = ids.filter((id) => wanted.has(id) || wanted.has(parentOf2(id)));
  return { selected: [...new Set(selected)], unknown };
}
var ALL = "all";
function parentOf2(id) {
  const cut = id.search(/[a-z]/);
  return cut === -1 ? id : id.slice(0, cut);
}
function idKey(id) {
  const matched = /^[^0-9]*([0-9]+)([a-z]*)$/.exec(id);
  const digits = matched == null ? void 0 : matched[1];
  if (digits === void 0) return { numeric: 0, suffix: id };
  return { numeric: Number.parseInt(digits, 10), suffix: (matched == null ? void 0 : matched[2]) ?? "" };
}
function byteOrder5(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/validate/cli.ts
var EXIT_OK8 = 0;
var EXIT_VIOLATION = 1;
var EXIT_USAGE4 = 2;
var ALL2 = "all";
function runValidate2(argv2, io2, checks = CHECKS) {
  const args = parseArgs3(argv2, io2);
  if (args === void 0) return EXIT_USAGE4;
  const ids = orderIds(checks.map((check) => check.id));
  if (ids.length === 0) {
    io2.err("no Checks registered\n");
    return EXIT_USAGE4;
  }
  if (args.list) {
    for (const id of ids) io2.out(`${id}
`);
    return EXIT_OK8;
  }
  const { selected, unknown } = selectIds(ids, args.only);
  if (unknown.length > 0) {
    io2.err(`unknown check id: ${unknown.join(" ")}
`);
    return EXIT_USAGE4;
  }
  const byId = new Map(checks.map((check) => [check.id, check]));
  const context2 = makeContext(resolveRoot(io2.env), io2);
  io2.out("== EngineOS integrity ==\n");
  let passed = 0;
  let failed = 0;
  for (const id of selected) {
    const check = byId.get(id);
    if (check === void 0) continue;
    for (const checkResult of runCheck(check, context2, io2)) {
      io2.out(`${render2(checkResult)}
`);
      if (checkResult.status === "ok") passed += 1;
      if (checkResult.status === "fail") failed += 1;
    }
  }
  io2.out(`
passed ${passed}, failed ${failed}
`);
  return failed > 0 ? EXIT_VIOLATION : EXIT_OK8;
}
function parseArgs3(argv2, io2) {
  let only = ALL2;
  let list = false;
  for (let index = 0; index < argv2.length; index += 1) {
    const arg = argv2[index];
    if (arg === "--only") {
      const value = argv2[index + 1];
      if (value === void 0) {
        io2.err("--only requires a comma-separated check list\n");
        return void 0;
      }
      only = value;
      index += 1;
      continue;
    }
    if (arg === "--list") {
      list = true;
      continue;
    }
    io2.err(`unknown argument: ${arg ?? ""}
`);
    return void 0;
  }
  return { only, list };
}
function runCheck(check, context2, io2) {
  try {
    return check.run(context2);
  } catch (error) {
    io2.err(`validate: ${check.id} threw: ${messageOf(error)}
`);
    return [result(check.id, check.id, [finding(check.id, "precondition-missing", check.id)])];
  }
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/cli.ts
var io = processIo();
var argv = process.argv.slice(2);
function isExecutable3(path) {
  try {
    (0, import_node_fs41.accessSync)(path, import_node_fs41.constants.X_OK);
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
      const r = (0, import_node_child_process8.spawnSync)(outcome.bin, [__filename, ...argv], { stdio: "inherit", env: { ...process.env, ENGINEOS_REEXEC: "1" } });
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
  const newer = process.env["ENGINEOS_REEXEC"] === "1" ? null : findNewerNode(process.env, import_node_fs41.existsSync, import_node_fs41.readdirSync, isExecutable3);
  applyOutcome(guardOutcome(argv, process.versions.node, newer));
}
var table = {
  kernel: runKernel,
  journal: runJournal,
  telemetry: runTelemetry,
  hook: runHook,
  init: runInit,
  "settings-merge": runSettingsMerge,
  bypass: runBypass,
  gen: runGen,
  evals: runEvals,
  bench: runBench,
  "usage-report": runUsageReport,
  validate: runValidate2
};
process.exit(dispatch(table, argv, io));
