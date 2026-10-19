const test = require('node:test');
const assert = require('node:assert/strict');
const { command, jsonOutput } = require('./runtime.cjs');

test('machine result must exist and be valid JSON', () => {
  assert.throws(() => jsonOutput('WARNING: failed\n'), /Missing JSON/);
  assert.throws(() => jsonOutput('JSON:invalid'), SyntaxError);
  assert.deepEqual(jsonOutput('noise\r\nJSON:{"ok":true}\r\n'), { ok: true });
});
test('failed subprocess cannot be interpreted as a successful report', () => {
  assert.throws(() => command(process.execPath, ['-e', 'process.exit(7)']), /failed \(7\)/);
});
test('arguments are passed literally without shell expansion', () => {
  const value = 'quote" space $() ` ~ / \\';
  assert.equal(command(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value]), value);
});
