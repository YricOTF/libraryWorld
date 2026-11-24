'use strict';

/* ---------- SHUTDOWN：MV 结束后的 Y/N ---------- */
const SHUT = { t0: 0, phase: 'prompt', outT0: 0, line: 0 };
const SHUT_BTN = { yx: 0, yy: 0, nx: 0, ny: 0 };   // Y / N 的可点区域（手机没键盘）
function shutPick(what) {
  if (SHUT.phase === 'out') return;
  if (what === 'yes') { SHUT.phase = 'out'; SHUT.outT0 = performance.now(); }
  else { SEEK.started = false; SEEK.text = ''; SEEK.ok = false; enterStage('SEARCH_INPUT'); }
}
function renderShutdownStage() {
  const f = FRAME, L = getL(), C = COL();
  const now = performance.now();
  if (!SHUT.t0) SHUT.t0 = now;
  const dim = clamp((now - SHUT.t0) / 9000, 0, 1);          // 亮度逐渐降低
  const k = 1 - dim * 0.78;
  f.clear();
  const lines = [
    '> EXECUTION COMPLETE.',
    '> SELF SYSTEM WILL NOW SHUT DOWN.',
    '> PROCEED?   [Y/n]'
  ];
  const baseY = Math.round(L.R * 0.42);
  const p = SHUT.phase === 'out' ? clamp((now - SHUT.outT0) / 800, 0, 1) : 0;
  for (let i = 0; i < lines.length; i++) {
    // 关机动画：整行向底部收缩，同时亮度衰减到 0
    const y = Math.round(baseY + i * 3 + p * (L.R - 3 - (baseY + i * 3)));
    const kk = SHUT.phase === 'out' ? k * (1 - p) : k;
    f.centerText(y, lines[i], mixRGB(hexToRgb(C.black), hexToRgb(i === 2 ? C.pure : C.bright), kk), i === 2);
  }
  if (SHUT.phase !== 'out') {
    const blink = (now % 1000) < 520;
    if (blink) {
      const w = strW(lines[2]);
      f.set(Math.floor(L.C / 2 + w / 2) + 2, baseY + 6, '_', C.pure, true);
    }
    // Y / N 画成能点的按钮：手机端没有键盘，光提示按键等于进不去第二首
    const bw = 22, by2 = baseY + 9;
    const yx = Math.floor(L.C / 2) - bw - 2, nx = Math.floor(L.C / 2) + 2;
    for (const bb of [[yx, ' Y   SHUT DOWN '], [nx, ' N   SEARCH    ']]) {
      for (let i = 0; i < bw; i++) { f.set(bb[0] + i, by2, '-', C.mid); f.set(bb[0] + i, by2 + 2, '-', C.mid); }
      for (let j = 0; j <= 2; j++) { f.set(bb[0], by2 + j, '|', C.mid); f.set(bb[0] + bw - 1, by2 + j, '|', C.mid); }
      f.text(bb[0] + 2, by2 + 1, bb[1], C.bright, true);
    }
    SHUT_BTN.yx = yx; SHUT_BTN.yy = by2; SHUT_BTN.nx = nx; SHUT_BTN.ny = by2;
    f.centerText(L.R - 2, 'TAP A BUTTON   ·   OR PRESS  Y / N', C.dark);
  }
  if (SHUT.phase === 'out' && p >= 1) { try { location.reload(); } catch (e) { /* 忽略 */ } }
  present(f);
}

/* ---------- SEARCH_INPUT：输入 world.search(you); ---------- */
const SEEK = { text: '', errT: 0, okP: 0, ok: false, started: false };
const SEEK_KEY = 'world.search(you);';
function seekNormalize(s) {
  return String(s || '').trim().toLowerCase().replace(/;+$/, '');
}
function seekCheck() {
  if (seekNormalize(SEEK.text) === seekNormalize(SEEK_KEY)) {
    SEEK.ok = true; SEEK.okP = 0;
    return true;
  }
  SEEK.errT = 1000;
  return false;
}
function renderSearchInputStage(dt) {
  const f = FRAME, L = getL(), C = COL();
  if (!SEEK.started) { SEEK.started = true; seekFocus(true); }
  f.clear();
  const cx = Math.floor(L.C / 2), cy = Math.round(L.R * 0.36);
  const warm = SEEK.ok ? clamp(SEEK.okP / 1200, 0, 1) : 0;
  const mix = function (h) { return mixRGB(hexToRgb(C.black), hexToRgb(h), 0.25 + (1 - warm) * 0.75); };
  const blink = (performance.now() % 1200) < 600;
  f.centerText(cy - 5, '> SEARCHING...', mix(C.mid));
  const tw = strW(SEEK.text);
  const caretX = cx + Math.round(tw / 2) + 1;
  if (SEEK.text) f.rightText(caretX - 1, cy, SEEK.text, mix(C.bright), true);
  f.set(caretX, cy, (blink || SEEK.ok) ? '_' : ' ', mix(C.pure), true);
  if (SEEK.errT > 0) {
    SEEK.errT -= dt * 1000;
    if ((performance.now() % 300) < 220) f.centerText(cy + 5, '> INVALID COMMAND', C.alert, true);
  }
  if (!SEEK.ok) f.centerText(L.R - 3, 'TYPE  world.search(you);   ·   SPACE TO CONFIRM', C.dark);
  else {
    // 成功：一层暖色渐染，覆盖全屏
    triggerTint(CREAM_PRESET.colors.black, warm * 0.22);
  }
  present(f);
}
function seekFocus(on) {
  const el = document.getElementById('seekInput');
  if (!el) return;
  if (!on) { el.style.display = 'none'; return; }
  const L = getL(), v = viewRect();
  const cw = v.dw / CONFIG.gridCols, chh = v.dh / CONFIG.gridRows;
  const cx = Math.floor(L.C / 2), cy = Math.round(L.R * 0.36);
  el.style.display = 'block';
  el.style.left = (v.dx + (cx - 30) * cw) + 'px';
  el.style.top = (v.dy + (cy - 0.5) * chh) + 'px';
  el.style.width = (60 * cw) + 'px';
  el.style.height = (chh * 1.6) + 'px';
  el.style.fontSize = Math.max(16, CONFIG.fontSize * cw / CONFIG.cellW) + 'px';
  el.style.color = 'transparent';
  el.style.background = 'transparent';
  try { el.focus(); } catch (e) { /* 忽略 */ }
}

/* ---------- 第二首的加载与启动 ---------- */
function prepareSong(song) {
  SONGS.current = song;
  const list = songCandidates(song);
  const manual = SONGS.src[song];
  AUDIO_CANDIDATES.length = 0;
  if (manual && manual.url) AUDIO_CANDIDATES.push(manual.url);
  for (let i = 0; i < list.length; i++) AUDIO_CANDIDATES.push(list[i]);
  AUDIO.idx = 0; AUDIO.ok = false; AUDIO.failed = false; AUDIO.duration = 0;
  loadSource(0);
}
function startSearchSong() {
  STYLE.apply('CREAM');                  // apply 收的是预设 id
  STYLE.current = 'CREAM';
  // 只改运行期风格，不写 localStorage —— 否则下一次打开会把米黄当成"你选的风格"恢复
  // （想恢复第一首的观感：刷新页面即可，存档里仍是用户当初选的预设）
  try { audioEl.pause(); } catch (e) { /* 忽略 */ }
  try { audioEl.currentTime = 0; } catch (e) { /* 忽略 */ }
  prepareSong('search');
  LOAD.song = 'search'; LOAD.to = 'MV';
  LOAD.done = false; LOAD.t0 = performance.now(); LOAD.shown = 0; LOAD.forced = false;
  enterStage('LOADING');
}

/* ---- 启动 ---- */
const styleSelector = new StyleSelector();
function boot() {
  resize();
  initGrid();
  styleSelector.init();
  STAGE = 'STYLE';
  stageStart = performance.now();
  bindEvents();
  layoutInputBox();
  loadSource(0);                                // 从 music.mp3 开始尝试（元素自带 src，这里确保走统一流程）
  requestAnimationFrame(loop);
  previewLoop();
}
boot();
