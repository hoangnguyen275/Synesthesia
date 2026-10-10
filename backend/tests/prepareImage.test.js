const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareImage } = require('../services/prepareImage');

test('accepts a camera-sized image at the 5 MB limit without overflowing the stack', () => {
  const image = Buffer.alloc(5 * 1024 * 1024, 255).toString('base64');
  assert.deepEqual(prepareImage(image), { inlineData: { mimeType: 'image/jpeg', data: image } });
  assert.equal(prepareImage('data:image/jpeg;base64,' + image).inlineData.data, image);
});

test('rejects images over the limit, including ones with the same encoded length', () => {
  for (const extra of [1, 2, 1024]) {
    const image = Buffer.alloc(5 * 1024 * 1024 + extra).toString('base64');
    assert.throws(() => prepareImage(image), /5 MB limit/);
  }
});

test('validates Base64 characters, length and padding', () => {
  for (const image of ['', 'AAA', 'A===', '=AAA', 'AA=A', 'AA\n=', '!!!!', 'AAAA====']) {
    assert.throws(() => prepareImage(image), /Base64/);
  }
  for (const image of ['AAAA', 'AAA=', 'AA==']) {
    assert.equal(prepareImage(image).inlineData.data, image);
  }
  assert.throws(() => prepareImage('AAAA', 'image/gif'), /Unsupported image type/);
});
