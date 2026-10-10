const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPlaylists } = require('../services/playlists');
const song = id => ({ id, title: `Song ${id}`, artist: 'Artist' });
test('photo recommendations expose distinct genre playlists and mixed tracks', () => {
  const a = Array.from({ length: 15 }, (_, i) => song(i));
  const b = Array.from({ length: 15 }, (_, i) => song(i + 10));
  const result = buildPlaylists(['Jazz', 'Soul'], [a, b]);
  assert.equal(result.recommendations.length, 15);
  assert.equal(new Set(result.recommendations.map(s => s.id)).size, 15);
  assert.ok(result.playlists.length >= 3);
  assert.deepEqual(result.playlists.find(p => p.id === 'genre-1').songs, b);
  assert.notDeepEqual(result.playlists[0].songs, result.playlists[1].songs);
  assert.equal(result.playlists.find(p => p.id === 'discoveries').songs[0].id, 17);
});
test('empty and repeated search results do not create empty or duplicate playlists', () => {
  assert.deepEqual(buildPlaylists(['Jazz'], [[]]).playlists, []);
  const result = buildPlaylists(['Jazz', 'Soul'], [[song(1), song(1)], [song(1)]]);
  assert.equal(result.playlists.length, 1);
  assert.equal(result.playlists[0].songs.length, 1);
});
