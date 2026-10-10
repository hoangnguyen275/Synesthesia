const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;

function chartError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}
function safeLastFmUrl(value) {
  try {
    const url = new URL(value);
    if (!['www.last.fm', 'last.fm'].includes(url.hostname)) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch { return null; }
}

async function fetchChart(country, city, apiKey) {
  const params = new URLSearchParams({ method: 'geo.gettoptracks', country, api_key: apiKey, format: 'json', limit: '20' });
  if (city) params.set('location', city);
  const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw chartError('Last.fm charts are temporarily unavailable.');
  const data = await response.json();
  if (data.error) {
    if ([10, 26].includes(Number(data.error))) throw chartError('The Last.fm API key needs to be configured by the server administrator.', 503);
    if (city && [6, 7].includes(Number(data.error))) return null;
    throw chartError('Last.fm could not provide charts for this area.');
  }
  if (!data.tracks) throw chartError('Last.fm returned an unexpected chart response.');
  // Some Last.fm deployments ignore the metro parameter. Never label that a city chart.
  const metro = data.tracks['@attr']?.location;
  if (city && (typeof metro !== 'string' || metro.toLowerCase() !== city.toLowerCase())) return null;
  const raw = data.tracks.track;
  const tracks = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const songs = tracks.slice(0, 20).map((track, index) => ({
    rank: index + 1, title: track.name, artist: track.artist?.name || 'Unknown artist',
    url: safeLastFmUrl(track.url),
  })).filter((song) => typeof song.title === 'string' && song.title.length > 0);
  if (city && !songs.length) return null;
  return { songs, scope: city ? 'metro' : 'country', chartArea: city || country };
}

async function getLocalCharts(country, city = null) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) throw chartError('Nearby charts are not configured yet. Add LASTFM_API_KEY to backend/.env and restart the backend.', 503);
  const key = `${country}:${city || ''}`.toLowerCase();
  const cached = cache.get(key);
  let chart = cached && Date.now() - cached.at < CACHE_MS ? cached.value : null;
  if (!chart) {
    chart = city ? await fetchChart(country, city, apiKey) : null;
    if (!chart) chart = await fetchChart(country, null, apiKey);
    if (cache.size >= 300) cache.delete(cache.keys().next().value);
    cache.set(key, { value: chart, at: Date.now() });
  }
  return { country, city, ...chart, provider: 'Last.fm', period: 'Last week',
    scopeNote: chart.scope === 'metro'
      ? `Last.fm metro chart for ${chart.chartArea}.`
      : `Country chart for ${country}. A verified metro chart is unavailable for this location.` };
}

module.exports = { getLocalCharts };
