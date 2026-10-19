const { performance } = require('node:perf_hooks');
// Missing dependencies fail. Install the pinned dependencies at the lab root.
const { z } = require('zod');
const installedVersion = require('zod/package.json').version;
const expectedVersion = require('../../package.json').dependencies.zod;
if (installedVersion !== expectedVersion) {
  throw new Error(`Expected pinned Zod ${expectedVersion}; found ${installedVersion}. Run npm ci at the lab root.`);
}

function buildZodSchema() {
  return z.object({
    users: z.array(z.object({
      id: z.number().int().min(0), name: z.string().min(1).max(100),
      email: z.string().email().optional(), role: z.enum(['admin', 'user', 'viewer']),
      profile: z.object({
        age: z.number().int().min(0).max(150), tags: z.array(z.string().min(1)),
        metadata: z.object({
          department: z.string().min(1), level: z.number().int().min(1).max(10), active: z.boolean(),
        }).optional(),
      }),
    })),
    config: z.object({ version: z.string().min(1), debug: z.boolean(), maxRetries: z.number().int().min(0).max(10) }),
  });
}

function run(fixtures, { iterations, samples, warmup = 100 }) {
  const schema = buildZodSchema();
  const cases = [
    ['Valid Throughput (Zod)', fixtures.valid, true],
    ['Adversarial (Zod)', fixtures.adversarial, false],
    ['Extreme Redundancy (Zod)', fixtures.redundant, true],
  ];
  let consumed = 0;
  const results = cases.map(([name, data, expectedSuccess]) => {
    const preflight = schema.safeParse(data);
    if (preflight.success !== expectedSuccess) throw new Error(`Unexpected Zod validation outcome: ${name}`);
    if (name.startsWith('Extreme Redundancy') && Object.keys(preflight.data).sort().join(',') !== 'config,users') {
      throw new Error('Zod failed to strip undeclared root fields');
    }
    for (let i = 0; i < warmup; i++) consumed += Number(schema.safeParse(data).success);
    const rawSamples = [];
    for (let sample = 0; sample < samples; sample++) {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) consumed += Number(schema.safeParse(data).success);
      const elapsedMs = performance.now() - start;
      rawSamples.push({ elapsedMs, iterations, microsecondsPerOperation: elapsedMs * 1000 / iterations });
    }
    const mean = rawSamples.reduce((sum, sample) => sum + sample.microsecondsPerOperation, 0) / samples;
    if (!Number.isFinite(mean) || mean <= 0) throw new Error(`Invalid timing for ${name}`);
    return { name, api: 'safeParse (success/error result)', meanMicrosecondsPerOperation: mean,
      nanosecondsPerOperation: mean * 1000, operationsPerSecond: 1e6 / mean, rawSamples };
  });
  if (consumed !== 2 * (samples * iterations + warmup)) throw new Error('Unexpected Zod outcomes during timed validation');
  return { version: installedVersion, warmup, iterationsPerSample: iterations, samples, consumed, results };
}

module.exports = { run, buildZodSchema };
