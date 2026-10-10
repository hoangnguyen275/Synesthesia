const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

function freshService() {
  delete require.cache[require.resolve('../services/localCharts')];
  return require('../services/localCharts');
}
const response = (data) => ({ ok: true, json: async () => data });
const tracks = (location) => ({ tracks: {
  '@attr': location ? { location } : { country: 'United States' },
  track: [{ name: 'Track A', artist: { name: 'Artist A' }, url: 'http://www.last.fm/music/Artist+A/_/Track+A' },
    { name: 'Track B', artist: { name: 'Artist B' }, url: 'https://evil.example/song' }],
} });

test('geographic chart integration', async (t) => {
  const originalFetch = global.fetch;
  const originalKey = process.env.LASTFM_API_KEY;
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = originalSecret;
  });

  await t.test('missing key returns configuration error without external calls', async () => {
    delete process.env.LASTFM_API_KEY;
    global.fetch = async () => { assert.fail('Should not request an external service'); };
    await assert.rejects(freshService().getLocalCharts('United States'), { status: 503 });
  });
  process.env.LASTFM_API_KEY = 'test-key';

  await t.test('confirmed metro preserves rankings and sanitizes song links', async () => {
    global.fetch = async (url) => {
      const params = new URL(url).searchParams;
      assert.equal(params.get('location'), 'New York');
      assert.equal(params.get('country'), 'United States');
      assert.equal(params.get('method'), 'geo.gettoptracks');
      return response(tracks('New York'));
    };
    const chart = await freshService().getLocalCharts('United States', 'New York');
    assert.equal(chart.scope, 'metro');
    assert.equal(chart.songs[0].rank, 1);
    assert.match(chart.songs[0].url, /^https:\/\/www\.last\.fm\//);
    assert.equal(chart.songs[1].url, null);
  });

  await t.test('ignored metro falls back to an explicitly labeled country chart and caches it', async () => {
    let calls = 0;
    global.fetch = async () => { calls += 1; return response(tracks()); };
    const service = freshService();
    const first = await service.getLocalCharts('United States', 'New York');
    const second = await service.getLocalCharts('United States', 'New York');
    assert.equal(first.scope, 'country');
    assert.equal(first.chartArea, 'United States');
    assert.match(first.scopeNote, /Country chart/);
    assert.deepEqual(second, first);
    assert.equal(calls, 2);
  });

  await t.test('unsupported metro falls back to country', async () => {
    global.fetch = async (url) => response(new URL(url).searchParams.has('location') ? { error: 6 } : tracks());
    assert.equal((await freshService().getLocalCharts('United States', 'Unknown City')).scope, 'country');
  });

  await t.test('invalid key is reported without falling back to fabricated music', async () => {
    global.fetch = async () => response({ error: 10 });
    await assert.rejects(freshService().getLocalCharts('United States', 'New York'), { status: 503 });
  });

  await t.test('upstream outage and malformed response return errors', async () => {
    global.fetch = async () => ({ ok: false });
    await assert.rejects(freshService().getLocalCharts('United States'), { status: 502 });
    global.fetch = async () => response({});
    await assert.rejects(freshService().getLocalCharts('United States'), { status: 502 });
  });

  await t.test('empty country chart is a real empty result', async () => {
    global.fetch = async () => response({ tracks: { track: [] } });
    assert.deepEqual((await freshService().getLocalCharts('United States')).songs, []);
  });

  await t.test('route authenticates, validates inputs, and returns chart data', async () => {
    process.env.JWT_ACCESS_SECRET = 'local-test-secret';
    global.fetch = async () => response(tracks());
    freshService();
    delete require.cache[require.resolve('../routes/chartRoutes')];
    const app = express();
    app.use('/api', require('../routes/chartRoutes'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/local-charts`;
      const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
      const options = { headers: { Authorization: `Bearer ${token}` } };
      assert.equal((await originalFetch(`${base}?countryCode=US`)).status, 401);
      for (const query of ['', '?countryCode=USA', '?countryCode=ZZ', '?countryCode=US&countryCode=VN', '?countryCode=US&city=' + 'x'.repeat(101)]) {
        assert.equal((await originalFetch(base + query, options)).status, 400);
      }
      const result = await originalFetch(`${base}?countryCode=us`, options);
      assert.equal(result.status, 200);
      const chart = await result.json();
      assert.equal(chart.countryCode, 'US');
      assert.equal(chart.scope, 'country');
      assert.equal(chart.songs.length, 2);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
