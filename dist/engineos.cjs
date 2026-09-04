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

// src/registry/models.ts
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
function fail(field, expected) {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}
function requireString(value, field) {
  if (typeof value !== "string" || value === "") fail(field, "a non-empty string");
  return value;
}
function optionalString(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string" || value === "") fail(field, "a non-empty string or null");
  return value;
}
function requireRows(value, field) {
  const rows = Array.isArray(value) ? value : fail(field, "an array");
  return rows.map((row, index) => isRecord(row) ? row : fail(`${field}[${index}]`, "an object"));
}
function requireStringArray(value, field) {
  const items = Array.isArray(value) ? value : fail(field, "an array");
  return items.map((item, index) => requireString(item, `${field}[${index}]`));
}

// src/registry/policy.ts
function loadPolicy(root) {
  const raw = loadRegistry(root, "policy.json");
  const p = requireRecord(raw, "");
  const risk = requireRecord(p["risk"], ".risk");
  const repair = requireRecord(p["repair"], ".repair");
  const autonomy = requireRecord(p["autonomy"], ".autonomy");
  const retry = requireRecord(p["retry"], ".retry");
  const gates = requireRecord(p["gates"], ".gates");
  const specThreshold = requireRecord(gates["spec_threshold"], ".gates.spec_threshold");
  const parallelism = requireRecord(p["parallelism"], ".parallelism");
  const backpressure = requireRecord(parallelism["backpressure"], ".parallelism.backpressure");
  const breaker = requireRecord(p["breaker"], ".breaker");
  const hitl = requireRecord(p["hitl"], ".hitl");
  return {
    version: requireString2(p["version"], ".version"),
    risk: {
      aggregation: requireString2(risk["aggregation"], ".risk.aggregation"),
      inputs: requireRows2(risk["inputs"], ".risk.inputs").map((row, i) => ({
        id: requireString2(row["id"], `.risk.inputs[${i}].id`)
      })),
      high_floors: requireStrings(risk["high_floors"], ".risk.high_floors")
    },
    repair: {
      checks: requireStrings(repair["checks"], ".repair.checks"),
      max_fix_attempts_per_check: requireNumber(
        repair["max_fix_attempts_per_check"],
        ".repair.max_fix_attempts_per_check"
      ),
      escalations: requireNumber(repair["escalations"], ".repair.escalations"),
      by_situation: requireRows2(repair["by_situation"], ".repair.by_situation").map((row, i) => ({
        situation: requireString2(row["situation"], `.repair.by_situation[${i}].situation`),
        response: requireString2(row["response"], `.repair.by_situation[${i}].response`)
      })),
      never_repair: requireStrings(repair["never_repair"], ".repair.never_repair")
    },
    autonomy: {
      levels: requireRows2(autonomy["levels"], ".autonomy.levels").map((row, i) => ({
        id: requireString2(row["id"], `.autonomy.levels[${i}].id`)
      })),
      ceiling_by_risk: requireTierMap(
        autonomy["ceiling_by_risk"],
        ".autonomy.ceiling_by_risk",
        requireString2
      ),
      high_with_thin_evidence: requireString2(
        autonomy["high_with_thin_evidence"],
        ".autonomy.high_with_thin_evidence"
      )
    },
    retry: {
      never_retry: requireStrings(retry["never_retry"], ".retry.never_retry")
    },
    gates: {
      by_risk: requireTierMap(gates["by_risk"], ".gates.by_risk", requireStringMap),
      spec_threshold: {
        files_greater_than: requireNumber(
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
      wave_concurrency_cap: requireNumber(
        parallelism["wave_concurrency_cap"],
        ".parallelism.wave_concurrency_cap"
      ),
      backpressure: {
        max_queued_units: requireNumber(
          backpressure["max_queued_units"],
          ".parallelism.backpressure.max_queued_units"
        ),
        overload_action: requireString2(
          backpressure["overload_action"],
          ".parallelism.backpressure.overload_action"
        ),
        actions: requireStrings(backpressure["actions"], ".parallelism.backpressure.actions")
      }
    },
    breaker: {
      failure_threshold: requireNumber(breaker["failure_threshold"], ".breaker.failure_threshold"),
      cooldown_waves: requireNumber(breaker["cooldown_waves"], ".breaker.cooldown_waves"),
      half_open_probes: requireNumber(breaker["half_open_probes"], ".breaker.half_open_probes"),
      states: requireStrings(breaker["states"], ".breaker.states"),
      scopes: requireStrings(breaker["scopes"], ".breaker.scopes")
    },
    hitl: {
      reasons: requireStrings(hitl["reasons"], ".hitl.reasons"),
      situations: requireStrings(hitl["situations"], ".hitl.situations"),
      record_home: requireString2(hitl["record_home"], ".hitl.record_home")
    }
  };
}
function malformed(what) {
  throw new KernelError(`registries/policy.json: ${what}`);
}
function requireRecord(value, path) {
  if (!isRecord(value)) malformed(`${path || "the document"} must be an object`);
  return value;
}
function requireString2(value, path) {
  if (typeof value !== "string") malformed(`${path} must be a string`);
  return value;
}
function requireNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) malformed(`${path} must be a number`);
  return value;
}
function requireBoolean(value, path) {
  if (typeof value !== "boolean") malformed(`${path} must be a boolean`);
  return value;
}
function requireStrings(value, path) {
  if (!Array.isArray(value)) malformed(`${path} must be an array of strings`);
  return value.map((item, i) => requireString2(item, `${path}[${i}]`));
}
function requireRows2(value, path) {
  if (!Array.isArray(value)) malformed(`${path} must be an array of objects`);
  return value.map((item, i) => requireRecord(item, `${path}[${i}]`));
}
function requireStringMap(value, path) {
  const row = requireRecord(value, path);
  const out = {};
  for (const [key, item] of Object.entries(row)) out[key] = requireString2(item, `${path}.${key}`);
  return out;
}
function requireTierMap(value, path, item) {
  const row = requireRecord(value, path);
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
    const malformed2 = `waves --units[${i}] must be an object with a non-empty string id`;
    if (!isRecord(raw)) throw new KernelError(malformed2);
    const id = raw["id"];
    if (typeof id !== "string" || id === "") throw new KernelError(malformed2);
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
  waves: wavesProjection
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
