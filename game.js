'use strict';

// ================= 定数 =================
let W = 960; const H = 540;       // 見えている横幅は画面比率に合わせ、縦幅は固定する
const LEVEL_W = 6200;              // 最奥にボスステージを追加した全長
const BOSS_STAGE_START = 4800;      // オンボロイド専用エリアの開始位置
const BOSS_STAGE_END = LEVEL_W;     // ボスステージの終端
const DT = 1 / 60;                 // 固定タイムステップ（すり抜け防止）
const GRAVITY = 2200, MAX_FALL = 900;
const MOVE_SPEED = 300, JUMP_V = -760, DOUBLE_JUMP_V = -680;
const STAND_H = 56, CROUCH_H = 34, CROUCH_SPEED = 110;   // 立ち/しゃがみの高さと、しゃがみ移動の速度
const DODGE_TIME = 0.22, DODGE_SPEED = 700;
const DODGE_MAX_CHARGES = 3, DODGE_RECHARGE_TIME = 1.5;
const DODGE_TRAIL_INTERVAL = 0.035, DODGE_TRAIL_LIFE = 0.18;
const COMBO_WINDOW = 0.3;          // 次の攻撃を受け付ける時間(秒)
const HEAVY_HOLD_THRESHOLD = 0.28; // 長押しで強攻撃に切り替わる時間
const HEAVY_DURATION = 0.72;       // 回転切りは短めに終わる
const HEAVY_COOLDOWN = 1.65;       // 回転切り終了後もしばらく再使用できない
const ENEMY_RESPAWN_DELAY = 2.5;   // 全滅後、少し間を置いて敵が再出現する
const HEAVY_HIT_TIMES = [0.01, 0.17, 0.33, 0.49]; // すぐに当たり、短い間隔で4回攻撃
const DOWN_ATTACK_DURATION = 0.36;
const DOWN_ATTACK_HIT_FROM = 0.06, DOWN_ATTACK_HIT_TO = 0.25;
const DOWN_ATTACK_DAMAGE = 16;
const ORB_ENERGY_VALUE = 12;
const HURT_INVULN = 1.44;          // 被弾後の無敵時間(秒)
const GUARD_HOLD_THRESHOLD = 0.18; // 通常時、スペース長押しでガードに切り替わる時間
const GUARD_HURT_HOLD_THRESHOLD = 0.06; // 被弾硬直・無敵中は素早くガードへ移行
const GUARD_REPEL_SPEED = 410;     // 強すぎない距離まで押し返し、密着解除はできる速度
const GUARD_REPEL_LIFT = -65;      // 浮き上がりを控えめにする
const GUARD_REPEL_STUN = 0.36;     // 押し返した敵のスタン時間
const GUARD_REPEL_RADIUS_X = 116;  // プレイヤー周辺の敵も押し返す範囲
const GUARD_REPEL_RADIUS_Y = 82;
const JUST_PARRY_WINDOW = 0.22;   // スペース短押しで敵の攻撃を受け流せる時間
// ガードの消費量は固定ではなく、受けた攻撃のダメージ量に比例する。
const GUARD_HIT_INTERVAL = 0.42;   // 同じ敵との接触で連続消費しないための間隔
const CHASE_RANGE = 320, ENEMY_PATROL = 70, ENEMY_CHASE = 110;
const ENEMY_SPAWNS = [560, 930, 1280, 1660, 2050, 2380, 2730, 3090, 3450, 3820, 4180, 4480]; // ボス区画より前に散らして配置
const ENEMY_TYPES = ['melee', 'machinegun', 'laser', 'melee', 'laser', 'machinegun']; // 近接・マシンガン・レーザー
const RANGED_DETECTION_RANGE = { machinegun: 340, laser: 430 }; // 遠距離敵の索敵距離を縮小
const RANGED_FIRE_RANGE = { machinegun: 300, laser: 370 };       // 実際に攻撃を開始する距離
const RANGED_DETECTION_HEIGHT = { machinegun: 100, laser: 112 }; // 上下に離れた敵を撃ち続けない
const ENEMY_DEATH_ANIM_TIME = 0.65;
const ENEMY_EXPLOSION_TIME = 1.6; // 爆発スプライトシートの再生時間

// 通常攻撃3段分のデータ（攻撃の速度・威力・判定・演出はここだけで調整する）
//  dur:全体時間 hitFrom/hitTo:判定が出る時間 chainFrom:この時間以降の入力で即次段へつながる
//  range/h/yOff:判定の幅・高さ・上下位置 lunge:前進速度 knock/lift:敵の吹き飛び(横/縦) stun:敵のひるみ秒
//  stop:ヒットストップ秒 shake:画面揺れ flash:敵の白点滅秒 sparks:火花の数 lean:身体の傾き
//  arc:斬撃の弧(from/to:角度 r:半径 w:太さ col:色)
const ATTACKS = [
  // 1段目：素早い始動技（振り下ろし）
  { dur: 0.24, hitFrom: 0.05, hitTo: 0.13, chainFrom: 0.13, dmg: 10, range: 62, h: 48, yOff: 6, lunge: 230, knock: 180, lift: 0,
    stun: 0.22, stop: 0.04, shake: 2, flash: 0.1, sparks: 6, lean: 0.1, arc: { from: -1.3, to: 1.1, r: 70, w: 4, col: '#3df2ff' } },
  // 2段目：逆方向への切り上げ（少し重い）
  { dur: 0.27, hitFrom: 0.06, hitTo: 0.16, chainFrom: 0.15, dmg: 12, range: 72, h: 52, yOff: 2, lunge: 210, knock: 300, lift: -70,
    stun: 0.26, stop: 0.055, shake: 3, flash: 0.12, sparks: 8, lean: 0.14, arc: { from: 1.2, to: -1.0, r: 76, w: 5, col: '#e9fbff' } },
  // 3段目：溜めてから大きく振り抜くフィニッシュ（強いヒットストップ・大きく吹き飛ばす）
  { dur: 0.52, hitFrom: 0.16, hitTo: 0.3, chainFrom: 99, dmg: 24, range: 100, h: 66, yOff: -6, lunge: 360, knock: 560, lift: -380,
    stun: 0.7, stop: 0.13, shake: 9, flash: 0.2, sparks: 14, lean: 0.24, finish: true, arc: { from: -2.4, to: 1.5, r: 108, w: 8, col: '#ff8a1f' } },
];

// 床と足場（【拡張】ステージごとにこの配列を差し替える）
const solids = [
  { x: 0,    y: 480, w: LEVEL_W, h: 60 },
  { x: 480,  y: 390, w: 180, h: 24 },
  { x: 720,  y: 310, w: 180, h: 24 },
  { x: 1250, y: 390, w: 220, h: 24 },
  // 横幅を2倍にした拡張エリアの足場
  { x: 2520, y: 390, w: 220, h: 24 },
  { x: 2920, y: 310, w: 190, h: 24 },
  { x: 3380, y: 390, w: 240, h: 24 },
  { x: 3820, y: 330, w: 210, h: 24 },
  { x: 4260, y: 390, w: 250, h: 24 },
  // ボスステージ直前までの足場。ボス区画(BOSS_STAGE_START以降)は浮き台を置かず、
  // 地上だけでオンボロイドの背景干渉攻撃を回避できる構成にする。
  { x: 4620, y: 390, w: 150, h: 22 },
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('gameover');
const pauseMenu = document.getElementById('pauseMenu');
const pauseMainPanel = document.getElementById('pauseMainPanel');
const pauseSettingsPanel = document.getElementById('pauseSettingsPanel');
let pauseMenuOpen = false;
let viewportScale = 1;

// 画面全体に描きつつ、画面比率が変わっても画像を引き伸ばさない
function resizeGameCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || window.innerWidth);
  const cssHeight = Math.max(1, rect.height || window.innerHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  viewportScale = cssHeight / H;
  W = Math.max(1, Math.round(cssWidth / viewportScale));
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  ctx.setTransform(dpr * viewportScale, 0, 0, dpr * viewportScale, 0, 0);
}
resizeGameCanvas();
window.addEventListener('resize', resizeGameCanvas, { passive: true });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeGameCanvas, { passive: true });

// ================= ユーティリティ =================
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// 2点を結ぶ線分が矩形を横切るかを調べる（足場による攻撃遮蔽判定にも使用）。
function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  let tMin = 0, tMax = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const edges = [
    [-dx, x1 - rect.x],
    [ dx, rect.x + rect.w - x1],
    [-dy, y1 - rect.y],
    [ dy, rect.y + rect.h - y1],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) tMin = Math.max(tMin, t);
    else tMax = Math.min(tMax, t);
    if (tMin > tMax) return false;
  }
  return true;
}

// 攻撃者と敵の間に足場がある場合は、足場を貫通して敵へ命中しない。
// 同じ高さ・同じ足場上の敵には従来どおり攻撃が届く。
function playerAttackCanReachEnemy(enemy, origin = p) {
  if (!origin || !enemy) return false;
  const x1 = origin.x + origin.w / 2;
  const y1 = origin.y + origin.h * 0.52;
  const x2 = enemy.x + enemy.w / 2;
  const y2 = enemy.y + enemy.h * 0.5;
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  for (const solid of solids) {
    // 線分の範囲と重ならない足場は調べない。
    if (solid.x + solid.w < minX || solid.x > maxX || solid.y + solid.h < minY || solid.y > maxY) continue;
    if (segmentIntersectsRect(x1, y1, x2, y2, solid)) return false;
  }
  return true;
}

// ================= 入力 =================
// 右クリックのブラウザ標準メニューと、ゲーム中の選択ハイライトを抑止する。
document.addEventListener('contextmenu', (event) => { event.preventDefault(); }, { capture: true });
const keys = {};
const input = { jump: false, attack: false, dodge: false }; // 1回押しの入力
const mouseAttack = { down: false, elapsed: 0, triggered: false, source: '' }; // マウス・キーボードの短押し・長押し判定
let touchMoveAxis = 0; // アナログスティックの左右入力（-1〜1）
let touchCrouch = false; // スティックを下に倒している間のしゃがみ入力
const boundKey = (action) => Settings.keybinds[action] || ''; // 設定画面で変更したキーを取得
let gameplaySpacePress = false; // 戦闘中のスペース入力だけをガード判定に使う

// パリィ／ガード解除時は、重なった敵だけでなく至近距離の敵もまとめて押し返す。
function repelEnemiesAroundPlayer(speed = GUARD_REPEL_SPEED, lift = GUARD_REPEL_LIFT,
  stunDuration = GUARD_REPEL_STUN, radiusX = GUARD_REPEL_RADIUS_X, radiusY = GUARD_REPEL_RADIUS_Y) {
  if (!p || !Array.isArray(enemies)) return 0;
  const playerCenterX = p.x + p.w / 2;
  const playerCenterY = p.y + p.h * 0.55;
  let pushed = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const enemyCenterX = enemy.x + enemy.w / 2;
    const enemyCenterY = enemy.y + enemy.h / 2;
    const dx = enemyCenterX - playerCenterX;
    const dy = enemyCenterY - playerCenterY;
    const touching = overlap(p, enemy);
    if (!touching && (Math.abs(dx) > radiusX || Math.abs(dy) > radiusY)) continue;
    const awayDir = Math.sign(dx) || (enemy.x >= playerCenterX ? 1 : -1);
    enemy.heavyCarryTimer = 0;
    enemy.vx = awayDir * speed;
    enemy.vy = lift;
    enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
    // 密着した敵を少しだけ即座にずらし、次フレームの重なりダメージを防ぐ。
    if (touching) {
      enemy.x = Math.max(0, Math.min(LEVEL_W - enemy.w, enemy.x + awayDir * 8));
    }
    pushed++;
  }
  return pushed;
}

function beginGuardInput() {
  keys[boundKey('guard')] = true;
  if (state !== 'playing' || !p || UI.overlay) return;
  gameplaySpacePress = true;
  p.guardHoldElapsed = 0;
  p.guardActive = false;
  p.parryWindow = JUST_PARRY_WINDOW;
}

function endGuardInput() {
  keys[boundKey('guard')] = false;
  gameplaySpacePress = false;
  if (p) {
    const wasGuarding = p.guardActive;
    p.guardActive = false;
    p.guardHoldElapsed = 0;
    // ガードを実際に構えていた状態から解除したら、周囲の敵をパリィ並みに押し返す。
    if (wasGuarding && state === 'playing' && !UI.overlay) {
      const pushed = repelEnemiesAroundPlayer();
      if (pushed > 0) {
        const playerCenter = p.x + p.w / 2;
        UI.fx.push({ ring: true, x: playerCenter, y: p.y + p.h * 0.55, r: 72, col: C.cyan, life: 0.24, max: 0.24 });
        Sound.play('guard');
      }
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  // ESC：ゲーム中は一時停止メニューを開閉。別のゲーム内UIが開いていれば先に閉じる。
  if (e.code === 'Escape' && state === 'playing') {
    e.preventDefault();
    if (pauseMenuOpen) closePauseMenu();
    else if (UI.overlay) UI.overlay = null;
    else openPauseMenu();
    return;
  }
  // 一時停止メニュー上ではゲーム用のキー入力を処理しない。
  if (pauseMenuOpen) return;

  const assignedCodes = Object.values(Settings.keybinds || {});
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) || assignedCodes.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (Title.keydown(e.code)) return;   // タイトル画面中は、キー入力をタイトル側が受け取る
  if (UI.keydown(e.code)) return;      // インベントリー・スキルなどのUI操作
  if (e.code === boundKey('guard')) beginGuardInput();
  if (e.code === boundKey('jump')) input.jump = true;
  if (e.code === boundKey('dodge')) input.dodge = true;
  if (e.code === boundKey('attack') && !UI.overlay) {
    mouseAttack.down = true; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = 'keyboard';
  }
});

function openPauseMenu() {
  if (state !== 'playing' || pauseMenuOpen) return;
  pauseMenuOpen = true;
  if (pauseMenu) pauseMenu.classList.remove('hidden');
  if (pauseMainPanel) pauseMainPanel.classList.remove('hidden');
  if (pauseSettingsPanel) pauseSettingsPanel.classList.add('hidden');
  UI.overlay = null;
  // 開いた瞬間に移動・攻撃入力をクリアし、閉じた直後に操作が暴発しないようにする。
  for (const k in keys) keys[k] = false;
  input.jump = input.attack = input.dodge = false;
  gameplaySpacePress = false;
  if (p) { p.guardActive = false; p.guardHoldElapsed = 0; p.parryWindow = 0; }
  mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  touchMoveAxis = 0; touchCrouch = false;
  const knob = document.getElementById('touchJoystickKnob');
  if (knob) { knob.style.left = '50%'; knob.style.top = '50%'; }
  syncPauseSettings();
}

function closePauseMenu() {
  pauseMenuOpen = false;
  if (pauseMenu) pauseMenu.classList.add('hidden');
  if (pauseSettingsPanel) pauseSettingsPanel.classList.add('hidden');
  if (pauseMainPanel) pauseMainPanel.classList.remove('hidden');
  // ESCを押したまま閉じても、移動や回避が再発動しないようにキーを初期化する。
  for (const k in keys) keys[k] = false;
  input.jump = input.attack = input.dodge = false;
  gameplaySpacePress = false;
  if (p) { p.guardActive = false; p.guardHoldElapsed = 0; }
}

function syncPauseSettings() {
  const volume = document.getElementById('pauseVolume');
  const volumeValue = document.getElementById('pauseVolumeValue');
  const shake = document.getElementById('pauseShake');
  const flash = document.getElementById('pauseFlash');
  if (volume) volume.value = String(Settings.volume);
  if (volumeValue) volumeValue.textContent = `${Settings.volume * 10}%`;
  if (shake) shake.checked = Boolean(Settings.shake);
  if (flash) flash.checked = Boolean(Settings.flash);
}

function returnToTitleFromPause() {
  closePauseMenu();
  UI.overlay = null;
  overlay.classList.add('hidden');
  Title.open();
}

function restartFromPause() {
  closePauseMenu();
  resetGame();
}

window.addEventListener('keyup', (e) => {
  if (e.code === boundKey('guard')) endGuardInput();
  else if (e.code === boundKey('attack') && mouseAttack.source === 'keyboard') {
    if (mouseAttack.down && !mouseAttack.triggered) input.attack = true;
    mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  }
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  gameplaySpacePress = false;
  if (p) { p.guardActive = false; p.guardHoldElapsed = 0; p.parryWindow = 0; }
  mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  touchMoveAxis = 0; touchCrouch = false;
  const knob = document.getElementById('touchJoystickKnob'); if (knob) { knob.style.left = '50%'; knob.style.top = '50%'; }
  Title.release();
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) {
    e.preventDefault();
    if (Title.click(e)) return;
    if (UI.click(e)) return;
    mouseAttack.down = true; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = 'mouse';
  }
});
canvas.addEventListener('pointermove', (e) => Title.move(e));   // タイトル画面のメニュー選択用
window.addEventListener('pointerup', (e) => {
  Title.release();
  if (e.button === 0 && mouseAttack.down && mouseAttack.source === 'mouse') {
    if (!mouseAttack.triggered) input.attack = true;
    mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  }
});
window.addEventListener('pointercancel', () => {
  mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  touchMoveAxis = 0; touchCrouch = false;
  const knob = document.getElementById('touchJoystickKnob'); if (knob) { knob.style.left = '50%'; knob.style.top = '50%'; }
  Title.release();
});

// スマホはアナログスティックで移動し、4つのボタンでジャンプ・回避・スキル・必殺技を操作する
function setupTouchControls() {
  const controls = document.getElementById('touchControls');
  const stick = document.getElementById('touchJoystick');
  const base = document.getElementById('touchJoystickBase');
  const knob = document.getElementById('touchJoystickKnob');
  let stickPointerId = null;

  const resetStick = () => {
    touchMoveAxis = 0;
    touchCrouch = false;
    stickPointerId = null;
    if (knob) { knob.style.left = '50%'; knob.style.top = '50%'; }
    if (stick) stick.classList.remove('is-pressed');
  };
  const moveStick = (e) => {
    if (!base || !knob) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const knobRect = knob.getBoundingClientRect();
    const maxX = Math.max(1, (rect.width - knobRect.width) / 2 - 3);
    const maxY = Math.max(1, (rect.height - knobRect.height) / 2 - 3);
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const distance = Math.hypot(dx, dy);
    const maxDistance = Math.min(maxX, maxY);
    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      dx *= scale;
      dy *= scale;
    }
    knob.style.left = `calc(50% + ${dx}px)`;
    knob.style.top = `calc(50% + ${dy}px)`;
    const horizontal = dx / maxX;
    touchMoveAxis = Math.abs(horizontal) < 0.18 ? 0 : Math.max(-1, Math.min(1, horizontal));
    touchCrouch = dy / maxY > 0.62;
  };

  if (stick && base) {
    stick.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      stickPointerId = e.pointerId;
      stick.classList.add('is-pressed');
      if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickPointerId) return;
      e.preventDefault();
      moveStick(e);
    });
    const releaseStick = (e) => {
      if (stickPointerId !== null && e && e.pointerId !== stickPointerId) return;
      if (e && e.preventDefault) e.preventDefault();
      resetStick();
    };
    stick.addEventListener('pointerup', releaseStick);
    stick.addEventListener('pointercancel', releaseStick);
    stick.addEventListener('lostpointercapture', releaseStick);
    stick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const pressOnce = (id, action) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.classList.add('is-pressed');
      action();
      if (button.setPointerCapture) button.setPointerCapture(e.pointerId);
    });
    const release = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      button.classList.remove('is-pressed');
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  pressOnce('touchJump', () => { if (state === 'playing' && !UI.overlay) input.jump = true; });
  pressOnce('touchDodge', () => { if (state === 'playing' && !UI.overlay) input.dodge = true; });
  pressOnce('touchSkill', () => { if (state === 'playing' && !UI.overlay) UI.useE(); });
  pressOnce('touchUlt', () => { if (state === 'playing' && !UI.overlay) UI.useQ(); });
  return controls;
}
const touchControls = setupTouchControls();

// 左右入力（-1:左, 0:なし, 1:右）
function getDir() {
  const keyboardDir = ((keys[boundKey('right')] || keys.ArrowRight) ? 1 : 0) - ((keys[boundKey('left')] || keys.ArrowLeft) ? 1 : 0);
  return keyboardDir || touchMoveAxis;
}

// ================= ゲーム状態 =================
let p, enemies, effects, cam, state;
let orbs = [];
let enemyProjectiles = [];
let bossProjectiles = []; // 奥／手前レイヤーから飛んでくるボスの指ロケット
window.BossHUD = { active: false, hp: 0, maxHp: 1, name: 'オンボロイド' };
let boss = createBossState();
let respawnTimer = -1;
const bossWorldElement = document.getElementById('bossWorld');
const bossWarningElement = document.getElementById('bossWarning');
const bossLaserElement = document.getElementById('bossLaserBeam');

function createBossState() {
  return {
    name: 'オンボロイド', x: BOSS_STAGE_START + 560, y: 94, w: 180, h: 190,
    hp: 1600, maxHp: 1600, active: false, defeated: false, visualFinished: false,
    attack: 'idle', phase: 'idle', phaseTimer: 0, nextAttackTimer: 1.6,
    targetX: BOSS_STAGE_START + 560, targetScreenX: 480, side: 'left',
    hitApplied: false, swipeProgress: 0, flailRemaining: 0,
    rocketsRemaining: 0, rocketShotTimer: 0, attackElapsed: 0,
    hurtFlash: 0, defeatTimer: 0, attackCount: 0,
  };
}

function syncBossOverlay() {
  if (window.BossHUD) {
    window.BossHUD.active = !!(boss && boss.active && !boss.defeated);
    window.BossHUD.hp = boss ? boss.hp : 0;
    window.BossHUD.maxHp = boss ? boss.maxHp : 1;
    window.BossHUD.name = boss ? boss.name : 'オンボロイド';
  }
  if (!bossWorldElement || !boss) return;
  bossWorldElement.classList.toggle('active', !!(boss.active && !boss.visualFinished));
  bossWorldElement.classList.toggle('is-defeated', !!boss.defeated);
  bossWorldElement.dataset.attack = boss.attack || 'idle';
  bossWorldElement.dataset.phase = boss.phase || 'idle';
  bossWorldElement.dataset.side = boss.side || 'left';
  // ボス本体は画面中央固定ではなく、ボスステージのワールド中央に配置する。
  // カメラ移動に合わせてワールド座標→画面座標へ変換するため、スクロール中もステージ内の位置が変わらない。
  const stageCenterWorldX = (BOSS_STAGE_START + BOSS_STAGE_END) / 2;
  const stageCenterScreenX = stageCenterWorldX - (cam ? cam.x : 0);
  const stageCenterPercent = (stageCenterScreenX / Math.max(1, W)) * 100;
  bossWorldElement.style.setProperty('--boss-stage-center-x', `${stageCenterPercent}%`);

  const targetScreenX = Math.max(18, Math.min(W - 18, (boss.targetX || (p ? p.x + p.w / 2 : W / 2)) - (cam ? cam.x : 0)));
  bossWorldElement.style.setProperty('--boss-target-x', `${(targetScreenX / Math.max(1, W)) * 100}%`);
  bossWorldElement.style.setProperty('--boss-laser-x', `${(targetScreenX / Math.max(1, W)) * 100}%`);
  if (bossWarningElement) {
    bossWarningElement.style.left = `${(targetScreenX / Math.max(1, W)) * 100}%`;
    bossWarningElement.classList.toggle('is-visible', boss.active && !boss.defeated && boss.phase === 'telegraph' && ['slam', 'flail'].includes(boss.attack));
  }
  if (bossLaserElement) {
    bossLaserElement.classList.toggle('is-warning', boss.active && !boss.defeated && boss.attack === 'eye-laser' && boss.phase === 'telegraph');
    bossLaserElement.classList.toggle('is-active', boss.active && !boss.defeated && boss.attack === 'eye-laser' && boss.phase === 'active');
  }
}

function activateBoss() {
  if (!boss || boss.active || boss.defeated) return;
  boss.active = true;
  boss.attack = 'idle'; boss.phase = 'idle'; boss.nextAttackTimer = 1.55;
  boss.targetX = p.x + p.w / 2;
  // ボス区画では通常敵の攻撃を停止し、雑魚の弾もクリアする。
  enemyProjectiles = [];
  for (const enemy of enemies || []) {
    enemy.vx = 0; enemy.attackTimer = 0; enemy.attackMode = ''; enemy.burstRemaining = 0;
  }
  // ボスステージに通常敵を連れ込まない。弾も上で消去済み。
  enemies = [];
  if (UI && UI.addText) UI.addText('ONBOROID / BACKGROUND INTERFERENCE', p.x + p.w / 2, p.y - 50, '#ff4057', 15);
  syncBossOverlay();
}

function playerCanDamageBoss() {
  return !!(boss && boss.active && !boss.defeated && p && p.x + p.w / 2 >= BOSS_STAGE_START - 80 && p.x < BOSS_STAGE_END);
}

function damageBoss(damage, power = 1, attackData = {}) {
  if (!playerCanDamageBoss() || boss.hp <= 0) return;
  const amount = Math.max(1, Number(damage) || 0);
  boss.hp = Math.max(0, boss.hp - amount);
  boss.hurtFlash = 0.16;
  const target = { x: p.x + p.w / 2 - 90, y: 58, w: 180, h: 156 };
  UI.hit(target, amount, power, { flash: 0.12, sparks: 7, shake: attackData.shake ?? 2, stop: attackData.stop ?? 0.025 }, p.facing || 1);
  if (boss.hp <= 0) {
    boss.defeated = true; boss.phase = 'defeated'; boss.attack = 'defeated'; boss.defeatTimer = 2.2;
    bossProjectiles = [];
    if (bossLaserElement) { bossLaserElement.classList.remove('is-active', 'is-warning'); }
    UI.addText('ONBOROID DEFEATED', p.x + p.w / 2, p.y - 70, '#ff4057', 24);
    UI.hitStop = Math.max(UI.hitStop, 0.18);
  }
  syncBossOverlay();
}

function startBossAttack() {
  const attacks = ['slam', 'swipe', 'flail', 'rockets', 'eye-laser'];
  boss.attack = attacks[Math.floor(Math.random() * attacks.length)];
  boss.phase = 'telegraph'; boss.hitApplied = false; boss.attackElapsed = 0;
  boss.side = Math.random() < 0.5 ? 'left' : 'right';
  const playerCenter = p.x + p.w / 2;
  boss.targetX = boss.attack === 'flail'
    ? Math.max(BOSS_STAGE_START + 80, Math.min(BOSS_STAGE_END - 80, playerCenter + (Math.random() - 0.5) * 340))
    : playerCenter;
  boss.targetScreenX = boss.targetX - cam.x;
  boss.flailRemaining = boss.attack === 'flail' ? 3 : 0;
  boss.rocketsRemaining = boss.attack === 'rockets' ? 10 : 0;
  boss.rocketShotTimer = 0;
  const tellTimes = { slam: 0.85, swipe: 0.72, flail: 0.48, rockets: 0.95, 'eye-laser': 1.05 };
  boss.phaseTimer = tellTimes[boss.attack];
  boss.nextAttackTimer = 0;
  boss.attackCount++;
  syncBossOverlay();
}

function spawnBossRocket(index) {
  const playerScreenX = p.x + p.w / 2 - cam.x;
  const playerScreenY = p.y + p.h * 0.48;
  const col = index % 5;
  const row = Math.floor(index / 5);
  const sx = W / 2 + (col - 2) * Math.min(44, W * 0.047);
  const sy = 198 + row * 24;
  const tx = playerScreenX + (Math.random() - 0.5) * Math.min(110, W * 0.12);
  const ty = playerScreenY + (Math.random() - 0.5) * 40;
  const dx = tx - sx, dy = ty - sy, len = Math.max(1, Math.hypot(dx, dy));
  const speed = 420 + Math.random() * 100;
  bossProjectiles.push({ x: sx, y: sy, vx: dx / len * speed, vy: dy / len * speed,
    radius: 7, damage: 8, life: 2.2, maxLife: 2.2, rotation: Math.atan2(dy, dx) });
}

function resolveBossImpact() {
  if (!boss.active || boss.defeated || boss.hitApplied) return;
  const playerCenterX = p.x + p.w / 2;
  const playerScreenX = playerCenterX - cam.x;
  const playerBottom = p.y + p.h;
  if (boss.attack === 'slam' || boss.attack === 'flail') {
    if (Math.abs(playerCenterX - boss.targetX) <= (boss.attack === 'slam' ? 92 : 78) && p.onGround && playerBottom > 400) {
      hurtPlayerFromEnemyAttack(boss.attack === 'slam' ? 24 : 18, boss.targetX, 280, 340);
    }
    boss.hitApplied = true;
  } else if (boss.attack === 'eye-laser') {
    if (Math.abs(playerCenterX - boss.targetX) <= 58) hurtPlayerFromEnemyAttack(30, boss.targetX, 120, 300);
    boss.hitApplied = true;
  }
}

function updateBossProjectiles() {
  const playerScreenX = p.x + p.w / 2 - cam.x;
  const playerScreenY = p.y + p.h * 0.48;
  const remain = [];
  for (const rocket of bossProjectiles) {
    rocket.x += rocket.vx * DT; rocket.y += rocket.vy * DT; rocket.life -= DT;
    const dx = playerScreenX - rocket.x, dy = playerScreenY - rocket.y;
    if (Math.hypot(dx, dy) < rocket.radius + 20) {
      hurtPlayerFromEnemyAttack(rocket.damage, cam.x + rocket.x, rocket.y, 230);
      continue;
    }
    if (rocket.life > 0 && rocket.x > -100 && rocket.x < W + 100 && rocket.y > -100 && rocket.y < H + 120) remain.push(rocket);
  }
  bossProjectiles = remain;
}

function updateBoss() {
  if (!boss || state !== 'playing') return;
  if (!boss.active && !boss.defeated && p.x >= BOSS_STAGE_START) activateBoss();
  if (!boss.active) { syncBossOverlay(); return; }
  boss.hurtFlash = Math.max(0, boss.hurtFlash - DT);
  if (boss.defeated) {
    boss.defeatTimer = Math.max(0, boss.defeatTimer - DT);
    if (boss.defeatTimer <= 0) { boss.visualFinished = true; bossWorldElement?.classList.remove('active'); }
    syncBossOverlay(); return;
  }
  bossProjectiles = bossProjectiles.filter((rocket) => rocket.life > 0);
  if (boss.phase === 'idle') {
    boss.nextAttackTimer -= DT;
    if (boss.nextAttackTimer <= 0) startBossAttack();
  } else {
    boss.phaseTimer -= DT;
    boss.attackElapsed += DT;
    if (boss.phase === 'telegraph' && boss.phaseTimer <= 0) {
      boss.phase = 'active'; boss.hitApplied = false; boss.attackElapsed = 0;
      if (boss.attack === 'slam' || boss.attack === 'flail') resolveBossImpact();
      if (boss.attack === 'swipe') boss.swipeProgress = 0;
      if (boss.attack === 'rockets') { boss.rocketsRemaining = 10; boss.rocketShotTimer = 0; }
      const activeTimes = { slam: 0.22, swipe: 0.84, flail: 0.17, rockets: 1.72, 'eye-laser': 0.58 };
      boss.phaseTimer = activeTimes[boss.attack] || 0.3;
    } else if (boss.phase === 'active') {
      if (boss.attack === 'swipe') {
        boss.swipeProgress = Math.min(1, boss.attackElapsed / 0.84);
        const sweepX = boss.side === 'left' ? -110 + (W + 220) * boss.swipeProgress : W + 110 - (W + 220) * boss.swipeProgress;
        const playerScreenX = p.x + p.w / 2 - cam.x;
        if (!boss.hitApplied && Math.abs(playerScreenX - sweepX) < 100 && p.y + p.h > H - 180) {
          hurtPlayerFromEnemyAttack(22, cam.x + sweepX, H - 180, 320); boss.hitApplied = true;
        }
      } else if (boss.attack === 'rockets') {
        boss.rocketShotTimer -= DT;
        if (boss.rocketsRemaining > 0 && boss.rocketShotTimer <= 0) {
          const firedIndex = 10 - boss.rocketsRemaining;
          spawnBossRocket(firedIndex); boss.rocketsRemaining--; boss.rocketShotTimer = 0.155;
        }
      } else if (boss.attack === 'eye-laser' && !boss.hitApplied && boss.attackElapsed >= 0.16) {
        resolveBossImpact();
      }
      if (boss.phaseTimer <= 0) {
        if (boss.attack === 'flail' && boss.flailRemaining > 1) {
          boss.flailRemaining--;
          boss.targetX = Math.max(BOSS_STAGE_START + 70, Math.min(BOSS_STAGE_END - 70, p.x + p.w / 2 + (Math.random() - 0.5) * 380));
          boss.phase = 'telegraph'; boss.phaseTimer = 0.42; boss.hitApplied = false; boss.attackElapsed = 0;
        } else {
          boss.phase = 'recovery'; boss.phaseTimer = boss.attack === 'rockets' ? 0.9 : 0.68;
        }
      }
    } else if (boss.phase === 'recovery' && boss.phaseTimer <= 0) {
      boss.attack = 'idle'; boss.phase = 'idle'; boss.nextAttackTimer = 0.85 + Math.random() * 0.8;
      boss.targetX = p.x + p.w / 2;
    }
  }
  updateBossProjectiles();
  syncBossOverlay();
}

function drawBossAttackOverlay() {
  if (!boss || !boss.active || boss.defeated) return;
  const playerScreenX = p.x + p.w / 2 - cam.x;
  ctx.save();
  if (boss.phase === 'telegraph' && (boss.attack === 'slam' || boss.attack === 'flail')) {
    const x = boss.targetX - cam.x;
    ctx.globalAlpha = 0.28 + 0.18 * Math.sin(performance.now() / 70);
    ctx.fillStyle = '#ff254d'; ctx.fillRect(x - 78, 398, 156, 82);
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ff4057'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.moveTo(x, 305); ctx.lineTo(x, 480); ctx.stroke(); ctx.setLineDash([]);
  } else if (boss.phase === 'telegraph' && boss.attack === 'swipe') {
    ctx.globalAlpha = 0.48; ctx.fillStyle = '#ff254d'; ctx.fillRect(0, 390, W, 4);
    ctx.fillRect(0, 398, W, 2);
  } else if (boss.phase === 'active' && boss.attack === 'swipe') {
    const x = boss.side === 'left' ? -110 + (W + 220) * boss.swipeProgress : W + 110 - (W + 220) * boss.swipeProgress;
    ctx.globalAlpha = 0.85; ctx.shadowColor = '#ff4057'; ctx.shadowBlur = 24; ctx.strokeStyle = '#ff4057'; ctx.lineWidth = 46;
    ctx.beginPath(); ctx.moveTo(x, 270); ctx.lineTo(x, 465); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#fff1f3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 285); ctx.lineTo(x, 450); ctx.stroke();
  } else if (boss.phase === 'telegraph' && boss.attack === 'eye-laser') {
    const x = boss.targetX - cam.x;
    ctx.globalAlpha = 0.34 + 0.24 * Math.sin(performance.now() / 45); ctx.strokeStyle = '#ff183a'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
  } else if (boss.phase === 'active' && boss.attack === 'eye-laser') {
    const x = boss.targetX - cam.x;
    ctx.globalAlpha = 0.86; ctx.shadowColor = '#ff183a'; ctx.shadowBlur = 28; ctx.strokeStyle = '#ff183a'; ctx.lineWidth = 34;
    ctx.beginPath(); ctx.moveTo(x, 75); ctx.lineTo(x, H); ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff4f6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 85); ctx.lineTo(x, H); ctx.stroke();
  }
  // 奥の指から飛び出した10発ロケットは画面座標で移動するため、ワールド変換を戻して描画。
  for (const rocket of bossProjectiles) {
    const k = Math.max(0, rocket.life / rocket.maxLife);
    ctx.save(); ctx.translate(rocket.x, rocket.y); ctx.rotate(rocket.rotation || 0);
    ctx.globalAlpha = Math.min(1, k * 1.4); ctx.shadowColor = '#ff7629'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffb13b'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -6); ctx.lineTo(-4, 0); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill();
    ctx.shadowColor = '#fff3b0'; ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}


function createPlayer() {
  return {
    x: 100, y: 480 - STAND_H, w: 32, h: STAND_H, vx: 0, vy: 0, onGround: false, facing: 1, crouch: false,
    animTime: 0, jumpAnimTime: 0, jumpCount: 0,
    hp: 100, maxHp: 100,
    atkStep: 0, atkTimer: 0, atkElapsed: 0, comboWindow: 0, buffered: false, hitSet: new Set(),
    heavyTimer: 0, heavyElapsed: 0, heavyHitCount: 0, heavyDir: 1, heavyCd: 0,
    downAttackTimer: 0, downAttackElapsed: 0, downAttackDir: 1, downAttackHitSet: new Set(),
    dodgeTimer: 0, dodgeDir: 1, dodgeCharges: DODGE_MAX_CHARGES, dodgeRechargeTimer: 0,
    dodgeTrail: [], dodgeTrailSampleTimer: 0,
    hurtTimer: 0, stunTimer: 0, skillDash: null, skillDashInvulnerable: false,
    guardHoldElapsed: 0, guardActive: false, guardHitCooldown: 0, parryWindow: 0,
  };
}

function spawnEnergyOrb(x, y) {
  const phase = Math.random() * Math.PI * 2;
  orbs.push({
    x, y, vx: (Math.random() - 0.5) * 260, vy: -150 - Math.random() * 160,
    age: 0, phase, speed: 410 + Math.random() * 130, size: 6 + Math.random() * 3,
    trailTick: 0, trail: [],
  });
}

function createEnemy(x, dir = -1, type = 'melee') {
  const maxHp = type === 'machinegun' ? 52 : type === 'laser' ? 58 : 70;
  const safeX = Math.max(40, Math.min(BOSS_STAGE_START - 180, x));
  return {
    x: safeX, homeX: safeX, y: 480 - 48, w: 36, h: 48, vx: 0, vy: 0, onGround: false, dir,
    type, hp: maxHp, maxHp, alive: true,
    minX: Math.max(40, safeX - 170), maxX: Math.min(BOSS_STAGE_START - 70, safeX + 170), patrolDir: dir || -1,
    hurtTimer: 0, stunTimer: 0, animTime: Math.random() * 2, attackAnimElapsed: 0,
    attackTimer: 0, attackMode: '', attackHitDone: false, attackCooldown: 0.45 + Math.random() * 0.8,
    attackAnimTimer: 0, burstRemaining: 0, burstTimer: 0,
    laserTargetX: null, laserTargetY: null,
    jumpCooldown: 2 + Math.random() * 3,
    deathTimer: 0, deathElapsed: 0, explosionTimer: 0, deathExplosionCreated: false,
    heavyCarryTimer: 0, heavyCarryDir: 0, heavyCarrySpeed: 0,
  };
}

function createEnemyGroup() {
  // 定位置に整列して見えないよう、各出現ポイントをずらし、敵の種類も毎回シャッフルする。
  // 出現数に応じた型のリストを作ってからシャッフルし、前半と後半で型の並びが同じになるのを防ぐ。
  const types = Array.from({ length: ENEMY_SPAWNS.length }, (_, i) => ENEMY_TYPES[i % ENEMY_TYPES.length]);
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const positions = ENEMY_SPAWNS.map((base) => Math.max(80, Math.min(BOSS_STAGE_START - 220, base + (Math.random() - 0.5) * 150))).sort((a, b) => a - b);
  // 位置が近づきすぎた場合は少しずつずらし、重なって湧くのを避ける。
  for (let i = 1; i < positions.length; i++) positions[i] = Math.min(BOSS_STAGE_START - 220, Math.max(positions[i], positions[i - 1] + 145));
  return positions.map((x, i) => createEnemy(x, Math.random() < 0.5 ? -1 : 1, types[i % types.length]));
}

function createEnemyExplosion(x, y) {
  // 爆発1・爆発2・既存の爆発3からランダムに1種類を選ぶ。0=爆発1, 1=爆発2, 2=爆発3。
  const variant = Math.floor(Math.random() * 3);
  effects.push({
    type: 'enemyExplosion', variant, x, y, w: 168, h: 95,
    life: ENEMY_EXPLOSION_TIME, maxLife: ENEMY_EXPLOSION_TIME,
  });
}

function disposeGameEffects() {
  // エフェクトはすべてCanvas描画なので、動画デコーダーの破棄処理は不要。
}

function resetGame() {
  closePauseMenu();
  disposeGameEffects();
  p = createPlayer();
  enemies = createEnemyGroup();
  boss = createBossState();
  bossProjectiles = [];
  syncBossOverlay();
  respawnTimer = -1;
  orbs = [];
  enemyProjectiles = [];
  effects = [];
  cam = { x: 0 };
  input.jump = input.attack = input.dodge = false;
  gameplaySpacePress = false; keys[boundKey('guard')] = false;
  mouseAttack.down = false; mouseAttack.elapsed = 0; mouseAttack.triggered = false; mouseAttack.source = '';
  UI.reset();
  state = 'playing';
  overlay.classList.add('hidden');
}

function gameOver() {
  state = 'gameover';
  overlay.classList.remove('hidden');
}

// ================= 物理（移動と当たり判定） =================
// プレイヤーにも敵にも使う共通処理。X軸→Y軸の順に床との衝突を解決する
function moveBody(b, gravity = true) {
  b.x += b.vx * DT;
  // 通常敵はボス区画の境界を越えられない。プレイヤーのみ最奥まで進行可能。
  const maxBodyX = (typeof p !== 'undefined' && b !== p) ? BOSS_STAGE_START - b.w - 10 : LEVEL_W - b.w;
  b.x = Math.max(0, Math.min(maxBodyX, b.x));
  for (const s of solids) {
    if (overlap(b, s)) { b.x = b.vx > 0 ? s.x - b.w : s.x + s.w; b.vx = 0; }
  }
  if (gravity) b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * DT);
  b.y += b.vy * DT;
  b.onGround = false;
  for (const s of solids) {
    if (overlap(b, s)) {
      if (b.vy > 0) { b.y = s.y - b.h; b.onGround = true; }
      else if (b.vy < 0) { b.y = s.y + s.h; }
      b.vy = 0;
    }
  }
  if (b.y > H + 100) { b.y = 480 - b.h; b.vy = 0; } // 念のための落下防止
}

// ================= プレイヤー =================
function startAttack(step) {
  const dir = getDir();
  if (dir) p.facing = dir;
  const a = ATTACKS[step - 1];
  p.atkStep = step; p.atkTimer = a.dur; p.atkElapsed = 0;
  p.comboWindow = 0; p.buffered = false; p.hitSet = new Set();
  p.vx = p.facing * a.lunge;       // 攻撃時に少し前進
}

function cancelAttack() {
  p.atkStep = 0; p.atkTimer = 0; p.comboWindow = 0; p.buffered = false;
  p.heavyTimer = 0; p.heavyElapsed = 0; p.heavyHitCount = 0;
  p.downAttackTimer = 0; p.downAttackElapsed = 0; p.downAttackHitSet = new Set();
}

// 空中で左右移動しながら攻撃すると、前方斜め下へ斬り下ろす
function startDownAttack(dir) {
  if (p.onGround || p.stunTimer > 0 || p.dodgeTimer > 0 || UI.ult > 0 || UI.appeal > 0 || p.heavyTimer > 0) return false;
  cancelAttack();
  p.downAttackDir = dir; p.facing = dir; p.downAttackElapsed = 0;
  p.downAttackTimer = DOWN_ATTACK_DURATION; p.downAttackHitSet = new Set();
  p.vx = dir * 140;
  setCrouch(false);
  return true;
}

function updateDownAttackMotion() {
  p.downAttackElapsed = Math.min(DOWN_ATTACK_DURATION, p.downAttackElapsed + DT);
  p.downAttackTimer = Math.max(0, DOWN_ATTACK_DURATION - p.downAttackElapsed);
  p.facing = p.downAttackDir;
  const progress = p.downAttackElapsed / DOWN_ATTACK_DURATION;
  p.vx = p.downAttackDir * (150 - 35 * progress);
  input.attack = input.jump = input.dodge = false;
  setCrouch(false);
  moveBody(p);
}

// Eスキル：敵をすり抜けて固定距離を高速直進し、移動完了後に通過した敵をまとめて斬る。
// 移動中は敵の位置で停止せず、直進エフェクトも実際の移動距離に追従する。
function updateSkillDash() {
  const dash = p.skillDash;
  if (!dash) return;
  dash.elapsed = Math.min(dash.duration, dash.elapsed + DT);
  const progress = dash.duration > 0 ? dash.elapsed / dash.duration : 1;
  const desiredX = dash.startX + (dash.endX - dash.startX) * progress;
  p.x = Math.max(0, Math.min(LEVEL_W - p.w, desiredX));
  p.vx = 0;
  p.vy = 0;
  p.y = dash.startY;
  p.facing = dash.dir;
  p.onGround = dash.onGroundStart; // 直進中は水平移動に集中し、重力で軌道がぶれないようにする
  input.attack = input.jump = input.dodge = false;

  if (progress >= 1) {
    const endCenterX = p.x + p.w / 2;
    // プレイヤーの通過線に敵の幅ぶんの余裕を加え、開始点・終点付近の敵も拾う。
    const minX = Math.min(dash.startCenterX, endCenterX) - 38;
    const maxX = Math.max(dash.startCenterX, endCenterX) + 38;
    let hitCount = 0;

    // ボス区画ではEスキルの斬撃が背景干渉レイヤーにも届く。
    if (playerCanDamageBoss()) {
      damageBoss(26, 2, { shake: 4, stop: 0.07 });
      UI.fx.push({ skillSlash: true, x: p.x + p.w / 2, y: p.y + p.h / 2, dir: dash.dir, col: C.cyan, life: 0.36, max: 0.36 });
      hitCount++;
    }
    // 斬撃判定は移動が完了した後に一度だけ実行し、通過した敵に同時に斬撃を発生させる。
    for (const enemy of (boss.active ? [] : enemies)) {
      if (!enemy.alive) continue;
      const ex = enemy.x + enemy.w / 2;
      const ey = enemy.y + enemy.h / 2;
      if (ex < minX || ex > maxX || Math.abs(ey - dash.centerY) > SKILL_DASH_VERTICAL_REACH) continue;
      // 直進スキルも足場の下にいる敵を貫通して当てない。
      const dashOrigin = { x: dash.endX, y: dash.startY, w: p.w, h: p.h };
      if (!playerAttackCanReachEnemy(enemy, dashOrigin)) continue;
      damageEnemy(enemy, 26, 210, dash.dir, 2, {
        flash: 0.15, stun: 0.38, stop: 0.07, shake: 4, sparks: 12, lift: -45,
      });
      UI.fx.push({ skillSlash: true, x: ex, y: ey, dir: dash.dir, col: C.cyan, life: 0.36, max: 0.36 });
      hitCount++;
    }

    // 移動線を残し、その上で各敵のX字斬撃を再生して「直進→斬撃」の順を明確にする。
    UI.fx.push({ skillLine: true, x1: dash.startCenterX, y1: dash.centerY,
      x2: endCenterX, y2: dash.centerY, col: C.cyan, life: 0.22, max: 0.22 });
    if (hitCount === 0) {
      UI.fx.push({ skillSlash: true, x: endCenterX + dash.dir * 14, y: dash.centerY, dir: dash.dir,
        col: C.cyan, life: 0.36, max: 0.36 });
    }
    p.skillDash = null;
    p.vx = 0; p.vy = dash.startVy; p.onGround = dash.onGroundStart;
    // ダッシュ終了後は0.5秒間の無敵を付与し、終了直後の接触・弾被弾を防ぐ。
    p.hurtTimer = Math.max(p.hurtTimer, 0.5);
  }
}

// 長押しで始まる回転切り。少し前進しながら範囲内に4回攻撃する
function startHeavyAttack() {
  if (p.stunTimer > 0 || p.dodgeTimer > 0 || p.heavyCd > 0 || UI.appeal > 0 || UI.ult > 0) return false;
  const dir = getDir() || p.facing;
  cancelAttack();
  p.facing = dir; p.heavyDir = dir; p.heavyTimer = HEAVY_DURATION; p.heavyElapsed = 0; p.heavyHitCount = 0;
  p.heavyCd = HEAVY_COOLDOWN;
  setCrouch(false);
  p.vx = dir * 100;
  Sound.play('heavy');
  return true;
}

function updateAttack() {
  if (p.atkTimer > 0) {
    p.atkElapsed += DT; p.atkTimer -= DT;
    const a = ATTACKS[p.atkStep - 1];
    // 先行入力は「つなげられる時間」になった時点で消化する（終了まで待たない）
    if (p.buffered && p.atkStep < 3 && p.atkElapsed >= a.chainFrom) { startAttack(p.atkStep + 1); return; }
    if (p.atkTimer <= 0) {
      if (p.atkStep < 3) p.comboWindow = COMBO_WINDOW;   // 受付時間を開始
      else p.atkStep = 0;                                // 3段目で確実に最初へ戻る
    }
  } else if (p.comboWindow > 0) {
    p.comboWindow -= DT;
    if (p.comboWindow <= 0) p.atkStep = 0;               // 受付切れでコンボ終了
  }
}

// しゃがみ／立ち上がり。足元を固定して高さだけ変える
function setCrouch(on) {
  if (on === p.crouch) return;
  const h = on ? CROUCH_H : STAND_H, y = p.y + p.h - h;
  if (!on && solids.some((s) => overlap({ x: p.x, y, w: p.w, h }, s))) return;   // 頭上が詰まっていたら立てない
  p.crouch = on; p.y = y; p.h = h;
}

function updatePlayer() {
  // ジャンプ回数と回避チャージは、地上にいる間だけリセット／回復する。
  if (p.onGround) {
    p.jumpCount = 0;
    if (p.dodgeCharges < DODGE_MAX_CHARGES) {
      p.dodgeRechargeTimer += DT;
      if (p.dodgeRechargeTimer >= DODGE_RECHARGE_TIME) {
        p.dodgeCharges = Math.min(DODGE_MAX_CHARGES, p.dodgeCharges + 1);
        p.dodgeRechargeTimer = 0;
      }
    } else {
      p.dodgeRechargeTimer = 0;
    }
  }

  // 空中では回復タイマーを進めないが、地上で貯めた途中経過は保持する。
  for (const trail of (p.dodgeTrail || [])) trail.life -= DT;
  p.dodgeTrail = (p.dodgeTrail || []).filter((trail) => trail.life > 0);

  p.heavyCd = Math.max(0, p.heavyCd - DT);
  if (UI.appeal > 0) { UI.appealStep(); return; }   // アピール中は操作不可・攻撃判定なし
  p.animTime = (p.animTime || 0) + DT;
  p.jumpAnimTime = p.onGround ? 0 : (p.jumpAnimTime || 0) + DT;
  const dir = getDir();
  p.hurtTimer = Math.max(0, p.hurtTimer - DT);
  p.stunTimer = Math.max(0, p.stunTimer - DT);
  p.guardHitCooldown = Math.max(0, p.guardHitCooldown - DT);
  p.parryWindow = Math.max(0, p.parryWindow - DT);
  if (p.skillDash) { updateSkillDash(); return; }
  // ダッシュ完了フレームの接触ダメージも防いだ後、次の通常フレームで解除する。
  p.skillDashInvulnerable = false;
  if (gameplaySpacePress) p.guardHoldElapsed += DT;
  else { p.guardHoldElapsed = 0; p.guardActive = false; }
  const stunned = p.stunTimer > 0;
  // 被弾後は硬直／無敵中でもガード入力を受け付け、短いホールドで再展開できる。
  const guardThreshold = (stunned || p.hurtTimer > 0)
    ? GUARD_HURT_HOLD_THRESHOLD : GUARD_HOLD_THRESHOLD;
  p.guardActive = Boolean(gameplaySpacePress && p.guardHoldElapsed >= guardThreshold
    && UI.energy > 0 && p.dodgeTimer <= 0 && UI.ult <= 0 && UI.appeal <= 0);

  // 長押しガード中は横移動・攻撃・回避を止める。ゲージが0ならガードは解除される。
  if (p.guardActive) {
    cancelAttack();
    input.attack = input.jump = input.dodge = false;
    setCrouch(false);
    p.vx = 0;
    moveBody(p);
    return;
  }

  // 左クリックを一定時間押し続けると、通常攻撃ではなく強攻撃を発動する
  if (mouseAttack.down && !mouseAttack.triggered) {
    mouseAttack.elapsed += DT;
    if (mouseAttack.elapsed >= HEAVY_HOLD_THRESHOLD && !stunned && p.dodgeTimer <= 0 && UI.ult <= 0 && UI.appeal <= 0) {
      mouseAttack.triggered = true; mouseAttack.down = false;
      if (!startHeavyAttack()) UI.addText('ROTATION COOLING', p.x + p.w / 2, p.y - 18, '#ff8a1f', 13);
    }
  }

  // 回転切り中は少し前へ滑り、短い時間で4回攻撃する
  if (p.heavyTimer > 0) {
    p.heavyElapsed = Math.min(HEAVY_DURATION, p.heavyElapsed + DT);
    p.heavyTimer = Math.max(0, HEAVY_DURATION - p.heavyElapsed);
    p.facing = p.heavyDir;
    p.vx = p.heavyDir * (110 - 20 * (p.heavyElapsed / HEAVY_DURATION));
    input.attack = input.jump = input.dodge = false;
    setCrouch(false); moveBody(p);
    return;
  }

  if (p.downAttackTimer > 0) {
    updateDownAttackMotion();
    return;
  }

  // 回避（Shift）：3チャージ制。チャージがあれば連続で使用できる。
  if (input.dodge && !stunned && p.dodgeTimer <= 0 && p.dodgeCharges > 0
      && (p.atkTimer <= 0 || p.atkElapsed >= ATTACKS[p.atkStep - 1].hitTo)) {   // 攻撃の判定中は回避に割り込まない
    p.dodgeTimer = DODGE_TIME;
    p.dodgeCharges = Math.max(0, p.dodgeCharges - 1);
    p.dodgeDir = dir || p.facing; p.facing = p.dodgeDir;
    p.dodgeTrailSampleTimer = DODGE_TRAIL_INTERVAL;
    cancelAttack();
  }
  input.dodge = false;

  // 空中でA/D移動しながら攻撃すると斜め下攻撃。それ以外は通常コンボ。
  if (input.attack) {
    if (!stunned && p.dodgeTimer <= 0) {
      const airborneAttack = !p.onGround || input.jump;
      if (airborneAttack && dir !== 0) {
        if (p.onGround && input.jump) { p.vy = JUMP_V; p.jumpCount = 1; p.onGround = false; input.jump = false; }
        if (startDownAttack(dir)) {
          input.attack = false;
          updateDownAttackMotion();
          return;
        }
      }
      if (p.atkTimer > 0) {   // 攻撃中：つなげられる時間なら即次段へ、まだなら先行入力として保存
        if (p.atkStep < 3 && p.atkElapsed >= ATTACKS[p.atkStep - 1].chainFrom) startAttack(p.atkStep + 1);
        else p.buffered = true;
      } else if (p.comboWindow > 0) startAttack(p.atkStep + 1);
      else startAttack(1);
    }
    input.attack = false;
  }

  // ジャンプ（W）：地上で1段目、空中でもう一度押すと少し低い2段目。
  // スペースはガード／ジャストパリィ用。
  if (input.jump) {
    if (!stunned && p.dodgeTimer <= 0) {
      if (p.onGround && p.jumpCount === 0) {
        p.vy = JUMP_V;
        p.jumpCount = 1;
        p.onGround = false;
      } else if (!p.onGround && p.jumpCount === 1) {
        p.vy = DOUBLE_JUMP_V;
        p.jumpCount = 2;
        p.jumpAnimTime = 0;
      }
    }
    input.jump = false;
  }

  // しゃがみ（S / ↓ を押している間）：地上で、攻撃・回避・被弾・必殺技の最中でないときだけ
  setCrouch(Boolean((keys[boundKey('crouch')] || keys.ArrowDown || touchCrouch) && p.onGround && !stunned && p.dodgeTimer <= 0 && p.atkStep === 0 && UI.ult <= 0));

  // 横移動
  if (p.dodgeTimer > 0) {
    p.dodgeTimer = Math.max(0, p.dodgeTimer - DT);
    p.vx = p.dodgeDir * DODGE_SPEED; p.vy = 0;
    // 回避動作が終わった直後にも0.85秒の無敵を付与する。
    // hurtTimerを使うことで、敵の接触・弾・攻撃判定の共通無敵処理に適用される。
    if (p.dodgeTimer <= 0) p.hurtTimer = Math.max(p.hurtTimer, 0.85);
  } else if (stunned) {
    p.vx = approach(p.vx, 0, 600 * DT);
  } else if (p.atkTimer > 0) {
    p.vx = approach(p.vx, 0, 1200 * DT);
  } else {
    p.vx = approach(p.vx, dir * (p.crouch ? CROUCH_SPEED : MOVE_SPEED), 2400 * DT);
    if (dir) p.facing = dir;
  }

  updateAttack();
  moveBody(p, p.dodgeTimer <= 0);

  // 回避中、短い間隔で位置とスプライトの状態を保存して半透明の残像にする。
  if (p.dodgeTimer > 0) {
    p.dodgeTrailSampleTimer = (p.dodgeTrailSampleTimer || 0) + DT;
    if (p.dodgeTrailSampleTimer >= DODGE_TRAIL_INTERVAL) {
      p.dodgeTrailSampleTimer %= DODGE_TRAIL_INTERVAL;
      p.dodgeTrail.push({ x: p.x, y: p.y, w: p.w, h: p.h, facing: p.facing, crouch: p.crouch,
        animName: currentPlayerAnimation(), animTime: p.animTime || 0, jumpAnimTime: p.jumpAnimTime || 0,
        life: DODGE_TRAIL_LIFE, maxLife: DODGE_TRAIL_LIFE });
      if (p.dodgeTrail.length > 8) p.dodgeTrail.splice(0, p.dodgeTrail.length - 8);
    }
  } else {
    p.dodgeTrailSampleTimer = 0;
  }
}

// ================= 攻撃判定 =================
function isHitActive() {
  if (p.atkTimer <= 0) return false;
  const a = ATTACKS[p.atkStep - 1];
  return p.atkElapsed >= a.hitFrom && p.atkElapsed <= a.hitTo;
}

function attackBox() {
  const a = ATTACKS[p.atkStep - 1];
  return { x: p.facing > 0 ? p.x + p.w : p.x - a.range, y: p.y + a.yOff, w: a.range, h: a.h };
}

function checkAttackHit() {
  if (!isHitActive()) return;
  const a = ATTACKS[p.atkStep - 1], box = attackBox();
  if (playerCanDamageBoss()) {
    if (!p.hitSet.has(boss)) { p.hitSet.add(boss); damageBoss(a.dmg, p.atkStep, a); UI.gainEnergy(5); if (a.finish) UI.finish({ x: p.x + p.w / 2 - 90, y: 70, w: 180, h: 160 }); }
    return; // ボス区画では攻撃を背景ボスへ集中させる
  }
  for (const e of enemies) {
    if (!e.alive || p.hitSet.has(e) || !overlap(box, e)) continue;
    if (!playerAttackCanReachEnemy(e)) continue; // 足場の下へ攻撃判定を通さない
    p.hitSet.add(e);                        // 同じ攻撃で同じ敵に複数回当たらない
    damageEnemy(e, a.dmg, a.knock, p.facing, p.atkStep, a);
    UI.gainEnergy(5);                        // 命中でコンボが更新された後に、倍率つきで回復する
    if (a.finish) UI.finish(e);   // 3段目の命中でコンボ完了を表示
  }
}

// 斬撃の斜め線と敵の中心が近ければ命中とする
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const length2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / length2));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

function checkDownAttackHit() {
  if (p.downAttackTimer <= 0 || p.downAttackElapsed < DOWN_ATTACK_HIT_FROM || p.downAttackElapsed > DOWN_ATTACK_HIT_TO) return;
  if (playerCanDamageBoss()) {
    if (!p.downAttackHitSet.has(boss)) { p.downAttackHitSet.add(boss); damageBoss(DOWN_ATTACK_DAMAGE, 2, { shake: 3, stop: 0.045 }); UI.gainEnergy(5); }
    return;
  }
  const cx = p.x + p.w / 2, dir = p.downAttackDir;
  const x1 = cx + dir * 8, y1 = p.y + 10;
  // 斬撃線を下方向へ延長し、空中の高い位置からでも地上の敵へ届くようにする。
  const x2 = cx + dir * 112, y2 = p.y + p.h + 115;
  // 地上敵にも届く範囲を残しつつ、下方向と前方の判定を絞る。
  const groundBox = {
    x: dir > 0 ? cx - 4 : cx - 118,
    y: p.y + p.h * 0.5,
    w: 122,
    h: p.h + 120,
  };
  for (const e of enemies) {
    if (!e.alive || p.downAttackHitSet.has(e)) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    const nearSlash = distanceToSegment(ex, ey, x1, y1, x2, y2) <= 42;
    const catchesGroundEnemy = e.onGround && overlap(groundBox, e);
    if (!nearSlash && !catchesGroundEnemy) continue;
    if (!playerAttackCanReachEnemy(e)) continue; // 斜め下攻撃は空中から届くが、足場は貫通しない
    p.downAttackHitSet.add(e);
    damageEnemy(e, DOWN_ATTACK_DAMAGE, 190, dir, 2, { flash: 0.12, stun: 0.26, stop: 0.045, shake: 3, sparks: 7, lift: -110 });
    UI.gainEnergy(5);
  }
}

// オーブを吸収すると技ゲージを回復し、インベントリーの取得記録も増やす
function absorbEnergyOrb() {
  const px = p.x + p.w / 2, py = p.y + p.h * 0.42;
  const before = UI.energy;
  UI.gainEnergy(ORB_ENERGY_VALUE);
  UI.orbsAbsorbed = (UI.orbsAbsorbed || 0) + 1;
  const gained = Math.round(UI.energy - before);
  UI.addText(gained > 0 ? `+${gained} ENERGY` : 'ENERGY FULL', px, p.y - 16, '#3df2ff', 13);
  UI.fx.push({ ring: true, x: px, y: py, r: 34, col: '#3df2ff', life: 0.22, max: 0.22 });
}

// 倒した敵が落としたオーブは一度ランダムに跳ね、その後カーブしながらプレイヤーへ飛ぶ
function updateEnergyOrbs() {
  const remain = [];
  for (const orb of orbs) {
    orb.age += DT;
    if (orb.age < 0.24) {
      orb.vy += 520 * DT;
      orb.x += orb.vx * DT; orb.y += orb.vy * DT;
      orb.vx = approach(orb.vx, 0, 210 * DT);
    } else {
      const px = p.x + p.w / 2, py = p.y + p.h * 0.42;
      let dx = px - orb.x, dy = py - orb.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < 26) { absorbEnergyOrb(); continue; }
      const curve = orb.age > 5 ? 0 : Math.sin(orb.age * 7 + orb.phase) * Math.min(38, dist * 0.12);
      const sideX = -dy / dist, sideY = dx / dist;
      dx += sideX * curve; dy += sideY * curve;
      const aim = Math.max(1, Math.hypot(dx, dy));
      const maxSpeed = orb.age > 6 ? 680 : orb.speed;
      const speed = Math.min(maxSpeed, Math.max(100, dist * 5.5));
      const targetVx = dx / aim * speed, targetVy = dy / aim * speed;
      orb.vx = approach(orb.vx, targetVx, 1800 * DT);
      orb.vy = approach(orb.vy, targetVy, 1800 * DT);
      orb.x += orb.vx * DT; orb.y += orb.vy * DT;
      if (Math.hypot(px - orb.x, py - orb.y) < 26) { absorbEnergyOrb(); continue; }
    }
    orb.trailTick++;
    if (orb.trailTick % 2 === 0) {
      orb.trail.unshift({ x: orb.x, y: orb.y });
      if (orb.trail.length > 5) orb.trail.pop();
    }
    remain.push(orb);
  }
  orbs = remain;
}

function drawEnergyOrbs() {
  for (const orb of orbs) {
    ctx.save();
    for (let i = orb.trail.length - 1; i >= 0; i--) {
      const t = (i + 1) / (orb.trail.length + 1), trail = orb.trail[i];
      ctx.globalAlpha = 0.1 + (1 - t) * 0.22;
      ctx.strokeStyle = '#3df2ff'; ctx.lineWidth = Math.max(1, 4 * (1 - t));
      ctx.beginPath(); ctx.moveTo(trail.x, trail.y); ctx.lineTo(orb.x, orb.y); ctx.stroke();
    }
    const pulse = 1 + Math.sin(orb.age * 12 + orb.phase) * 0.18;
    ctx.globalAlpha = 1; ctx.translate(orb.x, orb.y); ctx.rotate(Math.sin(orb.age * 5 + orb.phase) * 0.22);
    ctx.shadowColor = '#3df2ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#3df2ff';
    ctx.beginPath(); ctx.moveTo(0, -orb.size * 1.6 * pulse); ctx.lineTo(orb.size * pulse, 0);
    ctx.lineTo(0, orb.size * 1.6 * pulse); ctx.lineTo(-orb.size * pulse, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
}

// 回転切りは短い間隔で4回判定し、敵を押し出しながら巻き込む
function checkHeavyAttackHit() {
  if (p.heavyElapsed <= 0 || p.heavyHitCount >= HEAVY_HIT_TIMES.length) return;
  if (p.heavyElapsed < HEAVY_HIT_TIMES[p.heavyHitCount]) return;
  if (playerCanDamageBoss()) {
    damageBoss(11, 3, { shake: 1.5, stop: 0.008 }); UI.gainEnergy(3); p.heavyHitCount++; return;
  }
  const cx = p.x + p.w / 2, cy = p.y + p.h * 0.55, radius = 160;
  for (const e of enemies) {
    if (!e.alive || !playerAttackCanReachEnemy(e)) continue;
    const px = Math.max(e.x, Math.min(cx, e.x + e.w));
    const py = Math.max(e.y, Math.min(cy, e.y + e.h));
    if ((px - cx) ** 2 + (py - cy) ** 2 > radius ** 2) continue;

    // 敵をプレイヤーから離れる方向へ運び、接触攻撃を受けにくくする
    const dir = Math.sign(e.x + e.w / 2 - cx) || p.heavyDir;
    if (overlap(p, e)) {
      e.x = dir > 0 ? p.x + p.w + 3 : p.x - e.w - 3;
      e.x = Math.max(0, Math.min(LEVEL_W - e.w, e.x));
    }
    damageEnemy(e, 11, 0, dir, 3, { flash: 0.1, stun: 0.045, stop: 0.008, shake: 1.5, sparks: 3, lift: 0 });
    UI.gainEnergy(3);                       // 命中でコンボが更新された後に、倍率つきで回復する
    e.heavyCarryTimer = 0.2;
    e.heavyCarryDir = dir;
    e.heavyCarrySpeed = 155;
    e.vx = dir * e.heavyCarrySpeed;
  }
  p.heavyHitCount++;
}

// ガードは受けたダメージ分のエネルギーを消費する。
// エネルギーがダメージに足りない場合、残量を使い切り、差額だけHPに通す。
function absorbGuardDamage(damage, x, y, textSize = 12) {
  const incoming = Math.max(0, Number(damage) || 0);
  if (!p || !p.guardActive || UI.energy <= 0 || incoming <= 0) return incoming;
  const spent = Math.min(UI.energy, incoming);
  UI.energy = Math.max(0, UI.energy - spent);
  UI.energyFlash = 0.22;
  UI.fx.push({ ring: true, x, y, r: 34, col: C.cyan, life: 0.2, max: 0.2 });
  UI.addText(`GUARD -${Math.round(spent)}`, x, p.y - 10, C.cyan, textSize);
  Sound.play('guard');
  if (UI.energy <= 0) p.guardActive = false;
  return Math.max(0, incoming - spent);
}

function checkContactDamage() {
  if (boss && boss.active) return; // ボス区画では雑魚敵の接触判定も停止する
  if (p.skillDash || p.skillDashInvulnerable || p.dodgeTimer > 0 || p.hurtTimer > 0) return; // スキル高速移動中・回避中・被弾無敵中は当たらない
  // 遠距離型は接触ダメージ／近距離攻撃を持たない。
  const enemy = enemies.find((e) => e.alive && e.type === 'melee' && overlap(p, e));
  if (!enemy) return;
  const playerCenter = p.x + p.w / 2, enemyCenter = enemy.x + enemy.w / 2;
  const awayDir = Math.sign(enemyCenter - playerCenter) || p.facing;

  // 接触ダメージは12。ガード中は、そのダメージ量ぶんだけゲージを消費する。
  let damageToApply = 12;
  let guardPartiallyFailed = false;
  if (p.guardActive && UI.energy > 0) {
    if (p.guardHitCooldown > 0) return;
    p.guardHitCooldown = GUARD_HIT_INTERVAL;
    p.vx = 0;
    damageToApply = absorbGuardDamage(damageToApply, playerCenter, p.y + p.h * 0.55, 14);
    // ガードで攻撃を防いだ瞬間、密着した敵を弱めに押し分ける。
    repelEnemiesAroundPlayer(270, -35, 0.24, 68, 72);
    if (damageToApply <= 0) return;
    guardPartiallyFailed = true; // ゲージ不足分は被弾するため、ここからパリィへすり替えない。
  }

  // スペース短押しのタイミング中に敵の攻撃が重なれば、ゲージを消費せず20回復する。
  if (!guardPartiallyFailed && p.hurtTimer <= 0 && p.parryWindow > 0) {
    p.parryWindow = 0;
    p.guardActive = false;
    p.vx = 0;
    p.stunTimer = 0;
    UI.energy = Math.min(ENERGY_MAX, UI.energy + 20);
    UI.energyFlash = 0.4;
    UI.hitStop = Math.max(UI.hitStop, 0.09);
    UI.shake = Math.max(UI.shake, 5);
    // パリィ対象と密集している敵を一斉に強く弾き、追撃を受けにくくする。
    repelEnemiesAroundPlayer();
    p.hurtTimer = Math.max(p.hurtTimer, 1.44); // ジャストパリィ成功後も約1.44秒の無敵時間
    UI.addText('JUST PARRY +20', playerCenter, p.y - 16, C.cyan, 17);
    UI.fx.push({ ring: true, x: playerCenter, y: p.y + p.h * 0.5, r: 68, col: C.cyan, life: 0.28, max: 0.28 });
    Sound.play('parry');
    return;
  }

  if (p.guardHitCooldown > 0) {
    // ガード中は同じ接触でゲージを連続消費しない。ガードを解除したら通常どおり被弾する。
    if (p.guardActive && UI.energy > 0) return;
  }
  p.hp = Math.max(0, p.hp - damageToApply);
  p.hurtTimer = HURT_INVULN; p.stunTimer = 0.25;
  p.vx = -awayDir * 320; p.vy = -300;
  cancelAttack();
  UI.onHurt(damageToApply);
}

// ================= 敵 =================
function hurtPlayerFromEnemyAttack(damage, sourceX, sourceY, knock = 250) {
  if (!p || p.hp <= 0 || p.skillDash || p.skillDashInvulnerable || p.dodgeTimer > 0 || p.hurtTimer > 0) return false;
  const playerCx = p.x + p.w / 2, playerCy = p.y + p.h / 2;
  const awayDir = Math.sign(playerCx - sourceX) || p.facing || 1;

  let damageToApply = Math.max(0, Number(damage) || 0);
  let guardPartiallyFailed = false;
  if (p.guardActive && UI.energy > 0) {
    damageToApply = absorbGuardDamage(damageToApply, playerCx, playerCy, 12);
    if (damageToApply <= 0) return true;
    guardPartiallyFailed = true; // ゲージ不足分は被弾する。
  }

  if (!guardPartiallyFailed && p.parryWindow > 0) {
    p.parryWindow = 0; p.stunTimer = 0;
    UI.energy = Math.min(ENERGY_MAX, UI.energy + 20); UI.energyFlash = 0.4;
    UI.hitStop = Math.max(UI.hitStop, 0.07); UI.shake = Math.max(UI.shake, 4);
    repelEnemiesAroundPlayer(280, -35, 0.2, 76, 72);
    p.hurtTimer = HURT_INVULN;
    UI.addText('JUST PARRY +20', playerCx, p.y - 16, C.cyan, 15);
    UI.fx.push({ ring: true, x: playerCx, y: playerCy, r: 60, col: C.cyan, life: 0.24, max: 0.24 });
    Sound.play('parry');
    return true;
  }

  p.hp = Math.max(0, p.hp - damageToApply);
  p.hurtTimer = HURT_INVULN; p.stunTimer = 0.2;
  p.vx = awayDir * knock; p.vy = -180;
  cancelAttack();
  UI.onHurt(damageToApply);
  return true;
}

function spawnEnemyProjectile(e, kind = 'bullet') {
  const sx = e.x + e.w / 2 + (e.dir || 1) * (e.w * 0.48);
  const sy = e.y + e.h * (kind === 'laser' ? 0.43 : 0.5);
  const tx = p.x + p.w / 2, ty = p.y + p.h * 0.48;
  const dx = tx - sx, dy = ty - sy, len = Math.max(1, Math.hypot(dx, dy));
  const speed = kind === 'laser' ? 1080 : 620;
  const vx = dx / len * speed, vy = dy / len * speed;
  enemyProjectiles.push({
    kind, x: sx, y: sy, vx, vy, nx: vx / speed, ny: vy / speed,
    life: kind === 'laser' ? 1.05 : 1.6, maxLife: kind === 'laser' ? 1.05 : 1.6,
    damage: kind === 'laser' ? 13 : 6, radius: kind === 'laser' ? 12 : 2.5,
  });
  e.attackAnimTimer = Math.max(e.attackAnimTimer, kind === 'laser' ? 0.32 : 0.18);
  e.attackAnimElapsed = 0;
}

function updateEnemyProjectiles() {
  for (const projectile of enemyProjectiles) {
    projectile.x += projectile.vx * DT;
    projectile.y += projectile.vy * DT;
    projectile.life -= DT;
    if (projectile.life <= 0) continue;
    // 線分とプレイヤー中心の距離で弾道を判定し、斜め弾にも対応する。
    const len = projectile.kind === 'laser' ? 66 : 13;
    const x1 = projectile.x - projectile.nx * len, y1 = projectile.y - projectile.ny * len;
    const distance = distanceToSegment(p.x + p.w / 2, p.y + p.h * 0.5, x1, y1, projectile.x, projectile.y);
    const hitRadius = projectile.radius + Math.min(p.w, p.h) * 0.34;
    if (distance <= hitRadius) {
      hurtPlayerFromEnemyAttack(projectile.damage, projectile.x - projectile.nx * 30, projectile.y - projectile.ny * 30,
        projectile.kind === 'laser' ? 300 : 190);
      projectile.life = 0;
    }
  }
  enemyProjectiles = enemyProjectiles.filter((projectile) => projectile.life > 0 && projectile.x > -100 && projectile.x < LEVEL_W + 100 && projectile.y > -100 && projectile.y < H + 200);
}

function updateEnemy(e) {
  e.animTime = (e.animTime || 0) + DT;
  e.attackAnimElapsed = (e.attackAnimElapsed || 0) + DT;
  e.attackAnimTimer = Math.max(0, (e.attackAnimTimer || 0) - DT);
  e.attackCooldown = Math.max(0, (e.attackCooldown || 0) - DT);
  e.jumpCooldown = Math.max(0, (e.jumpCooldown || 0) - DT);

  if (!e.alive) {
    if (e.deathTimer > 0) {
      e.deathElapsed += DT;
      e.deathTimer = Math.max(0, e.deathTimer - DT);
      if (e.deathTimer <= 0 && !e.deathExplosionCreated) {
        e.deathExplosionCreated = true;
        e.explosionTimer = ENEMY_EXPLOSION_TIME;
        createEnemyExplosion(e.x + e.w / 2, e.y + e.h * 0.52);
      }
    } else if (e.explosionTimer > 0) {
      e.explosionTimer = Math.max(0, e.explosionTimer - DT);
    }
    return;
  }

  e.hurtTimer = Math.max(0, e.hurtTimer - DT);
  e.stunTimer = Math.max(0, e.stunTimer - DT);
  if (e.explosionTimer > 0) e.explosionTimer = Math.max(0, e.explosionTimer - DT);

  if (e.heavyCarryTimer > 0) {
    e.heavyCarryTimer = Math.max(0, e.heavyCarryTimer - DT);
    e.vx = e.heavyCarryDir * e.heavyCarrySpeed;
    moveBody(e);
    return;
  }
  if (e.stunTimer > 0) {
    e.burstRemaining = 0;
    e.vx = approach(e.vx, 0, 800 * DT);
    moveBody(e);
    return;
  }

  const playerCx = p.x + p.w / 2;
  const enemyCx = e.x + e.w / 2;
  const dx = playerCx - enemyCx;
  const distance = Math.abs(dx);
  const verticalDistance = Math.abs((p.y + p.h * 0.5) - (e.y + e.h * 0.5));
  if (Math.abs(dx) > 2) e.dir = Math.sign(dx);

  // 状況に応じてまれにジャンプ。プレイヤーが上にいる場合は優先して跳ぶ。
  if (e.onGround && e.jumpCooldown <= 0 && e.attackTimer <= 0) {
    const playerAbove = p.y + p.h < e.y + e.h * 0.6 && distance < 360;
    const closeThreat = distance < 150 && verticalDistance < 180 && Math.random() < 0.32;
    if (playerAbove || closeThreat) {
      e.vy = -500 - Math.random() * 55;
      // 遠距離型はジャンプしてもプレイヤーへ接近しない。近接型だけ追いかける。
      const jumpVx = (e.type === 'melee') ? (e.dir || 1) * 100 : -(e.dir || 1) * 55;
      e.vx = approach(e.vx, jumpVx, 180 * DT);
      e.jumpCooldown = 3.2 + Math.random() * 3.8;
    } else {
      e.jumpCooldown = 0.8 + Math.random() * 1.2;
    }
  }

  // 遠距離型は索敵範囲外では攻撃せず、出現地点付近を巡回する。
  // 上下に離れすぎた相手や足場で遮られた相手へ弾を撃ち続けない。
  let enemyCanSeePlayer = true;
  if (e.type === 'machinegun' || e.type === 'laser') {
    const detectRange = RANGED_DETECTION_RANGE[e.type];
    const detectHeight = RANGED_DETECTION_HEIGHT[e.type];
    const targetInRange = distance <= detectRange && verticalDistance <= detectHeight;
    const ex = e.x + e.w / 2, ey = e.y + e.h * 0.48;
    const px = p.x + p.w / 2, py = p.y + p.h * 0.48;
    const hasLineOfSight = !solids.some((solid) => {
      // レイの端点が立っている床の内側に入らないよう、床面より上での遮蔽のみ確認。
      if (solid.y >= Math.max(ey, py) + 2) return false;
      if (solid.x + solid.w < Math.min(ex, px) || solid.x > Math.max(ex, px)) return false;
      return segmentIntersectsRect(ex, ey, px, py, solid);
    });

    if (!targetInRange) {
      e.attackTimer = 0;
      e.attackMode = '';
      e.burstRemaining = 0;
      // 遠距離型は索敵外でプレイヤーを追跡せず、現在位置を保持する。
      e.vx = approach(e.vx, 0, 900 * DT);
      moveBody(e);
      return;
    }

    enemyCanSeePlayer = hasLineOfSight;
    if (!hasLineOfSight) {
      e.attackTimer = 0;
      e.attackMode = '';
      e.burstRemaining = 0;
    }
  }

  if (e.type === 'melee') {
    if (e.attackTimer > 0) {
      e.attackTimer = Math.max(0, e.attackTimer - DT);
      e.vx = approach(e.vx, 0, 1500 * DT);
      if (!e.attackHitDone && e.attackTimer <= 0.23) {
        e.attackHitDone = true;
        if (distance < 76 && verticalDistance < 72) {
          hurtPlayerFromEnemyAttack(10, enemyCx, e.y + e.h * 0.5, 270);
        }
      }
    } else if (distance < 70 && verticalDistance < 85 && e.attackCooldown <= 0) {
      e.attackTimer = 0.46; e.attackMode = 'melee'; e.attackHitDone = false;
      e.attackCooldown = 0.88 + Math.random() * 0.42; e.vx = 0; e.attackAnimElapsed = 0;
    } else {
      e.vx = distance > 54 ? (e.dir || 1) * ENEMY_CHASE : 0;
    }
  } else if (e.type === 'machinegun') {
    const preferred = 220;
    // マシンガン型は接近せず、近づかれたときだけ距離を取る。
    if (distance < preferred - 35) e.vx = -(e.dir || 1) * 108;
    else e.vx = approach(e.vx, 0, 900 * DT);

    if (enemyCanSeePlayer && distance <= RANGED_FIRE_RANGE.machinegun && verticalDistance < RANGED_DETECTION_HEIGHT.machinegun && e.burstRemaining <= 0 && e.attackCooldown <= 0) {
      e.burstRemaining = 3; e.burstTimer = 0; e.attackCooldown = 1.6 + Math.random() * 0.7;
    }
    if (e.burstRemaining > 0 && (!enemyCanSeePlayer || distance > RANGED_FIRE_RANGE.machinegun || verticalDistance >= RANGED_DETECTION_HEIGHT.machinegun)) e.burstRemaining = 0;
    if (e.burstRemaining > 0) {
      e.burstTimer -= DT;
      if (e.burstTimer <= 0) {
        spawnEnemyProjectile(e, 'bullet');
        e.burstRemaining--;
        e.burstTimer = 0.13;
      }
    }
  } else { // laser type: プレイヤーへ接近せず、近づかれた場合のみ後退して照射する
    const preferred = 300;
    if (distance < preferred - 45) e.vx = -(e.dir || 1) * 88;
    else e.vx = approach(e.vx, 0, 850 * DT);

    if (e.attackTimer > 0 && e.attackMode === 'laser') {
      if (!enemyCanSeePlayer || distance > RANGED_FIRE_RANGE.laser || verticalDistance >= RANGED_DETECTION_HEIGHT.laser) {
        e.attackTimer = 0; e.attackMode = '';
      } else {
      e.attackTimer = Math.max(0, e.attackTimer - DT);
      e.vx = approach(e.vx, 0, 1200 * DT);
      if (e.attackTimer <= 0) {
        spawnEnemyProjectile(e, 'laser');
        e.attackMode = '';
      }
      }
    } else if (enemyCanSeePlayer && distance <= RANGED_FIRE_RANGE.laser && verticalDistance < RANGED_DETECTION_HEIGHT.laser && e.attackCooldown <= 0) {
      e.attackTimer = 0.62; e.attackMode = 'laser'; e.laserTargetX = playerCx;
      e.laserTargetY = p.y + p.h * 0.48;
      e.attackCooldown = 2.6 + Math.random() * 1.0; e.vx = 0; e.attackAnimElapsed = 0;
    }
  }
  moveBody(e);
}

// 敵が複数いると同じ場所に重なって1体に見えるので、めり込んだ分だけ左右に押し分ける
function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (!a.alive || !b.alive || !overlap(a, b)) continue;
      const depth = Math.min(a.x + a.w - b.x, b.x + b.w - a.x);        // めり込んでいる幅
      const push = depth / 2 + 0.5, dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;   // 左にいる方を左へ
      a.x = Math.max(0, Math.min(BOSS_STAGE_START - a.w - 10, a.x + dir * push));
      b.x = Math.max(0, Math.min(BOSS_STAGE_START - b.w - 10, b.x - dir * push));
    }
  }
}

// 斜め下攻撃は通常攻撃1段目の斬撃素材を斜めに傾けて再生する
function drawDownAttack() {
  if (p.downAttackTimer <= 0) return;
  const progress = Math.max(0, Math.min(1, p.downAttackElapsed / DOWN_ATTACK_DURATION));
  const alpha = Math.min(1, progress * 9, (1 - progress) * 5);
  const dir = p.downAttackDir, cx = p.x + p.w / 2;
  const x = cx + dir * 28;
  const y = p.y + p.h * 0.56;
  // 左右どちらを向いても、前方斜め下へ斬り下ろす向きになる
  if (drawSlashSprite(x, y, dir, 1, progress, alpha, comboSlashSheets[1], Math.PI / 4)) return;

  // 画像がまだ読み込まれていない場合だけ簡易表示へ戻す
  const x1 = cx + dir * 8, y1 = p.y + 10;
  const x2 = cx + dir * 112, y2 = p.y + p.h + 115;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
  ctx.shadowColor = '#3df2ff'; ctx.shadowBlur = 20; ctx.strokeStyle = '#3df2ff'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

// ================= エフェクト・カメラ =================
function updateEffects() {
  for (const f of effects) {
    f.life -= DT;
    if (f.type !== 'enemyExplosion') f.y -= 40 * DT;
  }
  effects = effects.filter((f) => f.life > 0);
}

function updateCamera() {
  const target = Math.max(0, Math.min(LEVEL_W - W, p.x + p.w / 2 - W / 2));
  cam.x += (target - cam.x) * 0.12;
}

// ================= 更新 =================
function update() {
  if (pauseMenuOpen && state === 'playing') {
    return;  // 一時停止中はゲーム・演出・タイマーを全て止める
  }
  Title.update();                  // タイトル画面の更新（ゲーム開始後の明転もここで進める）
  if (state === 'title') return;   // タイトル中は、敵もプレイヤーも戦闘処理も一切進めない
  if (UI.tick()) return;           // オーバーレイ中・ヒットストップ中は進行を止める
  if (state !== 'playing') return;
  updatePlayer();
  updateCamera();
  updateBoss();
  if (boss && boss.active) {
    // ボス戦開始後は雑魚敵を境界の向こうで停止させ、攻撃や接触を無効にする。
    enemyProjectiles = [];
    for (const enemy of enemies) { enemy.vx = 0; enemy.attackTimer = 0; enemy.attackMode = ''; enemy.burstRemaining = 0; }
  } else {
    enemies.forEach(updateEnemy);
  }
  separateEnemies();
  checkAttackHit();
  checkDownAttackHit();
  checkHeavyAttackHit();
  checkContactDamage();
  if (!boss.active) updateEnemyProjectiles();
  updateEnergyOrbs();
  updateEffects();

  // 通常敵はボス戦が始まったら再出現しない。
  const allEnemiesFinishedDying = !boss.active && enemies.length > 0 && enemies.every((e) => !e.alive && e.deathTimer <= 0 && e.explosionTimer <= 0);
  if (allEnemiesFinishedDying) {
    if (respawnTimer < 0) respawnTimer = ENEMY_RESPAWN_DELAY;
    else {
      respawnTimer -= DT;
      if (respawnTimer <= 0) {
        enemies = createEnemyGroup();
        respawnTimer = -1;
      }
    }
  } else {
    respawnTimer = -1;
  }

  if (p.hp <= 0) gameOver();
}

function drawDebugOverlay() {
  const debug = window.DebugTools;
  if (!debug || (!debug.showHitboxes && !debug.showAttackBoxes && !debug.showInvulnerability)) return;
  const BLUE = '#2f9bff';
  const RED = '#ff354f';
  const GREEN = '#35ff79';
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  // 青：プレイヤーと敵の本体ヒットボックス（物理衝突・被弾領域）。
  if (debug.showHitboxes) {
    const bodies = [];
    if (p) bodies.push({ box: p, label: 'PLAYER' });
    for (const e of enemies || []) if (e.alive) bodies.push({ box: e, label: `ENEMY:${e.type || 'unknown'}` });
    if (playerCanDamageBoss()) bodies.push({ box: { x: p.x - 72, y: 64, w: 176, h: 156 }, label: 'BOSS:ONBOROID' });
    for (const item of bodies) {
      const b = item.box;
      ctx.fillStyle = 'rgba(47,155,255,0.13)';
      ctx.strokeStyle = BLUE;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = BLUE; ctx.fillText(item.label, b.x, b.y - 3);
    }
  }

  // 赤：現在フレームで有効なプレイヤー攻撃判定と敵の攻撃領域。
  if (debug.showAttackBoxes) {
    ctx.strokeStyle = RED; ctx.fillStyle = 'rgba(255,53,79,0.16)';
    if (isHitActive()) {
      const b = attackBox(); ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (p.downAttackTimer > 0 && p.downAttackElapsed >= DOWN_ATTACK_HIT_FROM && p.downAttackElapsed <= DOWN_ATTACK_HIT_TO) {
      const dir = p.downAttackDir, cx = p.x + p.w / 2;
      const b = { x: dir > 0 ? cx - 4 : cx - 118, y: p.y + p.h * 0.5, w: 122, h: p.h + 120 };
      ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.beginPath(); ctx.moveTo(cx + dir * 8, p.y + 10); ctx.lineTo(cx + dir * 112, p.y + p.h + 115); ctx.stroke();
    }
    if (p.heavyTimer > 0) {
      ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h * 0.55, 160, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (p.skillDash) {
      const d = p.skillDash;
      ctx.strokeRect(Math.min(d.startCenterX, d.endX + p.w / 2) - 38, d.startY + p.h / 2 - SKILL_DASH_VERTICAL_REACH,
        Math.abs((d.endX + p.w / 2) - d.startCenterX) + 76, SKILL_DASH_VERTICAL_REACH * 2);
    }
    // 敵の近接攻撃・レーザー照準・弾丸も同じ赤色で表示する。
    for (const e of enemies || []) {
      if (!e.alive) continue;
      if (e.attackMode === 'melee' && e.attackTimer > 0) {
        const b = { x: e.x + e.w / 2 - 76, y: e.y + e.h / 2 - 72, w: 152, h: 144 };
        ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
      } else if (e.type === 'melee' && e.attackTimer > 0) {
        const b = { x: e.x + e.w / 2 - 76, y: e.y + e.h / 2 - 72, w: 152, h: 144 };
        ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      if (e.type === 'laser' && e.attackMode === 'laser' && e.attackTimer > 0) {
        ctx.setLineDash([6, 4]); ctx.beginPath();
        ctx.moveTo(e.x + e.w / 2, e.y + e.h * 0.5);
        ctx.lineTo(e.laserTargetX ?? (p.x + p.w / 2), e.laserTargetY ?? (p.y + p.h / 2));
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const projectile of enemyProjectiles || []) {
      // 実際の弾道判定と合わせ、弾の後方まで含む線分を赤色で表示する。
      const len = projectile.kind === 'laser' ? 66 : 13;
      const x1 = projectile.x - (projectile.nx || 0) * len;
      const y1 = projectile.y - (projectile.ny || 0) * len;
      ctx.lineWidth = Math.max(2, (projectile.radius || 6) * 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(projectile.x, projectile.y); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius || 6, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 緑：プレイヤーが被弾無敵・回避・スキルダッシュ中の領域。
  if (debug.showInvulnerability && p && (p.hurtTimer > 0 || p.dodgeTimer > 0 || p.skillDashInvulnerable || p.skillDash)) {
    ctx.fillStyle = 'rgba(53,255,121,0.17)'; ctx.strokeStyle = GREEN; ctx.lineWidth = 3;
    ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
    ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = GREEN; ctx.fillText('INVULNERABLE', p.x, p.y - 5);
  }
  ctx.restore();
}

function draw() {
  if (state === 'title') { if (bossWorldElement) bossWorldElement.classList.remove('active'); Title.draw(); return; }
  drawBackground();
  ctx.save();
  ctx.translate(-Math.round(cam.x) + UI.sx(), UI.sy());    // カメラ追従＋画面揺れ
  drawStage();
  drawDodgeTrail();
  drawSkillDashEffect();
  enemies.forEach(drawEnemy);
  drawEnemyProjectiles();
  drawEnemyExplosions();
  drawEnergyOrbs();
  drawPlayer();
  drawHeavySlash();
  drawSlash();
  drawDownAttack();
  drawEffects();
  drawDebugOverlay();
  ctx.restore();
  drawBossAttackOverlay();        // ボスの奥／手前レイヤー攻撃は画面座標で重ねる
  drawHUD();
  Title.drawFade();                // ゲーム開始直後の明転
}

// ================= メインループ =================
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { update(); acc -= DT; }
  if (touchControls) {
    const mobileInput = window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches;
    touchControls.classList.toggle('is-active', state === 'playing' && mobileInput);
    touchControls.classList.toggle('overlay-open', !!UI.overlay || pauseMenuOpen);
  }
  const hideCombatCursor = state === 'playing' && !pauseMenuOpen && !UI.overlay && overlay.classList.contains('hidden');
  document.body.classList.toggle('combat-active', hideCombatCursor);
  if (hideCombatCursor) canvas.style.cursor = 'none';
  else if (canvas.style.cursor === 'none') canvas.style.cursor = 'default';
  draw();
  requestAnimationFrame(frame);
}

document.getElementById('retry').addEventListener('click', resetGame);
document.getElementById('toTitle').addEventListener('click', () => Title.open());   // ゲームオーバーからタイトルへ戻る

// 一時停止メニューの操作
document.getElementById('pauseContinue').addEventListener('click', closePauseMenu);
document.getElementById('pauseSettings').addEventListener('click', () => {
  if (pauseMainPanel) pauseMainPanel.classList.add('hidden');
  if (pauseSettingsPanel) pauseSettingsPanel.classList.remove('hidden');
  syncPauseSettings();
});
document.getElementById('pauseSettingsBack').addEventListener('click', () => {
  if (pauseSettingsPanel) pauseSettingsPanel.classList.add('hidden');
  if (pauseMainPanel) pauseMainPanel.classList.remove('hidden');
});
document.getElementById('pauseHome').addEventListener('click', returnToTitleFromPause);
document.getElementById('pauseRestart').addEventListener('click', restartFromPause);
document.getElementById('pauseVolume').addEventListener('input', (e) => {
  Settings.volume = Math.max(0, Math.min(10, Number(e.target.value) || 0));
  Settings.save(); Sound.applyVolume(); syncPauseSettings();
});
document.getElementById('pauseShake').addEventListener('change', (e) => { Settings.shake = e.target.checked; Settings.save(); });
document.getElementById('pauseFlash').addEventListener('change', (e) => { Settings.flash = e.target.checked; Settings.save(); });
Title.open();                      // 起動時はタイトル画面を表示（ゲームは START GAME で始まる）
requestAnimationFrame(frame);
