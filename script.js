/**
 * TICTAC — script.js
 * ─────────────────────────────────────────────────────────────
 * Features:
 *   • Human vs Human / Human vs AI modes
 *   • Minimax algorithm (unbeatable Hard AI)
 *   • Easy / Medium / Hard difficulty
 *   • Web Audio API sound effects (no external files)
 *   • Dark / Light theme toggle
 *   • localStorage for scores + preferences
 *   • Full game statistics
 * ─────────────────────────────────────────────────────────────
 */

/* ── CONSTANTS ──────────────────────────────────────────────── */
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],   // rows
  [0,3,6],[1,4,7],[2,5,8],   // cols
  [0,4,8],[2,4,6]            // diagonals
];

/* ── STATE ──────────────────────────────────────────────────── */
let board       = Array(9).fill(null);  // null | 'X' | 'O'
let current     = 'X';                 // whose turn
let gameOver    = false;
let mode        = 'hvh';               // 'hvh' | 'hva'
let difficulty  = 'easy';             // 'easy' | 'medium' | 'hard'
let muted       = false;
let aiThinking  = false;

// Scores persist across games via localStorage
let scores = loadScores();

/* ── DOM REFS ───────────────────────────────────────────────── */
const boardEl        = document.getElementById('board');
const statusText     = document.getElementById('statusText');
const statusBanner   = document.getElementById('statusBanner');
const winOverlay     = document.getElementById('winOverlay');
const winMsg         = document.getElementById('winMsg');
const valX           = document.getElementById('valX');
const valO           = document.getElementById('valO');
const valD           = document.getElementById('valD');
const labelX         = document.getElementById('labelX');
const labelO         = document.getElementById('labelO');
const scoreCardX     = document.getElementById('scoreX');
const scoreCardO     = document.getElementById('scoreO');
const btnHvH         = document.getElementById('btnHvH');
const btnHvA         = document.getElementById('btnHvA');
const diffGroup      = document.getElementById('diffGroup');
const btnRestart     = document.getElementById('btnRestart');
const btnReset       = document.getElementById('btnReset');
const btnOverlayRestart = document.getElementById('btnOverlayRestart');
const btnMute        = document.getElementById('btnMute');
const themeToggle    = document.getElementById('themeToggle');
const statGames      = document.getElementById('statGames');
const statXRate      = document.getElementById('statXRate');
const statORate      = document.getElementById('statORate');
const statDRate      = document.getElementById('statDRate');

/* ── AUDIO (Web Audio API — no external files needed) ────────── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

/** Lazily create AudioContext on first user gesture */
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

/**
 * Play a synthesized tone.
 * @param {number} freq  - Frequency in Hz
 * @param {string} type  - Oscillator type
 * @param {number} dur   - Duration in seconds
 * @param {number} vol   - Volume 0–1
 */
function playTone(freq, type = 'sine', dur = 0.12, vol = 0.25) {
  if (muted) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (_) { /* audio not available */ }
}

/** Chord: play multiple frequencies simultaneously */
function playChord(freqs, type, dur, vol) {
  freqs.forEach(f => playTone(f, type, dur, vol));
}

const sounds = {
  placeX : () => playTone(440, 'triangle', 0.10, 0.20),
  placeO : () => playTone(330, 'triangle', 0.10, 0.20),
  win    : () => { playChord([523,659,784], 'sine', 0.45, 0.18); setTimeout(() => playChord([659,784,1047], 'sine', 0.4, 0.15), 200); },
  draw   : () => playChord([300,350], 'sawtooth', 0.3, 0.12),
  click  : () => playTone(600, 'square', 0.06, 0.10),
};

/* ── LOCALSTORAGE ────────────────────────────────────────────── */
function loadScores() {
  try {
    const s = JSON.parse(localStorage.getItem('tictac_scores'));
    return s || { X: 0, O: 0, D: 0 };
  } catch (_) { return { X: 0, O: 0, D: 0 }; }
}

function saveScores() {
  try { localStorage.setItem('tictac_scores', JSON.stringify(scores)); } catch (_) {}
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('tictac_prefs'));
    if (p) {
      if (p.theme)      document.documentElement.setAttribute('data-theme', p.theme);
      if (p.mode)       setMode(p.mode, false);
      if (p.difficulty) setDifficulty(p.difficulty, false);
      if (p.muted != null) { muted = p.muted; syncMuteBtn(); }
    }
  } catch (_) {}
}

function savePrefs() {
  try {
    localStorage.setItem('tictac_prefs', JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme'),
      mode, difficulty, muted
    }));
  } catch (_) {}
}

/* ── INIT ────────────────────────────────────────────────────── */
function init() {
  buildBoard();
  loadPrefs();
  updateScoreboard();
  updateStats();
  updateTurnHighlight();
  updateLabels();
}

/* ── BUILD BOARD DOM ────────────────────────────────────────── */
function buildBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Cell ${i + 1}`);
    cell.dataset.index = i;
    cell.addEventListener('click', onCellClick);
    boardEl.appendChild(cell);
  }
}

/* ── GAME RESET ─────────────────────────────────────────────── */
function resetGame() {
  board    = Array(9).fill(null);
  current  = 'X';
  gameOver = false;
  aiThinking = false;

  // Reset cell visuals
  document.querySelectorAll('.cell').forEach(cell => {
    cell.textContent  = '';
    cell.className    = 'cell';
    cell.dataset.mark = '';
    cell.setAttribute('aria-label', `Cell ${parseInt(cell.dataset.index) + 1}`);
  });

  winOverlay.classList.remove('visible');
  winOverlay.setAttribute('aria-hidden', 'true');
  document.querySelector('.game-shell').classList.remove('thinking');
  updateStatus(`Player X's turn`);
  updateTurnHighlight();
}

/* ── CELL CLICK ─────────────────────────────────────────────── */
function onCellClick(e) {
  const idx = parseInt(e.currentTarget.dataset.index);

  // Block if: game over, cell taken, AI's turn
  if (gameOver || board[idx] || aiThinking) return;
  if (mode === 'hva' && current === 'O') return; // O is AI

  placeMarker(idx, current);
}

/* ── PLACE MARKER ───────────────────────────────────────────── */
function placeMarker(idx, player) {
  board[idx] = player;

  const cell = boardEl.children[idx];
  cell.classList.add('taken', 'placed');
  cell.dataset.mark = player;
  cell.setAttribute('aria-label', `Cell ${idx + 1}: ${player}`);

  // Wrap text in span for pop-in animation
  const span = document.createElement('span');
  span.className = 'mark-inner';
  span.textContent = player === 'X' ? '✕' : '○';
  cell.appendChild(span);

  // Sound
  player === 'X' ? sounds.placeX() : sounds.placeO();

  // Check result
  const result = checkResult(board);
  if (result) {
    endGame(result);
  } else {
    // Switch turn
    current = current === 'X' ? 'O' : 'X';
    updateTurnHighlight();

    if (mode === 'hva' && current === 'O' && !gameOver) {
      triggerAI();
    } else {
      updateStatus(`Player ${current}'s turn`);
    }
  }
}

/* ── CHECK RESULT ────────────────────────────────────────────── */
/**
 * Returns:
 *   { winner: 'X'|'O', line: [i,j,k] }  on win
 *   { winner: 'draw' }                   on draw
 *   null                                 game continues
 */
function checkResult(b) {
  for (const line of WIN_LINES) {
    const [a, j, k] = line;
    if (b[a] && b[a] === b[j] && b[a] === b[k]) {
      return { winner: b[a], line };
    }
  }
  if (b.every(cell => cell !== null)) return { winner: 'draw' };
  return null;
}

/* ── END GAME ────────────────────────────────────────────────── */
function endGame(result) {
  gameOver = true;
  document.querySelector('.game-shell').classList.remove('thinking');

  if (result.winner === 'draw') {
    scores.D++;
    sounds.draw();
    showOverlay('🤝 It\'s a Draw!');
    updateStatus('Draw — well played!');
  } else {
    scores[result.winner]++;
    sounds.win();
    highlightWin(result.line);
    const label = getPlayerLabel(result.winner);
    showOverlay(`🎉 ${label} Wins!`);
    updateStatus(`${label} wins!`);
  }

  saveScores();
  updateScoreboard();
  updateStats();
}

/* ── HIGHLIGHT WINNING CELLS ────────────────────────────────── */
function highlightWin(line) {
  line.forEach((idx, i) => {
    setTimeout(() => {
      boardEl.children[idx].classList.add('winning');
    }, i * 80);
  });
}

/* ── WIN OVERLAY ────────────────────────────────────────────── */
function showOverlay(msg) {
  winMsg.textContent = msg;
  winOverlay.classList.add('visible');
  winOverlay.setAttribute('aria-hidden', 'false');
}

/* ── STATUS TEXT ────────────────────────────────────────────── */
function updateStatus(msg) {
  statusText.textContent = msg;
}

/* ── TURN HIGHLIGHT (score cards) ───────────────────────────── */
function updateTurnHighlight() {
  scoreCardX.classList.toggle('active-x', current === 'X' && !gameOver);
  scoreCardO.classList.toggle('active-o', current === 'O' && !gameOver);
}

/* ── LABELS ─────────────────────────────────────────────────── */
function updateLabels() {
  labelX.textContent = 'Player X';
  labelO.textContent = mode === 'hva' ? `AI (${cap(difficulty)})` : 'Player O';
}

function getPlayerLabel(mark) {
  if (mark === 'O' && mode === 'hva') return `AI (${cap(difficulty)})`;
  return `Player ${mark}`;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── SCOREBOARD ─────────────────────────────────────────────── */
function updateScoreboard() {
  valX.textContent = scores.X;
  valO.textContent = scores.O;
  valD.textContent = scores.D;
}

/* ── STATS ───────────────────────────────────────────────────── */
function updateStats() {
  const total = scores.X + scores.O + scores.D;
  statGames.textContent = total;
  statXRate.textContent = total ? pct(scores.X / total) : '—';
  statORate.textContent = total ? pct(scores.O / total) : '—';
  statDRate.textContent = total ? pct(scores.D / total) : '—';
}

function pct(n) { return Math.round(n * 100) + '%'; }

/* ── MODE SWITCHER ───────────────────────────────────────────── */
function setMode(m, save = true) {
  mode = m;
  btnHvH.classList.toggle('active', m === 'hvh');
  btnHvA.classList.toggle('active', m === 'hva');

  if (m === 'hva') {
    diffGroup.classList.add('visible');
    diffGroup.setAttribute('aria-hidden', 'false');
  } else {
    diffGroup.classList.remove('visible');
    diffGroup.setAttribute('aria-hidden', 'true');
  }

  updateLabels();
  resetGame();
  if (save) savePrefs();
}

/* ── DIFFICULTY SWITCHER ─────────────────────────────────────── */
function setDifficulty(d, save = true) {
  difficulty = d;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.diff === d);
  });
  updateLabels();
  resetGame();
  if (save) savePrefs();
}

/* ── MUTE ────────────────────────────────────────────────────── */
function syncMuteBtn() {
  btnMute.textContent = muted ? '🔇' : '🔊';
  btnMute.setAttribute('aria-label', muted ? 'Unmute sounds' : 'Mute sounds');
}

/* ── AI LOGIC ────────────────────────────────────────────────── */

/** Trigger the AI move after a short delay (feels natural) */
function triggerAI() {
  aiThinking = true;
  document.querySelector('.game-shell').classList.add('thinking');
  updateStatus('🤖 AI is thinking…');

  // Delay: 300-700ms to feel responsive but intentional
  const delay = 300 + Math.random() * 400;
  setTimeout(() => {
    const move = getAIMove(board, difficulty);
    aiThinking = false;
    document.querySelector('.game-shell').classList.remove('thinking');
    if (move !== -1) placeMarker(move, 'O');
  }, delay);
}

/**
 * Select AI move based on difficulty.
 *   Easy   – random empty cell (5% minimax to avoid being too dumb)
 *   Medium – 50% minimax, 50% random
 *   Hard   – always minimax (unbeatable)
 */
function getAIMove(b, diff) {
  const empty = b.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
  if (!empty.length) return -1;

  if (diff === 'easy') {
    // Rarely play optimal; mostly random
    return Math.random() < 0.10
      ? minimaxBestMove(b)
      : empty[Math.floor(Math.random() * empty.length)];
  }

  if (diff === 'medium') {
    // 55% optimal, else random
    return Math.random() < 0.55
      ? minimaxBestMove(b)
      : empty[Math.floor(Math.random() * empty.length)];
  }

  // Hard: always optimal
  return minimaxBestMove(b);
}

/** Return the index of the best move for 'O' using Minimax + Alpha-Beta pruning */
function minimaxBestMove(b) {
  let bestScore = -Infinity;
  let bestMove  = -1;

  b.forEach((cell, idx) => {
    if (cell !== null) return;
    b[idx] = 'O';
    const score = minimax(b, 0, false, -Infinity, Infinity);
    b[idx] = null;
    if (score > bestScore) { bestScore = score; bestMove = idx; }
  });

  return bestMove;
}

/**
 * Minimax with Alpha-Beta pruning.
 * @param {Array}   b         - Board state
 * @param {number}  depth     - Current depth
 * @param {boolean} isMaxing  - true = O's turn (maximiser), false = X's turn (minimiser)
 * @param {number}  alpha
 * @param {number}  beta
 */
function minimax(b, depth, isMaxing, alpha, beta) {
  const result = checkResult(b);
  if (result) {
    if (result.winner === 'O') return  10 - depth;
    if (result.winner === 'X') return -10 + depth;
    return 0; // draw
  }

  if (isMaxing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== null) continue;
      b[i] = 'O';
      best = Math.max(best, minimax(b, depth + 1, false, alpha, beta));
      b[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break; // prune
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== null) continue;
      b[i] = 'X';
      best = Math.min(best, minimax(b, depth + 1, true, alpha, beta));
      b[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break; // prune
    }
    return best;
  }
}

/* ── EVENT LISTENERS ─────────────────────────────────────────── */

// Mode buttons
btnHvH.addEventListener('click', () => { sounds.click(); setMode('hvh'); });
btnHvA.addEventListener('click', () => { sounds.click(); setMode('hva'); });

// Difficulty chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    sounds.click();
    setDifficulty(chip.dataset.diff);
  });
});

// Restart buttons
btnRestart.addEventListener('click', () => { sounds.click(); resetGame(); });
btnOverlayRestart.addEventListener('click', () => { sounds.click(); resetGame(); });

// Reset scores
btnReset.addEventListener('click', () => {
  sounds.click();
  if (confirm('Reset all scores and statistics?')) {
    scores = { X: 0, O: 0, D: 0 };
    saveScores();
    updateScoreboard();
    updateStats();
  }
});

// Mute toggle
btnMute.addEventListener('click', () => {
  muted = !muted;
  syncMuteBtn();
  savePrefs();
  if (!muted) sounds.click();
});

// Theme toggle
themeToggle.addEventListener('click', () => {
  sounds.click();
  const current = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  savePrefs();
});

/* ── START ───────────────────────────────────────────────────── */
init();
