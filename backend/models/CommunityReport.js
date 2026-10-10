const mongoose = require('mongoose');
const schema = new mongoose.Schema({ entry: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityEntry', required: true }, reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, reason: { type: String, required: true, maxlength: 1000 }, resolved: { type: Boolean, default: false } }, { timestamps: true });
schema.index({ entry: 1, reporter: 1 }, { unique: true });
module.exports = mongoose.model('CommunityReport', schema);
