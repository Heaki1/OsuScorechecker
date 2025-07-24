const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const session = require('express-session');
const NodeCache = require("node-cache");

// Enhanced caching with different TTLs
const tokenCache = new NodeCache({ stdTTL: 3500 }); // Tokens cache for 58 minutes
const beatmapCache = new NodeCache({ stdTTL: 7200 }); // Beatmaps cache for 2 hours
const userCache = new NodeCache({ stdTTL: 1800 }); // User data cache for 30 minutes
const leaderboardCache = new NodeCache({ stdTTL: 600 }); // Leaderboards cache for 10 minutes

const app = express();

// ✅ Trust proxy for correct IP detection behind Render
app.set('trust proxy', true);

const port = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit heavy operations like leaderboard scanning
  message: { error: 'Leaderboard scanning is rate limited. Try again in an hour.' }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(limiter);

// Enhanced session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'osu_fallback_secret_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000, // 1 hour
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const client_id = process.env.OSU_CLIENT_ID;
const client_secret = process.env.OSU_CLIENT_SECRET;
const redirect_uri = process.env.OSU_REDIRECT_URI;

// Validation
if (!client_id || !client_secret || !redirect_uri) {
  console.error('❌ Missing required environment variables: OSU_CLIENT_ID, OSU_CLIENT_SECRET, OSU_REDIRECT_URI');
  process.exit(1);
}

// Enhanced token management
class TokenManager {
  constructor() {
    this.access_token = null;
    this.token_expiry = 0;
  }

  async getAccessToken() {
    const cached = tokenCache.get('client_token');
    if (cached) return cached;

    try {
      const response = await axios.post('https://osu.ppy.sh/oauth/token', {
        client_id,
        client_secret,
        grant_type: 'client_credentials',
        scope: 'public'
      });

      const token = response.data.access_token;
      const expires_in = response.data.expires_in - 60; // 1 minute buffer
      
      tokenCache.set('client_token', token, expires_in);
      return token;
    } catch (error) {
      console.error('❌ Failed to get access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with osu! API');
    }
  }

  async refreshUserToken(refresh_token) {
    try {
      const response = await axios.post('https://osu.ppy.sh/oauth/token', {
        client_id,
        client_secret,
        refresh_token,
        grant_type: 'refresh_token'
      });

      return response.data;
    } catch (error) {
      console.error('❌ Failed to refresh user token:', error.response?.data || error.message);
      throw error;
    }
  }
}

const tokenManager = new TokenManager();

// Enhanced utility functions
function formatSeconds(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatScore(score) {
  return score?.toLocaleString() || '0';
}

function calculatePP(accuracy, difficulty_rating, mods = []) {
  // Simplified PP calculation (for display purposes)
  let pp = Math.pow(difficulty_rating, 2.2) * Math.pow(accuracy / 100, 5.8) * 42;
  
  // Mod multipliers (simplified)
  if (mods.includes('HD')) pp *= 1.06;
  if (mods.includes('HR')) pp *= 1.12;
  if (mods.includes('DT')) pp *= 1.18;
  if (mods.includes('FL')) pp *= 1.12;
  
  return Math.round(pp);
}

// Middleware for checking authentication
function requireAuth(req, res, next) {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Enhanced error handling middleware
function handleError(error, req, res, next) {
  console.error('❌ Server error:', error);
  
  if (error.response?.status === 401) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
  
  if (error.response?.status === 404) {
    return res.status(404).json({ error: 'Resource not found' });
  }
  
  if (error.response?.status === 429) {
    return res.status(429).json({ error: 'osu! API rate limit exceeded' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
}

// Routes
app.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  req.session.oauth_state = state;
  
  const redirect = `https://osu.ppy.sh/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=identify public&state=${state}`;
  res.redirect(redirect);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state parameter
  if (state !== req.session.oauth_state) {
    console.error('❌ Invalid OAuth state');
    return res.status(400).send('Invalid state parameter');
  }
  
  delete req.session.oauth_state;
  
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenRes = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    req.session.token_expiry = Date.now() + (expires_in * 1000);

    res.redirect('/?login=success');
  } catch (err) {
    console.error('❌ OAuth callback failed:', err.response?.data || err.message);
    res.redirect('/?error=oauth_failed');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Enhanced beatmap endpoint
app.get('/api/beatmap/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Invalid beatmap ID' });
    }

    // Check cache first
    const cacheKey = `beatmap_${id}`;
    const cached = beatmapCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const token = await tokenManager.getAccessToken();
    const response = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const bm = response.data;
    const result = {
      id: bm.id,
      title: `${bm.beatmapset.artist} - ${bm.beatmapset.title}`,
      version: bm.version,
      creator: bm.beatmapset.creator,
      stars: parseFloat(bm.difficulty_rating.toFixed(2)),
      stats: {
        cs: bm.cs,
        ar: bm.ar,
        od: bm.accuracy,
        hp: bm.drain
      },
      bpm: bm.bpm,
      length: {
        total: bm.total_length,
        drain: bm.hit_length,
        formatted: formatSeconds(bm.total_length)
      },
      counts: {
        circles: bm.count_circles,
        sliders: bm.count_sliders,
        spinners: bm.count_spinners
      },
      status: bm.status,
      urls: {
        beatmap: `https://osu.ppy.sh/beatmapsets/${bm.beatmapset.id}#osu/${bm.id}`,
        preview: bm.beatmapset.preview_url,
        cover: bm.beatmapset.covers.card,
        cover_2x: bm.beatmapset.covers['card@2x']
      },
      max_combo: bm.max_combo,
      updated_at: bm.last_updated
    };

    // Cache the result
    beatmapCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('❌ Beatmap error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Beatmap not found' });
    }
    res.status(500).json({ error: 'Failed to fetch beatmap info' });
  }
});

// Enhanced search with pagination
app.get('/api/search', async (req, res) => {
  const { q: query, limit = 10, offset = 0 } = req.query;
  
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const searchLimit = Math.min(parseInt(limit) || 10, 50);
  const searchOffset = parseInt(offset) || 0;

  try {
    const cacheKey = `search_${query}_${searchLimit}_${searchOffset}`;
    const cached = beatmapCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const token = await tokenManager.getAccessToken();
    const response = await axios.get('https://osu.ppy.sh/api/v2/beatmapsets/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { 
        q: query.trim(),
        m: 0, // osu! mode
        s: 'ranked',
        limit: searchLimit,
        offset: searchOffset
      }
    });

    const beatmapsets = response.data.beatmapsets || [];
    const result = {
      results: beatmapsets.map(set => ({
        id: set.id,
        title: `${set.artist} - ${set.title}`,
        creator: set.creator,
        status: set.status,
        bpm: set.bpm,
        play_count: set.play_count,
        favourite_count: set.favourite_count,
        urls: {
          beatmapset: `https://osu.ppy.sh/beatmapsets/${set.id}`,
          preview: set.preview_url,
          cover: set.covers.list,
          cover_2x: set.covers['list@2x']
        },
        difficulties: set.beatmaps.map(bm => ({
          id: bm.id,
          version: bm.version,
          stars: parseFloat(bm.difficulty_rating.toFixed(2)),
          ar: bm.ar,
          od: bm.accuracy
        }))
      })),
      total: response.data.total || 0,
      has_more: (searchOffset + searchLimit) < (response.data.total || 0)
    };

    // Cache results for 30 minutes
    beatmapCache.set(cacheKey, result, 1800);
    res.json(result);
  } catch (err) {
    console.error('❌ Search error:', err.message);
    res.status(500).json({ error: 'Failed to search beatmaps' });
  }
});

// Much more efficient leaderboard endpoint
app.get('/api/user/:username/leaderboards', heavyLimiter, async (req, res) => {
  const username = req.params.username;
  const { type = 'best', limit = 50 } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const cacheKey = `leaderboards_${username}_${type}_${limit}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const token = await tokenManager.getAccessToken();
    
    // Get user info first
    const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${username}/osu`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = userRes.data;
    
    // Get user's best scores instead of scanning all beatmaps
    const scoresRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${user.id}/scores/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { 
        limit: Math.min(parseInt(limit) || 50, 100),
        mode: 'osu'
      }
    });

    const scores = scoresRes.data || [];
    const result = {
      user: {
        id: user.id,
        username: user.username,
        country: user.country.name,
        global_rank: user.statistics.global_rank,
        country_rank: user.statistics.country_rank,
        pp: user.statistics.pp
      },
      scores: scores.map(score => ({
        beatmap: {
          id: score.beatmap.id,
          title: `${score.beatmapset.artist} - ${score.beatmapset.title} [${score.beatmap.version}]`,
          stars: parseFloat(score.beatmap.difficulty_rating.toFixed(2)),
          url: `https://osu.ppy.sh/beatmaps/${score.beatmap.id}`
        },
        score: formatScore(score.score),
        accuracy: (score.accuracy * 100).toFixed(2) + '%',
        pp: score.pp ? Math.round(score.pp) : calculatePP(score.accuracy * 100, score.beatmap.difficulty_rating, score.mods),
        mods: score.mods.length ? score.mods.join('') : 'None',
        rank: score.rank,
        max_combo: score.max_combo,
        created_at: score.created_at,
        replay_available: score.replay
      }))
    };

    // Cache for 10 minutes
    leaderboardCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('❌ Leaderboard error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to fetch user leaderboards' });
  }
});

// Enhanced user profile endpoint
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const cacheKey = `user_${req.session.access_token}`;
    const cached = userCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const userRes = await axios.get('https://osu.ppy.sh/api/v2/me', {
      headers: { Authorization: `Bearer ${req.session.access_token}` }
    });

    const user = userRes.data;
    const result = {
      id: user.id,
      username: user.username,
      country: user.country,
      avatar_url: user.avatar_url,
      is_online: user.is_online,
      statistics: {
        global_rank: user.statistics.global_rank,
        country_rank: user.statistics.country_rank,
        pp: user.statistics.pp,
        ranked_score: user.statistics.ranked_score,
        total_score: user.statistics.total_score,
        accuracy: user.statistics.hit_accuracy,
        play_count: user.statistics.play_count,
        play_time: user.statistics.play_time,
        total_hits: user.statistics.total_hits,
        level: user.statistics.level,
        grades: user.statistics.grade_counts
      },
      join_date: user.join_date,
      last_visit: user.last_visit
    };

    // Cache for 30 minutes
    userCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('❌ Error fetching user info:', err.message);
    if (err.response?.status === 401) {
      // Try to refresh token
      if (req.session.refresh_token) {
        try {
          const newTokens = await tokenManager.refreshUserToken(req.session.refresh_token);
          req.session.access_token = newTokens.access_token;
          req.session.refresh_token = newTokens.refresh_token;
          req.session.token_expiry = Date.now() + (newTokens.expires_in * 1000);
          
          // Retry the request
          return res.redirect('/api/me');
        } catch (refreshErr) {
          console.error('❌ Token refresh failed:', refreshErr.message);
          req.session.destroy();
          return res.status(401).json({ error: 'Session expired, please login again' });
        }
      }
      return res.status(401).json({ error: 'Authentication expired' });
    }
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// New endpoint: Get beatmap scores
app.get('/api/beatmap/:id/scores', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { type = 'global', limit = 50 } = req.query;
    
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Invalid beatmap ID' });
    }

    const cacheKey = `scores_${id}_${type}_${limit}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const token = await tokenManager.getAccessToken();
    const response = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${id}/scores`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        type,
        limit: Math.min(parseInt(limit) || 50, 100)
      }
    });

    const scores = response.data.scores || [];
    const result = scores.map((score, index) => ({
      position: index + 1,
      user: {
        id: score.user.id,
        username: score.user.username,
        country: score.user.country.code,
        avatar_url: score.user.avatar_url
      },
      score: formatScore(score.score),
      accuracy: (score.accuracy * 100).toFixed(2) + '%',
      pp: score.pp ? Math.round(score.pp) : null,
      mods: score.mods.length ? score.mods.join('') : 'None',
      rank: score.rank,
      max_combo: score.max_combo,
      created_at: score.created_at,
      replay_available: score.replay
    }));

    // Cache for 10 minutes
    leaderboardCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('❌ Scores error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Beatmap not found' });
    }
    res.status(500).json({ error: 'Failed to fetch beatmap scores' });
  }
});

// Apply error handling middleware
app.use(handleError);

// Start server
app.listen(port, () => {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  console.log(`✅ Enhanced osu! API server running at ${publicUrl}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Cache enabled with multiple TTL strategies`);
});