const cache = new Map();
const pending = new Map();
const CACHE_MS = 10 * 60 * 1000;
const failure = message => Object.assign(new Error(message), { status: 502 });
async function searchSongs(query) {
  const term = query.trim();
  const key = term.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.songs;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const params = new URLSearchParams({ term, country: 'US', media: 'music', entity: 'song', limit: '40' });
    const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw failure('Song search is temporarily unavailable. Please try again.');
    const data = await response.json();
    if (!Array.isArray(data.results)) throw failure('Song search returned an unexpected response.');
    const seen = new Set();
    const songs = data.results.filter(track => {
      if (track.kind !== 'song' || !Number.isSafeInteger(track.trackId) || typeof track.trackName !== 'string' || !track.trackName.trim() || typeof track.artistName !== 'string' || !track.artistName.trim()) return false;
      const identity = `${track.trackName}:${track.artistName}`.toLowerCase();
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    }).slice(0, 30).map(track => ({ id: track.trackId, title: track.trackName, artist: track.artistName,
      genre: typeof track.primaryGenreName === 'string' ? track.primaryGenreName : '',
      album: typeof track.collectionName === 'string' ? track.collectionName : '',
      artwork: typeof track.artworkUrl100 === 'string' && track.artworkUrl100.startsWith('https://') ? track.artworkUrl100 : null }));
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), songs });
    return songs;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
module.exports = { searchSongs };
