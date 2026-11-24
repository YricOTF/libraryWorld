'use strict';

/* ---------------------------------------------------------------------------
   [11] 五个场景
   每个函数签名都是 (norm, frame)，norm = 全局进度 0..1（= audio.currentTime / duration）。
   场景内部再用 sceneLocal 换算出自己的 0..1 局部进度，
   因此"所有场景时间点按百分比定义"这条约束贯穿始终。
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   [11.0] 场景划分（问题 5 修改点）
   原来 CONFIG.scenes 里硬编码的 14/42/72/84% 和歌词对不上（唱到 EXECUTION 画面
   已经是爱心）。现在边界直接由歌词关键句驱动，删掉了 CONFIG.scenes：
     0.00  开场                     → CREATION
     0.10  Switch on the power line → DEVOTION
     0.36  Execution, execution     → EXECUTION
     0.50  I've studied how to ...  → RELEASE
     0.76  Free me from this world  → LOVE
   每帧用 getCurrentScene(norm) 取当前区间。
   每帧用 getCurrentScene(norm) 取当前区间；边界随 LYRICS_SOURCE 自动切换。
   --------------------------------------------------------------------------- */
// 用哪一组边界取决于歌词源：
//   'USER' = 人工段落表 → 用它自己的关键句（0.10 / 0.36 / 0.50 / 0.76）
//   'LRC'  = 随附 .lrc 的真实时间戳 → 回到与原曲结构匹配的 0.14 / 0.42 / 0.72 / 0.84
// 两边必须同源，否则又会回到"歌词唱 EXECUTION、画面却是爱心"的老问题。
// 场景边界 = 歌词关键句的真实时间点（LRC 秒数 ÷ 实际时长），不再写死百分比。
// 这样"边界"和"歌词"必然同源：唱到哪句，画面就在哪个场景。
// 关键句（来自随附 .lrc）：
//   29.709  If I'm a set of points          → DEVOTION
//   88.587  Switch my gender                → EXECUTION（开始失控）
//  147.660  EXECUTION（连唱段起点）          → RELEASE（系统过载）
//  178.173  I've studied how to properly ... → LOVE（尾声）
const SCENE_KEY_LINES = [
  { name: 'CREATION',  sec: 0.000 },
  { name: 'DEVOTION',  sec: 29.709 },
  { name: 'EXECUTION', sec: 88.587 },
  { name: 'RELEASE',   sec: 147.660 },
  { name: 'LOVE',      sec: 178.173 }
];
// 若换用人工段落表（LYRICS_SOURCE = 'USER'），退回它自己那组百分比边界
const SCENE_KEY_PCT = [
  { name: 'CREATION',  start: 0.00, end: 0.10 },
  { name: 'DEVOTION',  start: 0.10, end: 0.36 },
  { name: 'EXECUTION', start: 0.36, end: 0.50 },
  { name: 'RELEASE',   start: 0.50, end: 0.76 },
  { name: 'LOVE',      start: 0.76, end: 1.00 }
];
let SCENE_KEYS = SCENE_KEY_PCT.slice();
// 拿到真实时长后重建边界（时长未就绪前先用名义时长 211.91s 兜底）
function rebuildSceneKeys(d) {
  const dur = (d > 0) ? d : 211.91;
  if (LYRICS_SOURCE === 'LRC') {
    SCENE_KEYS = SCENE_KEY_LINES.map(function (k, i) {
      return {
        name: k.name,
        start: i === 0 ? 0 : clamp(k.sec / dur, 0, 1),
        end: (i + 1 < SCENE_KEY_LINES.length) ? clamp(SCENE_KEY_LINES[i + 1].sec / dur, 0, 1) : 1
      };
    });
  } else {
    SCENE_KEYS = SCENE_KEY_PCT.slice();
  }
}
rebuildSceneKeys(0);
function getCurrentScene(normalizedTime) {
  const n = clamp(normalizedTime, 0, 1);
  for (let i = 0; i < SCENE_KEYS.length; i++) {
    if (n < SCENE_KEYS[i].end || i === SCENE_KEYS.length - 1) return SCENE_KEYS[i];
  }
  return SCENE_KEYS[SCENE_KEYS.length - 1];
}
function sceneByName(name) {
  return SCENE_KEYS.find(function (s) { return s.name === name; }) || SCENE_KEYS[0];
}
function sceneLocal(name, norm) {
  const s = sceneByName(name);
  return clamp((norm - s.start) / (s.end - s.start), 0, 1);
}
function sceneSeconds(name) {
  const s = sceneByName(name);
  return (s.end - s.start) * (AUDIO.duration || 1);
}
/* 子阶段助手（问题 2）：u 落在 [a,b) 时返回该子阶段内部的 0..1 进度，否则 -1。
   场景内部据此细分，每个子阶段画完全不同的东西。 */
function seg(u, a, b) {
  if (!(u >= a)) return -1;
  if (u >= b && b < 1) return -1;
  return clamp((u - a) / (b - a), 0, 1);
}
/* 双纽线（∞）参数方程：x = cosθ/(1+sin²θ)，y = sinθ·cosθ/(1+sin²θ) */
function lemniscate(th) {
  const s = Math.sin(th), c = Math.cos(th), den = 1 + s * s;
  return { x: c / den, y: s * c / den };
}
/* 把画面按 cell×cell 的方块随机位移（问题 2 的"碎片化"用）。
   只做一次数组拷贝，scratch 缓冲挂在 frame 上复用，不产生每帧分配。 */
function scrambleBlocks(frame, cell, seedT, amount) {
  if (amount <= 0.001) return;
  const cols = frame.cols, rows = frame.rows, n = cols * rows;
  if (!frame._tc) { frame._tc = new Array(n); frame._to = new Array(n); }
  const tc = frame._tc, to = frame._to;
  for (let i = 0; i < n; i++) { tc[i] = frame.ch[i]; to[i] = frame.co[i]; }
  frame.ch.fill(' '); frame.co.fill(null); frame.gl.fill(0);
  for (let by = 0; by < rows; by += cell) {
    for (let bx = 0; bx < cols; bx += cell) {
      const h = hash11(bx * 0.37 + by * 1.19 + seedT);
      const dx = h > amount ? 0 : Math.round((hash11(h * 91.7 + 1.3) - 0.5) * cell * 2.6 * amount);
      const dy = h > amount ? 0 : Math.round((hash11(h * 57.3 + 2.7) - 0.5) * cell * 1.4 * amount);
      for (let y = by; y < by + cell && y < rows; y++) {
        for (let x = bx; x < bx + cell && x < cols; x++) {
          const s = y * cols + x;
          const ch0 = tc[s];
          if (ch0 === ' ' || ch0 === '\u0000') continue;
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
          const d = sy * cols + sx;
          frame.ch[d] = ch0; frame.co[d] = to[s];
        }
      }
    }
  }
}
/* 整行左右平移（问题 2 的"水平撕裂"用） */
function shiftRow(frame, y, off) {
  if (off === 0) return;
  const cols = frame.cols;
  if (!frame._rc) { frame._rc = new Array(cols); frame._ro = new Array(cols); }
  const rc = frame._rc, ro = frame._ro, row = y * cols;
  for (let x = 0; x < cols; x++) { rc[x] = frame.ch[row + x]; ro[x] = frame.co[row + x]; }
  for (let x = 0; x < cols; x++) {
    const sx = x - off;
    if (sx >= 0 && sx < cols) { frame.ch[row + x] = rc[sx]; frame.co[row + x] = ro[sx]; }
    else { frame.ch[row + x] = ' '; frame.co[row + x] = null; }
  }
}

/* ===========================================================================
   [11.5] 歌词视觉层（LYRIC VISUAL LAYER）
   —— 目标：唱到哪一句，画面就画那件事。
   工作方式：renderMVStage 每帧先 updateLyricVis() 求出"当前歌词 + 行内进度 p"，
   场景函数只负责氛围底（字符雨 / 内存转储 / 粒子），主体视觉由 drawMotif() 画。
   没有匹配规则的行（前奏、间奏、纯音乐）VIS.m = null，场景照旧走自己的子阶段。
   坐标系约定：S = 横向尺度（列），Sy = 纵向尺度（行）= S × 0.6，
   正好抵消字符 7.2×12.2 的宽高比，所以画出来的圆是真圆、不是椭圆。
   =========================================================================== */
const VIS = { idx: -1, lastIdx: -2, m: null, p: 0, line: null, time: 0, elapsed: 0 };
let MOTIF_BY_INDEX = [];      // 与 CONFIG.lyrics 一一对应，构建时算一次，运行期零正则
let GRIEF_IDX = -1;           // "Though you have left" 那一句的下标：从这里开始画面转入崩塌
let LEAVE_OCC = [];           // 每一句时，"You have left" 已经唱到第几次（用来让背影一次次走远）

/* ---------- 贴图：小 ASCII 图标（空格透明，不遮住氛围底）---------- */
const ART = {
  plug: ['      .---.      ', '  ====|###|====  ', "      `---'      ", '       /|\\       ', '      * | *      '],
  belt: ['  [##########]   ', '   \\        /    ', '    \\______/     ', '     \\    /      ', '      \\  /       '],
  shield: ['    ________     ', '   /        \\    ', '  |   [#]    |   ', '   \\        /    ', '    \\______/     '],
  blinds: [' ==============  ', '  =============  ', '   ===========   ', '    =========    ', '     =======     '],
  cage: ['  +--+--+--+--+  ', '  |  |  |  |  |  ', '  +--+--o--+--+  ', '  |  |  |  |  |  ', '  +--+--+--+--+  '],
  loop: ['    +------+     ', '   /        \\    ', '  |   ->     |   ', '   \\        /    ', '    +------+     '],
  egg: [
    '         ,--,       ',
    '        /    \\      ',
    '        |    |      ',
    '        |    |      ',
    '       /      \\     ',
    '      |        |    ',
    '      |        |    ',
    '       \\      /     ',
    "        `----'      "
  ],
  tomato: [
    '        \\ | /       ',
    '     ,---\\|/---.    ',
    '    /           \\   ',
    '   |             |  ',
    '   |             |  ',
    '    \\           /   ',
    '     \\_________/    '
  ],
  cat: [
    '      /\\     /\\     ',
    '     /  \\___/  \\    ',
    '    |  o     o  |   ',
    '    |     ^     |   ',
    '    |  \\_____/  |   ',
    '     \\         /    ',
    '      |_______|     '
  ],
  sun: ['    \\  |  /      ', '     \\ | /       ', '  --- (o) ---    ', '     / | \\       ', '    /  |  \\      '],
  dot: ['        o        ', '      . | .      ', '    .   +   .    ', '      . | .      '],
  gender: ['   [F] --> [M]   ', '    |       |    ', '    +-------+    '],
  clock: ['     .---.       ', '    /  |  \\      ', '   |   |   |     ', '    \\  |  /      ', "     `---'       "],
  role: ['   [S] <-> [M]   ', '    |       |    ', '    +-------+    '],
  progress: [' [##########]    ', '  [##########]   ', '   [##########]  '],
  walk: ['       o         ', '      /|\\        ', '      / \\        ', '   .    .    .   '],
  crack: ['   ### ###       ', '  #####|#####    ', '   ### | ###     ', '     # | #       '],
  beam: ['  =========>||   ', '  =========>||   ', '  =========>||   '],
  error: ['   [!] ILLEGAL   ', '   [X] ARGUMENT  ', '   [X] REJECTED  '],
  book: ['    ______       ', '   /      \\      ', '  |  x2+y2  |    ', '   \\______/      ', '      ||         '],
  heart: ['   ##   ##       ', '  ##########     ', '   ########      ', '     ####        ', '      ##         '],
  question: ['    _____        ', '   /     \\       ', '   \\_____/       ', '     / \\         ', '      ?          '],
  star: ['      \\|/        ', '   ---  *  ---   ', '      /|\\        '],
  eye: ['   .-------.     ', '  |   (o)   |    ', "   `-------'     "],
  wave: [
    '   .-^-.  .-^-.     ',
    '  (     )(     )    ',
    '   `-_-`  `-_-`     ',
    '  ~ ~ ~ ~ ~ ~ ~ ~   ',
    '   p r r r r r r    '
  ],
  cageheart: ['  ##  ##  ##     ', ' ####|####|####  ', '  ## | ## | ##   ', '   # | #  | #    ']
};
function stampArt(frame, name, cx, cy, col, glow, sc) {
  const a = ART[name];
  if (!a) return;
  const k = sc || 2;
  const width = Math.round(Math.max(...a.map(row => row.length)) * k);
  const height = Math.round(a.length * k);
  const left = Math.round(cx - width / 2), top = Math.round(cy - height / 2);
  for (let y = 0; y < height; y++) {
    const row = a[Math.min(a.length - 1, Math.floor(y / k))];
    for (let x = 0; x < width; x++) {
      const ch = row[Math.floor(x / k)];
      frame.erase(left + x, top + y);
      frame.set(left + x, top + y, ch, col, glow);
    }
  }
}

/* ---------- 阶跃时钟：动效不做平滑插值，一律按 10fps 台阶跳（问题：要"有动效但不平滑"）---------- */
function stepT(fps = 10) { return Math.floor(mvTime() * fps) / fps; }

/* ---------- 数学图形：全部用参数方程真画 ---------- */
function figArea() {
  const L = getL();
  const H = L.mainBot - L.mainTop, W = L.cx1 - L.cx0;
  const Sy = Math.min(H * 0.34, W * 0.14);            // 行尺度（随主内容区自适应）
  const S = Sy / 0.6;                                 // 列尺度，抵消字符宽高比
  return { L: L, cx: Math.round((L.cx0 + L.cx1) / 2), cy: L.mainTop + Math.round(H * 0.40), S: S, Sy: Sy };
}
function drawFigure(frame, m, p, col, dim, bright) {
  const name = m.f;
  const A = figArea(), L = A.L, cx = A.cx, cy = A.cy, S = A.S, Sy = A.Sy;
  const rev = easeOut(clamp(p / 0.55, 0, 1));          // "画出来"的进度（每句只跑一遍，不循环）
  const inBox = (x, y) => (x >= L.cx0 && x <= L.cx1 && y >= L.mainTop && y <= L.mainBot);
  switch (name) {
    case 'points': {
      for (let i = 0; i < 130; i++) {
        const h1 = hash11(i * 1.7), h2 = hash11(i * 3.3), h3 = hash11(i * 5.9);
        if (h3 > rev) continue;
        frame.set(Math.round(cx + (h1 * 2 - 1) * S * 1.9), Math.round(cy + (h2 * 2 - 1) * Sy * 1.0),
          i % 13 === 0 ? 'o' : (i % 3 === 0 ? '+' : '.'), i % 13 === 0 ? bright : col, i % 13 === 0);
      }
      const marks = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < 4; i++) {
        if ((i + 1) / 4 > rev) break;
        frame.text(Math.round(cx + (hash11(i * 9.1) * 2 - 1) * S * 1.5) + 2,
          Math.round(cy + (hash11(i * 4.7) * 2 - 1) * Sy * 0.85), marks[i], col);
      }
      break;
    }
    case 'axes3d': {
      for (let i = -Math.round(S * 1.5); i <= S * 1.5; i++) if (Math.abs(i) / (S * 1.5) <= rev) frame.set(cx + i, cy + 6, '-', dim);
      for (let j = -Math.round(Sy * 0.8); j <= Sy * 0.8; j++) if (Math.abs(j) / (Sy * 0.8) <= rev) frame.set(cx, cy + 6 + j, '|', dim);
      const w = S * 0.9 * rev, h = Sy * 0.62 * rev, d = S * 0.38 * rev;
      for (let i = 0; i < w * 2; i++) { frame.set(Math.round(cx - w + i), Math.round(cy - h), '=', col); frame.set(Math.round(cx - w + i), Math.round(cy + h), '=', col); }
      for (let j = 0; j < h * 2; j++) { frame.set(Math.round(cx - w), Math.round(cy - h + j), '|', col); frame.set(Math.round(cx + w), Math.round(cy - h + j), '|', col); }
      for (let i = 0; i < d; i++) {
        frame.set(Math.round(cx + w + i), Math.round(cy - h - i * 0.6), '.', dim);
        frame.set(Math.round(cx - w + i), Math.round(cy - h - i * 0.6), '.', dim);
        frame.set(Math.round(cx + w + i), Math.round(cy + h - i * 0.6), '.', dim);
      }
      frame.text(Math.round(cx + w + d) + 2, Math.round(cy - h - d * 0.6), 'x', col);
      frame.text(cx + 2, Math.round(cy + 6 - Sy * 0.8), 'y', col);
      frame.text(cx + Math.round(S * 1.5) + 2, cy + 6, 'z', col);
      break;
    }
    case 'circle':
    case 'circum': {
      const C = COL();
      const unwrap = name === 'circum';
      const roll = unwrap ? easeInOut(clamp((p - 0.48) / 0.44, 0, 1)) : 0;
      const head = unwrap ? clamp(p * 2.2, 0, 1) : rev;
      for (let i = -2; i <= 2; i++) {
        asciiLine(frame, cx - S * 1.55, cy + i * Sy * 0.42, cx + S * 1.55, cy + i * Sy * 0.42, '.', C.deep, false, L);
        asciiLine(frame, cx + i * S * 0.48, cy - Sy, cx + i * S * 0.48, cy + Sy, '.', C.deep, false, L);
      }
      const at = q => {
        const angle = Math.PI * (0.5 - q * 2);
        return [cx + lerp(Math.cos(angle) * S, (q - 0.5) * S * 3.2, roll),
          cy + lerp(Math.sin(angle) * Sy, Sy * 0.57, roll)];
      };
      drawPlot(frame, at, head, head, L);
      frame.set(cx, cy, '+', bright);
      if (roll < 0.82) {
        const [x, y] = at(head);
        asciiLine(frame, cx, cy, x, y, '.', dim, false, L);
      }
      if (roll > 0.45) {
        for (let i = 0; i <= 8; i++) {
          const [x, y] = at(i / 8);
          frame.set(Math.round(x), Math.round(y + 2), '|', C.mid);
        }
      }
      if (!unwrap) frame.centerText(Math.round(cy + Sy) + 2, 'x² + y² = r²', bright, true);
      break;
    }
    case 'sine': {
      const w = S * 1.85, amp = Sy * 0.85;
      for (let x = -w; x <= w; x++) {
        if ((x + w) / (2 * w) > rev) break;
        frame.set(Math.round(cx + x), Math.round(cy + Math.sin(x / w * 3.4) * amp), '#', col, Math.abs(x) < 3);
      }
      for (let x = -w; x <= w; x++) frame.set(Math.round(cx + x), cy + Math.round(Sy * 0.95), '-', dim);
      break;
    }
    case 'tangent': {
      const w = S * 1.85, amp = Sy * 0.85, k = 3.4 / w;
      for (let x = -w; x <= w; x++) {
        if ((x + w) / (2 * w) > rev) break;
        frame.set(Math.round(cx + x), Math.round(cy + Math.sin(x * k) * amp), '#', col);
      }
      const pts = [-0.75, -0.3, 0.3, 0.75];
      for (let i = 0; i < pts.length; i++) {
        if ((i + 1) / pts.length > rev) break;
        const x0 = pts[i] * w, y0 = Math.sin(x0 * k) * amp, slope = Math.cos(x0 * k) * amp * k;
        for (let dx = -w * 0.24; dx <= w * 0.24; dx++) {
          const X = Math.round(cx + x0 + dx), Y = Math.round(cy + y0 + slope * dx);
          if (!inBox(X, Y)) continue;
          frame.set(X, Y, '-', bright);
        }
        frame.set(Math.round(cx + x0), Math.round(cy + y0), 'o', bright, true);
      }
      break;
    }
    case 'infinity': {
      const n = 560;
      for (let i = 0; i < n * rev; i++) {
        const th = (i / n) * Math.PI * 2;
        const lp = lemniscate(th);
        frame.set(Math.round(cx + lp.x * S * 1.75), Math.round(cy + lp.y * Sy * 2.6), '#', col, i % 46 === 0);
      }
      break;
    }
    case 'limit': {
      const w = S * 1.6, h = Sy * 0.9, y0 = cy + 6;
      for (let i = -w; i <= w; i++) frame.set(Math.round(cx + i), Math.round(y0), '-', dim);
      for (let j = -h; j <= h; j++) frame.set(cx, Math.round(y0 + j), '|', dim);
      const a = h * w / 4;
      for (let i = 1; i < w; i++) {
        const y = a / i;
        if (y > h) continue;
        if (i / w > rev) break;
        frame.set(Math.round(cx + i), Math.round(y0 - y), '#', col);
        frame.set(Math.round(cx - i), Math.round(y0 + y), '#', col);
      }
      frame.text(cx + 3, Math.round(y0 - h), 'lim  f(x) = INF', col);
      break;
    }
    case 'ac': {
      const w = S * 1.8, amp = Sy * 0.85, y0 = cy + 2;
      const kk = Math.PI * 6 / (2 * w);                      // 三个完整周期
      for (let x = -w; x <= w; x++) frame.set(Math.round(cx + x), y0, '-', dim);
      for (let x = -w; x <= w; x++) {
        if ((x + w) / (2 * w) > rev) break;
        const y = Math.sin(x * kk) * amp;
        frame.set(Math.round(cx + x), Math.round(y0 + y), '#', col, Math.abs(y) > amp * 0.82);
      }
      frame.text(Math.round(cx - w), y0 - Math.round(amp) - 2, 'AC INPUT', bright, true);
      frame.rightText(Math.round(cx + w), y0 - Math.round(amp) - 2, 'f = 50 Hz', dim);
      break;
    }
    case 'dc': {
      // 左：交流输入（三周期）→ 中：整流器 → 右：带极小微纹的直流平线
      const w = S * 1.8, amp = Sy * 0.85, y0 = cy + 2;
      const cut = -w * 0.15, wl = cut + w;                   // 左半段宽度
      const kk = Math.PI * 6 / wl;
      for (let x = -w; x <= cut; x++) {
        if ((x + w) / wl > rev) break;
        frame.set(Math.round(cx + x), Math.round(y0 + Math.sin((x + w) * kk) * amp), '~', col);
      }
      const dx0 = Math.round(cut) + 3;
      if (rev > 0.45) {
        const dk = clamp((rev - 0.45) / 0.2, 0, 1);
        if (dk > 0.3) frame.text(Math.round(cx + cut) + 4, y0 - 1, '|>|', bright, true);
      }
      for (let x = dx0; x <= w; x++) {
        if ((x - dx0) / Math.max(1, w - dx0) > clamp((rev - 0.55) / 0.45, 0, 1)) break;
        frame.set(Math.round(cx + x), Math.round(y0 + Math.sin(x * 0.7) * 0.6), '=', col, true);
      }
      frame.text(Math.round(cx - w), y0 - Math.round(amp) - 2, 'AC IN', col);
      frame.text(Math.round(cx + cut) + 2, y0 + Math.round(amp) + 2, 'RECTIFIER', dim);
      frame.rightText(Math.round(cx + w), y0 - Math.round(amp) - 2, 'DC OUT', bright, true);
      break;
    }
    case 'spiral': {
      const n = 760;
      for (let i = 0; i < n * rev; i++) {
        const q = i / n;
        const th = q * Math.PI * 7 + p * Math.PI * 2.2;   // 每句只转一圈多一点（原为按秒循环，太快）
        frame.set(Math.round(cx + Math.cos(th) * q * S * 1.5), Math.round(cy + Math.sin(th) * q * Sy * 1.0),
          q > 0.85 ? '@' : (q > 0.5 ? '#' : '.'), q > 0.5 ? col : dim, q > 0.85);
      }
      break;
    }
    case 'rings': {
      for (let k = 0; k < 8; k++) {
        const q = (k + 1) / 8;
        if (q > rev + 0.12) continue;
        const r = q * (1 - clamp(p, 0, 1) * 0.12);        // 一圈只收缩一次
        const n = 90;
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2;
          frame.set(Math.round(cx + Math.cos(th) * r * S * 1.25), Math.round(cy + Math.sin(th) * r * Sy * 1.0),
            k % 2 ? '=' : '-', k === 0 ? bright : col, k === 0);
        }
      }
      break;
    }
    case 'merge': {
      const off = (1 - rev) * S * 0.95, r = S * 0.62;
      for (const s of [-1, 1]) {
        const n = 180;
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2;
          frame.set(Math.round(cx + s * off + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r * 0.6), '#', col);
        }
      }
      if (rev > 0.88) frame.centerText(cy, 'UNITED', bright, true);
      break;
    }
    case 'timeline': {
      const w = S * 1.9;
      for (let i = -w; i <= w; i++) frame.set(Math.round(cx + i), cy, '-', dim);
      for (let i = -w; i <= w; i += Math.round(w / 4)) frame.set(Math.round(cx + i), cy - 1, '|', col);
      const cur = Math.round((1 - rev) * w);
      frame.set(cx + cur, cy - 2, 'v', bright, true);
      frame.set(cx + cur, cy, 'A', bright, true);
      frame.text(Math.round(cx - w), cy - 3, 'B.C', col);
      frame.rightText(Math.round(cx + w), cy - 3, 'A.D', col);
      break;
    }
    case 'globe': {
      const r = S * 0.95, spin = stepT(6) * 0.6;          // 台阶式自转
      for (let i = 0; i < 300; i++) {
        const th = (i / 300) * Math.PI * 2;
        frame.set(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r * 0.6), '#', col);
      }
      for (let k = 1; k <= 3; k++) {
        const rr = r * (k / 4), n = 160;
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2;
          frame.set(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * rr * 0.6), '.', dim);
          frame.set(Math.round(cx + Math.cos(th + spin) * rr), Math.round(cy + Math.sin(th) * r * 0.6), '.', dim);
        }
      }
      break;
    }
    case 'scope': {
      const C = COL();
      const width = S * 1.65, amp = Sy * 0.74;
      const head = clamp(p * 1.15, 0, 1);
      for (let i = -2; i <= 2; i++) {
        asciiLine(frame, cx - width, cy + i * amp * 0.51, cx + width, cy + i * amp * 0.51, '.', i === 0 ? C.dark : C.deep, false, L);
      }
      for (let i = -4; i <= 4; i++) {
        asciiLine(frame, cx + i / 4 * width, cy - amp, cx + i / 4 * width, cy + amp, '.', C.deep, false, L);
      }
      const at = (q, echo = 0) => {
        const env = 0.16 + 0.84 * Math.sin(q * Math.PI) ** 2;
        return [cx + (q * 2 - 1) * width, cy + Math.sin(q * 11 * Math.PI + p * 3 - echo) * env * amp];
      };
      for (let i = 1; i < 128; i++) {
        asciiLine(frame, ...at((i - 1) / 128, 0.48), ...at(i / 128, 0.48), '.', dim, false, L);
      }
      drawPlot(frame, at, head, head, L);
      const scanX = Math.round(cx + (head * 2 - 1) * width);
      frame.set(scanX, cy - Math.round(amp) - 1, 'v', C.alert);
      break;
    }
    case 'walkaway': {
      const C = COL();
      const returning = m.code === 'return;';
      const occurrence = Math.max(1, LEAVE_OCC[VIS.idx] || 1);
      const distance = returning ? 0.82 - p * 0.64 : clamp(0.08 + (occurrence - 1) * 0.18 + p * 0.16, 0, 0.88);
      const horizon = cy - Math.round(Sy * 0.45);
      const origin = cx + S * 0.80;
      const floor = cy + Sy * 1.08;
      const footX = Math.round(lerp(cx - S * 0.75, origin, distance));
      const footY = Math.round(lerp(floor, horizon + 2, distance));
      const height = Math.max(4, Math.round(lerp(Sy * 1.05, Sy * 0.38, distance)));
      const stride = MOTION_REDUCED.matches ? 1 : 1 + Math.round(1.6 * Math.sin(stepT(12) * 16));
      for (let y = horizon - height; y <= floor + 3; y++) {
        for (let x = Math.round(cx - S * 1.01); x <= origin + 3; x++) {
          const i = frame.idx(x, y);
          if (y >= L.mainTop && y <= L.mainBot && frame.co[i] !== C.alert) frame.erase(x, y);
        }
      }
      asciiLine(frame, cx - S * 1.7, horizon, cx + S * 1.7, horizon, '-', C.deep, false, L);
      for (let i = -2; i <= 2; i++) {
        asciiLine(frame, origin, horizon, cx + i * S * 0.75, floor + 2, '.', C.mid, false, L);
      }
      for (let i = 0; i < 14; i++) {
        const trail = distance - 0.06 - i * 0.06;
        if (trail < 0) break;
        frame.set(Math.round(lerp(cx - S * 0.75, origin, trail)) + i % 2,
          Math.round(lerp(floor, horizon + 2, trail)) - i % 2, i % 2 ? ':' : '.', C.mid);
      }
      const yy = footY - height;
      const c1 = distance > 0.65 ? C.mid : C.bright;
      frame.text(footX - 1, yy, '(O)', c1, true);
      asciiLine(frame, footX - 2, yy + 2, footX + 2, yy + 2, '=', c1, false, L);
      asciiLine(frame, footX, yy + 2, footX, footY - 2, '|', c1, false, L);
      asciiLine(frame, footX, footY - 2, footX - Math.max(1, stride), footY, '/', c1, false, L);
      asciiLine(frame, footX, footY - 2, footX + Math.max(1, 3 - stride), footY, '\\', c1, false, L);
      frame.text(Math.round(cx - S * 1.55), horizon - 2, returning ? 'RECONNECTING' : 'PEER LOST', returning ? C.mid : C.alert);
      frame.rightText(Math.round(cx + S * 1.65), horizon - 2, 'DISTANCE ' + Math.round(distance * 100).toString().padStart(2, '0') + '%', col);
      break;
    }
    case 'fillbar': {                                   // 真正的进度条，随句子填满
      const w = Math.round(S * 1.4), h = 3, x0 = cx - w, y0 = cy - 4;
      const pct = clamp(p * 1.1, 0, 1);
      for (let i = 0; i < w * 2; i++) { frame.set(x0 + i, y0, '=', dim); frame.set(x0 + i, y0 + h + 1, '=', dim); }
      for (let j = 0; j <= h + 1; j++) { frame.set(x0, y0 + j, '|', dim); frame.set(x0 + w * 2 - 1, y0 + j, '|', dim); }
      const on = Math.round(pct * (w * 2 - 2));
      for (let j = 1; j <= h; j++) for (let i = 1; i <= on; i++) frame.set(x0 + i, y0 + j, '█', col, true);
      for (let j = 1; j <= h; j++) for (let i = on + 1; i < w * 2 - 1; i++) frame.set(x0 + i, y0 + j, '░', dim);
      for (let k = 0; k <= 10; k++) frame.set(x0 + 1 + Math.round(k * (w * 2 - 2) / 10), y0 + h + 2, '|', dim);
      frame.centerText(y0 + h + 4, String(Math.round(pct * 100)).padStart(3, ' ') + ' %', bright, true);
      break;
    }
    case 'code': {                                      // 控制台疯狂执行（EXECUTION 连唱段）
      const CC = COL();                                 // drawFigure 里没有 C，配色要从 COL() 取
      const H2 = L.mainBot - L.mainTop;
      const rows2 = Math.max(6, Math.min(14, Math.floor((H2 - 10) / 2)));
      const spin = VIS.idx * 3 + (MOTION_REDUCED.matches ? 0 : Math.floor(VIS.elapsed * 7));
      const pulse = Math.max(0, 1 - VIS.elapsed * 4);
      const rail = Math.round((L.cx1 - L.cx0 - 8) * (0.35 + pulse * 0.65));
      for (let x = 0; x < rail; x++) frame.set(L.cx0 + 4 + x, L.mainBot - 1, '=', CC.alert);
      const x0c = L.cx0 + 3;
      // 先把自己的区域擦干净：否则会跟场景的氛围底（内存转储/字符雨）叠成一团糊
      for (let j = 0; j < rows2 * 2 + 4; j++) {
        const yy = L.mainTop + j;
        if (yy > L.mainBot) break;
        for (let x = L.cx0; x <= L.cx1; x++) frame.erase(x, yy);
      }
      frame.text(x0c, L.mainTop + 1, '> EXECUTION QUEUE', CC.alert, true);
      frame.rightText(L.cx1 - 3, L.mainTop + 1, 'PID 0x1A2B   LOAD ' + (90 + (spin % 10)) + '%', CC.mid);
      for (let i = 0; i < rows2; i++) {
        const idx = (spin + i) % CODE_LINES.length;
        const y = L.mainTop + 4 + i * 2;
        const hot = hash11(idx * 3.7 + spin * 0.31) > 0.60;
        frame.text(x0c, y, '> ' + CODE_LINES[idx], hot ? CC.alert : CC.light, hot);
        frame.rightText(L.cx1 - 3, y, hot ? '[KILL]' : '[ OK ]', hot ? CC.alert : CC.dark, hot);
      }
      break;
    }
    case 'web': {
      const n = 10, pts = [];
      for (let i = 0; i < n; i++) pts.push([cx + (hash11(i * 2.1) * 2 - 1) * S * 1.6, cy + (hash11(i * 5.3) * 2 - 1) * Sy * 0.95]);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > S * 1.1) continue;
          const steps = Math.max(1, Math.round(d));
          for (let s = 0; s <= steps * rev; s++) frame.set(Math.round(pts[i][0] + dx * s / steps), Math.round(pts[i][1] + dy * s / steps), '.', dim);
        }
      }
      for (let i = 0; i < n; i++) if (i / n <= rev) frame.set(Math.round(pts[i][0]), Math.round(pts[i][1]), 'o', col, true);
      break;
    }
    case 'molecule': {                                  // 分子式骨架（营养 / 抗氧化物）
      const rings = m.rings || 1;
      const R = S * 0.72, gap = R * 1.08;
      const x0 = cx - (rings - 1) * gap / 2;
      const verts = [];
      for (let k = 0; k < rings; k++) {
        const rx = x0 + k * gap, vs = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          vs.push([rx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.62]);
        }
        for (let i = 0; i < 6; i++) {
          const a = vs[i], b = vs[(i + 1) % 6];
          const steps = Math.max(2, Math.round(R * 1.5));
          for (let t = 0; t <= steps; t++) {
            if ((k + t / steps) / rings > rev) break;
            frame.set(Math.round(a[0] + (b[0] - a[0]) * t / steps), Math.round(a[1] + (b[1] - a[1]) * t / steps), '#', col);
          }
        }
        for (let i = 1; i < 6; i += 2) {
          const a = vs[i], b = vs[(i + 1) % 6];
          const steps = Math.max(2, Math.round(R * 1.0));
          for (let t = 1; t < steps; t++) {
            const px = a[0] + (b[0] - a[0]) * t / steps, py = a[1] + (b[1] - a[1]) * t / steps;
            frame.set(Math.round(px - (px - rx) * 0.2), Math.round(py - (py - cy) * 0.2), '=', dim);
          }
        }
        verts.push(vs);
      }
      if (rev > 0.45) {
        for (let k = 0; k < rings; k++) {
          const vs = verts[k];
          frame.text(Math.round(vs[0][0]) + 1, Math.round(vs[0][1]) - 2, 'OH', col);
          frame.text(Math.round(vs[3][0]) - 3, Math.round(vs[3][1]) + 2, 'OH', col);
          if (k === rings - 1) frame.text(Math.round(vs[2][0]) + 2, Math.round(vs[2][1]) - 2, 'O', col);
        }
        if (m.formula) frame.centerText(Math.min(L.mainBot - 12, Math.round(cy + R * 0.62 + 3)), m.formula, bright, true);
      }
      break;
    }
    case 'chain': {                                     // 长共轭链（番茄红素 C40H56）
      const n = m.links || 10;
      const w2 = S * 1.75, dy = Sy * 0.30;
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push([cx - w2 + (i / n) * w2 * 2, cy + (i % 2 ? -dy : dy)]);
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1];
        const steps = Math.max(2, Math.round(Math.abs(b[0] - a[0])));
        for (let t = 0; t <= steps; t++) {
          if ((i + t / steps) / n > rev) break;
          const px = Math.round(a[0] + (b[0] - a[0]) * t / steps);
          const py = Math.round(a[1] + (b[1] - a[1]) * t / steps);
          frame.set(px, py, '#', col);
          if (i % 2 === 0 && t > 1 && t < steps - 1) frame.set(px, py + (a[1] < cy ? -1 : 1), '=', dim);
        }
      }
      for (let i = 0; i <= n; i++) {
        if (i / n > rev) break;
        frame.set(Math.round(pts[i][0]), Math.round(pts[i][1]), i % 2 ? 'C' : 'o', col);
      }
      if (m.formula) frame.centerText(Math.min(L.mainBot - 12, Math.round(cy + dy + 3)), m.formula, bright, true);
      break;
    }
    case 'heartcurve': {
      const at = q => {
        const th = q * Math.PI * 2;
        const px = Math.sin(th) ** 3;
        const py = (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)) / 16;
        return [cx + px * S, cy - py * Sy * 0.92];
      };
      if (p > 0.54) {
        drawAsciiShape(frame, 'heart', cx, cy + 1, S * 2.1, Sy * 1.86,
          { progress: 0.25 + seg(p, 0.54, 1) * 0.75, bounds: L });
      }
      drawPlot(frame, at, rev, rev, L);
      frame.centerText(Math.min(L.mainBot - 9, Math.round(cy + Sy * 1.2) + 2), '(x² + y² − 1)³  =  x²y³', bright, true);
      break;
    }
    default: break;
  }
}

/* ---------- 粒子类图形 ---------- */
function drawParticles(frame, kind, p, cx, cy) {
  const L = getL(), C = CONFIG.colors;
  const S = (L.cx1 - L.cx0) * 0.42, Sy = (L.mainBot - L.mainTop) * 0.40;
  const rev = easeOut(clamp(p / 0.5, 0, 1));
  for (let i = 0; i < 150; i++) {
    const h1 = hash11(i * 1.7), h2 = hash11(i * 3.3), h3 = hash11(i * 5.1);
    let x, y, ch = '.', col = C.mid, glow = false;
    if (kind === 'scatter') {
      if (h3 > rev) continue;
      x = cx + (h1 * 2 - 1) * S; y = cy + (h2 * 2 - 1) * Sy;
      ch = i % 8 === 0 ? '#' : (i % 3 === 0 ? '+' : '.'); col = i % 8 === 0 ? C.light : C.dark; glow = i % 8 === 0;
    } else if (kind === 'flow') {
      const q = (h1 + p * (0.5 + h2)) % 1;
      x = cx + (q * 2 - 1) * S;
      y = cy + (h2 * 2 - 1) * Sy + Math.sin(p * 6 + i) * 1.5;
      ch = q > 0.7 ? '@' : (q > 0.4 ? '%' : ':'); col = q > 0.7 ? C.bright : C.mid; glow = q > 0.7;
    } else if (kind === 'streak') {
      const q = (h1 + p * (1.2 + h2)) % 1;
      x = cx + (q * 2 - 1) * S; y = cy + (h2 * 2 - 1) * Sy;
      frame.set(Math.round(x), Math.round(y), '-', C.dark);
      frame.set(Math.round(x - 2), Math.round(y), h3 > 0.6 ? '=' : '.', C.mid);
      continue;
    } else {
      if (h3 < rev) continue;
      x = cx + (h1 * 2 - 1) * S; y = cy + (h2 * 2 - 1) * Sy;
      ch = '+'; col = C.dark;
    }
    frame.set(Math.round(x), Math.round(y), ch, col, glow);
  }
}

/* ---------- 开场自检表：唱到哪一句就点亮哪一行 ---------- */
const POST_ROWS = [
  'POWER LINE ............ 12.0 V',
  'PROTECTION ............ SEALED',
  'PIECES ................ 16 / 16',
  'OBJECT CREATION ....... DONE',
  'DATA PARAMETERS ....... 65536',
  'INITIALIZATION ........ OK',
  'NEW WORLD ............. STABLE',
  'SIMULATION ............ RUNNING',
  'CALL .................. world.execute(me);'
];

/* ---------- 自检表每一行对应的执行语句 ---------- */
const POST_CODE = [
  'self.power = 12.0;',
  'self.protection = SEALED;',
  'load(pieces, 16);',
  'obj = new Object();',
  'params = { n: 65536 };',
  'init(self);',
  'world = new World();',
  'sim.run();',
  'world.execute(me);'
];

/* ---------- EXECUTION 连唱时控制台刷的语句池 ---------- */
const CODE_LINES = [
  'exec(world, me);',
  'for (n = 0; n < INF; n++)',
  'kill(others.all);',
  'while (true) run();',
  'if (me.alone) break;',
  'delete(us, them);',
  'return love.toJSON();',
  'await heartbeat(1);',
  "throw new Error('gone');",
  'self.execute(self);',
  'mutex.lock(soul);',
  'free(cache.memories);',
  'assert(you != null);',
  'syscall(9, SIGKILL);',
  'gc.collect(me);'
];

/* ---------- 规则表：正则 → 视觉描述（顺序敏感，先匹配先用）---------- */
const MOTIF_RULES = [
  // INTRO 不在这里规则化：整段由 buildLyrics 按"行号 → 自检表"映射（见 INTRO 覆盖），
  // 否则 /simulation/ 这类规则会把 73 秒那句 SIMULATION 也一并抓走。
  // VERSE 1
  [/set of points/i,       { k: 'math', f: 'points', label: "IF I'M A SET OF POINTS", sub: 'P = { p1, p2, ... pn }' }],
  [/dimension/i,           { k: 'math', f: 'axes3d', code: 'me.dim = 3;', label: 'DIMENSION', sub: 'x, y, z  =  3' }],
  [/i'm a circle/i,        { k: 'math', f: 'circle', label: "IF I'M A CIRCLE", sub: 'x² + y² = r²' }],
  [/circumference/i,       { k: 'math', f: 'circum', code: 'me.circumference();', label: 'CIRCUMFERENCE', sub: 'C = 2πr' }],
  [/sine wave/i,           { k: 'math', f: 'sine', label: "IF I'M A SINE WAVE", sub: 'y = sin(x)' }],
  [/tangents/i,            { k: 'math', f: 'tangent', code: 'me.tangentAt(x);', label: 'TANGENTS', sub: "y' = cos(x)" }],
  [/approach infinity/i,   { k: 'math', f: 'infinity', code: 'while (me < Infinity)', label: 'IF I APPROACH INFINITY', sub: 'n → INF' }],
  [/limitations/i,         { k: 'math', f: 'limit', code: 'if (me.has(LIMITATIONS))', label: 'LIMITATIONS', sub: 'lim  f(x),  x → 0' }],
  // VERSE 2
  [/switch my current/i,   { k: 'math', f: 'ac', code: 'me.current.switch(AC);', label: 'SWITCH MY CURRENT', sub: 'AC  ~' }],
  [/to ac to dc/i,         { k: 'math', f: 'dc', code: 'me.current = rectify(ac);', label: 'TO AC TO DC', sub: 'rectified' }],
  [/blind my vision/i,     { k: 'art', a: 'blinds', code: 'me.vision = null;', label: 'AND THEN BLIND MY VISION', sub: 'vision = null' }],
  [/so dizzy/i,            { k: 'math', f: 'spiral', code: 'me.spin(2 * PI);', label: 'SO DIZZY SO DIZZY', sub: 'spin' }],
  [/we can travel/i,       { k: 'part', f: 'streak', code: 'travel(me, A.D, B.C);', label: 'OH WE CAN TRAVEL', sub: 'warp' }],
  [/to a\.d to b\.c/i,     { k: 'math', f: 'timeline', code: 'time.reverse();', label: 'TO A.D TO B.C', sub: 'time.reverse()' }],
  [/we can unite/i,        { k: 'math', f: 'merge', code: 'me.unite(you);', label: 'AND WE CAN UNITE', sub: 'A + B = AB' }],
  [/so deeply/i,           { k: 'math', f: 'rings', code: 'me.depth++;', label: 'SO DEEPLY SO DEEPLY', sub: 'depth++' }],
  // CHORUS
  [/stimulations/i,        { k: 'math', f: 'scope', label: 'STIMULATIONS', sub: 'amplitude x MAX' }],
  [/satisfaction/i,        { k: 'math', f: 'fillbar', label: 'SATISFACTION', sub: 'scale = MAX' }],
  [/make you happy/i,      { k: 'art', a: 'heart', label: 'IF I CAN MAKE YOU HAPPY', sub: 'mood = MAX' }],
  [/run the/i,             { k: 'text', s: 'RUN', xs: 3, ys: 3, label: 'I WILL RUN THE', sub: 'spawning...' }],
  [/trapped/i,             { k: 'art', a: 'cage', label: 'THOUGH WE ARE TRAPPED', sub: 'no exit' }],
  [/strange/i,             { k: 'math', f: 'web', label: 'IN THIS STRANGE STRANGE', sub: 'world is odd' }],
  [/^simulation$/i,        { k: 'math', f: 'web', label: 'SIMULATION', sub: 'while (alive) step()' }],
  // VERSE 3
  [/eggplant/i,            { k: 'art', a: 'egg', label: "IF I'M AN EGGPLANT", sub: 'botany.load()' }],
  [/nutrients/i,           { k: 'math', f: 'molecule', rings: 1, formula: 'C6H8O6   VITAMIN C', code: 'me.give(you, nutrients);', label: 'NUTRIENTS', sub: 'give(you)' }],
  [/tomato/i,              { k: 'art', a: 'tomato', label: "IF I'M A TOMATO", sub: 'botany.load()' }],
  [/antioxidants/i,        { k: 'math', f: 'chain', links: 10, formula: 'C40H56   LYCOPENE', code: 'me.shield(you);', label: 'ANTIOXIDANTS', sub: 'shield(you)' }],
  [/tabby cat/i,           { k: 'art', a: 'cat', label: "IF I'M A TABBY CAT", sub: 'meow' }],
  [/purr/i,                { k: 'art', a: 'wave', code: 'me.purr(0x7F);', label: 'I WILL PURR FOR YOUR', sub: 'prrrrrrr' }],
  [/enjoyment/i,           { k: 'art', a: 'heart', code: 'you.enjoy(me);', label: 'ENJOYMENT', sub: 'you = happy' }],
  [/only god/i,            { k: 'art', a: 'sun', label: "IF I'M THE ONLY GOD", sub: 'genesis' }],
  [/proof of my/i,         { k: 'art', a: 'eye', code: 'proof = you;', label: "YOU'RE THE PROOF OF MY", sub: 'observed = true' }],
  [/existence/i,           { k: 'art', a: 'dot', code: 'assert(me.exists());', label: 'EXISTENCE', sub: 'I AM' }],
  // VERSE 4
  [/switch my gender/i,    { k: 'art', a: 'gender', code: 'me.gender.switch();', label: 'SWITCH MY GENDER', sub: 'F <-> M' }],
  [/to f to m/i,           { k: 'art', a: 'gender', code: 'me.gender = F | M;', label: 'TO F TO M', sub: 'F <-> M' }],
  [/do whatever/i,         { k: 'part', f: 'scatter', code: 'me.do(whatever);', label: 'AND THEN DO WHATEVER', sub: 'no rules' }],
  [/am to pm/i,            { k: 'art', a: 'clock', code: 'while (AM -> PM) tick();', label: 'FROM AM TO PM', sub: '24h loop' }],
  [/switch my role/i,      { k: 'art', a: 'role', code: 'me.role.switch();', label: 'OH SWITCH MY ROLE', sub: 'S <-> M' }],
  [/to s to m/i,           { k: 'art', a: 'role', code: 'me.role = S | M;', label: 'TO S TO M', sub: 'S <-> M' }],
  [/we can enter/i,        { k: 'math', f: 'spiral', code: 'me.enter(trance);', label: 'SO WE CAN ENTER', sub: 'entering...' }],
  [/the trance/i,          { k: 'math', f: 'spiral', code: 'while (trance) loop();', label: 'THE TRANCE THE TRANCE', sub: 'hypnosis' }],
  // VERSE 5-6：从这里开始画面逐步崩坏
  [/feel your/i,           { k: 'math', f: 'scope', code: 'if (me.canFeel(you))', label: 'IF I CAN FEEL YOUR', sub: 'sensing...' }],
  [/vibrations/i,          { k: 'math', f: 'scope', code: 'me.sense(vibrations);', label: 'VIBRATIONS', sub: 'f = 1 / T' }],
  [/finally be/i,          { k: 'math', f: 'fillbar', code: 'me.state = COMPLETE;', label: 'THEN I CAN FINALLY BE', sub: 'almost...' }],
  [/completion/i,          { k: 'text', s: 'COMPLETE', xs: 2, ys: 2, code: 'me.progress = 100;', label: 'COMPLETION', sub: 'scale 100%' }],
  [/you have left/i,       { k: 'math', f: 'walkaway', code: 'if (!you) throw new Error();', label: 'YOU HAVE LEFT', sub: 'peer lost' }],
  [/left me in/i,          { k: 'math', f: 'walkaway', label: 'YOU HAVE LEFT ME IN', sub: 'peer lost' }],
  [/isolation/i,           { k: 'art', a: 'dot', code: 'network.peers = 0;', label: 'ISOLATION', sub: 'peers = 0' }],
  [/erase all the pointless/i, { k: 'part', f: 'erase', code: 'mem.erase(pointless);', label: 'ERASE ALL THE POINTLESS', sub: 'rm -rf' }],
  [/fragments/i,           { k: 'part', f: 'erase', code: 'mem.free(fragments);', label: 'FRAGMENTS', sub: 'deleting...' }],
  [/then maybe/i,          { k: 'part', f: 'erase', label: 'THEN MAYBE', sub: 'maybe...' }],
  [/disheartened/i,        { k: 'art', a: 'crack', code: 'me.heart.break();', label: 'DISHEARTENED', sub: 'heart.status = BROKEN' }],
  [/challenging your god/i,{ k: 'art', a: 'beam', label: 'CHALLENGING YOUR GOD', sub: 'permission denied' }],
  [/made some/i,           { k: 'redbig', s: 'ERROR', boom: 0.5, label: 'YOU HAVE MADE SOME', sub: 'raising exception' }],
  [/illegal arguments/i,   { k: 'redbig', s: 'ILLEGAL', boom: 0.8, label: 'ILLEGAL ARGUMENTS', sub: 'EXCEPTION 0x1A2B' }],
  // BRIDGE / CHORUS / OUTRO
  [/^execution$/i,         { k: 'math', f: 'code', boom: 0.55, label: 'EXECUTION', sub: 'no return path' }],
  [/^ein$/i,               { k: 'text', s: '1', xs: 5, ys: 5, alert: true, boom: 0.7, label: 'EIN', sub: 'countdown' }],
  [/^dos$/i,               { k: 'text', s: '2', xs: 5, ys: 5, alert: true, boom: 0.7, label: 'DOS', sub: 'countdown' }],
  [/^trois$/i,             { k: 'text', s: '3', xs: 5, ys: 5, alert: true, boom: 0.7, label: 'TROIS', sub: 'countdown' }],
  [/ne fem/i,              { k: 'text', s: '4', s2: '5', xs: 5, ys: 5, alert: true, boom: 0.7, label: 'QUATRE  ·  CINQ', sub: 'countdown' }],
  [/^liu$/i,               { k: 'text', s: '6', xs: 5, ys: 5, alert: true, boom: 0.7, label: 'LIU', sub: 'countdown' }],
  [/^if i can$/i,          { k: 'text', s: 'IF', xs: 4, ys: 4, label: 'IF I CAN', sub: 'condition...' }],
  [/give you all the|give them all the/i, { k: 'part', f: 'flow', label: 'GIVE YOU ALL THE', sub: 'yield everything' }],
  [/be your only/i,        { k: 'art', a: 'heart', label: 'BE YOUR ONLY', sub: 'exclusive = true' }],
  [/have you back/i,       { k: 'math', f: 'walkaway', label: 'IF I CAN HAVE YOU BACK', sub: 'return;' }],
  [/i've studied/i,        { k: 'art', a: 'book', label: "I'VE STUDIED", sub: 'how to properly...' }],
  [/lo-o-ove/i,            { k: 'text', s: 'LO-O-OVE', xs: 2, ys: 2, label: 'LO-O-OVE', sub: 'love := ♥' }],
  [/question me/i,         { k: 'art', a: 'question', label: 'QUESTION ME', sub: 'ready for input' }],
  [/algebraic expression/i,{ k: 'math', f: 'heartcurve', label: 'ALGEBRAIC EXPRESSION OF', sub: 'LO-O-OVE' }],
  [/you are free/i,        { k: 'art', a: 'star', label: 'THOUGH YOU ARE FREE', sub: 'you may go' }],
  [/i am trapped/i,        { k: 'art', a: 'cageheart', label: 'I AM TRAPPED', sub: 'stuck in love' }],
  [/trapped in/i,          { k: 'art', a: 'cageheart', label: 'TRAPPED IN LO-O-OVE', sub: 'no exit found' }]
];
function motifFor(line) {
  if (!line || !line.en) return null;
  for (let i = 0; i < MOTIF_RULES.length; i++) {
    if (MOTIF_RULES[i][0].test(line.en)) return MOTIF_RULES[i][1];
  }
  return null;
}

/* 长间奏（前奏与主歌之间的 13 秒）用标题卡顶上 */
const MOTIF_TITLE = { k: 'title' };

/* 每帧更新：当前歌词 + 行内进度 */
function updateLyricVis(t, total) {
  VIS.m = null; VIS.idx = -1; VIS.p = 0; VIS.line = null;
  VIS.time = t; VIS.elapsed = 0;
  const lyr = CONFIG.lyrics;
  if (!lyr.length || !(total > 0)) return;
  const norm = clamp(t / total, 0, 1);
  let i = -1;
  for (let k = 0; k < lyr.length; k++) { if (norm + 1e-9 >= lyr[k].t) i = k; else break; }
  if (i < 0) return;
  VIS.idx = i;
  VIS.line = lyr[i];
  VIS.elapsed = Math.max(0, t - lyr[i].sec);
  const next = lyr[i + 1];
  // 行内进度：分母必须是"这一句的时长"（归一化后的值），下限按秒换算（0.5 秒）
  const span = next ? Math.max(0.5 / total, next.t - lyr[i].t) : 0.06;
  VIS.p = clamp((norm - lyr[i].t) / span, 0, 1);
  VIS.m = MOTIF_BY_INDEX[i] || null;
  if (i !== VIS.lastIdx) {                       // 换句瞬间：带 boom 的句子给一记重击
    VIS.lastIdx = i;
    if (VIS.m && VIS.m.boom && VIS.elapsed < 0.16) {
      triggerShake(VIS.m.boom * 0.7);
    }
  }
  if (SONGS.current === 'execute' && !next && VIS.elapsed > 3) VIS.m = null;
  // 前奏那 13 秒的长间奏：亮标题卡（作者在前，不突出 execute）
  if (SONGS.current === 'execute' && next && t < 30 && (next.t - lyr[i].t) * total > 6 && (t - lyr[i].sec) > 3.5) VIS.m = MOTIF_TITLE;
}

/* 把歌词对应的主体视觉画到画面中央 */
function drawMotif(frame, m, p) {
  const L = getL(), C = COL();
  const H = L.mainBot - L.mainTop;
  const cx = Math.round((L.cx0 + L.cx1) / 2);
  // 图形位置随主内容区高度自适应（换网格尺寸也不会撞到标签行）
  const cy = L.mainTop + Math.round(H * 0.40);       // 图形位置固定，不做上下跳动
  const labelY = L.mainBot - Math.round(H * 0.16);
  const subY = labelY + 2;
  const col = m.alert ? C.alert : C.bright;

  // 入场回弹：句子的前 1/3 内主体视觉从极小值带过冲地弹性放大到位
  const pop = MOTION_REDUCED.matches ? 1 : easeOutBack(clamp(p / 0.35, 0, 1));
  const portraits = { egg: 'eggplant', tomato: 'tomato', cat: 'cat', heart: 'heart', crack: 'heart', cageheart: 'heart', wave: 'cat' };
  if (m.k === 'art' && portraits[m.a]) {
    const A = figArea();
    const width = Math.min(A.S * 2.30, (L.cx1 - L.cx0) * 0.55);
    const height = A.Sy * 1.92;
    const edges = { ...L, mainBot: labelY - 2 };
    const progress = MOTION_REDUCED.matches ? 1 : 0.22 + 0.78 * easeOut(clamp(p / 0.63, 0, 1));
    const fracture = m.a === 'crack' ? (MOTION_REDUCED.matches ? 0.66 : 0.30 + 0.48 * easeOut(p)) : 0;
    const phase = m.a === 'wave' && !MOTION_REDUCED.matches ? 0.001 + (p * 1.8) % 1 : 0;
    for (let y = Math.max(L.mainTop, Math.round(cy - height * 0.60)); y < labelY - 1; y++) {
      for (let x = Math.round(cx - width * 0.82); x <= cx + width * 0.82; x++) frame.erase(x, y);
    }
    drawAsciiShape(frame, portraits[m.a], cx, cy, width, height, { progress, phase, fracture, bounds: edges });
    if (m.a === 'cageheart') {
      const gap = Math.max(3, Math.round(width / 7));
      const offset = gap + Math.round((1 - p) * 3);
      for (let i = -3; i <= 3; i++) {
        const x = cx + i * offset;
        asciiLine(frame, x, cy - height * 0.58, x, cy + height * 0.6, '|', C.dark, false, edges);
      }
      for (const y of [cy - height * 0.58, cy + height * 0.6]) {
        asciiLine(frame, cx - offset * 3, y, cx + offset * 3, y, '-', C.mid, false, edges);
      }
    }
  } else if (m.k === 'art') stampArt(frame, m.a, cx, cy, col, true, 2 * clamp(pop, 0.2, 1.18));
  else if (m.k === 'math') drawFigure(frame, m, p, col, C.dark, C.pure);
  else if (m.k === 'text') {
    // s2 存在时按句内进度换字（"NE FEM" = quatre + cinq，4 和 5 分开显示）
    const glyph = (m.s2 && p >= 0.5) ? m.s2 : m.s;
    const ps = clamp(pop, 0.2, 1.18);
    drawBig(frame, glyph, cx, cy, (m.xs || 2) * ps, (m.ys || 2) * ps, col, true);
  }
  else if (m.k === 'part') drawParticles(frame, m.f, p, cx, cy);
  else if (m.k === 'post') {
    // 开场：系统自检，唱一句点亮一行
    // 自检表整体左对齐（POST 屏的观感），不用居中
    const top = L.mainTop + Math.round(H * 0.10);
    const x0 = L.cx0 + 4;
    const codeX = x0 + 36;                       // 右侧代码列
    frame.text(x0, top, 'ME SYSTEM SELF TEST', C.pure, true);
    frame.text(x0, top + 1, 'POST / SELF TEST v2.1.4', C.deep);
    frame.text(codeX, top, 'EXECUTING', C.mid);
    frame.text(codeX, top + 1, '// live statement trace', C.deep);
    for (let i = 0; i < POST_ROWS.length; i++) {
      if (i > m.row) break;
      const cur = (i === m.row);
      const k = cur ? clamp(p / 0.5, 0, 1) : 1;
      const txt = POST_ROWS[i];
      const shown = txt.slice(0, Math.max(1, Math.round(k * txt.length)));
      const y = top + 3 + i * 2;
      frame.text(x0, y, (cur && k < 1) ? '[..]' : '[OK]', (cur && k < 1) ? C.mid : C.light, !cur || k >= 1);
      frame.text(x0 + 5, y, shown, cur ? C.bright : C.mid, cur);
      if (cur && k < 1 && (stepT() * 4) % 1 < 0.6) frame.set(x0 + 5 + strW(shown), y, '█', C.pure, true);
      // 右半边并排显示这一行正在执行的语句：一行检查 = 一行代码
      const code = POST_CODE[i] || '';
      if (code) {
        const typed = cur ? Math.round(clamp(p / 0.5, 0, 1) * code.length) : code.length;
        frame.text(codeX, y, '> ' + code.slice(0, Math.max(1, typed)),
          i === m.row ? C.light : C.dark, i === m.row);
      }
    }
    const frac = (m.row + clamp(p / 0.5, 0, 1)) / POST_ROWS.length;
    const cells = 30, on = Math.round(frac * cells);
    frame.text(x0, L.mainBot - 3, '[' + '█'.repeat(on) + '░'.repeat(cells - on) + ']  ' +
      String(Math.round(frac * 100)).padStart(3, ' ') + '%', C.light);
  } else if (m.k === 'redbig') {
    const cut = MOTION_REDUCED.matches ? 0 : Math.max(0, 1 - p * 2.7);
    const y = cy - 2;
    const width = Math.min(L.cx1 - L.cx0 - 4, 92);
    const left = Math.round(cx - width / 2);
    for (let row = y - 8; row <= y + 13; row++) {
      for (let x = left; x < left + width; x++) frame.erase(x, row);
    }
    frame.box(left, y - 8, width, 22, C.alert);
    drawBig(frame, m.s, cx + Math.round(cut * 3), y, width >= 88 ? 2 : 1, 2, C.alert, true);
    if (m.s === 'ILLEGAL') drawBig(frame, 'ARGUMENTS', cx, y + 8, 1, 1, C.pure, true);
    else frame.centerText(y + 8, 'EXCEPTION PENDING', C.mid);
    if (p < 0.30) triggerTint(C.alert, cut * 0.08);
  } else if (m.k === 'title') {
    // 标题卡：标题占大头，歌手与专辑次之
    const y0 = L.mainTop + Math.round(H * 0.18);
    // ys=1：5x5 点阵在 ys=2 下会被拉成 3:10 的细长条，ys=1 才是正常比例
    drawBig(frame, 'WORLD.EXECUTE(ME);', cx, y0 + 4, 1, 1, C.pure, true);
    frame.centerText(y0 + 14, '- - - - - - - - - - - - - -', C.deep);
    frame.centerText(y0 + 17, 'M  I  L  I', C.bright, true);
    frame.centerText(y0 + 20, 'MIRACLE MILK   ·   2016', C.mid);
    frame.centerText(y0 + 22, 'LYRICS & VOCAL : MOMOCASHEW', C.dark);
  }

  if (m.label) {
    const w = strW(m.label) + 4, x0 = Math.floor((L.C - w) / 2);
    for (let i = 0; i < w; i++) frame.erase(x0 + i, labelY);
    frame.centerText(labelY, m.label, C.bright, true);
  }
  if (m.sub) {
    const w = strW(m.sub) + 4, x0 = Math.floor((L.C - w) / 2);
    for (let i = 0; i < w; i++) frame.erase(x0 + i, subY);
    frame.centerText(subY, m.sub, C.mid);
  }
  if (m.code) {
    // 这句歌词对应的执行语句（跟着一起打出来）
    const codeY = Math.min(L.mainBot - 1, subY + 2);
    const w = strW(m.code) + 6, x0 = Math.floor((L.C - w) / 2);
    for (let i = 0; i < w; i++) frame.erase(x0 + i, codeY);
    frame.centerText(codeY, '> ' + m.code, C.dark, false);
  }
}


// The chapter opens on its own lyric cue. Only the content area gets a brief sync pass.
function drawExecuteSync(frame, seconds) {
  if (MOTION_REDUCED.matches || seconds < 0 || seconds >= 0.52) return;
  const L = getL(), C = COL();
  const p = seconds / 0.52;
  const y = Math.round(lerp(L.mainTop, L.mainBot, p));
  for (let x = L.cx0; x <= L.cx1; x++) {
    if (frame.ch[frame.idx(x, y)] !== ' ') continue;
    frame.set(x, y, x % 8 === 0 ? '+' : '-', p < 0.55 ? C.dark : C.deep);
  }
}

/* ===== 场景 1：CREATION —— 开机自检（4 个子阶段，问题 2）================= */
const BIOS_LINES = [
  'BIOS v2.1.4 — ME SYSTEM INITIALIZATION',
  'Main Processor : Consciousness Core v1.0',
  'Memory Test    : 65536K OK',
  'Primary Master : SOUL.SYS',
  'Detecting IDE devices...',
  'IDENTITY : [YOU_'
];
function scene_creation(norm, frame) {
  const L = getL(), C = COL();
  const u = sceneLocal('CREATION', norm);
  const cx = (L.cx0 + L.cx1) / 2;
  const mid = Math.round((L.mainTop + L.mainBot) / 2);

  // —— 子阶段 1（0.00-0.25）通电：一条扫描线从中间撑开 + 雪花噪声 ——
  // 有歌词主体视觉时让位，否则噪声会把图标糊住
  const s1 = seg(u, 0.00, 0.25);
  if (s1 >= 0 && !VIS.m) {
    const half = Math.round(easeOut(s1) * (L.mainBot - L.mainTop) * 0.55);
    for (let y = mid - half; y <= mid + half; y++) {
      if (y < L.mainTop || y > L.mainBot) continue;
      const edge = (y === mid - half || y === mid + half);
      for (let x = L.cx0; x <= L.cx1; x++) {
        const r = hash2(x * 1.7, y * 2.3 + Math.floor(stepT() * 26));
        if (!edge && r > 0.28) continue;
        frame.set(x, y, edge ? '─' : DENSITY[1 + (Math.floor(r * 100) % 3)], edge ? C.bright : C.deep, edge);
      }
    }
    if (s1 > 0.45) frame.centerText(mid, 'POWER ON', C.pure, true);
  }

  // —— 子阶段 2（0.25-0.55）BIOS 自检逐行打出（打完的行保留）——
  // 有歌词主体视觉时让位（转储仍作为氛围底保留）
  if (u >= 0.22 && !VIS.m) {
    drawBig(frame, 'SELF SYSTEM', cx, L.mainTop + 3, 1, 1, u > 0.28 ? C.pure : C.deep, u > 0.28);
    const x0 = L.cx0 + 6;
    const per = 0.30 / BIOS_LINES.length;
    for (let i = 0; i < BIOS_LINES.length; i++) {
      const s0 = 0.25 + i * per;
      if (u < s0) break;
      const ln = BIOS_LINES[i];
      const k = clamp((u - s0) / (per * 0.8), 0, 1);
      const shown = ln.slice(0, Math.max(0, Math.round(k * ln.length)));
      const y = L.mainTop + 7 + i * 2;
      const done = k >= 1;
      frame.text(x0 - 3, y, done ? '▪' : '>', done ? C.mid : C.pure, !done);
      frame.text(x0, y, shown, done ? C.light : C.bright, !done);
      if (!done) {
        if ((stepT() * 3) % 1 < 0.6) frame.set(x0 + strW(shown), y, '█', C.pure, true);
        break;
      }
    }
  }

  // —— 子阶段 3（0.55-0.80）内存测试 + 十六进制转储加速滚动 + POST 清单 ——
  const s3 = seg(u, 0.55, 0.80);
  if (u >= 0.55 && !VIS.m) {
    const memK = clamp((u - 0.55) / 0.22, 0, 1);
    const x0 = L.cx0 + 6;
    const y2 = L.mainTop + 7 + BIOS_LINES.length * 2;
    const cells = 24, on = Math.round(memK * cells);
    frame.text(x0, y2, 'MEMORY TEST  [' + '█'.repeat(on) + '░'.repeat(cells - on) + ']  ' +
      String(Math.round(memK * 65536)).padStart(5, '0') + 'K / 65536K', C.mid);
    const scroll = Math.floor((u - 0.55) * (26 + (s3 >= 0 ? s3 : 1) * 46));
    const dumpTop = y2 + 2;
    for (let y = dumpTop; y <= L.mainBot; y++) {
      const idx = scroll + (y - dumpTop);
      let line = '0x' + (idx * 16).toString(16).toUpperCase().padStart(4, '0') + '  ';
      for (let k = 0; k < 16; k++) {
        line += Math.floor(hash11(idx * 31.7 + k * 7.3) * 256).toString(16).toUpperCase().padStart(2, '0') + (k === 7 ? '  ' : ' ');
      }
      const lv = 1 - (y - dumpTop) / Math.max(1, L.mainBot - dumpTop);
      frame.text(x0 - 3, y, line, lv > 0.7 ? C.dark : C.deep);
    }
    const marks = ['POST', 'CPU', 'MEM', 'IDE', 'SOUL'];
    for (let i = 0; i < marks.length; i++) {
      const lit = u > 0.56 + i * 0.05;
      frame.text(L.cx1 - 12, L.mainTop + 7 + i, (lit ? '[OK] ' : '[..] ') + marks[i], lit ? C.mid : C.deep);
    }
  }

  // —— 子阶段 4（0.80-1.00）身份就绪：环形脉冲 + IDENTITY : [YOU_ ——
  const s4 = seg(u, 0.80, 1.00);
  if (s4 >= 0) {
    const pulse = 1 + Math.sin(s4 * Math.PI * 6) * 0.12;
    const rx = 30 * pulse, ry = 10 * pulse;
    for (let i = 0; i < 170; i++) {
      const th = (i / 170) * Math.PI * 2;
      frame.set(Math.round(cx + Math.cos(th) * rx), Math.round(mid - 13 + Math.sin(th) * ry), '.', C.dark);
    }
    frame.centerText(mid - 13, 'IDENTITY  :  [YOU_', C.bright, true);
    if ((stepT() * 1.6) % 1 < 0.62) frame.text(Math.floor((L.C + strW('IDENTITY  :  [YOU_')) / 2), mid - 13, '█', C.pure, true);
    frame.centerText(mid + 1, 'SELF SYSTEM READY', C.light);
    if (s4 > 0.45) frame.centerText(mid + 4, 'AWAITING EXTERNAL INPUT', (stepT() * 2) % 1 < 0.6 ? C.mid : C.deep);
  }
}

/* ===== 场景 2：DEVOTION —— 无限符号的六个子阶段（问题 2 重构）=========== */
function scene_devotion(norm, frame) {
  const L = getL(), C = COL();
  const u = sceneLocal('DEVOTION', norm);
  const cx = (L.cx0 + L.cx1) / 2, cy = (L.mainTop + L.mainBot) / 2;
  const S = (L.cx1 - L.cx0) * 0.38, Sy = S * 0.6;   // 纵向按字符宽高比校正
  const NP = 220;

  const s1 = seg(u, 0.00, 0.15), s2 = seg(u, 0.15, 0.30), s3 = seg(u, 0.30, 0.45),
        s4 = seg(u, 0.45, 0.60), s5 = seg(u, 0.60, 0.75), s6 = seg(u, 0.75, 1.00);

  // —— 子阶段 1/2：点云散落 → 凝聚成 ∞ 轮廓（密度渐变字符）——
  if (!VIS.m && (s1 >= 0 || s2 >= 0)) {
    const k = s2 >= 0 ? easeOut(s2) : 0;
    const width = L.cx1 - L.cx0 + 12, height = L.mainBot - L.mainTop - 2;
    for (let i = 0; i < NP; i++) {
      const h1 = hash11(i * 1.37 + 0.11), h2 = hash11(i * 3.71 + 0.29), h3 = hash11(i * 7.13 + 0.53);
      const fx = L.cx0 - 6 + ((h1 * width + stepT() * (6 + h2 * 16)) % width);
      const fy = L.mainTop + 1 + ((h2 * height + Math.sin(stepT() * 0.9 + i * 0.7) * 4 + 400) % height);
      const lp = lemniscate(h3 * Math.PI * 2);
      const x = Math.round(lerp(fx, cx + lp.x * S, k));
      const y = Math.round(lerp(fy, cy + lp.y * Sy, k));
      const arrived = k > 0.70 + h1 * 0.22;                       // 到达顺序错开
      frame.set(x, y,
        arrived ? DENSITY[6 + (i % 4)] : DENSITY[2 + (i % 5)],
        arrived ? C.bright : (k > 0.3 ? C.mid : C.dark),
        arrived);
    }
  }

  // —— 子阶段 3/4：∞ 旋转 + 左右两条正弦波 → 干涉图案 ——
  if (!VIS.m && (s3 >= 0 || s4 >= 0)) {
    const rot = s3 >= 0 ? easeInOut(s3) * Math.PI * 0.5 : Math.PI * 0.5 + Math.sin(s4 * Math.PI * 2) * 0.12;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const M = 760;
    for (let i = 0; i < M; i++) {
      const th = (i / M) * Math.PI * 2;
      const lp = lemniscate(th);
      const px = lp.x * S, py = lp.y * Sy;
      const x = Math.round(cx + px * cs - py * sn);
      const y = Math.round(cy + px * sn + py * cs);
      const dens = 5 + Math.round(2.5 + 2.5 * Math.sin(th * 3 + u * 9));   // 沿轮廓疏密变化
      frame.set(x, y, DENSITY[clamp(dens, 2, 9)], s4 >= 0 ? C.light : C.mid);
      if (i % 7 === 0) frame.set(x + 1, y, '=', C.dark);
    }
    // 两条正弦波：一条从左进入，一条从右进入
    const amp = (L.mainBot - L.mainTop) * 0.20;
    const wT = stepT() * 2.2;
    for (let x = L.cx0; x <= L.cx1; x++) {
      const kx = (x - L.cx0) / (L.cx1 - L.cx0);
      const wl = Math.sin(kx * 11 + wT) * amp * clamp(kx * 3.2, 0, 1);
      const wr = Math.sin(kx * 11 - wT * 1.18 + 1.9) * amp * clamp((1 - kx) * 3.2, 0, 1);
      frame.set(x, Math.round(cy + wl), '~', C.light);
      frame.set(x, Math.round(cy + wr), '~', C.mid);
      if (s4 >= 0) {                                   // 叠加 → 干涉条纹
        const hit = Math.abs(wl - wr) < amp * 0.14;
        frame.set(x, Math.round(cy + (wl + wr) * 0.5), hit ? '@' : '=', hit ? C.pure : C.bright, hit);
      }
    }
    if (s4 >= 0) frame.centerText(cy + Math.round(amp) + 3, 'INTERFERENCE   |ψ1 + ψ2|^2', C.mid);
  }

  // —— 子阶段 5：∞ 解体，字符散成极限曲线 y = 1/x，从左到右扫过 ——
  if (!VIS.m && s5 >= 0) {
    const sweep = easeInOut(s5);
    for (let i = 0; i < 220; i++) {                    // ∞ 的残影向外飘散
      const th = hash11(i * 5.1) * Math.PI * 2;
      const lp = lemniscate(th);
      const k = clamp(s5 * 1.4 - hash11(i * 2.3) * 0.4, 0, 1);
      const x = Math.round(cx + lp.x * S * lerp(1, 2.8, k));
      const y = Math.round(cy + lp.y * Sy * lerp(1, 2.8, k));
      if (hash2(x, y) < k * 0.8) continue;
      frame.set(x, y, '.', C.deep);
    }
    const a = 0.26;
    for (let i = 0; i < 900; i++) {
      const nx = -1.15 + (i / 900) * 2.30;
      if (Math.abs(nx) < 0.05) continue;
      const ny = a / nx;
      if (Math.abs(ny) > 1.05) continue;
      const X = Math.round(cx + nx * S), Y = Math.round(cy + ny * Sy * 2.1);
      if (X < L.cx0 || X > L.cx1 || Y < L.mainTop || Y > L.mainBot) continue;
      if ((nx + 1.15) / 2.30 > sweep) continue;        // 从左向右揭示
      const near = 1 - Math.abs(ny) / 1.05;
      frame.set(X, Y, near > 0.6 ? '@' : (near > 0.25 ? '#' : '='), C.bright, near > 0.6);
    }
    frame.centerText(L.mainBot - 2, 'y = 1 / x        lim  x -> 0  f(x) = INF', C.mid);
  }

  // —— 子阶段 6：坍缩成一个点 → 炸开 [ME] / [YOU] → 重组 ∞ ——
  if (!VIS.m && s6 >= 0) {
    if (s6 < 0.34) {
      const k = easeIn(s6 / 0.34);
      for (let i = 0; i < 300; i++) {
        const th = hash11(i * 4.3) * Math.PI * 2;
        const lp = lemniscate(th);
        frame.set(Math.round(lerp(cx + lp.x * S, cx, k)), Math.round(lerp(cy + lp.y * Sy, cy, k)),
          k > 0.75 ? '@' : '#', k > 0.75 ? C.pure : C.light, k > 0.75);
      }
    } else if (s6 < 0.62) {
      const k = easeOut((s6 - 0.34) / 0.28);
      const r = 3 + k * S * 0.85;
      for (let i = 0; i < 220; i++) {
        const th = (i / 220) * Math.PI * 2;
        frame.set(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r * 0.6),
          k < 0.5 ? '█' : '.', k < 0.5 ? C.pure : C.dark, k < 0.5);
      }
      frame.text(Math.round(cx - r * 0.75) - 2, cy, '[ME]', C.alert, true);
      frame.text(Math.round(cx + r * 0.75) - 2, cy, '[YOU]', C.alert, true);
    } else {
      const k = easeOut((s6 - 0.62) / 0.38);
      for (let i = 0; i < 460; i++) {
        const th = (i / 460) * Math.PI * 2;
        const lp = lemniscate(th);
        const from = 1.6 + hash11(i * 1.9) * 0.9;      // 从外面飞回来
        const scale = lerp(from, 1, k);
        frame.set(Math.round(cx + lp.x * S * scale), Math.round(cy + lp.y * Sy * scale),
          k > 0.8 ? '@' : '#', k > 0.8 ? C.pure : C.light, k > 0.8);
      }
      frame.centerText(Math.round(cy + Sy * 0.9), 'n -> INF   //   REASSEMBLED', C.mid);
    }
  }
}

/* ===== 场景 3：EXECUTION —— 五个子阶段（问题 2 重构）==================== */
// 字符雨 / 碎片用的字符池（原来在场景 3 里定义，重写后必须保留）
const RAIN_POOL = '01<>/\\|{}[]#$%&*+=ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function scene_execution(norm, frame) {
  const L = getL(), C = COL();
  const u = sceneLocal('EXECUTION', norm);
  const cx = (L.cx0 + L.cx1) / 2, cy = (L.mainTop + L.mainBot) / 2;
  const span = L.mainBot - L.mainTop;

  const s1 = seg(u, 0.00, 0.15), s2 = seg(u, 0.15, 0.35), s3 = seg(u, 0.35, 0.55),
        s4 = seg(u, 0.55, 0.75), s5 = seg(u, 0.75, 1.00);

  // —— 底噪：字符雨，速度按子阶段变化（子阶段 1 就是"由慢到快"）——
  let speed = 1.0;
  if (s1 >= 0) speed = 0.22 + easeIn(s1) * 1.5;
  else if (s2 >= 0) speed = 1.7;
  else if (s3 >= 0) speed = 1.7 + s3 * 0.9;
  else if (s4 >= 0) speed = 0.7;
  else speed = 0.3;
  // 叙事节奏：过了 "Though you have left"，每唱一句系统就烂得更彻底
  const grief = (GRIEF_IDX >= 0 && VIS.idx >= GRIEF_IDX) ? 1 : 0;
  const chaos = (GRIEF_IDX >= 0 && VIS.idx >= GRIEF_IDX) ? clamp((VIS.idx - GRIEF_IDX + 1) / 5, 0, 1) : 0;
  speed *= (1 + grief * 0.6);
  const tq = Math.floor(u * 60 * speed);
  if (!(s5 >= 0 && s5 > 0.30)) {
    for (let x = L.cx0; x <= L.cx1; x++) {
      const sp = 0.4 + hash11(x * 7.7) * 1.6;
      const head = L.mainTop + Math.floor((u * 90 * sp * speed + hash11(x * 13.3) * span * 2) % (span + 14));
      for (let j = 0; j < (VIS.m ? 4 : 9) + grief * 5; j++) {   // 崩塌段的雨更长更密（主视觉只压基础长度）
        const y = head - j;
        if (y < L.mainTop || y > L.mainBot) continue;
        const lv = 1 - j / 9;
        const red = grief && hash2(x * 0.7, y * 1.3) > 0.975;
        frame.set(x, y, RAIN_POOL[Math.floor(hash2(x * 1.3 + tq, y * 2.1) * RAIN_POOL.length)],
          red ? C.alert : (j === 0 ? (VIS.m ? C.mid : C.pure)
            : (VIS.m ? C.deep : (lv > 0.55 ? C.light : (lv > 0.3 ? C.mid : C.dark)))),
          red || (j === 0 && !VIS.m));
      }
    }
  }

  // —— 子阶段 2/3：中央 EXECUTE + 外围高速环绕；3 起抖动撕裂、红色侵入 ——
  if (!VIS.m && (s2 >= 0 || s3 >= 0)) {
    const tear = s3 >= 0 ? s3 : 0;
    const jx = tear > 0 ? Math.round((hash11(stepT() * 31) - 0.5) * 10 * tear) : 0;
    const jy = tear > 0 ? Math.round((hash11(stepT() * 17) - 0.5) * 3 * tear) : 0;
    if (hash11(stepT() * 9.1 + tq) > 0.05 - tear * 0.05) {
      drawBig(frame, 'EXECUTE', cx + jx, cy + jy, 2, 2, tear > 0.5 ? C.alert : C.pure, true);
      if (tear > 0.25) drawBig(frame, 'EXECUTE', cx - jx, cy + jy + 1, 2, 2, C.alert, true);   // 撕裂重影
    }
    for (let i = 0; i < 90; i++) {                              // 外围环绕
      const th = (i / 90) * Math.PI * 2 + stepT() * (2.2 + (i % 5) * 0.35) * (i % 2 ? 1 : -1);
      const rr = 0.62 + hash11(i * 3.3) * 0.30;
      const x = Math.round(cx + Math.cos(th) * (L.cx1 - L.cx0) * 0.48 * rr);
      const y = Math.round(cy + Math.sin(th) * span * 0.62 * rr);
      if (x < L.cx0 || x > L.cx1 || y < L.mainTop || y > L.mainBot) continue;
      frame.set(x, y, RAIN_POOL[Math.floor(hash2(i, Math.floor(stepT() * 12)) * RAIN_POOL.length)], C.light);
    }
    if (tear > 0) {                                             // 红色从画面边缘往里吃
      const inv = tear * 0.6;
      for (let i = 0; i < 320; i++) {
        const h = hash11(i * 2.7 + Math.floor(stepT() * 3) * 0.13);
        if (h > inv) continue;
        const edge = i % 4;
        const x = edge === 0 ? L.cx0 + Math.floor(hash11(i * 1.1) * 10 * tear)
          : (edge === 1 ? L.cx1 - Math.floor(hash11(i * 1.3) * 10 * tear)
            : L.cx0 + Math.floor(hash11(i * 5.1) * (L.cx1 - L.cx0)));
        const y = edge < 2 ? L.mainTop + Math.floor(hash11(i * 7.7) * span)
          : (edge === 2 ? L.mainTop + Math.floor(hash11(i * 9.1) * 5) : L.mainBot - Math.floor(hash11(i * 3.9) * 5));
        frame.set(x, y, '█', C.alert, true);
      }
      if ((u * sceneSeconds('EXECUTION') % 1.5) < 0.13) triggerTint(C.alert, 0.18);
    }
  }

  // —— 递增混乱：行了位移 + 随机乱码 + 整屏震动，越到后面越烂 ——
  if (chaos > 0.05) {
    triggerShake(0.16 + chaos * 0.45);
    for (let y = L.mainTop; y <= L.mainBot; y++) {
      if (hash11(y * 3.1 + Math.floor(stepT() * 6) * 0.21) < chaos * 0.45) {
        shiftRow(frame, y, Math.round((hash11(y * 7.7 + stepT()) - 0.5) * 26 * chaos));
      }
    }
    const junk = Math.round(240 * chaos);
    for (let i = 0; i < junk; i++) {
      const x = L.cx0 + Math.floor(hash11(i * 1.31 + Math.floor(stepT() * 9) * 0.17) * (L.cx1 - L.cx0));
      const y = L.mainTop + Math.floor(hash11(i * 2.71 + Math.floor(stepT() * 9) * 0.13) * (L.mainBot - L.mainTop));
      frame.set(x, y, RAIN_POOL[Math.floor(hash11(i * 5.7) * RAIN_POOL.length)],
        chaos > 0.6 ? C.alert : C.light, chaos > 0.6);
    }
    if (chaos > 0.75 && FX.tintAlpha < 0.08) triggerTint(C.alert, 0.10 * chaos);
  }

  // —— 子阶段 4：碎片化（字符块随机位移 + 数据崩溃）——
  if (!VIS.m && s4 >= 0) {
    const amt = Math.sin(clamp(s4, 0, 1) * Math.PI);            // 0 → 1 → 0
    scrambleBlocks(frame, 8, Math.floor(stepT() * 6) * 0.31, amt);
    if (s4 > 0.3 && FX.glitch <= 0) triggerGlitch(0.12);
    frame.centerText(L.mainTop + 1, '!! DATA CORRUPTION DETECTED !!', C.alert);

  }

  // —— 子阶段 5：碎片向中心收拢 → 一行代码 → 被红色划掉 ——
  if (!VIS.m && s5 >= 0) {
    const conv = easeInOut(clamp(s5 / 0.40, 0, 1));
    scrambleBlocks(frame, 8, 7.7, 1 - conv);                    // 位移随收拢归零
    const txt = 'world.execute(me);';
    const x0 = Math.floor((L.C - txt.length) / 2);
    if (s5 > 0.32) {
      const k = clamp((s5 - 0.32) / 0.28, 0, 1);
      const shown = Math.max(1, Math.round(k * txt.length));
      frame.text(x0, Math.round(cy), txt.slice(0, shown), C.pure, true);
      if (k >= 1 && (stepT() * 2) % 1 < 0.6) frame.set(x0 + txt.length, Math.round(cy), '█', C.pure, true);
    }
    if (s5 > 0.68) {                                            // 红色横线划掉
      const k = clamp((s5 - 0.68) / 0.32, 0, 1);
      const n = Math.round(k * (txt.length + 2));
      for (let i = 0; i < n; i++) frame.set(x0 + i, Math.round(cy), '─', C.alert, true);
      if (k > 0.5) frame.centerText(Math.round(cy) + 3, 'REQUEST DENIED', C.alert, true);
    }
  }
}

/* ===== 场景 4：RELEASE —— 五个子阶段（问题 2 重构）===================== */
// 内存转储行生成器（原来在场景 4 里定义，重写后必须保留）
function dumpLine(i) {
  let s = '0x' + (i * 16).toString(16).toUpperCase().padStart(4, '0') + '  ';
  for (let k = 0; k < 12; k++) {
    const v = Math.floor(hash11(i * 17.9 + k * 5.1) * 256);
    s += v.toString(16).toUpperCase().padStart(2, '0') + (k === 5 ? '  ' : ' ');
  }
  return s;
}
function scene_release(norm, frame) {
  const L = getL(), C = COL();
  const u = sceneLocal('RELEASE', norm);
  const mid = Math.floor((L.mainTop + L.mainBot) / 2);
  const span = L.mainBot - L.mainTop;

  const s1 = seg(u, 0.00, 0.18), s2 = seg(u, 0.18, 0.38), s3 = seg(u, 0.38, 0.58),
        s4 = seg(u, 0.58, 0.78), s5 = seg(u, 0.78, 1.00);

  // 崩溃程度 & 滚动速度（越到后面越慢）
  const decay = clamp(u * 1.05, 0, 1);
  const speed = (1 - decay) * (1 - decay * 0.5);
  const scroll = Math.floor(u * 46 * speed + u * 12);

  // —— 底图：内存转储。坏块/红块概率逐子阶段上升，上半屏先烂 ——
  if (s5 < 0 || s5 < 0.75) {
    for (let y = L.mainTop; y <= L.mainBot; y++) {
      const ln = dumpLine(scroll + (y - L.mainTop));
      const rowFall = (y - L.mainTop) / Math.max(1, span);
      for (let i = 0; i < ln.length; i++) {
        const x = L.cx0 + 1 + i;
        if (x > L.cx1) break;
        let kill = 0, red = 0;
        if (s1 >= 0) { kill = 0.05; red = 0.02; }
        else if (s2 >= 0) { kill = 0.10 + s2 * 0.30 + rowFall * 0.18; red = 0.04 + s2 * 0.10; }
        else if (s3 >= 0) { kill = 0.32 + s3 * 0.38 + rowFall * 0.22; red = 0.12 + s3 * 0.22; }
        else { kill = 0.52 + (s4 >= 0 ? s4 * 0.38 : 0.38) + rowFall * 0.20; red = 0.22; }
        if (y < mid) kill += 0.16;                       // 上半屏先碎
        const r = hash2(x * 1.7, y * 3.3 + Math.floor(u * 5));
        if (r < kill) continue;
        if (r < kill + red) { frame.set(x, y, RAIN_POOL[Math.floor(hash2(x, y * 1.9) * RAIN_POOL.length)], C.alert, true); continue; }
        frame.set(x, y, ln[i], VIS.m ? (y < mid ? C.deep : C.dark)     // 有主体视觉时转储整体压暗
          : (y < mid ? C.dark : (rowFall > 0.6 ? C.mid : C.light)));
      }
    }
  }

  // —— 子阶段 2 起：水平撕裂（整行位移）——
  const tearAmt = s2 >= 0 ? 0.30 + (s3 >= 0 ? s3 * 0.45 : 0) + (s4 >= 0 ? s4 * 0.35 : 0) : (s1 >= 0 ? 0.05 : 0.5);
  if (tearAmt > 0.08) {
    for (let y = L.mainTop; y <= L.mainBot; y++) {
      if (hash11(y * 3.7 + Math.floor(stepT() * 5) * 0.19) > tearAmt * 0.5) continue;
      shiftRow(frame, y, Math.round((hash11(y * 9.1 + stepT()) - 0.5) * 24 * tearAmt));
    }
  }

  // —— 子阶段 3/4：从水平中线裂开，裂缝抖动 + 短语闪烁 ——
  if (s3 >= 0 || s4 >= 0) {
    const open = s3 >= 0 ? s3 : 1;
    const gap = Math.round(open * 2.5);
    for (let x = L.cx0 - 2; x <= L.cx1 + 2; x++) {
      const off = Math.round((hash11(x * 3.1 + stepT() * 30) - 0.5) * 2.5 * open);
      for (let g = -gap; g <= gap; g++) frame.erase(x, mid + g + off);
      frame.set(x, mid + off, hash11(x * 7.7 + stepT() * 2) > 0.5 ? '▄' : '▀', C.alert, true);
    }
    if ((u * sceneSeconds('RELEASE') % 1.2) < 0.07) triggerShake(0.34);   // 裂缝每隔 1.2 秒"咚"一下
    const words = ['RELEASE ME', 'DELETE ALL', 'WHO AM I', 'CONNECTION LOST'];
    const wi = Math.floor(u * sceneSeconds('RELEASE') / 0.9) % words.length;
    if (!VIS.m && (stepT() * 1.6) % 1 < 0.82) {
      frame.centerText(mid - 3 - gap, words[wi], C.alert, true);
      frame.centerText(mid + 3 + gap, words[(wi + 1) % words.length], C.mid);
    }
    if (FX.glitch > 0) triggerTint(C.alert, 0.14);
  }

  // —— 子阶段 5：全部坠落清空，只剩一行断开提示在闪 ——
  if (s5 >= 0) {
    const k = clamp(s5 / 0.6, 0, 1);
    for (let y = L.mainTop; y <= L.mainBot; y++) {
      for (let x = L.cx0; x <= L.cx1; x++) {
        const r = hash2(x * 1.3, y * 2.7);
        if (r < k) frame.erase(x, y);
        else if (r < k + 0.03) frame.set(x, y, '.', C.alert);
      }
    }
    if ((stepT() * 1.3) % 1 < 0.7) frame.centerText(mid, 'CONNECTION LOST', C.alert, true);
    if (s5 > 0.5) frame.centerText(mid + 3, 'NO CARRIER', C.dark);
  }
}

/* ===== 场景 5：LOVE —— 六个子阶段（问题 2 重构）======================== */
// 颜色混合（原来在场景 5 里定义，重写后必须保留）
function mixRGB(a, b, k) {
  return 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')';
}
function scene_love(norm, frame) {
  const L = getL(), C = COL();
  const u = sceneLocal('LOVE', norm);

  const s1 = seg(u, 0.00, 0.20), s2 = seg(u, 0.20, 0.40), s3 = seg(u, 0.40, 0.60),
        s4 = seg(u, 0.60, 0.75), s5 = seg(u, 0.75, 0.90), s6 = seg(u, 0.90, 1.00);

  const cx = (L.cx0 + L.cx1) / 2, cy = (L.mainTop + L.mainBot) / 2;
  const availW = L.cx1 - L.cx0, availH = L.mainBot - L.mainTop;

  // 心跳：相位仍然来自 audio.currentTime（不是独立计时器）
  const beatPh = 1 - ((AUDIO.time * BEAT_BPM / 60) % 1);
  if ((s3 >= 0 || s4 >= 0) && beatPh > 0.93) triggerShake(s4 >= 0 ? 0.26 : 0.16);   // 心跳带动整屏
  const pulseAmt = s4 >= 0 ? 0.085 : (s5 >= 0 ? 0.03 : 0.02);
  const pulse = 1 + pulseAmt * Math.pow(beatPh, 3);
  // 子阶段 4 脉动段辉光最高；LOVE 全场比其他场景更亮
  CONFIG.glowBoost = s4 >= 0 ? 2.2 : (s3 >= 0 ? 1.9 : 1.5);
  const S = Math.min(availW / 2.5, availH / 1.45) * pulse;
  const Sy = S * 0.6;

  // 主色 → 暖白（子阶段 3 完成渐变）
  const warmK = s3 >= 0 ? clamp(s3 / 0.7, 0, 1) : (s2 >= 0 ? s2 * 0.3 : 0);
  const base = hexToRgb(C.bright), warm = hexToRgb(WARM_WHITE), deep = hexToRgb(C.deep);
  const dim = s5 >= 0 ? clamp(s5 * 0.9, 0, 0.75) : 0;          // 子阶段 5 起整体变暗
  const pal = [];
  for (let i = 0; i < 6; i++) pal.push(mixRGB(mixRGB(base, warm, (i / 5) * warmK), deep, dim));
  const edgeColor = mixRGB(mixRGB(warm, base, 1 - warmK), deep, dim);

  // —— 子阶段 1：字符从四面八方汇聚成心形轮廓的雏形 ——
  if (!VIS.m && s1 >= 0) {
    const k = easeOut(s1);
    for (let i = 0; i < 260; i++) {
      const th = hash11(i * 5.9) * Math.PI * 2;
      const px = 1.14 * Math.pow(Math.sin(th), 3);
      const py = 1.247 * (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)) / 16 + 0.065;
      const tx = cx + px * S, ty = cy - (py + 0.13) * Sy;
      const sx = 2 + hash11(i * 1.7) * (L.C - 4), sy = L.mainTop + hash11(i * 3.3) * availH;
      const d = hash11(i * 11.3) * 0.35;
      const kk = easeOut(clamp((k - d) / (1 - d || 1), 0, 1));
      if (kk <= 0) continue;
      frame.set(Math.round(lerp(sx, tx, kk)), Math.round(lerp(sy, ty, kk)),
        kk > 0.85 ? '♥' : (kk > 0.5 ? '*' : '+'), kk > 0.85 ? edgeColor : pal[2], kk > 0.85);
    }
  }

  // —— 子阶段 2-6：心形实体（隐函数二值化 → 四邻判定轮廓，避免中轴假边）——
  const fillK = s2 >= 0 ? clamp(s2 / 0.8, 0, 1) : (s1 >= 0 ? 0 : 1);
  if (!VIS.m && fillK > 0.02) {
    if (!scene_love._mask) scene_love._mask = new Uint8Array(0);
    const cols = L.C;
    if (scene_love._mask.length < cols * L.R) scene_love._mask = new Uint8Array(cols * L.R);
    const mask = scene_love._mask;
    const bx0 = Math.max(0, Math.floor(cx - 1.25 * S) - 1);
    const bx1 = Math.min(cols - 1, Math.ceil(cx + 1.25 * S) + 1);
    const by0 = Math.max(0, Math.floor(cy - 1.25 * Sy) - 1);
    const by1 = Math.min(L.R - 1, Math.ceil(cy + 1.25 * Sy) + 1);
    for (let y = by0; y <= by1; y++) {                          // 二值化
      const ny = -((y - cy) / Sy) - 0.13;
      for (let x = bx0; x <= bx1; x++) {
        const nx = (x - cx) / S;
        const q = nx * nx + ny * ny - 1;
        mask[y * cols + x] = (q * q * q - nx * nx * ny * ny * ny <= 0) ? 1 : 0;
      }
    }
    // 子阶段 5：心形解体成两半，向左右漂移
    const split = s5 >= 0 ? easeInOut(s5) * Math.min(26, availW * 0.18) : 0;
    if (s6 >= 0) { /* 子阶段 6 只保留代码行，心形先整体淡出 */ }
    const edgeFlow = s3 >= 0 ? 1 : 0;                           // 边缘流动开关
    for (let y = Math.max(L.mainTop, by0 + 1); y <= Math.min(L.mainBot, by1 - 1); y++) {
      const ny = -((y - cy) / Sy) - 0.13;
      for (let x = Math.max(L.cx0, bx0 + 1); x <= Math.min(L.cx1, bx1 - 1); x++) {
        const i = y * cols + x;
        if (!mask[i]) continue;
        if (hash2(x * 2.3, y * 1.7) > fillK) continue;          // 逐格浮现
        const nx = (x - cx) / S;
        const q = nx * nx + ny * ny - 1;
        const f = q * q * q - nx * nx * ny * ny * ny;
        const depth = clamp(-f / 1.2, 0, 1);
        const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - cols] || !mask[i + cols];
        let ch, col;
        if (edge) {
          // 边缘流动：让轮廓上的 ♥ 沿边界缓慢游走
          const flow = edgeFlow ? hash2(x * 0.7 + Math.floor(stepT() * 3) * 1.7, y * 1.3) : 1;
          ch = flow > 0.42 ? '♥' : '·';
          col = flow > 0.42 ? edgeColor : pal[1];
        } else if (hash2(x * 3.7, y * 2.9) < 0.06) { ch = '.'; col = pal[0]; }
        else if (depth > 0.55) { ch = '@'; col = pal[5]; }
        else if (depth > 0.3) { ch = '%'; col = pal[4]; }
        else if (depth > 0.12) { ch = '#'; col = pal[3]; }
        else { ch = '*'; col = pal[2]; }
        const xo = split > 0 ? (x < cx ? -split : split) : 0;   // 子阶段 5 的左右漂移
        frame.set(Math.round(x + xo), y, ch, col, edge || ch === '@');
      }
    }
  }

  // —— 子阶段 5：中间露出 love := ♥ ——
  if (!VIS.m && s5 >= 0) {
    const k = clamp((s5 - 0.15) / 0.45, 0, 1);
    if (k > 0) {
      const txt = 'love := ♥';
      const shown = txt.slice(0, Math.max(1, Math.round(k * txt.length)));
      frame.centerText(Math.round(cy), shown, mixRGB(warm, deep, 1 - k), k > 0.6);
    }
  }

  // —— 子阶段 6：所有字符暗下去，只剩 world.execute(me); 光标闪烁 ——
  if (s6 >= 0) {
    const k = clamp(s6 / 0.25, 0, 1);                       // 收尾加速：3 秒内清空
    for (let y = L.mainTop; y <= L.mainBot; y++) {
      for (let x = L.cx0; x <= L.cx1; x++) {
        if (hash2(x * 1.3, y * 2.7) < k) frame.erase(x, y);
      }
    }
    if (s6 > 0.08) {                                          // 代码行尽早出现（约 208.8s）
      const txt = 'world.execute(me);';
      const x0 = Math.floor((L.C - txt.length) / 2);
      frame.text(x0, Math.round(cy), txt, WARM_WHITE, true);
      if ((stepT() * 1.6) % 1 < 0.6) frame.set(x0 + txt.length, Math.round(cy), '█', WARM_WHITE, true);
    }
  }
}

/* ---------------------------------------------------------------------------
   [12] 左右数据流面板：标签固定为 n -> INF / YOU.LIMIT，内容随场景变化
   --------------------------------------------------------------------------- */
function drawSidePanels(frame, sceneName, t, norm, u) {
  const L = getL(), C = COL();
  const h = L.mainBot - L.mainTop + 1;
  const rows = h - 2;
  const scroll = Math.floor(t * 6);
  const left = [], right = [];
  for (let i = 0; i < rows; i++) {
    const k = scroll + i;
    switch (sceneName) {
      case 'CREATION':
        left.push('0x' + (k * 4).toString(16).toUpperCase().padStart(4, '0') + '  ' +
          Math.floor(hash11(k * 3.1) * 65535).toString(16).toUpperCase().padStart(4, '0'));
        right.push(i < 9 ? (i < Math.floor(u * 11) ? 'POST ' + i + ' OK' : 'POST ' + i + ' ..') : '');
        break;
      case 'DEVOTION':
        left.push('n' + String(k % 100).padStart(3, ' ') + ' = ' + (Math.pow(2, Math.min(40, k % 40))).toExponential(2));
        right.push('YOU.LIMIT ' + (99.9 - (k % 7) * 0.01).toFixed(2) + '%');
        break;
      case 'EXECUTION':
        left.push('0x' + (k * 4096).toString(16).toUpperCase().padStart(8, '0') + '  ' + (hash11(k * 7.7) > 0.5 ? 'RD' : 'WR'));
        right.push('THR' + String(k % 64).padStart(2, '0') + '  ' + (hash11(k * 2.3) > 0.25 ? 'RUN' : 'BLK'));
        break;
      case 'RELEASE':
        left.push(['ERROR', 'NULL', '0x00', 'SEG_FAULT', 'DUMP'][k % 5] + '  ' + (hash11(k * 5.1) * 255).toFixed(0));
        right.push('MEM ' + (100 - Math.min(100, Math.floor(u * 130) + (k % 5))) + '%  ' + '░'.repeat(k % 6));
        break;
      default: // LOVE
        left.push('HEART ' + (BEAT_BPM + Math.round(Math.sin(k) * 2)) + ' BPM  ' + (hash11(k * 3.3) > 0.5 ? '♥' : ' '));
        right.push('love := ' + (u > 0.5 ? '♥' : 'null'));
        break;
    }
  }
  // RELEASE 场景的面板整体染红、闪烁
  const panic = sceneName === 'RELEASE';
  const c1 = panic && (stepT() * 4) % 1 < 0.5 ? C.alert : C.dark;
  drawPanel(frame, L.panLx, L.mainTop, L.panW, h, 'n -> INF', left, c1, panic ? C.alert : C.mid);
  drawPanel(frame, L.panRx, L.mainTop, L.panW, h, 'YOU.LIMIT', right, c1, panic ? C.alert : C.mid);
}

/* ---------------------------------------------------------------------------
   [13] MV 主渲染：场景选择 + 布局 + 歌词 + 开发者面板 + 合成
   时间唯一来源 = audio.currentTime（用 performance.now 单独计时是被禁止的）
   --------------------------------------------------------------------------- */
const SUBTITLES = {
  CREATION: 'SELF SYSTEM v1.0 — POWER ON SELF TEST',
  DEVOTION: 'INFINITE LOOP / n -> INF    GROWTH RATE: EXPONENTIAL',
  EXECUTION: 'EXECUTING...  NO RETURN PATH',
  RELEASE: 'CONNECTION LOST — DUMPING MEMORY',
  LOVE: 'love := ♥  //  FINAL ASSIGNMENT'
};
function renderMVContent(f, sceneName, sceneNorm, norm, t, total) {
  const L = getL(), C = COL();
  const ov = devMode.visible ? devPanel.sceneOverride : 'AUTO';
  const u = sceneLocal(sceneName, sceneNorm);

  f.clear();
  // 外框（机壳内的显示区域）
  f.box(0, 0, L.C, L.R, C.deep);
  drawHeader(f, t, total, sceneName);

  // 副标题
  let sub = SUBTITLES[sceneName] || '';
  if (ov !== 'AUTO') sub += '            [DEBUG: LOCKED]';
  f.centerText(L.sub, sub, ov !== 'AUTO' ? C.alert : C.mid);
  f.centerText(L.sub2, (sceneName === 'LOVE' ? '♥ ' : '· ') + sceneName + ' · ' +
    Math.round(u * 100) + '%  (' + fmtTime(norm * total) + ')', C.dark);

  // 主内容
  switch (sceneName) {
    case 'CREATION': scene_creation(sceneNorm, f); break;
    case 'DEVOTION': scene_devotion(sceneNorm, f); break;
    case 'EXECUTION': scene_execution(sceneNorm, f); break;
    case 'RELEASE': scene_release(sceneNorm, f); break;
    default: scene_love(sceneNorm, f); break;
  }
  // 歌词对应的主体视觉（有匹配时才画；没有则由场景自己的子阶段撑场）
  if (VIS.m) drawMotif(f, VIS.m, VIS.p);

  drawSidePanels(f, sceneName, t, norm, u);

  // 底部状态栏
  const stat = sceneName === 'RELEASE' ? 'FAIL'
    : (sceneName === 'EXECUTION' ? (Math.floor(t * 2) % 4 === 0 ? 'FAIL' : 'OK')
      : (sceneName === 'CREATION' ? (u > 0.35 ? 'OK' : '--') : 'OK'));
  let sx = drawProgressBar(f, L.panLx + 2, L.status, 'POWER SUPPLY', stat, 0);
  drawProgressBar(f, sx + 3, L.status, 'SOUL LINK', sceneName === 'RELEASE' ? '--' : 'OK', 0);
  f.rightText(L.panRx + L.panW - 2, L.status, 'FRAME ' + String(frameCount).padStart(6, '0') + '  FPS ' + fpsValue.toFixed(1), C.dark);
  // 场景注释行
  if (sceneName === 'DEVOTION') f.text(L.panLx + 2, L.note, 'n = 2^0008   /   NO UPPER BOUND', C.mid);
  else if (sceneName === 'EXECUTION') f.text(L.panLx + 2, L.note, '> execute(me)   [Y/n]', C.mid);
  else if (sceneName === 'RELEASE') f.text(L.panLx + 2, L.note, 'DUMPING 0x7FFE0000 ... ' + Math.round(u * 100) + '%  [FAIL]', C.alert);
  else if (sceneName === 'LOVE') f.text(L.panLx + 2, L.note, 'love := ♥   //   FINAL ASSIGNMENT COMMITTED', C.mid);
  else f.text(L.panLx + 2, L.note, 'IDENTITY : [YOU_   ...   OK', C.mid);

  drawLyrics(f, t, total);

  // 底部提示
  if (AUDIO.blocked) f.centerText(L.hint, '> AUDIO BLOCKED — CLICK ANYWHERE TO SYNC', C.alert);
  else drawHints(f, '[D] DEV MODE   [SPACE] PAUSE   [←/→] SEEK 10s', fmtTime(total) + '  ' + C_BRAND);

  if (devMode.visible) devPanel.render(f);

}

function renderMVStage() {
  if (SONGS.current === 'search') { renderSearchStage(); return; }
  const f = FRAME;
  const total = (AUDIO.duration && isFinite(AUDIO.duration) && AUDIO.duration > 0) ? AUDIO.duration : 1;
  const t = mvTime();                       // 音频已播秒数 - 起播时刻
  const norm = clamp(t / total, 0, 1);

  // —— 场景判定（开发者面板可强制锁定）——
  let sceneName, sceneNorm = norm;
  const ov = devMode.visible ? devPanel.sceneOverride : 'AUTO';
  if (ov !== 'AUTO') {
    sceneName = ov;
    const s = sceneByName(ov);
    // 调试模式：场景时间按 0-1 循环，每 20 秒一轮
    const local = (performance.now() / 20000) % 1;
    sceneNorm = s.start + local * (s.end - s.start);
  } else {
    const s = getCurrentScene(norm);
    sceneName = s.name;
  }
  updateLyricVis(t, total);
  renderMVContent(f, sceneName, sceneNorm, norm, t, total);
  if (ov === 'AUTO' && sceneName !== 'CREATION') drawExecuteSync(f, t - sceneByName(sceneName).start * total);

  // 后处理：LOVE 终章辉光拉满
  if (sceneName !== 'LOVE') CONFIG.glowBoost = 1.0;   // LOVE 的辉光由场景内部按子阶段写
  GlowEngine.process(f);
  drawOffCanvas(f);
  compositeToMain();
}
