#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");

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
var import_node_path = require("node:path");
var MIN_NODE_MAJOR = 18;
function currentMajor(versions = process.versions.node) {
  return Number.parseInt(versions.split(".")[0] ?? "0", 10);
}
function parseVersion(dirName) {
  const parts = dirName.replace(/^v/, "").split(".");
  const major = Number.parseInt(parts[0] ?? "0", 10);
  const minor = Number.parseInt(parts[1] ?? "0", 10);
  const patch = Number.parseInt(parts[2] ?? "0", 10);
  return [major, minor, patch];
}
function findNewerNode(env, exists, listDir) {
  const nvmDir = env["NVM_DIR"] ?? (0, import_node_path.join)(env["HOME"] ?? "", ".nvm");
  const versionsDir = (0, import_node_path.join)(nvmDir, "versions", "node");
  if (exists(versionsDir)) {
    const candidates = listDir(versionsDir).filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR).sort((a, b) => {
      const av = parseVersion(a);
      const bv = parseVersion(b);
      return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
    });
    for (const v of candidates) {
      const bin = (0, import_node_path.join)(versionsDir, v, "bin", "node");
      if (exists(bin)) return bin;
    }
  }
  for (const bin of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (exists(bin)) return bin;
  }
  return null;
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

// src/cli.ts
var io = processIo();
var argv = process.argv.slice(2);
var SILENT_HOOKS = /* @__PURE__ */ new Set(["route-before-change", "mark-unrecorded", "record-verify", "prompt-advisor"]);
if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env["ENGINEOS_REEXEC"] === "1" ? null : findNewerNode(process.env, import_node_fs2.existsSync, import_node_fs2.readdirSync);
  if (newer !== null) {
    const r = (0, import_node_child_process.spawnSync)(newer, [__filename, ...argv], { stdio: "inherit", env: { ...process.env, ENGINEOS_REEXEC: "1" } });
    process.exit(r.status ?? 1);
  }
  if (argv[0] === "hook") {
    if (SILENT_HOOKS.has(argv[1] ?? "")) process.exit(0);
    writeJson(io, { systemMessage: `[engineos] ${argv[1] ?? "hook"} skipped: node >= ${MIN_NODE_MAJOR} required (found v${process.versions.node})` });
    process.exit(0);
  }
  writeJson(io, { error: `node >= ${MIN_NODE_MAJOR} required, found ${process.versions.node}` });
  process.exit(1);
}
var table = {};
process.exit(dispatch(table, argv, io));
