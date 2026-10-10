const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getLocalCharts } = require('../services/localCharts');
const { getNostalgia, getRegionalSongs } = require('../services/nostalgia');
const router = express.Router();

router.get('/local-charts', requireAuth, async (req, res) => {
  const { countryCode, city, mode } = req.query;
  if (typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode)
    || (city !== undefined && (typeof city !== 'string' || city.trim().length > 100))) {
    return res.status(400).json({ success: false, error: 'A two-letter country code and an optional city are required.' });
  }
  if (mode !== undefined && !['popular', 'nostalgia'].includes(mode)) return res.status(400).json({ error: 'Unknown discovery mode.' });
  const code = countryCode.toUpperCase();
  const country = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code);
  if (!country || code === 'ZZ') return res.status(400).json({ success: false, error: 'Unknown country code.' });
  try {
    const service = mode === 'nostalgia' ? getNostalgia : mode === 'popular' && process.env.GEMINI_API_KEY ? getRegionalSongs : getLocalCharts;
    const chart = await service(country, city?.trim() || null);
    return res.json({ success: true, countryCode: code, ...chart });
  } catch (error) {
    // Do not log upstream URLs or API keys.
    const status = error.status === 503 ? 503 : 502;
    return res.status(status).json({ success: false, error: error.status ? error.message : 'Unable to load area charts. Please try again.' });
  }
});
module.exports = router;
