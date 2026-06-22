const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cards = require('./data/cards');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// Initialize database if credentials are provided
if (process.env.DATABASE_URL) {
  db.init(process.env.DATABASE_URL);
} else if (process.env.DB_HOST || process.env.DB_USER) {
  db.init({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'fab5',
  });
}

// API endpoints for stats
app.get('/api/player/:id', async (req, res) => {
  const stats = await db.getPlayerStats(req.params.id);
  if (!stats) return res.status(404).json({ error: 'Player not found' });
  res.json(stats);
});

app.get('/api/card/:id', async (req, res) => {
  const stats = await db.getCardStats(parseInt(req.params.id));
  if (!stats) return res.status(404).json({ error: 'Card not found' });
  res.json(stats);
});

app.get('/api/card-stats-all', async (req, res) => {
  const stats = await db.getAllCardStats();
  res.json(stats || {});
});

app.get('/api/leaderboard', async (req, res) => {
  res.json(await db.getLeaderboard());
});

app.get('/api/top-cards', async (req, res) => {
  res.json(await db.getTopCards());
});

const games = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function generatePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

const ALL_CATEGORIES = [
  { key: 'strength', label: 'Strength' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'looks', label: 'Looks' },
  { key: 'impact', label: 'Impact on the World' },
  { key: 'talent', label: 'Talent' },
  { key: 'class', label: 'Class' },
  { key: 'humor', label: 'Sense of Humor' },
  { key: 'stability', label: 'Mental Stability' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'luck', label: 'Luck' },
  { key: 'wealth', label: 'Wealth' },
  { key: 'style', label: 'Style' },
];

function selectGameCategories() {
  const shuffled = shuffle(ALL_CATEGORIES);
  return shuffled.slice(0, 6);
}

function getCategoryLabel(game, key) {
  const cat = game.activeCategories.find(c => c.key === key);
  return cat ? cat.label : key;
}

function isBot(game, pid) {
  const p = game.players.find(pl => pl.id === pid);
  return p && p.isBot;
}

function botRollOpponent(game) {
  const active = getActivePlayers(game);
  const botPid = game.currentTurnPlayerId;

  let roll;
  let attempts = 0;
  do {
    roll = rollDice();
    attempts++;
    if (attempts > 100) return;
  } while (
    roll > game.turnOrder.length ||
    game.turnOrder[roll - 1] === botPid ||
    !active.find(p => p.id === game.turnOrder[roll - 1])
  );

  game.currentRoll = roll;
  game.opponentId = game.turnOrder[roll - 1];
  game.phase = 'rolling-category';

  io.to(game.code).emit('opponent-rolled', {
    roll,
    attackerId: botPid,
    opponentId: game.opponentId,
    opponentName: game.players.find(p => p.id === game.opponentId)?.name,
    phase: game.phase,
  });

  setTimeout(() => botRollCategory(game), 1500);
}

function botRollCategory(game) {
  if (game.phase !== 'rolling-category') return;

  const roll = rollDice();
  game.categoryRoll = roll;
  game.category = game.activeCategories[roll - 1].key;
  game.phase = 'selecting-cards';
  game.attackerCard = null;
  game.defenderCard = null;

  io.to(game.code).emit('category-rolled', {
    roll,
    category: game.category,
    categoryLabel: getCategoryLabel(game, game.category),
    attackerId: game.currentTurnPlayerId,
    defenderId: game.opponentId,
    phase: game.phase,
  });

  botSelectCard(game);
}

function botSelectCard(game) {
  if (game.phase !== 'selecting-cards') return;

  const botPid = isBot(game, game.currentTurnPlayerId) ? game.currentTurnPlayerId : game.opponentId;
  const botPlayer = game.players.find(p => p.id === botPid);
  if (!botPlayer || !botPlayer.isBot) return;

  const cat = game.category;
  let bestIdx = -1;
  let bestVal = -1;
  botPlayer.cards.forEach((c, i) => {
    if (!c.flipped && c[cat] > bestVal) {
      bestVal = c[cat];
      bestIdx = i;
    }
  });
  if (bestIdx === -1) return;

  setTimeout(() => {
    if (game.phase !== 'selecting-cards') return;

    if (botPid === game.currentTurnPlayerId) {
      game.attackerCard = bestIdx;
    } else {
      game.defenderCard = bestIdx;
    }

    io.to(game.code).emit('card-selected', {
      playerId: botPid,
      playerName: botPlayer.name,
      isAttacker: botPid === game.currentTurnPlayerId,
    });

    if (game.attackerCard !== null && game.defenderCard !== null) {
      resolveRoundForGame(game);
    }
  }, 1200);
}

function getActivePlayers(game) {
  return game.players.filter(p => p.cards.some(c => !c.flipped));
}

function nextTurn(game) {
  const active = getActivePlayers(game);
  if (active.length <= 1) {
    game.phase = 'gameover';
    game.winner = active[0] || null;
    return;
  }

  let idx = game.turnOrder.indexOf(game.currentTurnPlayerId);
  for (let i = 0; i < game.turnOrder.length; i++) {
    idx = (idx + 1) % game.turnOrder.length;
    const pid = game.turnOrder[idx];
    const p = game.players.find(pl => pl.id === pid);
    if (p && p.cards.some(c => !c.flipped)) {
      game.currentTurnPlayerId = pid;
      break;
    }
  }

  game.currentRoll = null;
  game.categoryRoll = null;
  game.category = null;
  game.attackerCard = null;
  game.defenderCard = null;

  if (active.length === 2) {
    game.opponentId = active.find(p => p.id !== game.currentTurnPlayerId).id;
    game.phase = 'rolling-category';
  } else {
    game.opponentId = null;
    game.phase = 'rolling-opponent';
  }
}

function resolveRoundForGame(game) {
  const roomCode = game.code;
  const attacker = game.players.find(p => p.id === game.currentTurnPlayerId);
  const defender = game.players.find(p => p.id === game.opponentId);
  const aCard = attacker.cards[game.attackerCard];
  const dCard = defender.cards[game.defenderCard];
  const cat = game.category;

  if (aCard[cat] === dCard[cat]) {
    game.phase = 'rolling-category';
    io.to(roomCode).emit('round-tie', {
      attackerCard: aCard,
      defenderCard: dCard,
      category: cat,
      categoryLabel: getCategoryLabel(game, cat),
      value: aCard[cat],
      phase: game.phase,
    });
    if (isBot(game, game.currentTurnPlayerId)) {
      setTimeout(() => botRollCategory(game), 2000);
    }
    return;
  }

  const attackerWins = aCard[cat] > dCard[cat];
  const winnerId = attackerWins ? attacker.id : defender.id;
  const loserId = attackerWins ? defender.id : attacker.id;
  const loser = attackerWins ? defender : attacker;
  const loserCardIdx = attackerWins ? game.defenderCard : game.attackerCard;
  loser.cards[loserCardIdx].flipped = true;

  game.phase = 'round-result';

  const active = getActivePlayers(game);

  db.recordRound({
    gameCode: roomCode,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerCardId: aCard.id,
    defenderCardId: dCard.id,
    category: cat,
    winnerId,
    loserId,
  }).catch(() => {});

  io.to(roomCode).emit('round-result', {
    attackerCard: aCard,
    defenderCard: dCard,
    category: cat,
    categoryLabel: getCategoryLabel(game, cat),
    winnerId,
    winnerName: attackerWins ? attacker.name : defender.name,
    loserId,
    loserName: loser.name,
    loserCardIdx,
    phase: game.phase,
  });

  game.players.forEach(p => {
    const s = getSocketForPlayer(p.id);
    if (s) {
      s.emit('cards-update', { yourCards: p.cards });
    }
  });

  if (active.length <= 1) {
    game.phase = 'gameover';
    game.winner = active[0] || null;

    game.players.filter(p => !p.isBot).forEach(p => {
      if (game.winner && p.id === game.winner.id) {
        db.recordGameWin(p.id).catch(() => {});
      } else {
        db.recordGameLoss(p.id).catch(() => {});
      }
    });

    const winnerCards = game.winner ? game.winner.cards.filter(c => !c.flipped) : [];
    io.to(roomCode).emit('game-over', {
      winnerId: game.winner?.id,
      winnerName: game.winner?.name,
      winnerCards,
    });
    return;
  }

  setTimeout(() => {
    nextTurn(game);
    io.to(roomCode).emit('next-turn', {
      currentTurnPlayerId: game.currentTurnPlayerId,
      currentTurnPlayerName: game.players.find(p => p.id === game.currentTurnPlayerId)?.name,
      phase: game.phase,
      opponentId: game.opponentId,
      opponentName: game.opponentId ? game.players.find(p => p.id === game.opponentId)?.name : null,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        activeCards: p.cards.filter(c => !c.flipped).length,
      })),
    });

    if (isBot(game, game.currentTurnPlayerId)) {
      game.botTurnPending = true;
    }
  }, 3000);
}

function startGameAfterDraft(game) {
  game.currentTurnPlayerId = game.turnOrder[0];

  const active = getActivePlayers(game);
  if (active.length === 2) {
    game.opponentId = active.find(p => p.id !== game.currentTurnPlayerId).id;
    game.phase = 'rolling-category';
  } else {
    game.phase = 'rolling-opponent';
  }

  game.players.forEach(p => {
    const s = getSocketForPlayer(p.id);
    if (s) {
      s.emit('draft-complete', {
        phase: game.phase,
        currentTurnPlayerId: game.currentTurnPlayerId,
        opponentId: game.opponentId || null,
        opponentName: game.opponentId ? game.players.find(pl => pl.id === game.opponentId)?.name : null,
        players: game.players.map(pl => ({ id: pl.id, name: pl.name, activeCards: pl.cards.length })),
      });
    }
  });
}

const socketToPlayer = {};

function getSocketForPlayer(pid) {
  for (const [sid, pid2] of Object.entries(socketToPlayer)) {
    if (pid2 === pid) {
      const s = io.sockets.sockets.get(sid);
      if (s) return s;
    }
  }
  return null;
}

io.on('connection', (socket) => {
  let currentGame = null;
  let playerId = null;

  socket.on('create-game', (name, cb) => {
    let code;
    do { code = generateCode(); } while (games[code]);

    playerId = generatePlayerId();
    socketToPlayer[socket.id] = playerId;
    db.ensurePlayer(playerId, name).catch(() => {});
    const game = {
      code,
      hostId: playerId,
      players: [{ id: playerId, name, cards: [], connected: true }],
      started: false,
      turnOrder: [],
      currentTurnPlayerId: null,
      phase: 'lobby',
      currentRoll: null,
      opponentId: null,
      categoryRoll: null,
      category: null,
      attackerCard: null,
      defenderCard: null,
      winner: null,
      mode: 'classic',
    };
    games[code] = game;
    currentGame = code;
    socket.join(code);
    cb({ success: true, code, playerId });
  });

  socket.on('set-mode', (mode) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.hostId) return;
    if (game.started) return;
    if (mode !== 'classic' && mode !== 'pro') return;
    game.mode = mode;
    io.to(currentGame).emit('mode-update', { mode });
  });

  socket.on('create-solo-game', (name, cb) => {
    let code;
    do { code = generateCode(); } while (games[code]);

    playerId = generatePlayerId();
    const botId = generatePlayerId();
    socketToPlayer[socket.id] = playerId;

    const game = {
      code,
      hostId: playerId,
      players: [
        { id: playerId, name, cards: [], connected: true },
        { id: botId, name: 'Computer', cards: [], connected: true, isBot: true },
      ],
      started: false,
      turnOrder: [],
      currentTurnPlayerId: null,
      phase: 'lobby',
      currentRoll: null,
      opponentId: null,
      categoryRoll: null,
      category: null,
      attackerCard: null,
      defenderCard: null,
      winner: null,
      mode: 'classic',
    };
    games[code] = game;
    currentGame = code;
    socket.join(code);
    cb({ success: true, code, playerId });
  });

  socket.on('start-solo-game', (mode) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.hostId) return;
    if (game.started) return;
    game.mode = (mode === 'pro') ? 'pro' : 'classic';

    const botId = game.players.find(p => p.isBot)?.id;

    game.activeCategories = selectGameCategories();

    // Auto-start the solo game
    const deck = shuffle(cards).slice(0, 12);
    game.players[0].cards = deck.slice(0, 6).map(c => ({ ...c, flipped: false }));
    game.players[1].cards = deck.slice(6, 12).map(c => ({ ...c, flipped: false }));
    game.players[0].discarded = false;
    game.players[1].discarded = false;

    game.started = true;
    game.turnOrder = [playerId, botId];
    game.phase = 'drafting';

    socket.emit('game-started', {
      yourCards: game.players[0].cards,
      players: game.players.map(pl => ({ id: pl.id, name: pl.name, cardCount: 6 })),
      turnOrder: game.turnOrder,
      currentTurnPlayerId: null,
      phase: game.phase,
      yourId: playerId,
      mode: game.mode,
      allCategories: ALL_CATEGORIES.map(c => c.key),
      activeCategories: game.activeCategories.map(c => c.key),
    });

    // Bot auto-discards its weakest card
    const bot = game.players[1];
    let worstIdx = 0;
    let worstTotal = Infinity;
    bot.cards.forEach((c, i) => {
      const total = c.strength + c.intelligence + c.looks + c.impact + c.talent + c.class;
      if (total < worstTotal) { worstTotal = total; worstIdx = i; }
    });
    bot.cards.splice(worstIdx, 1);
    bot.discarded = true;
  });

  socket.on('join-game', (code, name, cb) => {
    const game = games[code.toUpperCase()];
    if (!game) return cb({ success: false, error: 'Game not found' });
    if (game.started) return cb({ success: false, error: 'Game already started' });
    if (game.players.length >= 6) return cb({ success: false, error: 'Game is full' });

    playerId = generatePlayerId();
    socketToPlayer[socket.id] = playerId;
    db.ensurePlayer(playerId, name).catch(() => {});
    game.players.push({ id: playerId, name, cards: [], connected: true });
    currentGame = code.toUpperCase();
    socket.join(currentGame);
    io.to(currentGame).emit('lobby-update', {
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      hostId: game.hostId,
    });
    cb({ success: true, code: currentGame, playerId });
  });

  socket.on('reorder-players', (orderedIds) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.hostId) return;
    const reordered = orderedIds.map(id => game.players.find(p => p.id === id)).filter(Boolean);
    if (reordered.length === game.players.length) {
      game.players = reordered;
      io.to(currentGame).emit('lobby-update', {
        players: game.players.map(p => ({ id: p.id, name: p.name })),
        hostId: game.hostId,
      });
    }
  });

  socket.on('start-game', () => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.hostId) return;
    if (game.players.length < 2) return;

    game.activeCategories = selectGameCategories();

    const deck = shuffle(cards).slice(0, game.players.length * 6);
    game.players.forEach((p, i) => {
      p.cards = deck.slice(i * 6, i * 6 + 6).map(c => ({ ...c, flipped: false }));
      p.discarded = false;
    });

    game.started = true;
    game.turnOrder = game.players.map(p => p.id);
    game.phase = 'drafting';

    game.players.forEach(p => {
      const s = getSocketForPlayer(p.id);
      if (s) {
        s.emit('game-started', {
          yourCards: p.cards,
          players: game.players.map(pl => ({ id: pl.id, name: pl.name, cardCount: pl.cards.length })),
          turnOrder: game.turnOrder,
          currentTurnPlayerId: null,
          phase: game.phase,
          yourId: p.id,
          mode: game.mode,
          allCategories: ALL_CATEGORIES.map(c => c.key),
          activeCategories: game.activeCategories.map(c => c.key),
        });
      }
    });
  });

  socket.on('discard-card', (cardIndex) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (game.phase !== 'drafting') return;

    const player = game.players.find(p => p.id === playerId);
    if (!player || player.discarded) return;
    if (cardIndex < 0 || cardIndex >= player.cards.length) return;

    player.cards.splice(cardIndex, 1);
    player.discarded = true;

    const s = getSocketForPlayer(player.id);
    if (s) s.emit('cards-update', { yourCards: player.cards });

    io.to(currentGame).emit('player-discarded', { playerName: player.name });

    if (game.players.every(p => p.discarded)) {
      startGameAfterDraft(game);
    }
  });

  socket.on('roll-opponent', () => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.currentTurnPlayerId) return;
    if (game.phase !== 'rolling-opponent') return;

    const active = getActivePlayers(game);
    const playerNumbers = {};
    game.turnOrder.forEach((pid, i) => { playerNumbers[pid] = i + 1; });

    let roll;
    let attempts = 0;
    do {
      roll = rollDice();
      attempts++;
      if (attempts > 100) return;
    } while (
      roll > game.turnOrder.length ||
      game.turnOrder[roll - 1] === playerId ||
      !active.find(p => p.id === game.turnOrder[roll - 1])
    );

    game.currentRoll = roll;
    game.opponentId = game.turnOrder[roll - 1];
    game.phase = 'rolling-category';

    io.to(currentGame).emit('opponent-rolled', {
      roll,
      attackerId: playerId,
      opponentId: game.opponentId,
      opponentName: game.players.find(p => p.id === game.opponentId)?.name,
      phase: game.phase,
    });
  });

  socket.on('roll-category', () => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (playerId !== game.currentTurnPlayerId) return;
    if (game.phase !== 'rolling-category') return;

    const roll = rollDice();
    game.categoryRoll = roll;
    game.category = game.activeCategories[roll - 1].key;
    game.phase = 'selecting-cards';
    game.attackerCard = null;
    game.defenderCard = null;

    io.to(currentGame).emit('category-rolled', {
      roll,
      category: game.category,
      categoryLabel: getCategoryLabel(game, game.category),
      attackerId: game.currentTurnPlayerId,
      defenderId: game.opponentId,
      phase: game.phase,
    });

    if (isBot(game, game.opponentId) || isBot(game, game.currentTurnPlayerId)) {
      botSelectCard(game);
    }
  });

  socket.on('select-card', (cardIndex) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (game.phase !== 'selecting-cards') return;

    const player = game.players.find(p => p.id === playerId);
    if (!player) return;
    if (cardIndex < 0 || cardIndex >= player.cards.length) return;
    if (player.cards[cardIndex].flipped) return;

    if (playerId === game.currentTurnPlayerId) {
      game.attackerCard = cardIndex;
    } else if (playerId === game.opponentId) {
      game.defenderCard = cardIndex;
    } else {
      return;
    }

    io.to(currentGame).emit('card-selected', {
      playerId: playerId,
      playerName: player.name,
      isAttacker: playerId === game.currentTurnPlayerId,
    });

    if (game.attackerCard !== null && game.defenderCard !== null) {
      resolveRound(game);
    }
  });

  function resolveRound(game) {
    resolveRoundForGame(game);
  }

  socket.on('ready-for-next', () => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (!game.botTurnPending) return;
    game.botTurnPending = false;

    if (isBot(game, game.currentTurnPlayerId)) {
      if (game.phase === 'rolling-category') {
        setTimeout(() => botRollCategory(game), 1500);
      } else {
        setTimeout(() => botRollOpponent(game), 1500);
      }
    }
  });

  socket.on('view-cards', (targetPlayerId, cb) => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    if (!game.started) return;
    const target = game.players.find(p => p.id === targetPlayerId);
    if (!target) return;
    cb({
      cards: target.cards.map(c => ({
        name: c.name,
        category: c.category,
        flipped: c.flipped,
      })),
    });
  });

  socket.on('get-my-stats', async (cb) => {
    if (!playerId) return cb(null);
    const stats = await db.getPlayerStats(playerId).catch(() => null);
    cb(stats);
  });

  socket.on('request-lobby', () => {
    if (!currentGame || !games[currentGame]) return;
    const game = games[currentGame];
    socket.emit('lobby-update', {
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      hostId: game.hostId,
    });
  });

  socket.on('rejoin-game', (data, cb) => {
    const game = games[data.code];
    if (!game) return cb({ success: false, error: 'Game not found' });

    const player = game.players.find(p => p.id === data.playerId);
    if (!player) return cb({ success: false, error: 'Player not in game' });

    playerId = data.playerId;
    currentGame = data.code;
    socketToPlayer[socket.id] = playerId;
    player.connected = true;
    socket.join(currentGame);

    if (!game.started) {
      cb({ success: true, phase: 'lobby', code: currentGame, playerId });
      socket.emit('lobby-update', {
        players: game.players.map(p => ({ id: p.id, name: p.name })),
        hostId: game.hostId,
      });
      return;
    }

    cb({
      success: true,
      phase: game.phase,
      code: currentGame,
      playerId,
    });

    socket.emit('game-started', {
      yourCards: player.cards,
      players: game.players.map(pl => ({ id: pl.id, name: pl.name, cardCount: pl.cards.length })),
      turnOrder: game.turnOrder,
      currentTurnPlayerId: game.currentTurnPlayerId,
      phase: game.phase,
      yourId: playerId,
      mode: game.mode,
      allCategories: ALL_CATEGORIES.map(c => c.key),
      activeCategories: game.activeCategories ? game.activeCategories.map(c => c.key) : null,
      hasDiscarded: player.discarded || false,
    });

    if (game.phase === 'selecting-cards') {
      socket.emit('category-rolled', {
        roll: game.categoryRoll,
        category: game.category,
        categoryLabel: getCategoryLabel(game, game.category),
        attackerId: game.currentTurnPlayerId,
        defenderId: game.opponentId,
        phase: game.phase,
      });
    }
  });

  socket.on('disconnect', () => {
    delete socketToPlayer[socket.id];
    if (currentGame && games[currentGame]) {
      const game = games[currentGame];
      const player = game.players.find(p => p.id === playerId);
      if (player) player.connected = false;

      if (!game.started) {
        game.players = game.players.filter(p => p.id !== playerId);
        if (game.players.length === 0) {
          delete games[currentGame];
        } else {
          if (game.hostId === playerId) {
            game.hostId = game.players[0].id;
          }
          io.to(currentGame).emit('lobby-update', {
            players: game.players.map(p => ({ id: p.id, name: p.name })),
            hostId: game.hostId,
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Idol Clash running on http://localhost:${PORT}`);
});
