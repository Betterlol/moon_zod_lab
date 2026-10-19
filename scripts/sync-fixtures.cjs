// Explicit network operation. Tests only read the checked-in copy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./lib/runtime.cjs');
const directory = path.join(ROOT, 'fixtures/upstream');
const source = JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8'));

async function main() {
  if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error('Source must be pinned to a full commit SHA');
  const base = `https://raw.githubusercontent.com/json-schema-org/JSON-Schema-Test-Suite/${source.commit}/`;
  const entries = [...source.files.map(name => [`tests/${source.draft}/${name}`, `${source.draft}/${name}`]), ['LICENSE', 'LICENSE']];
  const manifest = {};
  for (const [remote, local] of entries) {
    const response = await fetch(base + remote);
    if (!response.ok) throw new Error(`${remote}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (local.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
    const destination = path.join(directory, local);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
    manifest[local] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(directory, 'sha256.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Refreshed ${entries.length} files at ${source.commit}; review adapter descriptions before committing.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
