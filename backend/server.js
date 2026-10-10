
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const { buildPlaylists } = require('./services/playlists');
const authRoutes = require('./routes/authRoutes');

const connectDB = require('./config/database');
const dataRoutes = require('./routes/dataRoutes');
const chartRoutes = require('./routes/chartRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const searchRoutes = require('./routes/searchRoutes');
const communityRoutes = require('./routes/communityRoutes');
const listeningRoutes = require('./routes/listeningRoutes');
const { prepareImage } = require('./services/prepareImage');
const { getAnalysisError, safeDiagnostic } = require('./services/analysisErrors');

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// ========================================
// GEMINI AI CONFIGURATION
// ========================================

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/debug-auth', require('./middleware/requireAuth'));

// Register MongoDB REST API routes
app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/api', chartRoutes);
app.use('/api', youtubeRoutes);
app.use('/api', searchRoutes);
app.use('/api', communityRoutes);
app.use('/api', listeningRoutes);


app.get('/api/auth-check', (req, res) => {
  res.json({
    success: true,
    message: 'Updated Synesthesia server is running',
  });
});

// ========================================
// ITUNES CACHE
// ========================================

const searchCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000;

// ========================================
// GEMINI RESPONSE SCHEMA
// ========================================

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    scene: {
      type: Type.STRING,
    },
    mood: {
      type: Type.STRING,
    },
    energy: {
      type: Type.STRING,
      enum: ['Low', 'Medium', 'High'],
    },
    genres: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
    },
    explanation: {
      type: Type.STRING,
    },
  },
  required: [
    'scene',
    'mood',
    'energy',
    'genres',
    'explanation',
  ],
};

// ========================================
// IMAGE VALIDATION
// ========================================

// ========================================
// SHARED GEMINI ANALYSIS
// ========================================

async function analyzeWithGemini(images, prompt) {
  if (!ai) {
    const error = new Error(
      'Gemini API key is not configured.'
    );

    error.status = 503;
    throw error;
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      ...images,
      {
        text: prompt,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: analysisSchema,
    },
  });

  if (!response.text) {
    throw new Error(
      'Gemini returned an empty response.'
    );
  }

  return JSON.parse(response.text);
}

// ========================================
// GEMINI ERROR HANDLER
// ========================================

function handleAnalysisError(error, res) {
  const failure = getAnalysisError(error);
  console.error('Gemini analysis error:', {
    code: failure.code,
    upstreamStatus: error.status || error.error?.code || null,
    model: GEMINI_MODEL,
    reason: safeDiagnostic(error, process.env.GEMINI_API_KEY),
  });
  return res.status(failure.status).json({ error: failure.error, code: failure.code });
}

// ========================================
// TEST BACKEND
// ========================================

app.get('/', (req, res) => {
  res.json({
    message: 'Synesthesia Backend is running!',
    status: 'success',
    database: 'MongoDB',
  });
});

// ========================================
// STEP 4: PHOTO ANALYSIS
// ========================================

app.post('/api/analyze-mood', async (req, res) => {
  try {
    const {
      image,
      mimeType = 'image/jpeg',
    } = req.body || {};

    const preparedImage = prepareImage(
      image,
      mimeType
    );

    const prompt = `
Analyze the atmosphere of this image for
a music recommendation application called Synesthesia.

Identify:
1. The main scene or surroundings.
2. The mood suggested by the visible environment.
3. The energy level: Low, Medium, or High.
4. Three music genres matching the atmosphere.
5. A short explanation of the recommendations.

Base the answer only on visible evidence.
Do not infer anyone's actual emotions or private traits.
`;

    const analysis = await analyzeWithGemini(
      [preparedImage],
      prompt
    );

    return res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    return handleAnalysisError(error, res);
  }
});

// ========================================
// STEP 6: VIDEO ANALYSIS
// ========================================

app.post('/api/analyze-video', async (req, res) => {
  try {
    const { frames } = req.body || {};

    if (
      !Array.isArray(frames) ||
      frames.length < 1 ||
      frames.length > 3
    ) {
      return res.status(400).json({
        error: 'Provide between 1 and 3 video frames.',
      });
    }

    const preparedFrames = frames.map((frame) => {
      const image =
        typeof frame === 'string'
          ? frame
          : frame?.image || frame?.data;

      const mimeType =
        typeof frame === 'string'
          ? 'image/jpeg'
          : frame?.mimeType || 'image/jpeg';

      return prepareImage(image, mimeType);
    });

    const prompt = `
You are analyzing several frames sampled
from one video for an application called Synesthesia.

The frames represent different moments
in the same recording.

Analyze the overall visual atmosphere
across all provided frames.

Identify:
1. The main scene or surroundings.
2. The overall mood suggested by the environment.
3. The overall energy level: Low, Medium, or High.
4. Three music genres matching the atmosphere.
5. A short explanation of the recommendations.

Consider all frames together.

Base the answer only on visible information.
Do not infer anyone's actual emotions or private traits.
Do not claim to have analyzed audio.
`;

    const analysis = await analyzeWithGemini(
      preparedFrames,
      prompt
    );

    return res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    return handleAnalysisError(error, res);
  }
});

// ========================================
// ITUNES SEARCH FUNCTION
// ========================================

async function searchITunes(genre) {
  const cacheKey = genre.toLowerCase();
  const cached = searchCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.time < CACHE_DURATION
  ) {
    return cached.songs;
  }

  const params = new URLSearchParams({
    term: genre,
    country: 'US',
    media: 'music',
    entity: 'song',
    limit: '15',
  });

  const url =
    `https://itunes.apple.com/search?${params}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `iTunes request failed: ${response.status}`
    );
  }

  const data = await response.json();

  const songs = (data.results || [])
    .filter((track) => track.kind === 'song')
    .map((track) => ({
      id: track.trackId,
      title: track.trackName,
      artist: track.artistName,
      album: track.collectionName,
      genre: track.primaryGenreName,
      artwork: track.artworkUrl100 || null,
      storeUrl: track.trackViewUrl || null,
      previewUrl: track.previewUrl || null,
      searchGenre: genre,
    }));

  searchCache.set(cacheKey, {
    time: Date.now(),
    songs,
  });

  return songs;
}

// ========================================
// STEP 5: MUSIC RECOMMENDATIONS
// ========================================

app.get('/api/recommendations', async (req, res) => {
  try {
    if (typeof req.query.genres !== 'string') {
      return res.status(400).json({
        error: 'A genres query parameter is required.',
      });
    }

    const genres = [
      ...new Set(
        req.query.genres
          .split(',')
          .map((genre) => genre.trim())
          .filter(
            (genre) =>
              genre.length > 0 &&
              genre.length <= 50
          )
      ),
    ].slice(0, 3);

    if (genres.length === 0) {
      return res.status(400).json({
        error: 'At least one valid genre is required.',
      });
    }

    const searches = [...genres];
    for (const variant of ['acoustic', 'instrumental']) {
      if (searches.length >= 3) break;
      const term = `${genres[0]} ${variant}`;
      if (!searches.includes(term)) searches.push(term);
    }
    const outcomes = await Promise.allSettled(searches.map(searchITunes));
    const genreResults = outcomes.map(result => result.status === 'fulfilled' ? result.value : []);
    if (outcomes.every(result => result.status === 'rejected')) throw new Error('Music searches unavailable');
    const { recommendations, playlists } = buildPlaylists(searches, genreResults);

    return res.json({
      success: true,
      searchedGenres: searches,
      playlists,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    console.error(
      'Music recommendation error:',
      error
    );

    return res.status(502).json({
      error: 'Unable to retrieve music recommendations.',
    });
  }
});

// ========================================
// START SERVER WITH MONGODB
// ========================================

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      'Failed to start backend:',
      error.message
    );

    process.exit(1);
  }
}

startServer();
