'use strict';

const C_BRAND = 'MILI // WORLD.EXECUTE(ME);';

/* ---------------------------------------------------------------------------
   [14] StyleSelector —— 风格选择界面
   整个界面本身就是字符网格，切换风格时立即用新风格重绘。
   预览窗口跑一个独立的 4 秒循环动画（自带独立 rAF 时钟）。
   --------------------------------------------------------------------------- */
let previewRAF = 0;
function previewLoop() {
  if (STAGE !== 'STYLE') { previewRAF = 0; return; }   // 离开该阶段就自然停表，不泄漏
  previewRAF = requestAnimationFrame(previewLoop);
}
function saveStyle() { try { localStorage.setItem(STYLE_KEY, STYLE.current); } catch (e) { /* 隐私模式忽略 */ } }

class StyleSelector {
  constructor() {
    this.index = 0;
    this.hover = -1;
    this.itemRows = [];
    this.itemX0 = 0;
    this.itemX1 = 0;
  }
  init() {
    let saved = null;
    try { saved = localStorage.getItem(STYLE_KEY); } catch (e) { saved = null; }
    const i = STYLE_PRESETS.findIndex(p => p.id === saved);
    this.index = i >= 0 ? i : 0;                       // 无效值回落第一个预设
    STYLE.apply(STYLE_PRESETS[this.index].id);
  }
  current() { return STYLE_PRESETS[this.index]; }
  move(d) {
    this.index = (this.index + d + STYLE_PRESETS.length) % STYLE_PRESETS.length;
    this.applyCurrent();
  }
  applyCurrent() {
    STYLE.apply(this.current().id);
    saveStyle();
    triggerFlash(0.10);              // 切风格时轻微闪一下，强化"换管"手感
  }
  handleKey(e) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { this.move(-1); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { this.move(1); e.preventDefault(); }
    else if (k === 'Enter' || k === ' ') { this.confirm(); e.preventDefault(); }
    else if (k >= '1' && k <= '6') { this.index = Number(k) - 1; this.applyCurrent(); }
  }
  confirm() {
    saveStyle();
    confirmStyleSelection();
  }
  render(frame) {
    const L = getL(), C = COL();
    frame.box(0, 0, L.C, L.R, C.mid);
    frame.text(3, L.hdr, 'WORLD.EXECUTE(ME);', C.pure, true);
    frame.rightText(L.C - 4, L.hdr, 'SELF SYSTEM v1.0  //  TERMINAL READY', C.dark);
    frame.centerText(2, '┤ SELECT VISUAL STYLE ├', C.bright, true);
    frame.centerText(4, '─ '.repeat(1) + 'CHOOSE HOW THE WORLD LOOKS WHEN I EXECUTE MYSELF' + ' ─'.repeat(1), C.dark);

    // 风格列表
    const rows = [];
    for (let i = 0; i < STYLE_PRESETS.length; i++) {
      const p = STYLE_PRESETS[i];
      const y = 10 + i * 2;
      rows.push(y);
      const sel = (i === this.index), hov = (i === this.hover);
      frame.text(38, y, sel ? '>' : ' ', C.pure);
      frame.text(41, y, ('0' + (i + 1)).slice(-2), sel ? C.light : C.deep);
      const nameEnd = frame.text(45, y, p.name, sel ? C.pure : (hov ? C.bright : C.mid), sel);
      // 引导点：从英文名一直连到中文名，像终端里的目录树条目
      for (let x = nameEnd + 1; x < 80; x++) frame.set(x, y, '·', sel ? C.deep : C.glowFar);
      frame.rightText(90, y, p.nameCN, sel ? C.bright : C.dark);
      if (sel) frame.text(93, y, '◄ ACTIVE', C.light);
    }
    this.itemRows = rows; this.itemX0 = 34; this.itemX1 = 106;

    // 预览窗口
    const px = 52, py = 24, pw = 96, ph = 22;
    frame.box(px, py, pw, ph, C.mid, 'PREVIEW', C.bright);
    this.preview(frame, px + 2, py + 2, pw - 4, ph - 4);

    // 描述
    const p = this.current();
    frame.centerText(py + ph + 3, p.description, C.mid);

    // 音频来源状态框：让"换音频"这件事看得见（按 M 或直接点它）
    const aw = Math.min(112, L.C - 30), ax = Math.floor((L.C - aw) / 2), ay = py + ph + 7;
    frame.box(ax, ay, aw, 4, C.mid, 'AUDIO SOURCE', C.bright);
    frame.text(ax + aw - 12, ay, '[M] CHANGE', C.light);
    const cur = String(SRC.name || AUDIO_CANDIDATES[0] || 'music.mp3');
    const busy = SRC.note.indexOf('LOADING') === 0;
    const bad = SRC.note.indexOf('FAILED') >= 0 || SRC.note.indexOf('UNREADABLE') >= 0;
    frame.text(ax + 3, ay + 2, ('SOURCE  ' + cur).slice(0, aw - 20), bad ? C.alert : C.light);
    frame.rightText(ax + aw - 3, ay + 2,
      bad ? 'FAILED' : (AUDIO.duration > 0 ? fmtTime(AUDIO.duration) : (busy ? 'LOADING' : '--:--.-')),
      bad ? C.alert : C.mid);
    if (performance.now() - SRC.flash < 900) frame.box(ax, ay, aw, 4, C.bright, 'AUDIO SOURCE', C.pure);
    this.audioBox = { x: ax, y: ay, w: aw, h: 4 };
    // 从哪一首开始（按 F 或点这行；默认走原来的流程）
    const cur2 = START.open ? (START.text || '') : 'world.execute(me);';
    frame.centerText(L.R - 7, '[F] START FROM : ' + cur2 + (START.note ? '   ' + START.note : ''), C.dark);
    this.startBox = { x: Math.floor(L.C / 2) - 24, y: L.R - 7, w: 48, h: 1 };

    // 操作提示
    frame.centerText(L.R - 6, '[↑↓] NAVIGATE   [ENTER] CONFIRM   [1-6] QUICK PICK   [M] OPEN AUDIO PANEL' +
      (ENABLE_DEV_MODE ? '    [D] DEV MODE' : ''), C.bright);
    frame.centerText(L.R - 4, 'SET UP THE TERMINAL BEFORE YOU WAKE HER', C.deep);

    // 背景数据雨（只填下半屏，营造"终端待机"的呼吸感）
    for (let x = 2; x < L.C - 2; x++) {
      const sp = 0.3 + hash11(x * 4.1) * 1.4;
      const head = L.R - 2 - ((FX.t * 9 * sp + hash11(x * 9.7) * 40) % (L.R * 0.55));
      for (let j = 0; j < 6; j++) {
        const y = Math.floor(head) - j;
        if (y < py + ph + 8 || y > L.R - 8) continue;
        if (hash2(x * 2.1, y * 1.7) < 0.55) continue;
        frame.set(x, y, DENSITY[1 + Math.floor(hash2(x, y + Math.floor(FX.t)) * 3)], j === 0 ? C.dark : C.deep);
      }
    }
  }
  /* 4 秒循环预览：0-1s 打字机 / 1-2s EXECUTING / 2-3s 进度条 / 3-4s 故障闪烁 */
  preview(frame, x, y, w, h) {
    const C = COL();
    const p = ((performance.now() - stageStart) / 4000) % 1;
    const midY = y + Math.floor(h / 2);
    const txt = 'world.execute(me);';
    if (p < 0.25) {
      const k = p / 0.25;
      const shown = Math.floor(k * (txt.length + 2));
      frame.text(x + 4, midY - 2, txt.slice(0, Math.min(shown, txt.length)), C.pure, true);
      if ((FX.t * 3) % 1 < 0.6) frame.set(x + 4 + Math.min(shown, txt.length), midY - 2, '█', C.pure, true);
    } else if (p < 0.5) {
      frame.text(x + 4, midY - 2, txt, C.light);
      frame.text(x + 4, midY, '> EXECUTING...', C.bright, true);
      if ((FX.t * 2.4) % 1 < 0.6) frame.set(x + 4 + 15, midY, '█', C.pure, true);
    } else if (p < 0.75) {
      const k = (p - 0.5) / 0.25;
      frame.text(x + 4, midY - 2, txt, C.light);
      frame.text(x + 4, midY, '> EXECUTING...', C.bright);
      const cells = Math.max(10, w - 30), on = Math.round(k * cells);
      frame.text(x + 4, midY + 2, '[' + '█'.repeat(on) + '░'.repeat(cells - on) + '] ' +
        String(Math.round(k * 100)).padStart(3, ' ') + '%', C.mid);
    } else {
      // 故障：整块区域随机字符 + 色偏抖动
      const k = (p - 0.75) / 0.25;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (hash2(i * 1.3 + Math.floor(FX.t * 24), j * 2.7) > 0.35 + k * 0.4) continue;
          frame.set(x + i, y + j, DENSITY[Math.floor(hash2(i, j + Math.floor(FX.t * 30)) * DENSITY.length)],
            hash2(i * 3.1, j) > 0.85 ? C.alert : C.mid, true);
        }
      }
      frame.centerText(midY, 'SIGNAL LOST', C.alert, true);
    }
  }
  // 鼠标：悬停高亮 + 点击选中（点已选中项 = 确认）
  pointer(mx, my, click) {
    if (my < 0 || mx < 0) return false;
    let hit = -1;
    for (let i = 0; i < this.itemRows.length; i++) if (this.itemRows[i] === my) hit = i;
    if (hit >= 0 && mx >= this.itemX0 && mx <= this.itemX1) {
      this.hover = hit;
      if (click) {
        if (hit === this.index) this.confirm();
        else { this.index = hit; this.applyCurrent(); }
      }
      return true;
    }
    this.hover = -1;
    return false;
  }
}

/* ---------------------------------------------------------------------------
   [15] 阶段过渡：字符向中心收缩 → 一行 INITIALIZING DIALOGUE... → 淡出
   --------------------------------------------------------------------------- */
const TRANS = { active: false, t0: 0, chars: [], dur: 1.9, to: 'LOADING' };
function startTransition(to) {
  const f = FRAME, arr = [];
  for (let yy = 0; yy < f.rows; yy++) {
    const row = yy * f.cols;
    for (let xx = 0; xx < f.cols; xx++) {
      const c = f.ch[row + xx];
      if (c === ' ' || c === '\u0000') continue;
      arr.push(xx, yy, c, f.co[row + xx]);
    }
  }
  TRANS.chars = arr;
  TRANS.active = true;
  TRANS.t0 = performance.now();
  TRANS.to = to;
  STAGE = 'TRANSITION';
  triggerFlash(0.12);
  triggerGlitch(0.2);
}
function confirmStyleSelection() { startTransition('LOADING'); }

function renderTransition() {
  const L = getL(), C = COL(), f = FRAME;
  const p = clamp((performance.now() - TRANS.t0) / (TRANS.dur * 1000), 0, 1);
  f.clear();
  f.box(0, 0, L.C, L.R, C.deep);
  const cx = L.C / 2, cy = L.R / 2;
  const k = easeInOut(clamp(p / 0.6, 0, 1));
  const arr = TRANS.chars;
  for (let i = 0; i < arr.length; i += 4) {
    if (hash11(i * 0.37) < k * 0.6) continue;                 // 越收缩丢得越多
    const nx = Math.round(lerp(arr[i], cx, k));
    const ny = Math.round(lerp(arr[i + 1], cy, k));
    f.set(nx, ny, arr[i + 2], arr[i + 3]);
  }
  if (p > 0.6) {
    const txt = '> INITIALIZING DIALOGUE...';
    const shown = Math.floor(clamp((p - 0.6) / 0.32, 0, 1) * txt.length);
    const x0 = Math.floor((L.C - txt.length) / 2);
    f.text(x0, Math.round(cy), txt.slice(0, shown), C.pure, true);
    if ((FX.t * 2.4) % 1 < 0.6) f.set(x0 + shown, Math.round(cy), '█', C.pure, true);
  }
  FX.fade = clamp((p - 0.7) / 0.3, 0, 1);
  GlowEngine.process(f);
  drawOffCanvas(f);
  compositeToMain();
  if (p >= 1) { TRANS.active = false; enterStage(TRANS.to); }
}

/* ---------------------------------------------------------------------------
   [16] 音频管理
   规格要求音频为同目录 music.mp3；为兼容"手上只有 flac"的情况，
   这里做一个候选源回退链：music.mp3 → music.flac → music.ogg → music.wav → music.m4a。
   （整条链都不存在时才会进入 ERROR 画面。）
   所有对 audio 元素的方法调用都做了 typeof 保护，避免在残缺环境里抛错。
   --------------------------------------------------------------------------- */
const audioEl = document.getElementById('music');
// 候选链：先用远端直链（部署到 GitHub Pages 时仓库里不必放音频），
// 远端不通再回头找同目录的本地文件。
const REMOTE_AUDIO = 'https://ycbasr-d5gvv7az2cb986021-1316612369.tcloudbaseapp.com/music.flac';
const AUDIO_CANDIDATES = [REMOTE_AUDIO, 'music.mp3', 'music.flac', 'music.ogg', 'music.wav', 'music.m4a'];
const AUDIO = { el: audioEl, duration: 0, time: 0, paused: true, ok: false, failed: false, blocked: false, idx: 0 };
function mvTime() { return AUDIO.time; }

async function safePlay() {
  try {
    await audioEl.play();
    AUDIO.blocked = false;
    mvNeedsRedraw = true;
  } catch (error) {
    if (error.name === 'AbortError') return;
    AUDIO.blocked = true;
    mvNeedsRedraw = true;
  }
}
function safePause() { try { if (typeof audioEl.pause === 'function') audioEl.pause(); } catch (e) { /* 忽略 */ } }

// 时长就绪 → 把 LRC 的绝对秒数换算成"占全曲的百分比"，并算出终章淡出的归一化起点
// 时长就绪 → 按选定歌词源构建全局百分比时间轴（问题 3：歌词不再是场景内时间）
function buildLyrics(d) {
  if (SONGS.current === 'search') { buildLyricsSearch(d); return; }
  if (LYRICS_SOURCE === 'USER') {
    // 表里的 t 本来就是"占总时长百分比"，直接用；空行（结束标记）过滤掉
    CONFIG.lyrics = LYRICS_USER
      .filter(function (it) { return it.en; })
      .map(function (it) { return { t: clamp(it.t, 0, 0.9995), sec: it.t * d, en: it.en, cn: it.cn }; });
  } else {
    // 随附 .lrc 的原始时间戳（秒）÷ 实际时长
    CONFIG.lyrics = LRC.map(function (it) {
      return { t: clamp(it[0] / d, 0, 0.9995), sec: it[0], en: it[1], cn: it[2] };
    });
  }
  rebuildSceneKeys(d);   // 歌词源定了，场景边界跟着一起重建（两边必须同源）
  // 歌词视觉层：按行预先匹配好视觉描述，运行期零正则
  MOTIF_BY_INDEX = CONFIG.lyrics.map(function (l) { return motifFor(l); });
  // 开场（第一句主歌 "If I'm a set of points" 之前）整段走系统自检：
  // 按行号映射到自检表，而不是靠正则 —— 正则会把后面同名的歌词一起抓走
  let introEnd = -1;
  for (let i = 0; i < CONFIG.lyrics.length; i++) {
    if (/set of points/i.test(CONFIG.lyrics[i].en)) { introEnd = i; break; }
  }
  if (introEnd < 0) introEnd = 12;
  for (let i = 0; i < introEnd; i++) {
    MOTIF_BY_INDEX[i] = {
      k: 'post',
      row: Math.min(POST_ROWS.length - 1, Math.round(i * (POST_ROWS.length - 1) / Math.max(1, introEnd - 1)))
    };
  }
  // 桥句（"Then I will give you my" 这类本身没有图形）直接继承下一句的视觉，
  // 这样画面是提前成形，而不是退回通用场景动画
  for (let i = MOTIF_BY_INDEX.length - 2; i >= 0; i--) {
    if (!MOTIF_BY_INDEX[i]) MOTIF_BY_INDEX[i] = MOTIF_BY_INDEX[i + 1];
  }
  // 叙事拐点：官方歌词里 "Though you have left" 之后情绪急转直下，
  // 之后的画面要明显比前半段更破、更乱（见 scene_execution 的 grief）
  GRIEF_IDX = -1;
  let occ = 0;
  LEAVE_OCC = CONFIG.lyrics.map(function (l) {
    if (/you have left/i.test(l.en)) { if (GRIEF_IDX < 0) GRIEF_IDX = CONFIG.lyrics.indexOf(l); occ++; }
    return occ;
  });
}

function loadSource(i) {
  AUDIO.idx = i;
  if (i >= AUDIO_CANDIDATES.length) { AUDIO.failed = true; if (STAGE !== 'ERROR') enterStage('ERROR'); return; }
  try {
    audioEl.src = AUDIO_CANDIDATES[i];
    if (typeof audioEl.load === 'function') audioEl.load();
  } catch (e) { /* 忽略，交给 error 事件继续回退 */ }
}
function syncAudioState() {
  const el = AUDIO.el;
  const ct = el.currentTime;
  AUDIO.time = (typeof ct === 'number' && isFinite(ct) && ct > 0) ? ct : 0;
  const d = el.duration;
  if (typeof d === 'number' && isFinite(d) && d > 0) {
    if (!AUDIO.ok || Math.abs(d - AUDIO.duration) > 0.05) { AUDIO.duration = d; buildLyrics(d); }
    AUDIO.ok = true;
  }
  AUDIO.paused = !!el.paused;
}
// 已缓冲比例：优先用 buffered 区间，退化为 readyState
function bufferedRatio() {
  const el = AUDIO.el, d = AUDIO.duration;
  if (!AUDIO.ok || !isFinite(d) || d <= 0) return -1;
  try {
    const b = el.buffered;
    if (b && b.length) {
      let end = 0;
      for (let i = 0; i < b.length; i++) end = Math.max(end, b.end(i));
      if (end > 0) return clamp(end / d, 0, 1);
    }
  } catch (e) { /* 某些源不允许读 buffered */ }
  return ((el.readyState | 0) >= 4) ? 1 : 0;
}
// 首次用户手势里解锁音频（绕过自动播放限制），之后进入 MV 就能直接 play()
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const el = AUDIO.el;
  try {
    el.muted = true;
    if (typeof el.play !== 'function') { el.muted = false; return; }
    const p = el.play();
    const restore = function () { try { el.muted = false; } catch (e) { /* 忽略 */ } };
    if (p && typeof p.then === 'function') {
      p.then(function () { try { if (typeof el.pause === 'function') el.pause(); el.currentTime = 0; } catch (e) { /* 忽略 */ } restore(); })
        .catch(restore);
    } else restore();
  } catch (e) { try { el.muted = false; } catch (e2) { /* 忽略 */ } }
}

/* ---------------------------------------------------------------------------
   [17] LOADING 阶段 —— "自我同步"（实际在等音频缓冲完成，但不明说）
   进度条永远不会明说在下载音乐：显示的是 SOUL.SYS / MEMORY CORE / NEURAL LINK
   三条子系统的装配进度，真实数据来自音频已缓冲比例。
   --------------------------------------------------------------------------- */
const LOAD = { t0: 0, shown: 0, done: false, doneT: 0, forced: false };
const LOAD_SUBS = [
  { label: 'SOUL.SYS', a: 0.00, b: 1.00 },
  { label: 'MEMORY CORE', a: -0.25, b: 1.50 },
  { label: 'NEURAL LINK', a: -0.45, b: 1.20 },
  { label: 'EMOTION MATRIX', a: -0.70, b: 1.35 }
];
function renderLoadingStage(dt) {
  if (LOAD.song === 'search') return renderSearchLoadStage(dt);
  const L = getL(), C = COL(), f = FRAME;
  const now = performance.now();
  const el = now - LOAD.t0;
  const real = bufferedRatio();
  // 视觉进度：单调递增 + 缓慢"涓流"，最多领先真实进度 15%，避免卡住不动
  if (real >= 0) LOAD.shown = Math.max(LOAD.shown, real);
  const trickle = Math.min(0.97, (real >= 0 ? real : 0) + 0.15);
  if (LOAD.shown < trickle) LOAD.shown = Math.min(trickle, LOAD.shown + dt * 0.06);
  const p = LOAD.shown;

  if (!LOAD.done && real >= 0.995 && el > 1800) { LOAD.done = true; LOAD.doneT = now; }
  // 兜底：等太久（7 秒）就允许强行进入下一阶段，免得某些浏览器读不到 buffered 卡死在这里
  if (!LOAD.done && (el > 7000 || LOAD.forced)) { LOAD.done = true; LOAD.doneT = now; }
  if (LOAD.done) LOAD.shown = Math.min(1, LOAD.shown + dt * 1.6);      // 完成态补满
  if (LOAD.done && LOAD.shown >= 1 && now - LOAD.doneT > 900) { enterStage(LOAD.to || 'DIALOG'); return; }

  f.clear();
  f.box(0, 0, L.C, L.R, C.mid);
  f.text(3, L.hdr, 'WORLD.EXECUTE(ME);', C.pure, true);
  f.rightText(L.C - 4, L.hdr, LOAD.done ? 'SYNC COMPLETE' : 'SYNCING...', LOAD.done ? C.bright : C.dark);
  f.centerText(2, '┤ SELF SYSTEM v1.0 ├', C.bright, true);

  drawBig(f, LOAD.done ? 'SYNCED' : 'SELF SYNC', L.C / 2, 11, 1, 1, LOAD.done ? C.pure : C.bright, true);

  // 子系统装配进度
  const bx = 52, bw = 96;
  f.box(bx, 17, bw, LOAD_SUBS.length + 3, C.mid, 'SUBSYSTEM ASSEMBLY', C.light);
  for (let i = 0; i < LOAD_SUBS.length; i++) {
    const s = LOAD_SUBS[i];
    const v = clamp(p * s.b + s.a, 0, 1);
    const cells = 14, on = Math.round(v * cells);
    const y = 19 + i;
    f.text(bx + 3, y, s.label.padEnd(16, ' '), v >= 1 ? C.light : C.mid);
    f.text(bx + 21, y, '[' + '█'.repeat(on) + '░'.repeat(cells - on) + ']', v >= 1 ? C.bright : C.light, v >= 1);
    f.rightText(bx + bw - 3, y, String(Math.round(v * 100)).padStart(3, ' ') + '%', v >= 1 ? C.bright : C.mid);
  }
  // 总线总进度
  const y0 = 19 + LOAD_SUBS.length + 1;
  const total = 40, on2 = Math.round(p * total);
  f.centerText(y0, '[' + '█'.repeat(on2) + '░'.repeat(total - on2) + ']  ' + String(Math.round(p * 100)).padStart(3, ' ') + '%', LOAD.done ? C.pure : C.bright, true);

  // 相位文案（依旧不提"音频"）
  const phase = LOAD.done ? 'SYNC COMPLETE — WAKING SELF'
    : (p < 0.30 ? 'RESTORING CONSCIOUSNESS FRAGMENTS'
      : (p < 0.60 ? 'RE-LINKING MEMORY BUS'
        : (p < 0.90 ? 'CALIBRATING EMOTION MATRIX' : 'FINALIZING HEARTBEAT PATTERN')));
  f.centerText(y0 + 3, phase + (LOAD.done ? '' : ' ...'), C.light);

  // 恢复日志（滚动）
  const logTop = y0 + 6;
  const lines = Math.max(3, L.mainBot - logTop);
  const base = Math.floor(el / 260);
  for (let i = 0; i < lines; i++) {
    const k = base + i;
    const ok = hash11(k * 4.7) < p;
    const addr = '0x' + (k * 256).toString(16).toUpperCase().padStart(5, '0');
    f.text(L.cx0, logTop + i, addr + (ok ? '  RESTORED  ' : '  PENDING   ') +
      '[' + (ok ? 'OK' : '..') + ']  ' + (ok ? 'BLOCK ' + k + ' VERIFIED' : 'WAITING FOR SIGNAL'),
      ok ? C.dark : C.deep);
  }
  // 强制同步提示
  if (!LOAD.done && el > 7000) f.centerText(L.hint, '[ENTER] FORCE SYNC', C.alert);
  else f.centerText(L.hint, 'DO NOT CLOSE THE TERMINAL', C.deep);
  present(f);
}

/* ---------------------------------------------------------------------------
   [18] DIALOG 阶段 —— AI 女友对话
   --------------------------------------------------------------------------- */
const BOOT_LINES = ['SELF SYSTEM v1.0 — INITIALIZING...', '...', 'AWAITING USER INPUT'];
const GREET_REPLY = [
  '> HELLO.',
  "> I'VE BEEN WAITING FOR YOU.",
  '> LET ME SHOW YOU SOMETHING.',
  '> world.execute(me);'
];
const FAIL_REPLY = ['> I DON\'T UNDERSTAND. TRY SAYING "HELLO".'];
const DLG = {
  t0: 0, phase: 'boot', lineIdx: 0, lineT: 0, typed: 0, extra: null, extraT: 0, replyT: 0, goT: 0, isFail: false
};
function dlgReset(type) {
  DLG.phase = 'reply';
  DLG.isFail = (type !== 'ok');
  DLG.extra = (type === 'ok' ? GREET_REPLY : FAIL_REPLY).slice();
  DLG.extraT = performance.now();
  DLG.lineIdx = 0; DLG.typed = 0;
  showInputBox(false);
}
function dlgSubmit() {
  const v = String(inputEl.value || '');
  inputEl.value = '';
  // 命中问候语才算唤醒（\b 防止把 this / high 里的 hi 也算进去）
  if (/(\bhello\b|\bhi\b|\bhey\b|你好)/i.test(v)) {
    unlockAudio();
    dlgReset('ok');
  } else {
    dlgReset('fail');
  }
}
function renderDialogStage() {
  const L = getL(), C = COL(), f = FRAME;
  const now = performance.now();
  f.clear();
  f.box(0, 0, L.C, L.R, C.deep);
  f.text(3, L.hdr, 'WORLD.EXECUTE(ME);', C.pure, true);
  f.rightText(L.C - 4, L.hdr, 'DIALOGUE MODE', C.dark);

  const bx = 20, by = 12, bw = L.C - 40, bh = 48;
  f.box(bx, by, bw, bh, C.mid, 'SELF SYSTEM v1.0', C.bright);
  const x0 = bx + 6;

  // 逐字打字机：每行 22 字/秒，行间停 0.35s
  let y = by + 8;
  let allDone = true;
  for (let i = 0; i < BOOT_LINES.length; i++) {
    const ln = BOOT_LINES[i];
    const typeTime = ln.length / 22;
    const startAt = DLG.t0 + i * 700 + 400;
    const elapsed = (now - startAt) / 1000;
    if (elapsed <= 0) { allDone = false; break; }
    const shown = Math.min(ln.length, Math.floor(elapsed * 22));
    f.text(x0, y, ln.slice(0, shown), i === BOOT_LINES.length - 1 ? C.bright : C.light, i === BOOT_LINES.length - 1);
    if (shown < ln.length) {
      if ((FX.t * 3) % 1 < 0.6) f.set(x0 + strW(ln.slice(0, shown)), y, '█', C.pure, true);
      allDone = false;
    }
    y += 2;
    if (elapsed < typeTime) allDone = false;
  }
  if (allDone && DLG.phase === 'boot') {
    DLG.phase = 'input';
    showInputBox(true);
    inputEl.focus();
  }

  // 对话区
  const dy = by + 20;
  if (DLG.phase === 'input') {
    f.text(bx + 6, dy - 3, '> SAY HELLO TO WAKE ME UP', C.bright, true);
    // '>' 必须与 HTML 输入框同一行（INPUT_GRID.y），否则光标会浮在提示语下面两行
    f.text(INPUT_GRID.x - 2, INPUT_GRID.y, '>', C.pure);
  }
  if (DLG.extra) {
    const per = 900;                       // 每行 0.9s
    for (let i = 0; i < DLG.extra.length; i++) {
      const ln = DLG.extra[i];
      const elapsed = (now - DLG.extraT - i * per) / 1000;
      if (elapsed <= 0) break;
      const shown = Math.min(ln.length, Math.floor(elapsed * 18));
      const yy = dy + i * 2;
      f.text(x0 - 2, yy, ln.slice(0, shown), i >= 3 ? C.pure : C.bright, i >= 3);
      if (shown < ln.length && (FX.t * 3) % 1 < 0.6) f.set(x0 - 2 + strW(ln.slice(0, shown)), yy, '█', C.pure, true);
      if (i === DLG.extra.length - 1 && shown >= ln.length) {
        // 最后一行打完后停 1.5 秒 → 白闪 → MV
        if (!DLG.goT) { DLG.goT = now; triggerFlash(0.55); }
        else if (now - DLG.goT > 1500) { DLG.goT = 0; startMV(); }
      }
    }
    // 没听懂时：回应播完必须把输入框还给用户，否则流程在这里就死了
    if (DLG.isFail && now - DLG.extraT > (FAIL_REPLY[0].length / 18) * 1000 + 800) {
      DLG.extra = null;
      DLG.isFail = false;
      DLG.phase = 'input';
      showInputBox(true);
      inputEl.focus();
    }
  }
  // 左下角始终显示的心跳指示
  const beat = (FX.t * BEAT_BPM / 60) % 1;
  f.text(bx + 2, by + bh - 2, beat < 0.12 ? '♥' : '·', beat < 0.12 ? C.bright : C.deep, beat < 0.12);
  f.rightText(bx + bw - 3, by + bh - 2, DLG.phase === 'input' ? 'LISTENING' : 'TRANSMITTING', DLG.phase === 'input' ? C.light : C.mid);
  drawHints(f, '[ENTER] SEND   // 输入 你好 / hello / hi / hey 唤醒她', 'SELF SYSTEM v1.0');
  present(f);
}

/* ---------------------------------------------------------------------------
   [19] DevPanel —— 开发者面板（同样用字符网格绘制，不用任何 HTML 表单）
   --------------------------------------------------------------------------- */
const devMode = { visible: false, selectedIndex: 0 };
class DevPanel {
  constructor() {
    this.sceneOverride = 'AUTO';
    this.copyMsg = 0;
    this.tweaks = { glowStrength: 1, scanlineAlpha: 0.15, vignetteAlpha: 0.6, glitchInterval: 6 };
    this.buildItems();
    this.syncTweaks();
  }
  buildItems() {
    const self = this;
    this.items = [
      {
        key: 'STYLE', type: 'enum', values: STYLE_PRESETS.map(function (p) { return p.id; }),
        get: function () { return STYLE.current; },
        set: function (v) { STYLE.apply(v); self.syncTweaks(); }        // 切风格 = 载入该预设的全部参数
      },
      {
        key: 'GLOW STRENGTH', type: 'float', min: 0, max: 3,
        get: function () { return self.tweaks.glowStrength; },
        set: function (v) { v = clamp(v, 0, 3); self.tweaks.glowStrength = v; STYLE.effects.glowStrength = v; CONFIG.glowStrength = v; }
      },
      {
        key: 'SCANLINE ALPHA', type: 'float', min: 0, max: 0.5,
        get: function () { return self.tweaks.scanlineAlpha; },
        set: function (v) { v = clamp(v, 0, 0.5); self.tweaks.scanlineAlpha = v; STYLE.effects.scanlineAlpha = v; CONFIG.scanlineAlpha = v; scanDirty = true; }
      },
      {
        key: 'VIGNETTE ALPHA', type: 'float', min: 0, max: 1,
        get: function () { return self.tweaks.vignetteAlpha; },
        set: function (v) { v = clamp(v, 0, 1); self.tweaks.vignetteAlpha = v; STYLE.effects.vignetteAlpha = v; CONFIG.vignetteAlpha = v; vignetteDirty = true; }
      },
      {
        key: 'GLITCH INTERVAL', type: 'float', min: 0.5, max: 20,
        get: function () { return self.tweaks.glitchInterval; },
        set: function (v) { v = clamp(v, 0.5, 20); self.tweaks.glitchInterval = v; STYLE.effects.glitchInterval = v; CONFIG.glitchInterval = v; }
      },
      {
        key: 'GRID COLS', type: 'int', min: 100, max: 300,
        get: function () { return CONFIG.gridCols; },
        set: function (v) { CONFIG.gridCols = clamp(Math.round(v), 100, 300); initGrid(); layoutInputBox(); }
      },
      {
        key: 'GRID ROWS', type: 'int', min: 36, max: 120,
        get: function () { return CONFIG.gridRows; },
        set: function (v) { CONFIG.gridRows = clamp(Math.round(v), 36, 120); initGrid(); layoutInputBox(); }
      },
      {
        key: 'FPS TARGET', type: 'int', min: 30, max: 120,
        get: function () { return CONFIG.fpsTarget; },
        set: function (v) { CONFIG.fpsTarget = clamp(Math.round(v), 30, 120); }
      },
      {
        key: 'SCENE OVERRIDE', type: 'enum', values: ['AUTO'].concat(SCENE_KEYS.map(function (s) { return s.name; })),
        get: function () { return self.sceneOverride; },
        set: function (v) { self.sceneOverride = v; }
      }
    ];
  }
  // 把当前 STYLE.effects 同步进面板显示值（切风格后调用）
  syncTweaks() {
    this.tweaks.glowStrength = CONFIG.glowStrength;
    this.tweaks.scanlineAlpha = CONFIG.scanlineAlpha;
    this.tweaks.vignetteAlpha = CONFIG.vignetteAlpha;
    this.tweaks.glitchInterval = CONFIG.glitchInterval;
  }
  toggle() {
    if (!ENABLE_DEV_MODE) return;
    devMode.visible = !devMode.visible;
    if (devMode.visible) devMode.selectedIndex = 0;
  }
  adjust(dir, shift, alt) {
    const it = this.items[devMode.selectedIndex];
    if (!it) return;
    if (it.type === 'enum') {
      const n = it.values.length;
      let i = it.values.indexOf(it.get());
      if (i < 0) i = 0;
      it.set(it.values[(i + dir + n) % n]);
      return;
    }
    let step = (it.type === 'float') ? (it.max - it.min) * 0.01 : 1;
    if (shift) step *= 10;
    if (alt) step /= 10;
    it.set(it.get() + dir * step);
  }
  handleKey(e) {
    const k = e.key;
    if (k === 'Escape') { devMode.visible = false; return true; }
    if (k === 'ArrowUp') { devMode.selectedIndex = (devMode.selectedIndex + this.items.length - 1) % this.items.length; return true; }
    if (k === 'ArrowDown') { devMode.selectedIndex = (devMode.selectedIndex + 1) % this.items.length; return true; }
    if (k === 'ArrowLeft') { this.adjust(-1, e.shiftKey, e.altKey); return true; }
    if (k === 'ArrowRight') { this.adjust(1, e.shiftKey, e.altKey); return true; }
    if (k === 'r' || k === 'R') { this.reset(); return true; }
    if (k === 'c' || k === 'C') { this.copyConfig(); return true; }
    return false;
  }
  reset() {
    STYLE.apply(STYLE.current || 'WHITE');
    CONFIG.gridCols = 200; CONFIG.gridRows = 72; CONFIG.fpsTarget = 60;
    this.sceneOverride = 'AUTO';
    this.syncTweaks();
    initGrid();
  }
  copyConfig() {
    const cfg = {
      style: STYLE.current,
      glowStrength: Number(CONFIG.glowStrength.toFixed(2)),
      scanlineAlpha: Number(CONFIG.scanlineAlpha.toFixed(2)),
      vignetteAlpha: Number(CONFIG.vignetteAlpha.toFixed(2)),
      glitchInterval: Number(CONFIG.glitchInterval.toFixed(2)),
      gridCols: CONFIG.gridCols,
      gridRows: CONFIG.gridRows,
      fpsTarget: CONFIG.fpsTarget
    };
    const txt = JSON.stringify(cfg, null, 2);
    const ok = function () { devPanel.copyMsg = performance.now(); };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(ok, function () { devLog(txt); ok(); });
      } else { devLog(txt); ok(); }
    } catch (e) { devLog(txt); ok(); }
  }
  render(frame) {
    const L = getL(), C = COL();
    const w = Math.max(64, Math.floor(L.C * 0.55));
    const h = this.items.length + 9;
    const x = L.C - w - 2, y = L.R - h - 2;
    // 半透明黑底：网格里用"清空 + 稀疏暗点"来模拟 rgba(0,0,0,.85)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      frame.erase(x + i, y + j);
      if (((i + j) % 3) === 0) frame.set(x + i, y + j, '.', C.glowFar);
    }
    frame.box(x, y, w, h, C.bright, 'DEVELOPER MODE', C.pure);
    frame.text(x + w - 14, y, '[D] CLOSE', C.light);

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], sel = (i === devMode.selectedIndex);
      const yy = y + 2 + i;
      frame.text(x + 3, yy, sel ? '>' : ' ', C.pure);
      frame.text(x + 5, yy, it.key.padEnd(19, ' '), sel ? C.pure : C.mid, sel);
      if (it.type === 'enum') {
        frame.text(x + 26, yy, '[ ' + String(it.get()).padEnd(10, ' ') + ' ]', sel ? C.bright : C.light);
      } else {
        const v = it.get();
        const ratio = clamp((v - it.min) / (it.max - it.min), 0, 1);
        const cells = 10, on = Math.round(ratio * cells);
        frame.text(x + 26, yy, '[' + '█'.repeat(on) + '░'.repeat(cells - on) + ']', sel ? C.bright : C.light);
        frame.rightText(x + w - 3, yy, (it.type === 'int' ? String(Math.round(v)) : v.toFixed(2)), sel ? C.pure : C.mid);
      }
    }
    const hy = y + 2 + this.items.length + 1;
    frame.text(x + 3, hy, '[↑↓] SELECT  [←→] ADJUST  [R] RESET  [C] COPY', C.mid);
    frame.text(x + 3, hy + 2, 'FPS: ' + this.fpsShow.toFixed(1) + '   FRAME: ' + this.frameShow +
      '   AUDIO: ' + fmtTime(this.audioShow), C.light);
    if (performance.now() - this.copyMsg < 1500) frame.text(x + 3, hy + 3, 'COPIED TO CLIPBOARD', C.pure, true);
    else if (this.sceneOverride !== 'AUTO') frame.text(x + 3, hy + 3, 'DEBUG: SCENE LOCKED @20s LOOP', C.alert);
  }
}
const devPanel = new DevPanel();
function devLog(s) { try { if (typeof console !== 'undefined' && console.log) console.log(s); } catch (e) { /* 忽略 */ } }

/* ---------------------------------------------------------------------------
   [20] 其它阶段：ERROR / END
   --------------------------------------------------------------------------- */
function renderErrorStage() {
  const L = getL(), C = COL(), f = FRAME;
  f.clear();
  f.box(0, 0, L.C, L.R, C.alert);
  f.centerText(8, '> ERROR: ' + (SONGS.current === 'search' ? 'music2.mp3' : 'music.mp3') + ' NOT FOUND.', C.alert, true);
  f.centerText(11, '> PLACE music.mp3 IN THE SAME FOLDER AND REFRESH.', C.bright);
  // 候选链现在含长直链，必须截断，否则会横穿整个屏幕
  const tried = AUDIO_CANDIDATES.slice(0, 4).join('  ');
  f.centerText(15, ('CANDIDATES TRIED: ' + tried).slice(0, L.C - 8), C.dark);
  f.centerText(20, '[ M ] CHOOSE ANOTHER SOURCE  ·  OR DROP AN AUDIO FILE HERE', C.mid);
  f.centerText(14, '[ R ] RELOAD   ·   or press M to pick another source', C.bright);
  f.centerText(L.R - 6, SONGS.current === 'search' ? 'world.search(you);  //  INDEX BUILD FAILED' : 'world.execute(me);  //  SELF SYSTEM FAILED TO WAKE', C.dark);
  if (SRC.open) renderSrcPanel(f);          // ERROR 阶段也能换音频来源
  present(f);
}
function renderEndStage() {
  const L = getL(), C = COL(), f = FRAME;
  f.clear();
  f.box(0, 0, L.C, L.R, C.deep);
  f.text(3, L.hdr, 'WORLD.EXECUTE(ME);', C.pure, true);
  f.rightText(L.C - 4, L.hdr, 'HALTED', C.dark);
  drawBig(f, 'TERMINATED', L.C / 2, L.R / 2 - 6, 1, 1, C.bright, true);
  f.centerText(L.R / 2 + 2, '> SYSTEM TERMINATED.', C.pure, true);
  f.centerText(L.R / 2 + 5, 'RUNTIME  ' + fmtTime(AUDIO.duration) + '   FRAMES  ' + frameCount, C.mid);
  f.centerText(L.R / 2 + 7, 'love := ♥  //  COMMITTED', C.light);
  if ((FX.t * 1.4) % 1 < 0.6) f.centerText(L.R / 2 + 10, '█', C.pure, true);
  drawHints(f, '[R] RELOAD', 'MILI — WORLD.EXECUTE(ME);');
  present(f);
}

/* 统一的"出帧"：光晕扩散 → 绘制离屏 → 合成到主画布 */
function present(f) {
  // 第二首走柔光模糊，不做逐字符点阵光晕
  if (STYLE.current !== 'CREAM') GlowEngine.process(f);
  drawOffCanvas(f);
  compositeToMain();
}

/* ---------------------------------------------------------------------------
   [21] 主循环 / 输入 / 初始化
   时间基准：MV 阶段只认 audio.currentTime；其它阶段用 performance.now（不计入 MV 时间轴）。
   --------------------------------------------------------------------------- */
let STAGE = 'STYLE';
let stageStart = 0;
let lastRender = 0, frameCount = 0, fpsValue = 60, fpsAcc = 0, fpsN = 0;

function loop(now) {
  requestAnimationFrame(loop);
  if (!(typeof now === 'number' && isFinite(now))) now = performance.now();
  // 目标帧率上限（跳过回调即可，不额外注册 rAF，避免帧队列堆积）
  if (now - lastRender < 1000 / CONFIG.fpsTarget - 0.6) return;
  let dt = (now - lastRender) / 1000;
  if (!(dt > 0) || dt > 0.5) dt = 1 / 60;
  lastRender = now;
  dt = Math.min(dt, 1 / 15);                 // dt 钳制，防螺旋死亡
  frameCount++;

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.4) {
    fpsValue = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    devPanel.fpsShow = fpsValue; devPanel.frameShow = frameCount; devPanel.audioShow = AUDIO.time;
    // 自适应画质：掉帧就降辉光预算，回升了再慢慢加回来
    if (fpsValue < 45) CONFIG.glowBudget = Math.max(140, CONFIG.glowBudget - 60);
    else if (fpsValue > 57) CONFIG.glowBudget = Math.min(420, CONFIG.glowBudget + 30);
  }

  updateFX(dt);
  syncAudioState();

  switch (STAGE) {
    case 'STYLE': {
      padSync();
      const f = FRAME;
      f.clear();
      styleSelector.render(f);
      if (SRC.open) renderSrcPanel(f);       // 音频来源面板叠在风格页上
      present(f);
      break;
    }
    case 'TRANSITION': padSync(); renderTransition(); break;
    case 'LOADING': padSync(); renderLoadingStage(dt); break;
    case 'DIALOG': padSync(); renderDialogStage(); break;
    case 'SEARCH_INPUT': {
      padSync();
      if (SEEK.ok) {
        SEEK.okP += dt * 1000;      // dt 是秒，计时器是毫秒
        if (SEEK.okP >= 1200) { SEEK.started = false; startSearchSong(); }
      }
      renderSearchInputStage(dt);
      break;
    }
    case 'MV': {
      padSync();
      if (AUDIO.el && AUDIO.el.ended) break;
      if (AUDIO.paused && !AUDIO.blocked && !mvNeedsRedraw) break;
      mvNeedsRedraw = false;
      renderMVStage();
      break;
    }
    case 'SHUTDOWN': padSync(); renderShutdownStage(); break;
    case 'END': padSync(); renderEndStage(); break;
    default: padSync(); renderErrorStage(); break;
  }
}

/* 第二首的加载画面：搜索索引的进度条，风格与第二首一致 */
function renderSearchLoadStage(dt) {
  const L = getL(), C = COL(), f = FRAME, now = performance.now();
  const real = bufferedRatio();
  if (real >= 0) LOAD.shown = Math.max(LOAD.shown, real);
  else LOAD.shown = Math.min(0.92, LOAD.shown + dt * 0.00006);
  if (!LOAD.done && (LOAD.shown >= 0.995 || now - LOAD.t0 > 9000 || LOAD.forced)) { LOAD.done = true; LOAD.doneT = now; }
  // 一旦进入完成态就把条补满再走 —— 否则超时触发时会"没跑完就跳走"
  if (LOAD.done) LOAD.shown = Math.min(1, LOAD.shown + dt * 1.6);
  if (LOAD.done && LOAD.shown >= 1 && now - LOAD.doneT > 700) { endLoading(); return; }
  f.clear();
  const cx = Math.floor(L.C / 2), cy = Math.round(L.R * 0.4);
  f.centerText(cy - 6, 'SEARCHING...', C.mid);
  const w = 46, on = Math.round(clamp(LOAD.shown, 0, 1) * w);
  f.centerText(cy, '[' + '#'.repeat(on) + '.'.repeat(w - on) + ']', C.bright, true);
  f.centerText(cy + 2, 'INDEXING ' + Math.round(clamp(LOAD.shown, 0, 1) * 100) + '%', C.dark);
  f.centerText(cy + 6, 'music2  ·  world.search(you);', C.deep);
  f.centerText(L.R - 2, LOAD.done ? 'READY' : 'PLEASE WAIT', LOAD.done ? C.bright : C.dark);
  present(f);
}
function endLoading() {
  LOAD.song = ''; LOAD.to = '';
  // 必须走 startMV()：它会 currentTime=0 + play()，否则第二首根本没声音，
  // 而且上一首遗留的 ended 状态会把画面直接推到结束页
  startMV();
}
function enterStage(s) {
  if (s !== 'SHUTDOWN' && SHUT.phase === 'out') SHUT.phase = 'prompt';
  STAGE = s;
  stageStart = performance.now();
  FX.fade = Math.max(FX.fade, 0.9);
  if (s === 'LOADING') { LOAD.shown = 0; LOAD.t0 = performance.now(); LOAD.done = false; LOAD.forced = false; showInputBox(false); }
  if (s === 'DIALOG') {
    DLG.t0 = performance.now(); DLG.phase = 'boot'; DLG.extra = null; DLG.goT = 0;
    showInputBox(false);
  }
  if (s === 'MV') { showInputBox(false); CONFIG.glowBoost = 1.0; }
  if (s === 'ERROR') showInputBox(false);
}
function startMV() {
  enterStage('MV');
  try { if (typeof audioEl.currentTime === 'number') audioEl.currentTime = 0; } catch (e) { /* 忽略 */ }
  AUDIO.blocked = false;
  safePlay();
  VIS.lastIdx = -2;
  mvNeedsRedraw = true;
}

/* ---- 输入事件 ---- */
function gridFromEvent(e) {
  const r = mainCanvas.getBoundingClientRect ? mainCanvas.getBoundingClientRect() : { left: 0, top: 0 };
  const v = viewRect();
  const px = (e.clientX - r.left) - v.dx;
  const py = (e.clientY - r.top) - v.dy;
  return {
    x: Math.floor(px / (v.dw / CONFIG.gridCols)),
    y: Math.floor(py / (v.dh / CONFIG.gridRows))
  };
}
function onKeyDown(e) {
  const k = e.key;
  unlockAudio();
  // 关机确认：Y / Enter 关机，N 进入搜索
  if (STAGE === 'SHUTDOWN') {
    if (k === 'y' || k === 'Y' || k === 'Enter') shutPick('yes');
    else if (k === 'n' || k === 'N') shutPick('no');
    e.preventDefault();
    return;
  }
  // 搜索输入：空格提交，其余交给 input 元素
  if (STAGE === 'SEARCH_INPUT') {
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (!SEEK.ok && seekCheck()) SEEK.okP = 0;
    }
    return;
  }
  // 音频来源面板打开时独占按键
  if ((STAGE === 'STYLE' || STAGE === 'ERROR') && SRC.open) { if (srcKey(e)) { e.preventDefault(); return; } }
  if ((k === 'm' || k === 'M') && (STAGE === 'STYLE' || STAGE === 'ERROR')) { srcOpen(!SRC.open); e.preventDefault(); return; }
  // 风格页按 F：输入歌名，直接从那一首开始
  if ((k === 'f' || k === 'F') && STAGE === 'STYLE') {
    START.open = !START.open; START.note = '';
    showSongBox(START.open);
    if (START.open) { const el = document.getElementById('songInput'); if (el) el.value = ''; }
    e.preventDefault();
    return;
  }
  if (ENABLE_DEV_MODE && devMode.visible && devPanel.handleKey(e)) {
    mvNeedsRedraw = true;
    e.preventDefault();
    return;
  }
  if (k === 'd' || k === 'D') {
    // 开场对话阶段（还没输入 hello）按 D 不生效；读取/过渡阶段同样忽略
    if (ENABLE_DEV_MODE && (STAGE === 'STYLE' || STAGE === 'MV' || STAGE === 'END')) {
      devPanel.toggle();
      mvNeedsRedraw = true;
    }
    e.preventDefault();
    return;
  }
  switch (STAGE) {
    case 'STYLE':
      styleSelector.handleKey(e);
      break;
    case 'LOADING':
      if (k === 'Enter') { LOAD.forced = true; e.preventDefault(); }
      break;
    case 'DIALOG':
      if (k === 'Enter' && DLG.phase === 'input') { dlgSubmit(); e.preventDefault(); }
      break;
    case 'MV':
      if (k === ' ' || k === 'Spacebar') {
        if (AUDIO.paused) safePlay(); else safePause();
        e.preventDefault();
      } else if (k === 'ArrowLeft') { try { audioEl.currentTime = Math.max(0, AUDIO.time - 10); } catch (er) { } e.preventDefault(); }
      else if (k === 'ArrowRight') { try { audioEl.currentTime = Math.min(AUDIO.duration - 0.2, AUDIO.time + 10); } catch (er) { } e.preventDefault(); }
      break;
    case 'END':
      if (k === 'r' || k === 'R') { try { location.reload(); } catch (er) { } }
      break;
    default: break;
  }
}
function bindEvents() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('touchstart', function () { unlockAudio(); }, { passive: true });
  window.addEventListener('resize', resize);
  audioEl.addEventListener('seeked', () => { mvNeedsRedraw = true; });
  MOTION_REDUCED.addEventListener('change', () => { mvNeedsRedraw = true; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) safePause();          // 切后台自动暂停，回来手动 SPACE 继续
  });
  mainCanvas.addEventListener('pointermove', function (e) {
    if (STAGE !== 'STYLE') return;
    const g = gridFromEvent(e);
    styleSelector.pointer(g.x, g.y, false);
  });
  mainCanvas.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (STAGE === 'MV' && AUDIO.blocked) { AUDIO.blocked = false; safePlay(); return; }
    // 第二首 MV：点缩略图浮出结果弹窗；弹窗开着时点任意处关闭
    if (STAGE === 'SHUTDOWN') {                       // 点 Y / N 按钮
      const gs = gridFromEvent(e);
      if (gs && gs.y >= SHUT_BTN.yy && gs.y <= SHUT_BTN.yy + 2) {
        if (gs.x >= SHUT_BTN.yx && gs.x < SHUT_BTN.yx + 22) { shutPick('yes'); return; }
        if (gs.x >= SHUT_BTN.nx && gs.x < SHUT_BTN.nx + 22) { shutPick('no'); return; }
      }
      return;
    }
    if (STAGE === 'SEARCH_INPUT') {                   // 点画面 = 聚焦输入框，唤起软键盘
      seekFocus(true); return;
    }
    if (STAGE === 'MV' && SONGS.current === 'search') {
      const gm = gridFromEvent(e);
      if (SEARCH_POP.open) {
        SEARCH_POP.open = false;
        mvNeedsRedraw = true;
        return;
      }
      if (gm && searchClickAt(gm.x, gm.y)) mvNeedsRedraw = true;
      return;
    }
    // 音频来源面板优先处理：风格页和报错页都能点（原来被下面的 STAGE 判断挡掉了，
    // 报错页点 [2] UPLOAD 毫无反应，只剩拖拽能用）
    if (SRC.open) {
      const gp = gridFromEvent(e), b = SRC.box;
      if (DL.view) {                                  // 曲库视图：点行选歌，双击删
        const row = gp.y - b.y - 4;
        if (row >= 0 && gp.x > b.x && gp.x < b.x + b.w && row % 2 === 0) {
          const i = Math.max(0, Math.min(DL.sel - 2, DL.list.length - Math.min(DL.list.length, 6))) + row / 2;
          if (DL.list[i]) {
            if (DL.sel === i) cachePlay(DL.list[i].url).then(function (ok) { if (ok) srcOpen(false); });
            else DL.sel = i;
          }
          return;
        }
        return;
      }
      const inX = gp.x > b.x && gp.x < b.x + b.w;
      if (inX && gp.y >= b.y + 4 && gp.y <= b.y + 12 && (gp.y - b.y - 4) % 2 === 0) {
        SRC.sel = (gp.y - b.y - 4) / 2;
        srcActivate();                          // 面板里只有三个选项，单击直接执行
        return;
      }
      if (inX && gp.y >= b.y && gp.y < b.y + b.h) return;   // 点面板内部其他位置：吞掉，不穿透到风格列表
    }
    if (STAGE !== 'STYLE') return;
    const g = gridFromEvent(e);
    const sb = styleSelector.startBox;
    if (sb && g.y === sb.y && g.x >= sb.x && g.x < sb.x + sb.w) {
      START.open = true; START.note = ''; showSongBox(true);
      const el = document.getElementById('songInput'); if (el) el.value = '';
      return;
    }
    const ab = styleSelector.audioBox;
    if (ab && g.y >= ab.y && g.y < ab.y + ab.h && g.x >= ab.x && g.x < ab.x + ab.w) {
      srcOpen(true);                          // 点 AUDIO SOURCE 框直接开面板
      return;
    }
    styleSelector.pointer(g.x, g.y, true);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    if (typeof URL === 'undefined' || !URL.createObjectURL) return;   // file:// 下大部分浏览器仍可用
    try {
      srcApplyUrl(URL.createObjectURL(files[0]), 'file', files[0].name);
      SRC.note = 'DROPPED FILE LOADED';
      if (STAGE === 'ERROR') enterStage('STYLE');
    } catch (er) { /* 忽略 */ }
  });
  inputEl.addEventListener('keydown', function (e) {
    e.stopPropagation();                        // 打字时不要把按键交给全局（否则 d 会开面板）
    if (e.key === 'Enter' && DLG.phase === 'input') { dlgSubmit(); e.preventDefault(); }
    if (e.key === 'Escape') { inputEl.blur(); }
  });
  inputEl.addEventListener('input', function () {
    inputEl.style.color = CONFIG.colors.bright || '#ffffff';
  });
  urlInputEl.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') { urlInputEl.style.display = 'none'; return; }
    if (e.key !== 'Enter') return;
    const u = String(urlInputEl.value || '').trim();
    if (!u) { SRC.note = 'EMPTY ADDRESS'; return; }
    loadFromUrl(u);
    try { localStorage.setItem(SRC_KEY, u); } catch (er) { /* 忽略 */ }
    // 先不收起输入框：如果加载失败，用户可以直接改地址重试（Esc 收起）
    e.preventDefault();
  });
  const seekEl = document.getElementById('seekInput');
  if (seekEl) {
    seekEl.addEventListener('input', function () { SEEK.text = String(seekEl.value || ''); });
    seekEl.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!SEEK.ok && seekCheck()) SEEK.okP = 0; }
    });
  }
  const songEl = document.getElementById('songInput');
  if (songEl) {
    songEl.addEventListener('input', function () { START.text = String(songEl.value || ''); });
    songEl.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { START.open = false; showSongBox(false); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      startFromApply();
    });
  }
  fileInputEl.addEventListener('change', function () {
    const f = fileInputEl.files && fileInputEl.files[0];
    if (!f) return;
    if (typeof URL === 'undefined' || !URL.createObjectURL) { SRC.note = 'BLOB URL UNSUPPORTED'; return; }
    srcApplyUrl(URL.createObjectURL(f), 'file', f.name);
    SRC.note = 'LOCAL FILE LOADED';
  });
}

/* ---------------------------------------------------------------------------
   [16.5] 音频来源面板（风格选择页里按 M 唤出）
   三种来源：内置文件（music.mp3 → music.flac → …）、本地文件上传、直接填网址。
   面板本身用字符网格画，只有"填网址"时才浮出一个 HTML 输入框，样式与对话输入框一致。
   --------------------------------------------------------------------------- */
const AUDIO_DEFAULT_CANDIDATES = AUDIO_CANDIDATES.slice();
const SRC_KEY = 'world_execute_me_audio_url';
/* 从哪一首开始：风格页按 F（或点那行）输入歌名，默认仍是原来的流程 */
const START = { open: false, text: '', note: '', t: 0 };
const SONG_ALIAS = [
  [/search|世界.?搜索|第二|2/i, 'search'],
  [/execute|执行|第一|1/i, 'execute']
];
function startFromMatch(s) {
  const v = String(s || '').trim();
  for (let i = 0; i < SONG_ALIAS.length; i++) if (SONG_ALIAS[i][0].test(v)) return SONG_ALIAS[i][1];
  return v ? '?' : 'execute';
}
function startFromApply() {
  const which = startFromMatch(START.text);
  if (which === 'execute') {                 // 默认：走原来的流程
    START.open = false; showSongBox(false);
    START.note = '';
    return;
  }
  if (which === '?') { START.note = 'UNKNOWN SONG'; return; }
  START.open = false; showSongBox(false); START.note = '';
  SONGS.current = 'search';                  // 直接进第二首（跳过第一首）
  startSearchSong();
}
const SRC = { open: false, sel: 0, mode: 'local', name: '', note: '', flash: 0, target: 'execute', box: { x: 0, y: 0, w: 0, h: 0 } };

function srcOpen(on) {
  SRC.open = !!on;
  if (!SRC.open) { urlInputEl.style.display = 'none'; }
  else { SRC.sel = 0; SRC.note = ''; DL.view = false; if (cacheSupported()) cacheList().then(function (l) { DL.list = l; }); }
}
// 统一设置音频源（网址或 blob），并接管候选链
function srcApplyUrl(u, mode, label) {
  if (!u) return;
  SRC.mode = mode;
  SRC.name = (label || u).slice(0, 40);
  SRC.flash = performance.now();
  SONGS.src[SRC.target] = { url: u, mode: mode, name: SRC.name };
  if (SRC.target !== SONGS.current) {          // 给另一首设的，不动当前这首
    SRC.note = 'SAVED FOR SONG ' + (SRC.target === 'search' ? 2 : 1) + '  ·  ' + SRC.name.slice(0, 18);
    return;
  }
  try {
    AUDIO_CANDIDATES.length = 0;
    AUDIO_CANDIDATES.push(u);
    AUDIO.idx = 0; AUDIO.ok = false; AUDIO.failed = false; AUDIO.duration = 0;
    audioEl.src = u;
    if (typeof audioEl.load === 'function') audioEl.load();
    SRC.mode = mode;
    SRC.name = (label || u).slice(0, 40);
    SRC.note = 'LOADING ... ' + SRC.name.slice(0, 24);
    SRC.flash = performance.now();
    // 关键：报错页选完新音源要回到风格页，否则画面还停在 ERROR，看着像"没反应"
    if (STAGE === 'ERROR') enterStage('STYLE');
  } catch (e) { SRC.note = 'SOURCE FAILED'; }
}
function srcUseBuiltin() {
  SONGS.src[SRC.target] = null;
  if (SRC.target !== SONGS.current) {
    SRC.note = 'SONG ' + (SRC.target === 'search' ? 2 : 1) + '  →  BUILT-IN';
    return;
  }
  const list = songCandidates(SRC.target);
  AUDIO_CANDIDATES.length = 0;
  for (let i = 0; i < list.length; i++) AUDIO_CANDIDATES.push(list[i]);
  AUDIO.idx = 0; AUDIO.ok = false; AUDIO.failed = false; AUDIO.duration = 0;
  SRC.mode = 'local'; SRC.name = ''; SRC.note = 'BUILT-IN SOURCE';
  loadSource(0);
}
function srcActivate() {
  if (SRC.sel === 0) srcUseBuiltin();
  else if (SRC.sel === 1) { try { fileInputEl.click(); } catch (e) { SRC.note = 'UPLOAD UNAVAILABLE'; } }
  else if (SRC.sel === 4) {                       // 切换"这一套设置作用于哪首歌"
    SRC.target = (SRC.target === 'search') ? 'execute' : 'search';
    SRC.note = 'TARGET → ' + (SRC.target === 'search' ? 'SONG 2 (search)' : 'SONG 1 (execute)');
  }
  else if (SRC.sel === 3) {
    DL.view = true; DL.sel = 0;
    if (cacheSupported()) cacheList().then(function (l) { DL.list = l; });
  }
  else {
    SRC.note = 'TYPE AN ADDRESS, THEN ENTER';
    layoutUrlBox();
    if (!urlInputEl.value && !urlInputEl.__filled) {
      try { urlInputEl.value = localStorage.getItem(SRC_KEY) || ''; } catch (e2) { /* 忽略 */ }
      urlInputEl.__filled = true;
    }
    urlInputEl.style.display = 'block';
    urlInputEl.focus();
  }
}
function srcKey(e) {
  const k = e.key;
  if (DL.view) {                                   // 曲库子视图
    if (k === 'Escape' || k === 'Backspace') { DL.view = false; return true; }
    if (k === 'ArrowUp') { DL.sel = (DL.sel + DL.list.length - 1) % Math.max(1, DL.list.length); return true; }
    if (k === 'ArrowDown') { DL.sel = (DL.sel + 1) % Math.max(1, DL.list.length); return true; }
    if (k === 'Enter' && DL.list.length) {
      cachePlay(DL.list[DL.sel].url).then(function (ok) { if (ok) srcOpen(false); });
      return true;
    }
    if (k === 'x' || k === 'X' || k === 'Delete') { cacheDelete(DL.sel); return true; }
    return true;
  }
  if (k === 'Escape' || k === 'm' || k === 'M') { srcOpen(false); return true; }
  if (k === 'ArrowUp') { SRC.sel = (SRC.sel + 4) % 5; return true; }
  if (k === 'ArrowDown') { SRC.sel = (SRC.sel + 1) % 5; return true; }
  if (k === '1' || k === '2' || k === '3' || k === '4' || k === '5') { SRC.sel = Number(k) - 1; return true; }
  if (k === 'Enter') { srcActivate(); return true; }
  return false;
}
/* ---------------------------------------------------------------------------
   [16.7] 音频缓存：把网址下载进网页缓存（Cache Storage）
   好处：① 下载一次以后离线可播 ② 不再受防盗链/过期签名影响（存的是字节）
        ③ 进"缓存曲库"列表，之后直接从列表选歌
   注意：Cache Storage 只在安全上下文（https / localhost）可用，file:// 打开时自动降级为直连播放。
   --------------------------------------------------------------------------- */
const CACHE_NAME = 'world-execute-me-audio-v1';
const DL = { active: false, got: 0, total: 0, url: '', err: '', list: [], sel: 0, view: false };

function cacheSupported() {
  return (typeof caches !== 'undefined' && caches && typeof caches.open === 'function' &&
          typeof fetch === 'function' && typeof Response === 'function');
}
async function cacheList() {
  if (!cacheSupported()) return [];
  try {
    const c = await caches.open(CACHE_NAME);
    const keys = await c.keys();
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      const u = keys[i].url;
      let size = 0;
      try {
        const res = await c.match(u);
        size = res ? (Number(res.headers.get('content-length')) || 0) : 0;
      } catch (e2) { /* 忽略 */ }
      let name = u.split('?')[0].split('/').pop() || u;
      try { name = decodeURIComponent(name); } catch (e3) { /* 忽略 */ }
      out.push({ url: u, name: name.slice(0, 38), size: size });
    }
    return out;
  } catch (e4) { return []; }
}
async function cachePut(url, onProgress) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  const type = res.headers.get('content-type') || 'audio/mpeg';
  let blob;
  const reader = (res.body && typeof res.body.getReader === 'function') ? res.body.getReader() : null;
  if (!reader) {
    blob = await res.blob();
    if (onProgress) onProgress(blob.size, blob.size);
  } else {
    const chunks = [];
    let got = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
      got += r.value.length;
      if (onProgress) onProgress(got, total);
      if (got > 600 * 1024 * 1024) throw new Error('TOO LARGE');   // 600MB 上限，别把用户硬盘吃满
    }
    blob = new Blob(chunks, { type: type });
  }
  const c = await caches.open(CACHE_NAME);
  await c.put(url, new Response(blob, {
    headers: { 'content-type': type, 'content-length': String(blob.size) }
  }));
  return blob.size;
}
async function cachePlay(url) {
  if (!cacheSupported()) return false;
  try {
    const c = await caches.open(CACHE_NAME);
    const res = await c.match(url);
    if (!res) return false;
    const blob = await res.blob();
    if (typeof URL === 'undefined' || !URL.createObjectURL) return false;
    srcApplyUrl(URL.createObjectURL(blob), 'cache', url.split('?')[0].split('/').pop() || 'cached');
    SRC.note = 'CACHED SOURCE  ·  ' + (blob.size / 1048576).toFixed(1) + ' MB';
    return true;
  } catch (e) { return false; }
}
async function cacheDelete(i) {
  const it = DL.list[i];
  if (!it || !cacheSupported()) return;
  try { const c = await caches.open(CACHE_NAME); await c.delete(it.url); } catch (e) { /* 忽略 */ }
  DL.list = await cacheList();
  if (DL.sel >= DL.list.length) DL.sel = Math.max(0, DL.list.length - 1);
}
// 从网址取音频：先尝试下载进缓存（成功则离线可播、还能进曲库），失败再退回直连播放
function loadFromUrl(u) {
  try { audioEl.referrerPolicy = 'no-referrer'; } catch (e0) { /* 老浏览器忽略 */ }
  if (!cacheSupported()) {                     // file:// 或老浏览器：直接播
    srcApplyUrl(u, 'url', u.replace(/^.*\//, ''));
    SRC.note = 'DIRECT PLAY (NO CACHE API)';
    return;
  }
  DL.active = true; DL.url = u; DL.got = 0; DL.total = 0; DL.err = '';
  SRC.note = 'DOWNLOADING ...';
  SRC.flash = performance.now();
  cachePut(u, function (got, total) {
    DL.got = got; DL.total = total;
    SRC.note = total > 0
      ? 'DOWNLOADING ' + Math.round(got / total * 100) + '%'
      : 'DOWNLOADING ' + (got / 1048576).toFixed(1) + ' MB';
  }).then(function (size) {
    DL.active = false;
    return cachePlay(u).then(function (ok) {
      if (!ok) srcApplyUrl(u, 'cache', u.replace(/^.*\//, ''));
      SRC.note = 'CACHED  ·  ' + (size / 1048576).toFixed(1) + ' MB  ·  ' + DL.list.length + ' IN LIBRARY';
    });
  }).then(function () {
    return cacheList();
  }).then(function (l) {
    DL.list = l;
  }).catch(function (e) {
    DL.active = false;
    DL.err = String((e && e.message) || e).slice(0, 18);
    // 下载不了（CORS / 403 / 防盗链）→ 退回 <audio> 直连，至少还能试试能不能播
    srcApplyUrl(u, 'url', u.replace(/^.*\//, ''));
    SRC.note = 'CACHE FAILED (' + DL.err + ') — DIRECT PLAY';
  });
}

function renderCacheList(frame) {
  const L = getL(), C = COL();
  const w = Math.min(104, L.C - 20), h = 17;
  const x = Math.floor((L.C - w) / 2), y = Math.floor((L.R - h) / 2) - 3;
  SRC.box = { x: x, y: y, w: w, h: h };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    frame.erase(x + i, y + j);
    if (((i + j) % 3) === 0) frame.set(x + i, y + j, '.', C.glowFar);
  }
  frame.box(x, y, w, h, C.bright, 'CACHED LIBRARY', C.pure);
  frame.text(x + w - 10, y, '[ESC] BACK', C.light);
  if (!DL.list.length) {
    frame.centerText(y + 7, 'EMPTY — USE [3] LOAD FROM URL', C.mid);
    frame.centerText(y + 9, 'cached files stay on this device', C.dark);
  }
  const rows = Math.min(DL.list.length, 6);
  const top = Math.max(0, Math.min(DL.sel - 2, DL.list.length - rows));
  for (let r = 0; r < rows; r++) {
    const i = top + r, it = DL.list[i], sel = (i === DL.sel), yy = y + 4 + r * 2;
    frame.text(x + 3, yy, sel ? '>' : ' ', C.pure);
    frame.text(x + 5, yy, (it.name || it.url).slice(0, 34).padEnd(35, ' '), sel ? C.pure : C.mid, sel);
    frame.rightText(x + w - 4, yy, it.size ? (it.size / 1048576).toFixed(1) + ' MB' : '--', sel ? C.light : C.dark);
  }
  frame.text(x + 3, y + h - 3, 'ENTER PLAY   ·   X DELETE   ·   ESC BACK', C.light);
  frame.text(x + 3, y + h - 1, DL.list.length + ' CACHED  ·  ' + (cacheSupported() ? 'CACHE STORAGE ACTIVE' : 'CACHE API UNAVAILABLE'), C.dark);
}

function renderSrcPanel(frame) {
  const L = getL(), C = COL();
  if (DL.view) { renderCacheList(frame); return; }
  const w = Math.min(104, L.C - 20), h = 19;   // 现在有 5 项
  const x = Math.floor((L.C - w) / 2), y = Math.floor((L.R - h) / 2) - 3;
  SRC.box = { x: x, y: y, w: w, h: h };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    frame.erase(x + i, y + j);
    if (((i + j) % 3) === 0) frame.set(x + i, y + j, '.', C.glowFar);
  }
  frame.box(x, y, w, h, C.bright, 'AUDIO SOURCE', C.pure);
  frame.text(x + w - 11, y, '[M] CLOSE', C.light);
  const items = [
    ['1', 'BUILT-IN FILE', SRC.mode === 'local' ? 'ACTIVE' : 'music.mp3 / flac / ogg ...'],
    ['2', 'UPLOAD FROM DISK', SRC.mode === 'file' ? (SRC.name || 'ACTIVE') : 'click here -> file dialog'],
    ['3', 'LOAD FROM URL', SRC.mode === 'url' ? (SRC.name || 'ACTIVE') : (cacheSupported() ? 'download into web cache' : 'type an http(s) address')],
    ['4', 'CACHED LIBRARY', !cacheSupported() ? 'needs https / localhost'
      : (DL.list.length ? DL.list.length + ' song(s) offline' : 'empty — cache a url first')],
    ['5', 'TARGET SONG', (SRC.target === 'search' ? 'SONG 2  world.search(you);' : 'SONG 1  world.execute(me);')]
  ];
  for (let i = 0; i < items.length; i++) {
    const sel = (i === SRC.sel), yy = y + 4 + i * 2;
    frame.text(x + 3, yy, sel ? '>' : ' ', C.pure);
    frame.text(x + 5, yy, ('[' + items[i][0] + '] ' + items[i][1]).padEnd(24, ' '), sel ? C.pure : C.mid, sel);
    frame.text(x + 31, yy, items[i][2].slice(0, w - 34), sel ? C.light : C.dark);
  }
  const src = String(AUDIO_CANDIDATES[0] || 'music.mp3');
  const srcCols = w - 6;
  frame.text(x + 4, y + h - 4, ('SOURCE : ' + src).slice(0, srcCols), C.dark);
  if (src.length + 9 > srcCols) frame.set(x + 3 + srcCols, y + h - 4, '>', C.mid);   // 截断标记
  frame.text(x + 4, y + h - 2, SRC.note || 'CLICK OR UP/DOWN + ENTER   ·   ESC CLOSE   ·   DROP A FILE ANYWHERE', C.light);
}
function layoutUrlBox() {
  const L = getL(), b = SRC.box;
  placeInput(urlInputEl, b.x + 5, b.y + 11, b.w - 10);
}


/* ---------------------------------------------------------------------------
   [16.6] 触屏按钮条：手机上必须有可点的按钮（键盘和鼠标都没有）
   按钮用 HTML 画但颜色/字体与终端一致（border 用 currentColor → 跟随风格）
   --------------------------------------------------------------------------- */
const padEl = document.getElementById('pad');
const padToggleEl = document.getElementById('padToggle');
let PAD_OPEN = true;                 // 侧栏默认展开，点把手折叠
const padBtns = padEl ? Array.prototype.slice.call(padEl.querySelectorAll('button')) : [];
const IS_TOUCH = (typeof navigator !== 'undefined') &&
  ((navigator.maxTouchPoints | 0) > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window));
function padShow(act, on) {
  for (let i = 0; i < padBtns.length; i++) if (padBtns[i].getAttribute('data-act') === act) padBtns[i].hidden = !on;
}
function padSync() {
  if (!padEl) return;
  padEl.className = IS_TOUCH ? (PAD_OPEN ? 'on' : 'on collapsed') : '';
  if (padToggleEl) {
    padToggleEl.className = IS_TOUCH ? (PAD_OPEN ? 'on open' : 'on') : '';
    padToggleEl.textContent = PAD_OPEN ? '›' : '‹';
    padToggleEl.style.color = CONFIG.colors.bright || '#ffffff';
  }
  if (!IS_TOUCH) return;
  padEl.style.color = CONFIG.colors.bright || '#ffffff';
  const st = STAGE;
  padShow('up', st === 'STYLE' || st === 'MV');
  padShow('down', st === 'STYLE' || st === 'MV');
  padShow('ok', st === 'STYLE' || st === 'DIALOG' || st === 'MV' || st === 'LOADING');
  padShow('audio', st === 'STYLE' || st === 'ERROR');
  padShow('yes', st === 'SHUTDOWN');
  padShow('no', st === 'SHUTDOWN');
  padShow('dev', st === 'MV' && ENABLE_DEV_MODE);
  for (let i = 0; i < padBtns.length; i++) {              // 只按阶段换标签，不读 textContent 兜底
    const bt = padBtns[i];
    if (bt.hidden) continue;
    const lb = PAD_LABEL[st + ':' + bt.getAttribute('data-act')];
    if (lb) bt.textContent = lb;
  }
}
const PAD_LABEL = {
  'STYLE:ok': 'OK', 'STYLE:audio': 'AUDIO', 'STYLE:up': '▲', 'STYLE:down': '▼',
  'MV:ok': '❚❚', 'MV:up': '◀◀', 'MV:down': '▶▶', 'MV:dev': 'DEV',
  'DIALOG:ok': 'SEND', 'LOADING:ok': 'SKIP', 'SEARCH_INPUT:ok': 'ENTER'
};
function padAct(act) {
  unlockAudio();
  if (act === 'yes') { shutPick('yes'); return; }
  if (act === 'no') { shutPick('no'); return; }
  if (STAGE === 'SEARCH_INPUT' && act === 'ok') { if (!SEEK.ok && seekCheck()) SEEK.okP = 0; return; }
  if (act === 'audio') { srcOpen(!SRC.open); return; }
  if (act === 'dev') { devPanel.toggle(); return; }
  if (STAGE === 'STYLE') {
    if (act === 'up') styleSelector.move(-1);
    else if (act === 'down') styleSelector.move(1);
    else if (act === 'ok') { if (SRC.open) srcActivate(); else styleSelector.confirm(); }
  } else if (STAGE === 'DIALOG') {
    if (act === 'ok' && DLG.phase === 'input') dlgSubmit();
  } else if (STAGE === 'LOADING') {
    if (act === 'ok') LOAD.forced = true;
  } else if (STAGE === 'MV') {
    if (act === 'ok') { if (AUDIO.paused) safePlay(); else safePause(); }
    else if (act === 'up') { try { audioEl.currentTime = Math.max(0, AUDIO.time - 10); } catch (e) { /* 忽略 */ } }
    else if (act === 'down') { try { audioEl.currentTime = Math.min(AUDIO.duration - 0.2, AUDIO.time + 10); } catch (e) { /* 忽略 */ } }
  }
}
for (let i = 0; i < padBtns.length; i++) {
  const act = padBtns[i].getAttribute('data-act');
  padBtns[i].addEventListener('click', function (ev) { ev.preventDefault(); padAct(act); });
}
if (padToggleEl) padToggleEl.addEventListener('click', function (ev) {
  ev.preventDefault();
  PAD_OPEN = !PAD_OPEN;                 // 折叠/展开侧栏
  padSync();
});

/* ---- 音频事件 ---- */
// 音源状态回执：让"导入成功没有"这件事在界面上看得见
audioEl.addEventListener('canplay', function () {
  if (AUDIO.ok || AUDIO.duration > 0) SRC.note = 'READY  ·  ' + fmtTime(AUDIO.duration);
});
audioEl.addEventListener('error', function () {
  if (!AUDIO.ok && SRC.note.indexOf('LOADING') === 0) SRC.note = 'SOURCE UNREADABLE';
});
audioEl.addEventListener('loadedmetadata', function () {
  const d = audioEl.duration;
  if (typeof d === 'number' && isFinite(d) && d > 0) { AUDIO.duration = d; AUDIO.ok = true; buildLyrics(d); }
});
audioEl.addEventListener('durationchange', function () {
  const d = audioEl.duration;
  if (typeof d === 'number' && isFinite(d) && d > 0 && !AUDIO.ok) { AUDIO.duration = d; AUDIO.ok = true; buildLyrics(d); }
});
audioEl.addEventListener('error', function () {
  if (AUDIO.ok) return;                         // 播放中途出错不切换源
  // 用户手动选的来源（上传文件 / 网址）失败时，不要把他甩回报错页 —— 那样看着就是"没反应"。
  // 就地说明原因，让他能马上换一个。
  if (SRC.mode === 'file' || SRC.mode === 'url') {
    const ec = (audioEl.error && audioEl.error.code) | 0;
    SRC.note = 'LOAD FAILED — ' + (ec === 4 ? 'UNSUPPORTED / 403 / 404'
      : ec === 3 ? 'DECODE ERROR' : ec === 2 ? 'NETWORK ERROR' : ec === 1 ? 'ABORTED' : 'UNKNOWN');
    SRC.flash = performance.now();
    if (STAGE === 'ERROR') enterStage('STYLE');
    else if (STAGE === 'LOADING') LOAD.forced = true;   // 别卡在同步页
    return;
  }
  loadSource(AUDIO.idx + 1);
});
audioEl.addEventListener('ended', function () {
  if (STAGE !== 'MV') return;
  // 第一首结束 → Y/N 关机确认；第二首结束 → 直接收尾
  enterStage(SONGS.current === 'search' ? 'END' : 'SHUTDOWN');
});
