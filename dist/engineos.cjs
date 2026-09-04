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

// src/registry/strict.ts
function strictReader(file) {
  function malformed(what) {
    throw new KernelError(`registries/${file}: ${what}`);
  }
  function requireRecord3(value, path) {
    if (!isRecord(value)) malformed(`${path || "the document"} must be an object`);
    return value;
  }
  function requireString4(value, path) {
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
    return value.map((item, i) => requireString4(item, `${path}[${i}]`));
  }
  function requireRows4(value, path) {
    if (!Array.isArray(value)) malformed(`${path} must be an array of objects`);
    return value.map((item, i) => requireRecord3(item, `${path}[${i}]`));
  }
  function optionalString3(value, path) {
    if (value === void 0 || value === null) return null;
    return requireString4(value, path);
  }
  function optionalStrings2(value, path) {
    if (value === void 0 || value === null) return [];
    return requireStrings3(value, path);
  }
  return {
    malformed,
    requireRecord: requireRecord3,
    requireString: requireString4,
    requireNumber: requireNumber3,
    requireBoolean: requireBoolean2,
    requireStrings: requireStrings3,
    requireRows: requireRows4,
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
function fail(field, expected) {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}
function requireString2(value, field) {
  if (typeof value !== "string" || value === "") fail(field, "a non-empty string");
  return value;
}
function optionalString2(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string" || value === "") fail(field, "a non-empty string or null");
  return value;
}
function requireRows2(value, field) {
  const rows = Array.isArray(value) ? value : fail(field, "an array");
  return rows.map((row, index) => isRecord(row) ? row : fail(`${field}[${index}]`, "an object"));
}
function requireStringArray(value, field) {
  const items = Array.isArray(value) ? value : fail(field, "an array");
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
function asBoolean(value, message) {
  if (value === void 0) return false;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new KernelError(message);
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
  const attempt = facts.attempt;
  if (attempt === void 0 || !Number.isInteger(attempt) || attempt < 0) {
    throw new KernelError("repair (red ladder) requires a numeric --attempt");
  }
  const bound = repair.max_fix_attempts_per_check;
  if (attempt < bound) {
    return {
      check,
      action: "fix-same-tier",
      reason: "first red \u2014 fix and re-run the check at the same tier"
    };
  }
  if (attempt < bound + repair.escalations) {
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
function optionalRecord(value, message) {
  if (value === void 0 || value === null) return {};
  if (!isRecord(value)) throw new KernelError(message);
  return value;
}
function optionalArray(value, message) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message);
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
function routeByIntent(text, regs) {
  const lower = asciiDowncase2(text);
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
function routeEscalate(text, regs) {
  const router = regs.policy.router;
  const raw = routeByIntent(text, regs);
  const scale = scaleSection({ prompt: text }, regs);
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
  const reasons = router.reasons.filter((reason) => triggered[reason] === true);
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
function asciiDowncase2(text) {
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
function stringList(value, message) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message);
  const items = value;
  return items.map((item) => {
    if (typeof item !== "string") throw new KernelError(message);
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
function routeIntentSection(ctx, text) {
  const section = resolve({ prompt: text }, ctx).route;
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
  const attempt = flags.get("--attempt");
  if (attempt !== void 0) repair.attempt = parseCount(attempt);
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
