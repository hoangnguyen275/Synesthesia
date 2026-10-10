const { test } = require('node:test');
const assert = require('node:assert/strict');
test('nostalgia validates older songs, deduplicates, and caches by place', async t => {
  const key = process.env.GEMINI_API_KEY;
  require('@google/genai');
  const sdkPath = require.resolve('@google/genai');
  const sdk = require.cache[sdkPath].exports;
  let calls = 0;
  require.cache[sdkPath].exports = { ...sdk, GoogleGenAI: class {
    models = { generateContent: async () => { calls++; return { text: JSON.stringify({ songs: [
      { title: 'Classic', artist: 'Artist', year: 1970, reason: 'Local connection' },
      { title: 'Classic', artist: 'Artist', year: 1970, reason: 'Duplicate' },
      { title: 'Future', artist: 'Artist', year: 2099, reason: 'Invalid' },
    ] }) }; } };
  } };
  delete require.cache[require.resolve('../services/nostalgia')];
  const { getNostalgia } = require('../services/nostalgia');
  t.after(() => { require.cache[sdkPath].exports = sdk; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(getNostalgia('United States'), { status: 503 });
  process.env.GEMINI_API_KEY = 'test';
  const result = await getNostalgia('United States', 'Detroit');
  assert.equal(result.songs.length, 1);
  assert.equal(result.songs[0].year, 1970);
  assert.equal(result.chartArea, 'Detroit');
  assert.equal(result.provider, 'LLM cultural suggestions');
  await getNostalgia('United States', 'Detroit');
  assert.equal(calls, 1);
  await getNostalgia('United States', 'Chicago');
  assert.equal(calls, 2);
});
