
const express = require('express');
const mongoose = require('mongoose');

const MoodHistory = require('../models/MoodHistory');
const FavoriteSong = require('../models/FavoriteSong');
const UserPreference = require('../models/UserPreference');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Protect all database endpoints.
router.use(['/history', '/favorites', '/preferences'], requireAuth);

// ========================================
// HELPER FUNCTIONS
// ========================================

function validId(id) {
  return mongoose.isValidObjectId(id);
}

function validGenres(genres) {
  return (
    Array.isArray(genres) &&
    genres.length <= 20 &&
    genres.every(
      (genre) =>
        typeof genre === 'string' &&
        genre.trim().length > 0 &&
        genre.length <= 50
    )
  );
}

function handleError(res, error) {
  console.error('Database API error:', error);

  return res.status(500).json({
    success: false,
    error: 'Database operation failed.',
  });
}

// ========================================
// MOOD HISTORY
// ========================================

// POST /api/history
// Save a mood analysis for the current user.
router.post('/history', async (req, res) => {
  try {
    const {
      source,
      scene,
      mood,
      energy,
      genres,
      explanation = '',
    } = req.body || {};

    if (
      !['photo', 'video'].includes(source) ||
      typeof scene !== 'string' ||
      !scene.trim() ||
      scene.length > 1000 ||
      typeof mood !== 'string' ||
      !mood.trim() ||
      mood.length > 300 ||
      !['Low', 'Medium', 'High'].includes(energy) ||
      !validGenres(genres) ||
      typeof explanation !== 'string' ||
      explanation.length > 3000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mood history data.',
      });
    }

    const history = await MoodHistory.create({
      userId: req.userId,
      source,
      scene: scene.trim(),
      mood: mood.trim(),
      energy,
      genres: genres.map((genre) => genre.trim()),
      explanation,
    });

    return res.status(201).json({
      success: true,
      history,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/history
// Return only records belonging to the current user.
router.get('/history', async (req, res) => {
  try {
    const history = await MoodHistory.find({
      userId: req.userId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/history/:id
// Delete only records owned by the current user.
router.delete('/history/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid history ID.',
      });
    }

    const deleted = await MoodHistory.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'History record not found.',
      });
    }

    return res.json({
      success: true,
      message: 'History record deleted.',
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// ========================================
// FAVORITE SONGS
// ========================================

// POST /api/favorites
// Save a song for the current user.
router.post('/favorites', async (req, res) => {
  try {
    const {
      trackId,
      title,
      artist,
      album = '',
      genre = '',
      artwork = '',
      storeUrl = '',
    } = req.body || {};

    if (
      !Number.isSafeInteger(trackId) ||
      trackId <= 0 ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 300 ||
      typeof artist !== 'string' ||
      !artist.trim() ||
      artist.length > 300 ||
      ![album, genre, artwork, storeUrl].every(
        (value) =>
          typeof value === 'string' &&
          value.length <= 2000
      )
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid favorite song data.',
      });
    }

    const existing = await FavoriteSong.findOne({
      userId: req.userId,
      trackId,
    });

    if (existing) {
      return res.json({
        success: true,
        alreadySaved: true,
        favorite: existing,
      });
    }

    const favorite = await FavoriteSong.create({
      userId: req.userId,
      trackId,
      title: title.trim(),
      artist: artist.trim(),
      album,
      genre,
      artwork,
      storeUrl,
    });

    return res.status(201).json({
      success: true,
      alreadySaved: false,
      favorite,
    });
  } catch (error) {
    // Handle concurrent duplicate requests.
    if (error.code === 11000) {
      try {
        const existing = await FavoriteSong.findOne({
          userId: req.userId,
          trackId: req.body?.trackId,
        });

        if (existing) {
          return res.json({
            success: true,
            alreadySaved: true,
            favorite: existing,
          });
        }
      } catch (lookupError) {
        return handleError(res, lookupError);
      }
    }

    return handleError(res, error);
  }
});

// GET /api/favorites
// Return only the current user's favorites.
router.get('/favorites', async (req, res) => {
  try {
    const favorites = await FavoriteSong.find({
      userId: req.userId,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      count: favorites.length,
      favorites,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/favorites/:id
router.delete('/favorites/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid favorite ID.',
      });
    }

    const deleted = await FavoriteSong.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Favorite song not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Favorite song removed.',
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// ========================================
// USER PREFERENCES
// ========================================

// GET /api/preferences
// Retrieve or create the current user's preferences.
router.get('/preferences', async (req, res) => {
  try {
    const preferences =
      await UserPreference.findOneAndUpdate(
        { userId: req.userId },
        {
          $setOnInsert: {
            userId: req.userId,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

    return res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/preferences
// Update the current user's music preferences.
router.put('/preferences', async (req, res) => {
  try {
    const {
      preferredGenres,
      preferredEnergy,
      recommendationLimit, preferredArtists, preferredSongs, onboardingComplete,
    } = req.body || {};

    if (
      !validGenres(preferredGenres) ||
      [preferredArtists, preferredSongs].some(value => value !== undefined && (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 200))) ||
      (onboardingComplete !== undefined && typeof onboardingComplete !== 'boolean') ||
      !['Low', 'Medium', 'High', 'Any'].includes(
        preferredEnergy
      ) ||
      !Number.isInteger(recommendationLimit) ||
      recommendationLimit < 1 ||
      recommendationLimit > 50
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid preference data.',
      });
    }

    const preferences =
      await UserPreference.findOneAndUpdate(
        { userId: req.userId },
        {
          $set: {
            preferredGenres: preferredGenres.map(
              (genre) => genre.trim()
            ),
            preferredEnergy,
            recommendationLimit,
            ...(preferredArtists !== undefined ? { preferredArtists: [...new Set(preferredArtists.map(value => value.trim()))] } : {}),
            ...(preferredSongs !== undefined ? { preferredSongs: [...new Set(preferredSongs.map(value => value.trim()))] } : {}),
            ...(onboardingComplete !== undefined ? { onboardingComplete } : {}),
          },
          $setOnInsert: {
            userId: req.userId,
          },
        },
        {
          returnDocument: 'after',
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

    return res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;
