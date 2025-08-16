// server.js — ArenaHub Backend
// Backend Node.js pour Roninoid avec PostgreSQL

const express = require('express');
const { Client } = require('pg');
const { verifyMessage } = require('ethers');

const app = express();

// === Middleware CORS ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://roninarenahub.netlify.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

// === Connexion à PostgreSQL ===
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect()
  .catch(err => console.error('⚠️ DB: Échec de connexion (non bloquant)', err.message));

// === Route: Health check ===
app.get('/', (req, res) => {
  res.json({ status: 'ArenaHub Backend is running' });
});

// === Route: Submit Score for Roninoid ===
app.post('/submit-score-roninoid', async (req, res) => {
  const { address, signature, playerName, score, timestamp } = req.body;

  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ success: false, error: "Invalid score" });
  }

  // === Mode Wallet ===
  if (address && signature && timestamp) {
    try {
      const message = `Submit score: ${score} at ${timestamp}`;
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }

      const nameToSave = (playerName && playerName.trim()) ? playerName.trim() : 'Anonymous';

      const query = `
        INSERT INTO roninoid_scores (game, type, player_name, address, score, timestamp)
        VALUES ('roninoid', 'wallet', $1, $2, $3, $4)
      `;
      await client.query(query, [nameToSave, address, score, timestamp]);

      const rankQuery = `
        SELECT rank FROM (
          SELECT address, RANK() OVER (ORDER BY score DESC) as rank
          FROM roninoid_scores WHERE game = 'roninoid'
        ) ranked WHERE address = $1
      `;
      const rankResult = await client.query(rankQuery, [address]);
      const rank = rankResult.rows[0]?.rank || 1;

      return res.json({ success: true, rank });
    } catch (err) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
  }

  // === Mode Guest ===
  if (!address && playerName && score !== undefined) {
    const nameToSave = (playerName && playerName.trim()) ? playerName.trim() : 'Anonymous';

    const query = `
      INSERT INTO roninoid_scores (game, type, player_name, score, timestamp)
      VALUES ('roninoid', 'guest', $1, $2, $3)
    `;
    await client.query(query, [nameToSave, score, Date.now()]);

    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, error: "Missing required fields" });
});

// === Route: Leaderboard for Roninoid ===
app.get('/leaderboard/roninoid', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT player_name, address, score FROM roninoid_scores
      WHERE game = 'roninoid'
      ORDER BY score DESC
      LIMIT 100
    `);

    const leaderboard = result.rows.map((row, i) => ({
      rank: i + 1,
      name: row.player_name || 'Anonymous',
      address: row.address ? `${row.address.slice(0,6)}...${row.address.slice(-4)}` : null,
      score: row.score
    }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// === Route: Admin Reset Roninoid Scores ===
app.post('/admin/reset-roninoid', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, error: "Password required" });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: "Invalid password" });
  }

  const now = Date.now();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM roninoid_scores WHERE game = $1', ['roninoid']);
    await client.query(
      'INSERT INTO admin_log (action, game, timestamp) VALUES ($1, $2, $3)',
      ['reset', 'roninoid', now]
    );
    await client.query('COMMIT');

    return res.json({ success: true, message: 'Scores reset successfully', resetAt: now });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// === Route: Get last reset info for a game ===
app.get('/admin/reset-info/:game', async (req, res) => {
  const { game } = req.params;

  try {
    const result = await client.query(
      'SELECT timestamp FROM admin_log WHERE game = $1 AND action = $2 ORDER BY timestamp DESC LIMIT 1',
      [game, 'reset']
    );

    if (result.rows.length > 0) {
      const timestamp = parseInt(result.rows[0].timestamp, 10);
      const lastReset = new Date(timestamp).toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      return res.json({ success: true, resetAt: timestamp, formatted: lastReset });
    } else {
      return res.json({ success: true, resetAt: null, formatted: 'Never reset' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// === Démarrage du serveur ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend en cours d'exécution sur le port ${PORT}`);
});