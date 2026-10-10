const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { validateEntry } = require('../services/communityValidation');
const Entry = require('../models/CommunityEntry');
const Report = require('../models/CommunityReport');
const User = require('../models/User');
const sample = { type: 'history', title: 'A recording studio', content: 'A sourced article about a recording session.', latitude: 40.712845, longitude: -74.006239, placeName: 'New York', sources: ['https://example.org/history'] };

test('community validation protects precision, sources, dates, and server-owned fields', async () => {
  const safe = validateEntry({ ...sample, author: 'fake', verified: true, status: 'published' });
  assert.equal(safe.latitude, 40.71); assert.equal(safe.longitude, -74.01);
  assert.equal(safe.locationPrivacy, 'approximate');
  assert.equal(safe.verified, undefined); assert.equal(safe.author, undefined); assert.equal(safe.status, undefined);
  assert.equal(validateEntry({ ...sample, locationPrivacy: 'exact' }).latitude, 40.712845);
  assert.equal(validateEntry({ ...sample, type: 'origins', artist: 'Artist', sources: [] }).artist, 'Artist');
  assert.equal(validateEntry({ ...sample, type: 'memory', songTitle: 'Song', artist: 'Artist', date: '1990', datePrecision: 'approximate' }).date, '1990');
  assert.equal(validateEntry({ ...sample, date: '2024-02-29', datePrecision: 'exact' }).date, '2024-02-29');
  for (const body of [null, {}, { ...sample, latitude: 91 }, { ...sample, longitude: '20' }, { ...sample, sources: [] }, { ...sample, sources: ['javascript:alert(1)'] }, { ...sample, sources: ['https://user:pass@example.com/'] }, { ...sample, type: 'memory' }, { ...sample, type: 'origins', sources: [] }, { ...sample, date: '2023-02-29', datePrecision: 'exact' }, { ...sample, date: '1990-13', datePrecision: 'approximate' }]) {
    assert.throws(() => validateEntry(body), { status: 400 });
  }
  const model = new Entry({ ...safe, author: '507f1f77bcf86cd799439011' });
  assert.equal(model.status, 'pending'); assert.equal(model.verified, false); await model.validate();
  assert.equal(new User({ username: 'tester', email: 'a@example.com', passwordHash: 'hash' }).role, 'user');
});

test('community API enforces ownership, moderation, verification, and reporting', async t => {
  const ids = { alice: '507f1f77bcf86cd799439011', bob: '507f1f77bcf86cd799439012', mod: '507f1f77bcf86cd799439013', missing: '507f1f77bcf86cd799439014' };
  const users = Object.fromEntries(Object.entries(ids).filter(([name]) => name !== 'missing').map(([name, _id]) => [_id, { _id, username: name, role: name === 'mod' ? 'moderator' : 'user', email: 'private@example.com' }]));
  const entries = []; const reports = []; let seq = 1;
  const makeId = () => (seq++).toString(16).padStart(24, '0');
  const hydrate = value => !value ? value : ({ ...value, author: { _id: value.author, username: users[String(value.author)]?.username } });
  function query(get) {
    let skip = 0; let limit = Infinity; let populated = false;
    return { sort() { return this; }, skip(n) { skip = n; return this; }, limit(n) { limit = n; return this; }, select() { return this; }, populate() { populated = true; return this; },
      then(resolve, reject) { let value = get(); if (Array.isArray(value)) value = value.slice(skip, skip + limit).map(item => populated ? hydrate(item) : item); else if (populated) value = hydrate(value); return Promise.resolve(value).then(resolve, reject); } };
  }
  function matches(entry, filter) {
    return Object.entries(filter).every(([key, value]) => key === '$or' ? value.some(condition => Object.entries(condition).some(([field, pattern]) => new RegExp(pattern.$regex, pattern.$options).test(entry[field] || ''))) : String(entry[key]) === String(value));
  }
  t.mock.method(User, 'findById', id => ({ select: async () => users[id] || null }));
  t.mock.method(Entry, 'create', async fields => { const entry = new Entry({ ...fields, _id: makeId() }).toObject(); entry.save = async () => entry; entries.push(entry); return entry; });
  t.mock.method(Entry, 'find', filter => query(() => entries.filter(entry => matches(entry, filter))));
  t.mock.method(Entry, 'findById', id => query(() => entries.find(entry => String(entry._id) === id) || null));
  t.mock.method(Entry, 'exists', async filter => entries.some(entry => matches(entry, filter)));
  t.mock.method(Report, 'updateOne', async (filter, update) => { if (!reports.some(report => report.entry === filter.entry && report.reporter === filter.reporter)) reports.push({ ...filter, ...update.$setOnInsert, _id: makeId(), resolved: false, createdAt: new Date() }); });
  t.mock.method(Report, 'find', () => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, populate: async () => reports.filter(report => !report.resolved).map(({ _id, entry, reason, createdAt }) => ({ _id, entry: { _id: entry, title: 'Reported story' }, reason, createdAt })) }));
  t.mock.method(Report, 'findByIdAndUpdate', async id => { const report = reports.find(report => report._id === id); if (report) report.resolved = true; return report; });
  const secret = process.env.JWT_ACCESS_SECRET; process.env.JWT_ACCESS_SECRET = 'community-test-secret';
  t.after(() => { if (secret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = secret; });
  const app = express(); app.use(express.json()); app.use('/api', require('../routes/communityRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/community`;
  const call = async (path, who = 'alice', body, method = body ? 'POST' : 'GET') => {
    const headers = { 'Content-Type': 'application/json' };
    if (who) headers.Authorization = `Bearer ${jwt.sign({ userId: ids[who], role: 'admin' }, process.env.JWT_ACCESS_SECRET)}`;
    const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('/entries', null)).status, 401);
  assert.equal((await call('/entries', 'missing')).status, 401);
  assert.equal((await call('/me', 'alice')).data.moderator, false);
  assert.equal((await call('/me', 'mod')).data.moderator, true);
  const created = await call('/entries', 'alice', { ...sample, author: ids.bob, verified: true, status: 'published' });
  assert.equal(created.status, 201); const id = String(created.data.id);
  assert.equal(entries[0].verified, false); assert.equal(entries[0].status, 'pending'); assert.equal(String(entries[0].author), ids.alice); assert.equal(entries[0].latitude, 40.71);
  assert.equal((await call('/entries')).data.entries.length, 0);
  assert.equal((await call('/entries?view=mine')).data.entries.length, 1);
  assert.equal((await call('/entries?view=mine', 'bob')).data.entries.length, 0);
  assert.equal((await call(`/entries/${id}`, 'bob')).status, 404);
  assert.equal((await call('/entries?view=pending', 'alice')).status, 403);
  assert.equal((await call('/entries?view=pending', 'mod')).data.entries.length, 1);
  assert.equal((await call(`/entries/${id}/moderate`, 'alice', { status: 'published', verified: true })).status, 403);
  assert.equal((await call(`/entries/${id}/report`, 'bob', { reason: 'Pending story' })).status, 404);
  assert.equal((await call(`/entries/${id}/moderate`, 'mod', { status: 'published', verified: true })).status, 200);
  const detail = (await call(`/entries/${id}`, 'bob')).data.entry;
  assert.equal(detail.verified, true); assert.equal(detail.contributor, 'alice');
  assert.equal(detail.author, undefined); assert.equal(detail.verifiedBy, undefined); assert.equal(detail.email, undefined);
  assert.equal((await call('/entries?type=history&q=studio')).data.entries.length, 1);
  assert.equal((await call('/entries?type=memory')).data.entries.length, 0);
  assert.equal((await call('/entries?q=.%2B')).data.entries.length, 0);
  assert.equal((await call('/entries?page=0')).status, 400);
  assert.equal((await call('/entries/not-an-id')).status, 400);
  assert.equal((await call(`/entries/${id}/report`, 'bob', { reason: 'Private address' })).status, 200);
  await call(`/entries/${id}/report`, 'bob', { reason: 'Duplicate' }); assert.equal(reports.length, 1);
  assert.equal((await call('/reports', 'alice')).status, 403);
  const reportData = (await call('/reports', 'mod')).data.reports;
  assert.equal(reportData.length, 1); assert.equal(reportData[0].reporter, undefined);
  assert.equal((await call(`/reports/${reports[0]._id}/resolve`, 'alice', {})).status, 403);
  assert.equal((await call(`/reports/${reports[0]._id}/resolve`, 'mod', {})).status, 200);
  assert.equal((await call('/reports', 'mod')).data.reports.length, 0);
  const memory = await call('/entries', 'alice', { ...sample, type: 'memory', songTitle: 'Song', artist: 'Artist', sources: [] });
  assert.equal((await call(`/entries/${memory.data.id}/moderate`, 'mod', { status: 'published', verified: true })).status, 400);
  assert.equal((await call(`/entries/${memory.data.id}/moderate`, 'mod', { status: 'published', verified: false })).status, 200);
  assert.equal((await call(`/entries/${id}/moderate`, 'mod', { status: 'rejected' })).status, 200);
  assert.equal(entries[0].verified, false);
  assert.equal((await call(`/entries/${id}`, 'bob')).status, 404);
  assert.equal((await call(`/entries/${id}`, 'alice')).status, 200);
});
