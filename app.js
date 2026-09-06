const WIDTH = 960;
const HEIGHT = 540;
const ROBOT_WIDTH = 60;
const ROBOT_HEIGHT = 80;
const ITEM_SIZE = 30;
const GAME_DURATION = 30;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const video = document.querySelector('#camera');
const startButton = document.querySelector('#start-button');
const restartButton = document.querySelector('#restart-button');
const stageMessage = document.querySelector('#stage-message');
const messageText = document.querySelector('#message-text');
const status = document.querySelector('#status');

let handLandmarker;
let FilesetResolver;
let HandLandmarker;
let stream;
let lastVideoTime = -1;
let handX = WIDTH / 2;
let pointerActive = false;
let game;

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const color = (r, g, b) => `rgb(${r} ${g} ${b})`;

class Game {
  constructor() { this.highScore = Number(localStorage.getItem('dollarCatchHighScore') || 0); this.reset(); }
  reset() {
    this.score = 0; this.lives = 3; this.combo = 0; this.frame = 0;
    this.dollars = []; this.bombs = []; this.particles = []; this.floating = [];
    this.started = performance.now(); this.gameOver = false; this.won = false;
  }
  spawnDollar() { this.dollars.push({ x: random(50, WIDTH - 50), y: -ITEM_SIZE, value: [1, 5, 10, 20, 50][random(0, 4)], rotation: 0, bounce: 0 }); }
  spawnBomb() { this.bombs.push({ x: random(50, WIDTH - 50), y: -ITEM_SIZE, size: random(25, 35), rotation: 0 }); }
  collision(rx, ry, ox, oy, size) { return Math.hypot(rx + ROBOT_WIDTH / 2 - ox, ry + ROBOT_HEIGHT / 2 - oy) < ROBOT_WIDTH / 2 + size / 2; }
  burst(x, y, fill) { for (let i = 0; i < 15; i++) { const angle = Math.random() * Math.PI * 2; const speed = random(2, 6); this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, life: random(20, 40), fill }); } }
  text(x, y, value, fill) { this.floating.push({ x, y, value, fill, life: 40 }); }
  update(robotX, robotY) {
    if (this.gameOver || this.won) return;
    const elapsed = (performance.now() - this.started) / 1000;
    if (elapsed >= GAME_DURATION) { this.won = true; return; }
    this.frame++;
    if (this.frame % 30 === 0) this.spawnDollar();
    if (this.frame % 45 === 0 && this.bombs.length < 5) this.spawnBomb();
    const speed = 2 * (1 + Math.min(3, elapsed / 10) * .5);
    for (const dollar of [...this.dollars]) {
      dollar.y += speed; dollar.rotation += 2; dollar.bounce = Math.sin(this.frame * .1 + dollar.x) * 2;
      if (this.collision(robotX, robotY, dollar.x, dollar.y, ITEM_SIZE)) {
        this.score += dollar.value; this.combo++; this.dollars.splice(this.dollars.indexOf(dollar), 1); this.burst(dollar.x, dollar.y, '#5dff87'); this.text(dollar.x, dollar.y, `+$${dollar.value}`, '#5dff87');
        if (this.combo >= 5) { const bonus = this.combo * 2; this.score += bonus; this.text(dollar.x + 50, dollar.y - 20, `BONUS +${bonus}!`, '#c8f238'); }
      } else if (dollar.y > HEIGHT + 50) { this.dollars.splice(this.dollars.indexOf(dollar), 1); this.combo = 0; }
    }
    for (const bomb of [...this.bombs]) {
      bomb.y += speed * 1.2; bomb.rotation += 3;
      if (this.collision(robotX, robotY, bomb.x, bomb.y, bomb.size)) {
        this.lives--; this.combo = 0; this.bombs.splice(this.bombs.indexOf(bomb), 1); this.burst(bomb.x, bomb.y, '#ff6b5f'); this.text(bomb.x, bomb.y, 'BOOM!', '#ff6b5f');
        if (this.lives <= 0) { this.gameOver = true; this.highScore = Math.max(this.highScore, this.score); localStorage.setItem('dollarCatchHighScore', this.highScore); }
      } else if (bomb.y > HEIGHT + 50) this.bombs.splice(this.bombs.indexOf(bomb), 1);
    }
    for (const particle of [...this.particles]) { particle.x += particle.vx; particle.y += particle.vy; particle.vy += .1; particle.life--; if (particle.life <= 0) this.particles.splice(this.particles.indexOf(particle), 1); }
    for (const item of [...this.floating]) { item.y--; item.life--; if (item.life <= 0) this.floating.splice(this.floating.indexOf(item), 1); }
  }
}

function drawCamera() {
  ctx.fillStyle = '#08131b'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (video.readyState >= 2) { const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight); const w = video.videoWidth * scale; const h = video.videoHeight * scale; ctx.save(); ctx.translate(WIDTH, 0); ctx.scale(-1, 1); ctx.globalAlpha = .72; ctx.drawImage(video, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h); ctx.restore(); ctx.fillStyle = 'rgba(5, 14, 20, .36)'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
}
function drawDollar(item) { ctx.save(); ctx.translate(item.x, item.y + item.bounce); ctx.rotate(item.rotation * Math.PI / 180); ctx.fillStyle = '#13a85b'; ctx.strokeStyle = '#5dff87'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, ITEM_SIZE / 2, ITEM_SIZE / 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff0a6'; ctx.font = '700 17px Space Mono'; ctx.textAlign = 'center'; ctx.fillText(`$${item.value}`, 0, 6); ctx.restore(); }
function drawBomb(bomb) { const size = bomb.size / 2; ctx.save(); ctx.translate(bomb.x, bomb.y); ctx.rotate(bomb.rotation * Math.PI / 180); ctx.fillStyle = '#1d2730'; ctx.strokeStyle = '#9aa9ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#66747b'; ctx.beginPath(); ctx.arc(-5, -5, size / 3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#9aa9ad'; ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .7, -size - 10); ctx.stroke(); ctx.fillStyle = '#ff6b5f'; ctx.beginPath(); ctx.arc(size * .7, -size - 10, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawRobot(x, y) { const combo = game.combo; const body = game.gameOver ? '#e34d4d' : game.won ? '#25c7c7' : combo >= 10 ? '#e5bd31' : combo >= 5 ? '#25c7c7' : '#26c96c'; const accent = combo >= 5 ? '#0b6d68' : '#087944'; const swing = Math.sin(game.frame * .1) * 15; const cx = x + 30; ctx.save(); ctx.lineCap = 'round';
  ctx.fillStyle = '#9aa9ad'; ctx.strokeStyle = '#46545c'; ctx.lineWidth = 2; ctx.fillRect(cx - 10, y + 90, 20, 30); ctx.strokeRect(cx - 10, y + 90, 20, 30); ctx.fillStyle = '#dbe7e2'; ctx.beginPath(); ctx.arc(cx, y + 100, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 15, y + 75); ctx.lineTo(x + 10 + swing * .5, y + 105); ctx.moveTo(x + 45, y + 75); ctx.lineTo(x + 50 - swing * .5, y + 105); ctx.stroke();
  ctx.fillStyle = body; ctx.fillRect(x + 5, y + 15, 50, 65); ctx.strokeStyle = '#194d3b'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 15, 50, 65); ctx.fillStyle = '#00c8e0'; ctx.fillRect(cx - 8, y + 29, 16, 7); ctx.fillStyle = '#ffd737'; ctx.fillRect(cx - 8, y + 52, 16, 6);
  ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 5, y + 25); ctx.lineTo(x - 10 + swing * .3, y + 45); ctx.lineTo(x - 10 + swing * .5, y + 55); ctx.moveTo(x + 55, y + 25); ctx.lineTo(x + 70 - swing * .3, y + 45); ctx.lineTo(x + 70 - swing * .5, y + 55); ctx.stroke();
  ctx.fillStyle = '#b6c4c5'; ctx.strokeStyle = '#25363c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, y, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#16262d'; ctx.beginPath(); ctx.arc(cx - 9, y - 5, 4, 0, Math.PI * 2); ctx.arc(cx + 9, y - 5, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#25363c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, y + 3, 8, game.gameOver ? 0 : Math.PI, game.gameOver ? Math.PI : Math.PI * 2); ctx.stroke(); ctx.restore(); }
function drawRocket(x, y) { const cx = x + 30; const ry = y + ROBOT_HEIGHT + 10; ctx.save(); ctx.fillStyle = '#9aa9ad'; ctx.fillRect(cx - 10, ry, 20, 30); ctx.fillStyle = '#d34f4f'; ctx.beginPath(); ctx.moveTo(cx, ry - 8); ctx.lineTo(cx - 8, ry); ctx.lineTo(cx + 8, ry); ctx.fill(); ctx.fillStyle = '#71d9ee'; ctx.beginPath(); ctx.arc(cx, ry + 10, 5, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 3; i++) { ctx.strokeStyle = i < 2 ? '#ffbd33' : '#ff5f45'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx + i * 4 - 4, ry + 35 + (15 + Math.sin(game.frame * .2) * 5) * (i + 1) * .3, 8 - i * 2, (15 + Math.sin(game.frame * .2) * 5) * (1 - i * .2), 0, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
function drawHud() { const timeLeft = Math.max(0, GAME_DURATION - (performance.now() - game.started) / 1000); ctx.fillStyle = 'rgba(5, 12, 18, .82)'; ctx.fillRect(16, 16, 280, 72); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(16, 16, 280, 72); ctx.fillStyle = '#fff0a6'; ctx.font = '700 20px Space Mono'; ctx.textAlign = 'left'; ctx.fillText(`Score: $${game.score}`, 28, 43); ctx.fillStyle = '#ff6b5f'; ctx.font = '16px Space Mono'; ctx.fillText(`Lives: ${'O'.repeat(game.lives)}${'x'.repeat(3 - game.lives)}`, 28, 69); ctx.fillStyle = '#c8f238'; ctx.fillText(`Combo x${game.combo}`, 165, 69); ctx.fillStyle = '#22333c'; ctx.fillRect(WIDTH - 225, 20, 200, 14); ctx.fillStyle = timeLeft > 10 ? '#5dff87' : timeLeft > 5 ? '#ffd737' : '#ff6b5f'; ctx.fillRect(WIDTH - 225, 20, 200 * timeLeft / GAME_DURATION, 14); ctx.strokeStyle = '#dbe7e2'; ctx.strokeRect(WIDTH - 225, 20, 200, 14); ctx.fillStyle = '#fff'; ctx.font = '13px Space Mono'; ctx.fillText(`${Math.ceil(timeLeft)}s`, WIDTH - 65, 33); }
function drawEnd() { if (!game.gameOver && !game.won) return; ctx.fillStyle = 'rgba(5, 11, 18, .78)'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.textAlign = 'center'; ctx.fillStyle = game.gameOver ? '#ff6b5f' : '#c8f238'; ctx.font = '800 58px Barlow Condensed'; ctx.fillText(game.gameOver ? 'GAME OVER' : 'YOU WIN!', WIDTH / 2, HEIGHT / 2 - 42); ctx.fillStyle = '#fff'; ctx.font = '22px Space Mono'; ctx.fillText(`Final score: $${game.score}`, WIDTH / 2, HEIGHT / 2 + 8); ctx.fillStyle = '#9aa9ad'; ctx.font = '14px Space Mono'; ctx.fillText('Press Restart to play again', WIDTH / 2, HEIGHT / 2 + 45); }
function draw() { drawCamera(); for (const item of game.dollars) drawDollar(item); for (const bomb of game.bombs) drawBomb(bomb); for (const particle of game.particles) { ctx.globalAlpha = particle.life / 40; ctx.fillStyle = particle.fill; ctx.beginPath(); ctx.arc(particle.x, particle.y, Math.max(2, particle.life / 8), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; for (const item of game.floating) { ctx.fillStyle = item.fill; ctx.font = '700 16px Space Mono'; ctx.fillText(item.value, item.x, item.y); } const robotX = clamp(handX - ROBOT_WIDTH / 2, 0, WIDTH - ROBOT_WIDTH); const robotY = HEIGHT - 145; game.update(robotX, robotY); drawRocket(robotX, robotY); drawRobot(robotX, robotY); drawHud(); drawEnd(); requestAnimationFrame(draw); }

async function start() {
  startButton.disabled = true;
  messageText.textContent = 'Starting game...';
  stageMessage.classList.add('hidden');
  status.textContent = 'Mouse mode';
  status.dataset.state = 'live';
  game = new Game();
  requestAnimationFrame(draw);

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    console.warn('Camera unavailable; using mouse/touch controls.', error);
    status.textContent = 'Mouse mode';
  }

  try {
    ({ FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs'));
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: .7, minHandPresenceConfidence: .7,
      minTrackingConfidence: .7
    });
  } catch (error) {
    console.warn('Hand tracking unavailable; using mouse/touch controls.', error);
    handLandmarker = null;
    if (!stream) status.textContent = 'Mouse mode';
  }

  if (stream && handLandmarker) {
    status.textContent = 'Hand control live';
    status.dataset.state = 'live';
  }
  detectHand();
}
function detectHand() { if (!handLandmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return; lastVideoTime = video.currentTime; const result = handLandmarker.detectForVideo(video, performance.now()); if (result.landmarks?.[0]?.[8]) handX = (1 - result.landmarks[0][8].x) * WIDTH; requestAnimationFrame(detectHand); }
canvas.addEventListener('pointermove', event => { const rect = canvas.getBoundingClientRect(); handX = ((event.clientX - rect.left) / rect.width) * WIDTH; pointerActive = true; });
startButton.addEventListener('click', () => { start(); detectHand(); });
restartButton.addEventListener('click', () => { if (game) game.reset(); });
window.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'q' && stream) { stream.getTracks().forEach(track => track.stop()); stageMessage.classList.remove('hidden'); messageText.textContent = 'Camera paused. Start again to play.'; status.textContent = 'Camera paused'; status.dataset.state = 'idle'; } });
ctx.fillStyle = '#08131b'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#9aa9ad'; ctx.font = '16px Space Mono'; ctx.textAlign = 'center'; ctx.fillText('Start the camera to enter the arcade', WIDTH / 2, HEIGHT / 2);
