#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_node_child_process5 = require("node:child_process");
var import_node_fs25 = require("node:fs");

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

// src/hooks/output.ts
var silent = { kind: "silent" };
function context(event2, text2) {
  return { kind: "context", event: event2, text: text2 };
}
function block(reason2) {
  return { kind: "block", reason: reason2 };
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
  let text2;
  try {
    text2 = (0, import_node_fs3.readFileSync)(path, "utf8");
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

// src/registry/decision-rules.ts
var { requireRecord, requireString, requireNumber, requireStrings, requireRows, optionalString, optionalStrings } = strictReader("decision-rules.json");
function loadDecisionRules(root) {
  const raw = loadRegistry(root, "decision-rules.json");
  const d = requireRecord(raw, "");
  return {
    version: requireString(d["version"], ".version"),
    precedence: requireStrings(d["precedence"], ".precedence"),
    conflict_policy: requireString(d["conflict_policy"], ".conflict_policy"),
    rules: requireRows(d["rules"], ".rules").map((row, i) => {
      const at = `.rules[${i}]`;
      const then = requireRecord(row["then"], `${at}.then`);
      return {
        id: requireString(row["id"], `${at}.id`),
        priority: requireNumber(row["priority"], `${at}.priority`),
        source: requireString(row["source"], `${at}.source`),
        when: requireRecord(row["when"], `${at}.when`),
        then: {
          require: optionalStrings(then["require"], `${at}.then.require`),
          gate: optionalString(then["gate"], `${at}.then.gate`),
          risk: optionalString(then["risk"], `${at}.then.risk`),
          prefer: optionalString(then["prefer"], `${at}.then.prefer`)
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
      note: typeof i["note"] === "string" ? i["note"] : null,
      suppressible: i["suppressible"] === true,
      suppressed_by: stringArray(i["suppressed_by"]),
      requires_dispatch_plan: i["requires_dispatch_plan"] === true
    }))
  };
}

// src/registry/models.ts
var MODEL_TIER_IDS = ["most-capable", "design", "build", "cheap"];
function loadModels(root) {
  const raw = loadRegistry(root, "models.json");
  const r = isRecord(raw) ? raw : {};
  return {
    version: requireString2(r["version"], "version"),
    tiers: requireRows2(r["tiers"], "tiers").map((tier, index) => ({
      id: requireString2(tier["id"], `tiers[${index}].id`),
      model: requireString2(tier["model"], `tiers[${index}].model`),
      // The top of the ladder stores null; an absent key reads the same way,
      // because that is what jq's `.escalates_to` answered for both.
      escalates_to: optionalString2(tier["escalates_to"], `tiers[${index}].escalates_to`)
    })),
    escalation_order: requireStringArray(r["escalation_order"], "escalation_order"),
    work_types: requireRows2(r["work_types"], "work_types").map((work, index) => ({
      id: requireString2(work["id"], `work_types[${index}].id`),
      title: requireString2(work["title"], `work_types[${index}].title`),
      tier: requireString2(work["tier"], `work_types[${index}].tier`)
    }))
  };
}
function fail2(field, expected) {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}
function requireString2(value, field) {
  if (typeof value !== "string" || value === "") fail2(field, "a non-empty string");
  return value;
}
function optionalString2(value, field) {
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
  return items.map((item, index) => requireString2(item, `${field}[${index}]`));
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
  const models = memo(() => loadModels(root));
  const policy = memo(() => loadPolicy(root));
  const decisionRules = memo(() => loadDecisionRules(root));
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
function requireCount(value, flag) {
  if (!Number.isInteger(value) || value < 0) {
    throw new KernelError(`admit requires a numeric --${flag}`);
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
    record_home: recordHome
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
function routeByIntent(text2, regs) {
  const lower = asciiDowncase2(text2);
  const matches = [];
  for (const intent of regs.intents.intents) {
    if (!intent.signals.some((signal) => boundedContains(lower, asciiDowncase2(signal)))) continue;
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
var RISK_ORDER = ["low", "medium", "high"];
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
function asciiDowncase2(text2) {
  return text2.replace(/[A-Z]/g, (c) => c.toLowerCase());
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
  const rows = value;
  return rows.map((raw, i) => {
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
    const ceiling = floor === null ? null : ceilingAt(floor, ctx.registries);
    if (decisions.any_high && ceiling !== null) {
      answer.hitl = hitlSection({ riskTier: "high", autonomy: ceiling }, ctx.registries);
    }
    answer.task_contract = taskContract({ prompt, route, decisions, floor, ceiling }, ctx.registries);
  }
  return answer;
}
var POLICY_BUNDLE = ["gates", "models", "parallelism", "risk-autonomy", "verification"];
var AGENT_POLICY_RULE = "subagents";
function taskContract(inputs, regs) {
  const { prompt, route, decisions } = inputs;
  const matched = regs.intents.intents.filter((intent) => route.intents.includes(intent.id));
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
    skills: unique2(matched.flatMap((intent) => intent.skills)),
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
    const flag = rest.shift();
    if (flag === void 0) break;
    if (!allowed.includes(flag)) throw new KernelError(`${cmd}: unknown flag ${flag}`);
    const value = rest.shift();
    if (value === void 0) throw new KernelError(`${cmd}: ${flag} requires a value`);
    out.set(flag, value);
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
  resolve: resolveProjection
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
function routeIntentSection(ctx, text2) {
  const section = resolve({ prompt: text2 }, ctx).route;
  if (section === void 0) throw new KernelError("route-intent: the kernel answered no route section");
  return section;
}
function modelProjection(ctx, args) {
  const flags = parseFlags("model", args, ["--work"]);
  const work = flags.get("--work");
  if (work === void 0 || work === "") throw new KernelError("model requires --work <type>");
  const section = resolve({ workType: work }, ctx).model;
  if (section === void 0) throw new KernelError("model: the kernel answered no model section");
  return section;
}
function riskProjection(ctx, args) {
  const flags = parseFlags("risk", args, ["--signals"]);
  const signals = flags.get("--signals");
  if (signals === void 0 || signals === "") throw new KernelError("risk requires --signals <json>");
  const section = resolve({ signals: parseSignals(signals) }, ctx).risk;
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
  const flags = parseFlags("gates", args, ["--risk"]);
  const tier = flags.get("--risk");
  if (tier === void 0 || !isRiskTier(tier)) throw new KernelError("gates requires --risk low|medium|high");
  const section = resolve({ riskTier: tier }, ctx).risk;
  if (section === void 0 || !("spec_threshold" in section)) {
    throw new KernelError("gates: the kernel answered no classified-tier risk section");
  }
  return { risk: section.risk, gates: section.gates, spec_threshold: section.spec_threshold };
}
function repairProjection(ctx, args) {
  const flags = parseFlags("repair", args, ["--check", "--attempt", "--situation"]);
  const check = flags.get("--check");
  if (check === void 0 || check === "") throw new KernelError("repair requires --check");
  const repair = { check };
  const attempt2 = flags.get("--attempt");
  if (attempt2 !== void 0) repair.attempt = parseCount(attempt2);
  const situation = flags.get("--situation");
  if (situation !== void 0 && situation !== "") repair.situation = situation;
  const section = resolve({ repair }, ctx).repair;
  if (section === void 0) throw new KernelError("repair: the kernel answered no repair section");
  return section;
}
function admitProjection(ctx, args) {
  const flags = parseFlags("admit", args, ["--inflight", "--queued"]);
  const admit = {
    inflight: parseCount(flags.get("--inflight")),
    queued: parseCount(flags.get("--queued"))
  };
  const section = resolve({ admit }, ctx).admit;
  if (section === void 0) throw new KernelError("admit: the kernel answered no admit section");
  return section;
}
function breakerProjection(ctx, args) {
  const flags = parseFlags("breaker", args, ["--state", "--failures", "--cooldown-elapsed", "--probe-result"]);
  const breaker = { state: flags.get("--state") ?? "" };
  const failures = flags.get("--failures");
  if (failures !== void 0) breaker.failures = parseCount(failures);
  const cooldown = flags.get("--cooldown-elapsed");
  if (cooldown === "true" || cooldown === "false") breaker.cooldownElapsed = cooldown === "true";
  const probe = flags.get("--probe-result");
  if (probe !== void 0) breaker.probeResult = probe;
  const section = resolve({ breaker }, ctx).breaker;
  if (section === void 0) throw new KernelError("breaker: the kernel answered no breaker section");
  return section;
}
function hitlProjection(ctx, args) {
  const flags = parseFlags("hitl", args, ["--risk", "--autonomy", "--evidence", "--external-effect", "--conflict", "--situation"]);
  const tier = flags.get("--risk");
  if (tier === void 0 || !isRiskTier(tier)) throw new KernelError("hitl requires --risk low|medium|high");
  const hitl = { riskTier: tier, autonomy: flags.get("--autonomy") ?? "" };
  const evidence = flags.get("--evidence");
  if (evidence !== void 0) hitl.evidence = evidence;
  const external = flags.get("--external-effect");
  if (external !== void 0) hitl.externalEffect = external;
  const conflict = flags.get("--conflict");
  if (conflict !== void 0) hitl.conflict = conflict;
  const situation = flags.get("--situation");
  if (situation !== void 0) hitl.situation = situation;
  const section = resolve({ hitl }, ctx).hitl;
  if (section === void 0) throw new KernelError("hitl: the kernel answered no hitl section");
  return section;
}
function wavesProjection(ctx, args) {
  const flags = parseFlags("waves", args, ["--units"]);
  const units = flags.get("--units");
  if (units === void 0 || units === "") throw new KernelError("waves requires --units <json array>");
  const section = resolve({ waves: { units: parseUnitsJson(units) } }, ctx).waves;
  if (section === void 0) throw new KernelError("waves: the kernel answered no waves section");
  return section;
}
function promptOf(cmd, args) {
  const flags = parseFlags(cmd, args, ["--prompt"]);
  const prompt = flags.get("--prompt");
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
  const flags = parseFlags("resolve", args, ["--facts"]);
  const facts = flags.get("--facts");
  if (facts === void 0 || facts === "") throw new KernelError("resolve requires --facts <json>");
  return resolve(parseFacts(facts), ctx);
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
var import_node_fs6 = require("node:fs");
var import_node_path4 = require("node:path");

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
  { name: "tokens_in", flag: "--tokens-in", guard: "int", json: "number", presence: "required" },
  { name: "tokens_out", flag: "--tokens-out", guard: "int", json: "number", presence: "required" },
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
    const flag = pending.shift();
    if (flag === void 0) break;
    const value = pending.shift();
    if (value === void 0) throw new JournalError("", { usage: true });
    const spec = BY_FLAG.get(flag);
    if (spec === void 0) throw new JournalError(`unknown arg: ${flag}`, { usage: true });
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
function validateFile(root, file, regs) {
  if (!(0, import_node_fs6.existsSync)(file)) throw new JournalError(`no such file: ${file}`);
  requireModelsRegistry(root);
  let text2;
  try {
    text2 = (0, import_node_fs6.readFileSync)(file, "utf8");
  } catch {
    throw new JournalError(`no such file: ${file}`);
  }
  const lines = text2.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const bad = [];
  lines.forEach((line, index) => {
    if (line === "") return;
    if (!validLine(line, regs)) bad.push(index + 1);
  });
  return { lines: lines.length, bad };
}
function usage(argv0) {
  const flags = EXEC_JOURNAL_FIELDS.map((spec) => {
    const term = `${spec.flag} ${placeholder(spec)}`;
    return spec.presence === "required" ? term : `[${term}]`;
  }).join(" ");
  return `usage: ${argv0} append <file> ${flags}
       ${argv0} validate <file>
`;
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
function placeholder(spec) {
  if (spec.json === "boolean") return "true|false";
  if (spec.guard === "int") return "N";
  if (spec.guard === "enum") return "ENUM";
  if (spec.guard === "free") return "TEXT";
  return "ID";
}
function requireModelsRegistry(root) {
  const path = (0, import_node_path4.join)(root, "registries", "models.json");
  if (!(0, import_node_fs6.existsSync)(path)) throw new JournalError(`no models registry at ${path}`);
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
    (0, import_node_fs6.appendFileSync)(file, `${encode(row)}
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
  const result = validateFile(root, file, journalRegistries(root));
  for (const line of result.bad) io2.err(`line ${line}: does not match the exec-journal schema
`);
  if (result.bad.length > 0) {
    io2.err(`${result.bad.length} invalid line(s) in ${file}
`);
    return 1;
  }
  io2.out(`${file}: ${result.lines} line(s), all valid
`);
  return 0;
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.[0-9]{3}Z$/, "Z");
}

// src/journal/telemetry.ts
var import_node_fs7 = require("node:fs");
var import_node_path5 = require("node:path");

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
  if (!(0, import_node_fs7.existsSync)((0, import_node_path5.join)(root, "registries", "policy.json"))) throw new TelemetryError("policy.json missing");
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
    (0, import_node_fs7.appendFileSync)(file, `${line}
`);
  } catch {
    throw new TelemetryError(`cannot append to ${file}`);
  }
}
function validateTelemetry(root, file) {
  if (!isFile(file)) throw new TelemetryError(`no such file: ${file}`);
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
    const flag = args[index] ?? "";
    if (!APPEND_FLAGS.includes(flag)) throw new TelemetryUsageError();
    values.set(flag, args[index + 1] ?? "");
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
function isFile(path) {
  try {
    return (0, import_node_fs7.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function readLines(file) {
  let text2;
  try {
    text2 = (0, import_node_fs7.readFileSync)(file, "utf8");
  } catch {
    throw new TelemetryError(`no such file: ${file}`);
  }
  if (text2 === "") return [];
  const parts = text2.split("\n");
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
  return {
    io: io2,
    root: resolveRoot(io2.env),
    now: Date.now,
    spawn
  };
}

// src/hooks/ensure-project-layout.ts
var import_node_fs11 = require("node:fs");
var import_node_path8 = require("node:path");

// src/hooks/bypass.ts
var import_node_fs9 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path6 = require("node:path");

// src/lib/git.ts
var import_node_fs8 = require("node:fs");
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
    return (0, import_node_fs8.existsSync)(candidate) ? candidate : null;
  });
}

// src/hooks/bypass.ts
function bypassFlagPath(env) {
  const configured = env["ENGINEOS_BYPASS_FLAG"];
  if (configured !== void 0 && configured !== "") return configured;
  const home = env["HOME"];
  return (0, import_node_path6.join)(home !== void 0 && home !== "" ? home : (0, import_node_os.homedir)(), ".claude", "engineos.bypass");
}
function bypassMarker(cwd, spawn) {
  const dir = gitDir(cwd === "" ? process.cwd() : cwd, spawn);
  return dir === null ? null : `${dir}/ENGINEOS_BYPASS`;
}
function bypassActive(cwd, env, spawn) {
  if (env["ENGINEOS_BYPASS"] === "1") return true;
  if ((0, import_node_fs9.existsSync)(bypassFlagPath(env))) return true;
  const marker = bypassMarker(cwd, spawn);
  return marker !== null && (0, import_node_fs9.existsSync)(marker);
}

// src/hooks/scaffold.ts
var import_node_fs10 = require("node:fs");
var import_node_path7 = require("node:path");
var { requireRecord: requireRecord3, requireString: requireString4, requireRows: requireRows4 } = strictReader("layout-manifest.json");
function loadLayoutManifest(engineosRoot) {
  const raw = readJsonFile((0, import_node_path7.join)(engineosRoot, "registries", "layout-manifest.json"));
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
    const existed = isDirectory((0, import_node_path7.join)(projectRoot, entry.dir));
    const parent = scaffoldDir(projectRoot, entry.dir);
    if (parent === null) continue;
    if (!existed) created.push(entry.dir);
    for (const seed of entry.seeds) {
      const abs = seed.src.startsWith("@") ? (0, import_node_path7.join)(engineosRoot, seed.src.slice(1)) : (0, import_node_path7.join)(engineosRoot, "templates", "project-layout", seed.src);
      scaffoldSeed(parent, seed.dest, abs);
    }
  }
  return created;
}
function physDir(dir) {
  try {
    const real = (0, import_node_fs10.realpathSync)(dir);
    return (0, import_node_fs10.statSync)(real).isDirectory() ? real : null;
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
        (0, import_node_fs10.mkdirSync)(next);
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
  if (!isFile2(src)) return;
  if (lstatOrNull(`${parent}/${name}`) !== null) return;
  try {
    (0, import_node_fs10.copyFileSync)(src, `${parent}/${name}`);
  } catch {
  }
}
function lstatOrNull(path) {
  try {
    return (0, import_node_fs10.lstatSync)(path);
  } catch {
    return null;
  }
}
function isDirectory(path) {
  try {
    return (0, import_node_fs10.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile2(path) {
  try {
    return (0, import_node_fs10.statSync)(path).isFile();
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
  if (git !== null && isDirectory2(git)) {
    const now = ctx.now();
    reapUnrecordedFlags(git, now);
    wipeTree((0, import_node_path8.join)(git, ROUTE_CACHE));
    reapTelemetry(git, ctx, now);
  }
  if (isFile3((0, import_node_path8.join)(project, "hooks", "layout-manifest.sh")) && isFile3((0, import_node_path8.join)(project, "install.sh"))) return silent;
  const optIn = ctx.io.env["ENGINEOS_SCAFFOLD"];
  if (optIn === "0") return silent;
  if (optIn !== "1" && !isDirectory2((0, import_node_path8.join)(project, ".engineos"))) return context("SessionStart", OPT_IN_HINT);
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
    reapIfStale((0, import_node_path8.join)(git, name), UNRECORDED_MAX_AGE_DAYS, now);
  }
}
function reapTelemetry(git, ctx, now) {
  const dir = (0, import_node_path8.join)(git, TELEMETRY);
  if (!isDirectory2(dir)) return;
  let days;
  try {
    days = loadTelemetryPolicy(ctx.root).retention_days;
  } catch {
    return;
  }
  if (!Number.isInteger(days) || days < 0) return;
  for (const name of readDirNames(dir)) {
    if (name.endsWith(".jsonl")) reapIfStale((0, import_node_path8.join)(dir, name), days, now);
  }
  const spans = (0, import_node_path8.join)(dir, SPANS);
  if (isDirectory2(spans)) reapFilesBelow(spans, days, now);
}
function reapFilesBelow(dir, days, now) {
  for (const entry of readDirEntries(dir)) {
    const path = (0, import_node_path8.join)(dir, entry.name);
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
function isFile3(path) {
  try {
    return (0, import_node_fs11.statSync)(path).isFile();
  } catch {
    return false;
  }
}

// src/hooks/mark-unrecorded.ts
var import_node_fs12 = require("node:fs");
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
  try {
    (0, import_node_fs12.writeFileSync)(`${dir}/${UNRECORDED_MARKER_PREFIX}${env.sessionId}`, "");
  } catch {
  }
  return silent;
}

// src/hooks/record-verify.ts
var import_node_fs13 = require("node:fs");
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
  const marker = `${dir}/${UNRECORDED_MARKER_PREFIX}${env.sessionId}`;
  if (!(0, import_node_fs13.existsSync)(marker)) return silent;
  const deferred = `${marker}${DEFERRED_SUFFIX}`;
  if ((0, import_node_fs13.existsSync)(deferred)) return silent;
  return block(recordGateReason(deferred));
}

// src/hooks/route-before-change.ts
var import_node_fs14 = require("node:fs");
var import_node_path9 = require("node:path");

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
  const result = ctx.spawn("git", ["-C", cwd, "rev-parse", "--show-toplevel", "--absolute-git-dir", "--show-prefix"], { encoding: "utf8" });
  if (result.error !== void 0 || result.status !== 0) return NO_GIT;
  const lines = (typeof result.stdout === "string" ? result.stdout : "").split("\n");
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
    const stats = (0, import_node_fs14.statSync)((0, import_node_path9.join)(root, "registries", "routing.json"));
    return `${Math.floor(stats.mtimeMs / 1e3)}-${stats.size}`;
  } catch {
    return "unknown";
  }
}
function readGuide(path) {
  let contents;
  try {
    contents = (0, import_node_fs14.readFileSync)(path, "utf8");
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
    parsed = JSON.parse((0, import_node_fs14.readFileSync)(path, "utf8"));
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
  if (!isDirectory3(dir)) return "";
  return hasActiveRecord(dir) ? "" : CHANGE_RECORD_NOTE;
}
function isDirectory3(path) {
  try {
    return (0, import_node_fs14.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function hasActiveRecord(dir) {
  let entries;
  try {
    entries = (0, import_node_fs14.readdirSync)(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    let contents;
    try {
      contents = (0, import_node_fs14.readFileSync)((0, import_node_path9.join)(dir, entry), "utf8");
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
    if (cut > 0) (0, import_node_fs14.mkdirSync)(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    (0, import_node_fs14.writeFileSync)(tmp, contents);
    (0, import_node_fs14.renameSync)(tmp, path);
  } catch {
  }
}

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
var import_node_fs16 = require("node:fs");
var import_node_path11 = require("node:path");

// src/hooks/span-writer.ts
var import_node_fs15 = require("node:fs");
var import_node_path10 = require("node:path");

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
  const journalFile = (0, import_node_path10.join)(opts.dir, `${name}.exec.jsonl`);
  const eventsFile = (0, import_node_path10.join)(opts.dir, `${name}.jsonl`);
  const markers = (0, import_node_path10.join)(opts.dir, "spans");
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
      (0, import_node_fs15.mkdirSync)(markers, { recursive: true });
      (0, import_node_fs15.writeFileSync)(marker, String(ms));
    },
    closeMarker(id) {
      const marker = markerPath(markers, id);
      if (marker === null) return null;
      const text2 = readMarker(marker);
      if (text2 === null) return null;
      (0, import_node_fs15.rmSync)(marker, { force: true });
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
    return (0, import_node_fs15.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
}
function markerPath(dir, id) {
  const name = hookPathSlug(id);
  return name === null ? null : (0, import_node_path10.join)(dir, name);
}

// src/hooks/telemetry.ts
function telemetrySink(env, ctx, opts) {
  if (ctx.io.env["ENGINEOS_TELEMETRY"] === "0") return null;
  if (opts.bypassed) return null;
  if (env.cwd === "") return null;
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !(0, import_node_fs16.existsSync)((0, import_node_path11.join)(project, ".engineos"))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === "") return null;
  const dir = (0, import_node_path11.join)(git, "engineos-telemetry");
  try {
    (0, import_node_fs16.mkdirSync)(dir, { recursive: true });
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
    // joins without four call sites repeating it. Tokens are 0 because a hook
    // cannot see a subagent's usage; a caller that CAN (the headless runner)
    // passes its own through facts.fields, which is spread after these.
    run_id: sink.session,
    trace_id: sink.session,
    span_kind: facts.kind,
    tokens_in: 0,
    tokens_out: 0,
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
function subagentType(env) {
  const input = toolInput(env);
  return firstString(input["subagent_type"], input["agentType"]) ?? UNNAMED_AGENT;
}
function run6(env, ctx) {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const banner = dispatchBanner(subagentType(env), briefDescription(env));
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

// src/hooks/announce-agent-return.ts
function run7(env, ctx) {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const type = subagentType(env);
  const banner = returnBanner(type);
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
      // tokens_in/tokens_out are 0 and cost_micros absent by construction:
      // this hook never sees the subagent's usage. ./telemetry writes the
      // zeros; rules/observability.md says so in prose so nobody reads a 0 as
      // "free".
      fields: { agent }
    });
  } catch {
  }
  return context("PostToolUse", banner);
}
function responseStatus(raw) {
  const payload = isRecord(raw) ? raw : {};
  const response = payload["tool_response"];
  const flag = isRecord(response) ? response["is_error"] : null;
  if (alternative(flag, payload["is_error"]) === true) return "FAILED";
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
var import_node_path14 = require("node:path");
var import_node_fs19 = require("node:fs");

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
var import_node_fs17 = require("node:fs");
var import_node_path12 = require("node:path");
var defaultSpawn = (command, args, options) => (0, import_node_child_process2.spawnSync)(command, args, options);
var MODERN_NODE_MAJOR = 20;
function runnerSelect(root, exists = defaultExists) {
  const kind = exists((0, import_node_path12.join)(root, "nx.json")) ? "nx" : "npm-family";
  if (exists((0, import_node_path12.join)(root, "pnpm-lock.yaml"))) return { kind, run: "pnpm run", exec: "pnpm exec" };
  if (exists((0, import_node_path12.join)(root, "yarn.lock"))) return { kind, run: "yarn run", exec: "yarn" };
  return { kind, run: "npm run", exec: "npx --no-install" };
}
function runnerHandle(sel, pkgDir, readFile = defaultReadFile) {
  if (sel.kind !== "nx") return pkgDir;
  const project = readName(readFile((0, import_node_path12.join)(pkgDir, "project.json")));
  if (project !== null) return project;
  const pkg = readName(readFile((0, import_node_path12.join)(pkgDir, "package.json")));
  return pkg === null ? null : pkg.replace(/^@[^/]*\//, "");
}
function runnerHasTarget(sel, handle, target, readFile = defaultReadFile, spawn = defaultSpawn, cwd = process.cwd()) {
  if (sel.kind === "nx") {
    const argv2 = [...words(sel.exec), "nx", "show", "project", handle, "--json"];
    const shown = spawn(argv2[0] ?? "", argv2.slice(1), { cwd, encoding: "utf8" });
    if (shown.status !== 0) return false;
    return declared3(parseJson(shown.stdout), "targets", target);
  }
  return declared3(parseJson(readFile((0, import_node_path12.join)(handle, "package.json"))), "scripts", target);
}
function runnerRun(sel, handle, target, timeoutSeconds, env, spawn = defaultSpawn, cwd = process.cwd()) {
  const argv2 = sel.kind === "nx" ? [...words(sel.exec), "nx", "run", `${handle}:${target}`] : [...words(sel.run), "-s", target];
  const runCwd = sel.kind === "nx" ? cwd : handle;
  const result = spawn(argv2[0] ?? "", argv2.slice(1), {
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
  const nvmDir = env["NVM_DIR"] ?? (home === void 0 || home === "" ? null : (0, import_node_path12.join)(home, ".nvm"));
  if (nvmDir === null || nvmDir === "") return env;
  const alias = (0, import_node_path12.join)(nvmDir, "alias", "default");
  if (!exists(alias)) return env;
  const wanted = (readLink(alias) ?? "").trim();
  if (wanted === "") return env;
  const versionsDir = (0, import_node_path12.join)(nvmDir, "versions", "node");
  let bin = null;
  for (const name of listDir(versionsDir).sort()) {
    if (!name.startsWith(`v${wanted}`)) continue;
    if (majorOf(name) < MODERN_NODE_MAJOR) continue;
    const candidate = (0, import_node_path12.join)(versionsDir, name, "bin");
    if (exists((0, import_node_path12.join)(candidate, "node"))) bin = candidate;
  }
  if (bin === null) return env;
  const current = env["PATH"] ?? "";
  return { ...env, PATH: current === "" ? bin : `${bin}${import_node_path12.delimiter}${current}` };
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
  return (0, import_node_fs17.existsSync)(p);
}
function defaultReadFile(p) {
  try {
    return (0, import_node_fs17.readFileSync)(p, "utf8");
  } catch {
    return null;
  }
}
function defaultListDir(p) {
  try {
    return (0, import_node_fs17.readdirSync)(p);
  } catch {
    return [];
  }
}

// src/hooks/verify-targets.ts
var import_node_fs18 = require("node:fs");
var import_node_path13 = require("node:path");
var VERIFY_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
var PACKAGE_MARKERS = ["package.json", "project.json"];
var SUMMARY_LINES = 80;
var PROBE_TIMEOUT_SECONDS = 15;
function hasVerifyExtension(file) {
  return VERIFY_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}
function findUpAny(start, names) {
  let dir = start;
  let previous = "";
  while (dir !== "/" && dir !== previous && dir !== "") {
    for (const name of names) {
      if ((0, import_node_fs18.existsSync)(`${dir}/${name}`)) return dir;
    }
    previous = dir;
    dir = parentOf2(dir);
  }
  return null;
}
function isDirectory4(path) {
  try {
    return (0, import_node_fs18.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function isFile4(path) {
  try {
    return (0, import_node_fs18.statSync)(path).isFile();
  } catch {
    return false;
  }
}
function verifyEnvironment(env, version = process.versions.node) {
  const onPath = majorOf2(version);
  const fixed = runnerEnv(env, onPath);
  if (fixed === env) return { env, nodeMajor: onPath };
  const prepended = (fixed["PATH"] ?? "").split(import_node_path13.delimiter)[0] ?? "";
  const found = /\/v(\d+)[^/]*\/bin$/.exec(prepended);
  const rescued = found === null ? Number.NaN : Number.parseInt(found[1] ?? "", 10);
  return { env: fixed, nodeMajor: Number.isNaN(rescued) ? onPath : rescued };
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
  const result = spawn(command, args, { cwd, env, encoding: "utf8", timeout: timeoutSeconds * 1e3 });
  const timedOut = errorCodeOf2(result.error) === "ETIMEDOUT" || result.signal === "SIGTERM";
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const code = typeof result.status === "number" ? result.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}
function failureBlock(target, subject, output) {
  return `--- ${target} failed (${subject}) ---
${output.replace(/\n+$/, "")}`;
}
function firstLines(text2, limit) {
  return text2.split("\n").slice(0, limit).join("\n");
}
function parentOf2(dir) {
  const cut = dir.lastIndexOf("/");
  if (cut === -1) return ".";
  const head = dir.slice(0, cut);
  return head === "" ? "/" : head;
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
  const files = changedFiles(env.transcriptPath);
  if (files.length === 0) return silent;
  const environment = verifyEnvironment(ctx.io.env, nodeVersion);
  const tooOld = classify2({ kind: "environment", nodeMajor: environment.nodeMajor });
  if (tooOld !== null && tooOld.situation === "infra") {
    return message(infraLine(tooOld.reason, targetsFor(ctx.io.env), `node ${environment.nodeMajor} cannot start the toolchain`));
  }
  const packages = packageDirs(files);
  if (packages.length === 0) return silent;
  const targets = targetsFor(ctx.io.env);
  const selection = runnerSelect(root);
  const missing = classify2({ kind: "runner", found: runnerFound(selection, environment.env, spawn, root) });
  if (missing !== null && missing.situation === "infra") {
    return message(infraLine(missing.reason, targets, `${runnerCommand(selection)} is not on PATH`));
  }
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const ladder = withSpan(sink, VERIFICATION_SPAN, () => {
    const result = runLadder(selection, packages, targets, environment.env, spawn, root);
    return { result, status: ladderStatus(result) };
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
  let text2;
  try {
    text2 = (0, import_node_fs19.readFileSync)(path, "utf8");
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
function packageDirs(files) {
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const owner = findUpAny((0, import_node_path14.dirname)(file), PACKAGE_MARKERS);
    if (owner !== null) dirs.add(owner);
  }
  return [...dirs].sort();
}
function runLadder(selection, packages, targets, env, spawn, root) {
  const failures = [];
  const timeouts = [];
  for (const packageDir of packages) {
    if (!isDirectory4(packageDir)) continue;
    const handle = runnerHandle(selection, packageDir);
    if (handle === null) continue;
    for (const target of targets) {
      if (!runnerHasTarget(selection, handle, target, void 0, spawn, root)) continue;
      const seconds = target === TEST_TARGET ? 180 : 90;
      const result = runnerRun(selection, handle, target, seconds, env, spawn, root);
      const verdict = classify2({ kind: "run", runner: selection.kind, target, code: result.code, output: result.output, timedOut: result.timedOut });
      if (verdict === null) continue;
      if (verdict.situation === "red") {
        failures.push({ target, handle, output: result.output });
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
var import_node_path15 = require("node:path");
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
  const start = (0, import_node_path15.dirname)(env.file);
  const packageDir = findUpAny(start, PACKAGE_MARKERS);
  if (packageDir === null) return silent;
  const root = findUpAny(start, WORKSPACE_MARKERS) ?? packageDir;
  const environment = verifyEnvironment(ctx.io.env);
  const selection = runnerSelect(root);
  const failures = [
    ...typecheck(selection, packageDir, root, environment.env, spawn),
    ...lint(selection, env.file, start, root, environment.env, spawn)
  ];
  if (failures.length === 0) return silent;
  return fail(firstLines(`
${failures.map((f) => failureBlock(f.target, f.subject, f.output)).join("\n")}`, SUMMARY_LINES));
}
function typecheck(selection, packageDir, root, env, spawn) {
  const handle = runnerHandle(selection, packageDir);
  if (handle === null) return [];
  if (!runnerHasTarget(selection, handle, TYPECHECK_TARGET, void 0, spawn, root)) return [];
  const result = runnerRun(selection, handle, TYPECHECK_TARGET, TYPECHECK_TIMEOUT_SECONDS, env, spawn, root);
  return redOf(selection, TYPECHECK_TARGET, handle, result);
}
function lint(selection, file, start, root, env, spawn) {
  for (const linter of LINTERS) {
    if (findUpAny(start, linter.configs) === null) continue;
    const exec = selection.exec.split(" ").filter((part) => part !== "");
    const command = exec[0] ?? "";
    if (command === "") return [];
    const rest = exec.slice(1);
    if (execRun(spawn, command, [...rest, linter.target, "--version"], root, env, PROBE_TIMEOUT_SECONDS).code !== 0) return [];
    const args = linter.target === "biome" ? [...rest, linter.target, "check", file] : [...rest, linter.target, file];
    const result = execRun(spawn, command, args, root, env, LINT_TIMEOUT_SECONDS);
    return redOf(selection, linter.target, file, result);
  }
  return [];
}
function redOf(selection, target, subject, result) {
  const verdict = classify2({ kind: "run", runner: selection.kind, target, code: result.code, output: result.output, timedOut: result.timedOut });
  if (verdict === null || verdict.situation !== "red") return [];
  return [{ target, subject, output: result.output }];
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
var import_node_fs20 = require("node:fs");
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
    if (!isFile5(`${root}/${sibling}`)) {
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
    isFile5(claudeMd) ? "  CLAUDE.md: created from templates/project-claude.md \u2014 fill in the Stack and Commands sections\n" : "  CLAUDE.md: skipped \u2014 the project root did not resolve to a directory inside itself\n"
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
  const marked = isFile5((0, import_node_path16.join)(project, "hooks", "layout-manifest.sh")) && isFile5((0, import_node_path16.join)(project, "hooks", "hooks.json")) && isFile5((0, import_node_path16.join)(project, "install.sh"));
  return marked || project === root || physical(project) === physical(root);
}
function hasMachineInstall(claudeMd) {
  let text2;
  try {
    text2 = (0, import_node_fs20.readFileSync)(claudeMd, "utf8");
  } catch {
    return false;
  }
  return text2.split("\n").some((line) => IMPORT_LINE.test(line));
}
function physical(path) {
  try {
    return (0, import_node_fs20.realpathSync)(path);
  } catch {
    return path;
  }
}
function lstatOk(path) {
  try {
    (0, import_node_fs20.lstatSync)(path);
    return true;
  } catch {
    return false;
  }
}
function isFile5(path) {
  try {
    return (0, import_node_fs20.statSync)(path).isFile();
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
var import_node_fs21 = require("node:fs");

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
  if ((0, import_node_fs21.existsSync)(templatePath)) {
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
  if (!(0, import_node_fs21.existsSync)(path)) return { ok: true, value: {} };
  let text2;
  try {
    text2 = (0, import_node_fs21.readFileSync)(path, "utf8");
  } catch {
    return { ok: false, message: `cannot read ${path}` };
  }
  if (text2.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text2) };
  } catch {
    return { ok: false, message: SETTINGS_NOT_OBJECT };
  }
}
function writeAtomically(io2, path, contents) {
  const temporary = `${path}.tmp`;
  try {
    (0, import_node_fs21.writeFileSync)(temporary, contents);
    (0, import_node_fs21.renameSync)(temporary, path);
  } catch (error) {
    discard(temporary);
    return fail3(io2, `cannot write ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return EXIT_OK2;
}
function discard(path) {
  try {
    (0, import_node_fs21.rmSync)(path, { force: true });
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
var import_node_fs22 = require("node:fs");
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
  const flag = bypassFlagPath(io2.env);
  switch (action) {
    case "on":
      try {
        (0, import_node_fs22.writeFileSync)(marker, "");
      } catch (e) {
        io2.err(`engineos: cannot create ${marker}: ${reason(e)}
`);
        return EXIT_FAILURE2;
      }
      io2.out("engineos: BYPASSED \u2014 routing, agent dispatch, and Stop gates are off for this session\n");
      return EXIT_OK3;
    case "off":
      try {
        (0, import_node_fs22.rmSync)(marker, { force: true });
      } catch (e) {
        io2.err(`engineos: cannot clear ${marker}: ${reason(e)}
`);
        return EXIT_FAILURE2;
      }
      if (io2.env["ENGINEOS_BYPASS"] === "1") {
        io2.err("engineos: repo marker cleared, but ENGINEOS_BYPASS=1 still bypasses everything \u2014 unset it to restore\n");
      } else if ((0, import_node_fs22.existsSync)(flag)) {
        io2.err(`engineos: repo marker cleared, but ${flag} still bypasses everything \u2014 delete it to restore
`);
      } else {
        io2.out("engineos: active \u2014 routing, agent dispatch, and Stop gates restored\n");
      }
      return EXIT_OK3;
    case "status":
      io2.out(`${statusLine(marker, flag, io2.env)}
`);
      return EXIT_OK3;
    default:
      io2.err(`${USAGE3}
`);
      return EXIT_USAGE2;
  }
}
function statusLine(marker, flag, env) {
  if (env["ENGINEOS_BYPASS"] === "1") return "bypassed (ENGINEOS_BYPASS=1)";
  if ((0, import_node_fs22.existsSync)(flag)) return `bypassed (${flag})`;
  return (0, import_node_fs22.existsSync)(marker) ? "bypassed (repo marker)" : "active";
}
function reason(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/gen/agent-commands.ts
var import_node_fs23 = require("node:fs");
var import_node_path17 = require("node:path");

// src/gen/frontmatter.ts
var LINE_SPACE = /^[ \t\r\v\f]*/;
function frontmatterValue(text2, field) {
  const prefix = `${field}:`;
  for (const line of text2.split("\n")) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).replace(LINE_SPACE, "");
  }
  return "";
}
var ALIAS = /Alias: [a-z0-9-]+/i;
function frontmatterAlias(text2) {
  const match = ALIAS.exec(dashRanges(text2));
  if (match === null) return "";
  return match[0].replace(/[Aa]lias: /, "");
}
function dashRanges(text2) {
  const kept = [];
  let inRange = false;
  for (const line of text2.split("\n")) {
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
  if (!isDirectory5(agentsDir)) {
    io2.err(`No agents dir at ${agentsDir}
`);
    return EXIT_FAILURE3;
  }
  (0, import_node_fs23.mkdirSync)(outDir, { recursive: true });
  const run10 = { outDir, expected: /* @__PURE__ */ new Set(), counts: { generated: 0, preserved: 0, removed: 0, keptOrphan: 0 }, io: io2 };
  for (const file of agentFiles(agentsDir)) {
    const text2 = readOrEmpty(file);
    const name = frontmatterValue(text2, "name");
    if (name === "") {
      io2.err(`skip (no name): ${file}
`);
      continue;
    }
    const alias = frontmatterAlias(text2);
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
  if ((0, import_node_fs23.existsSync)(out) && !isGenerated(out)) {
    run10.io.err(`preserved (customized): ${spec.invoke}.md
`);
    run10.counts.preserved += 1;
    return;
  }
  (0, import_node_fs23.writeFileSync)(out, commandBody(spec));
  run10.counts.generated += 1;
}
function prune(run10) {
  for (const file of markdownNames(run10.outDir)) {
    const base = file.slice(0, -".md".length);
    if (run10.expected.has(base)) continue;
    const out = (0, import_node_path17.join)(run10.outDir, file);
    if (isGenerated(out)) {
      (0, import_node_fs23.rmSync)(out, { force: true });
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
    return (0, import_node_fs23.readFileSync)(path, "utf8").includes(MARKER);
  } catch {
    return false;
  }
}
function agentFiles(agentsDir) {
  const names = markdownNames(agentsDir);
  if (names.length === 0) return [(0, import_node_path17.join)(agentsDir, "*.md")];
  return names.map((name) => (0, import_node_path17.join)(agentsDir, name));
}
function markdownNames(dir) {
  let names;
  try {
    names = (0, import_node_fs23.readdirSync)(dir);
  } catch {
    return [];
  }
  return names.filter((name) => !name.startsWith(".") && name.endsWith(".md")).sort(byCodeUnit);
}
function byCodeUnit(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function isDirectory5(path) {
  try {
    return (0, import_node_fs23.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function readOrEmpty(path) {
  try {
    return (0, import_node_fs23.readFileSync)(path, "utf8");
  } catch {
    return "";
  }
}

// src/gen/agent-registry.ts
var import_node_fs24 = require("node:fs");
var import_node_path18 = require("node:path");

// src/registry/capabilities.ts
var reader2 = strictReader("capabilities.json");
function loadCapabilities(root) {
  const document = reader2.requireRecord(loadRegistry(root, "capabilities.json"), "");
  return {
    version: reader2.requireString(document["version"], ".version"),
    model_tiers: reader2.requireStrings(document["model_tiers"], ".model_tiers"),
    // Every field of a row is load-bearing: a capability without its agent or
    // its tier cannot answer the question the registry exists to answer, so the
    // loader refuses the row rather than defaulting it (as models.ts does).
    capabilities: reader2.requireRows(document["capabilities"], ".capabilities").map((row, i) => ({
      id: reader2.requireString(row["id"], `.capabilities[${i}].id`),
      title: reader2.requireString(row["title"], `.capabilities[${i}].title`),
      agent: reader2.requireString(row["agent"], `.capabilities[${i}].agent`),
      model_tier: reader2.requireString(row["model_tier"], `.capabilities[${i}].model_tier`),
      risk_floor: reader2.requireString(row["risk_floor"], `.capabilities[${i}].risk_floor`)
    }))
  };
}

// src/gen/agent-registry.ts
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
  if (!isDirectory6(agentsDir)) return fail4(io2, `No agents dir at ${agentsDir}`);
  if (!(0, import_node_fs24.existsSync)(capsFile)) return fail4(io2, `No capabilities registry at ${capsFile}`);
  if (!(0, import_node_fs24.existsSync)(modelsFile)) return fail4(io2, `No models registry at ${modelsFile}`);
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
    (0, import_node_fs24.writeFileSync)(outFile, `${JSON.stringify(document, null, 2)}
`);
  } catch (error) {
    return fail4(io2, `cannot write ${outFile}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  io2.out(`Wrote ${document.agents.length} agents to ${outFile}
`);
  return EXIT_OK5;
}
function readAgentFiles(agentsDir) {
  return (0, import_node_fs24.readdirSync)(agentsDir).filter((entry) => entry.endsWith(".md")).sort().map((entry) => {
    const path = (0, import_node_path18.join)(agentsDir, entry);
    return { path, text: (0, import_node_fs24.readFileSync)(path, "utf8") };
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
function isDirectory6(path) {
  try {
    return (0, import_node_fs24.statSync)(path).isDirectory();
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

// src/cli.ts
var io = processIo();
var argv = process.argv.slice(2);
function isExecutable(path) {
  try {
    (0, import_node_fs25.accessSync)(path, import_node_fs25.constants.X_OK);
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
      const r = (0, import_node_child_process5.spawnSync)(outcome.bin, [__filename, ...argv], { stdio: "inherit", env: { ...process.env, ENGINEOS_REEXEC: "1" } });
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
  const newer = process.env["ENGINEOS_REEXEC"] === "1" ? null : findNewerNode(process.env, import_node_fs25.existsSync, import_node_fs25.readdirSync, isExecutable);
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
  gen: runGen
};
process.exit(dispatch(table, argv, io));
