const TYPES = ['history', 'origins', 'memory'];
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function text(value, name, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Invalid ${name}.`);
  return value.trim();
}
function url(value) {
  const raw = text(value, 'link', 2000);
  if (!raw) return '';
  try { const parsed = new URL(raw); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('Use an HTTP or HTTPS link.'); return parsed.href; }
  catch { fail('Use a valid HTTP or HTTPS link.'); }
}
function validateEntry(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid entry.');
  if (!TYPES.includes(body.type)) fail('Choose an entry category.');
  const title = text(body.title, 'title', 150, true);
  const content = text(body.content, 'story', 10000, true);
  if (![body.latitude, body.longitude].every(Number.isFinite) || Math.abs(body.latitude) > 90 || Math.abs(body.longitude) > 180) fail('Select a valid map location.');
  const locationPrivacy = body.locationPrivacy || 'approximate';
  if (!['approximate', 'exact'].includes(locationPrivacy)) fail('Choose location precision.');
  if (!Array.isArray(body.sources || []) || (body.sources || []).length > 6) fail('Add at most six source links.');
  const sources = [...new Set((body.sources || []).map(url).filter(Boolean))];
  if (body.type === 'history' && !sources.length) fail('Music history needs at least one source link.');
  const songTitle = text(body.songTitle, 'song title', 200, body.type === 'memory');
  const artist = text(body.artist, 'artist', 200, body.type === 'memory');
  const recording = text(body.recording, 'recording details', 1000);
  if (body.type === 'origins' && !songTitle && !artist) fail('Music origins needs a song or artist.');
  const date = text(body.date, 'date', 10);
  const datePrecision = body.datePrecision || 'approximate';
  if (!['approximate', 'exact'].includes(datePrecision)) fail('Choose date precision.');
  if (date && (datePrecision === 'exact' ? !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date : !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date))) fail('Use YYYY for approximate dates or YYYY-MM-DD for exact dates.');
  if (date && datePrecision === 'approximate') {
    const parts = date.split('-');
    const padded = `${parts[0]}-${parts[1] || '01'}-${parts[2] || '01'}`;
    if (Number.isNaN(Date.parse(padded)) || new Date(padded).toISOString().slice(0, 10) !== padded) fail('Enter a valid approximate date.');
  }
  const digits = locationPrivacy === 'approximate' ? 2 : 6;
  return { type: body.type, title, content, latitude: Number(body.latitude.toFixed(digits)), longitude: Number(body.longitude.toFixed(digits)), locationPrivacy,
    placeName: text(body.placeName, 'place name', 200, true), sources, songTitle, artist, recording, date, datePrecision, imageUrl: url(body.imageUrl), link: url(body.link) };
}
module.exports = { validateEntry, TYPES, url };
