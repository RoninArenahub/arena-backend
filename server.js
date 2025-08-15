// server.js — ArenaHub Backend
// Supporte plusieurs jeux via des endpoints dédiés

const express = require('express');

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

// === Stockage des scores (remplacer par DB plus tard) ===
let scores = [];

// === Route: Health check ===
app.get('/', (req, res) => {
  res.json({ status: 'ArenaHub Backend is running' });
});

// === Route: Submit Score for Roninoid ===
app.post('/submit-score-roninoid', (req, res) => {
  const { address, signature, playerName, score, timestamp } = req.body;

  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ success: false, error: "Invalid score" });
  }

  // === Mode Wallet ===
  if (address && signature) {
    try {
      const message = `Submit score: ${score} at ${timestamp}`;
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }

      scores.push({
        game: 'roninoid',
        type: 'wallet',
        address,
        playerName: playerName || 'Anonymous',
        score,
        timestamp
      });

      const rank = scores
        .filter(s => s.game === 'roninoid')
        .sort((a, b) => b.score - a.score)
        .findIndex(s => s.address === address) + 1;

      return res.json({ success: true, rank });
    } catch (err) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
  }

  // === Mode Guest ===
  if (playerName) {
    scores.push({
      game: 'roninoid',
      type: 'guest',
      playerName,
      score,
      timestamp: Date.now()
    });
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, error: "Missing required fields" });
});

// === Route: Leaderboard for Roninoid ===
app.get('/leaderboard/roninoid', (req, res) => {
  const top = scores
    .filter(s => s.game === 'roninoid')
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

// === Démarrage ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});