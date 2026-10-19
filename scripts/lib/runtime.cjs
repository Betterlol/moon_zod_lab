const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '../..');
function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: ROOT, encoding: 'utf8', timeout: 300000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed (${result.status})\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout;
}
function runMoon(pkg, args = [], { target = process.env.MOON_TARGET || 'js' } = {}) {
  return command('moon', ['run', '--target', target, '--release', pkg, '--', ...args]);
}
function jsonOutput(output) {
  const line = output.split(/\r?\n/).filter(x => x.startsWith('JSON:')).at(-1);
  if (!line) throw new Error(`Missing JSON: result in MoonBit output:\n${output.slice(-2000)}`);
  return JSON.parse(line.slice(5));
}
function metadata() {
  const manifest = fs.readFileSync(path.join(ROOT, '.mooncakes/Betterlol/moon_zod/moon.mod'), 'utf8');
  const version = manifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) throw new Error('Cannot read the installed MoonZod version; run moon build.');
  return { timestamp: new Date().toISOString(), platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0]?.model, node: process.version, moon: command('moon', ['version']).trim(),
    dependencyMode: 'registry', moonZodVersion: version,
    target: process.env.MOON_TARGET || 'js', build: 'release' };
}
function writeReport(name, report) {
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  const dest = path.join(ROOT, 'reports', `${name}.json`);
  fs.writeFileSync(dest, JSON.stringify(report, null, 2) + '\n');
  return dest;
}
module.exports = { ROOT, command, runMoon, jsonOutput, metadata, writeReport };
