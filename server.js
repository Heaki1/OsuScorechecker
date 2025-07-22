const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
app.get('/api/leaderboard-scores', async (req, res) => {
  const username = req.query.user;
  if (!username) return res.status(400).json({ error: 'Missing ?user=' });

  try {
    const token = await getAccessToken();
    console.log("🔍 Fetching user ID for:", username);

    const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${username}/osu`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const userId = userRes.data.id;
    console.log(`✅ Found user ID: ${userId}`);

    const leaderboardMatches = [];

    let page = 1;
    const maxPages = 10; // You can increase this for deeper scanning

    while (page <= maxPages) {
      console.log(`📄 Fetching beatmaps page ${page}`);

      const searchRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmapsets/search`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          mode: 'osu',
          status: 'ranked',
          page
        }
      });

      const beatmapsets = searchRes.data.beatmapsets || [];

      for (const set of beatmapsets) {
        for (const beatmap of set.beatmaps) {
          try {
            const leaderboardRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmap.id}/scores`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            const scores = leaderboardRes.data.scores;
            const found = scores.find(s => s.user.id === userId);

            if (found) {
              const rank = scores.findIndex(s => s.user.id === userId) + 1;
              console.log(`✅ Found on map ${set.artist} - ${set.title} [${beatmap.version}] at rank ${rank}`);

              leaderboardMatches.push({
                beatmap: {
                  id: beatmap.id,
                  title: `${set.artist} - ${set.title} [${beatmap.version}]`,
                  url: `https://osu.ppy.sh/beatmaps/${beatmap.id}`
                },
                rank,
                score: found.score,
                accuracy: (found.accuracy * 100).toFixed(2) + '%',
                mods: found.mods.join(', ') || 'None'
              });
            }
          } catch (err) {
            console.warn(`⚠️ Failed leaderboard fetch for map ${beatmap.id}:`, err.response?.data || err.message);
          }
        }
      }

      page++;
    }

    res.json(leaderboardMatches);
  } catch (err) {
    console.error("❌ Leaderboard error details:", err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard scores' });
  }
});

app.listen(port, () => {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  console.log(`✅ osu! API proxy running at ${publicUrl}`);
});
