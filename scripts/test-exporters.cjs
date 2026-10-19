const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { ROOT, runMoon, jsonOutput, metadata, writeReport } = require('./lib/runtime.cjs');

function classify(expected, actual, known) {
  if (!known) return actual === expected ? 'PASS' : 'FAIL';
  assert.equal(typeof known.reason, 'string');
  assert.ok(known.reason.length > 20, 'Expected differences require a concrete reason');
  assert.notEqual(known.actual, expected, 'Expected differences must actually differ');
  if (actual === expected) return 'XPASS';
  return actual === known.actual ? 'XFAIL' : 'FAIL';
}

function expectedCompileFailure(error, known) {
  return Boolean(known && error.constructor.name === 'MissingRefError' &&
    error.missingRef === known.missingRef && new RegExp(known.pattern).test(error.message));
}

// Prove the harness rejects unknown regressions and surfaces stale expected failures.
function selfTest() {
  assert.equal(classify(true, false), 'FAIL');
  assert.equal(classify(false, true), 'FAIL');
  assert.equal(classify(true, true), 'PASS');
  const known = { actual: false, reason: 'A deliberately registered difference used only by this harness self-test.' };
  assert.equal(classify(true, false, known), 'XFAIL');
  assert.equal(classify(true, true, known), 'XPASS');
  assert.throws(() => classify(true, true, { actual: true, reason: known.reason }));
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema({ type: 'imaginary' }), false);
  assert.throws(() => ajv.compile({ $ref: '#/$defs/missing', $defs: {} }));
  assert.equal(ajv.compile({ type: 'integer' })(1.5), false);
  assert.equal(ajv.compile({ type: 'integer' })(2), true);
  const knownReference = { missingRef: '#/$defs/missing', pattern: "can't resolve reference" };
  const referenceError = new Error("can't resolve reference #/$defs/missing");
  assert.equal(expectedCompileFailure(referenceError, knownReference), false);
  try { ajv.compile({ $ref: '#/$defs/missing' }); } catch (error) {
    assert.equal(expectedCompileFailure(error, knownReference), true);
    assert.equal(expectedCompileFailure(error, { ...knownReference, missingRef: '#/$defs/other' }), false);
  }
  return 13;
}

const readJSON = name => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
function loadUpstream() {
  const source = readJSON('fixtures/upstream/source.json');
  const checksums = readJSON('fixtures/upstream/sha256.json');
  for (const [file, expected] of Object.entries(checksums)) {
    const bytes = fs.readFileSync(path.join(ROOT, 'fixtures/upstream', file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, `Fixture checksum: ${file}`);
  }
  const adapters = readJSON('fixtures/upstream/adapters.json');
  const cases = [], unsupported = [];
  for (const file of source.files) {
    assert.ok(checksums[`${source.draft}/${file}`], `Unverified fixture ${file}`);
    const groups = readJSON(`fixtures/upstream/${source.draft}/${file}`);
    for (const [index, group] of groups.entries()) {
      const description = adapters[file]?.[index];
      if (!description) {
        const reason = file === 'minimum.json' && index === 0
          ? 'Built-in number().min accepts Int, so the fractional minimum 1.1 has no faithful ordinary-factory adapter in this subset.'
          : ['ref.json', 'unevaluatedProperties.json', 'prefixItems.json'].includes(file)
          ? 'No direct faithful adapter: general references, evaluated-property tracking and variable-length prefix tuples are outside the selected factory adapter subset.'
          : 'No reviewed direct factory adapter for this group; it is excluded rather than counted as passing.';
        unsupported.push({ file, index, description: group.description, samples: group.tests.length, reason });
        continue;
      }
      assert.equal(group.description, description, `Pinned group moved: ${file}:${index}`);
      const id = `${file.replace('.json', '')}:${index}`;
      const samples = group.tests.map(test => {
        const sample = { data: test.data, valid: test.valid, description: test.description };
        if ((id === 'type:0' || id === 'type:7') && typeof test.data === 'number' && !Number.isInteger(test.data)) {
          sample.differences = { skeleton: { actual: true, reason: 'Skeleton omits the integer annotation and exports a number type.' } };
        }
        if (id === 'minimum:1' && typeof test.data === 'number' && test.data < -2) {
          sample.differences = { skeleton: { actual: true, reason: 'Skeleton intentionally omits the numeric minimum annotation.' } };
        }
        if (id.startsWith('minLength:') && typeof test.data === 'string' && [...test.data].length < 2) {
          sample.differences = { skeleton: { actual: true, reason: 'Skeleton intentionally omits the string minLength annotation.' } };
          if (test.data.length >= 2) {
            const reason = 'MoonZod string.min uses UTF-16 code-unit length; draft2020-12 and Ajv count Unicode code points, so a single supplementary character is too short only in the exported schema.';
            sample.runtimeDifference = { actual: true, reason };
            sample.outputDifferences = { full: { actual: false, reason }, named: { actual: false, reason } };
          }
        }
        return sample;
      });
      cases.push({ id, file, group: index, referenceSchema: group.schema, samples });
    }
  }
  return { source, cases, unsupported };
}

function execute(cases) {
  const results = [];
  let batch = [];
  function flush() {
    if (batch.length) results.push(...jsonOutput(runMoon('cmd/export-fixtures', [JSON.stringify(batch)])));
    batch = [];
  }
  for (const item of cases) {
    const request = { id: item.id, samples: item.samples.map(sample => sample.data) };
    if (JSON.stringify([...batch, request]).length > 14000) flush();
    batch.push(request);
  }
  flush();
  assert.equal(results.length, cases.length, 'Missing or surplus MoonBit results');
  assert.equal(new Set(results.map(result => result.id)).size, results.length, 'Duplicate MoonBit results');
  return new Map(results.map(result => [result.id, result]));
}

function inspectStructure(results) {
  const get = (id, mode = 'full') => results.get(id)[mode];
  assert.equal(get('string-bounds').minLength, 2);
  assert.equal(get('string-bounds').maxLength, 5);
  assert.equal(get('string-pattern').pattern, '^[a-z]+$');
  assert.equal(get('email').format, 'email');
  assert.equal(get('integer-bounds').type, 'integer');
  assert.equal(get('integer-bounds').minimum, 0);
  assert.equal(get('integer-bounds').maximum, 10);
  assert.equal(get('integer-bounds').multipleOf, 2);
  assert.equal(get('positive').exclusiveMinimum, 0);
  assert.equal(get('array-bounds').minItems, 1);
  assert.equal(get('array-bounds').maxItems, 3);
  const optional = get('optional-default');
  assert.deepEqual(optional.required, ['required']);
  assert.equal(optional.properties.default.default, 7);
  assert.ok(optional.properties.optional.anyOf.some(branch => branch.type === 'null'));
  const tuple = get('tuple');
  assert.equal(tuple.prefixItems.length, 2);
  assert.equal(tuple.minItems, 2);
  assert.equal(tuple.maxItems, 2);
  assert.equal(get('strict').additionalProperties, false);
  assert.equal(get('strip').additionalProperties, false);
  assert.equal(get('passthrough').additionalProperties, true);
  const named = get('named-shared', 'named');
  assert.equal(named.$ref, '#/$defs/Person');
  assert.deepEqual(Object.keys(named.$defs).sort(), ['Address', 'Leaf', 'Person']);
  assert.equal(named.$defs.Person.properties.home.$ref, '#/$defs/Address');
  assert.equal(named.$defs.Person.properties.work.$ref, '#/$defs/Address');
  assert.equal(named.$defs.Address.properties.city.$ref, '#/$defs/Leaf');
  const filtered = get('named-shared', 'filtered');
  assert.deepEqual(Object.keys(filtered.$defs), ['Address']);
  assert.equal(filtered.properties.home.$ref, '#/$defs/Address');
  assert.equal(filtered.$defs.Address.properties.city.type, 'string');
  assert.equal(filtered.$defs.Address.properties.city.minLength, 2);
  const intersection = get('object-intersection');
  assert.equal(intersection.type, 'object');
  assert.deepEqual(intersection.required.slice().sort(), ['a', 'b']);
  assert.deepEqual(Object.keys(intersection.properties).sort(), ['a', 'b']);
  assert.equal(intersection.additionalProperties, false);
  assert.equal(get('string-bounds', 'skeleton').minLength, undefined);
  return 34;
}

function main() {
  const harnessChecks = selfTest();
  if (process.argv.includes('--self-test')) {
    console.log(`Harness false-pass checks: ${harnessChecks} passed.`);
    return;
  }
  const upstream = loadUpstream();
  const official = readJSON('fixtures/official-example.json');
  const cases = [...require('../fixtures/export-cases.cjs'), official, ...upstream.cases];
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length, 'Duplicate input case IDs');
  const results = execute(cases);
  const structureChecks = inspectStructure(results);
  // No default insertion, stripping, coercion or remote schema loading: independent input verdicts.
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  const checks = [];
  function verdict(label, expected, actual, known, detail = {}) {
    checks.push({ label, status: classify(expected, actual, known), expected, actual, ...detail, ...(known ? { reason: known.reason } : {}) });
  }
  for (const item of cases) {
    const result = results.get(item.id);
    assert.ok(result, `Missing result ${item.id}`);
    assert.equal(result.verdicts.length, item.samples.length, `Missing samples ${item.id}`);
    for (const [index, sample] of item.samples.entries()) {
      const runtime = result.verdicts[index];
      verdict(`${item.id}/${index}/runtime`, sample.valid, runtime.runtime, sample.runtimeDifference);
      if (Object.hasOwn(sample, 'output')) {
        assert.equal(runtime.runtime, true, `Expected output from ${item.id}/${index}`);
        const equal = isDeepStrictEqual(runtime.output, sample.output);
        if (sample.outputDifference && !equal) {
          assert.deepEqual(runtime.output, sample.outputDifference.actual, `Unrecognized output difference ${item.id}/${index}`);
        }
        verdict(`${item.id}/${index}/runtime-output`, true, equal,
          sample.outputDifference ? { actual: false, reason: sample.outputDifference.reason } : undefined,
          { expectedOutput: sample.output, actualOutput: runtime.output });
      }
    }
    if (item.referenceSchema) {
      assert.equal(ajv.validateSchema(item.referenceSchema), true, `Invalid reference schema ${item.id}`);
      const reference = ajv.compile(item.referenceSchema);
      for (const [index, sample] of item.samples.entries()) {
        verdict(`${item.id}/${index}/upstream-reference`, sample.valid, reference(structuredClone(sample.data)));
      }
    }
    const modes = ['full', 'named', 'skeleton', ...(result.filtered ? ['filtered'] : [])];
    for (const mode of modes) {
      const schema = result[mode];
      assert.equal(ajv.validateSchema(schema), true, `Invalid ${item.id}/${mode}: ${JSON.stringify(ajv.errors)}`);
      checks.push({ label: `${item.id}/${mode}/meta-schema`, status: 'PASS' });
      let validate;
      try { validate = ajv.compile(schema); } catch (error) {
        const known = item.compileDifference?.[mode];
        if (!expectedCompileFailure(error, known)) throw error;
        checks.push({ label: `${item.id}/${mode}/compile`, status: 'XFAIL', reason: known.reason, error: error.message });
        checks.push({ label: `${item.id}/${mode}/samples`, status: 'BLOCKED', samples: item.samples.length, reason: 'Named-reference compile failure recorded above prevents sample evaluation.' });
        continue;
      }
      if (item.compileDifference?.[mode]) {
        checks.push({ label: `${item.id}/${mode}/compile`, status: 'XPASS', reason: item.compileDifference[mode].reason });
      } else {
        checks.push({ label: `${item.id}/${mode}/compile`, status: 'PASS' });
      }
      for (const [index, sample] of item.samples.entries()) {
        const actual = validate(structuredClone(sample.data));
        const known = sample.differences?.[mode];
        verdict(`${item.id}/${index}/${mode}/input`, sample.valid, actual, known, actual ? {} : { errors: structuredClone(validate.errors) });
        if (result.verdicts[index].runtime) {
          const actualOutput = validate(structuredClone(result.verdicts[index].output));
          verdict(`${item.id}/${index}/${mode}/parsed-output`, true, actualOutput, sample.outputDifferences?.[mode]);
        }
      }
    }
  }
  const summary = Object.fromEntries(['PASS', 'XFAIL', 'XPASS', 'FAIL', 'BLOCKED'].map(status => [status, checks.filter(check => check.status === status).length]));
  const report = {
    kind: 'exporter-functional-validation', metadata: metadata(),
    independentValidator: { name: 'Ajv2020', version: require('ajv/package.json').version, draft: '2020-12', formats: require('ajv-formats/package.json').version },
    harnessChecks, structureChecks, cases: cases.length, samples: cases.reduce((n, item) => n + item.samples.length, 0),
    summary, officialExample: official.provenance,
    upstream: { ...upstream.source, supportedGroups: upstream.cases.length, supportedSamples: upstream.cases.reduce((n, item) => n + item.samples.length, 0), unsupportedGroups: upstream.unsupported.length, unsupportedSamples: upstream.unsupported.reduce((n, item) => n + item.samples, 0), unsupported: upstream.unsupported },
    checks,
  };
  const destination = writeReport('exporters', report);
  console.log(`Exporters: ${cases.length} cases, ${report.samples} samples; ${summary.PASS} PASS, ${summary.XFAIL} expected differences, ${summary.FAIL} FAIL, ${summary.XPASS} XPASS.`);
  console.log(`Upstream: ${report.upstream.supportedGroups} directly adapted groups (${report.upstream.supportedSamples} samples); ${report.upstream.unsupportedGroups} excluded groups (${report.upstream.unsupportedSamples} samples).`);
  console.log(`Report: ${destination}`);
  const failures = checks.filter(check => ['FAIL', 'XPASS'].includes(check.status));
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { classify, selfTest, expectedCompileFailure };
