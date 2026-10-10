const { searchSongs } = require('./songSearch');
const weatherCache = new Map();
function timeMood(hour) {
  if (hour >= 5 && hour < 11) return { period: 'Morning', mood: 'uplifting', terms: ['morning acoustic', 'feel good'] };
  if (hour >= 11 && hour < 17) return { period: 'Afternoon', mood: 'energetic', terms: ['upbeat pop', 'feel good'] };
  if (hour >= 17 && hour < 22) return { period: 'Evening', mood: 'relaxed', terms: ['chill soul', 'acoustic'] };
  return { period: 'Late night', mood: 'calm', terms: ['chill', 'ambient'] };
}
function weatherMood(code) {
  if (code >= 95) return { label: 'Thunderstorms', mood: 'cozy', term: 'soft acoustic' };
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return { label: 'Rainy', mood: 'reflective', term: 'rain acoustic' };
  if ([71,73,75,77,85,86].includes(code)) return { label: 'Snowy', mood: 'peaceful', term: 'winter acoustic' };
  if ([45,48].includes(code)) return { label: 'Foggy', mood: 'calm', term: 'ambient' };
  if ([2,3].includes(code)) return { label: 'Cloudy', mood: 'mellow', term: 'chill' };
  return { label: 'Clear', mood: 'bright', term: 'feel good' };
}
async function getWeather(point) {
  if (!point) return null;
  const latitude = Number(point.latitude.toFixed(2)); const longitude = Number(point.longitude.toFixed(2));
  const key = `${latitude}:${longitude}`; const old = weatherCache.get(key);
  if (old && Date.now() - old.at < 600000) return old.value;
  try {
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,weather_code', timezone: 'auto' });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const current = (await response.json()).current;
    if (!Number.isInteger(current?.weather_code) || !Number.isFinite(current?.temperature_2m)) return null;
    const value = { ...weatherMood(current.weather_code), temperature: current.temperature_2m };
    if (weatherCache.size >= 200) weatherCache.delete(weatherCache.keys().next().value);
    weatherCache.set(key, { at: Date.now(), value }); return value;
  } catch { return null; }
}
function makeSearches(preferences, context) {
  const genres = preferences.preferredGenres || []; const artists = preferences.preferredArtists || []; const songs = preferences.preferredSongs || [];
  const moodTerm = preferences.preferredEnergy === 'High' ? 'upbeat' : preferences.preferredEnergy === 'Low' ? 'calm acoustic' : context.weather?.term || context.time.terms[0];
  const searches = [ ...songs.slice(0, 2), ...artists.slice(0, 2), ...genres.slice(0, 2).map(genre => `${genre} ${context.time.mood}`), `${genres[0] || ''} ${moodTerm}`.trim(), context.time.terms[0] ];
  return [...new Set(searches)].slice(0, 8);
}
async function createListeningSession(preferences, hour, point) {
  const time = timeMood(hour); const weather = await getWeather(point); const context = { time, weather };
  const searches = makeSearches(preferences, context);
  const results = await Promise.allSettled(searches.map(searchSongs));
  const tracks = new Map();
  results.forEach((result, index) => { if (result.status === 'fulfilled') result.value.slice(0, 12).forEach(song => { if (!tracks.has(song.id)) tracks.set(song.id, { ...song, source: index }); }); });
  const artists = (preferences.preferredArtists || []).map(value => value.toLowerCase());
  const favorites = (preferences.preferredSongs || []).map(value => value.toLowerCase());
  const genres = (preferences.preferredGenres || []).map(value => value.toLowerCase());
  const moodWords = `${time.mood} ${weather?.mood || ''} ${time.terms.join(' ')} ${weather?.term || ''}`.split(/\s+/).filter(word => word.length > 3);
  const score = song => (genres.some(genre => (song.genre || '').toLowerCase().includes(genre)) ? 10 : 0) + (artists.some(artist => song.artist.toLowerCase().includes(artist)) ? 12 : 0)
    + (favorites.some(favorite => `${song.title} ${song.artist}`.toLowerCase().includes(favorite)) ? 15 : 0)
    + moodWords.filter(word => `${song.title} ${song.album}`.toLowerCase().includes(word)).length * 4
    + (song.source >= (preferences.preferredSongs || []).slice(0, 2).length + (preferences.preferredArtists || []).slice(0, 2).length ? 8 : 0);
  const ranked = [...tracks.values()].sort((a,b) => score(b) - score(a));
  const seen = new Set(); const songs = ranked.filter(song => { const id = `${song.title}:${song.artist}`.toLowerCase(); if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 20).map(({ source, ...song }) => song);
  if (!songs.length) throw Object.assign(new Error('No music is available for this moment. Try again shortly.'), { status: 502 });
  return { songs, context: { period: time.period, mood: weather?.mood || time.mood, weather: weather ? { label: weather.label, temperature: weather.temperature } : null, personalized: Boolean(artists.length || favorites.length || preferences.preferredGenres?.length) } };
}
module.exports = { createListeningSession, timeMood, weatherMood, makeSearches };
