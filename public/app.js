/* global state */
let ws = null;
let role = null;       // 'host' | 'player'
let hostToken = null;
let playerToken = null;
let roomCode = null;
let questionTotal = 0;
let lastCorrectIndex = null;
let selectedAnswer = null;

/* ── Screen helpers ──────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ── WebSocket connection ─────────────────────────────────────────────────── */
function connectWS(code, token) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'identify', code, token }));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  });

  ws.addEventListener('close', () => {
    // Attempt reconnect after 2s
    setTimeout(() => {
      if (roomCode && (hostToken || playerToken)) {
        connectWS(roomCode, hostToken || playerToken);
      }
    }, 2000);
  });
}

/* ── Message handler ─────────────────────────────────────────────────────── */
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'identified':
      if (msg.state === 'waiting') {
        if (role === 'host') showScreen('screen-host-lobby');
        else showScreen('screen-player-waiting');
      }
      if (msg.players) updatePlayerLists(msg.players);
      break;

    case 'player_list':
      updatePlayerLists(msg.players);
      break;

    case 'game_started':
      // question_start will follow immediately
      break;

    case 'question_start':
      lastCorrectIndex = null;
      selectedAnswer = null;
      questionTotal = msg.total;
      renderQuestion(msg);
      showScreen('screen-question');
      break;

    case 'timer_tick':
      updateTimer(msg.remaining, questionTotal);
      break;

    case 'question_end':
      lastCorrectIndex = msg.correctIndex;
      revealAnswer(msg.correctIndex);
      break;

    case 'leaderboard_update':
      renderLeaderboard(msg.leaderboard, lastCorrectIndex);
      showScreen('screen-leaderboard');
      if (role === 'host') {
        document.getElementById('host-next-wrap').classList.remove('hidden');
        document.getElementById('player-next-hint').classList.add('hidden');
      } else {
        document.getElementById('host-next-wrap').classList.add('hidden');
        document.getElementById('player-next-hint').classList.remove('hidden');
      }
      break;

    case 'game_over':
      renderPodium(msg.leaderboard);
      showScreen('screen-podium');
      break;

    case 'error':
      alert(msg.message);
      break;
  }
}

/* ── Player list update ───────────────────────────────────────────────────── */
function updatePlayerLists(players) {
  const count = players.length;

  // Host lobby
  document.getElementById('player-count').textContent = count;
  renderList('player-list', players);

  // Player waiting
  renderList('waiting-player-list', players);

  // Enable start button when ≥1 player
  const btnStart = document.getElementById('btn-start');
  const startHint = document.getElementById('start-hint');
  btnStart.disabled = count === 0;
  startHint.textContent = count === 0 ? 'Waiting for at least 1 player…' : `${count} player${count > 1 ? 's' : ''} ready — hit Start!`;
}

function renderList(ulId, players) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    ul.appendChild(li);
  });
}

/* ── Question rendering ───────────────────────────────────────────────────── */
function renderQuestion(msg) {
  document.getElementById('q-counter').textContent = `Question ${msg.index + 1}/${msg.total}`;
  document.getElementById('q-category').textContent = msg.category;
  document.getElementById('q-text').textContent = msg.text;
  document.getElementById('answer-feedback').className = 'answer-feedback hidden';
  document.getElementById('answer-feedback').textContent = '';

  updateTimer(msg.timeLeft, msg.total);

  const grid = document.getElementById('answers-grid');
  grid.innerHTML = '';
  msg.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = opt;
    if (role === 'host') {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => submitAnswer(i, msg.index, msg.options.length));
    }
    grid.appendChild(btn);
  });
}

function updateTimer(remaining, total) {
  const pct = (remaining / 30) * 100;
  const bar = document.getElementById('timer-bar');
  const label = document.getElementById('timer-label');
  bar.style.width = pct + '%';
  label.textContent = remaining;

  const urgent = remaining <= 10;
  bar.classList.toggle('urgent', urgent);
  label.classList.toggle('urgent', urgent);
}

function submitAnswer(index, questionIndex, optCount) {
  if (selectedAnswer !== null) return;
  selectedAnswer = index;

  ws.send(JSON.stringify({ type: 'answer', answerIndex: index, questionIndex }));

  const btns = document.querySelectorAll('.answer-btn');
  btns.forEach(b => b.disabled = true);
  btns[index].classList.add('selected');

  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback waiting-fb';
  fb.textContent = 'Answer submitted! Waiting for others…';
}

function revealAnswer(correctIndex) {
  const btns = document.querySelectorAll('.answer-btn');
  btns.forEach((btn, i) => {
    if (i === correctIndex) btn.classList.add('correct');
    else if (i === selectedAnswer && selectedAnswer !== correctIndex) btn.classList.add('wrong');
  });

  if (role !== 'host') {
    const fb = document.getElementById('answer-feedback');
    if (selectedAnswer === correctIndex) {
      fb.className = 'answer-feedback correct-fb';
      fb.textContent = '✅ Correct!';
    } else if (selectedAnswer !== null) {
      fb.className = 'answer-feedback wrong-fb';
      fb.textContent = '❌ Wrong!';
    } else {
      fb.className = 'answer-feedback wrong-fb';
      fb.textContent = "⏰ Time's up!";
    }
    fb.classList.remove('hidden');
  }
}

/* ── Leaderboard rendering ───────────────────────────────────────────────── */
function renderLeaderboard(leaderboard, correctIndex) {
  const ol = document.getElementById('leaderboard-list');
  ol.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lb-rank">${i + 1}</span>
                    <span class="lb-name">${escapeHtml(entry.name)}</span>
                    <span class="lb-score">${entry.score} pts</span>`;
    ol.appendChild(li);
  });
}

/* ── Podium rendering ─────────────────────────────────────────────────────── */
function renderPodium(leaderboard) {
  const podium = document.getElementById('podium');
  podium.innerHTML = '';

  // Display order: 2nd, 1st, 3rd (classic podium layout)
  const displayOrder = [1, 0, 2];
  const medals = ['🥇', '🥈', '🥉'];
  const heights = [100, 70, 50];

  displayOrder.forEach((rankIdx) => {
    const entry = leaderboard[rankIdx];
    if (!entry) return;

    const div = document.createElement('div');
    div.className = 'podium-place';
    div.dataset.rank = String(rankIdx + 1);
    div.innerHTML = `
      <div class="podium-avatar">${medals[rankIdx]}</div>
      <div class="podium-name">${escapeHtml(entry.name)}</div>
      <div class="podium-score">${entry.score} pts</div>
      <div class="podium-block" style="height:${heights[rankIdx]}px">${rankIdx + 1}</div>
    `;
    podium.appendChild(div);
  });

  // Full list below podium
  const ol = document.getElementById('final-list');
  ol.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lb-rank">${i + 1}</span>
                    <span class="lb-name">${escapeHtml(entry.name)}</span>
                    <span class="lb-score">${entry.score} pts</span>`;
    ol.appendChild(li);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Home screen ─────────────────────────────────────────────────────────── */
document.getElementById('btn-host').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/rooms', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');

    role = 'host';
    hostToken = data.hostToken;
    playerToken = null;
    roomCode = data.code;

    document.getElementById('join-code').textContent = data.code;
    updatePlayerLists([]);
    showScreen('screen-host-lobby');
    connectWS(data.code, data.hostToken);
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

document.getElementById('btn-join').addEventListener('click', () => {
  document.getElementById('input-code').value = '';
  document.getElementById('input-name').value = '';
  document.getElementById('join-error').textContent = '';
  document.getElementById('join-error').classList.add('hidden');
  showScreen('screen-join');
});

/* ── Join screen ─────────────────────────────────────────────────────────── */
document.getElementById('btn-back-home').addEventListener('click', () => showScreen('screen-home'));

document.getElementById('btn-join-submit').addEventListener('click', async () => {
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  const name = document.getElementById('input-name').value.trim();
  const errEl = document.getElementById('join-error');

  if (!code || code.length !== 6) {
    errEl.textContent = 'Enter a valid 6-character code.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!name) {
    errEl.textContent = 'Enter your display name.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to join room');

    role = 'player';
    playerToken = data.token;
    hostToken = null;
    roomCode = data.code;

    document.getElementById('waiting-name').textContent = `Welcome, ${name}!`;
    showScreen('screen-player-waiting');
    connectWS(data.code, data.token);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

/* ── Host lobby ──────────────────────────────────────────────────────────── */
document.getElementById('btn-start').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'start_game' }));
  }
});

/* ── Leaderboard: next question ───────────────────────────────────────────── */
document.getElementById('btn-next-question').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'next_question' }));
  }
});

/* ── Play again ──────────────────────────────────────────────────────────── */
document.getElementById('btn-play-again').addEventListener('click', () => {
  ws && ws.close();
  ws = null;
  role = null;
  hostToken = null;
  playerToken = null;
  roomCode = null;
  showScreen('screen-home');
});
