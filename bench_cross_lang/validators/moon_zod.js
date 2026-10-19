const { runMoon, jsonOutput } = require('../../scripts/lib/runtime.cjs');
const EXPECTED_LABELS = [
  'Valid Throughput (moon_zod)', 'Adversarial (moon_zod)',
  'Extreme Redundancy (moon_zod)', 'Valid Throughput (handcrafted approximate)',
];

function normalizeSummaries(rawSummaries, expectedRuns) {
  if (!Array.isArray(rawSummaries) || rawSummaries.length !== EXPECTED_LABELS.length) {
    throw new Error('MoonBit did not return all validation benchmark summaries');
  }
  return EXPECTED_LABELS.map(name => {
    const matches = rawSummaries.filter(summary => summary.name === name);
    if (matches.length !== 1) throw new Error(`Missing or duplicate benchmark label: ${name}`);
    const rawSummary = matches[0];
    if (!Number.isFinite(rawSummary.mean) || rawSummary.mean <= 0 ||
        !Number.isInteger(rawSummary.batch_size) || rawSummary.batch_size < 1 || rawSummary.runs !== expectedRuns) {
      throw new Error(`Invalid MoonBit benchmark summary: ${name}`);
    }
    // core/bench divides elapsed microseconds by batch_size before Summary::new.
    const mean = rawSummary.mean;
    return { name, api: name.includes('handcrafted') ? 'Bool (approximate baseline)' : 'parse (Ok/Err result)',
      meanMicrosecondsPerOperation: mean, nanosecondsPerOperation: mean * 1000,
      operationsPerSecond: 1e6 / mean, rawSummary };
  });
}

function run(fixtures, { smoke, target }) {
  const args = [JSON.stringify(fixtures)];
  if (smoke) args.push('--smoke');
  const rawSummaries = jsonOutput(runMoon('cmd/validation', args, { target }));
  return { target, build: 'release', samples: smoke ? 2 : 10,
    summaryTimeUnit: 'microseconds per operation',
    rawSummaryUnits: {
      latencyFields: 'sum, min, max, mean, median, std_dev, median_abs_dev, quartiles, iqr: microseconds per operation',
      variance: '(microseconds per operation) squared',
      percentageFields: 'std_dev_pct, median_abs_dev_pct: percent',
      countFields: 'batch_size: operations per calibrated batch; runs: measured samples',
    },
    sampling: 'core/bench auto-calibrated batches; samples sorted and winsorized at 5%',
    results: normalizeSummaries(rawSummaries, smoke ? 2 : 10) };
}
module.exports = { run, normalizeSummaries, EXPECTED_LABELS };
