const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  type: { type: String, enum: ['history', 'origins', 'memory'], required: true },
  title: { type: String, required: true, maxlength: 150 }, content: { type: String, required: true, maxlength: 10000 },
  latitude: { type: Number, required: true, min: -90, max: 90 }, longitude: { type: Number, required: true, min: -180, max: 180 },
  placeName: { type: String, required: true, maxlength: 200 }, locationPrivacy: { type: String, enum: ['approximate', 'exact'], default: 'approximate' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'published', 'rejected'], default: 'pending' },
  verified: { type: Boolean, default: false }, verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, verifiedAt: Date,
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, moderationNote: { type: String, maxlength: 1000, default: '' },
  songTitle: { type: String, maxlength: 200, default: '' }, artist: { type: String, maxlength: 200, default: '' }, recording: { type: String, maxlength: 1000, default: '' },
  date: { type: String, default: '' }, datePrecision: { type: String, enum: ['approximate', 'exact'], default: 'approximate' },
  sources: { type: [String], default: [] }, imageUrl: { type: String, default: '' }, link: { type: String, default: '' },
}, { timestamps: true });
schema.index({ status: 1, type: 1, createdAt: -1 });
schema.index({ author: 1, createdAt: -1 });
module.exports = mongoose.model('CommunityEntry', schema);
