const socket = io();

let myId = null;
let myCards = [];
let isHost = false;
let gameCode = null;
let players = [];
let currentPhase = null;
let selectedCardIdx = null;
let pendingNextTurn = null;
let viewingPlayerId = null;
let highlightPlayerIds = [];
let gameMode = 'classic';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Attempt rejoin on load
(function tryRejoin() {
  const savedCode = localStorage.getItem('fab5_code');
  const savedId = localStorage.getItem('fab5_playerId');
  if (!savedCode || !savedId) return;

  socket.emit('rejoin-game', { code: savedCode, playerId: savedId }, (res) => {
    if (res.success) {
      myId = res.playerId;
      gameCode = res.code;
      if (res.phase === 'lobby') {
        showScreen('lobby');
        $('#lobby-code').textContent = res.code;
      }
    } else {
      localStorage.removeItem('fab5_code');
      localStorage.removeItem('fab5_playerId');
    }
  });
})();

const ALL_CATEGORY_LABELS = {
  strength: 'STR', intelligence: 'INT', looks: 'LKS',
  impact: 'IMP', talent: 'TLT', class: 'CLS',
  humor: 'HMR', stability: 'STB', confidence: 'CNF',
  luck: 'LCK', wealth: 'WLT', style: 'STY',
};
const ALL_CATEGORY_FULL = {
  strength: 'Strength', intelligence: 'Intelligence', looks: 'Looks',
  impact: 'Impact', talent: 'Talent', class: 'Class',
  humor: 'Sense of Humor', stability: 'Mental Stability', confidence: 'Confidence',
  luck: 'Luck', wealth: 'Wealth', style: 'Style',
};
let CATEGORY_LABELS = {};
let CATEGORY_FULL = {};
let activeCategories = [];
let allCategories = [];

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
}

// Random splash image
const splashIdx = Math.floor(Math.random() * 5) + 1;
$('#splash-img').src = `/images/splash_mashup/splash_${splashIdx}.png`;

// Restore saved name
const savedName = document.cookie.match(/fab5_name=([^;]+)/);
if (savedName) $('#player-name').value = decodeURIComponent(savedName[1]);

function saveName(name) {
  document.cookie = `fab5_name=${encodeURIComponent(name)};max-age=${60*60*24*365};path=/`;
}

// HOME
$('#btn-create').addEventListener('click', () => {
  const name = $('#player-name').value.trim();
  if (!name) { $('#home-error').textContent = 'Enter your name'; return; }
  saveName(name);
  socket.emit('create-game', name, (res) => {
    if (res.success) {
      myId = res.playerId;
      gameCode = res.code;
      isHost = true;
      localStorage.setItem('fab5_code', res.code);
      localStorage.setItem('fab5_playerId', res.playerId);
      showScreen('lobby');
      $('#lobby-code').textContent = res.code;
      socket.emit('request-lobby');
    }
  });
});

$('#btn-solo').addEventListener('click', () => {
  const name = $('#player-name').value.trim();
  if (!name) { $('#home-error').textContent = 'Enter your name'; return; }
  saveName(name);
  socket.emit('create-solo-game', name, (res) => {
    if (res.success) {
      myId = res.playerId;
      gameCode = res.code;
      isHost = true;
      localStorage.setItem('fab5_code', res.code);
      localStorage.setItem('fab5_playerId', res.playerId);
      showSoloModeSelect();
    }
  });
});

function showSoloModeSelect() {
  showScreen('lobby');
  const content = document.querySelector('.lobby-content');
  content.innerHTML = `
    <h2>Select Mode</h2>
    <div class="mode-select" style="margin: 20px 0">
      <div class="mode-buttons">
        <button class="btn-mode active" data-mode="classic" id="solo-classic">Classic</button>
        <button class="btn-mode" data-mode="pro" id="solo-pro">Pro</button>
      </div>
      <div class="mode-desc" id="solo-mode-desc">Stats visible on all cards</div>
    </div>
    <button class="btn btn-primary" id="btn-solo-start">Start Game</button>
  `;

  let soloMode = 'classic';
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      soloMode = btn.dataset.mode;
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#solo-mode-desc').textContent = MODE_DESCS[soloMode];
    });
  });

  $('#btn-solo-start').addEventListener('click', () => {
    socket.emit('start-solo-game', soloMode);
  });
}

$('#btn-join').addEventListener('click', () => {
  const name = $('#player-name').value.trim();
  const code = $('#join-code').value.trim().toUpperCase();
  if (!name) { $('#home-error').textContent = 'Enter your name'; return; }
  if (!code) { $('#home-error').textContent = 'Enter a game code'; return; }
  saveName(name);
  socket.emit('join-game', code, name, (res) => {
    if (res.success) {
      myId = res.playerId;
      gameCode = res.code;
      isHost = false;
      localStorage.setItem('fab5_code', res.code);
      localStorage.setItem('fab5_playerId', res.playerId);
      showScreen('lobby');
      $('#lobby-code').textContent = res.code;
    } else {
      $('#home-error').textContent = res.error;
    }
  });
});

// LOBBY
socket.on('lobby-update', (data) => {
  players = data.players;
  isHost = data.hostId === myId;
  renderLobby();
});

function renderLobby() {
  const list = $('#player-list');
  list.innerHTML = '';
  players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.dataset.id = p.id;
    li.innerHTML = `
      ${isHost ? '<span class="drag-handle">☰</span>' : ''}
      <span class="player-number">${i + 1}</span>
      <span>${p.name}${p.id === myId ? ' (you)' : ''}</span>
    `;
    list.appendChild(li);
  });

  $('#player-count').textContent = players.length;

  if (isHost) {
    $('#btn-start').style.display = players.length >= 2 ? 'block' : 'none';
    $('#lobby-wait').style.display = 'none';
    $('#lobby-hint').style.display = '';
    $('#mode-select').style.display = '';
    setupDragReorder();
    setupModeSelect();
  } else {
    $('#btn-start').style.display = 'none';
    $('#lobby-wait').style.display = '';
    $('#lobby-hint').style.display = 'none';
    $('#mode-select').style.display = 'none';
  }
}

// Touch drag reorder
function setupDragReorder() {
  const list = $('#player-list');
  let dragItem = null;
  let dragY = 0;
  let placeholder = null;

  list.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dragItem = handle.closest('.player-item');
      dragY = e.touches[0].clientY;
      dragItem.classList.add('dragging');

      placeholder = document.createElement('li');
      placeholder.className = 'player-item';
      placeholder.style.border = '2px dashed var(--accent)';
      placeholder.style.opacity = '0.3';
      placeholder.style.height = dragItem.offsetHeight + 'px';
      dragItem.parentNode.insertBefore(placeholder, dragItem.nextSibling);
    });
  });

  document.addEventListener('touchmove', (e) => {
    if (!dragItem) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const items = [...list.querySelectorAll('.player-item:not(.dragging)')];
    const target = items.find(item => {
      const rect = item.getBoundingClientRect();
      return y > rect.top && y < rect.bottom;
    });
    if (target && target !== placeholder) {
      const rect = target.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        list.insertBefore(placeholder, target);
      } else {
        list.insertBefore(placeholder, target.nextSibling);
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!dragItem) return;
    dragItem.classList.remove('dragging');
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragItem, placeholder);
      placeholder.remove();
    }
    dragItem = null;
    placeholder = null;

    const newOrder = [...list.querySelectorAll('.player-item')].map(li => li.dataset.id);
    socket.emit('reorder-players', newOrder);
  });
}

const MODE_DESCS = {
  classic: 'Stats visible on all cards',
  pro: 'Stats hidden — play from memory!',
};

function setupModeSelect() {
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#mode-desc').textContent = MODE_DESCS[mode];
      socket.emit('set-mode', mode);
    });
  });
}

socket.on('mode-update', (data) => {
  const modeDesc = $('#mode-desc');
  if (modeDesc) modeDesc.textContent = MODE_DESCS[data.mode];
  document.querySelectorAll('.btn-mode').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === data.mode);
  });
});

$('#btn-start').addEventListener('click', () => {
  socket.emit('start-game');
});

// GAME
socket.on('game-started', (data) => {
  myId = data.yourId;
  myCards = data.yourCards;
  players = data.players;
  currentPhase = data.phase;
  if (data.mode) gameMode = data.mode;

  if (data.activeCategories) {
    activeCategories = data.activeCategories;
    allCategories = data.allCategories || Object.keys(ALL_CATEGORY_LABELS);
    CATEGORY_LABELS = {};
    CATEGORY_FULL = {};
    activeCategories.forEach(k => {
      CATEGORY_LABELS[k] = ALL_CATEGORY_LABELS[k];
      CATEGORY_FULL[k] = ALL_CATEGORY_FULL[k];
    });
  }

  showScreen('game');
  const codeBadge = $('#game-code-badge');
  if (codeBadge && gameCode) codeBadge.textContent = gameCode;
  renderCards();
  renderScoreboard();
  updateTurnInfo(data.currentTurnPlayerId);

  if (data.phase === 'drafting') {
    if (data.hasDiscarded) {
      showMessage('Waiting for other players to discard...');
    } else {
      showCategoryReveal(() => showDraftScreen());
    }
  } else if (data.phase === 'selecting-cards') {
    // handled by category-rolled event that follows on rejoin
  } else if (data.phase === 'round-result') {
    showMessage('Waiting for next round...');
  } else if (data.phase === 'rolling-category' && data.opponentId) {
    highlightPlayerIds = [
      { id: data.currentTurnPlayerId, role: 'attacker' },
      { id: data.opponentId, role: 'defender' },
    ];
    renderScoreboard();
    const attackerName = players.find(p => p.id === data.currentTurnPlayerId)?.name;
    const defenderName = data.opponentName || players.find(p => p.id === data.opponentId)?.name;
    if (data.currentTurnPlayerId === myId) {
      showMatchupBanner(attackerName, defenderName, 'You are challenging');
      setTimeout(() => showDiceRoll('category'), 1500);
    } else {
      showMatchupBanner(attackerName, defenderName);
      setTimeout(() => showMessage(`${attackerName} is rolling for category...`), 1500);
    }
  } else if (data.phase === 'rolling-category') {
    if (data.currentTurnPlayerId === myId) {
      showDiceRoll('category');
    } else {
      const name = players.find(p => p.id === data.currentTurnPlayerId)?.name;
      showMessage(`${name} is rolling for category...`);
    }
  } else {
    if (data.currentTurnPlayerId === myId) {
      showDiceRoll('opponent');
    } else {
      const name = players.find(p => p.id === data.currentTurnPlayerId)?.name;
      showMessage(`${name} is rolling for opponent...`);
    }
  }
});

const CATEGORY_COLORS = {
  Sports: '#ff2a6d', Science: '#00f0ff', Acting: '#b026ff',
  Music: '#ff6b00', Leaders: '#05ffa1', Culture: '#00b4d8', Infamous: '#8b8b8b',
};

function getInitials(name) {
  return name.replace(/[&]/g, '').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function cardTotal(card) {
  return Object.keys(ALL_CATEGORY_LABELS).reduce((sum, k) => sum + (card[k] || 0), 0);
}

function cardImgSrc(card) {
  const filename = card.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-àáâãäåèéêëìíîïòóôõöùúûüýÿñçšžÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇŠŽ]/g, '');
  return `/images/cards/${filename}.png`;
}

function cardImageHTML(card) {
  const color = CATEGORY_COLORS[card.category] || '#555';
  const initials = getInitials(card.name);
  const src = cardImgSrc(card);
  return `<div class="card-banner" style="--avatar-color: ${color}" data-card-id="${card.id}">
    <span class="card-initials">${initials}</span>
    <img class="card-banner-img" src="${src}" alt="" loading="lazy" onerror="this.style.display='none'">
  </div>`;
}

function showCardFullscreen(card) {
  const color = CATEGORY_COLORS[card.category] || '#555';
  const initials = getInitials(card.name);
  const allStats = Object.keys(ALL_CATEGORY_LABELS);

  const src = cardImgSrc(card);
  const overlay = document.createElement('div');
  overlay.className = 'card-fullscreen-overlay';
  overlay.innerHTML = `
    <div class="card-fullscreen">
      <div class="card-fs-banner" style="--avatar-color: ${color}">
        <span class="card-initials">${initials}</span>
        <img class="card-banner-img" src="${src}" alt="" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="card-fs-name">${card.name}</div>
      <div class="card-fs-cat-row"><span>${card.category}</span><span class="card-fs-total">${cardTotal(card)}</span></div>
      <div class="card-fs-stats">
        ${allStats.map(k => {
          const isActive = activeCategories.includes(k);
          return `<div class="card-fs-stat${isActive ? '' : ' inactive'}">
            <span class="card-fs-stat-label">${ALL_CATEGORY_FULL[k]}</span>
            <span class="card-fs-stat-val">${card[k]}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-secondary card-fs-close">Close</button>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('card-fs-close')) {
      overlay.classList.add('card-fs-exit');
      setTimeout(() => overlay.remove(), 200);
    }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('card-fs-enter'));
}

function renderCards() {
  const container = $('#your-cards');
  container.innerHTML = '';
  myCards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = `card${card.flipped ? ' flipped' : ''}`;
    div.dataset.index = i;

    const highlightCat = !card.flipped && currentPhase === 'selecting-cards' ? window.currentCategory : null;
    const hideStats = gameMode === 'pro' && currentPhase !== 'drafting';
    div.innerHTML = `
      ${cardImageHTML(card)}
      <div class="card-name">${card.name}</div>
      <div class="card-cat-row"><span>${card.category}</span><span class="card-total">${cardTotal(card)}</span></div>
      ${hideStats ? '<div class="card-stats-hidden">PRO</div>' : `<div class="card-stats">
        ${Object.keys(CATEGORY_LABELS).map(k => `
          <div class="stat${k === highlightCat ? ' highlight' : ''}">
            <span>${CATEGORY_LABELS[k]}</span>
            <span class="stat-val">${card[k]}</span>
          </div>
        `).join('')}
      </div>`}
    `;

    const avatar = div.querySelector('.card-banner');
    if (avatar) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardFullscreen(card);
      });
    }
    div.addEventListener('click', () => onCardTap(i));
    container.appendChild(div);
  });
}

let draftSelectedIdx = null;

function showCategoryReveal(onComplete) {
  const gameArea = $('#game-area');
  gameArea.classList.remove('expanded');
  gameArea.innerHTML = `<div class="cat-reveal-slot"></div>`;

  renderCards();

  const slot = gameArea.querySelector('.cat-reveal-slot');
  let i = 0;

  function showNext() {
    if (i >= activeCategories.length) {
      slot.innerHTML = `<div class="cat-reveal-item cat-reveal-done">Let's Go!</div>`;
      setTimeout(onComplete, 800);
      return;
    }

    const key = activeCategories[i];
    const label = ALL_CATEGORY_FULL[key];
    slot.innerHTML = `<div class="cat-reveal-item cat-reveal-enter">${label}</div>`;

    const el = slot.querySelector('.cat-reveal-item');
    requestAnimationFrame(() => {
      el.classList.remove('cat-reveal-enter');
      el.classList.add('cat-reveal-visible');
    });

    setTimeout(() => {
      el.classList.remove('cat-reveal-visible');
      el.classList.add('cat-reveal-exit');
      setTimeout(() => { i++; showNext(); }, 300);
    }, 600);
  }

  setTimeout(showNext, 200);
}

function showDraftScreen() {
  $('#game-area').classList.remove('expanded');
  draftSelectedIdx = null;
  renderDraftCards();
}

function renderDraftCards() {
  const container = $('#your-cards');
  container.innerHTML = '';
  myCards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = `card${i === draftSelectedIdx ? ' draft-selected' : ''}`;
    div.dataset.index = i;
    div.innerHTML = `
      ${cardImageHTML(card)}
      <div class="card-name">${card.name}</div>
      <div class="card-cat-row"><span>${card.category}</span><span class="card-total">${cardTotal(card)}</span></div>
      <div class="card-stats">
        ${Object.keys(CATEGORY_LABELS).map(k => `
          <div class="stat">
            <span>${CATEGORY_LABELS[k]}</span>
            <span class="stat-val">${card[k]}</span>
          </div>
        `).join('')}
      </div>
    `;
    const avatar = div.querySelector('.card-banner');
    if (avatar) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardFullscreen(card);
      });
    }
    div.addEventListener('click', () => {
      if (currentPhase !== 'drafting') return;
      draftSelectedIdx = i;
      renderDraftCards();
    });
    container.appendChild(div);
  });

  // Show confirm button in the game area
  const gameArea = $('#game-area');
  if (draftSelectedIdx !== null) {
    const selectedName = myCards[draftSelectedIdx]?.name || '';
    gameArea.innerHTML = `
      <div class="draft-prompt">
        <div class="draft-sub">Remove <strong>${selectedName}</strong>?</div>
      </div>
      <button class="btn btn-primary btn-draft-confirm" id="btn-draft-confirm">Remove Card</button>
    `;
    $('#btn-draft-confirm').addEventListener('click', () => {
      if (draftSelectedIdx === null) return;
      socket.emit('discard-card', draftSelectedIdx);
      draftSelectedIdx = null;
      container.innerHTML = '';
      gameArea.innerHTML = `<div class="game-message">Waiting for other players...</div>`;
    });
  } else {
    gameArea.innerHTML = `
      <div class="draft-prompt">
        <div class="draft-title">Choose a card to remove</div>
        <div class="draft-sub">You have 6 cards — discard 1 to start with 5</div>
      </div>
    `;
  }
}

socket.on('player-discarded', (data) => {
  const existing = document.querySelector('.game-message');
  if (existing && currentPhase === 'drafting') {
    existing.innerHTML += `<br>${data.playerName} is ready.`;
  }
});

socket.on('draft-complete', (data) => {
  currentPhase = data.phase;
  players = data.players;
  renderCards();
  renderScoreboard();
  updateTurnInfo(data.currentTurnPlayerId);

  if (data.phase === 'rolling-category' && data.opponentId) {
    highlightPlayerIds = [
      { id: data.currentTurnPlayerId, role: 'attacker' },
      { id: data.opponentId, role: 'defender' },
    ];
    renderScoreboard();
    const attackerName = players.find(p => p.id === data.currentTurnPlayerId)?.name;
    const defenderName = data.opponentName || players.find(p => p.id === data.opponentId)?.name;
    if (data.currentTurnPlayerId === myId) {
      showMatchupBanner(attackerName, defenderName, 'You are challenging');
      setTimeout(() => showDiceRoll('category'), 1500);
    } else if (data.opponentId === myId) {
      showMatchupBanner(attackerName, defenderName, 'You are being challenged');
      setTimeout(() => showMessage('Waiting for category roll...'), 1500);
    } else {
      showMatchupBanner(attackerName, defenderName);
      setTimeout(() => showMessage(`${attackerName} is rolling for category...`), 1500);
    }
  } else if (data.currentTurnPlayerId === myId) {
    showDiceRoll('opponent');
  } else {
    const name = players.find(p => p.id === data.currentTurnPlayerId)?.name;
    showMessage(`${name} is rolling for opponent...`);
  }
});

function renderScoreboard() {
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  players.forEach(p => {
    const active = p.activeCards !== undefined ? p.activeCards :
      (p.id === myId ? myCards.filter(c => !c.flipped).length : '?');
    const eliminated = active === 0;
    const chip = document.createElement('span');
    const isViewing = viewingPlayerId === p.id;
    const hlType = highlightPlayerIds.find(h => h.id === p.id);
    chip.className = `score-chip${p.id === myId ? ' you' : ''}${eliminated ? ' eliminated' : ''}${isViewing ? ' viewing' : ''}${hlType ? ` hl-${hlType.role}` : ''}`;
    chip.textContent = `${p.name}: ${active}`;
    chip.addEventListener('click', () => onScoreChipTap(p.id));
    sb.appendChild(chip);
  });
}

function onScoreChipTap(targetId) {
  if (targetId === myId || viewingPlayerId === targetId) {
    viewingPlayerId = null;
    if (currentPhase === 'drafting') {
      renderDraftCards();
    } else {
      renderCards();
    }
    renderScoreboard();
    return;
  }
  socket.emit('view-cards', targetId, (res) => {
    if (!res || !res.cards) return;
    viewingPlayerId = targetId;
    renderViewingCards(res.cards, targetId);
    renderScoreboard();
  });
}

function renderViewingCards(cards, targetId) {
  const container = $('#your-cards');
  container.innerHTML = '';
  const targetName = players.find(p => p.id === targetId)?.name || '?';
  const header = document.createElement('div');
  header.className = 'viewing-header';
  header.innerHTML = `Viewing <strong>${targetName}</strong>'s cards <span class="viewing-close">✕</span>`;
  header.querySelector('.viewing-close').addEventListener('click', () => {
    viewingPlayerId = null;
    renderCards();
    renderScoreboard();
  });
  container.appendChild(header);

  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = `card card-preview${card.flipped ? ' flipped' : ''}`;
    div.innerHTML = `
      ${cardImageHTML(card)}
      <div class="card-name">${card.name}</div>
      <div class="card-cat-row"><span>${card.category}</span><span class="card-total">${cardTotal(card)}</span></div>
    `;
    const avatar = div.querySelector('.card-banner');
    if (avatar) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardFullscreen(card);
      });
    }
    container.appendChild(div);
  });
}

function updateTurnInfo(turnPlayerId) {
  if (!turnPlayerId) {
    $('#turn-info').textContent = '';
    return;
  }
  const name = turnPlayerId === myId ? 'Your turn' :
    `${players.find(p => p.id === turnPlayerId)?.name}'s turn`;
  $('#turn-info').textContent = name;
}

function showMessage(msg) {
  $('#game-area').innerHTML = `<div class="game-message">${msg}</div>`;
}

function showDiceRoll(type) {
  const label = type === 'opponent' ? 'Tap to roll for opponent' : 'Tap to roll for category';
  $('#game-area').innerHTML = `
    <div class="dice-container">
      <div class="dice" id="dice">?</div>
      <div class="dice-label">${label}</div>
    </div>
  `;
  $('#dice').addEventListener('click', () => {
    const dice = $('#dice');
    if (dice.classList.contains('rolling')) return;
    dice.classList.add('rolling');
    const rollInterval = setInterval(() => {
      dice.textContent = Math.floor(Math.random() * 6) + 1;
    }, 80);
    dice.dataset.rollInterval = rollInterval;
    setTimeout(() => {
      if (type === 'opponent') {
        socket.emit('roll-opponent');
      } else {
        socket.emit('roll-category');
      }
    }, 600);
  });
}

socket.on('opponent-rolled', (data) => {
  const dice = $('#dice');
  if (dice) {
    clearInterval(Number(dice.dataset.rollInterval));
    dice.classList.remove('rolling');
    dice.textContent = data.roll;
  }
  currentPhase = data.phase;

  const attackerName = players.find(p => p.id === data.attackerId)?.name;
  highlightPlayerIds = [
    { id: data.attackerId, role: 'attacker' },
    { id: data.opponentId, role: 'defender' },
  ];
  renderScoreboard();

  setTimeout(() => {
    if (data.attackerId === myId) {
      showMatchupBanner(attackerName, data.opponentName, 'You are challenging');
      setTimeout(() => showDiceRoll('category'), 1500);
    } else if (data.opponentId === myId) {
      showMatchupBanner(attackerName, data.opponentName, 'You are being challenged');
      setTimeout(() => showMessage('Waiting for category roll...'), 1500);
    } else {
      showMatchupBanner(attackerName, data.opponentName);
      setTimeout(() => showMessage(`${attackerName} is rolling for category...`), 1500);
    }
  }, 800);
});

function showMatchupBanner(attackerName, defenderName, subtitle) {
  $('#game-area').innerHTML = `
    <div class="matchup-banner">
      <div class="matchup-banner-names">
        <span class="mb-attacker">${attackerName}</span>
        <span class="mb-vs">VS</span>
        <span class="mb-defender">${defenderName}</span>
      </div>
      ${subtitle ? `<div class="mb-subtitle">${subtitle}</div>` : ''}
    </div>
  `;
}

socket.on('category-rolled', (data) => {
  currentPhase = data.phase;
  window.currentCategory = data.category;
  window.currentAttackerId = data.attackerId;
  window.currentDefenderId = data.defenderId;
  selectedCardIdx = null;
  highlightPlayerIds = [
    { id: data.attackerId, role: 'attacker' },
    { id: data.defenderId, role: 'defender' },
  ];
  renderScoreboard();

  const dice = $('#dice');
  if (dice) {
    clearInterval(Number(dice.dataset.rollInterval));
    dice.classList.remove('rolling');
    dice.textContent = data.roll;
  }

  setTimeout(() => {
    const isInvolved = myId === data.attackerId || myId === data.defenderId;
    if (isInvolved) {
      showCardSelection(data);
    } else {
      const aName = players.find(p => p.id === data.attackerId)?.name;
      const dName = players.find(p => p.id === data.defenderId)?.name;
      showMessage(`Category: <strong>${data.categoryLabel}</strong><br>${aName} vs ${dName}<br>Both players choosing cards...`);
    }
    renderCards();
  }, 1000);
});

function showCardSelection(data) {
  const opponent = myId === data.attackerId ?
    players.find(p => p.id === data.defenderId)?.name :
    players.find(p => p.id === data.attackerId)?.name;

  $('#game-area').innerHTML = `
    <div class="result-banner">
      <div class="result-text" style="color: var(--gold);">${data.categoryLabel}</div>
      <div class="result-sub">vs ${opponent} — pick your card!</div>
    </div>
    <button class="btn-confirm-card" id="btn-confirm" style="display:none">Lock In Card</button>
  `;

  document.querySelectorAll('.card:not(.flipped)').forEach(c => c.classList.add('selectable'));

  $('#btn-confirm').addEventListener('click', () => {
    if (selectedCardIdx !== null) {
      socket.emit('select-card', selectedCardIdx);
      document.querySelectorAll('.card').forEach(c => {
        c.classList.remove('selectable');
        c.style.pointerEvents = 'none';
      });
      $('#btn-confirm').style.display = 'none';
      $('#game-area').innerHTML += '<div class="game-message">Waiting for opponent...</div>';
    }
  });
}

function onCardTap(index) {
  if (currentPhase !== 'selecting-cards') return;
  if (myId !== window.currentAttackerId && myId !== window.currentDefenderId) return;
  if (myCards[index].flipped) return;

  selectedCardIdx = index;
  document.querySelectorAll('.card').forEach((c, i) => {
    c.classList.toggle('selected', i === index);
  });

  const btn = $('#btn-confirm');
  if (btn) btn.style.display = 'block';
}

socket.on('card-selected', (data) => {
  if (currentPhase !== 'selecting-cards') return;
  const isInvolved = myId === window.currentAttackerId || myId === window.currentDefenderId;
  if (!isInvolved) {
    const existingMsg = document.querySelector('.game-message');
    if (existingMsg) {
      existingMsg.innerHTML += `<br>${data.playerName} chose a card.`;
    }
  }
});

socket.on('round-result', (data) => {
  currentPhase = data.phase;
  window.currentCategory = null;

  const aCard = data.attackerCard;
  const dCard = data.defenderCard;
  const cat = data.category;
  const isWinner = data.winnerId === myId;
  const isLoser = data.loserId === myId;

  const attackerWins = data.winnerId !== data.loserId &&
    data.winnerId === (window.currentAttackerId || data.winnerId);

  pendingNextTurn = null;

  $('#game-area').innerHTML = `
    <div class="result-banner">
      <div class="result-text ${isWinner ? 'win' : isLoser ? 'lose' : ''}">${data.categoryLabel}: ${CATEGORY_FULL[cat]}</div>
      <div class="result-sub">${data.winnerName} wins!</div>
    </div>
    <div class="matchup">
      <div class="matchup-card ${aCard[cat] > dCard[cat] ? 'winner' : 'loser'}">
        ${cardImageHTML(aCard)}
        <div class="card-name">${aCard.name}</div>
        <div class="card-category-tag">${aCard.category}</div>
        <div class="stat-label">${CATEGORY_FULL[cat]}</div>
        <div class="stat-highlight" style="color:${aCard[cat] > dCard[cat] ? 'var(--green)' : 'var(--red)'}">${aCard[cat]}</div>
      </div>
      <div class="matchup-vs">VS</div>
      <div class="matchup-card ${dCard[cat] > aCard[cat] ? 'winner' : 'loser'}">
        ${cardImageHTML(dCard)}
        <div class="card-name">${dCard.name}</div>
        <div class="card-category-tag">${dCard.category}</div>
        <div class="stat-label">${CATEGORY_FULL[cat]}</div>
        <div class="stat-highlight" style="color:${dCard[cat] > aCard[cat] ? 'var(--green)' : 'var(--red)'}">${dCard[cat]}</div>
      </div>
    </div>
    <button class="btn btn-primary btn-continue" id="btn-continue">Continue</button>
  `;

  $('#btn-continue').addEventListener('click', () => processPendingNextTurn());

  selectedCardIdx = null;
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('selectable', 'selected');
    c.style.pointerEvents = '';
  });
});

socket.on('round-tie', (data) => {
  currentPhase = data.phase;

  $('#game-area').innerHTML = `
    <div class="result-banner">
      <div class="result-text tie">TIE! ${data.categoryLabel}: ${data.value}</div>
      <div class="result-sub">Same cards — rolling new category...</div>
    </div>
    <div class="matchup">
      <div class="matchup-card">
        ${cardImageHTML(data.attackerCard)}
        <div class="card-name">${data.attackerCard.name}</div>
        <div class="stat-highlight" style="color:var(--gold)">${data.value}</div>
      </div>
      <div class="matchup-vs">VS</div>
      <div class="matchup-card">
        ${cardImageHTML(data.defenderCard)}
        <div class="card-name">${data.defenderCard.name}</div>
        <div class="stat-highlight" style="color:var(--gold)">${data.value}</div>
      </div>
    </div>
  `;

  setTimeout(() => {
    if (window.currentAttackerId === myId) {
      showDiceRoll('category');
    } else {
      showMessage('Rolling for a new category...');
    }
  }, 2000);
});

socket.on('cards-update', (data) => {
  myCards = data.yourCards;
  if (currentPhase !== 'drafting') renderCards();
});

let continueRequested = false;

socket.on('next-turn', (data) => {
  pendingNextTurn = data;
  if (continueRequested) {
    continueRequested = false;
    processPendingNextTurn();
  }
});

function processPendingNextTurn() {
  if (!pendingNextTurn) {
    continueRequested = true;
    return;
  }
  const data = pendingNextTurn;
  pendingNextTurn = null;
  continueRequested = false;
  highlightPlayerIds = [];
  socket.emit('ready-for-next');

  currentPhase = data.phase;
  players = data.players;
  renderScoreboard();
  updateTurnInfo(data.currentTurnPlayerId);

  if (data.phase === 'rolling-category' && data.opponentId) {
    highlightPlayerIds = [
      { id: data.currentTurnPlayerId, role: 'attacker' },
      { id: data.opponentId, role: 'defender' },
    ];
    renderScoreboard();
    const attackerName = data.currentTurnPlayerName;
    const defenderName = data.opponentName;
    if (data.currentTurnPlayerId === myId) {
      showMatchupBanner(attackerName, defenderName, 'You are challenging');
      setTimeout(() => showDiceRoll('category'), 1500);
    } else if (data.opponentId === myId) {
      showMatchupBanner(attackerName, defenderName, 'You are being challenged');
      setTimeout(() => showMessage('Waiting for category roll...'), 1500);
    } else {
      showMatchupBanner(attackerName, defenderName);
      setTimeout(() => showMessage(`${attackerName} is rolling for category...`), 1500);
    }
  } else if (data.currentTurnPlayerId === myId) {
    showDiceRoll('opponent');
  } else {
    showMessage(`${data.currentTurnPlayerName} is rolling...`);
  }
}

socket.on('game-over', (data) => {
  showScreen('gameover');
  const isMe = data.winnerId === myId;
  $('#winner-text').textContent = isMe ? 'YOU WIN!' : `${data.winnerName} Wins!`;

  const cardsLeft = data.winnerCards ? data.winnerCards.length : 0;
  $('#winner-sub').textContent = isMe
    ? `You won with ${cardsLeft} card${cardsLeft !== 1 ? 's' : ''} remaining!`
    : `${data.winnerName} won with ${cardsLeft} card${cardsLeft !== 1 ? 's' : ''} remaining`;

  const container = $('#winner-cards');
  container.innerHTML = '';
  if (data.winnerCards) {
    data.winnerCards.forEach(card => {
      const div = document.createElement('div');
      div.className = 'winner-card';
      div.innerHTML = `
        ${cardImageHTML(card)}
        <div class="card-name">${card.name}</div>
      `;
      div.querySelector('.card-banner').addEventListener('click', () => showCardFullscreen(card));
      container.appendChild(div);
    });
  }
});

$('#btn-quit').addEventListener('click', () => {
  if (!confirm('Leave this game?')) return;
  localStorage.removeItem('fab5_code');
  localStorage.removeItem('fab5_playerId');
  location.reload();
});

$('#btn-home').addEventListener('click', () => {
  localStorage.removeItem('fab5_code');
  localStorage.removeItem('fab5_playerId');
  location.reload();
});
