const BOARD_SIZE = 8;
const TRAY_SIZE = 3;
const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#ff9f1c', '#f72585', '#80ed99'];

const BASE_SHAPES = [
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]]
];

const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const comboEl = document.getElementById('combo');
const movesEl = document.getElementById('moves');
const movesLeftEl = document.getElementById('movesLeft');
const movesBarEl = document.getElementById('movesBar');
const levelBadgeEl = document.getElementById('levelBadge');
const statusEl = document.getElementById('status');
const rotateBtn = document.getElementById('rotateBtn');
const newGameBtn = document.getElementById('newGameBtn');
const floatingScoreEl = document.getElementById('floatingScore');
const comboToastEl = document.getElementById('comboToast');

let board = [];
let tray = [];
let selectedIndex = 0;
let score = 0;
let combo = 1;
let moves = 0;
let hoverCell = null;
let bestScore = Number(localStorage.getItem('blockBlastBest') || 0);
let gameState = 'playing';
let audioCtx = null;

function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioCtor();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  return audioCtx;
}

function playTone(frequency, duration, type = 'sine', volume = 0.04, slide = 0) {
  const context = ensureAudio();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slide) {
    oscillator.frequency.linearRampToValueAtTime(frequency + slide, now + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playPlacementSound() {
  playTone(520, 0.08, 'triangle', 0.05, 90);
  setTimeout(() => playTone(720, 0.08, 'triangle', 0.04, 80), 30);
}

function playRotateSound() {
  playTone(420, 0.08, 'square', 0.04, 40);
}

function playInvalidSound() {
  playTone(180, 0.1, 'sawtooth', 0.03, -30);
}

function playNewGameSound() {
  playTone(330, 0.08, 'triangle', 0.04, 60);
  setTimeout(() => playTone(470, 0.09, 'triangle', 0.04, 90), 55);
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function normalizeShape(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function rotateShape(cells) {
  return cells.map(([x, y]) => [y, -x]);
}

function createPiece(template) {
  let current = template.map(([x, y]) => [x, y]);
  const patterns = [];

  for (let i = 0; i < 4; i += 1) {
    patterns.push(normalizeShape(current));
    current = rotateShape(current);
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    patterns,
    rotation: 0
  };
}

function shapeSignature(shape) {
  return normalizeShape(shape)
    .map(([x, y]) => `${x}:${y}`)
    .join('|');
}

function weightedShapePick() {
  const pool = [];

  for (const shape of BASE_SHAPES) {
    const size = shape.length;
    let weight = 2;

    if (size <= 2) weight = 10;
    else if (size === 3) weight = 8;
    else if (size === 4) weight = 5;
    else if (size >= 5) weight = 2;

    for (let i = 0; i < weight; i += 1) {
      pool.push(shape);
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function randomPiece() {
  return createPiece(weightedShapePick());
}

function refillTray() {
  const seen = new Set();

  while (tray.length < TRAY_SIZE) {
    const piece = randomPiece();
    const signature = shapeSignature(piece.patterns[0]);

    if (seen.has(signature)) {
      continue;
    }

    tray.push(piece);
    seen.add(signature);
  }
}

function startNewGame() {
  board = createEmptyBoard();
  tray = [];
  selectedIndex = 0;
  score = 0;
  combo = 1;
  moves = 0;
  hoverCell = null;
  gameState = 'playing';
  refillTray();
  setStatus('Place your first piece.');
  playNewGameSound();
  render();
}

function countValidMoves() {
  let count = 0;
  for (const piece of tray) {
    for (let rotation = 0; rotation < piece.patterns.length; rotation += 1) {
      const pattern = piece.patterns[rotation];
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          if (cellMatchesPattern(pattern, row, col)) {
            count += 1;
          }
        }
      }
    }
  }
  return count;
}

function showComboToast(text) {
  comboToastEl.textContent = text;
  comboToastEl.classList.remove('show');
  void comboToastEl.offsetWidth;
  comboToastEl.classList.add('show');
  window.clearTimeout(showComboToast.timeoutId);
  showComboToast.timeoutId = window.setTimeout(() => {
    comboToastEl.classList.remove('show');
  }, 1100);
}

function updateScoreboard() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(bestScore);
  comboEl.textContent = `x${combo}`;
  movesEl.textContent = String(moves);
  floatingScoreEl.textContent = String(score);

  const validMoves = countValidMoves();
  movesLeftEl.textContent = String(validMoves);
  const fill = Math.max(0, Math.min(100, (validMoves / 20) * 100));
  movesBarEl.style.width = `${fill}%`;

  const levelName = score >= 500 ? 'Pro' : score >= 200 ? 'Rising' : score >= 80 ? 'Warmup' : 'Fresh';
  levelBadgeEl.textContent = levelName;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function getPreviewPattern(piece, row, col) {
  const pattern = piece.patterns[piece.rotation];
  return pattern.map(([dx, dy]) => ({ row: row + dy, col: col + dx }));
}

function renderBoard() {
  boardEl.innerHTML = '';
  boardEl.classList.remove('invalid');

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const value = board[row][col];
      if (value) {
        cell.classList.add('filled');
        cell.style.background = value;
      } else {
        cell.style.background = 'var(--cell-empty)';
      }

      if (hoverCell && tray[selectedIndex]) {
        const piece = tray[selectedIndex];
        const previewCells = getPreviewPattern(piece, hoverCell.row, hoverCell.col);
        const isPreview = previewCells.some((entry) => entry.row === row && entry.col === col);
        if (isPreview) {
          cell.classList.add('preview');
          cell.style.background = piece.color;
          cell.style.opacity = '0.8';
          if (canPlaceAt(piece, hoverCell.row, hoverCell.col)) {
            cell.classList.add('valid-target');
          }
        }
      }

      boardEl.appendChild(cell);
    }
  }
}

function renderTray() {
  trayEl.innerHTML = '';

  tray.forEach((piece, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `piece-card ${index === selectedIndex ? 'selected' : ''}`;
    card.dataset.index = String(index);

    const mini = document.createElement('div');
    mini.className = 'mini-grid';

    const cells = piece.patterns[piece.rotation];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const cell = document.createElement('span');
        cell.className = 'mini-cell';
        const filled = cells.some(([x, y]) => x === col && y === row);
        if (filled) {
          cell.classList.add('filled');
          cell.style.background = piece.color;
        }
        mini.appendChild(cell);
      }
    }

    card.appendChild(mini);
    trayEl.appendChild(card);
  });
}

function render() {
  renderBoard();
  renderTray();
  updateScoreboard();
}

function cellMatchesPattern(pattern, row, col) {
  for (const [dx, dy] of pattern) {
    const nextRow = row + dy;
    const nextCol = col + dx;

    if (
      nextRow < 0 ||
      nextRow >= BOARD_SIZE ||
      nextCol < 0 ||
      nextCol >= BOARD_SIZE ||
      board[nextRow][nextCol] !== null
    ) {
      return false;
    }
  }

  return true;
}

function canPlaceAt(piece, row, col) {
  const pattern = piece.patterns[piece.rotation];
  return cellMatchesPattern(pattern, row, col);
}

function clearCompleteLines() {
  const completedRows = [];
  const completedCols = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (board[row].every(Boolean)) {
      completedRows.push(row);
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    if (Array.from({ length: BOARD_SIZE }, (_, row) => board[row][col]).every(Boolean)) {
      completedCols.push(col);
    }
  }

  if (completedRows.length === 0 && completedCols.length === 0) {
    return 0;
  }

  for (const row of completedRows) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      board[row][col] = null;
    }
  }

  for (const col of completedCols) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      board[row][col] = null;
    }
  }

  return completedRows.length * 30 + completedCols.length * 30;
}

function doesAnyMoveExist() {
  for (const piece of tray) {
    for (let rotation = 0; rotation < piece.patterns.length; rotation += 1) {
      const pattern = piece.patterns[rotation];
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          let valid = true;
          for (const [dx, dy] of pattern) {
            const nextRow = row + dy;
            const nextCol = col + dx;
            if (
              nextRow < 0 ||
              nextRow >= BOARD_SIZE ||
              nextCol < 0 ||
              nextCol >= BOARD_SIZE ||
              board[nextRow][nextCol] !== null
            ) {
              valid = false;
              break;
            }
          }
          if (valid) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function updateBestScore() {
  bestScore = Math.max(bestScore, score);
  localStorage.setItem('blockBlastBest', String(bestScore));
}

function placePiece(row, col) {
  const piece = tray[selectedIndex];
  if (!piece) {
    return;
  }

  const pattern = piece.patterns[piece.rotation];

  for (const [dx, dy] of pattern) {
    const nextRow = row + dy;
    const nextCol = col + dx;
    board[nextRow][nextCol] = piece.color;
  }

  const placementPoints = pattern.length * 10;
  const clearedBonus = clearCompleteLines();
  const rowBonus = clearedBonus > 0 ? Math.max(0, combo - 1) * 25 : 0;
  const totalEarned = placementPoints + clearedBonus + rowBonus;
  score += totalEarned;
  moves += 1;
  combo = clearedBonus > 0 ? combo + 1 : 1;
  updateBestScore();

  tray.splice(selectedIndex, 1);
  if (tray.length === 0) {
    refillTray();
  }

  selectedIndex = Math.min(selectedIndex, tray.length - 1);
  hoverCell = null;

  if (!doesAnyMoveExist()) {
    gameState = 'ended';
    playPlacementSound();
    showComboToast('Game over');
    setStatus(`No moves left. Final score: ${score}.`);
  } else if (clearedBonus > 0) {
    playPlacementSound();
    showComboToast(`x${combo} combo`);
    setStatus(`Clean sweep! +${totalEarned} points.`);
  } else {
    playPlacementSound();
    showComboToast(`+${totalEarned}`);
    setStatus(`Nice placement. +${totalEarned} points.`);
  }

  render();
}

function rotateSelectedPiece() {
  if (gameState !== 'playing' || tray.length === 0) {
    return;
  }

  const piece = tray[selectedIndex];
  piece.rotation = (piece.rotation + 1) % piece.patterns.length;
  hoverCell = null;
  playRotateSound();
  showComboToast('Rotate');
  render();
}

function flashInvalidBoard() {
  boardEl.classList.add('invalid');
  setTimeout(() => boardEl.classList.remove('invalid'), 220);
}

function attemptPlacement(row, col) {
  if (gameState !== 'playing') {
    return;
  }

  const piece = tray[selectedIndex];
  if (!piece) {
    return;
  }

  if (canPlaceAt(piece, row, col)) {
    placePiece(row, col);
  } else {
    flashInvalidBoard();
    playInvalidSound();
    setStatus('That placement is blocked. Try another spot.');
  }
}

boardEl.addEventListener('mousemove', (event) => {
  if (gameState !== 'playing') {
    return;
  }

  const cell = event.target.closest('.cell');
  if (!cell) {
    hoverCell = null;
    renderBoard();
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const piece = tray[selectedIndex];

  if (!piece) {
    hoverCell = null;
    renderBoard();
    return;
  }

  hoverCell = { row, col };
  renderBoard();
});

boardEl.addEventListener('touchstart', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell) {
    return;
  }
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  hoverCell = { row, col };
  renderBoard();
}, { passive: true });

boardEl.addEventListener('mouseleave', () => {
  hoverCell = null;
  renderBoard();
});

boardEl.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell) {
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  attemptPlacement(row, col);
});

trayEl.addEventListener('pointerdown', (event) => {
  const card = event.target.closest('.piece-card');
  if (!card) {
    return;
  }

  selectedIndex = Number(card.dataset.index);
  playRotateSound();
  render();
});

rotateBtn.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  rotateSelectedPiece();
});
newGameBtn.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  startNewGame();
});

document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r') {
    rotateSelectedPiece();
  }

  if (event.key >= '1' && event.key <= String(TRAY_SIZE)) {
    const index = Number(event.key) - 1;
    if (tray[index]) {
      selectedIndex = index;
      render();
    }
  }
});

startNewGame();
