// server.js — ArenaHub Backend
// Supporte wallet + guest, plusieurs leaderboards

const express = require('express');
const { verifyMessage } = require('ethers');

const app = express();

// === Middleware CORS (autorise ton frontend) ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://roninarenahub.netlify.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// === Stockage des scores (remplacer par DB plus tard) ===
let scores = [];

// === Route: Health check ===
app.get('/', (req, res) => {
  res.json({ status: 'ArenaHub Backend is running' });
});

// === Route: Submit Score (wallet + guest) ===
app.post('/submit-score', (req, res) => {
  const { address, signature, playerName, score, timestamp } = req.body;

  // === Cas 1 : Mode Wallet (avec signature) ===
  if (address && signature && score !== undefined) {
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ success: false, error: "Invalid score" });
    }

    const message = `Submit score: ${score} at ${timestamp}`;
    try {
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }

      const entry = {
        type: 'wallet',
        address,
        playerName: playerName || 'Anonymous',
        score,
        timestamp
      };
      scores.push(entry);
      const rank = scores.sort((a, b) => b.score - a.score).findIndex(s => s.address === address) + 1;

      return res.json({ success: true, rank });
    } catch (err) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
  }

  // === Cas 2 : Mode Guest (seulement playerName) ===
  if (!address && playerName && score !== undefined) {
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ success: false, error: "Invalid score" });
    }

    const entry = {
      type: 'guest',
      playerName,
      score,
      timestamp: Date.now()
    };
    scores.push(entry);

    return res.json({ success: true });
  }

  // === Cas 3 : Données manquantes ===
  return res.status(400).json({ success: false, error: "Missing required fields" });
});

// === Route: Leaderboard (ex: Roninoid) ===
app.get('/leaderboard/roninoid', (req, res) => {
  const top = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((s, i) => ({
      rank: i + 1,
      name: s.playerName,
      score: s.score,
      address: s.address ? `${s.address.slice(0,6)}...${s.address.slice(-4)}` : null
    }));

  res.json({ success: true, leaderboard: top });
});

// === Route: Exemple pour futur jeu (ex: Catch the Dot) ===
app.get('/leaderboard/catch-the-dot', (req, res) => {
  res.json({ success: true, leaderboard: [] }); // Vide pour l'instant
});

// === Démarrage ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});