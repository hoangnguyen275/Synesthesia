const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { searchVideos, playerHtml } = require('../services/youtube');
const router = express.Router();

router.get('/youtube/search', requireAuth, async (req, res) => {
  const { title, artist } = req.query;
  if (![title, artist].every((value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 300)) {
    return res.status(400).json({ error: 'A song title and artist are required (maximum 300 characters each).' });
  }
  try { return res.json({ success: true, videos: await searchVideos(title.trim(), artist.trim()) }); }
  catch (error) {
    return res.status([429, 503].includes(error.status) ? error.status : 502)
      .json({ error: error.status ? error.message : 'Unable to search YouTube. Check the server internet connection and try again.' });
  }
});

// Public player shell contains no credentials or account data. The hosted page supplies
// the HTTP Referer required by YouTube, including when loaded inside a native WebView.
router.get('/youtube/player/:videoId', (req, res) => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(req.params.videoId)) return res.status(400).send('Invalid video ID.');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Cache-Control', 'public, max-age=3600');
  return res.type('html').send(playerHtml(req.params.videoId));
});
module.exports = router;
