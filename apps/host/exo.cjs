'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(os.homedir(), '.exo');
const configPath = path.join(root, 'config.json');

function ensureConfig() {
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, `${JSON.stringify({ version: 1, repositories: [] }, null, 2)}\n`, { mode: 0o600 });
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.version !== 1 || !Array.isArray(config.repositories)) throw new Error('Invalid Exo configuration. Back it up and repair ~/.exo/config.json.');
  return config;
}

function save(config) { fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 }); }
function gitRoot(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(`Directory does not exist: ${resolved}`);
  try { return execFileSync('git', ['-C', resolved, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { throw new Error(`Not a Git repository: ${resolved}`); }
}

function main(args) {
  const [command, ...rest] = args;
  if (command === 'init') {
    ensureConfig();
    console.log(`Exo configuration ready at ${configPath}`);
    return;
  }
  const config = ensureConfig();
  if (command === 'add') {
    const repoPath = gitRoot(rest[0] || '.');
    if (config.repositories.some((repo) => path.resolve(repo.path).toLowerCase() === repoPath.toLowerCase())) throw new Error('This repository is already registered.');
    const name = rest[1]?.trim() || path.basename(repoPath);
    const id = crypto.createHash('sha256').update(repoPath.toLowerCase()).digest('hex').slice(0, 16);
    config.repositories.push({ id, name, path: repoPath });
    save(config);
    console.log(`Added ${name} (${id})`);
    return;
  }
  if (command === 'list') {
    if (!config.repositories.length) { console.log('No repositories registered. Add one with: pnpm repo add <path>'); return; }
    for (const repo of config.repositories) console.log(`${repo.id}\t${repo.name}\t${repo.path}`);
    return;
  }
  if (command === 'remove') {
    const next = config.repositories.filter((repo) => repo.id !== rest[0]);
    if (next.length === config.repositories.length) throw new Error(`No repository found with id ${rest[0] || '(missing)'}.`);
    config.repositories = next; save(config); console.log(`Removed repository ${rest[0]}`); return;
  }
  throw new Error('Usage: pnpm repo init | add <git-path> [name] | list | remove <id>');
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(`Exo: ${error.message}`); process.exitCode = 1; }
