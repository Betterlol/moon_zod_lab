const ALL = ['full', 'named', 'skeleton'];
const constrained = reason => ({ skeleton: { actual: true, reason } });
const differences = (actual, reason, modes = ALL) => Object.fromEntries(modes.map(mode => [mode, { actual, reason }]));
const sample = (data, valid, extras = {}) => ({ data, valid, ...extras });
const weakened = 'Skeleton intentionally omits rule annotations and therefore accepts this constraint violation.';
const strip = 'Strip accepts and removes unknown input properties; exported additionalProperties:false rejects that input.';
const ignored = 'Custom refinement functions have no JSON Schema representation and are omitted by the exporter.';

module.exports = [
  { id: 'string-bounds', samples: [sample('ab', true), sample('abcde', true), sample('a', false, { differences: constrained(weakened) }), sample('abcdef', false, { differences: constrained(weakened) }), sample(4, false)] },
  { id: 'string-pattern', samples: [sample('abc', true), sample('ABC', false, { differences: constrained(weakened) }), sample('x2', false, { differences: constrained(weakened) }), sample(null, false)] },
  { id: 'email', samples: [sample('ada@example.com', true), sample('bad', false, { differences: constrained(weakened) }), sample(5, false)] },
  { id: 'integer-bounds', samples: [sample(0, true), sample(10, true), sample(-2, false, { differences: constrained(weakened) }), sample(12, false, { differences: constrained(weakened) }), sample(3, false, { differences: constrained(weakened) }), sample(2.5, false, { differences: constrained(weakened) }), sample('2', false)] },
  { id: 'positive', samples: [sample(1, true), sample(0, false, { differences: constrained(weakened) }), sample(-1, false, { differences: constrained(weakened) })] },
  { id: 'array-bounds', samples: [sample([1], true), sample([1, 2, 3], true), sample([], false, { differences: constrained(weakened) }), sample([1, 2, 3, 4], false, { differences: constrained(weakened) }), sample([1.5], false, { differences: constrained(weakened) }), sample(['x'], false), sample({}, false)] },
  { id: 'optional-default', samples: [
    sample({ required: 'x' }, true, { output: { required: 'x' } }),
    sample({ required: 'x', optional: null, default: null }, true, {
      output: { required: 'x', optional: null, default: 7 },
      outputDifference: { actual: { required: 'x', optional: null, default: null }, reason: 'Object parser shortcuts optional null fields and leaves a nested default null unchanged; root default parsing substitutes the default.' },
    }),
    sample({ required: 'x', optional: 'ab', default: 2 }, true),
    sample({}, false),
    sample({ required: 'x', optional: 'a' }, false, { differences: constrained(weakened) }),
    sample({ required: 'x', default: -1 }, false, { differences: constrained(weakened) }),
    sample({ required: 'x', extra: true }, false),
  ] },
  { id: 'root-default', samples: [sample(null, true, { output: 7 }), sample(0, true), sample(-1, false, { differences: constrained(weakened) }), sample('7', false)] },
  { id: 'tuple', samples: [sample(['x', 2], true), sample([], false), sample(['x'], false), sample(['x', 2, 3], false), sample([1, 'x'], false), sample(['x', 1.5], false, { differences: constrained(weakened) })] },
  { id: 'strict', samples: [sample({ x: 1 }, true), sample({ x: 1, extra: 2 }, false), sample({}, false), sample({ x: 'x' }, false)] },
  { id: 'strip', samples: [sample({ x: 1 }, true), sample({ x: 1, extra: 2 }, true, { output: { x: 1 }, differences: differences(false, strip) }), sample({}, false)] },
  { id: 'passthrough', samples: [sample({ x: 1 }, true), sample({ x: 1, extra: 2 }, true, { output: { x: 1, extra: 2 } }), sample({}, false)] },
  { id: 'named-shared', samples: [
    sample({ home: { city: 'AB' }, work: { city: 'CD' } }, true),
    sample({ home: { city: 'A' }, work: { city: 'CD' } }, false, { differences: constrained(weakened) }),
    sample({ home: { city: 'AB' } }, false),
    sample({ home: { city: 'AB' }, work: { city: 3 } }, false),
  ] },
  { id: 'named-slash', compileDifference: { named: { missingRef: '#/$defs/Leaf/name', pattern: "can't resolve reference #/\\$defs/Leaf/name", reason: 'Named exporter fails to JSON Pointer escape / as ~1 in definition references.' } }, samples: [sample({ x: 'ok' }, true), sample({ x: 2 }, false)] },
  { id: 'named-tilde', compileDifference: { named: { missingRef: '#/$defs/Leaf~1name', pattern: "can't resolve reference #/\\$defs/Leaf~1name", reason: 'Named exporter fails to JSON Pointer escape ~ as ~0; ~1 is decoded as /.' } }, samples: [sample({ x: 'ok' }, true), sample({ x: 2 }, false)] },
  { id: 'object-intersection', samples: [sample({ a: 'ab', b: 2 }, true), sample({ a: 'a', b: 2 }, false, { differences: constrained(weakened) }), sample({ a: 'ab' }, false), sample({ a: 'ab', b: '2' }, false)] },
  { id: 'strict-intersection', samples: [sample({ a: 'ab', b: 2 }, false, { differences: differences(true, 'Runtime validates strict members separately and rejects the other member\'s key; exporter merges object properties into one strict schema.') }), sample({ a: 'ab' }, false)] },
  { id: 'refinement', samples: [sample(2, true), sample(3, false, { differences: differences(true, ignored) }), sample('3', false)] },
  { id: 'custom-transform', samples: [
    sample('ok', true, { output: 42, outputDifferences: differences(false, 'Transforms export their input type; the transformed numeric output does not satisfy the exported string schema.') }),
    sample('reject', false, { differences: differences(true, 'A transform can reject a valid inner input, but its function cannot be represented in JSON Schema.') }),
    sample(4, false),
  ] },
  { id: 'preprocess', samples: [sample(42, true), sample('42', true, { output: 42, differences: differences(false, 'Preprocess converts string input to a number; exported schema describes the inner numeric type only.') }), sample('bad', false)] },
];
