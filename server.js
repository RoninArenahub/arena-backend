console.log("🚀 Démarrage du serveur...");

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

// === Connexion DB (non bloquante) ===
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://arena_db_22gu_user:tuwcyo7kaqzyiPSojGXt1r1ieO5rtyDU@dpg-d2g12hndiees73cucvfg-a.singapore-postgres.render.com/arena_db_22gu',
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect()
  .then(() => console.log('✅ DB: Connecté'))
  .catch(err => console.error('⚠️ DB: Échec de connexion (non bloquant)', err.message));

client.query('CREATE TABLE IF NOT EXISTS roninoid_scores (id SERIAL, game TEXT, type TEXT, player_name TEXT, address TEXT, score INTEGER, timestamp BIGINT)')
  .then(() => console.log('✅ Table roninoid_scores prête'))
  .catch(err => console.error('⚠️ DB: Erreur création table', err.message));

// === Routes (même si DB plante) ===
app.get('/', (req, res) => {
  res.json({ status: 'ArenaHub Backend is running' });
});

app.post('/submit-score-roninoid', async (req, res) => {
  const { score } = req.body;
  if (typeof score !== 'number') return res.status(400).json({ error: "Invalid score" });

  if (client._ending) {
    // DB non disponible
    return res.json({ success: true, message: "Score accepted (DB offline)" });
  }

  try {
    await client.query('INSERT INTO roninoid_scores (game, score) VALUES ($1, $2)', ['roninoid', score]);
    res.json({ success: true });
  } catch (err) {
    console.error("DB Insert Error:", err.message);
    res.json({ success: true, message: "Score accepted, DB error" });
  }
});

app.get('/leaderboard/roninoid', async (req, res) => {
  if (client._ending) {
    return res.json({ success: true, leaderboard: [] });
  }
  try {
    const result = await client.query('SELECT player_name, score FROM roninoid_scores ORDER BY score DESC LIMIT 10');
    res.json({ success: true, leaderboard: result.rows });
  } catch (err) {
    console.error("DB Read Error:", err.message);
    res.json({ success: true, leaderboard: [] });
  }
});

// === Démarrage serveur (toujours actif) ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend en cours d'exécution sur le port ${PORT}`);
});