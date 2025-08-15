// server.js
// ArenaHub Backend API
// Secure Web3 authentication and score validation

const express = require('express');
const { verifyMessage } = require('ethers');
const rateLimit = require('express-rate-limit');

const app = express();

// === Middleware ===
app.use(express.json());

// === Rate Limiting (anti-spam) ===
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requêtes max
});
app.use(limiter);

// === In-memory storage (remplacer par DB plus tard) ===
let scores = [];
let userProfiles = new Map(); // address → { totalScore, gamesPlayed }

// === Helper: Valider le message ===
function isValidMessage(address, score, timestamp, signature) {
  // Vérifie le timestamp (pas de replay > 5 min)
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return { valid: false, reason: "Timestamp expired" };
  }

  // Régénère le message
  const message = `Submit score: ${score} at ${timestamp}`;

  // Vérifie la signature
  try {
    const recovered = verifyMessage(message, signature);
    const isValid = recovered.toLowerCase() === address.toLowerCase();
    return { valid: isValid, reason: isValid ? "ok" : "Invalid signature" };
  } catch (err) {
    return { valid: false, reason: "Invalid signature format" };
  }
}

// === Route: Health check ===
app.get('/', (req, res) => {
  res.json({ status: 'ArenaHub Backend is running' });
});

// === Route: Submit Score (sécurisée) ===
app.post('/submit-score', (req, res) => {
  const { address, score, timestamp, signature } = req.body;

  // Validation des champs
  if (!address || score === undefined || !timestamp || !signature) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields"
    });
  }

  // Validation du type
  if (typeof score !== 'number' || score < 0 || score > 1e7) {
    return res.status(400).json({
      success: false,
      error: "Invalid score"
    });
  }

  // Vérification de la signature
  const { valid, reason } = isValidMessage(address, score, timestamp, signature);
  if (!valid) {
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
      reason
    });
  }

  // Vérifie si déjà soumis (anti-doublon)
  const alreadySubmitted = scores.some(s => s.address === address && s.timestamp === timestamp);
  if (alreadySubmitted) {
    return res.status(400).json({
      success: false,
      error: "Score already submitted"
    });
  }

  // Sauvegarde le score
  const entry = { address, score, timestamp };
  scores.push(entry);

  // Met à jour le profil
  if (!userProfiles.has(address)) {
    userProfiles.set(address, { totalScore: 0, gamesPlayed: 0 });
  }
  const profile = userProfiles.get(address);
  profile.totalScore += score;
  profile.gamesPlayed += 1;

  console.log(`✅ Score validated: ${address} | ${score} pts`);

  res.json({
    success: true,
    message: "Score submitted and verified",
    rank: scores.sort((a, b) => b.score - a.score).findIndex(s => s.address === address) + 1
  });
});

// === Route: Get Leaderboard ===
app.get('/leaderboard', (req, res) => {
  const top = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((s, i) => ({
      rank: i + 1,
      address: s.address,
      score: s.score
    }));

  res.json({ success: true, leaderboard: top });
});

// === Route: Get User Profile ===
app.get('/profile/:address', (req, res) => {
  const address = req.params.address.toLowerCase();
  const userScores = scores.filter(s => s.address.toLowerCase() === address);
  const profile = userProfiles.get(address) || { totalScore: 0, gamesPlayed: 0 };

  res.json({
    success: true,
    profile: {
      address,
      gamesPlayed: profile.gamesPlayed,
      totalScore: profile.totalScore,
      bestScore: Math.max(...userScores.map(s => s.score), 0)
    }
  });
});

// === Démarrage du serveur ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ ArenaHub Backend running on port ${PORT}`);
  console.log(`🔗 API: https://api.arenahub.com (à lier plus tard)`);
});

module.exports = app;