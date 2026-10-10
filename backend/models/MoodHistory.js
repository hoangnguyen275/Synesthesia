
const mongoose = require('mongoose');

const moodHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: ['photo', 'video'],
      required: true,
    },

    scene: {
      type: String,
      required: true,
    },

    mood: {
      type: String,
      required: true,
    },

    energy: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      required: true,
    },

    genres: {
      type: [String],
      default: [],
    },

    explanation: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

moodHistorySchema.index({
  userId: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  'MoodHistory',
  moodHistorySchema
);
