'use strict';

/* ===========================================================================
   [17] 第二首：world.search(you);  —— 米黄 / 柔和现代显示
   与第一首完全相反的视觉：没有扫描线、没有 RGB 分离、没有锐化，
   改成柔光模糊 + 胶片颗粒 + 暖色暗角。整首歌是"一次搜索的连续演变"。
   =========================================================================== */

// SONGS 已在前面声明（getL 之前），这里不再重复
const REMOTE_AUDIO2 = 'https://ycbasr-d5gvv7az2cb986021-1316612369.tcloudbaseapp.com/music2.flac';
const SONG2_CANDIDATES = [REMOTE_AUDIO2, 'music2.mp3', 'music2.flac', 'music2.ogg', 'music2.wav', 'music2.m4a'];
const SONG1_CANDIDATES = AUDIO_DEFAULT_CANDIDATES.slice();

function songCandidates(song) { return song === 'search' ? SONG2_CANDIDATES : SONG1_CANDIDATES; }

/* ---------- 第二首的场景边界：直接从歌词里找关键句（比硬编码百分比稳） ---------- */
let SEARCH_SCENES = { intro: 0, morph1: 1, morph2: 1, chorus: 1, bridge: 1, outro: 1 };
function searchKeyTime(re) {
  for (let i = 0; i < CONFIG.lyrics.length; i++) if (re.test(CONFIG.lyrics[i].en)) return CONFIG.lyrics[i].t;
  return 1;
}
function buildLyricsSearch(d) {
  CONFIG.lyrics = LYRICS_SEARCH.map(function (l) {
    return { t: clamp(l.sec / d, 0, 1), sec: l.sec, en: l.en, cn: l.cn };
  });
  MOTIF_BY_INDEX = CONFIG.lyrics.map(function (l) { return searchMotifFor(l); });
  for (let i = MOTIF_BY_INDEX.length - 2; i >= 0; i--) {
    if (!MOTIF_BY_INDEX[i]) MOTIF_BY_INDEX[i] = MOTIF_BY_INDEX[i + 1];   // 桥句继承下一句
  }
  GRIEF_IDX = -1; LEAVE_OCC = [];
  SEARCH_SCENES = {
    intro: 0,
    morph1: searchKeyTime(/turn into a table/i),
    morph2: searchKeyTime(/if you're a cat/i),
    chorus: searchKeyTime(/^i'm searching for$/i),
    bridge: searchKeyTime(/bucket of love/i),
    outro: searchKeyTime(/if you're a dog/i)
  };
}

/* ---------- 开场散落的预设碎片 ---------- */
const INTRO_BLOCKS = [
  { fx: 0.04, fy: 0.06, at: 1.0, lines: ['preset = {', '  target : "you",', '  scope  : ALL_FORMS', '}'] },
  { fx: 0.04, fy: 0.52, at: 2.6, lines: ['forms = [ TABLE,', '  EGGPLANT, CAT,', '  STEAK, FLOWER,', '  HUMAN, DOG,', '  TOMATO, PIECE ]'] },
  { fx: 0.56, fy: 0.05, at: 4.0, lines: ['filter = {', '  warmth  > 0.80,', '  purr    == false,', '  wobble  == true', '}'] },
  { fx: 0.60, fy: 0.46, at: 5.6, lines: ['match   : PERFECT_ONLY', 'fallback: null', 'retry   : Infinity'] },
  { fx: 0.34, fy: 0.74, at: 7.4, lines: ['search(world, you)', '  -> indexing ...'] },
  { fx: 0.06, fy: 0.30, at: 9.0, lines: ['// no form fits', '// keep looking'] }
];

/* ---------- 搜索结果信息（点开缩略图时弹窗显示） ---------- */
const FORM_INFO = {
  table:    ['TABLE',          'leg count 4 -> 3, odd stubby leg detected'],
  eggplant: ['EGGPLANT',       'scratchy nail marks on body'],
  cat:      ['CAT / KITTEN',   'blue-point, meows a lot, never purrs'],
  steak:    ['FILLET MIGNON',  'browned outside, medium-rare inside'],
  flower:   ['FLOWER',         'blooms just occasionally'],
  human:    ['HUMAN',          'warm hands, bit of stinky breath'],
  dog:      ['LITTLE PUPPY',   'going ruff ruff ruff'],
  tomato:   ['TOMATO',         'full of juice'],
  poop:     ['PIECE OF SHEET', 'rejected — not a perfect form'],
  piece:    ['PIECE',          'name not recalled'],
  bucket:   ['BUCKET OF LOVE', 'some empty, some filled up'],
  shatter:  ['CELL',           'cut into pieces, broken down'],
  merge:    ['EVOLVED',        'merged back up, we have evolved'],
  grid:     ['SEARCH INDEX',   'scanning all forms'],
  fade:     ['OLD SELF',       'gone since you have left'],
  code:     ['QUERY',          'search(world, you)']
};
/* 可点击命中点：预分配池，逐帧只改内容不新建对象（热路径零分配） */
const SEARCH_HITS = [];
for (let i = 0; i < 8; i++) SEARCH_HITS.push({ form: 'human', box: { x: 0, y: 0, w: 0, h: 0 } });
let SEARCH_HIT_N = 0;
const SEARCH_POP = { open: false, form: 'human', match: 0 };

/* ---------- 搜索形态：一张极简轮廓表 ---------- */
const SEARCH_FORMS = [
  [/perfect table/i, 'table'], [/turn into a table/i, 'table'], [/elbows|wobbly|stubby/i, 'table'],
  [/perfect eggplant/i, 'eggplant'], [/turn into an eggplant/i, 'eggplant'], [/purple friend|scratchy nail/i, 'eggplant'],
  [/never purr|meowing|hissing|blue point|little kitten/i, 'cat'], [/if you're a cat/i, 'cat'],
  [/fillet|browned|medium-rare/i, 'steak'], [/if you're a steak/i, 'steak'],
  [/perfect flower/i, 'flower'], [/turn into a flower/i, 'flower'], [/most delicate|bloom just/i, 'flower'],
  [/perfect human/i, 'human'], [/turn into a human/i, 'human'], [/warmth|stinky breath/i, 'human'],
  [/ruff|little puppy/i, 'dog'], [/if you're a dog/i, 'dog'],
  [/a tomato|full of juice/i, 'tomato'], [/if you're a fruit/i, 'tomato'],
  [/piece of sheet/i, 'poop'], [/if you're a piece/i, 'poop'],
  [/it called|that word|u-um|do-o|lo-o/i, 'piece'],
  [/bucket of love|filled up|some of us/i, 'bucket'],
  [/cut this into pieces|break us down/i, 'shatter'],
  [/merge us back up|evolved/i, 'merge'],
  [/side by side|reach for the top|take a memory|sweetest/i, 'code'],
  [/i'm searching|searching for|most everything|stop transforming/i, 'grid'],
  [/old self/i, 'fade']
];
const RING_LINE = /you're the only perfect/i;
function searchMotifFor(line) {
  if (!line || !line.en) return null;
  for (const [pattern, form] of SEARCH_FORMS) {
    if (!pattern.test(line.en)) continue;
    return {
      form,
      ring: RING_LINE.test(line.en),
      wobble: /stubby|wobbly/i.test(line.en),
      scratch: /scratchy nail/i.test(line.en),
      voice: /meowing|hissing|ruff/i.test(line.en),
      transform: /stop transforming/i.test(line.en),
      bloom: /bloom just/i.test(line.en)
    };
  }
  return null;
}

/* ---------- 极简轮廓绘制 ---------- */
function sEllipse(frame, cx, cy, rx, ry, ch, col, glow, k) {
  const n = Math.max(24, Math.round((rx + ry) * 3));
  for (let i = 0; i < n * clamp(k === undefined ? 1 : k, 0, 1); i++) {
    const th = (i / n) * Math.PI * 2;
    frame.set(Math.round(cx + Math.cos(th) * rx), Math.round(cy + Math.sin(th) * ry * 0.55), ch, col, glow);
  }
}
function drawForm(frame, form, cx, cy, width, height, options = {}) {
  const C = COL();
  const { progress = 1, phase = 0, wobble = false, tint = C.bright, bounds } = options;
  if (ASCII_SHAPES[form]) {
    drawAsciiShape(frame, form, cx, cy, width, height, { mode: 'paper', progress, phase, bounds, tint });
    return;
  }
  const S = width * 0.48;
  switch (form) {
    case 'table': {
      const rx = Math.max(2, Math.round(S * 0.86));
      const ry = Math.max(1, Math.round(height * 0.20));
      const lean = wobble ? 0.8 + Math.sin(phase * Math.PI * 6) * 1.6 : 0;
      const top = cy - ry;
      asciiLine(frame, cx - rx, top, cx + rx, top + lean, '=', tint, false, bounds);
      asciiLine(frame, cx - rx + 2, top - 2, cx + rx + 2, top - 2 + lean, '-', C.dark, false, bounds);
      asciiLine(frame, cx - rx, top, cx - rx + 2, top - 2, '/', tint, false, bounds);
      asciiLine(frame, cx + rx, top + lean, cx + rx + 2, top - 2 + lean, '/', tint, false, bounds);
      for (let i = 0; i < 4; i++) {
        const x = cx + (i < 2 ? -rx + 1 : rx - 1) + i % 2 * 3;
        const y = top + (i % 2 ? -2 : 1) + (i < 2 ? 0 : lean);
        asciiLine(frame, x, y, x, cy + ry - (i % 2 ? 2 : 0) - (wobble && i === 2 ? ry : 0), '|', i % 2 ? C.dark : tint, false, bounds);
      }
      break;
    }
    case 'steak': {
      const rx = Math.max(2, Math.round(S * 0.85));
      const ry = Math.max(2, Math.round(height * 0.36));
      for (let y = -ry; y <= ry; y++) {
        for (let x = -rx; x <= rx; x++) {
          const yy = y / ry + 0.12 * Math.sin(x / rx * Math.PI);
          const level = (x / rx) ** 2 + yy ** 2;
          if (level > 1 || progress < 0.30 + (x / rx + 1) * 0.28) continue;
          const border = level > 0.70;
          const marbled = Math.abs(Math.sin(x * 0.28 + y * 1.5)) > 0.90;
          frame.set(cx + x, cy + y, border ? '#' : marbled ? '~' : '.', border ? tint : C.alert);
        }
      }
      break;
    }
    case 'poop': {
      sEllipse(frame, cx, cy + 2, S, height * 0.5, '~', C.dark, false, progress);
      sEllipse(frame, cx, cy, S * 0.78, height * 0.42, '#', tint, false, progress);
      sEllipse(frame, cx, cy - 2, S * 0.58, height * 0.36, '=', tint, false, progress);
      break;
    }
    case 'piece': {
      const half = Math.max(2, Math.round(width * 0.37));
      const h = Math.max(2, Math.round(height * 0.46));
      frame.box(cx - half, cy - h, half * 2 + 1, h * 2 + 1, C.dark);
      frame.text(cx - 1, cy, '?', tint);
      break;
    }
  }
}

function drawInkRing(frame, A, p, radius, color, marks) {
  const n = Math.ceil(radius * 5);
  for (let i = 0; i <= n * p; i++) {
    if (i % 13 > 9) continue;
    const theta = i / n * Math.PI * 2 - Math.PI * 0.5;
    const x = Math.round(A.cx + Math.cos(theta) * radius);
    const y = Math.round(A.cy + Math.sin(theta) * radius * 0.45);
    if (x < A.L.cx0 || x > A.L.cx1 || y <= A.L.mainTop || y >= A.L.mainBot - 1) continue;
    frame.set(x, y, marks[i % marks.length], color);
  }
}

/* ---------- 六个场景 ---------- */
function searchArea() {
  const L = getL();
  const cx = Math.round((L.cx0 + L.cx1) / 2);
  const cy = Math.round((L.mainTop + L.mainBot) / 2);
  const height = Math.round((L.mainBot - L.mainTop) * 0.65);
  const width = Math.round(Math.min(height * 2.02, (L.cx1 - L.cx0) * 0.47));
  return { L, cx, cy, width, height };
}
/* 搜索网格底纹：越到后面越密 */
function searchGridBg(frame, dens, col) {
  const L = getL();
  for (let y = L.mainTop; y <= L.mainBot; y += 3) {
    for (let x = L.cx0; x <= L.cx1; x += 4) {
      if (hash11(x * 0.7 + y * 1.3) < dens) frame.set(x, y, '+', col);
    }
  }
}
function scene_search_intro(t, u) {
  const frame = FRAME;      // 六个场景都从这里取帧缓冲
  const A = searchArea(), L = A.L, C = COL();
  const blink = MOTION_REDUCED.matches || t % 1.2 < 0.60;
  // —— 左侧：预览窗口 + 待输入光标
  const lx = L.cx0 + Math.round((L.cx1 - L.cx0) * 0.16);
  const ly = A.cy;
  frame.centerText(ly - 6, 'S E A R C H', C.dark);
  frame.text(lx - 2, ly, blink ? '_' : ' ', C.mid, true);
  frame.text(lx - 8, ly + 3, 'idle', C.deep);
  // —— 多个预设碎片散落在整个画面上，各自按时间开始打字，并缓慢浮动
  const BLOCKS = INTRO_BLOCKS;
  const spanX = L.cx1 - L.cx0, spanY = L.mainBot - L.mainTop;
  for (let b = 0; b < BLOCKS.length; b++) {
    const B = BLOCKS[b];
    const bx = L.cx0 + 2 + Math.round(B.fx * (spanX - 30));
    const by = L.mainTop + 1 + Math.round(B.fy * (spanY - B.lines.length - 2)) +
               Math.round(Math.sin(t * 0.5 + b) * 1.2);          // 缓慢浮动
    const shown = (t - B.at) / 1.5;
    if (shown < 0) continue;
    for (let i = 0; i < B.lines.length; i++) {
      if (i > shown) break;
      const full = B.lines[i], cur = Math.floor(shown);
      const part = (i === cur) ? Math.max(1, Math.round((shown - i) * full.length)) : full.length;
      frame.text(bx, by + i, full.slice(0, part), i === 0 ? C.mid : C.dark);
    }
    if (shown > B.lines.length && ((t * 3 + b) % 1) < 0.5) frame.set(bx + 1, by + B.lines.length, '_', C.deep);
  }
  if (u > 0.045) searchGridBg(frame, 0.05, C.deep);
}
function drawSearchPortrait(frame, A, motif) {
  const { cx, cy, width, height, L } = A;
  const C = COL();
  const same = MOTIF_BY_INDEX[VIS.idx - 1]?.form === motif.form;
  const motion = !MOTION_REDUCED.matches;
  const p = motion ? clamp(VIS.elapsed / 0.86, 0, 1) : 1;
  const progress = same && !motif.bloom ? 1 : 0.2 + easeOut(p) * 0.8;
  const stamp = motif.ring;
  if (stamp || (!same && p < 1)) {
    drawInkRing(frame, A, stamp ? easeOut(0.25 + p * 0.75) : 1,
      width * (stamp ? 0.80 : 0.45 + p * 0.40), stamp ? C.alert : C.deep, stamp ? '...+---' : '.....');
  }
  drawForm(frame, motif.form, cx, cy, width, height, {
    progress,
    phase: motion && (motif.voice || motif.wobble) ? 0.001 + (VIS.elapsed * 0.85) % 1 : 0,
    wobble: motif.wobble,
    tint: stamp ? C.pure : C.bright,
    bounds: L
  });
  if (motif.scratch) {
    for (let j = 0; j < 3; j++) {
      const x = cx + j * 3 - 2;
      asciiLine(frame, x, cy + 1 + j, x - 4, cy + 4 + j * 2, '/', C.alert, false, L);
    }
  }
  if (stamp) frame.centerText(L.mainBot - 1, 'MATCH  /  ' + FORM_INFO[motif.form][0], C.alert);
}

const CONTACT_FORMS = ['table', 'eggplant', 'cat', 'flower', 'human', 'dog', 'tomato', 'steak'];

function drawContactSheet(frame, A, t, motif) {
  const { L, cx, cy, width, height } = A;
  const C = COL();
  const cardW = Math.min(28, Math.floor((L.cx1 - L.cx0 - 12) / 4) - 3);
  const cardH = Math.min(14, Math.floor((L.mainBot - L.mainTop - 5) / 2));
  const pitch = cardW + 3;
  const left = cx - Math.floor(pitch * 2) + 1;
  const top = cy - cardH - 1;
  const reduced = MOTION_REDUCED.matches;
  const p = reduced ? 0.5 : (t * 0.52) % 1;
  const focus = Math.min(7, Math.floor(p * 8));

  if (motif.form === 'fade') {
    const cells = asciiRaster('human', width, height);
    for (const { x, y, edge, seed } of cells) {
      if (!edge || seed < VIS.p * 0.84) continue;
      frame.set(cx + x, cy + y, seed > 0.8 ? ':' : '.', C.dark);
    }
    drawInkRing(frame, A, 1, width * 0.77, C.deep, '....+');
    frame.centerText(L.mainBot - 2, 'NO RECORD', C.alert);
    return;
  }

  for (let slot = 0; slot < CONTACT_FORMS.length; slot++) {
    const x = left + slot % 4 * pitch, y = top + Math.floor(slot / 4) * (cardH + 2);
    const hot = slot === focus;
    const version = motif.transform && !reduced ? Math.floor(VIS.elapsed * 2.5) : 0;
    const form = CONTACT_FORMS[(slot + version) % CONTACT_FORMS.length];
    frame.box(x, y, cardW, cardH, hot ? C.alert : C.deep);
    if (hot && !reduced) {
      const scanY = y + 1 + Math.floor(p * 8 % 1 * (cardH - 3));
      frame.hline(x + 1, x + cardW - 2, scanY, '.', C.alert);
    }
    const px = x + Math.floor(cardW / 2), py = y + Math.floor((cardH - 1) / 2);
    drawForm(frame, form, px, py, cardW * 0.61, Math.max(4, cardH - 6), { tint: hot ? C.pure : C.dark });
    const label = FORM_INFO[form][0].split(' / ')[0];
    frame.text(px - Math.floor(label.length / 2), y + cardH - 2, label, hot ? C.alert : C.dark);
    const hit = SEARCH_HITS[SEARCH_HIT_N++];
    hit.form = form;
    Object.assign(hit.box, { x, y, w: cardW, h: cardH });
  }
  frame.centerText(L.mainBot - 1, 'SEARCH INDEX   /   CLICK A RESULT', C.dark);
}

function bridgeBuckets(frame, A, C, elapsed, isFilledLine) {
  const { L, cx, cy, width, height } = A;
  const rx = Math.max(5, Math.round(width * 0.23));
  const ry = Math.max(3, Math.round(height * 0.31));
  const fillProgress = isFilledLine && !MOTION_REDUCED.matches ? easeOut(clamp(elapsed / 1.35, 0, 1)) : 1;
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * Math.round(rx * 2.9);
    const rim = cy - ry;
    const bottom = cy + ry;
    const foot = Math.round(rx * 0.72);
    asciiLine(frame, x - rx, rim, x - foot, bottom, '\\', C.dark, false, L);
    asciiLine(frame, x + rx, rim, x + foot, bottom, '/', C.dark, false, L);
    asciiLine(frame, x - foot, bottom, x + foot, bottom, '_', C.dark, false, L);
    const level = Math.round((2 * ry - 2) * (i === 0 ? 0 : i === 1 ? 0.38 : 0.85) * fillProgress);
    for (let j = 0; j < level; j++) {
      const localWidth = foot + Math.floor((rx - foot) * (j + 1) / (ry * 2)) - 1;
      for (let k = -localWidth; k <= localWidth; k++) {
        if ((j + k) % 3 === 0) frame.set(x + k, bottom - 1 - j, j === level - 1 ? '~' : ':', C.alert);
      }
    }
    asciiLine(frame, x - rx, rim, x + rx, rim, '-', C.bright, false, L);
    const label = ['EMPTY', 'HALF', 'FILLED'][i];
    frame.text(x - Math.floor(label.length / 2), bottom + 3, label, C.dark);
  }
}

function drawSearchCells(frame, A, merge, p) {
  const { L, cx, cy, width, height } = A;
  const C = COL();
  const reduced = MOTION_REDUCED.matches;
  const travel = reduced ? (merge ? 0 : 0.78) : merge ? (1 - easeInOut(p)) : easeOut(p);
  const cells = asciiRaster('human', width, height);
  for (const { x, y, edge, seed } of cells) {
    if (travel > 0.23 && seed < travel * 0.56) continue;
    const angle = hash11(Math.floor(x / 4) * 11 + Math.floor(y / 3)) * Math.PI * 2;
    const px = Math.round(cx + x + (x * 1.05 + Math.cos(angle) * width * 0.44) * travel);
    const py = Math.round(cy + y + (y * 0.20 + Math.sin(angle) * height * 0.49) * travel);
    if (px <= L.cx0 || px >= L.cx1 || py <= L.mainTop || py >= L.mainBot - 2) continue;
    frame.set(px, py, edge ? '#' : travel > 0.25 ? '+' : '=', edge ? C.bright : C.mid);
  }
  if (merge && travel < 0.32) drawInkRing(frame, A, 1, width * (0.70 + travel * 0.45), C.alert, '....+');
  frame.centerText(L.mainBot - 1, merge ? 'MERGE  /  HUMAN' : 'PARTITION  /  CELL', C.dark);
}

function drawSearchEnd(frame, A, t, last) {
  const C = COL();
  const p = MOTION_REDUCED.matches ? 1 : clamp((t - (last.sec + 4.5)) / 1.8, 0, 1);
  frame.centerText(A.cy - 2, 'world.search(you);', mixColor(C.black, C.pure, 0.45 + p * 0.55));
  frame.set(A.cx + 10, A.cy - 2, p > 0.7 && t % 1.2 < 0.6 ? '_' : ' ', C.alert);
  frame.centerText(A.cy + 3, 'M I L I', mixColor(C.black, C.bright, p));
}

/* 第二首的统一入口：按时间选场景 */
function searchSceneAt(t) {
  const total = AUDIO.duration || 1;
  const n = t / total;
  if (n < SEARCH_SCENES.morph1) return 1;
  if (n < SEARCH_SCENES.morph2) return 2;
  if (n < SEARCH_SCENES.chorus) return 3;
  if (n < SEARCH_SCENES.bridge) return 4;
  if (n < SEARCH_SCENES.outro) return 5;
  return 6;
}
function renderSearchContent(f, si, t, u) {
  const A = searchArea(), C = COL(), L = A.L;
  f.clear();
  const m = VIS.m;
  const last = CONFIG.lyrics[CONFIG.lyrics.length - 1];
  if (last && t > last.sec + 4.5) {
    drawSearchEnd(f, A, t, last);
    return;
  }

  const k = ['intro', 'morph1', 'morph2', 'chorus', 'bridge', 'outro'][si - 1];
  const seconds = t - SEARCH_SCENES[k] * AUDIO.duration;
  const turn = si > 1 && !MOTION_REDUCED.matches ? 1 - clamp(seconds / 0.65, 0, 1) : 0;
  const edge = drawPaperEdges(f, A, turn);
  if (si === 1 || !m || m.form === 'code') {
    scene_search_intro(t, u);
  } else if (m.form === 'grid' || m.form === 'fade') {
    drawContactSheet(f, A, t, m);
  } else if (m.form === 'bucket') {
    bridgeBuckets(f, A, C, VIS.elapsed, MOTIF_BY_INDEX[VIS.idx - 1]?.form === 'bucket');
  } else if (m.form === 'shatter' || m.form === 'merge') {
    drawSearchCells(f, A, m.form === 'merge', VIS.p);
  } else {
    searchGridBg(f, 0.035, C.deep);
    drawSearchPortrait(f, A, m);
  }
  if (edge !== null) {
    for (const x of [L.cx0, L.cx1]) f.set(x, edge, '+', C.alert);
  }

  f.text(2, L.hdr, 'world.search(you);', C.dark);
  f.rightText(L.C - 3, L.hdr, fmtTime(Math.max(0, t)) + '  /  ' + fmtTime(AUDIO.duration), C.dark);
  drawLyricsSearch(f, t);
}

// A short crease travels down the paper margin as the chapter changes.
function drawPaperEdges(frame, A, turn) {
  const { L } = A;
  const C = COL();
  const edge = L.mainTop + Math.round((L.mainBot - L.mainTop) * (1 - turn));
  for (const x of [L.cx0, L.cx1]) {
    for (let y = L.mainTop + 1; y < L.mainBot; y += 2) {
      if (turn > 0 && y < edge) continue;
      frame.set(x, y, ':', C.deep);
    }
  }
  return turn > 0 ? edge : null;
}

/* 搜索结果弹窗：点缩略图浮出来 */
function drawSearchPopup(f) {
  if (!SEARCH_POP.open) return;
  const L = getL(), C = COL();
  const info = FORM_INFO[SEARCH_POP.form] || [String(SEARCH_POP.form).toUpperCase(), ''];
  const w = Math.min(78, L.C - 16), x = Math.floor((L.C - w) / 2), y = Math.round(L.R * 0.26), bh = 11;
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < w; i++) {
      f.erase(x + i, y + j);
      if (((i + j) % 4) === 0) f.set(x + i, y + j, '.', C.deep);
    }
  }
  f.box(x, y, w, bh, C.alert, 'SEARCH RESULT', C.bright);
  f.text(x + w - 12, y, '[X] CLOSE', C.mid);
  f.text(x + 3, y + 2, 'form   : ' + info[0], C.bright, true);
  f.text(x + 3, y + 4, 'match  : ' + SEARCH_POP.match + '%', C.alert, true);
  f.text(x + 3, y + 6, 'query  : search(you, { form: ' + info[0] + ' })', C.mid);
  f.text(x + 3, y + 8, 'notes  : ' + info[1], C.dark);
  f.rightText(x + w - 3, y + bh - 2, 'click to close', C.dark);
}
function searchClickAt(gx, gy) {
  for (let i = 0; i < SEARCH_HIT_N; i++) {
    const { box, form } = SEARCH_HITS[i];
    if (gx < box.x || gx >= box.x + box.w || gy < box.y || gy >= box.y + box.h) continue;
    SEARCH_POP.open = true;
    SEARCH_POP.form = form;
    SEARCH_POP.match = Math.round(82 + hash11(i * 13.4 + Math.floor(mvTime())) * 17);
    return true;
  }
  return false;
}

function renderSearchStage() {
  const f = FRAME;
  const t = mvTime();
  const total = AUDIO.duration || 1;
  updateLyricVis(t, total);
  SEARCH_HIT_N = 0;
  renderSearchContent(f, searchSceneAt(t), t, clamp(t / total, 0, 1));
  if (AUDIO.blocked) {
    const L = getL(), C = COL();
    f.centerText(Math.round(L.R * 0.5), '> CLICK ANYWHERE TO SYNC <', C.alert, true);
    f.centerText(Math.round(L.R * 0.5) + 2, 'the browser blocked autoplay', C.dark);
  }
  drawSearchPopup(f);
  present(f);
}

/* ---------- 第二首的歌词：不做打字机，淡入 ---------- */
function drawLyricsSearch(frame, t) {
  const L = getL(), C = COL();
  if (VIS.idx < 0 || !VIS.line) return;
  const a = MOTION_REDUCED.matches ? 1 : clamp(VIS.elapsed / 0.28, 0, 1);
  const col = mixRGB(hexToRgb(C.black), hexToRgb(C.bright), 0.25 + a * 0.75);
  const colCn = mixRGB(hexToRgb(C.black), hexToRgb(C.dark), 0.2 + a * 0.8);
  const en = VIS.line.en, cn = VIS.line.cn;
  if (en) {
    const w = strW(en) + 2, x0 = Math.floor((L.C - w) / 2);
    for (let i = 0; i < w; i++) frame.erase(x0 + i, L.lyr);
    frame.centerText(L.lyr, en, col, a > 0.6);
  }
  if (cn) {
    const w2 = strW(cn) + 2, x1 = Math.floor((L.C - w2) / 2);
    for (let i = 0; i < w2; i++) frame.erase(x1 + i, L.lyrCn);
    frame.centerText(L.lyrCn, cn, colCn);
  }
}
