"use strict";
// Entry point so that `node --test tests/` works: recent Node versions treat a bare
// directory argument as a module path, which resolves to this file. It simply runs every
// *.test.js in this folder in a fresh test-runner process (each suite in its own process,
// like `node --test tests/*.test.js`) and passes on the exit status.
// Running it directly (`node tests/index.js`) does the same.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(__dirname, f));

const env = Object.assign({}, process.env);
delete env.NODE_TEST_CONTEXT; // the nested run is a top-level runner of its own

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", env });
process.exit(result.status === null ? 1 : result.status);
