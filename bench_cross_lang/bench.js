#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { metadata, writeReport } = require('../scripts/lib/runtime.cjs');
const zodBench = require('./validators/zod');
const moonZodBench = require('./validators/moon_zod');

function fixtures() {
  const valid = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data.json'), 'utf8'));
  const adversarial = {
    users: [
      { name: '', email: 'not-an-email', role: 'superuser', profile: { age: -5, tags: [] } },
      { id: 99, role: 123 },
    ],
    config: { version: '', debug: 1, maxRetries: 999 },
  };
  const redundant = structuredClone(valid);
  for (let i = 0; i < 105; i++) redundant[`h_field_${i}`] = `hallucinated_value_${i}`;
  return { valid, adversarial, redundant };
}

function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node bench_cross_lang/bench.js [--smoke]');
    console.log('Environment: SMOKE=1 enables smoke mode; MOON_TARGET=js|native|wasm selects the MoonBit target (default js).');
    console.log('All MoonBit runs use release builds. Writes reports/validation.json and emits JSON: report.');
    return;
  }
  for (const arg of process.argv.slice(2)) {
    if (arg !== '--smoke') throw new Error(`Unknown argument: ${arg}. Supported: --smoke; MOON_TARGET=js|native|wasm.`);
  }
  const smoke = process.argv.includes('--smoke') || process.env.SMOKE === '1';
  const target = process.env.MOON_TARGET || 'js';
  const data = fixtures();
  const config = { smoke, target, samples: smoke ? 2 : 10, iterations: smoke ? 200 : 10000 };
  const moonZod = moonZodBench.run(data, config);
  const zod = zodBench.run(data, config);
  const moonValid = moonZod.results.find(result => result.name === 'Valid Throughput (moon_zod)');
  const zodValid = zod.results.find(result => result.name === 'Valid Throughput (Zod)');
  const report = {
    benchmark: 'validation', schemaVersion: 1, metadata: { ...metadata(), target }, config,
    fixtures: { sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'), data },
    units: { latency: 'microseconds per operation', throughput: 'operations per second',
      derivedNanoseconds: 'mean microseconds multiplied by 1000; batch_size is not a divisor' },
    methodology: {
      measured: 'validation of predecoded data with prebuilt schemas; result-producing APIs on both libraries',
      excluded: ['compilation', 'process startup', 'schema construction', 'JSON decoding'],
      comparison: 'Zod safeParse and moon_zod parse return success/error results without throwing for invalid input',
      caveats: [
        'The handcrafted validator is an approximate performance baseline, not a semantic oracle.',
        'Matching fixture outcomes do not establish full semantic equivalence between the libraries.',
        'Zod uses fixed iterations; MoonBit uses calibrated batches and winsorized summaries.',
      ],
    },
    moonZod, zod,
    comparison: { case: 'Valid Throughput', moonZodOperationsPerSecond: moonValid.operationsPerSecond,
      zodOperationsPerSecond: zodValid.operationsPerSecond,
      moonZodToZodThroughputRatio: moonValid.operationsPerSecond / zodValid.operationsPerSecond },
  };
  const destination = writeReport('validation', report);
  for (const result of [...moonZod.results, ...zod.results]) {
    console.log(`${result.name}: ${result.nanosecondsPerOperation.toFixed(1)} ns/op; ${result.operationsPerSecond.toFixed(0)} ops/s`);
  }
  console.log(`Report: ${destination}`);
  console.log(`JSON:${JSON.stringify(report)}`);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { fixtures, main };
