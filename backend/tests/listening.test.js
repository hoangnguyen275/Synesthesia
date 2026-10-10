const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Preferences = require('../models/UserPreference');
const { timeMood, weatherMood, makeSearches } = require('../services/listening');
test('listening searches incorporate time, weather, genres, artists, and songs', () => {
  assert.equal(timeMood(7).period, 'Morning'); assert.equal(timeMood(13).period, 'Afternoon'); assert.equal(timeMood(19).period, 'Evening'); assert.equal(timeMood(1).period, 'Late night');
  assert.equal(weatherMood(61).label, 'Rainy'); assert.equal(weatherMood(75).label, 'Snowy'); assert.equal(weatherMood(95).label, 'Thunderstorms');
  const searches = makeSearches({ preferredSongs: ['Golden'], preferredArtists: ['Local Artist'], preferredGenres: ['Jazz'] }, { time: timeMood(19), weather: weatherMood(61) });
  assert.ok(searches.includes('Golden')); assert.ok(searches.includes('Local Artist')); assert.ok(searches.includes('Jazz relaxed')); assert.ok(searches.includes('Jazz rain acoustic'));
});
test('personal preferences persist by account and listening safely handles weather failure', async t => {
  const originalFetch = global.fetch; const secret = process.env.JWT_ACCESS_SECRET;
  t.after(() => { global.fetch = originalFetch; if (secret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = secret; });
  process.env.JWT_ACCESS_SECRET = 'listening-test';
  const store = new Map(); const id = '507f1f77bcf86cd799439011'; const other = '507f1f77bcf86cd799439012';
  t.mock.method(Preferences, 'findOneAndUpdate', async (filter, update) => { const value = { preferredGenres: [], preferredArtists: [], preferredSongs: [], preferredEnergy: 'Any', recommendationLimit: 15, onboardingComplete: false, ...store.get(filter.userId), ...update.$set, userId: filter.userId }; store.set(filter.userId, value); return value; });
  t.mock.method(Preferences, 'findOne', filter => ({ lean: async () => store.get(filter.userId) || null }));
  const app = express(); app.use(express.json()); app.use('/api', require('../routes/dataRoutes')); app.use('/api', require('../routes/listeningRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = async (path, method = 'GET', body, user = id) => {
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ userId: user }, process.env.JWT_ACCESS_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('/preferences')).data.preferences.onboardingComplete, false);
  const preference = { preferredGenres: ['Jazz'], preferredArtists: ['Local Artist'], preferredSongs: ['Golden'], preferredEnergy: 'Any', recommendationLimit: 15, onboardingComplete: true };
  assert.equal((await call('/preferences', 'PUT', preference)).status, 200);
  assert.deepEqual((await call('/preferences')).data.preferences.preferredArtists, ['Local Artist']);
  assert.equal((await call('/preferences', 'GET', undefined, other)).data.preferences.onboardingComplete, false);
  assert.equal((await call('/preferences', 'PUT', { ...preference, preferredArtists: [123] })).status, 400);
  assert.equal((await call('/preferences', 'PUT', { ...preference, onboardingComplete: 'true' })).status, 400);
  assert.equal((await call('/listen/session', 'POST', { hour: 13 }, null)).status, 401);
  for (const body of [{ hour: 24 }, { hour: 7, latitude: 91, longitude: 0 }, { hour: '8' }, { hour: 8, latitude: 0 }]) assert.equal((await call('/listen/session', 'POST', body)).status, 400);
  let weatherFails = false; const terms = []; let seq = 0;
  global.fetch = async url => {
    const target = new URL(url);
    if (target.hostname === 'api.open-meteo.com') {
      if (weatherFails) throw new Error('offline');
      assert.equal(target.searchParams.get('latitude'), '40.71');
      assert.equal(target.searchParams.get('longitude'), '-74.01');
      return { ok: true, json: async () => ({ current: { weather_code: 61, temperature_2m: 17 } }) };
    }
    terms.push(target.searchParams.get('term'));
    return { ok: true, json: async () => ({ results: [{ kind: 'song', trackId: ++seq, trackName: target.searchParams.get('term'), artistName: 'Local Artist', primaryGenreName: 'Jazz', collectionName: 'Chill evenings' }] }) };
  };
  const rainy = await call('/listen/session', 'POST', { hour: 19, latitude: 40.7128, longitude: -74.0062 });
  assert.equal(rainy.status, 200); assert.equal(rainy.data.context.weather.label, 'Rainy'); assert.equal(rainy.data.context.period, 'Evening'); assert.equal(rainy.data.context.personalized, true); assert.ok(rainy.data.songs.length > 1);
  assert.ok(terms.includes('Golden')); assert.ok(terms.includes('Local Artist')); assert.ok(terms.includes('Jazz rain acoustic'));
  weatherFails = true;
  const fallback = await call('/listen/session', 'POST', { hour: 7, latitude: 10, longitude: 20 });
  assert.equal(fallback.status, 200); assert.equal(fallback.data.context.weather, null); assert.equal(fallback.data.context.period, 'Morning');
  assert.equal((await call('/listen/session', 'POST', { hour: 1 })).status, 200);
});
