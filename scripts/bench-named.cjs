const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { z } = require('zod');
const Ajv2020 = require('ajv/dist/2020').default;
const { ROOT, command, runMoon, jsonOutput, metadata, writeReport } = require('./lib/runtime.cjs');

const SHAPES = ['independent', 'chain', 'tree', 'shared_dag'];
function dependencies(shape, i) {
  if (i === 0 || shape === 'independent') return [];
  if (shape === 'chain') return [i - 1];
  if (shape === 'tree') return [Math.floor((i - 1) / 2)];
  return [...new Set([0, Math.floor(i / 2)])];
}

function buildZod(shape, size) {
  const nodes = [], registry = z.registry();
  for (let i = 0; i < size; i++) {
    const fields = { value: z.string() };
    for (const dep of dependencies(shape, i)) fields[`dep${dep}`] = nodes[dep];
    const node = z.strictObject(fields);
    registry.add(node, { id: `Node${i}` });
    nodes.push(node);
  }
  return { root: z.strictObject(Object.fromEntries(nodes.map((node, i) => [`node${i}`, node]))), registry };
}

let retained;
function measure(callback, samples, warmup) {
  for (let i = 0; i < warmup; i++) retained = callback();
  let batchSize = 1;
  while (true) {
    const start = performance.now();
    for (let i = 0; i < batchSize; i++) retained = callback();
    if (performance.now() - start >= 50 || batchSize >= 1048576) break;
    batchSize *= 2;
  }
  const values = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let i = 0; i < batchSize; i++) retained = callback();
    values.push((performance.now() - start) * 1000 / batchSize);
  }
  const sorted = [...values].sort((a, b) => a - b);
  return { mean_us: values.reduce((a, b) => a + b, 0) / values.length,
    median_us: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
    min_us: sorted[0], max_us: sorted.at(-1), samples_us: values, batch_size: batchSize, runs: samples };
}

function verifySchema(schema, shape, size) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, inlineRefs: false });
  assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
  // Compilation also checks every emitted reference can be resolved.
  ajv.compile(schema);
  const names = Array.from({ length: size }, (_, i) => `Node${i}`);
  assert.deepEqual(Object.keys(schema.$defs).sort(), names.sort());
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.keys(schema.properties).length, size);
  for (let i = 0; i < size; i++) {
    assert.deepEqual(schema.properties[`node${i}`], { $ref: `#/$defs/Node${i}` });
    const node = schema.$defs[`Node${i}`];
    const fields = ['value', ...dependencies(shape, i).map(dep => `dep${dep}`)].sort();
    assert.equal(node.type, 'object');
    assert.equal(node.additionalProperties, false);
    assert.deepEqual(Object.keys(node.properties).sort(), fields);
    assert.deepEqual([...node.required].sort(), fields);
    assert.equal(node.properties.value.type, 'string');
    for (const dep of dependencies(shape, i)) {
      assert.deepEqual(node.properties[`dep${dep}`], { $ref: `#/$defs/Node${dep}` });
    }
  }
  assert.deepEqual([...schema.required].sort(), Array.from({ length: size }, (_, i) => `node${i}`).sort());
  return { meta_schema_valid: true, refs_resolved: true, graph_equivalent: true, definitions: size };
}

function options(args) {
  const opts = { sizes: [100, 200, 500], shapes: SHAPES, samples: 5, warmup: 2, skipPydantic: false, smoke: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--smoke') { opts.smoke = true; opts.sizes = [100]; opts.samples = 2; opts.warmup = 1; }
    else if (arg === '--skip-pydantic') opts.skipPydantic = true;
    else if (arg === '--sizes') opts.sizes = String(args[++i] || '').split(',').map(Number);
    else if (arg === '--shapes') opts.shapes = String(args[++i] || '').split(',');
    else if (arg === '--samples') opts.samples = Number(args[++i]);
    else if (arg === '--warmup') opts.warmup = Number(args[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.sizes.length || opts.sizes.some(x => !Number.isSafeInteger(x) || x < 1) ||
      !opts.shapes.length || opts.shapes.some(x => !SHAPES.includes(x)) ||
      !Number.isSafeInteger(opts.samples) || opts.samples < 2 || !Number.isSafeInteger(opts.warmup) || opts.warmup < 0) {
    throw new Error('Expected positive --sizes, known --shapes, --samples >= 2 and --warmup >= 0');
  }
  return opts;
}

function pythonProgram() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const local = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return fs.existsSync(local) ? local : 'python';
}

function summarize(item) {
  const schema = item.schema;
  const verification = verifySchema(schema, item.shape, item.size);
  const result = { ...item, verification, output_bytes: Buffer.byteLength(JSON.stringify(schema)) };
  delete result.schema;
  if (Array.isArray(result.timings)) {
    result.timings = Object.fromEntries(result.timings.map(summary => [summary.name, {
      ...summary, mean_us: summary.mean, median_us: summary.median,
      // Installed @bench already divides by batch size and uses microseconds.
      unit: 'microseconds_per_operation', normalization: 'mean unchanged; no batch-size division',
    }]));
  }
  return result;
}

function main() {
  const opts = options(process.argv.slice(2));
  const meta = metadata();
  const zodVersion = require('zod/package.json').version;
  assert.equal(Number(zodVersion.split('.')[0]), 4, 'Zod v4 required');
  let pydanticMeta = null;
  const results = [];
  for (const size of opts.sizes) for (const shape of opts.shapes) {
    console.log(`Named export: ${shape}, ${size} schemas`);
    const moon = jsonOutput(runMoon('cmd/named', [shape, String(size), String(opts.samples), String(opts.warmup)]));
    assert.equal(moon.named_count, size);
    assert.equal(moon.order_verified, true);
    results.push(summarize(moon));
    const fixture = buildZod(shape, size);
    for (const mode of ['input', 'output']) {
      const generate = () => z.toJSONSchema(fixture.root, {
        metadata: fixture.registry, target: 'draft-2020-12', io: mode, reused: 'ref',
      });
      const buildStats = measure(generate, opts.samples, opts.warmup);
      const schema = retained;
      const serializeStats = measure(() => JSON.stringify(schema), opts.samples, opts.warmup);
      results.push(summarize({ library: 'Zod', mode, shape, size, named_count: Object.keys(schema.$defs || {}).length,
        schema, timings: { json_schema_build: buildStats, json_serialize: serializeStats } }));
    }
    if (!opts.skipPydantic) {
      const python = JSON.parse(command(pythonProgram(), [path.join(ROOT, 'scripts/bench-pydantic.py'),
        '--shape', shape, '--size', String(size), '--samples', String(opts.samples), '--warmup', String(opts.warmup)]));
      pydanticMeta = { version: python.version, python: python.python, recursion_limit_policy: 'max(10000, size * 30)' };
      for (const result of python.results) results.push(summarize(result));
    }
  }
  const report = { suite: 'named-export', metadata: meta, libraries: { zod: zodVersion, pydantic: pydanticMeta },
    options: opts, units: 'microseconds per operation',
    methodology: { setup: 'All schema/model construction outside timed callbacks; results retained.',
      moonBench: '100 ms automatic calibration; winsorized @bench per-operation summaries.',
      otherBench: '50 ms automatic calibration; individual batch samples divided once by operation count.',
      comparison: 'Compare json_schema_build only across libraries. Serialization is separately timed.',
      modes: 'Zod input/output and Pydantic validation/serialization; strict objects and required string fields; no parsing/coercion benchmark.',
      graph: 'N named nodes; unnamed envelope references all N; synthetic MoonZod Root excluded with include_names.',
      annotations: 'Titles and $schema annotations differ; structural graph and refs verified identically.' }, results };
  const dest = writeReport(opts.smoke ? 'named-export-smoke' : 'named-export', report);
  console.log(`Verified ${results.length} exporter results. Report: ${dest}`);
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/bench-named.cjs [--smoke] [--sizes 100,200,500] [--shapes independent,chain,tree,shared_dag] [--samples 5] [--warmup 2] [--skip-pydantic]');
    console.log('Optional larger runs: --sizes 1000,2000. Python: PYTHON or local .venv, then python on PATH.');
  } else {
    try { main(); } catch (error) { console.error(`Named benchmark failed: ${error.message}`); process.exitCode = 1; }
  }
}
module.exports = { dependencies, buildZod, measure, verifySchema, options };
