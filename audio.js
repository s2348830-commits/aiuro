'use strict';
// ===== 設定とサウンド =====
// Settings : 設定画面で変えられる値。ブラウザに保存されるので、次に開いたときも残る
// Sound    : 音は外部ファイルを使わず、WebAudioでその場で作って鳴らす
//            （音量は Settings.volume で変わる）

const Settings = {
  volume: 6,      // 音量 0〜10
  shake: true,    // 画面の揺れ（false にすると揺れない）
  flash: true,    // 画面が白く光る演出（false にすると光らない）
  keybinds: {
    left: 'KeyA', right: 'KeyD', jump: 'KeyW', guard: 'Space', dodge: 'ShiftLeft',
    crouch: 'KeyS', attack: 'KeyJ', skill: 'KeyE', ult: 'KeyQ', inventory: 'Tab', info: 'KeyF', appeal: 'KeyV',
  },

  load() {
    try {
      const d = JSON.parse(localStorage.getItem('voidshift.settings') || '{}');
      if (Number.isInteger(d.volume) && d.volume >= 0 && d.volume <= 10) this.volume = d.volume;
      if (typeof d.shake === 'boolean') this.shake = d.shake;
      if (typeof d.flash === 'boolean') this.flash = d.flash;
      if (d.keybinds && typeof d.keybinds === 'object') {
        for (const action of Object.keys(this.keybinds)) {
          const code = d.keybinds[action];
          if (typeof code === 'string' && code.length > 0 && code.length < 32) this.keybinds[action] = code;
        }
      }
    } catch (err) { /* 読めなくても初期値のまま動く */ }
  },
  save() {
    try { localStorage.setItem('voidshift.settings', JSON.stringify({ volume: this.volume, shake: this.shake, flash: this.flash, keybinds: this.keybinds })); } catch (err) { /* 保存できない環境では何もしない */ }
  },
};
Settings.load();

const Sound = {
  ac: null, master: null, noiseBuf: null,
  drone: null, droneWanted: false, last: {},

  // ブラウザの決まりで、最初のキー入力かクリックの後でないと音を出せない。そのとき1回だけ準備する
  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.connect(this.ac.destination);
      // ノイズ音のもと（1秒ぶんのランダム波形）
      this.noiseBuf = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolume();
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    this.syncDrone();
  },

  // 設定の音量(0〜10)を実際の大きさに反映する。2乗にして、小さい値でも変化が分かるようにしている
  applyVolume() {
    if (!this.master) return;
    const v = Settings.volume / 10;
    this.master.gain.setTargetAtTime(v * v * 0.9, this.ac.currentTime, 0.02);
  },

  // 単音。freq から to へ音程をすべらせながら鳴らす
  tone(freq, dur, type = 'sine', vol = 0.2, to = freq, delay = 0) {
    if (!this.ac || Settings.volume === 0) return;
    const t0 = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },

  // ノイズ音（風切り音や衝撃音）。フィルターの中心を from から to へ動かす
  noise(dur, vol = 0.2, from = 2000, to = from, type = 'bandpass') {
    if (!this.ac || Settings.volume === 0) return;
    const t0 = this.ac.currentTime;
    const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    src.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  },

  // 効果音。同じ音が一瞬に何度も重ならないよう、40ms以内の連続は無視する
  play(name) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    switch (name) {
      case 'move':   this.tone(1250, 0.05, 'square', 0.04, 900); break;
      case 'ok':     this.tone(660, 0.08, 'triangle', 0.14); this.tone(990, 0.14, 'triangle', 0.14, 990, 0.07); break;
      case 'back':   this.tone(520, 0.1, 'triangle', 0.12, 330); break;
      case 'start':  this.tone(70, 0.9, 'sawtooth', 0.1, 640); this.noise(0.9, 0.16, 300, 5000); break;
      case 'hit':    this.noise(0.07, 0.22, 2600, 800); this.tone(150, 0.08, 'sine', 0.22, 50); break;
      case 'heavy':  this.noise(0.14, 0.3, 1800, 300); this.tone(110, 0.2, 'sine', 0.32, 40); break;
      case 'skill':  this.noise(0.22, 0.14, 800, 4500, 'highpass'); break;
      case 'guard':  this.tone(420, 0.07, 'triangle', 0.12, 260); break;
      case 'parry':  this.tone(900, 0.12, 'triangle', 0.2, 1500); this.noise(0.16, 0.16, 3200, 800, 'highpass'); break;
      case 'ult':    this.tone(90, 0.7, 'sawtooth', 0.12, 520); this.noise(0.7, 0.2, 400, 3000); this.tone(60, 0.5, 'sine', 0.3, 30, 0.12); break;
    }
  },

  // タイトル画面の環境音（低く小さな持続音）。true で鳴らし、false でゆっくり消す
  setDrone(on) { this.droneWanted = on; this.syncDrone(); },
  syncDrone() {
    if (!this.ac) return;
    const t0 = this.ac.currentTime;
    if (this.droneWanted && !this.drone) {
      const g = this.ac.createGain(), lp = this.ac.createBiquadFilter(), lfo = this.ac.createOscillator(), lfoG = this.ac.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
      lfo.frequency.value = 0.07; lfoG.gain.value = 90;       // フィルターをゆっくり揺らす
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 3);
      const oscs = [[55, 'sawtooth'], [55.7, 'sawtooth'], [110.4, 'sine'], [164.8, 'sine']].map(([f, type]) => {
        const o = this.ac.createOscillator();
        o.type = type; o.frequency.value = f; o.connect(lp); o.start(t0);
        return o;
      });
      lp.connect(g); g.connect(this.master); lfo.start(t0);
      this.drone = { g, nodes: [...oscs, lfo] };
    } else if (!this.droneWanted && this.drone) {
      const d = this.drone;
      this.drone = null;
      d.g.gain.cancelScheduledValues(t0);
      d.g.gain.setValueAtTime(Math.max(0.0001, d.g.gain.value), t0);
      d.g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
      d.nodes.forEach((n) => n.stop(t0 + 0.9));
    }
  },
};
