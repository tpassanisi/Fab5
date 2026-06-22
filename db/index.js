const mysql = require('mysql2/promise');

let pool = null;

function init(config) {
  if (typeof config === 'string') {
    pool = mysql.createPool({
      uri: config,
      waitForConnections: true,
      connectionLimit: 10,
    });
  } else {
    pool = mysql.createPool({
      host: config.host || 'localhost',
      user: config.user || 'root',
      password: config.password || '',
      database: config.database || 'fab5',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  pool.getConnection()
    .then(conn => { console.log('Database connected'); conn.release(); })
    .catch(err => { console.error('Database connection FAILED:', err.message); pool = null; });
}

async function ensurePlayer(playerId, name) {
  if (!pool) return;
  await pool.execute(
    'INSERT INTO players (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = ?, last_seen = NOW()',
    [playerId, name, name]
  );
  await pool.execute(
    'INSERT IGNORE INTO player_stats (player_id) VALUES (?)',
    [playerId]
  );
}

async function recordRound({ gameCode, attackerId, defenderId, attackerCardId, defenderCardId, category, winnerId, loserId }) {
  if (!pool) return;

  await pool.execute(
    'INSERT INTO match_history (game_code, attacker_id, defender_id, attacker_card_id, defender_card_id, category, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [gameCode, attackerId, defenderId, attackerCardId, defenderCardId, category, winnerId]
  );

  const winnerCardId = winnerId === attackerId ? attackerCardId : defenderCardId;
  const loserCardId = loserId === attackerId ? attackerCardId : defenderCardId;

  // Update global card stats
  await pool.execute(
    'UPDATE card_stats SET times_played = times_played + 1, wins = wins + 1 WHERE card_id = ?',
    [winnerCardId]
  );
  await pool.execute(
    'UPDATE card_stats SET times_played = times_played + 1, losses = losses + 1 WHERE card_id = ?',
    [loserCardId]
  );

  // Update player card stats — winner
  await pool.execute(
    `INSERT INTO player_card_stats (player_id, card_id, times_played, wins) VALUES (?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE times_played = times_played + 1, wins = wins + 1`,
    [winnerId, winnerCardId]
  );

  // Update player card stats — loser
  await pool.execute(
    `INSERT INTO player_card_stats (player_id, card_id, times_played, losses) VALUES (?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE times_played = times_played + 1, losses = losses + 1`,
    [loserId, loserCardId]
  );
}

async function recordGameWin(playerId) {
  if (!pool || !playerId) return;
  await pool.execute(
    'UPDATE player_stats SET wins = wins + 1, games_played = games_played + 1 WHERE player_id = ?',
    [playerId]
  );
}

async function recordGameLoss(playerId) {
  if (!pool || !playerId) return;
  await pool.execute(
    'UPDATE player_stats SET losses = losses + 1, games_played = games_played + 1 WHERE player_id = ?',
    [playerId]
  );
}

async function getPlayerStats(playerId) {
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT p.name, ps.wins, ps.losses, ps.games_played
     FROM players p JOIN player_stats ps ON p.id = ps.player_id
     WHERE p.id = ?`,
    [playerId]
  );
  if (!rows.length) return null;

  const [cardRows] = await pool.execute(
    `SELECT pcs.card_id, cs.card_name, pcs.times_played, pcs.wins, pcs.losses
     FROM player_card_stats pcs JOIN card_stats cs ON pcs.card_id = cs.card_id
     WHERE pcs.player_id = ? ORDER BY pcs.times_played DESC`,
    [playerId]
  );

  return { ...rows[0], cards: cardRows };
}

async function getCardStats(cardId) {
  if (!pool) return null;
  const [rows] = await pool.execute(
    'SELECT * FROM card_stats WHERE card_id = ?',
    [cardId]
  );
  return rows[0] || null;
}

async function getLeaderboard() {
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT p.name, ps.wins, ps.losses, ps.games_played
     FROM players p JOIN player_stats ps ON p.id = ps.player_id
     WHERE ps.games_played > 0
     ORDER BY ps.wins DESC LIMIT 20`
  );
  return rows;
}

async function getTopCards() {
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT card_id, card_name, times_played, wins, losses,
     ROUND(wins / GREATEST(times_played, 1) * 100) as win_rate
     FROM card_stats WHERE times_played > 0
     ORDER BY win_rate DESC LIMIT 20`
  );
  return rows;
}

module.exports = { init, ensurePlayer, recordRound, recordGameWin, recordGameLoss, getPlayerStats, getCardStats, getLeaderboard, getTopCards };
