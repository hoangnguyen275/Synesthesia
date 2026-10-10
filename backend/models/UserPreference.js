
const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    preferredGenres: {
      type: [String],
      default: [],
    },

    preferredArtists: { type: [String], default: [] },
    preferredSongs: { type: [String], default: [] },
    onboardingComplete: { type: Boolean, default: false },
    preferredEnergy: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Any'],
      default: 'Any',
    },

    recommendationLimit: {
      type: Number,
      default: 15,
      min: 1,
      max: 50,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'UserPreference',
  userPreferenceSchema
);
