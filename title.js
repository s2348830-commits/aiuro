'use strict';
// ===== タイトル画面 =====
// 読み込み順は audio.js → ui.js → title.js → game.js。
// VOID//SHIFTのロゴやメニューはCanvas描画のまま、背景動画は同じフォルダのtitle.webmをループ再生する。
// canvas / ctx / state / overlay / resetGame は game.js のもの、色(C)・text()・chamfer() は ui.js のものを使い回す。
// 使い方：起動時に Title.open() で表示し、START GAME で resetGame() を呼んでゲームを始める。

// ---------- 設定（ここを書き換えるだけで見た目を変えられる） ----------
const TITLE_CONFIG = {
  name: 'VOID//SHIFT',                                 // ★タイトル名。A〜Z と - . / 空白はロゴ用の文字データで描く（数字などはフォントで代用）
  tagline: 'SILENCE / MACHINE / BLADE / AWAKENING',    // ロゴの下の小さな副題
  accent: '/',                                         // シアンで描く文字
  logoWidth: 640,                                      // ロゴ全体の幅(px)。長い名前でもこの幅に収まる
  // キャラクターを画像にするときは、次のように書く（null のあいだは仮のシルエットを描く）
  //   { src: 'hero.png', x: 790, y: 484, h: 200, tip: { x: 0.1, y: 0.95 } }
  //   x,y = 足元の位置 / h = 表示の高さ / tip = 剣先の位置（画像の幅・高さに対する割合。火の粉が出る場所）
  sprite: null,
};

// HTMLと同じフォルダの背景動画。2本を短く重ね、ループの継ぎ目を目立ちにくくする。
const TITLE_VIDEO_SRC = 'title.webm';
const TITLE_LOOP_CROSSFADE = 0.6;

function createTitleBackgroundVideo() {
  const video = document.createElement('video');
  video.src = TITLE_VIDEO_SRC;
  video.loop = false; // 末尾で即座に先頭へ戻さず、もう1本の動画へ切り替える
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  Object.assign(video.style, {
    position: 'fixed', left: '-2px', top: '-2px', width: '1px', height: '1px',
    opacity: '0', pointerEvents: 'none', zIndex: '-1'
  });
  document.body.appendChild(video);
  video.load(); // 2本目も先に読み込み、ループ時の待ちを減らす
  return video;
}

let titleBackgroundVideo = createTitleBackgroundVideo();
let titleBackgroundVideoNext = createTitleBackgroundVideo();
let titleBackgroundCrossfade = null;
const titleLoopBlendCanvas = document.createElement('canvas');
const titleLoopBlendContext = titleLoopBlendCanvas.getContext('2d');

function playTitleBackground() {
  // タイトルへ戻ったときは現在の動画から再生を再開する。
  for (const video of [titleBackgroundVideo, titleBackgroundVideoNext]) {
    video.muted = true;
  }
  const playback = titleBackgroundVideo.play();
  if (playback && typeof playback.catch === 'function') playback.catch(() => {});
}

function pauseTitleBackground() {
  titleBackgroundVideo.pause();
  titleBackgroundVideoNext.pause();
}

// 動画の終端前に次の動画を先頭から再生し、Canvas上で短くクロスフェードする。
function updateTitleBackgroundLoop() {
  const current = titleBackgroundVideo;
  const next = titleBackgroundVideoNext;

  if (titleBackgroundCrossfade) {
    const duration = current.duration;
    const progress = Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, (current.currentTime - titleBackgroundCrossfade.startAt) / TITLE_LOOP_CROSSFADE))
      : Math.max(0, Math.min(1, (performance.now() - titleBackgroundCrossfade.startedAt) / (TITLE_LOOP_CROSSFADE * 1000)));

    if (progress >= 1 || current.ended) {
      current.pause();
      try { current.currentTime = 0; } catch (_) {}
      titleBackgroundVideo = next;
      titleBackgroundVideoNext = current;
      titleBackgroundCrossfade = null;
      return { active: false, progress: 0 };
    }
    return { active: true, progress };
  }

  const duration = current.duration;
  if (!current.ended && current.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(duration) &&
      duration > TITLE_LOOP_CROSSFADE + 0.2 && current.currentTime >= duration - TITLE_LOOP_CROSSFADE &&
      next.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && next.videoWidth > 0) {
    try { next.currentTime = 0; } catch (_) {}
    const playback = next.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    titleBackgroundCrossfade = { startAt: current.currentTime, startedAt: performance.now() };
    return { active: true, progress: 0 };
  }

  // もう1本の準備が間に合わなかった場合の保険。映像が止まったままにならないよう再開する。
  if (current.ended) {
    try { current.currentTime = 0; } catch (_) {}
    const playback = current.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  }
  return { active: false, progress: 0 };
}

const T_INTRO_END = 4.0;      // 起動演出が終わる時間(秒)
const T_MENU_AT = 2.9;        // メニューが出はじめる時間(秒)
const T_LEAVE = 0.9;          // START GAME を押してから暗転しきるまで(秒)
const T_FADE_IN = 0.8;        // ゲーム開始後、暗転から戻るまで(秒)
const T_FLOOR = 484;          // 床の高さ
const T_LOGO_TOP = 150;       // ロゴの上端
const T_MENU_X = 76;
const T_MENU_Y = [338, 392, 440];
const T_HERO_X = 790;
const titleHeroX = () => W < 620 ? Math.max(42, W * 0.78) : T_HERO_X;
const T_PANEL = { x: 150, y: 70, w: 660, h: 400 };   // CONTROLS / SETTINGS の枠

// 設定画面の各行の位置（マウス判定にも使う）
const T_SET_ROWS = ['volume', 'shake', 'flash', 'keybinds', 'back'];
const T_SET_GEO = {
  volume: { x: 174, y: 144, w: 612, h: 52, cy: 170 },
  shake: { x: 174, y: 204, w: 612, h: 48, cy: 228 },
  flash: { x: 174, y: 262, w: 612, h: 48, cy: 286 },
  keybinds: { x: 174, y: 320, w: 612, h: 58, cy: 349 },
  back: { x: 186, y: 406, w: 220, h: 40, cy: 426 },
};
const KEY_BIND_ACTIONS = [
  { id: 'left', label: '左移動' }, { id: 'right', label: '右移動' },
  { id: 'jump', label: 'ジャンプ' }, { id: 'guard', label: 'ガード / パリィ' },
  { id: 'dodge', label: '回避' }, { id: 'crouch', label: 'しゃがみ' },
  { id: 'attack', label: '攻撃 / 長押し強攻撃' }, { id: 'skill', label: 'スキル' },
  { id: 'ult', label: '必殺技' }, { id: 'inventory', label: 'インベントリー' },
  { id: 'info', label: '操作説明' }, { id: 'appeal', label: 'アピール' },
];
const T_KEY_GEO = { x: 174, y: 177, rowH: 36, colW: 294, leftX: 174, rightX: 492, rowW: 294, backRow: KEY_BIND_ACTIONS.length };
function keyCodeLabel(code) {
  if (!code) return '未設定';
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code === 'ArrowLeft') return '←'; if (code === 'ArrowRight') return '→';
  if (code === 'ArrowUp') return '↑'; if (code === 'ArrowDown') return '↓';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}
function titleBoundKey(action) { return Settings.keybinds[action] || ''; }
const T_VOL = { barX: 412, step: 28, segW: 22, leftX: 392, rightX: 708 };   // 音量バーの位置
const T_TOGGLE = { onX: 412, offX: 486, w: 64, h: 32 };                      // ON / OFF ボタンの位置（揺れ・光る演出で共通）

// 操作説明（左の列・右の列の順に並べる）
const T_CONTROLS = [
  ['A / D  ← →', '移動'], ['W', 'ジャンプ（空中で再入力すると2段ジャンプ）'], ['SPACE TAP', 'ジャストパリィ / ゲージ+20'], ['SPACE HOLD', 'ガード / 防御時ゲージ-10'], ['S  ↓', 'しゃがみ'], ['SHIFT', '回避（最大3回・地上で回復）'],
  ['MOUSE L', '通常攻撃／長押しで強攻撃'], ['Q', 'ロックオン必殺技（橙色で大ダメージ）'], ['E', '高速直進して斬るスキル'], ['V', 'アピール'], ['TAB / F', 'インベントリー / 説明'],
];

// ---------- ロゴ用の文字データ ----------
// 幅4×高さ6のマス目に折れ線で文字を描く（角を斜めに落として機械的な印象にする）
// 並びは [文字の幅, 折れ線, 折れ線, ...]。折れ線は [x, y] の並び
const GLYPHS = {
  A: [4, [[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]], [[0, 3], [4, 3]]],
  B: [4, [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  C: [4, [[4, 0], [1, 0], [0, 1], [0, 5], [1, 6], [4, 6]]],
  D: [4, [[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6], [0, 0]]],
  E: [4, [[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [4, [[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [4, [[4, 0], [1, 0], [0, 1], [0, 5], [1, 6], [4, 6], [4, 3], [2, 3]]],
  H: [4, [[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [2, [[0, 0], [2, 0]], [[1, 0], [1, 6]], [[0, 6], [2, 6]]],
  J: [4, [[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [4, [[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
  L: [4, [[0, 0], [0, 6], [4, 6]]],
  M: [4, [[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [4, [[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [4, [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [4, [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  Q: [4, [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4], [4, 6.5]]],
  R: [4, [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  S: [4, [[4, 0], [1, 0], [0, 1], [0, 2.5], [1, 3], [3, 3], [4, 3.5], [4, 5], [3, 6], [0, 6]]],
  T: [4, [[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [4, [[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [4, [[0, 0], [2, 6], [4, 0]]],
  W: [6, [[0, 0], [1.5, 6], [3, 2], [4.5, 6], [6, 0]]],
  X: [4, [[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [4, [[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [4, [[0, 0], [4, 0], [0, 6], [4, 6]]],
  '/': [2.5, [[2.5, 0], [0, 6]]],
  '-': [3, [[0, 3], [3, 3]]],
  '.': [1, [[0, 5], [1, 5], [1, 6], [0, 6], [0, 5]]],
  ' ': [3],
};

// ---------- 小さな道具 ----------
const tClamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const tEase = (k) => 1 - Math.pow(1 - tClamp(k), 3);                       // はじめ速く、終わりゆっくり
const tHash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };   // 数字から決まる乱数
const tInRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function tCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }

// 毎回同じ並びになる乱数（背景の建物を毎回同じ形にするため）
function tRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字の間隔を指定して描く（Canvasの letterSpacing に頼らないので、どのブラウザでも同じ見た目になる）
// 毎フレーム1文字ずつ測って描くと重いので、一度だけ絵にして取っておき、あとは貼るだけにする
const T_TEXT_CACHE = new Map();
if (document.fonts) document.fonts.addEventListener('loadingdone', () => T_TEXT_CACHE.clear());   // Webフォントが読み込めたら、作り置きを作り直す
function tSpaced(str, x, y, size, col, spacing = 0, align = 'left', glow = 0) {
  spacing = Math.round(spacing * 2) / 2; glow = Math.round(glow);       // 動く値は粗くそろえて、作り置きの数が増えすぎないようにする
  const key = `${size}|${col}|${spacing}|${glow}|${str}`;
  let sp = T_TEXT_CACHE.get(key);
  if (!sp) {
    ctx.font = `500 ${size}px ${FONT}`;
    const chars = [...str], ws = chars.map((ch) => ctx.measureText(ch).width);
    const total = ws.reduce((sum, w) => sum + w, 0) + spacing * (chars.length - 1), pad = glow * 2 + 4, base = pad + size * 1.2;
    const cv = tCanvas(Math.ceil(total + pad * 2), Math.ceil(size * 1.6 + pad * 2)), c = cv.getContext('2d');
    c.font = `500 ${size}px ${FONT}`; c.textAlign = 'left'; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = glow;
    let px = pad;
    chars.forEach((ch, i) => { c.fillText(ch, px, base); px += ws[i] + spacing; });
    sp = { cv, total, pad, base };
    T_TEXT_CACHE.set(key, sp);
  }
  const left = align === 'center' ? x - sp.total / 2 : align === 'right' ? x - sp.total : x;
  ctx.drawImage(sp.cv, left - sp.pad, y - sp.base);
  return sp.total;
}

// ---------- ロゴ ----------
function tPolyLen(poly) {
  let d = 0;
  for (let i = 1; i < poly.length; i++) d += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  return d;
}

// 折れ線の先頭から d だけ進んだ位置（線が伸びていく先端の光に使う）
function tPolyAt(poly, d) {
  for (let i = 1; i < poly.length; i++) {
    const seg = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    if (d <= seg) { const k = seg ? d / seg : 0; return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * k, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * k]; }
    d -= seg;
  }
  return poly[poly.length - 1];
}

// タイトル名から、各文字の位置と大きさを決める
function tLogoLayout(name) {
  const GAP = 1.3;                                   // 文字と文字のすき間（マス目）
  const items = [];
  let x = 0;
  for (const ch of name.toUpperCase()) {
    const g = GLYPHS[ch];
    const it = { ch, x, w: g ? g[0] : 4, polys: g ? g.slice(1) : null };
    if (it.polys) it.lens = it.polys.map(tPolyLen);
    items.push(it);
    x += it.w + GAP;
  }
  const total = Math.max(1, x - GAP);
  const u = Math.min(TITLE_CONFIG.logoWidth / total, 15);   // 1マスの大きさ(px)
  return { items, u, w: total * u, h: 6 * u };
}

// ロゴを描く。time は描き始めからの秒数、full が true なら完成した姿
function tPaintLogo(c, L, ox, oy, time, full) {
  const u = L.u;
  c.save();
  c.lineJoin = 'miter'; c.lineCap = 'butt'; c.lineWidth = Math.max(3, u * 0.42);
  L.items.forEach((it, i) => {
    const prog = full ? 1 : tClamp((time - i * 0.08) / 0.55);      // 文字ごとに少しずつ遅らせて描く
    if (prog <= 0) return;
    const col = TITLE_CONFIG.accent.includes(it.ch) ? C.cyan : C.white;
    c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 10;
    if (!it.polys) {                                                // 文字データがない文字はフォントで代用
      const keep = c.globalAlpha;
      c.globalAlpha = keep * prog; c.fillStyle = col; c.font = `700 ${u * 6.4}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText(it.ch, ox + (it.x + it.w / 2) * u, oy + 6 * u); c.globalAlpha = keep;
      return;
    }
    it.polys.forEach((poly, k) => {
      const len = it.lens[k] * u;
      c.beginPath();
      poly.forEach(([px, py], n) => (n ? c.lineTo : c.moveTo).call(c, ox + (it.x + px) * u, oy + py * u));
      c.setLineDash(prog < 1 ? [len * prog, len * 2] : []);        // 線を少しずつ伸ばす
      c.stroke();
      if (prog < 1 && prog > 0.02) {                                // 描いている先端に小さな光
        const [hx, hy] = tPolyAt(poly, it.lens[k] * prog);
        c.setLineDash([]); c.fillStyle = '#ffffff'; c.shadowColor = C.cyan; c.shadowBlur = 16;
        c.fillRect(ox + (it.x + hx) * u - 1.5, oy + hy * u - 1.5, 3, 3);
      }
    });
  });
  c.restore();
}

// 細い横の切れ目(スプリット)で上下に分けて描く。切れ目の間にシアンの線が通る
function tDrawLogoSplit(c, L, ox, oy, time, full) {
  const splitY = oy + L.h * 0.58;
  [true, false].forEach((upper) => {
    c.save(); c.beginPath();
    if (upper) c.rect(ox - 80, oy - 80, L.w + 160, splitY - 1.5 - (oy - 80));
    else c.rect(ox - 80, splitY + 1.5, L.w + 160, L.h + 160);
    c.clip();
    tPaintLogo(c, L, ox, oy, time, full);
    c.restore();
  });
}

// ---------- 背景の部品（最初に1回だけ作って、毎フレームは貼るだけにする） ----------
// 遠景・中景の巨大な建物。w は繰り返しの幅（端がつながるように、はみ出さずに並べる）
function tBuildCity(seed, o) {
  const cv = tCanvas(o.w, H), c = cv.getContext('2d'), rnd = tRng(seed);
  const towers = [];
  for (let x = 0; ;) {
    const bw = o.minW + rnd() * (o.maxW - o.minW);
    if (x + bw > o.w - 4) break;
    towers.push({ x, w: bw, top: o.base - (o.minH + rnd() * (o.maxH - o.minH)), type: Math.floor(rnd() * 5) });
    x += bw + (rnd() * 26 - 6);
  }
  const grad = c.createLinearGradient(0, o.base - o.maxH, 0, o.base);
  grad.addColorStop(0, o.fill[0]); grad.addColorStop(1, o.fill[1]);
  c.fillStyle = grad; c.strokeStyle = o.edge; c.lineWidth = 1;
  for (const t of towers) {
    const bx = t.x, bw = t.w, top = t.top, b = o.base;
    // 屋根の形：平ら / 斜め / 段つき / 崩れた形 / アンテナつき
    const pts = [
      [[bx, b], [bx, top], [bx + bw, top], [bx + bw, b]],
      [[bx, b], [bx, top + bw * 0.35], [bx + bw, top], [bx + bw, b]],
      [[bx, b], [bx, top + 34], [bx + bw * 0.42, top + 34], [bx + bw * 0.42, top], [bx + bw, top], [bx + bw, b]],
      [[bx, b], [bx, top + 22], [bx + bw * 0.22, top], [bx + bw * 0.4, top + 30], [bx + bw * 0.62, top + 10], [bx + bw * 0.82, top + 44], [bx + bw, top + 18], [bx + bw, b]],
      [[bx, b], [bx, top], [bx + bw, top], [bx + bw, b]],
    ][t.type];
    c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.fill(); c.stroke();                                           // 塗ってから線（底の線は引かない）
    if (t.type === 4) { c.beginPath(); c.moveTo(bx + bw * 0.5, top); c.lineTo(bx + bw * 0.5, top - 30 - rnd() * 60); c.stroke(); }
    c.fillStyle = o.winCol;                                         // まばらに光る窓
    for (let wy = top + 30; wy < b - 14; wy += 16) for (let wx = bx + 8; wx < bx + bw - 10; wx += 12) if (rnd() < o.win) c.fillRect(wx, wy, 3, 4);
    c.fillStyle = grad;
  }
  c.strokeStyle = o.edge;                                           // 建物をつなぐ梁
  for (let i = 0; i < o.beams; i++) {
    const x1 = rnd() * (o.w - 300), len = 120 + rnd() * 180, y = o.base - 80 - rnd() * o.maxH * 0.6;
    c.fillStyle = o.fill[0]; c.fillRect(x1, y, len, 3); c.strokeRect(x1 + 0.5, y + 0.5, len, 3);
    for (let s = 0; s < 3; s++) { c.beginPath(); c.moveTo(x1 + len * (s + 0.5) / 3, y + 3); c.lineTo(x1 + len * (s + 0.5) / 3 - 10, y + 22); c.stroke(); }
  }
  return cv;
}

// 巨大な輪（背景の奥でゆっくり回る）。画像を回すと重いので、毎フレーム線で描く。
// scale=大きさ dir=回る向き(1か-1) alpha=濃さ。目盛りの角度と破線のずれを動かして回って見せる
function tDrawRing(t, scale, dir, alpha) {
  const c = ctx, keep = c.globalAlpha, rot = t * 0.012 * dir;
  c.save(); c.translate(480, 236); c.scale(scale, scale); c.strokeStyle = C.cyan; c.lineWidth = 1 / scale;
  const circle = (r, al) => { c.globalAlpha = keep * alpha * al; c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.stroke(); };
  circle(300, 0.5); circle(278, 0.25);
  c.setLineDash([3, 9]); c.lineDashOffset = -t * 5 * dir; circle(246, 0.2); c.setLineDash([]);
  c.globalAlpha = keep * alpha * 0.55; c.lineWidth = 4 / scale;                                   // 太い部分
  c.beginPath(); c.arc(0, 0, 300, 0.2 + rot, 0.75 + rot); c.stroke();
  c.beginPath(); c.arc(0, 0, 300, 3.35 + rot, 3.85 + rot); c.stroke();
  c.lineWidth = 1 / scale;
  [[false, 0.28, 309], [true, 0.6, 318]].forEach(([major, al, r1]) => {                            // 目盛り（細かいもの・大きいもの）
    c.globalAlpha = keep * alpha * al; c.beginPath();
    for (let i = 0; i < 120; i++) {
      if ((i % 10 === 0) !== major) continue;
      const a = i * Math.PI / 60 + rot, cs = Math.cos(a), sn = Math.sin(a);
      c.moveTo(cs * 300, sn * 300); c.lineTo(cs * r1, sn * r1);
    }
    c.stroke();
  });
  c.restore();
  c.globalAlpha = keep;
}

// ぼんやりした霧のもと（丸いグラデーション。横に伸ばして使う）
function tBuildFog() {
  const cv = tCanvas(256, 256), c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(140,215,232,0.55)'); g.addColorStop(0.5, 'rgba(100,180,200,0.18)'); g.addColorStop(1, 'rgba(100,180,200,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  return cv;
}

// キャラクターの背後に差す光の柱（左右はなめらかに消え、上下は端で消える）
function tBuildShaft() {
  const w = 180, h = T_FLOOR + 10, cv = tCanvas(w, h), c = cv.getContext('2d');
  const gx = c.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(150,235,255,0)'); gx.addColorStop(0.5, 'rgba(150,235,255,0.22)'); gx.addColorStop(1, 'rgba(150,235,255,0)');
  c.fillStyle = gx; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'destination-in';
  const gy = c.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0.15)'); gy.addColorStop(0.45, 'rgba(0,0,0,0.9)'); gy.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = gy; c.fillRect(0, 0, w, h);
  return cv;
}

// ---------- 仮のキャラクター（剣を下げて立つシルエット） ----------
// 足元が(0,0)で左向き。位置(x,y)に描き、剣先の画面上の位置を返す。後で画像に差し替えられる（TITLE_CONFIG.sprite）
function tDrawHero(t, x, y, a) {
  const sw = Math.sin(t * 1.1), sw2 = Math.sin(t * 1.7 + 1.2), br = Math.sin(t * 0.9) * 1.1;   // 髪や服のゆれ・呼吸
  const hand = [-30, -96 + br * 0.5];
  const dir = [-0.583, 0.813], nrm = [0.813, 0.583];      // 剣の向きと、その横向き
  const tip = [hand[0] + dir[0] * 112, hand[1] + dir[1] * 112];
  // なびく帯。(x0,y0)から(dx,dy)の方向へ伸び、先ほど細くなる。amp=波の大きさ ph=波のずれ
  const ribbon = (x0, y0, dx, dy, w0, amp, ph) => {
    const top = [], bot = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10, w = w0 * (1 - k * 0.85), x = x0 + dx * k, y = y0 + dy * k + Math.sin(k * 4 - t * 2.4 + ph) * amp * k;
      top.push([x, y - w / 2]); bot.push([x, y + w / 2]);
    }
    ctx.beginPath();
    top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    bot.reverse().forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.fill();
  };
  const body = (col) => {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const bt = br * 0.4;
    ribbon(4, -183 + bt, 36, 24, 12, 5, 0);                                                     // 髪（後ろへなびく）
    ctx.fillRect(-9, -170 + bt, 22, 9);                                                         // マフラーの首まわり
    ribbon(6, -163 + bt, 64, 8, 11, 7, 1.6);                                                    // マフラーの端（風になびく）
    ctx.beginPath(); ctx.arc(-2, -176 + bt, 10, 0, 6.2832); ctx.fill();                         // 頭
    ctx.beginPath(); ctx.moveTo(-17, -164 + bt); ctx.lineTo(15, -166 + bt); ctx.lineTo(17, -135); ctx.lineTo(14, -112); ctx.lineTo(22, -85);   // 体とコート（腰で細く、すそで広がり、すそがゆれる）
    ctx.lineTo(31 + sw2 * 6, -56); ctx.lineTo(17, -50); ctx.lineTo(6, -58); ctx.lineTo(-8, -50); ctx.lineTo(-27, -58); ctx.lineTo(-22, -85); ctx.lineTo(-16, -112); ctx.lineTo(-19, -135); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-15, -58); ctx.lineTo(-1, -58); ctx.lineTo(-4, -8); ctx.lineTo(1, 0); ctx.lineTo(-23, 0); ctx.lineTo(-19, -9); ctx.fill();   // 脚
    ctx.beginPath(); ctx.moveTo(3, -58); ctx.lineTo(17, -58); ctx.lineTo(15, -9); ctx.lineTo(23, 0); ctx.lineTo(1, 0); ctx.lineTo(5, -9); ctx.fill();
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-12, -158 + bt); ctx.lineTo(-29, -126); ctx.lineTo(hand[0], hand[1]); ctx.stroke();           // 剣を持つ腕
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hand[0] - dir[0] * 16, hand[1] - dir[1] * 16); ctx.lineTo(hand[0] + dir[0] * 8, hand[1] + dir[1] * 8); ctx.stroke();   // 柄
    ctx.lineWidth = 3; ctx.beginPath();                                                                                                            // 鍔
    ctx.moveTo(hand[0] + dir[0] * 9 - nrm[0] * 8, hand[1] + dir[1] * 9 - nrm[1] * 8); ctx.lineTo(hand[0] + dir[0] * 9 + nrm[0] * 8, hand[1] + dir[1] * 9 + nrm[1] * 8); ctx.stroke();
  };
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= a;
  ctx.save(); ctx.translate(-1.8, -0.6); body('rgba(125,238,255,0.55)'); ctx.restore();   // 先に少しずらして描き、左側のふちだけ光らせる
  body('#010305');
  const b0 = [hand[0] + dir[0] * 10, hand[1] + dir[1] * 10], pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
  ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(61,242,255,${0.2 * pulse})`; ctx.lineWidth = 8;   // 刀身のにじむ光
  ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.fillStyle = '#eaffff'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 10 * pulse;                  // 刃
  ctx.beginPath(); ctx.moveTo(b0[0] + nrm[0] * 1.8, b0[1] + nrm[1] * 1.8); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(b0[0] - nrm[0] * 1.8, b0[1] - nrm[1] * 1.8); ctx.fill();
  const gs = (t * 0.22) % 1.5;                                                                       // 数秒おきに、刃の上を光がすっと走る
  if (gs < 1) { ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(b0[0] + (tip[0] - b0[0]) * gs, b0[1] + (tip[1] - b0[1]) * gs, 2.4, 0, 6.2832); ctx.fill(); }
  ctx.restore();
  return [x + tip[0], y + tip[1]];
}

// ================= タイトル画面の本体 =================
const Title = {
  items: [
    { id: 'start', label: 'START GAME', size: 30 },
    { id: 'controls', label: 'CONTROLS', size: 22 },
    { id: 'settings', label: 'SETTINGS', size: 22 },
  ],
  sel: 0, selAnim: [1, 0, 0],
  sub: null, subOn: false, subP: 0, row: 0, drag: false, captureAction: null, keybindMessage: '',   // 設定画面の選択位置とキー割り当て状態
  leaving: false, leaveAt: 0, fade: 0,                     // leaving: START GAME 後の暗転中 fade: ゲーム開始後の明転の残り秒
  t0: 0, t: 0, built: false, spriteImg: null, tip: [T_HERO_X - 95, T_FLOOR - 5],

  // ---------- 開く・始める ----------
  open() {
    state = 'title';
    overlay.classList.add('hidden');
    Object.assign(this, { t0: performance.now(), t: 0, sel: 0, selAnim: [1, 0, 0], sub: null, subOn: false, subP: 0, row: 0, drag: false, captureAction: null, keybindMessage: '', leaving: false, fade: 0 });
    canvas.style.cursor = 'default';
    document.title = TITLE_CONFIG.name;
    if (TITLE_CONFIG.sprite && !this.spriteImg) {            // キャラ画像が指定されていれば読み込む
      const img = new Image();
      img.onload = () => { this.spriteImg = img; };
      img.src = TITLE_CONFIG.sprite.src;
    }
    playTitleBackground();
    Sound.setDrone(true);
  },

  // タイトル名を実行中に変えたいとき用（ロゴを作り直す）
  setName(name) { TITLE_CONFIG.name = name; document.title = name; },

  skipIntro() { this.t0 = performance.now() - T_INTRO_END * 1000; this.t = T_INTRO_END; },

  startLeave() {
    this.leaving = true; this.leaveAt = this.t;
    Sound.setDrone(false); Sound.play('start');
  },

  // 暗転が終わったら、ゲームを最初の状態から作り直して始める
  begin() {
    this.leaving = false; this.drag = false;
    pauseTitleBackground();
    canvas.style.cursor = 'default';
    resetGame();                 // プレイヤー・敵・HP・コンボ・クールダウンを新しく作る（state は 'playing' になる）
    this.fade = T_FADE_IN;
  },

  activate(id) {
    Sound.play('ok');
    if (id === 'start') this.startLeave();
    else { this.sub = id; this.subOn = true; this.row = 0; }
  },
  closeSub() { this.subOn = false; this.drag = false; this.captureAction = null; Sound.play('back'); },

  // ---------- 更新（固定の1/60秒ごと） ----------
  update() {
    if (this.fade > 0) this.fade = Math.max(0, this.fade - DT);
    if (state !== 'title') return;
    this.items.forEach((_, i) => { this.selAnim[i] += ((i === this.sel ? 1 : 0) - this.selAnim[i]) * 0.22; });
    this.subP = approach(this.subP, this.subOn ? 1 : 0, DT * 4);
    if (!this.subOn && this.subP === 0) this.sub = null;
    if (this.leaving && this.t - this.leaveAt >= T_LEAVE) this.begin();
  },

  // ---------- 入力 ----------
  // タイトル中は全てのキー・クリックをここで受け止める（trueを返す）ので、ゲーム本体の操作には届かない
  keydown(code) {
    if (state !== 'title') return false;
    Sound.unlock();
    if (this.leaving) return true;
    const enter = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
    if (this.t < T_MENU_AT) { if (enter || code === 'Escape') this.skipIntro(); return true; }   // 演出中のキーは「飛ばす」だけ
    if (this.sub) { if (this.subOn) this.subKey(code, enter); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') this.moveSel(1);
    else if (code === 'ArrowUp' || code === 'KeyW') this.moveSel(-1);
    else if (enter) this.activate(this.items[this.sel].id);
    return true;
  },

  moveSel(d) { this.sel = (this.sel + d + this.items.length) % this.items.length; Sound.play('move'); },

  subKey(code, enter) {
    if (this.sub === 'keybinds') {
      if (this.captureAction) {
        if (code === 'Escape' || code === 'Backspace') { this.captureAction = null; this.keybindMessage = '割り当てをキャンセルしました'; Sound.play('back'); return; }
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') { this.keybindMessage = 'このキーは割り当てできません'; Sound.play('back'); return; }
        if (this.setKeybind(this.captureAction, code)) this.captureAction = null;
        return;
      }
      if (code === 'Escape' || code === 'Backspace') { this.closeSub(); return; }
      const count = KEY_BIND_ACTIONS.length + 1;
      if (code === 'ArrowDown' || code === 'KeyS') { this.row = (this.row + 1) % count; Sound.play('move'); return; }
      if (code === 'ArrowUp' || code === 'KeyW') { this.row = (this.row + count - 1) % count; Sound.play('move'); return; }
      if (enter || code === 'ArrowRight' || code === 'ArrowLeft') {
        if (this.row >= KEY_BIND_ACTIONS.length) this.closeSub();
        else { this.captureAction = KEY_BIND_ACTIONS[this.row].id; this.keybindMessage = 'キーを押してください'; Sound.play('ok'); }
      }
      return;
    }
    if (code === 'Escape' || code === 'Backspace') { this.closeSub(); return; }
    if (this.sub === 'controls') { if (enter) this.closeSub(); return; }
    const n = T_SET_ROWS.length;
    if (code === 'ArrowDown' || code === 'KeyS') { this.row = (this.row + 1) % n; Sound.play('move'); return; }
    if (code === 'ArrowUp' || code === 'KeyW') { this.row = (this.row + n - 1) % n; Sound.play('move'); return; }
    const dx = (code === 'ArrowRight' || code === 'KeyD' ? 1 : 0) - (code === 'ArrowLeft' || code === 'KeyA' ? 1 : 0);
    const id = T_SET_ROWS[this.row];
    if (id === 'volume' && dx) this.setVolume(Settings.volume + dx);
    else if ((id === 'shake' || id === 'flash') && (dx || enter)) this.setToggle(id, !Settings[id]);
    else if (id === 'keybinds' && (enter || dx)) { this.sub = 'keybinds'; this.row = 0; this.captureAction = null; this.keybindMessage = ''; Sound.play('ok'); }
    else if (id === 'back' && enter) this.closeSub();
  },

  setKeybind(action, code) {
    const reserved = ['Escape', 'Backspace', 'Enter', 'NumpadEnter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (reserved.includes(code)) { this.keybindMessage = 'ESC / ENTER / 矢印キーは設定できません'; Sound.play('back'); return false; }
    const duplicate = Object.entries(Settings.keybinds).find(([id, assigned]) => id !== action && assigned === code);
    if (duplicate) {
      const name = KEY_BIND_ACTIONS.find((item) => item.id === duplicate[0])?.label || duplicate[0];
      this.keybindMessage = `このキーは「${name}」で使用中です`;
      Sound.play('back'); return false;
    }
    Settings.keybinds[action] = code;
    Settings.save();
    const name = KEY_BIND_ACTIONS.find((item) => item.id === action)?.label || action;
    this.keybindMessage = `${name} : ${keyCodeLabel(code)} に設定しました`;
    Sound.play('ok');
    return true;
  },

  setVolume(v) {
    v = tClamp(Math.round(v), 0, 10);
    if (v === Settings.volume) return;
    Settings.volume = v; Settings.save(); Sound.applyVolume(); Sound.play('move');   // 変えた直後に音を鳴らして、大きさが分かるようにする
  },
  setToggle(key, on) { if (on !== Settings[key]) { Settings[key] = on; Settings.save(); Sound.play('ok'); } },   // ON/OFF の設定を切り替える
  setVolumeAt(x) { this.setVolume(Math.ceil((x - T_VOL.barX) / T_VOL.step)); },

  // マウス位置を、画面の論理座標(960×540)に直す
  pos(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  },

  itemAt(x, y) {
    const left = W < 620 ? 8 : 28, right = W < 620 ? W - 6 : 380;
    for (let i = 0; i < this.items.length; i++) {
      if (tEase((this.t - T_MENU_AT - i * 0.2) / 0.55) < 0.6) continue;    // まだ出ていない項目は選べない
      const cy = T_MENU_Y[i];
      if (x >= left && x <= right && y >= cy - 30 && y <= cy + 20) return i;
    }
    return -1;
  },

  // 設定画面で、マウスの下にある行（なければ -1）。コントロール画面では BACK だけ
  subPoint(x, y) {
    if (W >= 860) return [x, y];
    const scale = Math.min(1, (W - 24) / T_PANEL.w);
    return [480 + (x - W / 2) / scale, 270 + (y - H / 2) / scale];
  },
  rowAt(x, y) {
    if (this.sub === 'keybinds') {
      for (let i = 0; i < KEY_BIND_ACTIONS.length; i++) {
        const col = i < 6 ? 0 : 1, row = i % 6;
        const r = { x: col === 0 ? T_KEY_GEO.leftX : T_KEY_GEO.rightX, y: T_KEY_GEO.y + row * T_KEY_GEO.rowH - 13, w: T_KEY_GEO.rowW, h: 31 };
        if (tInRect(x, y, r)) return i;
      }
      return tInRect(x, y, T_SET_GEO.back) ? KEY_BIND_ACTIONS.length : -1;
    }
    const ids = this.sub === 'controls' ? ['back'] : T_SET_ROWS;
    return ids.findIndex((id) => tInRect(x, y, T_SET_GEO[id]));
  },

  click(e) {
    if (state !== 'title') return false;
    Sound.unlock();
    if (this.leaving) return true;
    const [x, y] = this.pos(e);
    if (this.t < T_MENU_AT) { this.skipIntro(); return true; }
    if (this.sub) { if (this.subOn) this.subClick(...this.subPoint(x, y)); return true; }
    const i = this.itemAt(x, y);
    if (i >= 0) { this.sel = i; this.activate(this.items[i].id); }
    return true;
  },

  subClick(x, y) {
    const r = this.rowAt(x, y);
    if (r < 0) return;
    if (this.sub === 'keybinds') {
      this.row = r;
      if (r >= KEY_BIND_ACTIONS.length) { this.closeSub(); return; }
      this.captureAction = KEY_BIND_ACTIONS[r].id;
      this.keybindMessage = 'キーを押してください'; Sound.play('ok'); return;
    }
    const id = this.sub === 'controls' ? 'back' : T_SET_ROWS[r];
    if (this.sub === 'settings') this.row = r;
    if (id === 'back') { this.closeSub(); return; }
    if (id === 'keybinds') { this.sub = 'keybinds'; this.row = 0; this.captureAction = null; this.keybindMessage = ''; Sound.play('ok'); return; }
    if (id === 'volume') {
      if (x < T_VOL.barX - 14) this.setVolume(Settings.volume - 1);                        // 左の ◀
      else if (x > T_VOL.barX + T_VOL.step * 10 + 4) this.setVolume(Settings.volume + 1); // 右の ▶
      else { this.drag = true; this.setVolumeAt(x); }                                      // バーをクリック・ドラッグ
    } else {                                                                              // shake / flash（ON・OFFボタンを直接押す。それ以外の場所なら切り替え）
      const by = T_SET_GEO[id].cy - 16;
      if (tInRect(x, y, { x: T_TOGGLE.onX, y: by, w: T_TOGGLE.w, h: T_TOGGLE.h })) this.setToggle(id, true);
      else if (tInRect(x, y, { x: T_TOGGLE.offX, y: by, w: T_TOGGLE.w, h: T_TOGGLE.h })) this.setToggle(id, false);
      else this.setToggle(id, !Settings[id]);
    }
  },

  // マウスを動かしたとき：項目の上なら選択状態にする
  move(e) {
    if (state !== 'title') return;
    const [x, y] = this.pos(e);
    let hand = false;
    if (!this.leaving && this.t >= T_MENU_AT) {
      if (this.sub) {
        if (this.subOn) {
          const [sx, sy] = this.subPoint(x, y);
          if (this.drag) { this.setVolumeAt(sx); hand = true; }
          else {
            const r = this.rowAt(sx, sy);
            if (r >= 0) { hand = true; if ((this.sub === 'settings' || this.sub === 'keybinds') && this.row !== r) { this.row = r; Sound.play('move'); } }
          }
        }
      } else {
        const i = this.itemAt(x, y);
        if (i >= 0) { hand = true; if (this.sel !== i) { this.sel = i; Sound.play('move'); } }
      }
    }
    canvas.style.cursor = hand ? 'pointer' : 'default';
  },

  release() { this.drag = false; },

  // ================= 描画 =================
  // 最初の1回だけ、重い絵（建物・輪・霧など）を作っておく
  build() {
    if (this.built && Math.round(this.builtW) !== Math.round(W)) this.built = false;
    if (!this.built) {
      this.built = true;
      this.builtW = W;
      this.cityFar = tBuildCity(11, { w: 1920, base: 472, minW: 40, maxW: 120, minH: 150, maxH: 390, fill: ['#04101a', '#0d2a38'], edge: 'rgba(61,242,255,0.13)', win: 0.05, winCol: 'rgba(61,242,255,0.35)', beams: 5 });
      this.cityMid = tBuildCity(29, { w: 1920, base: 484, minW: 56, maxW: 150, minH: 70, maxH: 280, fill: ['#02060b', '#06121b'], edge: 'rgba(61,242,255,0.2)', win: 0.03, winCol: 'rgba(255,138,31,0.45)', beams: 4 });
      this.fogImg = tBuildFog(); this.shaft = tBuildShaft();
      const sky = ctx.createLinearGradient(0, 0, 0, T_FLOOR);
      sky.addColorStop(0, '#010308'); sky.addColorStop(0.55, '#04101a'); sky.addColorStop(1, '#0b2634');
      const floor = ctx.createLinearGradient(0, T_FLOOR, 0, H);
      floor.addColorStop(0, '#071a24'); floor.addColorStop(1, '#010305');
      const edge = ctx.createLinearGradient(0, 0, W, 0);
      edge.addColorStop(0, 'rgba(61,242,255,0)'); edge.addColorStop(0.35, 'rgba(61,242,255,0.18)'); edge.addColorStop(0.82, 'rgba(200,250,255,0.55)'); edge.addColorStop(1, 'rgba(61,242,255,0.15)');
      const glow = ctx.createRadialGradient(480, 190, 20, 480, 190, 340);
      glow.addColorStop(0, 'rgba(61,242,255,0.22)'); glow.addColorStop(1, 'rgba(61,242,255,0)');
      const left = ctx.createLinearGradient(0, 0, 470, 0);
      left.addColorStop(0, 'rgba(0,3,8,0.75)'); left.addColorStop(1, 'rgba(0,3,8,0)');
      this.grad = { floor, edge, glow };
      this.skyCv = tCanvas(W, T_FLOOR); this.skyCv.getContext('2d').fillStyle = sky; this.skyCv.getContext('2d').fillRect(0, 0, W, T_FLOOR);
      this.leftCv = tCanvas(470, T_FLOOR); this.leftCv.getContext('2d').fillStyle = left; this.leftCv.getContext('2d').fillRect(0, 0, 470, T_FLOOR);
      const vg = tCanvas(W, H), vc = vg.getContext('2d'), v = vc.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);   // 四隅を暗くする
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.78)'); vc.fillStyle = v; vc.fillRect(0, 0, W, H);
      const sl = tCanvas(2, 3); sl.getContext('2d').fillStyle = 'rgba(0,0,0,0.16)'; sl.getContext('2d').fillRect(0, 0, 2, 1);   // 走査線（3pxおきの細い暗線）
      vc.fillStyle = vc.createPattern(sl, 'repeat'); vc.fillRect(0, 0, W, H);
      this.vignette = vg;
      const rnd = tRng(7);
      this.parts = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H, vy: 4 + rnd() * 12, ph: rnd() * 6.28, big: rnd() < 0.2, a: 0.15 + rnd() * 0.5 }));
      this.streams = Array.from({ length: 16 }, () => ({ y: Math.round(30 + rnd() * 440), x: rnd() * W, len: 40 + rnd() * 200, v: 6 + rnd() * 26, a: 0.05 + rnd() * 0.14, cyan: rnd() < 0.6 }));
      this.blocks = Array.from({ length: 26 }, () => ({ x: Math.round(rnd() * W), y: Math.round(rnd() * 470), s: 2 + 2 * Math.floor(rnd() * 3), ph: rnd() * 100 }));
      this.embers = Array.from({ length: 14 }, () => ({ life: 2.2 + rnd() * 1.8, off: rnd() * 5, dx: (rnd() - 0.5) * 16, ph: rnd() * 6.28 }));
    }
    if (this.logoName !== TITLE_CONFIG.name) {               // タイトル名が変わったらロゴを作り直す
      this.logoName = TITLE_CONFIG.name;
      const L = this.logo = tLogoLayout(this.logoName), pad = 60;
      const cv = this.logoCache = tCanvas(Math.ceil(L.w + pad * 2), Math.ceil(L.h + pad * 2));
      tDrawLogoSplit(cv.getContext('2d'), L, pad, pad, 0, true);
    }
  },

  draw() {
    const c = ctx, t = this.t = (performance.now() - this.t0) / 1000;
    this.build();
    c.save();
    c.fillStyle = '#010204'; c.fillRect(0, 0, W, H);
    const bgA = tEase(t / 1.8);                                // 暗闇から背景がゆっくり現れる
    c.globalAlpha = bgA; this.drawBackground(t, bgA); c.globalAlpha = 1;
    const k = this.leaving ? tClamp((t - this.leaveAt) / T_LEAVE) : 0;
    const mainA = (1 - this.subP) * (1 - tClamp(k * 1.6));    // サブ画面を開く／ゲームを始めるときは、ロゴとメニューが消える
    if (mainA > 0.01) { this.drawLogo(t, mainA); this.drawMenu(t, mainA); }
    if (this.sub) this.drawSub(t);
    this.drawFrame(t);
    c.drawImage(this.vignette, 0, 0);                         // 四隅の暗がり＋走査線
    if (this.leaving) this.drawLeave(k, t);
    c.restore();
  },

  // ---------- 背景 ----------
  drawBackground(t, bgA) {
    if (titleBackgroundVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && titleBackgroundVideo.videoWidth > 0) {
      // 末尾と先頭を短く重ね、背景動画の切り替わりを目立ちにくくする。
      const loop = updateTitleBackgroundLoop();
      const baseAlpha = ctx.globalAlpha;
      const canBlend = loop.active && titleBackgroundVideoNext.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && titleBackgroundVideoNext.videoWidth > 0 && titleLoopBlendContext;
      if (canBlend) {
        // Canvas本体へ2本を半透明で重ねると、その分だけ背面の黒が透けて暗くなる。
        // オフスクリーン上で不透明な1枚の映像に合成してから描画し、ループ中も明るさを維持する。
        if (titleLoopBlendCanvas.width !== W || titleLoopBlendCanvas.height !== H) {
          titleLoopBlendCanvas.width = W; titleLoopBlendCanvas.height = H;
        }
        const blend = titleLoopBlendContext;
        blend.globalCompositeOperation = 'source-over';
        blend.globalAlpha = 1;
        blend.clearRect(0, 0, W, H);
        blend.drawImage(titleBackgroundVideo, 0, 0, W, H);
        blend.globalAlpha = loop.progress;
        blend.drawImage(titleBackgroundVideoNext, 0, 0, W, H);
        blend.globalAlpha = 1;
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(titleLoopBlendCanvas, 0, 0, W, H);
      } else {
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(titleBackgroundVideo, 0, 0, W, H);
      }
      ctx.globalAlpha = baseAlpha;
      return;
    }
    this.drawProceduralBackground(t, bgA);
  },

  // title.webmが未配置・未読み込みの場合だけ使う既存の背景
  drawProceduralBackground(t, bgA) {
    const c = ctx, G = this.grad;
    c.drawImage(this.skyCv, 0, 0);
    tDrawRing(t, 1, 1, 0.4); tDrawRing(t, 0.7, -3, 0.4);                                // 奥で回る巨大な輪
    c.globalCompositeOperation = 'lighter';                                              // ロゴの背後のやわらかい光（光が届く範囲だけ塗る）
    c.globalAlpha = bgA * (0.8 + 0.2 * Math.sin(t * 0.9)); c.fillStyle = G.glow; c.fillRect(140, 0, 680, T_FLOOR);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = bgA;
    this.tile(this.cityFar, t * 5);                                                      // 遠景→霧→中景（奥ほどゆっくり動く）
    this.fog(t, 410, 460, 60, 0.5, 0.13, 0.0);
    this.tile(this.cityMid, t * 11);
    this.fog(t, 452, 520, 52, 0.55, 0.19, 2.0); this.fog(t, 425, 380, 40, 0.3, 0.11, 4.1);
    c.drawImage(this.leftCv, 0, 0);                                                      // メニュー側を少し暗くして読みやすくする
    this.drawStreams(t);
    // 床
    c.fillStyle = G.floor; c.fillRect(0, T_FLOOR, W, H - T_FLOOR);
    c.strokeStyle = 'rgba(61,242,255,0.06)'; c.lineWidth = 1; c.beginPath();
    [T_FLOOR + 12, T_FLOOR + 28, T_FLOOR + 48].forEach((y) => { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); });
    for (let i = -6; i <= 6; i++) { c.moveTo(480 + i * 70, T_FLOOR); c.lineTo(480 + i * 210, H); }
    c.stroke();
    c.fillStyle = G.edge; c.fillRect(0, T_FLOOR, W, 1);
    // キャラクターと、その背後の光
    const ha = tEase((t - 1.6) / 1.4);
    if (ha > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = bgA * ha * (0.85 + 0.15 * Math.sin(t * 1.3)); c.drawImage(this.shaft, titleHeroX() - 84, -10);
      c.globalAlpha = bgA * ha * 0.6; c.drawImage(this.fogImg, titleHeroX() - 170, T_FLOOR - 26, 340, 56);   // 足元に落ちる光
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = bgA;
      this.drawHero(t, ha);
    }
    this.drawParticles(t, bgA);
    this.drawCables(t);
  },

  // 横につなげて流れる絵のうち、画面に見える幅(W)だけを貼る。端をまたぐときは2回に分ける
  tile(img, off) {
    const x = off % img.width, first = Math.min(W, img.width - x);
    ctx.drawImage(img, x, 0, first, H, 0, 0, first, H);
    if (first < W) ctx.drawImage(img, 0, 0, W - first, H, first, 0, W - first, H);
  },

  // 霧の帯。横にゆっくり行き来する
  fog(t, y, rx, ry, a, speed, phase) {
    const x = W / 2 + Math.sin(t * speed + phase) * 260, keep = ctx.globalAlpha;
    ctx.globalAlpha = keep * a; ctx.drawImage(this.fogImg, x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = keep;
  },

  // 流れる細いライン・ちらつく小さな四角（デジタルな模様）
  drawStreams(t) {
    const c = ctx, keep = c.globalAlpha;
    for (const s of this.streams) {
      const x = ((s.x + s.v * t) % (W + 300)) - 150;
      c.globalAlpha = keep * s.a; c.fillStyle = s.cyan ? C.cyan : C.white;
      c.fillRect(Math.round(x), s.y, s.len, 1); c.fillRect(Math.round(x + s.len), s.y - 1, 3, 3);
    }
    c.fillStyle = C.cyan;
    for (const b of this.blocks) {
      if (tHash(Math.floor(t * 3 + b.ph)) < 0.74) continue;
      c.globalAlpha = keep * 0.35; c.fillRect(b.x, b.y, b.s, b.s);
    }
    c.globalAlpha = keep;
  },

  // 天井から垂れる太いケーブル（手前の層。ゆっくりゆれて奥行きを出す）
  drawCables(t) {
    const c = ctx, keep = c.globalAlpha;
    [[40, 300, 70], [210, 420, 120], [560, 700, 90], [760, 930, 130], [-30, 110, 50]].forEach(([x1, x2, sag], i) => {
      const cx = (x1 + x2) / 2 + Math.sin(t * 0.4 + i) * 8, cy = 2 * (sag + 6) + Math.sin(t * 0.5 + i * 2) * 5;
      c.beginPath(); c.moveTo(x1, -6); c.quadraticCurveTo(cx, cy, x2, -6);
      c.strokeStyle = 'rgba(0,0,0,0.92)'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = 'rgba(61,242,255,0.14)'; c.lineWidth = 1; c.stroke();
    });
    c.globalAlpha = keep;
  },

  // 光の粒子。ゆっくり上へ昇る。剣先からはオレンジの火の粉が出る
  drawParticles(t, bgA) {
    const c = ctx;
    for (const p of this.parts) {
      const y = ((p.y - p.vy * t) % H + H) % H, x = p.x + Math.sin(t * 0.3 + p.ph) * 14;
      c.globalAlpha = bgA * p.a * (0.55 + 0.45 * Math.sin(t * 1.4 + p.ph)); c.fillStyle = p.big ? C.cyan : C.white;
      c.fillRect(Math.round(x), Math.round(y), p.big ? 2 : 1, p.big ? 2 : 1);
    }
    const tip = this.tip, ha = tEase((t - 1.6) / 1.4);
    c.fillStyle = C.orange;
    for (const e of this.embers) {
      const age = (t + e.off) % e.life, k = age / e.life, ex = Math.round(tip[0] + e.dx * k + Math.sin(t * 2 + e.ph) * 5), ey = Math.round(tip[1] - 8 - age * 26);
      c.globalAlpha = bgA * ha * (1 - k) * 0.25; c.fillRect(ex - 2, ey - 2, 6, 6);     // ぼんやりした光
      c.globalAlpha = bgA * ha * (1 - k) * 0.9; c.fillRect(ex, ey, 2, 2);               // 火の粉の芯
    }
    c.globalAlpha = bgA;
  },

  drawHero(t, ha) {
    const sp = TITLE_CONFIG.sprite;
    if (sp && this.spriteImg) {                                                 // 画像が読み込めたら、画像を描く
      const img = this.spriteImg, h = sp.h, w = img.width * h / img.height, bob = Math.sin(t * 0.9) * 1.2;
      ctx.save(); ctx.globalAlpha = ctx.globalAlpha * ha; ctx.drawImage(img, sp.x - w / 2, sp.y - h + bob, w, h); ctx.restore();
      const tp = sp.tip || { x: 0.5, y: 0.9 };
      this.tip = [sp.x - w / 2 + tp.x * w, sp.y - h + tp.y * h];
    } else {
      this.tip = tDrawHero(t, titleHeroX(), T_FLOOR, ha);
    }
  },

  // ---------- ロゴ・副題 ----------
  drawLogo(t, a) {
    const c = ctx, L = this.logo, ox = Math.round(W / 2 - L.w / 2), top = T_LOGO_TOP;
    const splitY = Math.round(top + L.h * 0.58);
    const logoScale = W < 640 ? Math.min(1, Math.max(0.28, (W - 24) / (L.w + 120))) : 1;
    c.save();
    if (logoScale < 1) { c.translate(W / 2, top + L.h / 2); c.scale(logoScale, logoScale); c.translate(-W / 2, -(top + L.h / 2)); }
    c.globalAlpha = a;
    // 起動時：細い光のラインが左から右へ画面を横切る
    const sw = tClamp((t - 0.9) / 1.0);
    if (sw > 0 && sw < 1) {
      const hx = -80 + (W + 160) * sw * sw * (3 - 2 * sw), g = c.createLinearGradient(hx - 380, 0, hx, 0);
      g.addColorStop(0, 'rgba(61,242,255,0)'); g.addColorStop(0.85, 'rgba(61,242,255,0.55)'); g.addColorStop(1, 'rgba(233,251,255,1)');
      c.fillStyle = g; c.fillRect(hx - 380, splitY - 1, 380, 2);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.7; c.drawImage(this.fogImg, hx - 40, splitY - 40, 80, 80);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = a;
    }
    // ロゴ本体：1文字ずつ線が伸びて現れる → 完成後は作り置きの絵を貼る
    const time = t - 1.3, drawEnd = 0.08 * (L.items.length - 1) + 0.6, cx = ox - 60, cy = top - 60;
    if (time > 0 && time <= drawEnd) tDrawLogoSplit(c, L, ox, top, time, false);
    else if (time > drawEnd) {
      const gp = (t - 6) % 8.5;                                                  // 数秒おきに、ごく短いグリッチ
      if (t > 6 && gp < 0.15) {
        const n = Math.floor(gp * 60), img = this.logoCache, cuts = [0, 0.3, 0.55, 0.78, 1];
        for (let s = 0; s < 4; s++) {
          const y0 = Math.floor(img.height * cuts[s]), y1 = Math.floor(img.height * cuts[s + 1]);
          c.drawImage(img, 0, y0, img.width, y1 - y0, cx + (tHash(n * 5 + s) - 0.5) * 22, cy + y0, img.width, y1 - y0);
        }
        c.globalAlpha = a * 0.3; c.drawImage(img, cx - 5, cy); c.drawImage(img, cx + 5, cy + 1); c.globalAlpha = a;
        c.fillStyle = C.cyan; c.fillRect(ox + tHash(n) * L.w * 0.6, top + tHash(n + 9) * L.h, 60 + tHash(n + 3) * 90, 2);
      } else c.drawImage(this.logoCache, cx, cy);
    }
    // 切れ目に通るシアンの細い線と、端の飾り
    const la = tClamp((t - 1.2) / 0.6);
    if (la > 0) {
      const x0 = ox - 44, x1 = ox + Math.round(L.w) + 44;
      c.globalAlpha = a * la; c.fillStyle = 'rgba(61,242,255,0.55)'; c.fillRect(x0, splitY, x1 - x0, 1);
      c.fillStyle = C.cyan; c.fillRect(x0 - 3, splitY - 1, 3, 3); c.fillRect(x1, splitY - 1, 3, 3);
      c.fillStyle = C.orange; c.fillRect(x1 + 8, splitY - 2, 5, 5);
      if (t > T_INTRO_END - 0.6) {                                              // ときどき線の上を光が走る
        const sp = ((t * 0.18) % 1.5) - 0.25, sx = x0 + (x1 - x0) * sp;
        const s0 = Math.max(x0, sx - 50), s1 = Math.min(x1, sx);          // 線の内側に収まる部分だけ描く
        c.globalAlpha = a * 0.85; c.fillStyle = C.white;
        if (s1 > s0) c.fillRect(s0, splitY - 1, s1 - s0, 3);
      }
    }
    // ロゴの上の小さな札と、下の副題
    const ta = tEase((t - 2.2) / 0.8);
    if (ta > 0) {
      c.globalAlpha = a * ta; c.fillStyle = C.orange; c.fillRect(ox, top - 26, 5, 5);
      tSpaced('PROTOTYPE BUILD 0.1', ox + 14, top - 20, 10, 'rgba(233,251,255,0.5)', 3);
    }
    const sa = tEase((t - 2.4) / 0.9);
    if (sa > 0) { c.globalAlpha = a * sa; tSpaced(TITLE_CONFIG.tagline, W / 2, top + L.h + 36, 11, 'rgba(120,235,250,0.8)', 7 + 9 * (1 - sa), 'center'); }
    c.restore();
  },

  // ---------- メニュー（画面の左下） ----------
  drawMenu(t, a) {
    const c = ctx;
    this.items.forEach((it, i) => {
      const ap = tEase((t - T_MENU_AT - i * 0.2) / 0.55);                        // 1項目ずつ順番に現れる
      if (ap <= 0) return;
      const compact = W < 620, k = this.selAnim[i], sel = i === this.sel, cy = T_MENU_Y[i];
      const menuX = compact ? Math.max(38, W * 0.17) : T_MENU_X;
      const numberX = compact ? 10 : 44, lineX = compact ? 10 : 44;
      const x = menuX + k * 14 - (1 - ap) * 26, fontSize = compact ? (i === 0 ? 20 : 16) : it.size;
      c.save(); c.globalAlpha = a * ap;
      text('0' + (i + 1), numberX, cy - 8, compact ? 8 : 10, sel ? C.cyan : 'rgba(61,242,255,0.5)');
      const col = sel ? C.white : (i === 0 ? 'rgba(233,251,255,0.8)' : 'rgba(233,251,255,0.5)');   // START GAME は選んでいなくても明るい
      tSpaced(it.label, x, cy, fontSize, col, fontSize > 24 ? 6 : 4, 'left', sel ? 12 + 4 * Math.sin(t * 4) : (i === 0 ? 4 : 0));
      const ly = cy + 12, len = Math.min(compact ? W - lineX - 14 : 296, Math.round(34 + k * 262)); // 選ぶと線が伸びる
      c.fillStyle = sel ? 'rgba(61,242,255,0.9)' : 'rgba(233,251,255,0.18)'; c.fillRect(lineX, ly, Math.max(10, len), 1);
      if (k > 0.05) {
        c.globalAlpha = a * ap * k;
        const sx = 44 + len * ((t * 0.9 + i) % 1);                                // 線の上を走る光
        c.fillStyle = 'rgba(233,251,255,0.35)'; c.fillRect(Math.round(sx - 40), ly, 20, 1);
        c.fillStyle = C.white; c.fillRect(Math.round(sx - 20), ly - 1, 20, 3);
        c.fillStyle = C.cyan; c.beginPath(); c.moveTo(26, cy - it.size * 0.72); c.lineTo(32, cy - it.size * 0.72); c.lineTo(27, cy + 2); c.lineTo(21, cy + 2); c.closePath(); c.fill();   // 斜めの印
        c.globalAlpha = a * ap * k * (0.6 + 0.4 * Math.sin(t * 6)); c.fillStyle = C.orange; c.fillRect(44 + len + 7, ly - 2, 4, 5);
      }
      c.restore();
    });
  },

  // ---------- 四隅の枠・小さな表示 ----------
  drawFrame(t) {
    const c = ctx, a = tEase((t - 0.4) / 1.2) * (1 - this.subP * 0.5);
    c.save(); c.globalAlpha = a; c.strokeStyle = 'rgba(61,242,255,0.5)'; c.lineWidth = 1; c.beginPath();
    [[20, 20, 1, 1], [W - 20, 20, -1, 1], [20, H - 20, 1, -1], [W - 20, H - 20, -1, -1]].forEach(([x, y, sx, sy]) => {
      c.moveTo(x + sx * 22 + 0.5, y + 0.5); c.lineTo(x + 0.5, y + 0.5); c.lineTo(x + 0.5, y + sy * 22 + 0.5);
    });
    c.stroke();
    tSpaced('SYSTEM STANDBY', W - 56, 40, 10, 'rgba(233,251,255,0.45)', 3, 'right');
    c.fillStyle = C.cyan; c.globalAlpha = a * (Math.sin(t * 3) > 0 ? 0.9 : 0.25); c.fillRect(W - 46, 32, 6, 6);
    if (t > T_MENU_AT) {
      c.globalAlpha = a * tEase((t - T_MENU_AT - 0.8) / 0.8);
      if (W < 620) tSpaced(this.sub ? 'TAP TO BACK' : 'TAP TO SELECT', W / 2, H - 36, 8, 'rgba(233,251,255,0.42)', 2, 'center');
      else tSpaced(this.sub ? 'ESC  BACK' : 'UP / DOWN  SELECT      ENTER  CONFIRM', 40, H - 36, 10, 'rgba(233,251,255,0.42)', 3);
    }
    c.restore();
  },

  // ---------- START GAME のあとの演出（光の線が走り、暗転する） ----------
  drawLeave(k, t) {
    const c = ctx, y = Math.round(T_LOGO_TOP + this.logo.h * 0.58), w = W * tEase(k / 0.45);
    c.save();
    c.globalAlpha = 1 - tClamp((k - 0.55) / 0.3); c.fillStyle = C.white; c.shadowColor = C.cyan; c.shadowBlur = 18;
    c.fillRect(W / 2 - w / 2, y - 1, w, 2);
    c.restore();
    c.fillStyle = `rgba(0,0,0,${tEase((k - 0.35) / 0.65)})`; c.fillRect(0, 0, W, H);
  },

  // ゲーム開始後の明転（game.js の draw() の最後で呼ぶ）
  drawFade() {
    if (this.fade <= 0) return;
    const k = this.fade / T_FADE_IN;
    ctx.fillStyle = `rgba(0,0,0,${k * k})`; ctx.fillRect(0, 0, W, H);
  },

  // ---------- CONTROLS / SETTINGS の画面 ----------
  drawSub(t) {
    const c = ctx, P = T_PANEL, k = tEase(this.subP);
    c.save();
    c.globalAlpha = k * 0.6; c.fillStyle = '#01030a'; c.fillRect(0, 0, W, H);            // 後ろの景色を暗くする
    c.globalAlpha = k;
    if (W < 860) {
      const scale = Math.min(1, (W - 24) / P.w);
      c.translate(W / 2, H / 2); c.scale(scale, scale); c.translate(-480, -270);
    }
    c.translate(0, (1 - k) * 14);
    chamfer(P.x, P.y, P.w, P.h, 16); c.fillStyle = 'rgba(2,6,10,0.84)'; c.fill();
    c.strokeStyle = 'rgba(61,242,255,0.55)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = C.cyan; c.fillRect(P.x + 16, P.y, 60, 2); c.fillRect(P.x + P.w - 76, P.y + P.h - 2, 60, 2);
    tSpaced(this.sub === 'controls' ? 'CONTROLS' : this.sub === 'keybinds' ? 'KEY BINDINGS' : 'SETTINGS', P.x + 36, P.y + 52, 24, C.white, 6, 'left', 10);
    c.fillStyle = 'rgba(61,242,255,0.5)'; c.fillRect(P.x + 36, P.y + 66, P.w - 72, 1);
    c.fillStyle = C.cyan; c.fillRect(P.x + 36, P.y + 65, 90, 3);
    if (this.sub === 'controls') this.drawControls(); else if (this.sub === 'keybinds') this.drawKeybinds(); else this.drawSettings(t);
    c.restore();
  },

  drawControls() {
    const c = ctx, P = T_PANEL;
    const keyRows = [
      [`${keyCodeLabel(titleBoundKey('left'))} / ${keyCodeLabel(titleBoundKey('right'))}`, '移動'],
      [keyCodeLabel(titleBoundKey('jump')), 'ジャンプ'],
      [`${keyCodeLabel(titleBoundKey('guard'))} TAP`, 'ジャストパリィ / ゲージ+20'],
      [`${keyCodeLabel(titleBoundKey('guard'))} HOLD`, 'ガード / 被弾時ゲージ-10'],
      [keyCodeLabel(titleBoundKey('dodge')), '回避'],
      [`CLICK / ${keyCodeLabel(titleBoundKey('attack'))}`, '通常攻撃・長押し強攻撃'],
      [keyCodeLabel(titleBoundKey('ult')), 'ロックオン必殺技'],
      [keyCodeLabel(titleBoundKey('skill')), '高速直進斬り'],
      [`JUMP + ${keyCodeLabel(titleBoundKey('left'))}/${keyCodeLabel(titleBoundKey('right'))}`, '空中斜め下攻撃'],
      [keyCodeLabel(titleBoundKey('appeal')), 'アピール'],
      [keyCodeLabel(titleBoundKey('inventory')), 'インベントリー'],
      [keyCodeLabel(titleBoundKey('info')), '操作説明'],
    ];
    const split = Math.ceil(keyRows.length / 2);
    keyRows.forEach(([key, label], i) => {
      const col = i < split ? 0 : 1, row = i < split ? i : i - split;
      const x = P.x + 24 + col * 318, cy = P.y + 90 + row * 38;
      chamfer(x, cy - 14, 112, 28, 6); c.strokeStyle = 'rgba(61,242,255,0.85)'; c.lineWidth = 1; c.stroke();
      textFit(key, x + 56, cy + 4, 9, C.cyan, 'center', 102, 6.5);
      textFit(label, x + 122, cy + 5, 11, C.white, 'left', col === 0 ? 178 : Math.max(80, W - x - 128), 7);
      c.fillStyle = 'rgba(233,251,255,0.07)'; c.fillRect(x, cy + 23, 292, 1);
    });
    this.drawBack(true);
  },

  // BACK ボタン（サブ画面の左下）
  drawBack(on) {
    const c = ctx, g = T_SET_GEO.back;
    chamfer(g.x, g.y, g.w, g.h, 8); c.fillStyle = on ? 'rgba(61,242,255,0.14)' : 'rgba(255,255,255,0.03)'; c.fill();
    c.strokeStyle = on ? C.cyan : 'rgba(233,251,255,0.25)'; c.lineWidth = on ? 2 : 1; c.shadowColor = C.cyan; c.shadowBlur = on ? 12 : 0; c.stroke(); c.shadowBlur = 0;
    tSpaced('< BACK', g.x + 24, g.cy + 6, 16, on ? C.white : 'rgba(233,251,255,0.6)', 4);
    text('ESC', g.x + g.w - 16, g.cy + 4, 10, 'rgba(233,251,255,0.45)', 'right');
  },

  drawSettings(t) {
    const c = ctx, V = T_SET_GEO.volume;
    const rowBase = (r, on, label, desc) => {
      chamfer(r.x, r.y, r.w, r.h, 10); c.fillStyle = on ? 'rgba(61,242,255,0.09)' : 'rgba(255,255,255,0.02)'; c.fill();
      c.strokeStyle = on ? C.cyan : 'rgba(233,251,255,0.18)'; c.lineWidth = on ? 1.5 : 1; c.shadowColor = C.cyan; c.shadowBlur = on ? 10 : 0; c.stroke(); c.shadowBlur = 0;
      tSpaced(label, r.x + 28, r.cy - 2, 14, on ? C.white : 'rgba(233,251,255,0.7)', 1.4);
      textFit(desc, r.x + 28, r.cy + 18, 10, 'rgba(233,251,255,0.45)', 'left', 360, 7);
    };
    // 音量：10個の目盛りで表示。◀ ▶・バーのクリック・ドラッグ・左右キーで変えられる
    const onV = this.row === 0;
    rowBase(V, onV, 'MASTER VOLUME', '効果音と環境音の大きさ');
    for (let i = 0; i < 10; i++) {
      const lit = i < Settings.volume;
      c.fillStyle = lit ? (i >= 8 ? C.orange : C.cyan) : 'rgba(233,251,255,0.12)';
      c.fillRect(T_VOL.barX + i * T_VOL.step, V.cy - 9, T_VOL.segW, 18);
    }
    c.fillStyle = onV ? C.cyan : 'rgba(233,251,255,0.5)';
    c.beginPath(); c.moveTo(T_VOL.leftX + 8, V.cy - 8); c.lineTo(T_VOL.leftX - 4, V.cy); c.lineTo(T_VOL.leftX + 8, V.cy + 8); c.fill();
    c.beginPath(); c.moveTo(T_VOL.rightX - 8, V.cy - 8); c.lineTo(T_VOL.rightX + 4, V.cy); c.lineTo(T_VOL.rightX - 8, V.cy + 8); c.fill();
    tSpaced(`${Settings.volume * 10}%`, V.x + V.w - 24, V.cy + 6, 16, C.white, 2, 'right');
    // ON / OFF の項目（画面の揺れ・画面が光る演出）
    [['shake', 'SCREEN SHAKE', '攻撃・被弾のときの画面の揺れ'], ['flash', 'SCREEN FLASH', '必殺技などで画面が白く光る演出']].forEach(([id, label, desc], n) => {
      const r = T_SET_GEO[id];
      rowBase(r, this.row === n + 1, label, desc);
      [['ON', T_TOGGLE.onX, true], ['OFF', T_TOGGLE.offX, false]].forEach(([name, x, val]) => {
        const active = Settings[id] === val;
        chamfer(x, r.cy - 16, T_TOGGLE.w, T_TOGGLE.h, 6); c.fillStyle = active ? 'rgba(61,242,255,0.2)' : 'rgba(255,255,255,0.02)'; c.fill();
        c.strokeStyle = active ? C.cyan : 'rgba(233,251,255,0.25)'; c.lineWidth = 1; c.stroke();
        text(name, x + T_TOGGLE.w / 2, r.cy + 5, 13, active ? C.white : 'rgba(233,251,255,0.45)', 'center');
      });
    });
    const K = T_SET_GEO.keybinds;
    rowBase(K, this.row === 3, 'KEY BINDINGS', '各操作に使うキーを変更する');
    chamfer(K.x + K.w - 168, K.cy - 16, 142, 32, 6); c.fillStyle = this.row === 3 ? 'rgba(61,242,255,0.2)' : 'rgba(255,255,255,0.03)'; c.fill();
    c.strokeStyle = C.cyan; c.lineWidth = 1; c.stroke();
    text('CONFIGURE  ›', K.x + K.w - 97, K.cy + 5, 11, C.cyan, 'center');
    this.drawBack(T_SET_ROWS[this.row] === 'back');
    textFit('UP / DOWN SELECT   LEFT / RIGHT ADJUST   ENTER CONFIRM', T_PANEL.x + T_PANEL.w - 36, T_SET_GEO.back.cy + 5, 9, 'rgba(233,251,255,0.42)', 'right', 360, 6.5);
  },

  drawKeybinds() {
    const c = ctx, P = T_PANEL;
    text('項目をクリックしてから、割り当てたいキーを押してください', P.x + 24, P.y + 83, 10, 'rgba(233,251,255,0.68)');
    KEY_BIND_ACTIONS.forEach((item, i) => {
      const col = i < 6 ? 0 : 1, row = i % 6;
      const x = col === 0 ? T_KEY_GEO.leftX : T_KEY_GEO.rightX;
      const y = T_KEY_GEO.y + row * T_KEY_GEO.rowH - 13;
      const selected = this.row === i, waiting = this.captureAction === item.id;
      chamfer(x, y, T_KEY_GEO.rowW, 30, 5);
      c.fillStyle = waiting ? 'rgba(255,138,31,0.16)' : selected ? 'rgba(61,242,255,0.12)' : 'rgba(255,255,255,0.025)'; c.fill();
      c.strokeStyle = waiting ? C.orange : selected ? C.cyan : 'rgba(233,251,255,0.2)'; c.lineWidth = waiting || selected ? 1.5 : 1; c.stroke();
      textFit(item.label, x + 8, y + 19, 10, C.white, 'left', 162, 8);
      chamfer(x + 190, y + 4, 96, 22, 4); c.fillStyle = waiting ? 'rgba(255,138,31,0.2)' : 'rgba(61,242,255,0.07)'; c.fill();
      c.strokeStyle = waiting ? C.orange : 'rgba(61,242,255,0.5)'; c.lineWidth = 1; c.stroke();
      const shown = waiting ? 'PRESS KEY...' : keyCodeLabel(titleBoundKey(item.id));
      textFit(shown, x + 238, y + 19, 9, waiting ? C.orange : C.cyan, 'center', 88, 6);
    });
    const backOn = this.row >= KEY_BIND_ACTIONS.length;
    this.drawBack(backOn);
    const status = this.captureAction ? (this.keybindMessage && this.keybindMessage !== 'キーを押してください' ? this.keybindMessage : 'キー入力待ち：ESCでキャンセル') : this.keybindMessage || '同じキーの重複割り当てはできません';
    textFit(status, P.x + P.w - 24, P.y + P.h - 18, 9, this.captureAction ? C.orange : 'rgba(233,251,255,0.55)', 'right', 360, 7);
  },
};
