'use strict';
// ===== SF風UI層：HUD・戦闘演出・インベントリ・イントロ・アピール =====
// 読み込み順は ui.js → game.js。game.js 側の p / enemies / cam / ctx などは実行時に参照する。
// 【拡張】draw〜関数をスプライト描画に差し替えれば、見た目だけを入れ替えられる。
const C = { cyan: '#3df2ff', white: '#e9fbff', orange: '#ff8a1f' };
const DIM = 'rgba(233,251,255,0.45)';
const FONT = '"Orbitron","Rajdhani","Segoe UI","Hiragino Sans",sans-serif';
const SKILLS = { q: { cd: 14 }, e: { cd: 10 } };  // クールダウン(秒)
const ENERGY_MAX = 100;
const ABILITY_COST = { e: 30, q: 60 }; // スキルより必殺技の消費を大きくする
const ABILITY_FRAME = { lockW: 256, lockH: 256, lockCols: 9, lockCount: 54, lock2W: 320, lock2H: 180, lock2Cols: 7, lock2Count: 28, lock2HitFrame: 7, spinW: 512, spinH: 220, spinCols: 6, spinCount: 33 };
const SKILL_DASH_RANGE = 380;
const SKILL_DASH_SPEED = 2200;
const SKILL_DASH_VERTICAL_REACH = 110;
const SKILL_DASH_FRAME = { w: 480, h: 270, cols: 4, count: 16 };
const skillDashSheet = new Image(); skillDashSheet.src = 'assets/effect/skill_dash_sheet.webp';
const SKILL_SLASH_FRAME = { w: 256, h: 256, cols: 4, count: 14 };
const skillSlashSheet = new Image(); skillSlashSheet.src = 'assets/effect/skill_slash_sheet.webp';
const lockOnSheet = new Image(); lockOnSheet.src = 'assets/effect/lock_on_sheet.webp';
const lockOn2Sheet = new Image(); lockOn2Sheet.src = 'assets/effect/lock_on_2_sheet.webp';
const spinSlashSheet = new Image(); spinSlashSheet.src = 'assets/effect/spin_slash_sheet.webp';
const SLASH_FRAME_SIZE = 256, SLASH_COLUMNS = 11, SLASH_FRAME_COUNT = 66;
const slashSheet = new Image();
slashSheet.src = 'assets/effect/slash_sheet.webp'; // 旧斬撃演出の予備素材
// 爆発1・2は正方形セル、爆発3は従来の横長セル。すべてWebP・48コマ。
const ENEMY_EXPLOSION_FRAME_SPECS = [
  { frameW: 108, frameH: 108, cols: 8, count: 48, drawW: 150, drawH: 150 },
  { frameW: 108, frameH: 108, cols: 8, count: 48, drawW: 150, drawH: 150 },
  { frameW: 192, frameH: 108, cols: 8, count: 48, drawW: 168, drawH: 95 },
];
// 敵撃破時の爆発は、既存(爆発3)を含む3種類のWebPスプライトシートから抽選する。
const enemyExplosionSheets = [1, 2, 3].map((number) => {
  const sheet = new Image();
  sheet.src = `assets/effect/explosion${number}_sheet.webp`;
  return sheet;
});

// プレイヤーのスプライトシート。実際の素材は大文字ファイル名で、各コマの幅も均一ではない。
// 画像読み込み時に透過画素から各コマの左右端を検出し、可変幅で切り出す。
const CHARACTER_SPRITE_SPECS = {
  idle:       { src: 'assets/animation/IDLE.png',       fallbackFrames: 4, fps: 5,  loop: true },
  run:        { src: 'assets/animation/WALK.png',       fallbackFrames: 4, fps: 12, loop: true },
  jump:       { src: 'assets/animation/JUMP.png',       fallbackFrames: 5, fps: 9,  loop: false },
  attack:     { src: 'assets/animation/ATTACK_ALL.png', fallbackFrames: 9, fps: 16, loop: false },
  heavy:      { src: 'assets/animation/ATTACK2.png',    fallbackFrames: 3, fps: 5,  loop: false },
  downAttack: { src: 'assets/animation/ATTACK2.png',    fallbackFrames: 3, fps: 9,  loop: false },
  skill:      { src: 'assets/animation/ATTACK_POINT.png', fallbackFrames: 3, fps: 16, loop: false },
  appeal:     { src: 'assets/animation/APPEAL.png',     fallbackFrames: 4, fps: 3,  loop: false },
  death:      { src: 'assets/animation/DEATH.png',      fallbackFrames: 5, fps: 8,  loop: false },
};

// アルファのある列を集めて、スプライト同士の透明な隙間からコマを検出する。
// 素材ごとにコマ幅・間隔が異なり、均等分割だと剣先や髪が隣のコマに切られるため。
function detectPlayerSpriteFrames(image) {
  try {
    const scan = document.createElement('canvas');
    scan.width = image.naturalWidth; scan.height = image.naturalHeight;
    const scanCtx = scan.getContext('2d', { willReadFrequently: true });
    scanCtx.drawImage(image, 0, 0);
    const pixels = scanCtx.getImageData(0, 0, scan.width, scan.height).data;
    const active = new Uint8Array(scan.width);
    for (let y = 0; y < scan.height; y++) {
      let offset = y * scan.width * 4 + 3;
      for (let x = 0; x < scan.width; x++, offset += 4) {
        if (pixels[offset] > 8) active[x] = 1;
      }
    }
    const raw = [];
    let begin = -1;
    for (let x = 0; x <= scan.width; x++) {
      const on = x < scan.width && active[x] === 1;
      if (on && begin < 0) begin = x;
      else if (!on && begin >= 0) { raw.push([begin, x]); begin = -1; }
    }
    // ごく小さなノイズ（1〜2pxの点）は捨て、キャラクター本体や武器を含む幅だけ残す。
    const minWidth = Math.max(18, Math.round(scan.height * 0.12));
    const frames = raw.filter(([left, right]) => right - left >= minWidth);
    return frames.length >= 2 ? frames : null;
  } catch (error) {
    // canvas読み取りが使えない環境では、下の均等分割フォールバックを利用する。
    return null;
  }
}

function evenlySplitPlayerFrames(image, count) {
  const frames = Math.max(1, Math.min(count || 1, image.naturalWidth));
  const ranges = [];
  for (let i = 0; i < frames; i++) {
    ranges.push([Math.round(i * image.naturalWidth / frames), Math.round((i + 1) * image.naturalWidth / frames)]);
  }
  return ranges;
}

const characterSprites = {};
for (const [name, spec] of Object.entries(CHARACTER_SPRITE_SPECS)) {
  const image = new Image();
  image.onload = () => {
    spec.frameRanges = detectPlayerSpriteFrames(image) || evenlySplitPlayerFrames(image, spec.fallbackFrames);
    spec.detectedFrames = spec.frameRanges.length;
    spec.loaded = true;
  };
  image.onerror = () => { spec.unavailable = true; };
  image.src = spec.src;
  characterSprites[name] = image;
}

// 敵アニメーション。正式素材が未配置でも、従来の描画へフォールバックする。
// 推奨配置: assets/animation/enemy/{IDLE,WALK,ATTACK,JUMP,DEATH}.png
const ENEMY_ANIMATION_SPECS = {
  // 敵シートは1コマ145x120px。高さ比率から推定すると6コマが7コマ扱いになるため固定幅で切り出す。
  idle:   { names: ['IDLE.png', 'idle.png'], frameWidth: 145, frames: 6, fps: 5, loop: true },
  walk:   { names: ['WALK.png', 'walk.png'], frameWidth: 145, frames: 11, fps: 10, loop: true },
  attack: { names: ['ATTACK.png', 'attack.png'], frameWidth: 145, frames: 7, fps: 14, loop: false },
  jump:   { names: ['JUMP.png', 'jump.png'], frameWidth: 145, frames: 8, fps: 9, loop: false },
  death:  { names: ['DEATH.png', 'death.png', 'HURT.png', 'hurt.png'], frameWidth: 145, frames: 7, fps: 12, loop: false },
};
const enemyAnimationSprites = {};
function specFrameCountForImage(name, image) {
  const spec = ENEMY_ANIMATION_SPECS[name];
  return spec && spec.frames ? spec.frames : Math.max(1, Math.floor(image.naturalWidth / (spec?.frameWidth || image.naturalHeight)));
}
function loadEnemyAnimation(name, candidates, index = 0) {
  const image = enemyAnimationSprites[name] || new Image();
  enemyAnimationSprites[name] = image;
  if (index >= candidates.length) { image.datasetUnavailable = true; return; }
  image.onload = () => {
    image.detectedFrames = Math.max(1, Math.min(specFrameCountForImage(name, image), Math.floor(image.naturalWidth / (ENEMY_ANIMATION_SPECS[name].frameWidth || image.naturalHeight))));
    image.loadedPath = candidates[index];
  };
  image.onerror = () => loadEnemyAnimation(name, candidates, index + 1);
  image.src = candidates[index];
}
for (const [animName, spec] of Object.entries(ENEMY_ANIMATION_SPECS)) {
  // DEATHが未配置なら、同じ7コマ構成のHURTを代用できる。全候補を順に確認する。
  const candidates = [];
  for (const filename of spec.names) {
    const lower = filename.toLowerCase();
    candidates.push(`assets/animation/enemy/${filename}`);
    candidates.push(`assets/animation/enemy_${filename}`);
    candidates.push(`assets/animation/${lower.replace(/\.png$/i, '')}_enemy.png`);
  }
  loadEnemyAnimation(animName, [...new Set(candidates)]);
}
// 通常攻撃は1段目から剣閃7、剣閃2、剣閃1の順に再生する
const comboSlashSheets = {
  1: new Image(),
  2: new Image(),
  3: new Image(),
};
comboSlashSheets[1].src = 'assets/effect/slash_combo_1.webp';
comboSlashSheets[2].src = 'assets/effect/slash_combo_2.webp';
comboSlashSheets[3].src = 'assets/effect/slash_combo_3.webp';
if (document.fonts) document.fonts.load('500 16px Orbitron');

// 仮データ（【拡張】正式なアイテムデータに差し替える）
const INV = [
  { cat: 'WEAPON', slot: 'WEAPON', name: 'PULSE BLADE', lines: ['標準支給の高周波ブレード。', '扱いやすく、連撃に向く。'], stat: 'ATK 10 / 12 / 22' },
  { cat: 'WEAPON', slot: 'WEAPON', name: 'ARC EDGE', lines: ['放電機構つきの試作刃。', '属性強化の実験機。'], stat: 'ATK 11 / 13 / 24' },
  { cat: 'ITEM', slot: '', name: 'NANO PACK x3', lines: ['ナノ修復剤。', 'HPを回復する。'], stat: 'HP +40' },
  { cat: 'ITEM', slot: '', name: 'EMP CHIP x2', lines: ['敵の動きを止める', '使い捨てチップ。'], stat: 'STUN 2.0s' },
  { cat: 'EQUIP', slot: 'BODY', name: 'LIGHT PLATING', lines: ['軽量装甲。', '機動力を保つ。'], stat: 'DEF +4' },
  { cat: 'EQUIP', slot: 'CORE', name: 'CORE: AXIS', lines: ['出力を安定させる', '標準コア。'], stat: 'ENERGY +10' },
  { cat: 'EQUIP', slot: 'HEAD', name: 'VISOR MK-I', lines: ['戦術情報を表示する', 'バイザー。'], stat: 'SCAN +1' },
  { cat: 'WEAPON', slot: 'WEAPON', name: 'GRAVITON EDGE', lines: ['重力場をまとう大型ブレード。', '一撃が重く、取り回しは鈍い。'], stat: 'ATK 14 / 16 / 30' },
  { cat: 'ITEM', slot: '', name: 'SHIELD CELL x1', lines: ['一度だけ攻撃を防ぐ', '使い捨てのシールド。'], stat: 'BLOCK x1' },
  { cat: 'ITEM', slot: '', name: 'DATA LOG 07', lines: ['虚層で見つかった記録。', '断片的な音声が残っている。'], stat: 'KEY ITEM' },
  { cat: 'EQUIP', slot: 'HEAD', name: 'VISOR MK-II', lines: ['広い範囲を解析する', '改良型バイザー。'], stat: 'SCAN +2' },
  { cat: 'EQUIP', slot: 'BODY', name: 'HEAVY PLATING', lines: ['厚い装甲板。', '守りは固いが少し重い。'], stat: 'DEF +9' },
  { cat: 'EQUIP', slot: 'CORE', name: 'CORE: NOVA', lines: ['高出力の試作コア。', '発熱が大きい。'], stat: 'ENERGY +25' },
  { cat: 'ITEM', slot: '', name: 'SCRAP x12', lines: ['機械の残骸。', '強化の素材になる。'], stat: 'MATERIAL' },
];
// インベントリは 8(横)×4(縦) = 32マス。INV の並び順がそのままマスの順番になる
const INV_COLS = 8, INV_ROWS = 4;
const INV_CELL = 56, INV_GAP = 6, INV_X = 48, INV_Y = 108;   // 1マスの大きさ・すき間・グリッドの左上
const SLOTS = ['WEAPON', 'HEAD', 'BODY', 'CORE'];
const CONTROLS = [['A / D', '移動'], ['W', 'ジャンプ（空中で再入力すると2段ジャンプ）'], ['SPACE短押し', 'ジャストパリィ（成功でゲージ+20）'], ['SPACE長押し', 'ガード（防いだダメージ分だけゲージ消費）'], ['SHIFT', '回避'], ['CLICK / J', '通常攻撃（3段）・長押しで強攻撃'], ['Q', '必殺技（ゲージ60消費・敵ロックオン）'],
  ['E', 'スキル（ゲージ30消費・固定距離直進→斬撃）'], ['JUMP + A/D + CLICK', '空中斜め下攻撃'], ['V', 'アピール'], ['TAB', 'インベントリ'], ['F', 'この画面']];

// ================= UI状態と戦闘演出ロジック =================
const UI = {
  overlay: null, sel: 0, t: 0, hits: [],
  equipped: { WEAPON: 0, HEAD: 6, BODY: 4, CORE: 5 },

  reset() {
    Object.assign(this, { hitStop: 0, shake: 0, flash: 0, ult: 0, hurt: 0, combo: 0, comboTimer: 0, pop: 0, maxCombo: 0,
      kills: 0, orbsAbsorbed: 0, cdQ: 0, cdE: 0, appeal: 0, appealText: '', ghost: 100, energy: 0, energyFlash: 0, texts: [], fx: [], lockOn: null });
    this.overlay = null;
  },

  // 毎フレーム呼ばれる。trueを返すとゲーム本体の更新を止める（オーバーレイ・ヒットストップ）
  tick() {
    this.t += DT;
    if (this.overlay) return true;
    if (this.hitStop > 0) { this.hitStop -= DT; return true; }
    this.shake = Math.max(0, this.shake - 30 * DT);
    for (const k of ['flash', 'ult', 'cdQ', 'cdE', 'hurt', 'appeal', 'energyFlash']) {
      this[k] = Math.max(0, this[k] - DT * (k === 'flash' || k === 'hurt' ? 2.5 : 1));
    }
    this.pop = Math.max(0, this.pop - DT * 4);
    if (this.comboTimer > 0 && (this.comboTimer -= DT) <= 0) this.combo = 0;

    // 照準演出が終わってからロックオン2を再生し、着弾フレームで大ダメージを与える
    if (this.lockOn) {
      const lock = this.lockOn;
      if (lock.phase === 'lock') {
        lock.life = Math.max(0, lock.life - DT);
        if (lock.life <= 0) {
          if (lock.target && lock.target.alive && (!lock.target.isBoss || (window.BossHUD && window.BossHUD.active))) {
            lock.phase = 'strike';
            lock.strikeElapsed = 0;
            lock.hit = false;
          } else {
            this.lockOn = null;
          }
        }
      } else if (lock.phase === 'strike') {
        lock.strikeElapsed += DT;
        const progress = Math.min(1, lock.strikeElapsed / lock.strikeDuration);
        // lock_on_2_sheet の7コマ目でダメージを発生させ、演出開始からの待ち時間を短縮する
        if (!lock.hit && progress >= ABILITY_FRAME.lock2HitFrame / ABILITY_FRAME.lock2Count) {
          lock.hit = true;
          const target = lock.target;
          if (target && target.alive && (!target.isBoss || (window.BossHUD && window.BossHUD.active))) {
            // ボスは通常レイヤーの敵とは別の背景干渉対象。落雷が足場を貫通して命中する。
            const dir = Math.sign(target.x + target.w / 2 - (p.x + p.w / 2)) || p.facing;
            if (target.isBoss) {
              damageBoss(150, 4, { shake: 12, stop: 0.16 });
              this.finish(target);
            } else {
              damageEnemy(target, 150, 620, dir, 4, { flash: 0.22, stun: 0.6, stop: 0.16, shake: 12, sparks: 22, lift: -260 });
              this.finish(target);
            }
          }
        }
        if (lock.strikeElapsed >= lock.strikeDuration) this.lockOn = null;
      }
    }

    this.ghost = Math.max(p.hp, this.ghost - 40 * DT);
    for (const f of this.texts) { f.life -= DT; f.y -= 45 * DT; }
    for (const f of this.fx) { f.life -= DT; f.x += (f.vx || 0) * DT; f.y += (f.vy || 0) * DT; }
    this.texts = this.texts.filter((f) => f.life > 0);
    this.fx = this.fx.filter((f) => f.life > 0);
    return false;
  },

  sx() { return Settings.shake ? (Math.random() - 0.5) * this.shake : 0; },   // 設定で揺れをOFFにできる
  sy() { return Settings.shake ? (Math.random() - 0.5) * this.shake : 0; },

  addText(txt, x, y, col, size) {
    this.texts.push({ txt, x: x + (Math.random() - 0.5) * 16, y, col, size, life: 0.8 });
  },

  // コンボ数に応じて、攻撃命中時のエネルギー回復量を増やす
  energyMultiplier() {
    if (this.combo >= 50) return 2.5;
    if (this.combo >= 25) return 2;
    if (this.combo >= 10) return 1.5;
    return 1;
  },

  gainEnergy(amount) {
    const before = this.energy;
    const multiplier = this.energyMultiplier();
    this.energy = Math.min(ENERGY_MAX, this.energy + amount * multiplier);
    if (this.energy > before) this.energyFlash = 0.22;
  },

  // 敵に攻撃が当たった瞬間：コンボ・ヒットストップ・揺れ・ダメージ数値・火花
  hit(e, dmg, power, a = {}, dir = 1) {
    Sound.play(power >= 3 ? 'heavy' : 'hit');
    this.combo++; this.comboTimer = 2.2; this.pop = 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.hitStop = Math.max(this.hitStop, a.stop !== undefined ? a.stop : ([0, 0.045, 0.05, 0.09, 0.16][power] || 0.045));
    this.shake = Math.max(this.shake, a.shake !== undefined ? a.shake : power * 2);
    const hot = power >= 3, col = hot ? C.orange : C.cyan;
    const hx = dir > 0 ? e.x + 6 : e.x + e.w - 6, hy = e.y + e.h * 0.4;   // 命中位置（敵の手前側）
    this.addText(dmg, e.x + e.w / 2, e.y - 6, hot ? C.orange : C.white, 18 + power * 3);
    this.fx.push({ burst: true, x: hx, y: hy, size: 12 + power * 7, col, life: 0.18, max: 0.18 });
    for (let i = 0; i < (a.sparks || 8); i++) {                            // 火花は攻撃方向へ飛ばす
      const an = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2, s = 180 + Math.random() * 260 + power * 40;
      this.fx.push({ x: hx, y: hy, vx: Math.cos(an) * s, vy: Math.sin(an) * s, life: 0.3, max: 0.3, col });
    }
  },

  // 3段目フィニッシュ：オレンジの衝撃波とFINISH表示でコンボ完了を示す
  finish(e) {
    this.fx.push({ ring: true, x: e.x + e.w / 2, y: e.y + e.h / 2, r: 120, col: C.orange, life: 0.35, max: 0.35 });
    this.addText('FINISH', e.x + e.w / 2, e.y - 44, C.orange, 22); this.pop = 1.6;
  },

  onHurt(dmg) {
    Sound.play('hit');
    this.combo = 0; this.comboTimer = 0; this.appeal = 0; this.hurt = 1; this.shake = 8; this.hitStop = 0.08;
    this.addText(dmg, p.x + p.w / 2, p.y - 6, C.orange, 22);
  },

  keydown(code) {
    if (state !== 'playing') return false;
    const open = (n) => { this.overlay = this.overlay === n ? null : this.overlay || n; };
    if (code === Settings.keybinds.inventory) { open('inventory'); return true; }
    if (code === Settings.keybinds.info) { open('intro'); return true; }
    if (this.overlay) {
      if (code === 'Escape') this.overlay = null;
      else if (this.overlay === 'inventory') {
        const col = this.sel % INV_COLS, row = Math.floor(this.sel / INV_COLS);   // 今のマスの列と行。端まで行くと反対側へ回る
        if (code === 'ArrowRight' || code === 'KeyD') this.sel = row * INV_COLS + (col + 1) % INV_COLS;
        if (code === 'ArrowLeft' || code === 'KeyA') this.sel = row * INV_COLS + (col + INV_COLS - 1) % INV_COLS;
        if (code === 'ArrowDown' || code === 'KeyS') this.sel = ((row + 1) % INV_ROWS) * INV_COLS + col;
        if (code === 'ArrowUp' || code === 'KeyW') this.sel = ((row + INV_ROWS - 1) % INV_ROWS) * INV_COLS + col;
        if (code === 'Enter' || code === 'Space') this.equip(this.sel);
      }
      return true;
    }
    if (code === Settings.keybinds.ult) this.useQ(); else if (code === Settings.keybinds.skill) this.useE(); else if (code === Settings.keybinds.appeal) this.useV(); else return false;
    return true;
  },

  // インベントリの項目をマウスで選択（オーバーレイ中は攻撃入力を消費する）
  click(e) {
    if (!this.overlay) return false;
    if (this.overlay === 'inventory') {
      const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      const h = this.hits.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (h) { if (h.i === this.sel) this.equip(h.i); else this.sel = h.i; }
    }
    return true;
  },

  // マス i のアイテムを装備する（装備できないアイテム・空きマスなら何もしない）
  equip(i) {
    const s = INV[i] && INV[i].slot;
    if (s) this.equipped[s] = i;
  },

  // Q：必殺技。最も近い敵へ照準を送り、オレンジになった瞬間に特大ダメージ
  useQ() {
    if (this.cdQ > 0 || p.stunTimer > 0 || this.lockOn) return;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    // 背景干渉ボス戦では、Q必殺技は雑魚ではなくオンボロイドの弱点を優先ロックする。
    let target = null;
    if (typeof boss !== 'undefined' && boss && boss.active && !boss.defeated) {
      target = { x: cx - 84, y: 76, w: 168, h: 150, alive: true, isBoss: true };
    } else {
      const candidates = enemies.filter((e) => e.alive && Math.abs(e.x + e.w / 2 - cx) <= 620 && Math.abs(e.y + e.h / 2 - cy) <= 210);
      const ahead = candidates.filter((e) => (e.x + e.w / 2 - cx) * p.facing >= -40);
      const pool = ahead.length ? ahead : candidates;
      target = pool.sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy))[0] || null;
    }
    if (!target) { this.addText('TARGET NOT FOUND', cx, p.y - 18, C.orange, 14); return; }
    if (this.energy < ABILITY_COST.q) { this.addText('ENERGY NEED 60', cx, p.y - 18, C.orange, 14); return; }
    this.energy -= ABILITY_COST.q; this.energyFlash = 0.22;
    Sound.play('ult');
    this.cdQ = SKILLS.q.cd; this.ult = 0.7; this.flash = 0.35; this.shake = 7; this.appeal = 0;
    cancelAttack(); p.hurtTimer = Math.max(p.hurtTimer, 0.7);
    this.lockOn = { target, phase: 'lock', life: 1.8, max: 1.8, strikeElapsed: 0, strikeDuration: 0.62, hit: false };
  },

  // E：敵の位置に関係なく固定距離を高速直進し、移動完了後に通過した敵をまとめて斬る
  useE() {
    if (this.cdE > 0 || p.skillDash || p.stunTimer > 0 || p.dodgeTimer > 0 || p.guardActive || this.ult > 0 || this.appeal > 0) return;
    if (this.energy < ABILITY_COST.e) {
      this.addText('ENERGY NEED 30', p.x + p.w / 2, p.y - 18, C.orange, 14);
      return;
    }
    this.energy -= ABILITY_COST.e; this.energyFlash = 0.22;
    Sound.play('skill');
    this.cdE = SKILLS.e.cd; this.appeal = 0; cancelAttack();
    setCrouch(false);

    const dir = p.facing || 1;
    const startX = p.x;
    const startCenterX = p.x + p.w / 2;
    const centerY = p.y + p.h / 2;
    // 敵の位置で距離を変えず、進行方向へ固定距離だけ移動する（端ではステージ範囲内に制限）。
    const endX = Math.max(0, Math.min(LEVEL_W - p.w, startX + dir * SKILL_DASH_RANGE));
    const actualDistance = Math.abs(endX - startX);
    const startVy = p.vy, onGroundStart = p.onGround;
    p.facing = dir; p.vx = 0; p.vy = 0;
    p.guardActive = false; p.guardHoldElapsed = 0; p.parryWindow = 0;
    p.skillDashInvulnerable = true; // Eスキルの高速移動中は接触ダメージを受けない
    p.skillDash = {
      dir, startX, endX, startCenterX, startY: p.y, centerY,
      startVy, onGroundStart,
      elapsed: 0, duration: Math.max(0.09, actualDistance / SKILL_DASH_SPEED),
    };
  },

  // V：アピール。攻撃判定は発生しない
  useV() {
    if (!p.onGround || p.stunTimer > 0 || p.dodgeTimer > 0) return;
    cancelAttack(); this.appeal = 1.2;
    this.appealText = ['READY.', '起動完了', 'まだ、いける'][Math.floor(Math.random() * 3)];
  },
  appealStep() {
    setCrouch(false);   // しゃがみ中でも立ち上がってから行う
    p.vx = approach(p.vx, 0, 2400 * DT); p.hurtTimer = Math.max(0, p.hurtTimer - DT);
    input.attack = input.jump = input.dodge = false; moveBody(p);
  },
};

// 敵へのダメージ処理（通常攻撃・スキル・必殺技で共通）
function damageEnemy(e, dmg, knock, dir, power, a = {}) {   // a: 攻撃データ(ATTACKS)。省略時は従来値
  if (!e || !e.alive) return;
  e.hp -= dmg; e.hurtTimer = a.flash || 0.15; e.stunTimer = a.stun || 0.3; e.vx = dir * knock;
  e.vy = a.lift !== undefined ? a.lift : (knock > 300 ? -300 : 0);
  UI.hit(e, dmg, power, a, dir);
  if (e.hp <= 0 && e.alive) {
    e.alive = false;
    e.deathTimer = ENEMY_DEATH_ANIM_TIME;
    e.deathElapsed = 0;
    e.deathExplosionCreated = false;
    e.attackTimer = 0; e.attackAnimTimer = 0; e.burstRemaining = 0; e.vx = 0; e.vy = 0;
    UI.kills++;
    // 敵1体につき複数のオーブを落とす。飛び出す向きを少しずつ変えて追尾をばらけさせる。
    for (let i = 0; i < 3; i++) {
      spawnEnergyOrb(
        e.x + e.w / 2 + (Math.random() - 0.5) * 16,
        e.y + e.h * 0.42 + (Math.random() - 0.5) * 10
      );
    }
    UI.addText('撃破', e.x + e.w / 2, e.y - 16, C.orange, 30);
    UI.hitStop = Math.max(UI.hitStop, 0.12);
  }
}

// ================= 描画ヘルパー =================
function path(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
const chamfer = (x, y, w, h, c) => path([[x + c, y], [x + w, y], [x + w, y + h - c], [x + w - c, y + h], [x, y + h], [x, y + c]]);
function text(s, x, y, size, col = C.white, align = 'left', glow = 0) {
  ctx.font = `500 ${size}px ${FONT}`; ctx.textAlign = align; ctx.fillStyle = col;
  const str = String(s);
  const available = align === 'center' ? Math.max(1, 2 * Math.min(x - 4, W - x - 4)) : align === 'right' ? Math.max(1, x - 4) : Math.max(1, W - x - 4);
  ctx.shadowColor = col; ctx.shadowBlur = glow;
  if (ctx.measureText(str).width > available) ctx.fillText(str, x, y, available); else ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
}

// パネルの幅に合わせて文字サイズを少しずつ下げ、枠からはみ出さないようにする
function textFit(s, x, y, size, col = C.white, align = 'left', maxWidth = 240, minSize = 7, glow = 0) {
  let actual = size;
  ctx.textAlign = align;
  while (actual > minSize) {
    ctx.font = `500 ${actual}px ${FONT}`;
    if (ctx.measureText(String(s)).width <= maxWidth) break;
    actual -= 0.5;
  }
  text(s, x, y, actual, col, align, glow);
  return actual;
}

function currentControls() {
  const label = (action) => keyCodeLabelForUI(Settings.keybinds[action]);
  return [
    [`${label('left')} / ${label('right')}`, '移動'], [label('jump'), 'ジャンプ（空中で再入力すると2段ジャンプ）'],
    [`${label('guard')}短押し`, 'ジャストパリィ（成功でゲージ+20）'], [`${label('guard')}長押し`, 'ガード（防いだダメージ分だけゲージ消費）'],
    [label('dodge'), '回避（最大3回・地上で1.5秒ごとに1回復）'], [`クリック / ${label('attack')}`, '通常攻撃（3段）・長押しで強攻撃'],
    [label('ult'), '必殺技（ゲージ60消費・敵ロックオン）'], [label('skill'), 'スキル（ゲージ30消費・高速直進斬り）'],
    [`ジャンプ + ${label('left')}/${label('right')} + 攻撃`, '空中斜め下攻撃'], [label('appeal'), 'アピール'],
    [label('inventory'), 'インベントリ'], [label('info'), '操作説明'],
  ];
}
function keyCodeLabelForUI(code) {
  if (!code) return '-';
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'ArrowLeft') return '←'; if (code === 'ArrowRight') return '→';
  if (code === 'ArrowUp') return '↑'; if (code === 'ArrowDown') return '↓';
  return code.toUpperCase();
}

// ================= ワールド描画（game.jsのdraw()から呼ばれる） =================
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#02040a'); g.addColorStop(1, '#07121a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(61,242,255,0.07)';
  for (let x = -(cam.x * 0.3) % 80; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
  for (let y = 60; y < 480; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(233,251,255,0.12)';                       // 遠景の鋭い柱（視差スクロール）
  for (let x = -(cam.x * 0.5) % 320 - 320; x < W + 320; x += 320) {
    ctx.beginPath(); ctx.moveTo(x + 60, 480); ctx.lineTo(x + 90, 40); ctx.lineTo(x + 120, 480); ctx.stroke();
  }
}

function drawStage() {
  // 最奥の専用ボスステージは、通常レイヤーから独立した干渉領域として描く。
  ctx.save();
  ctx.fillStyle = 'rgba(85, 5, 28, 0.10)'; ctx.fillRect(BOSS_STAGE_START, 0, BOSS_STAGE_END - BOSS_STAGE_START, H);
  ctx.strokeStyle = 'rgba(255, 45, 83, 0.16)'; ctx.lineWidth = 1;
  for (let x = BOSS_STAGE_START + 40; x < BOSS_STAGE_END; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 34, H); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255, 65, 95, 0.5)'; ctx.shadowColor = '#ff214b'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(BOSS_STAGE_START, 0); ctx.lineTo(BOSS_STAGE_START, 480); ctx.stroke(); ctx.restore();
  for (const s of solids) {
    ctx.fillStyle = '#05090e'; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.save(); ctx.shadowColor = s.x >= BOSS_STAGE_START ? '#ff4057' : C.cyan; ctx.shadowBlur = 10;
    ctx.fillStyle = s.x >= BOSS_STAGE_START ? '#ff4057' : C.cyan; ctx.fillRect(s.x, s.y, s.w, 2); ctx.restore();
  }
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 20px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(255,64,87,0.5)'; ctx.shadowColor = '#ff214b'; ctx.shadowBlur = 16;
  ctx.fillText('BACKGROUND INTERFERENCE // ONBOROID', (BOSS_STAGE_START + BOSS_STAGE_END) / 2, 58);
  ctx.restore();
}

function currentPlayerAnimation() {
  if (UI && UI.appeal > 0) return 'appeal';
  if (p.skillDash) return 'skill';
  if (p.downAttackTimer > 0) return 'downAttack';
  if (p.heavyTimer > 0) return 'heavy';
  if (p.atkTimer > 0) return 'attack';
  if (!p.onGround) return 'jump';
  if (Math.abs(p.vx) > 35 || getDir() !== 0) return 'run';
  return 'idle';
}

function drawPlayerSprite(animName) {
  const image = characterSprites[animName];
  const spec = CHARACTER_SPRITE_SPECS[animName];
  if (!image || !spec || !image.complete || !image.naturalWidth || !image.naturalHeight) return false;

  const frameRanges = spec.frameRanges || evenlySplitPlayerFrames(image, spec.fallbackFrames);
  const frameCount = frameRanges.length;
  if (!frameCount) return false;
  let elapsed = p.animTime || 0;
  if (animName === 'attack') elapsed = p.atkElapsed || 0;
  else if (animName === 'heavy') elapsed = p.heavyElapsed || 0;
  else if (animName === 'downAttack') elapsed = p.downAttackElapsed || 0;
  else if (animName === 'skill') elapsed = p.skillDash?.elapsed || 0;
  else if (animName === 'appeal') elapsed = Math.max(0, 1.2 - (UI.appeal || 0));
  else if (animName === 'jump') elapsed = p.jumpAnimTime || 0;

  let frame;
  if (animName === 'attack' && p.atkTimer > 0 && typeof ATTACKS !== 'undefined' && frameCount >= 3) {
    // ATTACK_ALLは3段コンボを各3コマに分けた9コマ素材。段ごとに対応する3コマを再生する。
    const stepIndex = Math.max(0, Math.min(2, (p.atkStep || 1) - 1));
    const framesPerStep = Math.max(1, Math.floor(frameCount / 3));
    const attack = ATTACKS[stepIndex];
    const progress = Math.max(0, Math.min(0.999, (p.atkElapsed || 0) / Math.max(0.01, attack?.dur || 0.25)));
    frame = stepIndex * framesPerStep + Math.min(framesPerStep - 1, Math.floor(progress * framesPerStep));
    frame = Math.min(frameCount - 1, frame);
  } else {
    frame = Math.floor(Math.max(0, elapsed) * spec.fps);
    frame = spec.loop ? frame % frameCount : Math.min(frameCount - 1, frame);
  }
  const [sx, ex] = frameRanges[frame] || frameRanges[frameCount - 1];
  const frameW = Math.max(1, ex - sx);
  const drawH = p.crouch ? 48 : 68;
  const drawW = frameW / image.naturalHeight * drawH;
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  ctx.save();
  ctx.translate(cx, bottom);
  ctx.scale(p.facing, 1);
  ctx.drawImage(image, sx, 0, frameW, image.naturalHeight,
    -drawW / 2, -drawH, drawW, drawH);
  ctx.restore();
  return true;
}

function drawDodgeTrail() {
  if (!p || !Array.isArray(p.dodgeTrail) || p.dodgeTrail.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ghost of p.dodgeTrail) {
    const lifeRatio = Math.max(0, Math.min(1, ghost.life / ghost.maxLife));
    if (lifeRatio <= 0) continue;
    ctx.save();
    ctx.globalAlpha = 0.42 * lifeRatio;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 13 * lifeRatio;
    const image = characterSprites[ghost.animName] || characterSprites.run;
    const spec = CHARACTER_SPRITE_SPECS[ghost.animName] || CHARACTER_SPRITE_SPECS.run;
    if (image && spec && image.complete && image.naturalWidth && image.naturalHeight) {
      const frameRanges = spec.frameRanges || evenlySplitPlayerFrames(image, spec.fallbackFrames);
      const frameCount = frameRanges.length;
      const elapsed = ghost.animName === 'jump' ? ghost.jumpAnimTime : ghost.animTime;
      let frame = Math.floor(Math.max(0, elapsed || 0) * spec.fps);
      frame = spec.loop ? frame % frameCount : Math.min(frameCount - 1, frame);
      const [sx, ex] = frameRanges[frame] || frameRanges[frameCount - 1];
      const frameW = Math.max(1, ex - sx);
      const drawH = ghost.crouch ? 48 : 68;
      const drawW = frameW / image.naturalHeight * drawH;
      const cx = ghost.x + ghost.w / 2;
      const bottom = ghost.y + ghost.h;
      ctx.translate(cx, bottom);
      ctx.scale(ghost.facing || 1, 1);
      ctx.drawImage(image, sx, 0, frameW, image.naturalHeight,
        -drawW / 2, -drawH, drawW, drawH);
    } else {
      // スプライトが未読込の場合も残像が見えるよう、シアンの輪郭シルエットを描く。
      const x = ghost.x, y = ghost.y, w = ghost.w, h = ghost.h;
      ctx.fillStyle = 'rgba(61,242,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, y + h * 0.25);
      ctx.lineTo(x + w * 0.5, y);
      ctx.lineTo(x + w * 0.82, y + h * 0.25);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer() {
  const f = p.facing, cx = p.x + p.w / 2, atk = p.atkTimer > 0 ? ATTACKS[p.atkStep - 1] : null;
  const sp = atk ? swingProgress(atk) : 0, bt = p.crouch ? 14 : 18;   // bt: 胴体の上端(しゃがみで低くなる)
  ctx.save();
  if (p.dodgeTimer > 0) ctx.globalAlpha = 0.35;
  else if (p.hurtTimer > 0 && UI.ult <= 0 && Math.floor(p.hurtTimer * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  if (atk) { const by = p.y + p.h; ctx.translate(cx, by); ctx.rotate(f * atk.lean * (sp > 0 ? 0.4 + 0.6 * sp : -0.4)); ctx.translate(-cx, -by); }   // 構え：振る前は後傾、振ると前傾
  else if (p.crouch) { const by = p.y + p.h; ctx.translate(cx, by); ctx.rotate(f * 0.14); ctx.translate(-cx, -by); }   // しゃがみ：やや前傾

  const animName = currentPlayerAnimation();
  const spriteDrawn = drawPlayerSprite(animName);
  if (!spriteDrawn) {
    // 対応するPNGがまだ用意されていない動作は、既存の仮キャラクターを表示する。
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 10; ctx.lineWidth = 2; ctx.strokeStyle = C.cyan; ctx.fillStyle = '#06121a';
    path([[p.x + 4, p.y + bt], [p.x + p.w - 4, p.y + bt], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]]); ctx.fill(); ctx.stroke();   // 体
    path([[cx, p.y], [cx + 9, p.y + 9], [cx, p.y + 17], [cx - 9, p.y + 9]]); ctx.fill(); ctx.stroke();                          // 頭
    ctx.strokeStyle = C.white; ctx.beginPath(); ctx.moveTo(cx, p.y + 8); ctx.lineTo(cx + f * 8, p.y + 8); ctx.stroke();        // バイザー
    const hx = cx + f * 12, hy = p.y + (p.crouch ? 22 : 34), up = UI.appeal > 0;                                                                  // 剣（アピール中は掲げる）
    let tx = hx + f * (up ? 4 : 24), ty = hy - (up ? 44 : 22);
    if (atk) { const an = atk.arc.from + (atk.arc.to - atk.arc.from) * sp; tx = hx + Math.cos(an) * f * 38; ty = hy + Math.sin(an) * 38; }   // 剣先を斬撃の弧に合わせる
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  }

  if (p.guardActive) {
    // キャラクターを包む円形のガードフィールド。脈動する二重円で防御中と分かりやすくする。
    const gy = p.y + p.h * 0.5;
    const pulse = 2.5 + Math.sin(UI.t * 9) * 2.0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(61,242,255,0.09)';
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, gy, 34 + pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.72; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, gy, 27 + pulse * 0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text('GUARD', cx, p.y - 9, 9, C.cyan, 'center', 5);
  }
  ctx.restore();
}

function currentEnemyAnimation(e) {
  if (!e.alive && e.deathTimer > 0) return 'death';
  if (e.attackTimer > 0 || e.attackAnimTimer > 0) return 'attack';
  if (!e.onGround) return 'jump';
  if (Math.abs(e.vx) > 30) return 'walk';
  return 'idle';
}

function drawEnemySprite(e, animName) {
  const image = enemyAnimationSprites[animName];
  const spec = ENEMY_ANIMATION_SPECS[animName];
  if (!image || !spec || !image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const frameW = spec.frameWidth || image.naturalWidth / Math.max(1, (image.detectedFrames || Math.round(image.naturalWidth / image.naturalHeight)));
  const frames = Math.max(1, Math.min(image.detectedFrames || spec.frames || Math.floor(image.naturalWidth / frameW), Math.floor(image.naturalWidth / frameW)));
  const elapsed = animName === 'death' ? (e.deathElapsed || 0) :
    animName === 'attack' ? (e.attackAnimElapsed || e.animTime || 0) : (e.animTime || 0);
  let frame = Math.floor(elapsed * spec.fps);
  frame = spec.loop ? frame % frames : Math.min(frames - 1, frame);
  const drawH = animName === 'death' ? 70 : 74;
  const drawW = frameW / image.naturalHeight * drawH;
  const cx = e.x + e.w / 2, bottom = e.y + e.h;
  ctx.save();
  if (e.hurtTimer > 0 && Math.floor(e.hurtTimer * 30) % 2 === 0) ctx.globalAlpha = 0.55;
  ctx.translate(cx, bottom);
  ctx.scale(e.dir || 1, 1);
  ctx.drawImage(image, frame * frameW, 0, frameW, image.naturalHeight, -drawW / 2, -drawH, drawW, drawH);
  ctx.restore();
  return true;
}

function drawEnemy(e) {
  if (!e.alive && e.deathTimer <= 0) return;
  const cx = e.x + e.w / 2;
  const typeColor = e.type === 'machinegun' ? '#49a7ff' : e.type === 'laser' ? '#c56bff' : C.orange;
  const hot = e.hurtTimer > 0;
  const animName = currentEnemyAnimation(e);
  const spriteDrawn = drawEnemySprite(e, animName);
  if (!spriteDrawn) {
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = hot ? '#fff' : typeColor; ctx.fillStyle = hot ? '#fff' : '#0b0d12';
    ctx.shadowColor = typeColor; ctx.shadowBlur = hot ? 18 : 7;
    path([[cx, e.y], [e.x + e.w, e.y + 16], [e.x + e.w - 6, e.y + e.h], [e.x + 6, e.y + e.h], [e.x, e.y + 16]]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = typeColor; ctx.shadowColor = typeColor; ctx.shadowBlur = 10;
    ctx.fillRect(cx + (e.dir || 1) * 8 - 5, e.y + 18, 10, 3);
    if (e.type === 'machinegun') { ctx.fillRect(cx + (e.dir || 1) * 17 - (e.dir < 0 ? 12 : 0), e.y + 28, 12, 4); }
    if (e.type === 'laser') { ctx.beginPath(); ctx.arc(cx + (e.dir || 1) * 8, e.y + 28, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // 遠距離レーザーのチャージ中は、狙っている方向を薄く表示する。
  if (e.alive && e.type === 'laser' && e.attackTimer > 0 && e.attackMode === 'laser') {
    const aimX = e.laserTargetX ?? (cx + (e.dir || 1) * 300);
    const aimY = e.laserTargetY ?? (e.y + e.h * 0.45);
    ctx.save(); ctx.globalAlpha = 0.24 + 0.18 * Math.sin((e.animTime || 0) * 26);
    ctx.strokeStyle = '#ff4f8b'; ctx.shadowColor = '#ff4f8b'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + (e.dir || 1) * 14, e.y + e.h * 0.44); ctx.lineTo(aimX, aimY); ctx.stroke(); ctx.restore();
  }

  // 生存中だけHPバーを表示。残量に応じて緑→黄→赤へ変化。
  if (e.alive) {
    const barW = 52, barH = 5, barX = cx - barW / 2, barY = e.y - 34;
    const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const hpColor = ratio <= 0.25 ? '#ff4057' : ratio <= 0.55 ? '#ffd34e' : '#55f28a';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = 'rgba(233,251,255,0.16)'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpColor; ctx.shadowColor = hpColor; ctx.shadowBlur = 5; ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.strokeStyle = 'rgba(233,251,255,0.65)'; ctx.lineWidth = 0.7; ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
    ctx.font = `700 7px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = typeColor; ctx.shadowBlur = 3; ctx.shadowColor = typeColor;
    ctx.fillText(e.type === 'machinegun' ? 'MG' : e.type === 'laser' ? 'LASER' : 'MELEE', cx, barY - 3);
    ctx.restore();
  }
}

function drawEnemyProjectiles() {
  if (!Array.isArray(enemyProjectiles) || enemyProjectiles.length === 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const projectile of enemyProjectiles) {
    const k = Math.max(0, projectile.life / projectile.maxLife);
    const isLaser = projectile.kind === 'laser';
    const len = isLaser ? 66 : 13;
    ctx.globalAlpha = Math.min(1, k * 1.7);
    ctx.strokeStyle = isLaser ? '#ff4f8b' : '#ffe21c';
    ctx.shadowColor = isLaser ? '#ff4f8b' : '#ffd400'; ctx.shadowBlur = isLaser ? 20 : 5;
    ctx.lineWidth = isLaser ? 9 : 1.35;
    ctx.beginPath(); ctx.moveTo(projectile.x - projectile.nx * len, projectile.y - projectile.ny * len); ctx.lineTo(projectile.x, projectile.y); ctx.stroke();
    ctx.strokeStyle = isLaser ? '#fff' : '#fff7a6'; ctx.shadowBlur = isLaser ? 7 : 2; ctx.lineWidth = isLaser ? 2.5 : 0.55;
    ctx.beginPath(); ctx.moveTo(projectile.x - projectile.nx * len * 0.85, projectile.y - projectile.ny * len * 0.85); ctx.lineTo(projectile.x, projectile.y); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemyExplosions() {
  if (!Array.isArray(effects)) return;
  for (const fx of effects) {
    if (fx.type !== 'enemyExplosion') continue;
    const progress = Math.max(0, Math.min(0.9999, 1 - fx.life / fx.maxLife));
    const variant = Math.max(0, Math.min(2, Number.isInteger(fx.variant) ? fx.variant : 2));
    const sprite = enemyExplosionSheets[variant] || enemyExplosionSheets[2];
    const spec = ENEMY_EXPLOSION_FRAME_SPECS[variant] || ENEMY_EXPLOSION_FRAME_SPECS[2];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (sprite && sprite.complete && sprite.naturalWidth >= spec.frameW && sprite.naturalHeight >= spec.frameH) {
      const frame = Math.min(spec.count - 1, Math.floor(progress * spec.count));
      const sx = (frame % spec.cols) * spec.frameW;
      const sy = Math.floor(frame / spec.cols) * spec.frameH;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(sprite, sx, sy, spec.frameW, spec.frameH,
        fx.x - spec.drawW / 2, fx.y - spec.drawH / 2, spec.drawW, spec.drawH);
    } else {
      // WebPが読み込めない場合のフォールバック。
      const radius = 12 + progress * (variant === 2 ? 48 : 58);
      const gradient = ctx.createRadialGradient(fx.x, fx.y, 2, fx.x, fx.y, radius);
      gradient.addColorStop(0, 'rgba(255,255,220,0.95)');
      gradient.addColorStop(0.3, 'rgba(255,135,30,0.75)');
      gradient.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// 攻撃の振り進行度(0〜1)。斬撃の弧と剣の動きで共通に使う
function swingProgress(a) {
  return Math.min(1, Math.max(0, (p.atkElapsed - (a.hitFrom - 0.04)) / (a.hitTo - a.hitFrom + 0.06)));
}

// 斬撃スプライトを指定位置に描く。透過済み画像なので黒い四角は表示されない
function drawSlashSprite(x, y, dir, step, progress, alpha = 1, sheet = slashSheet, angleOverride = null) {
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return false;
  const frame = Math.min(SLASH_FRAME_COUNT - 1, Math.max(0, Math.floor(progress * SLASH_FRAME_COUNT)));
  const sx = (frame % SLASH_COLUMNS) * SLASH_FRAME_SIZE;
  const sy = Math.floor(frame / SLASH_COLUMNS) * SLASH_FRAME_SIZE;
  const size = step === 3 ? 238 : step === 2 ? 212 : 190;
  const angle = Number.isFinite(angleOverride) ? angleOverride : (step === 2 ? -0.12 : step === 3 ? 0.1 : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.rotate(angle);
  ctx.globalAlpha *= alpha;
  ctx.shadowBlur = 0;
  ctx.drawImage(sheet, sx, sy, SLASH_FRAME_SIZE, SLASH_FRAME_SIZE,
    -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

// 長押し強攻撃の斬撃。素材自体は回転させず、キャラの前進に追従させる
function drawHeavySlash() {
  if (p.heavyTimer <= 0 || !spinSlashSheet.complete || !spinSlashSheet.naturalWidth) return;
  const progress = Math.max(0, Math.min(1, p.heavyElapsed / HEAVY_DURATION));
  const frame = Math.min(ABILITY_FRAME.spinCount - 1, Math.floor(progress * ABILITY_FRAME.spinCount));
  const sx = (frame % ABILITY_FRAME.spinCols) * ABILITY_FRAME.spinW;
  const sy = Math.floor(frame / ABILITY_FRAME.spinCols) * ABILITY_FRAME.spinH;
  const cx = p.x + p.w / 2 + p.heavyDir * 4, cy = p.y + p.h - 7;
  const fade = Math.min(1, progress * 7, (1 - progress) * 7);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(p.heavyDir, 1); ctx.globalAlpha = Math.max(0, fade);
  const effectW = Math.min(316, Math.max(170, W * 0.72)), effectH = effectW * 136 / 316;
  ctx.drawImage(spinSlashSheet, sx, sy, ABILITY_FRAME.spinW, ABILITY_FRAME.spinH, -effectW / 2, -effectH / 2, effectW, effectH);
  ctx.restore();
}

// 通常攻撃の斬撃。攻撃段階に合わせて素材の再生サイズと向きを変える
function drawSlash() {
  if (p.atkTimer <= 0) return;
  const a = ATTACKS[p.atkStep - 1];
  const progress = Math.min(1, Math.max(0, p.atkElapsed / a.dur));
  const x = p.x + p.w / 2 + p.facing * 28;
  const y = p.y + p.h * 0.48;
  if (drawSlashSprite(x, y, p.facing, p.atkStep, progress, 1, comboSlashSheets[p.atkStep])) return;

  // 画像の読み込み中だけ、元の弧で斬撃を表示する
  const r = a.arc, sp = swingProgress(a);
  if (sp <= 0) return;
  const cur = r.from + (r.to - r.from) * sp;
  ctx.save(); ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.scale(p.facing, 1); ctx.lineCap = 'round';
  ctx.shadowBlur = 16; ctx.shadowColor = r.col;
  for (let i = 0; i < 3; i++) {
    const tail = r.from + (cur - r.from) * i * 0.25;
    ctx.globalAlpha = 0.35 + i * 0.3; ctx.strokeStyle = i === 2 ? C.white : r.col;
    ctx.lineWidth = Math.max(1, r.w - i * (r.w > 6 ? 2 : 1));
    ctx.beginPath(); ctx.arc(0, 0, r.r + i * 3, Math.min(tail, cur), Math.max(tail, cur)); ctx.stroke();
  }
  ctx.restore();
}

// ダメージ数値・火花・衝撃波・アピール演出（ワールド座標）
function drawEffects() {
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowBlur = 12;
  drawLockOn();
  drawLockOn2();
  for (const f of UI.fx) {
    const k = f.life / f.max; ctx.globalAlpha = k;
    if (f.skillLine) {
      ctx.save(); ctx.globalAlpha = k; ctx.lineCap = 'round';
      ctx.shadowColor = '#168cff'; ctx.shadowBlur = 22; ctx.strokeStyle = '#168cff'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 14; ctx.strokeStyle = C.cyan; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = C.white; ctx.shadowBlur = 8; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.restore();
      continue;
    }
    if (f.skillSlash) {
      const progress = 1 - k;
      if (skillSlashSheet.complete && skillSlashSheet.naturalWidth) {
        const frame = Math.min(SKILL_SLASH_FRAME.count - 1, Math.floor(progress * SKILL_SLASH_FRAME.count));
        const sx = (frame % SKILL_SLASH_FRAME.cols) * SKILL_SLASH_FRAME.w;
        const sy = Math.floor(frame / SKILL_SLASH_FRAME.cols) * SKILL_SLASH_FRAME.h;
        const effectSize = 190 + 18 * progress;
        ctx.save(); ctx.globalAlpha = k; ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(skillSlashSheet, sx, sy, SKILL_SLASH_FRAME.w, SKILL_SLASH_FRAME.h,
          f.x - effectSize / 2, f.y - effectSize / 2, effectSize, effectSize);
        ctx.restore();
      } else {
        const reach = 15 + 38 * progress;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir || 1, 1); ctx.globalAlpha = k;
        ctx.lineCap = 'round'; ctx.shadowColor = '#168cff'; ctx.shadowBlur = 26;
        ctx.strokeStyle = '#168cff'; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(-reach, -reach * 0.78); ctx.lineTo(reach, reach * 0.78);
        ctx.moveTo(-reach, reach * 0.78); ctx.lineTo(reach, -reach * 0.78); ctx.stroke();
        ctx.shadowColor = C.cyan; ctx.shadowBlur = 18; ctx.strokeStyle = C.cyan; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-reach, -reach * 0.78); ctx.lineTo(reach, reach * 0.78);
        ctx.moveTo(-reach, reach * 0.78); ctx.lineTo(reach, -reach * 0.78); ctx.stroke();
        ctx.shadowColor = C.white; ctx.shadowBlur = 10; ctx.strokeStyle = C.white; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-reach * 0.82, -reach * 0.64); ctx.lineTo(reach * 0.82, reach * 0.64);
        ctx.moveTo(-reach * 0.82, reach * 0.64); ctx.lineTo(reach * 0.82, -reach * 0.64); ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    if (f.slash) {
      const progress = 1 - k;
      if (!drawSlashSprite(f.x, f.y, f.dir || 1, f.step || 2, progress)) {
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - (f.dir || 1) * 170, f.y); ctx.stroke();
      }
      continue;
    }
    ctx.shadowColor = f.col || C.cyan; ctx.strokeStyle = f.col || C.cyan; ctx.beginPath();
    if (f.ring) { ctx.lineWidth = 1 + 3 * k; ctx.arc(f.x, f.y, f.r * (1 - k * k), 0, 6.283); }
    else if (f.burst) {
      ctx.lineWidth = 2; const L = f.size * (1.2 - k * 0.6);
      for (let i = 0; i < 3; i++) { const an = i * 1.05 + 0.3; ctx.moveTo(f.x - Math.cos(an) * L, f.y - Math.sin(an) * L); ctx.lineTo(f.x + Math.cos(an) * L, f.y + Math.sin(an) * L); }
    }
    else if (f.line) { ctx.lineWidth = 3; ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.dir * 170, f.y); }
    else { ctx.lineWidth = 2; ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.04, f.y - f.vy * 0.04); }
    ctx.stroke();
  }
  if (UI.appeal > 0) {
    const t = 1 - UI.appeal / 1.2, cx = p.x + p.w / 2, fy = p.y + p.h;
    ctx.globalAlpha = 1 - t; ctx.strokeStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, fy, 20 + 70 * t, 6 + 10 * t, 0, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 16, fy); ctx.lineTo(cx - 16, fy - 20 - 70 * t); ctx.moveTo(cx + 16, fy); ctx.lineTo(cx + 16, fy - 20 - 70 * t); ctx.stroke();
    text(UI.appealText, cx, p.y - 26 - 10 * t, 18, C.white, 'center', 10);
  }
  for (const f of UI.texts) { ctx.globalAlpha = Math.min(1, f.life / 0.3); text(String(f.txt), f.x, f.y, f.size, f.col, 'center', 8); }
  ctx.restore();
}

// ================= HUD（画面座標） =================
function icon(kind, x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
  if (kind === 'atk') { ctx.moveTo(-14, 14); ctx.lineTo(14, -14); ctx.moveTo(-16, -4); ctx.quadraticCurveTo(-4, -18, 12, -8); }
  if (kind === 'ult') { ctx.arc(0, 0, 15, 0, 6.283); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath(); }
  if (kind === 'skill') { ctx.moveTo(-14, -10); ctx.lineTo(-4, 0); ctx.lineTo(-14, 10); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.moveTo(15, -12); ctx.lineTo(15, 12); }
  ctx.stroke(); ctx.restore();
}

// 操作スロット：クールダウン中は暗く＋残り秒数、使用可能になると発光
function slot(x, y, key, name, kind, cd, max, col, anim) {
  const s = 68, ready = cd <= 0, pulse = 0.5 + 0.5 * Math.sin(UI.t * 6);
  ctx.save();
  chamfer(x, y, s, s, 12); ctx.fillStyle = 'rgba(3,8,12,0.85)'; ctx.fill();
  ctx.strokeStyle = ready ? col : 'rgba(233,251,255,0.3)'; ctx.lineWidth = ready ? 2 : 1;
  ctx.shadowColor = col; ctx.shadowBlur = ready ? (anim ? 6 + 12 * pulse : 8) : 0; ctx.stroke(); ctx.shadowBlur = 0;
  icon(kind, x + s / 2, y + s / 2 - 2, ready ? col : DIM);
  if (!ready) {
    ctx.save(); chamfer(x, y, s, s, 12); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, s, s * cd / max); ctx.restore();
    text(cd.toFixed(1), x + s / 2, y + s / 2 + 7, 20, C.white, 'center');
  }
  text(key, x + 9, y + 17, 11, ready ? C.white : DIM);
  text(name, x + s / 2, y + s + 16, 12, ready ? col : DIM, 'center');
  ctx.restore();
}

function drawSkillDashEffect() {
  const dash = p && p.skillDash;
  if (!dash) return;
  const endX = p.x + p.w / 2;
  const y = dash.centerY;
  const length = Math.abs(endX - dash.startCenterX);
  const progress = dash.duration > 0 ? Math.min(1, dash.elapsed / dash.duration) : 1;

  // アップロードされた「直線エフェクト.mp4」から作成した青い光跡を再生。
  if (skillDashSheet.complete && skillDashSheet.naturalWidth) {
    const frame = Math.min(SKILL_DASH_FRAME.count - 1, Math.floor(progress * SKILL_DASH_FRAME.count));
    const sx = (frame % SKILL_DASH_FRAME.cols) * SKILL_DASH_FRAME.w;
    const sy = Math.floor(frame / SKILL_DASH_FRAME.cols) * SKILL_DASH_FRAME.h;
    const effectW = Math.min(520, Math.max(320, length + 160));
    const effectH = effectW * SKILL_DASH_FRAME.h / SKILL_DASH_FRAME.w;
    ctx.save(); ctx.translate(endX, y); ctx.scale(dash.dir, 1);
    ctx.globalAlpha = 0.92; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(skillDashSheet, sx, sy, SKILL_DASH_FRAME.w, SKILL_DASH_FRAME.h,
      -effectW / 2, -effectH / 2, effectW, effectH);
    ctx.restore();
  }

  if (length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.62;
  ctx.shadowColor = '#148cff'; ctx.shadowBlur = 20;
  ctx.strokeStyle = '#168cff'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(dash.startCenterX, y); ctx.lineTo(endX, y); ctx.stroke();
  ctx.shadowColor = C.cyan; ctx.shadowBlur = 12;
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(dash.startCenterX, y); ctx.lineTo(endX, y); ctx.stroke();
  ctx.shadowBlur = 6; ctx.strokeStyle = C.white; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(dash.startCenterX, y); ctx.lineTo(endX, y); ctx.stroke();

  const tickCount = Math.min(9, Math.floor(length / 24));
  ctx.globalAlpha = 0.48;
  ctx.strokeStyle = C.white; ctx.lineWidth = 1.2;
  for (let i = 1; i <= tickCount; i++) {
    const ratio = i / (tickCount + 1);
    const x = dash.startCenterX + (endX - dash.startCenterX) * ratio;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x - dash.dir * 12, y + 7); ctx.stroke();
  }
  ctx.restore();
}

function drawLockOn() {
  const f = UI.lockOn;
  if (!f || f.phase !== 'lock' || !f.target || !lockOnSheet.complete || !lockOnSheet.naturalWidth) return;
  const progress = Math.max(0, Math.min(1, 1 - f.life / f.max));
  const frame = Math.min(ABILITY_FRAME.lockCount - 1, Math.floor(progress * ABILITY_FRAME.lockCount));
  const sx = (frame % ABILITY_FRAME.lockCols) * ABILITY_FRAME.lockW;
  const sy = Math.floor(frame / ABILITY_FRAME.lockCols) * ABILITY_FRAME.lockH;
  const tx = f.target.x + f.target.w / 2, ty = f.target.y + f.target.h / 2;
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.sin(progress * Math.PI * 2) * 0.025); ctx.globalAlpha = 0.96;
  ctx.drawImage(lockOnSheet, sx, sy, ABILITY_FRAME.lockW, ABILITY_FRAME.lockH, -82, -82, 164, 164);
  ctx.restore();
}

// ロックオン完了後の着弾演出。動画から黒背景を抜いたスプライトを敵の位置に重ねる。
function drawLockOn2() {
  const f = UI.lockOn;
  if (!f || f.phase !== 'strike' || !f.target || !lockOn2Sheet.complete || !lockOn2Sheet.naturalWidth) return;
  const progress = Math.max(0, Math.min(1, f.strikeElapsed / f.strikeDuration));
  const frame = Math.min(ABILITY_FRAME.lock2Count - 1, Math.floor(progress * ABILITY_FRAME.lock2Count));
  const sx = (frame % ABILITY_FRAME.lock2Cols) * ABILITY_FRAME.lock2W;
  const sy = Math.floor(frame / ABILITY_FRAME.lock2Cols) * ABILITY_FRAME.lock2H;
  const tx = f.target.x + f.target.w / 2;
  const ty = f.target.y + f.target.h * 0.55;
  const effectW = Math.min(470, Math.max(300, W * 0.48));
  const effectH = effectW * ABILITY_FRAME.lock2H / ABILITY_FRAME.lock2W;
  const fadeIn = Math.min(1, progress * 10);
  const fadeOut = Math.min(1, (1 - progress) * 5);
  ctx.save();
  ctx.globalAlpha = 0.94 * fadeIn * fadeOut;
  ctx.drawImage(lockOn2Sheet, sx, sy, ABILITY_FRAME.lock2W, ABILITY_FRAME.lock2H,
    tx - effectW / 2, ty - effectH * 0.8, effectW, effectH);
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  if (UI.flash > 0 && Settings.flash) { ctx.fillStyle = `rgba(233,251,255,${UI.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (UI.hurt > 0) {                                   // 被弾時：画面の縁だけオレンジ
    const g = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
    g.addColorStop(0, 'rgba(255,138,31,0)'); g.addColorStop(1, `rgba(255,138,31,${0.4 * UI.hurt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // --- 左上：HPゲージ ---
  const hp = p.hp / p.maxHp, gh = UI.ghost / p.maxHp, low = hp < 0.3, gx = 22, gy = 36, gw = Math.min(312, Math.max(112, W * 0.56));
  const pts = [[gx + 12, gy], [gx + gw, gy], [gx + gw - 12, gy + 14], [gx, gy + 14]];
  text('AYA-07', 30, 28, 13, C.cyan, 'left', 6);
  ctx.save(); path(pts); ctx.fillStyle = 'rgba(3,8,12,0.8)'; ctx.fill(); ctx.clip();
  ctx.fillStyle = C.orange; ctx.fillRect(gx, gy, gw * gh, 14);           // 被ダメージの残像
  const g = ctx.createLinearGradient(gx, 0, gx + gw, 0); g.addColorStop(0, C.white); g.addColorStop(1, low ? C.orange : C.cyan);
  ctx.fillStyle = g; ctx.fillRect(gx, gy, gw * hp, 14);
  ctx.fillStyle = 'rgba(2,4,8,0.55)'; for (let i = 1; i < 10; i++) ctx.fillRect(gx + gw * i / 10, gy, 1, 14);
  ctx.restore();
  path(pts); ctx.strokeStyle = low ? C.orange : C.cyan; ctx.lineWidth = 1; ctx.stroke();
  text(String(p.hp).padStart(3, '0'), 24, 78, 26, low ? C.orange : C.white, 'left', 8);
  text('/ ' + p.maxHp, 92, 78, 13, DIM);

  // --- HPの下：スキルと必殺技で使うエネルギーゲージ ---
  const egx = 22, egy = 88, egw = gw, egh = 8;
  ctx.fillStyle = 'rgba(3,8,12,0.9)'; ctx.fillRect(egx, egy, egw, egh);
  const energyRatio = Math.max(0, Math.min(1, UI.energy / ENERGY_MAX));
  const energyGrad = ctx.createLinearGradient(egx, 0, egx + egw, 0);
  energyGrad.addColorStop(0, UI.energyFlash > 0 ? C.white : C.cyan);
  energyGrad.addColorStop(1, UI.energy >= ABILITY_COST.q ? C.orange : C.cyan);
  ctx.fillStyle = energyGrad;
  ctx.shadowColor = UI.energyFlash > 0 ? C.cyan : 'transparent';
  ctx.shadowBlur = UI.energyFlash > 0 ? 10 : 0;
  ctx.fillRect(egx, egy, egw * energyRatio, egh); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(61,242,255,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(egx + 0.5, egy + 0.5, egw - 1, egh - 1);
  for (let i = 1; i < 10; i++) { ctx.fillStyle = 'rgba(2,4,8,0.55)'; ctx.fillRect(egx + egw * i / 10, egy, 1, egh); }
  text('ENERGY', 24, 112, 10, C.cyan, 'left', 3);
  if (W < 600) text(`${Math.floor(UI.energy)} / ${ENERGY_MAX}`, W - 14, 112, 10, UI.energy >= ABILITY_COST.q ? C.orange : C.white, 'right');
  else text(`${Math.floor(UI.energy)} / ${ENERGY_MAX}   ${keyCodeLabelForUI(Settings.keybinds.skill)}: ${ABILITY_COST.e}   ${keyCodeLabelForUI(Settings.keybinds.ult)}: ${ABILITY_COST.q}`, 334, 112, 10, UI.energy >= ABILITY_COST.q ? C.orange : C.white, 'right');

  // --- 右側：戦闘情報 ---
  const rx = W - 30;
  ctx.fillStyle = 'rgba(61,242,255,0.3)'; ctx.fillRect(rx + 14, 150, 1, 250);
  if (UI.combo > 0) {
    const hot = UI.combo >= 5;
    const energyMult = UI.energyMultiplier();
    const multColor = energyMult >= 2.5 ? C.orange : energyMult >= 1.5 ? C.cyan : DIM;
    text('COMBO', rx, 170, 12, C.cyan, 'right');
    text(String(UI.combo), rx, 226, 52 + UI.pop * 18, hot ? C.orange : C.white, 'right', hot ? 18 : 8);
    const w = 120 * UI.comboTimer / 2.2; ctx.fillStyle = hot ? C.orange : C.cyan; ctx.fillRect(rx - w, 238, w, 2);
    text(`ENERGY x${energyMult.toFixed(energyMult % 1 ? 1 : 0)}`, rx, 258, 10, multColor, 'right', energyMult >= 2 ? 4 : 0);
  }
  text('KILLS', rx, 300, 12, C.cyan, 'right'); text(String(UI.kills), rx, 330, 28, C.white, 'right');
  text('MAX COMBO', rx, 362, 12, C.cyan, 'right'); text(String(UI.maxCombo), rx, 392, 28, C.white, 'right');

  // --- 中央下：3分割の回避チャージゲージ ---
  const dodgeCharges = Math.max(0, Math.min(DODGE_MAX_CHARGES, p.dodgeCharges || 0));
  const dodgeSegmentW = W < 360 ? 19 : W < 600 ? 23 : 28;
  const dodgeSegmentH = 9, dodgeGap = 4;
  const dodgeGaugeW = dodgeSegmentW * DODGE_MAX_CHARGES + dodgeGap * (DODGE_MAX_CHARGES - 1);
  const dodgeGaugeX = (W - dodgeGaugeW) / 2, dodgeGaugeY = H - 78;
  const dodgeProgress = dodgeCharges < DODGE_MAX_CHARGES
    ? Math.max(0, Math.min(1, (p.dodgeRechargeTimer || 0) / DODGE_RECHARGE_TIME)) : 0;
  text('DODGE', W / 2, dodgeGaugeY - 8, 9, dodgeCharges > 0 ? C.cyan : C.orange, 'center', 3);
  for (let i = 0; i < DODGE_MAX_CHARGES; i++) {
    const sx = dodgeGaugeX + i * (dodgeSegmentW + dodgeGap);
    const filled = i < dodgeCharges;
    const partial = !filled && i === dodgeCharges ? dodgeProgress : 0;
    ctx.fillStyle = 'rgba(3,8,12,0.88)';
    ctx.fillRect(sx, dodgeGaugeY, dodgeSegmentW, dodgeSegmentH);
    if (filled || partial > 0) {
      ctx.save();
      ctx.shadowColor = C.cyan; ctx.shadowBlur = filled ? 8 : 4;
      ctx.fillStyle = filled ? C.cyan : 'rgba(61,242,255,0.72)';
      ctx.fillRect(sx + 2, dodgeGaugeY + 2, Math.max(0, (dodgeSegmentW - 4) * (filled ? 1 : partial)), dodgeSegmentH - 4);
      ctx.restore();
    }
    ctx.strokeStyle = filled ? 'rgba(61,242,255,0.95)' : 'rgba(233,251,255,0.34)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, dodgeGaugeY + 0.5, dodgeSegmentW - 1, dodgeSegmentH - 1);
  }
  // ボス戦中は回避ゲージの直下に長い赤色HPバーを表示する。
  const bossHud = window.BossHUD;
  if (bossHud && bossHud.active) {
    const barW = Math.min(620, Math.max(150, W * 0.62));
    const barX = (W - barW) / 2, barY = H - 54, barH = 9;
    const ratio = Math.max(0, Math.min(1, bossHud.hp / Math.max(1, bossHud.maxHp)));
    text(`${bossHud.name || 'オンボロイド'}  //  BOSS HP`, W / 2, barY - 5, W < 420 ? 8 : 10, '#ff596d', 'center', 4);
    ctx.fillStyle = 'rgba(12,2,6,0.94)'; ctx.fillRect(barX - 3, barY - 2, barW + 6, barH + 4);
    ctx.fillStyle = 'rgba(255,45,75,0.20)'; ctx.fillRect(barX, barY, barW, barH);
    ctx.save(); ctx.shadowColor = '#ff214b'; ctx.shadowBlur = 9; ctx.fillStyle = '#f52345'; ctx.fillRect(barX, barY, barW * ratio, barH); ctx.restore();
    ctx.strokeStyle = 'rgba(255,130,145,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
    text(`${Math.ceil(bossHud.hp)} / ${bossHud.maxHp}`, W / 2, barY + barH + 13, 8, '#ffd5da', 'center', 2);
  }
  if (respawnTimer >= 0) {
    text('HOSTILES REBOOTING', W / 2, 240, 14, C.cyan, 'center', 5);
    text(`${Math.max(0, respawnTimer).toFixed(1)}s`, W / 2, 264, 18, C.white, 'center', 6);
  }
  // 広い画面だけキーボード操作を表示し、スマホでは操作ボタンに場所を譲る
  if (W >= 700 && !window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    const helpLeft = `CLICK / ${keyCodeLabelForUI(Settings.keybinds.attack)} 攻撃　長押し:強攻撃　${keyCodeLabelForUI(Settings.keybinds.ult)} 必殺　${keyCodeLabelForUI(Settings.keybinds.skill)} スキル`;
    const helpRight = `${keyCodeLabelForUI(Settings.keybinds.jump)} ジャンプ　${keyCodeLabelForUI(Settings.keybinds.guard)} ガード / パリィ　${keyCodeLabelForUI(Settings.keybinds.dodge)} 回避　${keyCodeLabelForUI(Settings.keybinds.inventory)} 所持品`;
    if (W >= 1050) {
      textFit(helpLeft, 28, H - 18, 10, DIM, 'left', W * 0.48, 7);
      textFit(helpRight, W - 28, H - 18, 10, DIM, 'right', W * 0.48, 7);
    } else {
      textFit(`${helpLeft}　|　${helpRight}`, W / 2, H - 12, 9, DIM, 'center', W - 32, 6.5);
    }
  }
  ctx.restore();
  if (UI.overlay === 'inventory') drawInventory(); else if (UI.overlay === 'intro') drawIntro();
}

// ================= オーバーレイ（インベントリ・イントロ） =================
function panelBase(title, sub) {
  ctx.fillStyle = 'rgba(2,4,8,0.9)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(61,242,255,0.06)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  text(title, 48, 62, 28, C.white, 'left', 10); text(sub, W - 48, 62, 12, C.cyan, 'right');
  ctx.fillStyle = C.cyan; ctx.fillRect(48, 76, W - 96, 1); ctx.fillRect(48, 75, 120, 3);
}

// アイテムの種類ごとの小さな図柄（剣・菱形・盾形）
function invIcon(cat, x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if (cat === 'WEAPON') { ctx.moveTo(-13, 13); ctx.lineTo(13, -13); ctx.moveTo(-9, 3); ctx.lineTo(-3, 9); }
  else if (cat === 'ITEM') { ctx.moveTo(0, -12); ctx.lineTo(11, 0); ctx.lineTo(0, 12); ctx.lineTo(-11, 0); ctx.closePath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); }
  else { ctx.moveTo(-11, -10); ctx.lineTo(11, -10); ctx.lineTo(11, 2); ctx.lineTo(0, 13); ctx.lineTo(-11, 2); ctx.closePath(); }
  ctx.stroke(); ctx.restore();
}


// スマホではアイテムを小さな一覧にして、選択した説明と装備を下に表示する
function drawInventoryCompact() {
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,8,0.96)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(61,242,255,0.08)'; ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  text('INVENTORY', 12, 28, 16, C.white, 'left', 5);
  text(`${INV.length} / ${INV_COLS * INV_ROWS}`, W - 12, 28, 10, C.cyan, 'right');
  text(`吸収オーブ ${UI.orbsAbsorbed || 0}`, W / 2, 28, 9, C.cyan, 'center');
  text('タップで選択・同じマスを再タップで装備', W / 2, 44, 7, DIM, 'center');

  UI.hits = [];
  const cols = 5, cell = 32, gap = 4, step = cell + gap;
  const gridW = cols * cell + (cols - 1) * gap, left = Math.round((W - gridW) / 2), top = 52;
  for (let i = 0; i < INV_COLS * INV_ROWS; i++) {
    const x = left + (i % cols) * step, y = top + Math.floor(i / cols) * 36;
    const it = INV[i], on = i === UI.sel, eq = it && it.slot && UI.equipped[it.slot] === i;
    UI.hits.push({ x, y, w: cell, h: cell, i });
    chamfer(x, y, cell, cell, 5);
    ctx.fillStyle = on ? 'rgba(61,242,255,0.18)' : it ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.015)'; ctx.fill();
    ctx.strokeStyle = on ? C.cyan : it ? 'rgba(233,251,255,0.32)' : 'rgba(233,251,255,0.12)'; ctx.lineWidth = on ? 1.5 : 1;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = on ? 8 : 0; ctx.stroke(); ctx.shadowBlur = 0;
    if (!it) continue;
    invIcon(it.cat, x + cell / 2, y + cell / 2, on ? C.white : eq ? C.cyan : 'rgba(233,251,255,0.75)');
    if (eq) { ctx.fillStyle = C.cyan; ctx.fillRect(x + cell - 10, y + 3, 7, 7); }
  }

  const selected = INV[UI.sel];
  ctx.strokeStyle = 'rgba(61,242,255,0.35)'; ctx.strokeRect(10, 310, W - 20, 102);
  if (selected) {
    text(selected.cat, 16, 324, 8, C.cyan);
    textFit(selected.name, 16, 340, 12, C.white, 'left', W - 32, 7, 3);
    selected.lines.slice(0, 2).forEach((line, i) => textFit(line, 16, 355 + i * 13, 8, 'rgba(233,251,255,0.82)', 'left', W - 32, 6));
    textFit(selected.stat, 16, 386, 9, C.cyan, 'left', W - 32, 6);
    if (selected.slot) text(UI.equipped[selected.slot] === UI.sel ? '装備中' : '同じマスをもう一度タップで装備', W - 14, 400, 7, DIM, 'right');
  } else text('空きスロット', 16, 340, 10, DIM);

  text('EQUIPMENT', 12, 430, 9, C.cyan);
  const slotCount = SLOTS.length, boxGap = 4, boxW = (W - 24 - boxGap * (slotCount - 1)) / slotCount, boxY = 438, boxH = 64;
  SLOTS.forEach((slot, i) => {
    const x = 12 + i * (boxW + boxGap), name = INV[UI.equipped[slot]].name;
    chamfer(x, boxY, boxW, boxH, 5); ctx.strokeStyle = 'rgba(61,242,255,0.38)'; ctx.lineWidth = 1; ctx.stroke();
    text(slot, x + 5, boxY + 15, 7, C.cyan);
    const words = name.split(' ');
    text(words[0], x + 5, boxY + 31, 7, C.white);
    text(words.slice(1).join(' '), x + 5, boxY + 43, 7, C.white);
  });
  ctx.restore();
}

function drawInventory() {
  if (W < 900) { drawInventoryCompact(); return; }
  ctx.save();
  panelBase('INVENTORY', 'TAB / ESC 閉じる　矢印 / WASD 選択　ENTER 装備');
  UI.hits = [];
  text(`ITEMS ${INV.length} / ${INV_COLS * INV_ROWS}`, INV_X, 98, 11, C.cyan);
  text(`ENERGY ORBS ABSORBED  ${UI.orbsAbsorbed || 0}`, W - 48, 98, 11, C.cyan, 'right');
  for (let i = 0; i < INV_COLS * INV_ROWS; i++) {            // 左：8×4のマス
    const x = INV_X + (i % INV_COLS) * (INV_CELL + INV_GAP), y = INV_Y + Math.floor(i / INV_COLS) * (INV_CELL + INV_GAP);
    const it = INV[i], on = i === UI.sel, eq = it && it.slot && UI.equipped[it.slot] === i;
    UI.hits.push({ x, y, w: INV_CELL, h: INV_CELL, i });
    chamfer(x, y, INV_CELL, INV_CELL, 8);
    ctx.fillStyle = on ? 'rgba(61,242,255,0.14)' : it ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.015)'; ctx.fill();
    ctx.strokeStyle = on ? C.cyan : it ? 'rgba(233,251,255,0.35)' : 'rgba(233,251,255,0.12)'; ctx.lineWidth = on ? 2 : 1;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = on ? 14 : 0; ctx.stroke(); ctx.shadowBlur = 0;
    if (!it) continue;
    invIcon(it.cat, x + INV_CELL / 2, y + INV_CELL / 2 + 2, on ? C.white : eq ? C.cyan : 'rgba(233,251,255,0.75)');
    if (eq) { ctx.fillStyle = C.cyan; ctx.fillRect(x + INV_CELL - 17, y + 5, 12, 12); text('E', x + INV_CELL - 11, y + 15, 10, '#02060a', 'center'); }   // 装備中の印
  }
  const sel = INV[UI.sel];
  text('EQUIPMENT', INV_X, 376, 11, C.cyan);                 // 左下：装備枠（選んだアイテムの枠は光る）
  SLOTS.forEach((s, i) => {
    const x = INV_X + i * 126, y = 386, name = INV[UI.equipped[s]].name, [l1, ...rest] = name.split(' ');
    chamfer(x, y, 112, 68, 10); ctx.strokeStyle = sel && sel.slot === s ? C.cyan : 'rgba(233,251,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    text(s, x + 12, y + 22, 11, C.cyan);
    ctx.font = `500 12px ${FONT}`;
    if (ctx.measureText(name).width <= 88) text(name, x + 12, y + 48, 12, C.white);                       // 1行に収まる名前はそのまま
    else { text(l1, x + 12, y + 41, 12, C.white); text(rest.join(' '), x + 12, y + 57, 12, C.white); }    // 長い名前は2行に分ける
  });
  const dx = 572;                                            // 右：選んでいるマスの説明
  chamfer(dx, INV_Y, 340, 346, 14); ctx.strokeStyle = C.cyan; ctx.lineWidth = 1; ctx.stroke();
  text(`SLOT ${String(UI.sel + 1).padStart(2, '0')} / ${INV_COLS * INV_ROWS}`, dx + 322, INV_Y + 26, 11, DIM, 'right');
  if (sel) {
    text(sel.cat, dx + 20, INV_Y + 26, 12, C.cyan); textFit(sel.name, dx + 20, INV_Y + 60, 20, C.white, 'left', 300, 9, 8);
    ctx.fillStyle = C.cyan; ctx.fillRect(dx + 20, INV_Y + 76, 300, 1);
    sel.lines.forEach((l, k) => textFit(l, dx + 20, INV_Y + 110 + k * 26, 14, 'rgba(233,251,255,0.85)', 'left', 300, 8));
    textFit(sel.stat, dx + 20, INV_Y + 250, 14, C.cyan, 'left', 300, 8);
    if (sel.slot) text(UI.equipped[sel.slot] === UI.sel ? 'EQUIPPED' : 'ENTER / クリックで装備', dx + 20, INV_Y + 320, 12, UI.equipped[sel.slot] === UI.sel ? C.white : DIM);
  } else {
    text('EMPTY', dx + 20, INV_Y + 60, 20, DIM); text('空きスロット', dx + 20, INV_Y + 110, 14, DIM);
  }
  ctx.restore();
}


// スマホ用の操作説明は一列に並べ、画面内で読める大きさにする
function drawIntroCompact() {
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,8,0.97)'; ctx.fillRect(0, 0, W, H);
  text('NULL HORIZON', W / 2, 51, 17, C.white, 'center', 6);
  text('ヌル・ホライゾン', W / 2, 69, 9, C.cyan, 'center');
  text('敵を倒して先へ進め。攻撃でENERGYがたまる。', W / 2, 88, 8, 'rgba(233,251,255,0.8)', 'center');
  const keys = currentControls();
  const rows = keys.map(([key, description]) => [key, description]);
  rows.forEach(([key, description], i) => {
    const y = 112 + i * 31;
    chamfer(12, y - 16, 62, 26, 5); ctx.strokeStyle = 'rgba(61,242,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    textFit(key, 43, y + 1, 8, C.cyan, 'center', 56, 5.5);
    textFit(description, 82, y + 1, 8, C.white, 'left', Math.max(20, W - 96), 5.5);
  });
  text('INFOボタンで閉じる', W / 2, H - 18, 8, DIM, 'center');
  ctx.restore();
}

function drawIntro() {
  if (W < 900) { drawIntroCompact(); return; }
  ctx.save();
  panelBase('', 'F / ESC 閉じる');
  ctx.letterSpacing = '10px'; text('NULL HORIZON', W / 2, 168, 58, C.white, 'center', 12 + 10 * Math.sin(UI.t * 2));
  ctx.letterSpacing = '4px'; text('ヌル・ホライゾン', W / 2, 202, 16, C.cyan, 'center'); ctx.letterSpacing = '0px';
  const sw = 480 * ((UI.t * 0.4) % 1);                       // 細い走査ライン
  ctx.fillStyle = 'rgba(61,242,255,0.5)'; ctx.fillRect(W / 2 - sw, 222, sw * 2, 1);
  ['西暦2187年。都市〈メリディアン〉は沈黙し、地下の「虚層」だけが光を放っている。',
    'あなたは最後の起動個体〈AYA-07〉。侵入者を斬り払い、最深部をめざせ。']
    .forEach((l, i) => text(l, W / 2, 256 + i * 26, 15, 'rgba(233,251,255,0.85)', 'center'));
  const controls = currentControls();
  const controlSplit = Math.ceil(controls.length / 2);
  controls.forEach(([k, d], i) => {
    const col = i < controlSplit ? 0 : 1;
    const row = i < controlSplit ? i : i - controlSplit;
    const x = col === 0 ? 100 : Math.max(500, W * 0.53), y = 310 + row * 34;
    chamfer(x, y, 104, 24, 6); ctx.strokeStyle = C.cyan; ctx.lineWidth = 1; ctx.stroke();
    textFit(k, x + 52, y + 17, 9, C.cyan, 'center', 96, 6);
    textFit(d, x + 116, y + 18, 11, C.white, 'left', col === 0 ? 260 : Math.max(80, W - x - 128), 7);
  });
  ctx.restore();
}
