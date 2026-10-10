const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { searchSongs } = require('../services/songSearch');
const router = express.Router();
router.get('/songs/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || !q.trim() || q.length > 200) return res.status(400).json({ error: 'Enter an artist or song name (maximum 200 characters).' });
  try { return res.json({ success: true, query: q.trim(), songs: await searchSongs(q) }); }
  catch { return res.status(502).json({ error: 'Unable to search songs right now. Please try again.' }); }
});
module.exports = router;
