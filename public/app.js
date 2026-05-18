/* ===== State ===== */
let ws = null;
let retryCount = 0;
let reconnectTimer = null;
let state = {
  playerId: null,
  roomCode: null,
  playerName: null,
  isHost: false,
  timerMax: 30,
  timerRemaining: 30,
  answered: false,
  selectedAnswer: null,
  leaderboard: []
};

/* ===== WebSocket ===== */
function connect() {
  return new Promise((resolve) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
      retryCount = 0;
      hideReconnectBanner();
      if (state.playerId) {
        send({ type: 'reconnect', playerId: state.playerId });
      }
      resolve();
    };

    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onclose = () => {
      if (state.playerId && state.roomCode) {
        scheduleReconnect();
      }
    };
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30000, 1000 * 2 ** retryCount);
  retryCount++;
  showReconnectBanner();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function showReconnectBanner() {
  document.getElementById('reconnect-banner').classList.remove('hidden');
}

function hideReconnectBanner() {
  document.getElementById('reconnect-banner').classList.add('hidden');
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/* ===== Message handler ===== */
function handleMessage(msg) {
  switch (msg.type) {
    case 'reconnected':
      state.playerId = msg.playerId;
      state.roomCode = msg.code;
      state.isHost = msg.isHost;
      if (msg.state === 'lobby') {
        showLobby(msg.code, msg.players);
      }
      break;

    case 'room_created':
    case 'room_joined':
      state.playerId = msg.playerId;
      state.roomCode = msg.code;
      state.isHost = msg.isHost;
      showLobby(msg.code, msg.players);
      break;

    case 'player_joined':
      updatePlayerList(msg.players);
      break;

    case 'question_start':
      showQuestion(msg);
      break;

    case 'timer_tick':
      updateTimer(msg.remaining);
      break;

    case 'answer_result':
      showAnswerFeedback(msg);
      break;

    case 'question_end':
      revealAnswers(msg.correctAnswer);
      showLeaderboardInterstitial(msg.leaderboard);
      break;

    case 'leaderboard_update':
      state.leaderboard = msg.leaderboard;
      renderLeaderboard('leaderboard-list', msg.leaderboard);
      break;

    case 'score-update':
      state.leaderboard = msg.leaderboard;
      renderLeaderboard('leaderboard-list', msg.leaderboard);
      break;

    case 'game_over':
      showGameOver(msg.leaderboard);
      break;

    case 'error':
      alert(msg.message);
      break;
  }
}

/* ===== Screen navigation ===== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showHome() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  if (specWs) {
    specWs.onclose = null;
    specWs.close();
    specWs = null;
  }
  showScreen('screen-home');
  resetState();
}
function showCreateRoom() { showScreen('screen-create'); }
function showJoinRoom() { showScreen('screen-join'); }

function resetState() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  retryCount = 0;
  hideReconnectBanner();
  state = { playerId: null, roomCode: null, playerName: null, isHost: false, timerMax: 30, timerRemaining: 30, answered: false, selectedAnswer: null, leaderboard: [] };
}

/* ===== Room actions ===== */
async function createRoom() {
  const name = document.getElementById('host-name').value.trim();
  if (!name) { alert('Enter a display name'); return; }
  state.playerName = name;
  await connect();
  send({ type: 'create_room', name });
}

async function joinRoom() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('player-name').value.trim();
  if (!code || code.length !== 6) { alert('Enter a valid 6-character code'); return; }
  if (!name) { alert('Enter a display name'); return; }
  state.playerName = name;
  await connect();
  send({ type: 'join_room', code, name });
}

function startGame() {
  send({ type: 'start_game' });
}

/* ===== Lobby ===== */
function showLobby(code, players) {
  document.getElementById('lobby-code').textContent = code;
  updatePlayerList(players);
  document.getElementById('host-controls').classList.toggle('hidden', !state.isHost);
  document.getElementById('waiting-msg').classList.toggle('hidden', state.isHost);
  showScreen('screen-lobby');
}

function updatePlayerList(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="avatar">${p.name[0].toUpperCase()}</div>
      <span>${p.name}${p.id === state.playerId ? ' (you)' : ''}</span>
    </div>
  `).join('');

  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.disabled = players.length < 1;
}

/* ===== Question ===== */
function showQuestion(msg) {
  state.answered = false;
  state.selectedAnswer = null;
  state.timerMax = msg.timeLimit;
  state.timerRemaining = msg.timeLimit;

  document.getElementById('q-category').textContent = msg.category;
  document.getElementById('q-progress').textContent = `Question ${msg.index + 1} of ${msg.total}`;
  document.getElementById('q-text').textContent = msg.question;
  document.getElementById('answer-feedback').className = 'feedback hidden';

  const grid = document.getElementById('options-grid');
  const labels = ['A', 'B', 'C', 'D'];
  grid.innerHTML = msg.options.map((opt, i) => `
    <button class="option-btn" onclick="submitAnswer(${i})" data-index="${i}">
      <strong>${labels[i]}.</strong> ${opt}
    </button>
  `).join('');

  updateTimer(msg.timeLimit);
  document.getElementById('timer-bar').style.width = '100%';
  document.getElementById('timer-bar').style.backgroundColor = '#e94560';
  showScreen('screen-question');
}

function updateTimer(remaining) {
  state.timerRemaining = remaining;
  document.getElementById('timer-text').textContent = remaining;
  const pct = (remaining / state.timerMax) * 100;
  document.getElementById('timer-bar').style.width = pct + '%';
  const color = pct > 50 ? '#69f0ae' : pct > 25 ? '#ffd740' : '#e94560';
  document.getElementById('timer-bar').style.backgroundColor = color;
}

function submitAnswer(index) {
  if (state.answered) return;
  state.answered = true;
  state.selectedAnswer = index;

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    if (parseInt(btn.dataset.index) === index) btn.classList.add('selected');
  });

  send({ type: 'submit_answer', answer: index });
}

function showAnswerFeedback(result) {
  const fb = document.getElementById('answer-feedback');
  if (result.correct) {
    fb.textContent = `✅ Correct! +${result.points} points`;
    fb.className = 'feedback correct';
    const btn = document.querySelector(`.option-btn[data-index="${state.selectedAnswer}"]`);
    if (btn) { btn.classList.remove('selected'); btn.classList.add('correct'); }
  } else {
    fb.textContent = `❌ Wrong answer`;
    fb.className = 'feedback wrong';
    const btn = document.querySelector(`.option-btn[data-index="${state.selectedAnswer}"]`);
    if (btn) { btn.classList.remove('selected'); btn.classList.add('wrong'); }
  }
}

function revealAnswers(correctIndex) {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    if (parseInt(btn.dataset.index) === correctIndex) btn.classList.add('correct');
  });
}

/* ===== Leaderboard interstitial ===== */
function showLeaderboardInterstitial(leaderboard) {
  setTimeout(() => {
    if (document.getElementById('screen-question').classList.contains('active')) {
      renderLeaderboard('leaderboard-list', leaderboard);
      document.getElementById('next-q-hint').classList.remove('hidden');
      showScreen('screen-leaderboard');
    }
  }, 1500);
}

function renderLeaderboard(containerId, leaderboard) {
  const medals = ['🥇', '🥈', '🥉'];
  const container = document.getElementById(containerId);
  container.innerHTML = leaderboard.map((p, i) => `
    <div class="lb-item ${p.id === state.playerId ? 'me' : ''}">
      <span class="lb-rank">${medals[i] || (i + 1)}</span>
      <span class="lb-name">${p.name}${p.id === state.playerId ? ' (you)' : ''}</span>
      <span class="lb-score">${p.score}</span>
    </div>
  `).join('');
}

/* ===== Game Over ===== */
function showGameOver(leaderboard) {
  const podiumEl = document.getElementById('podium');
  const podiumEmojis = ['🥇', '🥈', '🥉'];
  const top3 = leaderboard.slice(0, 3);

  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  podiumEl.innerHTML = podiumOrder.map((p, i) => {
    const rank = leaderboard.indexOf(p);
    return `
      <div class="podium-place">
        <span class="podium-emoji">${podiumEmojis[rank] || ''}</span>
        <span class="podium-name">${p.name}</span>
        <span class="podium-score">${p.score} pts</span>
        <div class="podium-block"></div>
      </div>
    `;
  }).join('');

  renderLeaderboard('full-leaderboard', leaderboard);
  showScreen('screen-gameover');
}

/* ===== Spectator ===== */
let specWs = null;
let specState = { roomCode: null, timerMax: 30 };

function showSpectatorJoin() { showScreen('screen-spectator-join'); }

async function joinAsSpectator() {
  const code = document.getElementById('spec-join-code').value.trim().toUpperCase();
  const name = document.getElementById('spec-display-name').value.trim() || 'Spectator';
  if (!code || code.length !== 6) { alert('Enter a valid 6-character code'); return; }

  specState.roomCode = code;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  specWs = new WebSocket(`${proto}://${location.host}`);

  specWs.onopen = () => {
    specWs.send(JSON.stringify({ type: 'join_as_spectator', code, name }));
  };

  specWs.onmessage = (e) => handleSpectatorMessage(JSON.parse(e.data));

  specWs.onerror = () => { alert('Connection error. Check the room code and try again.'); };

  specWs.onclose = () => {
    // nothing — spectators don't reconnect automatically
  };

  showScreen('screen-spectator');
  document.getElementById('spec-lobby-msg').classList.remove('hidden');
  document.getElementById('spec-game-wrap').classList.add('hidden');
  document.getElementById('spec-gameover-wrap').classList.add('hidden');
}

function handleSpectatorMessage(msg) {
  switch (msg.type) {
    case 'spectator_joined':
      // Successfully joined — stay on lobby msg until game starts
      break;

    case 'question_start':
      document.getElementById('spec-lobby-msg').classList.add('hidden');
      document.getElementById('spec-game-wrap').classList.remove('hidden');
      document.getElementById('spec-gameover-wrap').classList.add('hidden');
      showSpectatorQuestion(msg);
      break;

    case 'timer_tick':
      updateSpectatorTimer(msg.remaining);
      break;

    case 'question_end':
      revealSpectatorAnswers(msg.correctAnswer);
      break;

    case 'leaderboard_update':
    case 'score-update':
      renderLeaderboard('spec-leaderboard-list', msg.leaderboard);
      break;

    case 'game_over':
      showSpectatorGameOver(msg.leaderboard);
      break;

    case 'error':
      alert(msg.message);
      break;
  }
}

function showSpectatorQuestion(msg) {
  specState.timerMax = msg.timeLimit;

  document.getElementById('spec-q-category').textContent = msg.category;
  document.getElementById('spec-q-progress').textContent = `Question ${msg.index + 1} of ${msg.total}`;
  document.getElementById('spec-q-text').textContent = msg.question;

  const grid = document.getElementById('spec-options-grid');
  const labels = ['A', 'B', 'C', 'D'];
  grid.innerHTML = msg.options.map((opt, i) => `
    <button class="option-btn option-btn--readonly" data-index="${i}" disabled>
      <strong>${labels[i]}.</strong> ${opt}
    </button>
  `).join('');

  updateSpectatorTimer(msg.timeLimit);
  document.getElementById('spec-timer-bar').style.width = '100%';
  document.getElementById('spec-timer-bar').style.backgroundColor = '#e94560';
}

function updateSpectatorTimer(remaining) {
  document.getElementById('spec-timer-text').textContent = remaining;
  const pct = (remaining / specState.timerMax) * 100;
  document.getElementById('spec-timer-bar').style.width = pct + '%';
  const color = pct > 50 ? '#69f0ae' : pct > 25 ? '#ffd740' : '#e94560';
  document.getElementById('spec-timer-bar').style.backgroundColor = color;
}

function revealSpectatorAnswers(correctIndex) {
  document.querySelectorAll('#spec-options-grid .option-btn').forEach(btn => {
    if (parseInt(btn.dataset.index) === correctIndex) btn.classList.add('correct');
  });
}

function showSpectatorGameOver(leaderboard) {
  document.getElementById('spec-game-wrap').classList.add('hidden');
  document.getElementById('spec-gameover-wrap').classList.remove('hidden');

  const podiumEl = document.getElementById('spec-podium');
  const podiumEmojis = ['🥇', '🥈', '🥉'];
  const top3 = leaderboard.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  podiumEl.innerHTML = podiumOrder.map((p) => {
    const rank = leaderboard.indexOf(p);
    return `
      <div class="podium-place">
        <span class="podium-emoji">${podiumEmojis[rank] || ''}</span>
        <span class="podium-name">${p.name}</span>
        <span class="podium-score">${p.score} pts</span>
        <div class="podium-block"></div>
      </div>
    `;
  }).join('');

  renderLeaderboard('spec-full-leaderboard', leaderboard);
}
