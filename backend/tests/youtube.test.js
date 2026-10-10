const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

function service() {
  delete require.cache[require.resolve('../services/youtube')];
  return require('../services/youtube');
}
const result = { items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Official track', channelTitle: 'Artist channel' } },
  { id: { videoId: '<script>' }, snippet: {} }] };
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('YouTube integration', async (t) => {
  const realFetch = global.fetch;
  const key = process.env.YOUTUBE_API_KEY;
  const secret = process.env.JWT_ACCESS_SECRET;
  t.after(() => {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = key;
    if (secret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = secret;
  });
  await t.test('missing key returns setup instructions', async () => {
    delete process.env.YOUTUBE_API_KEY;
    await assert.rejects(service().searchVideos('Song', 'Artist'), { status: 503 });
  });
  process.env.YOUTUBE_API_KEY = 'test-key';
  await t.test('search requests embeddable videos and deduplicates concurrent searches', async () => {
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      const params = new URL(url).searchParams;
      assert.equal(params.get('videoEmbeddable'), 'true');
      assert.equal(params.get('videoSyndicated'), 'true');
      assert.equal(params.get('type'), 'video');
      assert.equal(params.get('q'), 'Artist Song official audio');
      return response(result);
    };
    const api = service();
    const [first, second] = await Promise.all([api.searchVideos('Song', 'Artist'), api.searchVideos('Song', 'Artist')]);
    assert.deepEqual(first, second);
    assert.equal(first.length, 1);
    assert.equal(first[0].videoId, 'abcdefghijk');
    await api.searchVideos('Song', 'Artist');
    assert.equal(calls, 1);
  });
  await t.test('quota and permission failures are actionable and not cached', async () => {
    global.fetch = async () => response({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403);
    const api = service();
    await assert.rejects(api.searchVideos('Song', 'Artist'), { status: 429 });
    global.fetch = async () => response({ error: { errors: [{ reason: 'accessNotConfigured' }] } }, 403);
    await assert.rejects(api.searchVideos('Song', 'Artist'), { status: 503 });
    global.fetch = async () => response(result);
    assert.equal((await api.searchVideos('Song', 'Artist')).length, 1);
  });
  await t.test('empty results are returned without fabricating a video', async () => {
    global.fetch = async () => response({ items: [] });
    assert.deepEqual(await service().searchVideos('Song', 'Artist'), []);
  });
  await t.test('HTML rejects injected IDs and preserves official video controls and referrer', () => {
    const api = service();
    assert.throws(() => api.playerHtml("';alert(1)//"), { status: 400 });
    const html = api.playerHtml('abcdefghijk');
    assert.match(html, /youtube\.com\/iframe_api/);
    assert.match(html, /controls:1/);
    assert.match(html, /strict-origin-when-cross-origin/);
    assert.ok(!html.includes('test-key'));
  });
  await t.test('search route requires login and validates song data; player shell is public', async () => {
    process.env.JWT_ACCESS_SECRET = 'youtube-test-secret';
    global.fetch = async () => response(result);
    service();
    delete require.cache[require.resolve('../routes/youtubeRoutes')];
    const app = express(); app.use('/api', require('../routes/youtubeRoutes'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/youtube`;
      const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, process.env.JWT_ACCESS_SECRET);
      const options = { headers: { Authorization: `Bearer ${token}` } };
      assert.equal((await realFetch(`${base}/search?title=Song&artist=Artist`)).status, 401);
      assert.equal((await realFetch(`${base}/search?title=Song`, options)).status, 400);
      const search = await realFetch(`${base}/search?title=Song&artist=Artist`, options);
      assert.equal(search.status, 200);
      assert.equal((await search.json()).videos[0].videoId, 'abcdefghijk');
      const player = await realFetch(`${base}/player/abcdefghijk`);
      assert.equal(player.status, 200);
      assert.equal(player.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.match(player.headers.get('content-type'), /text\/html/);
      assert.equal((await realFetch(`${base}/player/invalid`)).status, 400);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});
