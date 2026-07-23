'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - azul palido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (nut)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const THEME_KEY = 'tetris-theme';
const HISCORES_KEY = 'tetris-hiscores';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeLabel = document.getElementById('theme-label');

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveNameBtn = document.getElementById('save-name-btn');
const startHiscoresEl = document.getElementById('start-hiscores');
const gameoverHiscoresEl = document.getElementById('gameover-hiscores');
const startBestComboEl = document.getElementById('start-best-combo');
const startMaxLinesEl = document.getElementById('start-max-lines');
const gameoverBestComboEl = document.getElementById('gameover-best-combo');
const gameoverMaxLinesEl = document.getElementById('gameover-max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const resetRecordsBtnStart = document.getElementById('reset-records-btn-start');

let board, current, next, hold, canHold, score, lines, level, combo, maxCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let pendingHiscores = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  canHold = true;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

function holdPiece() {
  if (paused || gameOver || !canHold) return;
  const currentType = current.type;
  if (hold === null) {
    hold = currentType;
    spawn();
  } else {
    const swapType = hold;
    hold = currentType;
    current = makePiece(swapType);
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  canHold = false;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  holdCanvas.classList.toggle('locked', !canHold);
  if (hold === null) return;
  const shape = PIECES[hold];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHiscores() {
  try {
    const raw = localStorage.getItem(HISCORES_KEY);
    if (!raw) return { topScores: [], bestCombo: 0, maxLines: 0 };
    const data = JSON.parse(raw);
    return {
      topScores: Array.isArray(data.topScores) ? data.topScores : [],
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch {
    return { topScores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveHiscores(data) {
  localStorage.setItem(HISCORES_KEY, JSON.stringify(data));
}

function qualifiesForTopScores(hiscores, s) {
  return hiscores.topScores.length < 5 || s > hiscores.topScores[hiscores.topScores.length - 1].score;
}

function renderHiscoresInto(tableEl, hiscores, highlightIndex) {
  tableEl.innerHTML = '';
  if (hiscores.topScores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hiscores-empty';
    empty.textContent = 'Sin puntuaciones aún';
    tableEl.appendChild(empty);
    return;
  }
  const list = document.createElement('ol');
  list.className = 'hiscores-list';
  hiscores.topScores.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.classList.add('hiscore-new');
    const name = document.createElement('span');
    name.className = 'hiscore-name';
    name.textContent = entry.name;
    const sc = document.createElement('span');
    sc.className = 'hiscore-score';
    sc.textContent = entry.score.toLocaleString();
    li.appendChild(name);
    li.appendChild(sc);
    list.appendChild(li);
  });
  tableEl.appendChild(list);
}

function renderAllHiscores(highlightIndex) {
  const hiscores = loadHiscores();
  renderHiscoresInto(startHiscoresEl, hiscores, -1);
  renderHiscoresInto(gameoverHiscoresEl, hiscores, highlightIndex ?? -1);
  startBestComboEl.textContent = hiscores.bestCombo;
  startMaxLinesEl.textContent = hiscores.maxLines;
  gameoverBestComboEl.textContent = hiscores.bestCombo;
  gameoverMaxLinesEl.textContent = hiscores.maxLines;
}

function resetRecords() {
  saveHiscores({ topScores: [], bestCombo: 0, maxLines: 0 });
  if (pendingHiscores) pendingHiscores = { topScores: [], bestCombo: 0, maxLines: 0 };
  renderAllHiscores(-1);
}

function submitName() {
  if (!pendingHiscores) return;
  const name = (nameInput.value.trim() || 'AAA').slice(0, 12);
  const entry = { name, score };
  pendingHiscores.topScores.push(entry);
  pendingHiscores.topScores.sort((a, b) => b.score - a.score);
  pendingHiscores.topScores = pendingHiscores.topScores.slice(0, 5);
  saveHiscores(pendingHiscores);
  const idx = pendingHiscores.topScores.indexOf(entry);
  nameEntry.classList.add('hidden');
  renderAllHiscores(idx);
  pendingHiscores = null;
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  gameoverExtra.classList.remove('hidden');

  const hiscores = loadHiscores();
  let recordsChanged = false;
  if (maxCombo > hiscores.bestCombo) { hiscores.bestCombo = maxCombo; recordsChanged = true; }
  if (lines > hiscores.maxLines) { hiscores.maxLines = lines; recordsChanged = true; }

  if (qualifiesForTopScores(hiscores, score)) {
    if (recordsChanged) saveHiscores(hiscores);
    pendingHiscores = hiscores;
    nameEntry.classList.remove('hidden');
    renderAllHiscores(-1);
    nameInput.value = '';
    nameInput.focus();
  } else {
    if (recordsChanged) saveHiscores(hiscores);
    nameEntry.classList.add('hidden');
    pendingHiscores = null;
    renderAllHiscores(-1);
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver && !paused) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  hold = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  drawHold();
  overlay.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
  nameEntry.classList.add('hidden');
  pendingHiscores = null;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

saveNameBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitName();
});

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

resetRecordsBtn.addEventListener('click', resetRecords);
resetRecordsBtnStart.addEventListener('click', resetRecords);

function setThemeUI(isLight) {
  document.body.classList.toggle('light', isLight);
  themeIcon.textContent = isLight ? '☀️' : '🌙';
  themeLabel.textContent = isLight ? 'LIGHT' : 'DARK';
  themeToggleBtn.setAttribute('aria-pressed', String(isLight));
}

function initTheme() {
  setThemeUI(localStorage.getItem(THEME_KEY) === 'light');
}

themeToggleBtn.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light');
  setThemeUI(isLight);
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  draw();
  drawNext();
  drawHold();
});

function showStartScreen() {
  renderAllHiscores(-1);
  startScreen.classList.remove('hidden');
}

initTheme();
showStartScreen();
