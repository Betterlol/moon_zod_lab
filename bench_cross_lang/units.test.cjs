const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSummaries, EXPECTED_LABELS } = require('./validators/moon_zod');
test('core/bench mean is microseconds/op regardless of calibrated batch size', () => {
  const raw = EXPECTED_LABELS.map(name => ({ name, mean: 2, batch_size: 100000, runs: 2 }));
  const results = normalizeSummaries(raw, 2);
  assert.equal(results[0].nanosecondsPerOperation, 2000);
  assert.equal(results[0].operationsPerSecond, 500000);
  assert.deepEqual(results[0].rawSummary, raw[0]);
  assert.equal(results[0].name, 'Valid Throughput (moon_zod)');
});
test('missing throughput labels and invalid measurements fail', () => {
  const raw = EXPECTED_LABELS.map(name => ({ name, mean: 2, batch_size: 10, runs: 2 }));
  raw[0].name = 'Valid Throughput';
  assert.throws(() => normalizeSummaries(raw, 2), /benchmark label/);
  raw[0].name = EXPECTED_LABELS[0];
  raw[0].mean = 0;
  assert.throws(() => normalizeSummaries(raw, 2), /Invalid MoonBit/);
});
