const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const User = require('../models/User');
const Entry = require('../models/CommunityEntry');
const Report = require('../models/CommunityReport');
const { validateEntry, TYPES } = require('../services/communityValidation');
const router = express.Router();
const isModerator = user => ['moderator', 'admin'].includes(user?.role);
const validId = id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
const populate = query => query.populate('author', 'username');
function publicEntry(entry) {
  const value = entry.toObject ? entry.toObject() : { ...entry };
  value.contributor = value.author?.username || 'Community member';
  delete value.author; delete value.verifiedBy; delete value.moderatedBy;
  return value;
}
router.use('/community', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.userId)) return res.status(401).json({ error: 'Invalid account.' });
    req.communityUser = await User.findById(req.userId).select('username role');
    if (!req.communityUser) return res.status(401).json({ error: 'Account no longer exists.' });
    next();
  } catch { res.status(503).json({ error: 'Community archive is temporarily unavailable.' }); }
});
router.get('/community/me', (req, res) => res.json({ moderator: isModerator(req.communityUser) }));
router.get('/community/entries', async (req, res) => {
  try {
    const { type, q = '', view = 'published', page = '1' } = req.query;
    if ((type && !TYPES.includes(type)) || typeof q !== 'string' || q.length > 200 || !['published', 'mine', 'pending', 'rejected'].includes(view) || typeof page !== 'string' || !/^[1-9]\d{0,4}$/.test(page)) return res.status(400).json({ error: 'Invalid archive filters.' });
    if (['pending', 'rejected'].includes(view) && !isModerator(req.communityUser)) return res.status(403).json({ error: 'Moderator access required.' });
    const filter = view === 'mine' ? { author: req.userId } : { status: view };
    if (type) filter.type = type;
    if (q.trim()) { const pattern = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = ['title', 'content', 'artist', 'songTitle', 'placeName'].map(field => ({ [field]: { $regex: pattern, $options: 'i' } })); }
    const entries = await populate(Entry.find(filter).sort({ createdAt: -1, _id: -1 }).skip((Number(page) - 1) * 50).limit(51));
    res.json({ entries: entries.slice(0, 50).map(publicEntry), hasMore: entries.length > 50 });
  } catch { res.status(503).json({ error: 'Unable to load the archive.' }); }
});
router.post('/community/entries', async (req, res) => {
  try {
    const fields = validateEntry(req.body);
    const entry = await Entry.create({ ...fields, author: req.userId, status: 'pending', verified: false });
    res.status(201).json({ id: entry._id, status: entry.status });
  } catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? error.message : 'Unable to save your entry.' }); }
});
router.get('/community/reports', async (req, res) => {
  if (!isModerator(req.communityUser)) return res.status(403).json({ error: 'Moderator access required.' });
  try {
    const reports = await Report.find({ resolved: false }).select('entry reason createdAt').sort({ createdAt: -1 }).limit(100).populate('entry', 'title status');
    res.json({ reports });
  } catch { res.status(503).json({ error: 'Unable to load reports.' }); }
});
router.post('/community/reports/:id/resolve', async (req, res) => {
  if (!isModerator(req.communityUser)) return res.status(403).json({ error: 'Moderator access required.' });
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid report ID.' });
  try { const report = await Report.findByIdAndUpdate(req.params.id, { resolved: true }); if (!report) return res.status(404).json({ error: 'Report not found.' }); res.json({ success: true }); }
  catch { res.status(503).json({ error: 'Unable to resolve report.' }); }
});
router.get('/community/entries/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid entry ID.' });
  try {
    const entry = await populate(Entry.findById(req.params.id));
    if (!entry || (entry.status !== 'published' && String(entry.author?._id) !== req.userId && !isModerator(req.communityUser))) return res.status(404).json({ error: 'Entry not found.' });
    res.json({ entry: publicEntry(entry), moderator: isModerator(req.communityUser) });
  } catch { res.status(503).json({ error: 'Unable to load this story.' }); }
});
router.post('/community/entries/:id/report', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid entry ID.' });
  const reason = req.body?.reason;
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) return res.status(400).json({ error: 'Describe the issue (up to 1000 characters).' });
  try {
    if (!await Entry.exists({ _id: req.params.id, status: 'published' })) return res.status(404).json({ error: 'Entry not found.' });
    await Report.updateOne({ entry: req.params.id, reporter: req.userId }, { $setOnInsert: { reason: reason.trim() } }, { upsert: true });
    res.json({ success: true });
  } catch (error) { if (error.code === 11000) return res.json({ success: true }); res.status(503).json({ error: 'Unable to send report.' }); }
});
router.post('/community/entries/:id/moderate', async (req, res) => {
  if (!isModerator(req.communityUser)) return res.status(403).json({ error: 'Moderator access required.' });
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid entry ID.' });
  const { status, verified = false, note = '' } = req.body || {};
  if (!['published', 'rejected', 'pending'].includes(status) || typeof verified !== 'boolean' || typeof note !== 'string' || note.length > 1000) return res.status(400).json({ error: 'Invalid moderation decision.' });
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    if (verified && (entry.type === 'memory' || !entry.sources.length || status !== 'published')) return res.status(400).json({ error: 'Verification requires a published history/origins entry with sources.' });
    entry.status = status; entry.verified = verified; entry.moderatedBy = req.userId; entry.moderationNote = note.trim();
    entry.verifiedBy = verified ? req.userId : undefined; entry.verifiedAt = verified ? new Date() : undefined;
    await entry.save();
    res.json({ success: true });
  } catch { res.status(503).json({ error: 'Unable to save moderation decision.' }); }
});
module.exports = router;
