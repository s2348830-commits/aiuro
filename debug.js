'use strict';
// 開発者モードはこのファイルだけで追加される。debug.js を削除するとボタンも表示されない。
(() => {
  const pauseMenu = document.getElementById('pauseMenu');
  const mainPanel = document.getElementById('pauseMainPanel');
  if (!pauseMenu || !mainPanel) return;

  const debug = window.DebugTools = {
    showHitboxes: false,        // 青：プレイヤー・敵の本体ヒットボックス
    showAttackBoxes: false,     // 赤：プレイヤーと敵の攻撃判定
    showInvulnerability: false, // 緑：無敵状態の範囲
  };

  const button = document.createElement('button');
  button.id = 'pauseDeveloper';
  button.type = 'button';
  button.textContent = '開発者モード';
  button.setAttribute('aria-controls', 'pauseDeveloperPanel');

  const panel = document.createElement('section');
  panel.id = 'pauseDeveloperPanel';
  panel.className = 'pause-panel pause-developer hidden';
  panel.setAttribute('aria-labelledby', 'pauseDeveloperTitle');
  panel.innerHTML = `
    <p class="pause-kicker">DEVELOPER TOOLS</p>
    <h1 id="pauseDeveloperTitle">開発者モード</h1>
    <p class="pause-subtitle">表示したい判定をONにしてください</p>
    <label class="pause-check debug-option debug-blue">
      <input id="debugHitboxes" type="checkbox">
      <span><strong>青色</strong>：ヒットボックス（プレイヤー・敵）</span>
    </label>
    <label class="pause-check debug-option debug-red">
      <input id="debugAttackBoxes" type="checkbox">
      <span><strong>赤色</strong>：攻撃判定（攻撃範囲・弾丸）</span>
    </label>
    <label class="pause-check debug-option debug-green">
      <input id="debugInvulnerability" type="checkbox">
      <span><strong>緑色</strong>：プレイヤーの無敵状態</span>
    </label>
    <div class="debug-legend">
      <span><i class="debug-dot blue"></i>HITBOX</span>
      <span><i class="debug-dot red"></i>ATTACK</span>
      <span><i class="debug-dot green"></i>INVULNERABLE</span>
    </div>
    <button id="pauseDeveloperBack" type="button">メニューに戻る</button>
    <p class="pause-hint">各項目はON/OFF切り替えできます</p>
  `;

  const hint = mainPanel.querySelector('.pause-hint');
  if (hint) mainPanel.insertBefore(button, hint);
  else mainPanel.appendChild(button);
  pauseMenu.appendChild(panel);

  const bindToggle = (id, key) => {
    const input = panel.querySelector(`#${id}`);
    input.addEventListener('change', () => { debug[key] = input.checked; });
    return input;
  };
  const hitboxes = bindToggle('debugHitboxes', 'showHitboxes');
  const attacks = bindToggle('debugAttackBoxes', 'showAttackBoxes');
  const invuln = bindToggle('debugInvulnerability', 'showInvulnerability');

  button.addEventListener('click', () => {
    mainPanel.classList.add('hidden');
    const settingsPanel = document.getElementById('pauseSettingsPanel');
    if (settingsPanel) settingsPanel.classList.add('hidden');
    panel.classList.remove('hidden');
  });
  panel.querySelector('#pauseDeveloperBack').addEventListener('click', () => {
    panel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  });

  // メニューを閉じてから再度開いても切り替え状態を維持し、状態とチェック表示を同期する。
  Object.defineProperty(debug, 'syncControls', {
    value() {
      hitboxes.checked = debug.showHitboxes;
      attacks.checked = debug.showAttackBoxes;
      invuln.checked = debug.showInvulnerability;
    },
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !panel.classList.contains('hidden')) {
      event.preventDefault(); event.stopImmediatePropagation();
      panel.classList.add('hidden'); mainPanel.classList.remove('hidden');
    }
  }, true);
})();
