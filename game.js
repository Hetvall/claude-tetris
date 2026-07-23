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

const PASTEL_COLORS = [
  null,
  '#a8e6f0', // I - cyan pastel
  '#fbe8a6', // O - yellow pastel
  '#dcb8e8', // T - purple pastel
  '#bfe3c0', // S - green pastel
  '#f0b8b8', // Z - red pastel
  '#b8d4f0', // J - azul pastel
  '#f5d0a8', // L - naranja pastel
  '#d8dde3', // Tuerca - gris pastel
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

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
const skinSelector = document.getElementById('skin-selector');
const skinButtons = skinSelector ? Array.from(skinSelector.querySelectorAll('.skin-btn')) : [];

let board, current, next, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let currentSkin = 'retro';

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
    updateHUD();
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
  context.globalAlpha = alpha ?? 1;
  switch (currentSkin) {
    case 'neon':
      drawBlockNeon(context, x, y, colorIndex, size);
      break;
    case 'pastel':
      drawBlockPastel(context, x, y, colorIndex, size);
      break;
    case 'pixel':
      drawBlockPixel(context, x, y, colorIndex, size);
      break;
    default:
      drawBlockRetro(context, x, y, colorIndex, size);
      break;
  }
  context.globalAlpha = 1;
}

function drawBlockRetro(context, x, y, colorIndex, size) {
  const color = COLORS[colorIndex];
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBlockNeon(context, x, y, colorIndex, size) {
  const color = COLORS[colorIndex];
  const bx = x * size + 2, by = y * size + 2, bw = size - 4, bh = size - 4;
  context.save();
  context.shadowBlur = size * 0.5;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(bx, by, bw, bh);
  context.restore();
  // make sure the glow never leaks into anything drawn afterwards
  context.shadowBlur = 0;
}

function drawBlockPastel(context, x, y, colorIndex, size) {
  const color = PASTEL_COLORS[colorIndex];
  const bx = x * size + 1, by = y * size + 1, bw = size - 2, bh = size - 2;
  const radius = Math.min(6, bw / 3, bh / 3);
  context.fillStyle = color;
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(bx, by, bw, bh, radius);
    context.fill();
  } else {
    // fallback: approximate rounded corners with a slightly inset rect
    context.fillRect(bx + radius / 2, by, bw - radius, bh);
    context.fillRect(bx, by + radius / 2, bw, bh - radius);
  }
  // soft highlight
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(bx + radius, by + 2, bw - radius * 2, 3);
}

function drawBlockPixel(context, x, y, colorIndex, size) {
  const color = COLORS[colorIndex];
  const bx = x * size + 1, by = y * size + 1, bw = size - 2, bh = size - 2;
  context.fillStyle = color;
  context.fillRect(bx, by, bw, bh);
  // dither / checkerboard texture to suggest pixel-art shading
  const dot = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let dy = 0; dy < bh; dy += dot * 2) {
    for (let dx = 0; dx < bw; dx += dot * 2) {
      const w1 = Math.min(dot, bw - dx);
      const h1 = Math.min(dot, bh - dy);
      if (w1 > 0 && h1 > 0) context.fillRect(bx + dx, by + dy, w1, h1);
      const dx2 = dx + dot, dy2 = dy + dot;
      const w2 = Math.min(dot, bw - dx2);
      const h2 = Math.min(dot, bh - dy2);
      if (w2 > 0 && h2 > 0) context.fillRect(bx + dx2, by + dy2, w2, h2);
    }
  }
  // scanline highlight along the top edge
  context.fillStyle = 'rgba(255,255,255,0.22)';
  context.fillRect(bx, by, bw, 2);
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
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

function setSkinUI(skin) {
  currentSkin = skin;
  SKINS.forEach(s => document.body.classList.remove('skin-' + s));
  document.body.classList.add('skin-' + skin);
  skinButtons.forEach(btn => {
    const active = btn.dataset.skin === skin;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  setSkinUI(SKINS.includes(saved) ? saved : 'retro');
}

skinButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const skin = btn.dataset.skin;
    setSkinUI(skin);
    localStorage.setItem(SKIN_KEY, skin);
    draw();
    drawNext();
    drawHold();
  });
});

initTheme();
initSkin();
init();
