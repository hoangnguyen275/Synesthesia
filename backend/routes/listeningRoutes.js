const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const UserPreference = require('../models/UserPreference');
const { createListeningSession } = require('../services/listening');
const router = express.Router();
router.post('/listen/session', requireAuth, async (req, res) => {
  const { hour, latitude, longitude } = req.body || {};
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || ((latitude !== undefined || longitude !== undefined) && (![latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180))) return res.status(400).json({ error: 'A local hour and optional valid coordinates are required.' });
  try {
    const preferences = await UserPreference.findOne({ userId: req.userId }).lean() || {};
    return res.json(await createListeningSession(preferences, hour, latitude === undefined ? null : { latitude, longitude }));
  } catch { return res.status(502).json({ error: 'Unable to prepare your music. Please try again.' }); }
});
module.exports = router;
