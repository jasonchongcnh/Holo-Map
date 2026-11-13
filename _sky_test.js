'use strict';
// Retain the original command while testing the current application.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const files = fs.readdirSync(path.join(__dirname, 'tests'))
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.join(__dirname, 'tests', name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
