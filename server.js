const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const session = require('express-session'); // 🔹 Import session

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔸 Use session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'osu_fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // only true on HTTPS
    maxAge: 3600000 // 1 hour
  }
}));

const client_id = process.env.OSU_CLIENT_ID;
const client_secret = process.env.OSU_CLIENT_SECRET;

let access_token = null;
let token_expiry = 0;

function formatSeconds(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function getAccessToken() {
  const now = Date.now();
  if (access_token && now < token_expiry) return access_token;

  const response = await axios.post('https://osu.ppy.sh/oauth/token', {
    client_id,
    client_secret,
    grant_type: 'client_credentials',
    scope: 'public'
  });

  access_token = response.data.access_token;
  token_expiry = now + (response.data.expires_in * 1000) - 10000;
  return access_token;
}

app.get("/login", (req, res) => {
  const redirect = `https://osu.ppy.sh/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(process.env.OSU_REDIRECT_URI)}&response_type=code&scope=identify public`;
  res.redirect(redirect);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post("https://osu.ppy.sh/oauth/token", {
      client_id,
      client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.OSU_REDIRECT_URI,
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Store in memory (or Redis/DB ideally)
    req.session = {
      access_token,
      refresh_token,
      token_expiry: Date.now() + (expires_in * 1000)
    };

    res.send("✅ Logged in. You may now use the scanner.");
  } catch (err) {
    console.error("OAuth callback failed", err.response?.data || err.message);
    res.status(500).send("OAuth error");
  }
});

// Health check
app.get('/health', (req, res) => {
  res.send('OK');
});

// Fetch beatmap info
app.get('/api/beatmap/:id', async (req, res) => {
  try {
    const token = await getAccessToken();
    const id = req.params.id;

    const response = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const bm = response.data;

    res.json({
      id: bm.id,
      title: `${bm.beatmapset.artist} - ${bm.beatmapset.title} (${bm.beatmapset.creator})`,
      stars: `${bm.difficulty_rating.toFixed(1)}★`,
      cs: bm.cs,
      ar: bm.ar,
      od: bm.accuracy,
      bpm: bm.bpm,
      length: formatSeconds(bm.total_length || 0),
      url: `https://osu.ppy.sh/beatmapsets/${bm.beatmapset.id}#osu/${bm.id}`,
      preview_url: bm.beatmapset.preview_url,
      cover_url: bm.beatmapset.covers.card
    });
  } catch (err) {
    console.error("❌ Beatmap error:", err.message);
    res.status(500).json({ error: 'Failed to fetch beatmap info' });
  }
});

// Search beatmaps
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing ?q=' });

  try {
    const token = await getAccessToken();
    const response = await axios.get('https://osu.ppy.sh/api/v2/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { mode: 'osu', query, type: 'beatmapset' }
    });

    const top = response.data.beatmapsets?.[0];
    if (!top) return res.status(404).json({ error: 'No results found' });

    res.json({
      id: top.id,
      title: `${top.artist} - ${top.title} (${top.creator})`,
      url: `https://osu.ppy.sh/beatmapsets/${top.id}`,
      preview_url: top.preview_url,
      cover_url: top.covers.card
    });
  } catch (err) {
    console.error("❌ Search error:", err.message);
    res.status(500).json({ error: 'Failed to search beatmaps' });
  }
});

// Leaderboard scores
app.get('/api/global-leaderboard', async (req, res) => {
  const username = req.query.user;
  if (!username) return res.status(400).json({ error: 'Missing ?user=' });

  try {
    const token = await getAccessToken();
    const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${username}/osu`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const userId = userRes.data.id;
    const leaderboardMatches = [];

    let page = 1;
    const maxPages = 100; // You can go up to 500+ if needed

    while (page <= maxPages) {
      const searchRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmapsets/search`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { mode: 'osu', status: 'ranked', page }
      });

      const beatmapsets = searchRes.data.beatmapsets || [];

      for (const set of beatmapsets) {
        for (const beatmap of set.beatmaps) {
          try {
            const lbRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmap.id}/scores`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            const scores = lbRes.data.scores;
            const found = scores.find(s => s.user.id === userId);

            if (found) {
              leaderboardMatches.push({
                beatmap: {
                  id: beatmap.id,
                  title: `${set.artist} - ${set.title} [${beatmap.version}]`,
                  url: `https://osu.ppy.sh/beatmaps/${beatmap.id}`
                },
                rank: scores.findIndex(s => s.user.id === userId) + 1,
                score: found.score,
                accuracy: (found.accuracy * 100).toFixed(2) + '%',
                mods: found.mods.join(', ') || 'None'
              });
            }
          } catch (e) {
            // Ignore 404s
          }
        }
      }

      page++;
    }

    res.json(leaderboardMatches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  console.log(`✅ osu! API proxy running at ${publicUrl}`);
});
