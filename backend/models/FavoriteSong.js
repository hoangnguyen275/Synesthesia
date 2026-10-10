
const mongoose = require('mongoose');

const favoriteSongSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    trackId: {
      type: Number,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    artist: {
      type: String,
      required: true,
    },

    album: {
      type: String,
      default: '',
    },

    genre: {
      type: String,
      default: '',
    },

    artwork: {
      type: String,
      default: '',
    },

    storeUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate favorite tracks within one account.
favoriteSongSchema.index(
  { userId: 1, trackId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'FavoriteSong',
  favoriteSongSchema
);
