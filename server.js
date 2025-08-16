// server.js — ArenaHub Backend
// Affiche nom + adresse seulement pour les wallets

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

// === Connexion à PostgreSQL ===
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://arena_db_22gu_user:tuwcyo7kaqzyiPSojGXt1r1ieO5rtyDU@dpg-d2g12hndiees73cucvfg-a.singapore-postgres.render.com/arena_db_22gu',
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect()
  .then(() => console.log('✅ Connecté à PostgreSQL'))
  .catch(err => console.error('⚠️ Échec de connexion (non bloquant):', err.message));

// === Crée la table ===
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS roninoid_scores (
    id SERIAL PRIMARY KEY,
    game TEXT,
    type TEXT,
    player_name TEXT,
    address TEXT,
    score INTEGER,
    timestamp BIGINT
  );
`;
client.query(createTableQuery)
  .then(() => console.log('✅ Table roninoid_scores prête'))
  .catch(err => console.error('❌ Erreur création table:', err));

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
      console.error("Erreur en mode Wallet:", err);
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
    console.error("Erreur lors du chargement du leaderboard", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// === Démarrage du serveur ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend en cours d'exécution sur le port ${PORT}`);
});