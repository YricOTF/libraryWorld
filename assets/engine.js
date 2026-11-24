'use strict';

/* ===========================================================================
   world.execute(me);  —  ASCII / CRT 音乐影像
   ---------------------------------------------------------------------------
   三段式流程：
     STYLE（风格选择） → LOADING（链路同步，即音频缓冲） → DIALOG（AI 女友对话）
     → MV（五场景，时间轴 = audio.currentTime / audio.duration）
   渲染管线（每帧）：
     Frame(字符网格) → GlowEngine(光晕扩散) → drawOffCanvas(逐字符 fillText)
     → compositeToMain(清晰层 + 双层 Bloom + 扫描线 + 暗角 + 故障分离 + 闪白)
   约束：只用 Canvas 2D；不用任何外部库；画面颜色一律取自 STYLE.colors。
   =========================================================================== */

/* ---------------------------------------------------------------------------
   [1] 顶部配置
   --------------------------------------------------------------------------- */

// 开发者面板总开关（交付版保持 true；里面对画面无副作用，只有按键才唤出）
const ENABLE_DEV_MODE = true;

// 全片唯一允许出现在六套预设之外的颜色：LOVE 终章心形的"暖白"。
// 需求明确要求终章由主色渐变到 #FFF8E7，因此在这里单独声明并集中说明。
const WARM_WHITE = '#FFF8E7';
const MOTION_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

// 心跳 / 脉动相位用的近似 BPM。注意：它只影响"节拍脉冲"的相位，
// 所有时间仍来自 audio.currentTime，不引入任何独立计时器。
const BEAT_BPM = 128;

const CONFIG = {
  // —— 字符网格 ——
  // 需求里写"offCanvas 分辨率等于字符网格尺寸（200x72）"，但 1 格 = 1 像素时
  // fillText 无法成形，因此每格给固定像素 CELL_W x CELL_H，网格仍是 200x72 格。
  gridCols: 184,            // 184x64：同样铺满窗口，但每格更大 → 字更大
  gridRows: 64,
  cellW: 7.6,               // 列宽（px）
  cellH: 13.0,              // 行高（px）
  charAspect: 0.6,
  // 字体：Consolas / Menlo 的 x-height 比 Courier New 大得多，同样的格子里字形饱满约 35%，
  // 所以观感从"细瘦打字机"变成"厚实终端字"。想回到旧观感，把 Courier New 挪到第一位即可：
  //   "'Courier New', 'Consolas', 'Menlo', monospace"
  fontFamily: "'Consolas', 'Menlo', 'Courier New', monospace",
  fontSize: 13,             // 字号；calibrateFont() 会按实测推进宽度再校正一次

  // —— 颜色与效果（由 STYLE.apply 注入）——
  colors: {},
  glowStrength: 1.0,
  scanlineAlpha: 0.15,
  vignetteAlpha: 0.6,
  glitchInterval: 6.0,
  chromaticAberration: 2,
  bloomRadius: 4,

  // —— 运行期可调 ——
  fpsTarget: 60,
  glowBoost: 1.0,           // 场景级辉光倍率（LOVE 终章会拉满）
  glowBudget: 420,          // 单帧允许开 shadowBlur 的字符数上限（性能权衡，见 drawOffCanvas）

  // —— 时间轴：全部是"占音频总时长的百分比" ——
  // 问题 5：场景边界不再写死在这里，改由歌词关键句驱动（见 SCENE_KEYS / getCurrentScene）
  // —— 歌词：启动时由 LRC 原始时间戳 ÷ 实际时长 归一化成 {t:0..1, en, cn} ——
  lyrics: [],
  tailNorm: 0.985           // "最后几秒"的归一化起点，同样按时长换算
};

/* 六套视觉风格预设（完整参数，运行时通过 STYLE.apply 注入 CONFIG） */
/* 第二首专用风格：暖米黄纸色，柔和现代界面（无扫描线 / 无色偏 / 胶片颗粒） */
const CREAM_PRESET = {
  id: 'CREAM', name: 'CREAM PAPER', nameCN: '米黄',
  description: 'Warm cream paper, soft modern interface, film grain',
  descriptionCN: '暖米黄纸色，柔和现代界面，胶片颗粒',
  colors: {
    bright: '#493121', pure: '#2B2018', light: '#60432D',
    mid: '#785336', dark: '#634D3C', deep: '#A08668',
    alert: '#953E2B', glowNear: '#CAB297', glowFar: '#D7BE9B',
    black: '#F1E2C3'
  },
  effects: {
    glowStrength: 0, scanlineAlpha: 0.0, vignetteAlpha: 0.34,
    glitchInterval: 15.0, chromaticAberration: 0, bloomRadius: 2
  }
};

const STYLE_PRESETS = [
  {
    id: 'WHITE', name: 'COLD WHITE', nameCN: '冷白',
    description: '高对比度单色 CRT，冷白光，工业感',
    descriptionCN: '高对比度单色 CRT，冷白光，工业感',
    colors: {
      bright: '#F5F5F5', pure: '#FFFFFF', light: '#D0D0D0',
      mid: '#9A9A9A', dark: '#5C5C5C', deep: '#2E2E2E',
      alert: '#FF2A2A', glowNear: '#404040', glowFar: '#202020',
      black: '#000000'
    },
    effects: {
      glowStrength: 1.0, scanlineAlpha: 0.15, vignetteAlpha: 0.60,
      glitchInterval: 6.0, chromaticAberration: 2, bloomRadius: 4
    }
  },
  {
    id: 'AMBER', name: 'PHOSPHOR AMBER', nameCN: '琥珀',
    description: 'Classic old terminal, warm amber phosphor, nostalgic',
    descriptionCN: '经典老式终端，暖橙色磷光，怀旧感',
    colors: {
      bright: '#FFB000', pure: '#FFD060', light: '#CC8800',
      mid: '#8B5A00', dark: '#4A3000', deep: '#221600',
      alert: '#FF2A2A', glowNear: '#5A3A00', glowFar: '#2A1A00',
      black: '#0A0600'
    },
    effects: {
      glowStrength: 1.4, scanlineAlpha: 0.20, vignetteAlpha: 0.70,
      glitchInterval: 8.0, chromaticAberration: 1, bloomRadius: 6
    }
  },
  {
    id: 'GREEN', name: 'MATRIX GREEN', nameCN: '矩阵绿',
    description: 'Classic hacker green screen, phosphor green, radiation feel',
    descriptionCN: '经典黑客绿屏，磷光绿，强辐射感',
    colors: {
      bright: '#00FF41', pure: '#80FF9C', light: '#00CC33',
      mid: '#008822', dark: '#004411', deep: '#001A08',
      alert: '#FF0033', glowNear: '#004A14', glowFar: '#001F08',
      black: '#000000'
    },
    effects: {
      glowStrength: 1.6, scanlineAlpha: 0.18, vignetteAlpha: 0.75,
      glitchInterval: 5.0, chromaticAberration: 3, bloomRadius: 6
    }
  },
  {
    id: 'RED', name: 'ALERT RED', nameCN: '警戒红',
    description: 'Danger signal red, system failure warning, oppressive',
    descriptionCN: '危险信号红，系统崩溃预警，压迫感',
    colors: {
      bright: '#FF3355', pure: '#FF6B80', light: '#CC1133',
      mid: '#880022', dark: '#440011', deep: '#1A0005',
      alert: '#FFFFFF', glowNear: '#4A000F', glowFar: '#1F0006',
      black: '#0A0000'
    },
    effects: {
      glowStrength: 1.5, scanlineAlpha: 0.22, vignetteAlpha: 0.80,
      glitchInterval: 3.0, chromaticAberration: 4, bloomRadius: 7
    }
  },
  {
    id: 'CYAN', name: 'CYBER CYAN', nameCN: '赛博青',
    description: 'Cold sci-fi blue, cyberpunk aesthetic, futuristic',
    descriptionCN: '冷峻科幻蓝，赛博朋克风，未来感',
    colors: {
      bright: '#00E5FF', pure: '#80F0FF', light: '#00B0CC',
      mid: '#007088', dark: '#003844', deep: '#001520',
      alert: '#FF2A6D', glowNear: '#003D4F', glowFar: '#001825',
      black: '#000508'
    },
    effects: {
      glowStrength: 1.8, scanlineAlpha: 0.12, vignetteAlpha: 0.65,
      glitchInterval: 5.5, chromaticAberration: 5, bloomRadius: 8
    }
  },
  {
    id: 'MONO', name: 'PURE MONO', nameCN: '纯黑白',
    description: 'Minimal black and white, no color, pure character art',
    descriptionCN: '极简黑白，无彩色，纯粹字符艺术',
    colors: {
      bright: '#FFFFFF', pure: '#FFFFFF', light: '#C0C0C0',
      mid: '#808080', dark: '#404040', deep: '#1A1A1A',
      alert: '#808080', glowNear: '#303030', glowFar: '#181818',
      black: '#000000'
    },
    effects: {
      glowStrength: 0.6, scanlineAlpha: 0.10, vignetteAlpha: 0.40,
      glitchInterval: 12.0, chromaticAberration: 0, bloomRadius: 2
    }
  },
  CREAM_PRESET
];

/* 运行时当前风格：所有绘制代码只准读 STYLE.colors / STYLE.effects */
/* 曲目状态：第一首 world.execute(me); 第二首 world.search(you); */
const SONGS = {
  list: ['execute', 'search'],
  current: 'execute',
  src: { execute: null, search: null }        // 每首歌单独记忆用户选的音源
};

const STYLE = {
  current: null,
  colors: {},
  effects: {},
  apply(presetId) {
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    this.current = presetId;
    this.colors = { ...preset.colors };
    this.effects = { ...preset.effects };
    CONFIG.colors = this.colors;
    CONFIG.glowStrength = preset.effects.glowStrength;
    CONFIG.scanlineAlpha = preset.effects.scanlineAlpha;
    CONFIG.vignetteAlpha = preset.effects.vignetteAlpha;
    CONFIG.glitchInterval = preset.effects.glitchInterval;
    CONFIG.chromaticAberration = preset.effects.chromaticAberration;
    CONFIG.bloomRadius = preset.effects.bloomRadius;
    // 风格切换时重建依赖颜色的缓存（扫描线图案 / 暗角渐变由 compositeToMain 惰性重建）
    scanDirty = true;
    vignetteDirty = true;
  },
  preset() { return STYLE_PRESETS.find(p => p.id === this.current) || STYLE_PRESETS[0]; }
};

const STYLE_KEY = 'world_execute_me_style';   // localStorage 持久化键名

/* ---------------------------------------------------------------------------
   [2] 通用工具
   --------------------------------------------------------------------------- */
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeIn = k => k * k * k;
const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1, q = k - 1; return 1 + c3 * q * q * q + c1 * q * q; };
const easeInOutQuart = k => (k < 0.5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2);
// 节拍相位 0..1：与 BEAT_BPM 同源，供歌词提亮 / 心跳 / 脉动共用（不引入独立计时器）
function beatPhase(t) { const b = t * BEAT_BPM / 60; return 1 - (b - Math.floor(b)); }

// 确定性伪随机：同一 (x,y) 每帧得到同一值 —— 场景在拖动进度后依然稳定，不会"抖动"
function hash11(n) { const s = Math.sin(n * 127.1) * 43758.5453123; return s - Math.floor(s); }
function hash2(x, y) { return hash11(x * 57.31 + y * 131.77); }

// 时间格式：MM:SS.s（顶栏走时器 / 开发者面板都用它）
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

const DENSITY = ' .:-=+*#%@';   // 字符密度阶梯（暗 → 亮）
const CHAR_LUM = {};            // 字符 → 亮度 0..1，辉光与灰度映射共用
for (let i = 0; i < DENSITY.length; i++) CHAR_LUM[DENSITY[i]] = i / (DENSITY.length - 1);
// 半角块 / 特殊符号的亮度（进度条、边框、心形点缀）
CHAR_LUM['█'] = 1.0; CHAR_LUM['▓'] = 0.78; CHAR_LUM['▒'] = 0.55; CHAR_LUM['░'] = 0.34;
CHAR_LUM['♥'] = 1.0; CHAR_LUM['·'] = 0.16; CHAR_LUM['│'] = 0.34; CHAR_LUM['─'] = 0.34;
CHAR_LUM['┌'] = 0.34; CHAR_LUM['┐'] = 0.34; CHAR_LUM['└'] = 0.34; CHAR_LUM['┘'] = 0.34;
CHAR_LUM['├'] = 0.34; CHAR_LUM['┤'] = 0.34; CHAR_LUM['┬'] = 0.34; CHAR_LUM['┴'] = 0.34;
CHAR_LUM['∞'] = 0.9; CHAR_LUM['█'] = 1.0;
function lumOf(ch) {
  if (ch === ' ' || ch === null) return 0;
  const v = CHAR_LUM[ch];
  return v === undefined ? 0.62 : v;   // 未知字符（含中文）按中等亮度处理
}

// 中日韩全角判定：这类字符在等宽字体里占 2 格。
// 注意：♥ ∞ “” 等符号不算全角 —— 它们在 Courier New 里是半角字形，
// 若误判成 2 格，心形的 ♥ 轮廓会被撑成一格一点。
const CJK_RE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;
function charW(ch) { return CJK_RE.test(ch) ? 2 : 1; }
function strW(s) { let w = 0; for (let i = 0; i < s.length; i++) w += charW(s[i]); return w; }

/* ---------------------------------------------------------------------------
   [3] Frame —— 字符帧缓冲
   一帧就是"网格上每个格子写什么字符、什么颜色"。
   内部用扁平数组存储，热路径零对象分配。
   --------------------------------------------------------------------------- */
class Frame {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.ch = new Array(n);          // 字符
    this.co = new Array(n);          // 颜色字符串
    this.gl = new Uint8Array(n);     // 1 = 强制参与 shadowBlur 辉光
    this.clear();
  }
  idx(x, y) { return y * this.cols + x; }
  clear() {
    this.ch.fill(' ');
    this.co.fill(null);
    this.gl.fill(0);
  }
  // 写入字符（空格视为"不写"，避免把已有内容擦掉；需要擦除请用 erase）
  set(x, y, c, color, glow) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    if (c === undefined || c === null || c === '' || c === ' ') return;
    const i = y * this.cols + x;
    this.ch[i] = c; this.co[i] = color;
    this.gl[i] = glow ? 1 : 0;
  }
  erase(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.ch[i] = ' '; this.co[i] = null; this.gl[i] = 0;
  }
  // 写字符串（自动处理全角占 2 格），返回结束列
  text(x, y, str, color, glow) {
    let cx = x | 0;
    for (let k = 0; k < str.length; k++) {
      const c = str[k];
      if (c === ' ') { cx += 1; continue; }
      const w = charW(c);
      this.set(cx, y, c, color, glow);
      if (w === 2 && cx + 1 < this.cols) {
        const i = this.idx(cx + 1, y);          // 占位符：绘制时跳过，避免右半格重复出字
        this.ch[i] = '\u0000'; this.co[i] = color;
      }
      cx += w;
    }
    return cx;
  }
  centerText(y, str, color, glow) { return this.text(Math.floor((this.cols - strW(str)) / 2), y, str, color, glow); }
  rightText(xEnd, y, str, color, glow) { return this.text(xEnd - strW(str), y, str, color, glow); }
  hline(x0, x1, y, c, color) { for (let x = x0; x <= x1; x++) this.set(x, y, c, color); }
  vline(x, y0, y1, c, color) { for (let y = y0; y <= y1; y++) this.set(x, y, c, color); }
  fillRect(x, y, w, h, c, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, color);
  }
  // 用 ┌ ┐ └ ┘ ─ │ 画边框（可带内嵌标题）
  box(x, y, w, h, color, title, titleColor) {
    const x1 = x + w - 1, y1 = y + h - 1;
    this.hline(x + 1, x1 - 1, y, '─', color);
    this.hline(x + 1, x1 - 1, y1, '─', color);
    this.vline(x, y + 1, y1 - 1, '│', color);
    this.vline(x1, y + 1, y1 - 1, '│', color);
    this.set(x, y, '┌', color); this.set(x1, y, '┐', color);
    this.set(x, y1, '└', color); this.set(x1, y1, '┘', color);
    if (title) {
      const t = '┤ ' + title + ' ├';
      const tx = x + Math.max(2, Math.floor((w - strW(t)) / 2));
      // 先擦掉底下的 ─，否则标题里的空格会漏出边框，显示成 ┤─PREVIEW─├
      for (let i = 0; i < strW(t); i++) this.erase(tx + i, y);
      this.text(tx, y, t, titleColor || color);
    }
  }
}

/* ---------------------------------------------------------------------------
   [4] GlowEngine —— 荧光溢出（halation）
   真正的"辉光"分两层：
     a) 这里：亮字符周围的空格里补上极暗的 '.'，模拟荧光粉向邻近像素的物理溢出；
     b) compositeToMain：把整幅画面缩小再放大回来做真 Bloom。
   性能权衡：逐格扫描 200x72=14400 格太贵，所以按 4x4 区块抽样，
   单帧补字上限 900（约占总格数 6%），视觉上足够，fillText 调用量可控。
   --------------------------------------------------------------------------- */
const HALO_MAX = 900;
class GlowEngine {
  static process(frame) {
    const cols = frame.cols, rows = frame.rows;
    const C = CONFIG.colors;
    let added = 0;
    // 区块步进（随网格尺寸自适应，保证大网格也不爆量）
    const B = cols > 160 ? 4 : 3;
    for (let by = 1; by < rows - 1 && added < HALO_MAX; by += B) {
      for (let bx = 1; bx < cols - 1 && added < HALO_MAX; bx += B) {
        // 统计区块内的亮字符（密度 >= #，即 0.77 以上）
        let bright = 0;
        for (let y = by; y < by + B && y < rows; y++) {
          const row = y * cols;
          for (let x = bx; x < bx + B && x < cols; x++) {
            const c = frame.ch[row + x];
            if (c !== ' ' && c !== '\u0000' && lumOf(c) >= 0.77) { bright++; }
          }
        }
        if (bright < 2) continue;
        // 只给"紧贴亮字符"的空格补光晕：真实的荧光溢出只有 1 格左右，
        // 铺满整个 4x4 区块会把终端读数区（进度条、百分比）糊脏。
        for (let y = by; y < by + B && y < rows - 1 && added < HALO_MAX; y++) {
          const row = y * cols;
          for (let x = bx; x < bx + B && x < cols - 1 && added < HALO_MAX; x++) {
            if (frame.ch[row + x] !== ' ') continue;
            const l = lumOf(frame.ch[row + x - 1]), r = lumOf(frame.ch[row + x + 1]);
            const u = lumOf(frame.ch[row + x - cols]), d = lumOf(frame.ch[row + x + cols]);
            if (l < 0.77 && r < 0.77 && u < 0.77 && d < 0.77) continue;
            frame.ch[row + x] = '.';
            frame.co[row + x] = C.glowFar;
            added++;
          }
        }
      }
    }
    return frame;
  }
}

/* ---------------------------------------------------------------------------
   [5] 画布 / 渲染上下文
   双 Canvas 架构：
     offCanvas（隐藏）—— 逐字符 fillText，分辨率 = 网格列数x行数 x 每格像素
     mainCanvas（可见）—— 合成最终画面，分辨率 = 窗口尺寸 x DPR
   --------------------------------------------------------------------------- */
const mainCanvas = document.getElementById('mainCanvas');
const offCanvas = document.getElementById('offCanvas');
const mainCtx = mainCanvas.getContext('2d');
const offCtx = offCanvas.getContext('2d');
const stageEl = document.getElementById('stage');
const inputEl = document.getElementById('userInput');
const urlInputEl = document.getElementById('urlInput');
const fileInputEl = document.getElementById('fileInput');

// 合成用的离屏缓冲：两层 Bloom + 一层色偏
const bloomA = document.createElement('canvas');   // 1/4 缩放的廉价模糊（核心辉光）
const bloomB = document.createElement('canvas');   // 1/12 缩放（大范围光雾）
const tintCanvas = document.createElement('canvas'); // RGB 分离用的着色层
const bloomACtx = bloomA.getContext('2d');
const bloomBCtx = bloomB.getContext('2d');
const tintCtx = tintCanvas.getContext('2d');
const scanCanvas = document.createElement('canvas');  // 扫描线图案
const scanCtx = scanCanvas.getContext('2d');

let DPR = 1;
let FRAME = null;              // 复用的帧缓冲（热路径不新建对象）
let mvNeedsRedraw = true;
let scanPattern = null, scanDirty = true;
let vignette = null, vignetteDirty = true;

/* 帧级特效状态（故障 / 闪白 / 淡出 / 抖动 / 色偏染色） */
const FX = {
  t: 0,                 // 本阶段的累计秒数（只用于特效相位，不用于 MV 时间轴）
  glitch: 0,            // 当前故障剩余时长
  nextGlitch: 4,        // 下次随机故障的时间点
  flash: 0,
  fade: 0,              // 黑场强度 0..1
  shake: 0,             // 屏幕震动强度 0..1
  shakeT: 0,            // 本次震动已经过去的时间（驱动衰减振荡）
  tintColor: null,      // 染色（场景红闪）
  tintAlpha: 0,
  scanOffset: 0
};
function triggerGlitch(dur) {
  if (MOTION_REDUCED.matches || STYLE.current === 'CREAM') return;
  FX.glitch = Math.max(FX.glitch, dur || 0.15);
}
// 屏幕震动：整屏（画面层）位移，不是字形错位；强度取最大值，之后按平方衰减
function triggerShake(a) {
  if (MOTION_REDUCED.matches || STYLE.current === 'CREAM') return;
  if (a < FX.shake) return;
  FX.shake = clamp(a, 0, 1);
  FX.shakeT = 0;
}

function triggerFlash(alpha) {
  if (MOTION_REDUCED.matches || STYLE.current === 'CREAM') return;
  FX.flash = Math.max(FX.flash, Math.min(alpha, 0.12));
}
function triggerTint(color, alpha) { FX.tintColor = color; FX.tintAlpha = alpha; }

// 特效推进 + 随机故障调度（常态每 glitchInterval 秒一次，持续 0.15s）
function updateFX(dt) {
  FX.t += dt;
  FX.scanOffset = (FX.scanOffset + 30 * dt) % 4;      // 扫描线每秒下滑 30px
  FX.flash = Math.max(0, FX.flash - dt * 2.5);
  FX.fade = Math.max(0, FX.fade - dt * 1.4);
  FX.shake = Math.max(0, FX.shake - dt * 2.2);
  FX.shakeT += dt;
  FX.tintAlpha = Math.max(0, FX.tintAlpha - dt * 4.5);
  if (FX.glitch > 0) FX.glitch = Math.max(0, FX.glitch - dt);
  else if ((STAGE !== 'MV' || SONGS.current === 'execute') && FX.t > FX.nextGlitch) {
    triggerGlitch(0.15);
    triggerShake(0.26 + Math.random() * 0.22);
    FX.nextGlitch = FX.t + CONFIG.glitchInterval * (0.55 + Math.random() * 0.9);
  }
}

/* 网格初始化：任何网格尺寸变化（含开发者面板改 COLS/ROWS）都要走这里 */
function initGrid() {
  offCanvas.width = Math.max(64, Math.round(CONFIG.gridCols * CONFIG.cellW));
  offCanvas.height = Math.max(32, Math.round(CONFIG.gridRows * CONFIG.cellH));
  // 问题 1：模糊半径降为原来的 0.6 倍 → 下采样倍数由 4 / 12 收紧到 2.4 / 7.2
  bloomA.width = Math.max(2, Math.round(offCanvas.width / 2.4));
  bloomA.height = Math.max(2, Math.round(offCanvas.height / 2.4));
  bloomB.width = Math.max(2, Math.round(offCanvas.width / 7.2));
  bloomB.height = Math.max(2, Math.round(offCanvas.height / 7.2));
  tintCanvas.width = offCanvas.width;
  tintCanvas.height = offCanvas.height;
  FRAME = new Frame(CONFIG.gridCols, CONFIG.gridRows);
  mvNeedsRedraw = true;
  calibrateFont();
  scanDirty = true;
}

/* 字体标定：不同平台的等宽字体推进宽度不一样（Courier New 0.600em / Consolas 0.55em /
   Menlo 0.6em）。这里实测 10 个 M 的宽度，反推字号，让"1 字符 = 1 格"在任何机器上都成立，
   否则整行 ASCII 文本会随字数累积偏移。缩放比限制在 0.6~1.7 倍，避免字体解析失败时炸掉。 */
function calibrateFont() {
  try {
    offCtx.font = CONFIG.fontSize + 'px ' + CONFIG.fontFamily;
    const w = offCtx.measureText('MMMMMMMMMM').width / 10;
    if (!(w > 0) || !isFinite(w)) return;
    const target = offCanvas.width / CONFIG.gridCols;
    CONFIG.fontSize = clamp(CONFIG.fontSize * target / w, CONFIG.fontSize * 0.6, CONFIG.fontSize * 1.7);
  } catch (e) { /* 拿不到度量就沿用默认字号 */ }
}

/* 窗口尺寸变化：只重设 mainCanvas 后备存储，不动网格 */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);   // 上限 2：CRT 画面不需要 3x 像素
  const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
  const vh = window.innerHeight || document.documentElement.clientHeight || 720;
  mainCanvas.width = Math.max(320, Math.round(vw * DPR));
  mainCanvas.height = Math.max(240, Math.round(vh * DPR));
  mainCanvas.style.width = vw + 'px';
  mainCanvas.style.height = vh + 'px';
  vignetteDirty = true;
  mvNeedsRedraw = true;
  layoutInputBox();     // HTML 输入框要重新对齐到网格
}

/* 画面区域：按 offCanvas 宽高比做 letterbox 居中 */
function viewRect() {
  const vw = mainCanvas.width / DPR, vh = mainCanvas.height / DPR;
  const s = Math.min(vw / offCanvas.width, vh / offCanvas.height);
  const dw = offCanvas.width * s, dh = offCanvas.height * s;
  return { vw, vh, s, dx: (vw - dw) / 2, dy: (vh - dh) / 2, dw, dh };
}

/* 扫描线图案：每 2 像素一条半透明黑线，第二条更淡（隔行扫描质感） */
function buildScanPattern() {
  scanCanvas.width = 8; scanCanvas.height = 4;
  const a = clamp(CONFIG.scanlineAlpha, 0, 0.95);
  scanCtx.clearRect(0, 0, 8, 4);
  scanCtx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
  scanCtx.fillRect(0, 0, 8, 1);
  scanCtx.fillStyle = 'rgba(0,0,0,' + (a * 0.5).toFixed(3) + ')';
  scanCtx.fillRect(0, 2, 8, 1);
  scanPattern = mainCtx.createPattern(scanCanvas, 'repeat');
  scanDirty = false;
}

/* 暗角：中心透明 → 四周黑，强度由 STYLE.effects.vignetteAlpha 控制 */
function buildVignette() {
  const vw = mainCanvas.width / DPR, vh = mainCanvas.height / DPR;
  const rgb = hexToRgb(STYLE.current === 'CREAM' ? '#9C7956' : CONFIG.colors.black);
  const rgba = function (a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; };
  vignette = mainCtx.createRadialGradient(
    vw / 2, vh / 2, Math.min(vw, vh) * 0.26,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.74
  );
  vignette.addColorStop(0, rgba(0));
  vignette.addColorStop(0.62, rgba(0.30));
  vignette.addColorStop(1, rgba(1));
  vignetteDirty = false;
}
/* 胶片颗粒：预生成 4 张噪点图循环使用（零逐帧分配），0.03 透明度叠加 */
let grainPats = [];
function buildGrain() {
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (hash11(i * 0.731 + k * 17.3) * 255) | 0;
      img.data[i] = v; img.data[i + 1] = (v * 0.95) | 0; img.data[i + 2] = (v * 0.88) | 0; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    try { grainPats.push(mainCtx.createPattern(c, 'repeat')); } catch (e) { grainPats.push(null); }
  }
}
function drawGrain(ctx, v) {
  if (!grainPats.length) buildGrain();
  const index = MOTION_REDUCED.matches ? 0 : Math.floor(mvTime() * 3) % grainPats.length;
  const pat = grainPats[index];
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, v.vw, v.vh);
  ctx.restore();
}

/* ---------------------------------------------------------------------------
   [6] drawOffCanvas —— 把 Frame 画到离屏画布
   关键优化：同一行里"颜色相同且连续"的字符合并成一次 fillText。
   200x72 全屏最多 14400 格，实际非空格通常 2000~5000，
   合并后 fillText 调用约 300~900 次/帧，这是 60FPS 的前提。
   shadowBlur 只给密度 >= '#' 的亮字符，并且有帧预算（见 CONFIG.glowBudget）：
   辉光越强越卡，预算机制保证弱机上自动降级而不是掉帧。
   --------------------------------------------------------------------------- */
const RUNBUF = [];
function drawOffCanvas(frame) {
  const c = offCtx, W = offCanvas.width, H = offCanvas.height;
  const cw = W / frame.cols, chh = H / frame.rows;
  const cols = frame.cols, rows = frame.rows;
  const ch = frame.ch, co = frame.co;

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  c.fillStyle = CONFIG.colors.black || '#000000';
  c.fillRect(0, 0, W, H);                       // 底色 = 当前风格的"黑"
  c.font = CONFIG.fontSize + 'px ' + CONFIG.fontFamily;
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  let brightCount = 0;
  const glow = CONFIG.glowStrength * CONFIG.glowBoost;

  // ---- 第一遍：常规字符（按行做同色连续段批处理）----
  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    const cy = (y + 0.5) * chh;
    let runColor = null, runStart = 0, runLen = 0;
    for (let x = 0; x < cols; x++) {
      const cc = ch[row + x];
      const col = co[row + x];
      const isBlank = (cc === ' ' || cc === '\u0000');
      const wide = (!isBlank && charW(cc) === 2);
      // 非 ASCII 可见字符（─ │ ┌ █ ░ ♥ ∞ 中文…）一律单独居中绘制：
      // 这些字形不在 Courier New 里，浏览器会走字体回退，推进宽度未必等于 cellW，
      // 一旦混进"同色连续段"就会把整段推歪。单格 fillText 可彻底规避，
      // 代价是每帧多几百次绘制，相对 14400 格上限仍然很低。
      const solo = (!isBlank && !wide && !(cc >= '!' && cc <= '~'));
      if (glow > 0.02 && !isBlank && (frame.gl[row + x] || lumOf(cc) >= 0.77)) brightCount++;

      if (isBlank || wide || solo || col !== runColor) {
        if (runLen > 0) {                       // 冲刷上一段
          RUNBUF.length = runLen;
          c.fillStyle = runColor;
          c.fillText(RUNBUF.join(''), (runStart + runLen * 0.5) * cw, cy);
          runLen = 0;
        }
        if (wide) {                             // 全角字符单独居中在 2 格上
          c.fillStyle = col;
          c.fillText(cc, (x + 1) * cw, cy);
          runColor = null;
          continue;
        }
        if (solo) {                              // 制表符 / 方块 / 符号：单独居中在 1 格上
          c.fillStyle = col;
          c.fillText(cc, (x + 0.5) * cw, cy);
          runColor = null;
          continue;
        }
        if (isBlank) { runColor = null; continue; }
        runColor = col; runStart = x; RUNBUF[0] = cc; runLen = 1;
      } else {
        RUNBUF[runLen++] = cc;                  // 同色连续字符并入本段
      }
    }
    if (runLen > 0) {
      RUNBUF.length = runLen;
      c.fillStyle = runColor;
      c.fillText(RUNBUF.join(''), (runStart + runLen * 0.5) * cw, cy);
    }
  }

  // ---- 第二遍：亮字符加 shadowBlur，形成"荧光核心" ----
  const budget = Math.max(60, CONFIG.glowBudget | 0);
  if (brightCount > 0) {
    const stride = brightCount > budget ? Math.ceil(brightCount / budget) : 1;
    // 问题 1：光晕半径同样 ×0.6，亮字符周围只留一圈柔光，不再糊掉字形
    c.shadowBlur = Math.max(1, CONFIG.bloomRadius * 0.6 * glow * 1.7);
    let seen = 0, lastColor = null;
    for (let y = 0; y < rows; y++) {
      const row = y * cols, cy = (y + 0.5) * chh;
      for (let x = 0; x < cols; x++) {
        const cc = ch[row + x];
        if (cc === ' ' || cc === '\u0000') continue;
        if (lumOf(cc) < 0.77 && frame.gl[row + x] === 0) continue;
        seen++;
        if (stride > 1 && (seen % stride) !== 0) continue;   // 均匀抽稀，避免只有上半屏有辉光
        const col = co[row + x];
        if (col !== lastColor) { c.shadowColor = col; lastColor = col; }
        c.fillStyle = col;
        c.fillText(cc, (x + charW(cc) * 0.5) * cw, cy);
      }
    }
    c.shadowBlur = 0;
  }
}

/* 着色层：把单色画面乘上一个颜色，再用 destination-in 抠回字形轮廓。
   用于故障时的 RGB 分离（红/青偏移）。 */
function drawTinted(ctx, color, ox, alpha, dx, dy, dw, dh) {
  const t = tintCtx;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  t.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  t.drawImage(offCanvas, 0, 0);
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = color;
  t.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(offCanvas, 0, 0);                 // 只保留字形（纯黑区域乘完仍是黑，加色时不可见）
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(tintCanvas, dx + ox, dy, dw, dh);
}

/* ---------------------------------------------------------------------------
   [7] compositeToMain —— 合成最终画面（问题 1 修改点：整体提清晰度）
   顺序：清晰层 → 双层 Bloom(lighter) → 锐化(overlay) → RGB 分离 → 扫描线 → 暗角 → 闪白/黑场
   清晰度相关的四处调整：
     a) Bloom 的模糊半径 ×0.6：离屏模糊缓冲从 1/4、1/12 改为 1/2.4、1/7.2
        （下采样倍数越小，放大回来的模糊半径越小）；
     b) 清晰层 globalAlpha 固定 1.0，两层模糊合计只有 0.35（原来 0.52）；
     c) drawOffCanvas 里亮字符的 shadowBlur 半径同样 ×0.6；
     d) 最后再以 overlay 混合、0.15 透明度叠一层原图，做轻微锐化（提升对比边缘）。
   --------------------------------------------------------------------------- */
function compositeToMain() {
  const ctx = mainCtx;
  const v = viewRect();
  const C = CONFIG.colors;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = C.black || '#000000';         // letterbox 区域（机壳）
  ctx.fillRect(0, 0, v.vw, v.vh);

  const paper = STYLE.current === 'CREAM';
  const motion = !MOTION_REDUCED.matches;
  let dx = v.dx, dy = v.dy;
  if (motion && !paper && FX.shake > 0.002) {
    // 衰减振荡：两个正弦叠加成"咚"一下的撞击感，再掺一点随机让它不机械。
    // 只位移画面层（清晰层/Bloom/色偏），扫描线与暗角不动 —— 相当于显像管被敲了一下。
    const s = FX.shake * FX.shake;                       // 平方衰减，收尾自然
    const t = FX.shakeT;
    const rnd = hash11(Math.floor(t * 60) * 7.31) - 0.5;
    dx += (Math.sin(t * 47) * 0.62 + Math.sin(t * 113 + 1.7) * 0.38 + rnd * 0.5) * s * 20;
    dy += (Math.sin(t * 59 + 1.1) * 0.62 + Math.sin(t * 97 + 0.4) * 0.38 + rnd * 0.4) * s * 12;
  }

  // 1) 清晰层：完全不透明，保证字符主体锐利
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1.0;
  ctx.drawImage(offCanvas, dx, dy, v.dw, v.dh);

  // 2) Bloom：缩到 1/2.4 与 1/7.2 再放大回来（半径已降为原来的 0.6 倍），
  //    两层合计透明度 0.35，只做柔和扩散，不再糊屏。
  const glow = CONFIG.glowStrength * CONFIG.glowBoost;
  if (!paper && glow > 0.02) {
    const flick = motion ? 1 + (hash11(FX.t * 13.3) - 0.5) * 0.035 : 1;   // 荧光管轻微亮度抖动
    bloomACtx.globalCompositeOperation = 'copy';
    bloomACtx.drawImage(offCanvas, 0, 0, bloomA.width, bloomA.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.15 * glow * flick, 0, 0.30);
    ctx.drawImage(bloomA, dx, dy, v.dw, v.dh);

    bloomBCtx.globalCompositeOperation = 'copy';
    bloomBCtx.drawImage(offCanvas, 0, 0, bloomB.width, bloomB.height);
    ctx.globalAlpha = clamp(0.08 * glow * flick, 0, 0.18);
    ctx.drawImage(bloomB, dx, dy, v.dw, v.dh);
  }

  // 3) 轻微锐化：以 overlay 再叠一层原图，把被 Bloom 抬起来的暗部压回去
  //    （放在扫描线/暗角之前，避免把 CRT 覆盖层一起提亮）
  if (!paper) {                                  // 第二首保持柔和，不做锐化
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.15;
    ctx.drawImage(offCanvas, dx, dy, v.dw, v.dh);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 4) RGB 分离：红用 alert 色、另一路用 bright 色（不引入风格外颜色；
  //    纯黑白风格下 chromaticAberration = 0，自动退化为无色偏）
  if (motion && !paper && FX.glitch > 0 && CONFIG.chromaticAberration > 0.2) {
    const ab = CONFIG.chromaticAberration * (1 + FX.glitch * 1.5);
    drawTinted(ctx, C.alert, -ab, 0.55, dx, dy, v.dw, v.dh);
    drawTinted(ctx, C.bright, ab, 0.45, dx, dy, v.dw, v.dh);
  }

  // 5) 扫描线（缓慢下滑）—— 第二首没有扫描线
  if (!paper) {
    if (scanDirty || !scanPattern) buildScanPattern();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.save();
    if (motion) ctx.translate(0, FX.scanOffset);
    ctx.fillStyle = scanPattern;
    ctx.fillRect(0, -FX.scanOffset, v.vw, v.vh + 8);
    ctx.restore();
  } else {
    drawGrain(ctx, v);                   // 换成胶片颗粒
  }

  // 6) 暗角
  if (vignetteDirty || !vignette) buildVignette();
  ctx.globalAlpha = clamp(CONFIG.vignetteAlpha, 0, 1);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, v.vw, v.vh);
  ctx.globalAlpha = 1;

  // 7) 场景染色（故障红闪等）
  if (motion && FX.tintAlpha > 0.001 && FX.tintColor) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(FX.tintAlpha, 0, 1);
    ctx.fillStyle = FX.tintColor;
    ctx.fillRect(0, 0, v.vw, v.vh);
  }

  if (motion && !paper && FX.flash > 0.001) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = FX.flash;
    ctx.fillStyle = C.pure;
    ctx.fillRect(0, 0, v.vw, v.vh);
  }

  // 9) 黑场（阶段切换的淡出）
  ctx.globalCompositeOperation = 'source-over';
  if (FX.fade > 0.001) {
    ctx.globalAlpha = clamp(FX.fade, 0, 1);
    ctx.fillStyle = C.black || '#000000';
    ctx.fillRect(0, 0, v.vw, v.vh);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* 把 HTML 输入框对齐到指定的网格坐标（对话阶段的终端输入行） */
const INPUT_GRID = { x: 32, y: 30, w: 52 };      // 短字段：太长会横穿对话框
function placeInput(el, gx, gy, gw) {
  const v = viewRect();
  const cw = v.dw / CONFIG.gridCols, chh = v.dh / CONFIG.gridRows;
  el.style.left = (v.dx + gx * cw) + 'px';
  el.style.top = (v.dy + (gy - 0.2) * chh) + 'px';
  el.style.width = (gw * cw) + 'px';
  el.style.height = (chh * 1.5) + 'px';
  el.style.fontSize = Math.max(16, CONFIG.fontSize * (v.dw / CONFIG.gridCols) / CONFIG.cellW) + 'px';
  el.style.color = CONFIG.colors.bright || '#ffffff';
  el.style.borderBottomColor = CONFIG.colors.bright || '#ffffff';
}
function layoutInputBox() { placeInput(inputEl, INPUT_GRID.x, INPUT_GRID.y, INPUT_GRID.w); }
function showSongBox(on) {
  const el = document.getElementById('songInput');
  if (!el) return;
  if (!on) { el.style.display = 'none'; return; }
  const L = getL(), v = viewRect();
  placeInput(el, Math.floor(L.C / 2) - 22, L.R - 7, 44);
  el.style.display = 'block';
  try { el.focus(); } catch (e) { /* 忽略 */ }
}
function showInputBox(on) {
  if (on) { layoutInputBox(); inputEl.style.display = 'block'; }
  else { inputEl.style.display = 'none'; inputEl.value = ''; }
}

/* 颜色工具：只在"主色 → 暖白"渐变和故障色偏里用到，全部基于 STYLE.colors */
function hexToRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2] : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixColor(a, b, k) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(lerp(A[0], B[0], k)), g = Math.round(lerp(A[1], B[1], k)), bl = Math.round(lerp(A[2], B[2], k));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}
function COL() { return CONFIG.colors; }

/* ---------------------------------------------------------------------------
   [9] 5x5 点阵大字（用于 EXECUTE / LOVE / SYSTEM TERMINATED 等标题）
   每格 1/0，绘制时按 (xScale, yScale) 放大成字符块。
   --------------------------------------------------------------------------- */
const BIGFONT_SRC = {
  'A': '01110,10001,11111,10001,10001', 'B': '11110,10001,11110,10001,11110',
  'C': '01111,10000,10000,10000,01111', 'D': '11110,10001,10001,10001,11110',
  'E': '11111,10000,11110,10000,11111', 'F': '11111,10000,11110,10000,10000',
  'G': '01111,10000,10111,10001,01110', 'H': '10001,10001,11111,10001,10001',
  'I': '11111,00100,00100,00100,11111', 'J': '00111,00010,00010,10010,01100',
  'K': '10001,10010,11100,10010,10001', 'L': '10000,10000,10000,10000,11111',
  'M': '10001,11011,10101,10001,10001', 'N': '10001,11001,10101,10011,10001',
  'O': '01110,10001,10001,10001,01110', 'P': '11110,10001,11110,10000,10000',
  'Q': '01110,10001,10101,10010,01101', 'R': '11110,10001,11110,10010,10001',
  'S': '01111,10000,01110,00001,11110', 'T': '11111,00100,00100,00100,00100',
  'U': '10001,10001,10001,10001,01110', 'V': '10001,10001,10001,01010,00100',
  'W': '10001,10001,10101,11011,10001', 'X': '10001,01010,00100,01010,10001',
  'Y': '10001,01010,00100,00100,00100', 'Z': '11111,00010,00100,01000,11111',
  '0': '01110,10011,10101,11001,01110', '1': '00100,01100,00100,00100,01110',
  '2': '01110,10001,00110,01000,11111', '3': '11110,00001,00110,00001,11110',
  '4': '00010,00110,01010,11111,00010', '5': '11111,10000,11110,00001,11110',
  '6': '00110,01000,11110,10001,01110', '7': '11111,00001,00010,00100,01000',
  '8': '01110,10001,01110,10001,01110', '9': '01110,10001,01111,00010,01100',
  ' ': '00000,00000,00000,00000,00000', '.': '00000,00000,00000,00000,00100',
  ':': '00000,00100,00000,00100,00000', '/': '00001,00010,00100,01000,10000',
  '-': '00000,00000,11111,00000,00000', '=': '00000,11111,00000,11111,00000',
  '+': '00000,00100,01110,00100,00000', '!': '00100,00100,00100,00000,00100',
  '?': '01110,10001,00110,00000,00100', ',': '00000,00000,00000,00100,01000',
  '_': '00000,00000,00000,00000,11111', '*': '00000,01010,00100,01010,00000',
  '(': '00010,00100,00100,00100,00010', ')': '01000,00100,00100,00100,01000',
  '>': '10000,01000,00100,01000,10000', '<': '00001,00010,00100,00010,00001',
  '[': '00110,00100,00100,00100,00110', ']': '01100,00100,00100,00100,01100',
  ';': '00000,00100,00000,00100,01000', '#': '01010,11111,01010,11111,01010',
  '%': '10001,00010,00100,01000,10001', '@': '01110,10101,10111,10000,01110',
  '&': '01100,10010,01100,10010,01101'
};
const BIGFONT = {};
for (const k in BIGFONT_SRC) BIGFONT[k] = BIGFONT_SRC[k].split(',');

// 大字总宽（单位：点阵像素列），用于居中
function bigWidth(str, xs) { return (str.length * 5 + (str.length - 1)) * xs - xs; }

/* 居中绘制点阵大字。(cx, cy) 是字符网格中心，xs / ys 是每个点阵像素占的格数 */
function drawBig(frame, str, cx, cy, xs, ys, color, glow) {
  const s = str.toUpperCase();
  const totalW = bigWidth(s, xs);
  let x0 = Math.round(cx - totalW / 2);
  const y0 = Math.round(cy - (5 * ys) / 2);
  for (let i = 0; i < s.length; i++) {
    const g = BIGFONT[s[i]] || BIGFONT[' '];
    for (let gy = 0; gy < 5; gy++) {
      const row = g[gy];
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== '1') continue;
        const px = x0 + gx * xs, py = y0 + gy * ys;
        for (let a = 0; a < xs; a++) for (let b = 0; b < ys; b++) frame.set(px + a, py + b, '█', color, glow);
      }
    }
    x0 += (5 + 1) * xs;
  }
}

/* ---------------------------------------------------------------------------
   [10] 屏幕布局：网格坐标全部由 gridRows / gridCols 推导，
   开发者面板改网格尺寸时布局自动跟着变（72 行时正好落回需求给的 1/3/5/7/57/61/71 行）。
   --------------------------------------------------------------------------- */
function getL() {
  const C = CONFIG.gridCols, R = CONFIG.gridRows;
  if (SONGS.current === 'search') {
    // 第二首：没有侧栏 / 状态栏 / 进度条，只有顶部一行、中部画布、底部歌词
    return {
      C: C, R: R,
      top: 0, hdr: 1, chap: 3, rule: 4, sub: 6, sub2: 7,
      mainTop: 3, mainBot: Math.round(R * 0.72),
      status: R - 15, note: R - 14, wave: R - 12,
      lyr: R - 9, lyrCn: R - 6, hint: R - 2, bot: R - 1,
      panLx: 2, panRx: C - 28, panW: 26,
      cx0: 4, cx1: C - 5
    };
  }
  return {
    C: C, R: R,
    top: 0, hdr: 1, chap: 3, rule: 4, sub: 6, sub2: 7,
    mainTop: 9, mainBot: R - 17,
    status: R - 15, note: R - 14,
    wave: R - 12, lyr: R - 10, lyrCn: R - 7,
    hint: R - 2, bot: R - 1,
    panLx: 2, panRx: C - 28, panW: 26,
    cx0: 30, cx1: C - 31
  };
}

/* 顶栏：商标 / 走时器 / 章节 / 分隔线 */
function drawHeader(frame, t, total, sceneName) {
  const L = getL(), C = COL();
  const idx = Math.max(0, SCENE_KEYS.findIndex(s => s.name === sceneName));
  frame.text(3, L.hdr, 'WORLD.EXECUTE(ME);', C.pure, true);
  const state = AUDIO.paused ? 'PAUSED ' : 'RUNNING';
  frame.rightText(L.C - 4, L.hdr, fmtTime(t) + ' / ' + fmtTime(total) + '  ' + state, C.light);
  // 章节编号 + 标题（两侧加装饰）
  const chap = ('0' + (idx + 1)).slice(-2) + ' / ' + sceneName;
  frame.centerText(L.chap, chap, C.bright, true);
  const cw = strW(chap);
  const cx = Math.floor((L.C - cw) / 2);
  frame.text(cx - 8, L.chap, '──┤ ', C.dark);
  frame.text(cx + cw, L.chap, ' ├──', C.dark);
  // 分隔线：─ 与 · 交替
  for (let x = 2; x < L.C - 2; x++) frame.set(x, L.rule, (x % 5 === 0 ? '·' : '─'), x % 5 === 0 ? C.deep : C.dark);
}

/* 底部状态栏：POWER SUPPLY..........[ OK ] 形式，状态随场景变化 */
function drawProgressBar(frame, x, y, label, status, ratio) {
  const C = COL();
  const dots = '.'.repeat(Math.max(2, 22 - label.length));
  frame.text(x, y, label + dots, C.dark);
  const sx = x + label.length + dots.length;
  const col = status === 'FAIL' ? C.alert : (status === '--' ? C.dark : C.light);
  frame.text(sx, y, '[' + (status === 'OK' ? ' OK ' : status === 'FAIL' ? 'FAIL' : ' -- ') + ']', col, status === 'OK');
  if (ratio !== undefined) {
    const bx = sx + 6;
    const n = Math.round(clamp(ratio, 0, 1) * 10);
    frame.text(bx, y, '█'.repeat(n) + '░'.repeat(10 - n), C.mid);
  }
  return sx + 6;
}

/* 侧栏面板：┌ ┐ └ ┘ ─ │ + 滚动数据流 */
function drawPanel(frame, x, y, w, h, label, lines, color, labelColor) {
  frame.box(x, y, w, h, color, label, labelColor);
  for (let i = 0; i < lines.length && i < h - 2; i++) {
    frame.text(x + 2, y + 1 + i, String(lines[i]).slice(0, w - 4), color);
  }
}

/* 声波装饰线 + 歌词（全局时间轴 + 打字机）—— 问题 3 / 问题 4 修改点：
   1) 时间轴一律用"占整首歌总时长的百分比"，不再用场景内时间；
   2) t 是 MV 本地时间（audio.currentTime），
      开场白闪的 1 秒内直接 return，保证第一句歌词不会被闪白吃掉。 */
function drawLyrics(frame, t, total) {
  const L = getL(), C = COL();
  if (!(total > 0) || !(t > 0)) return;

  const norm = clamp(t / total, 0, 1);
  // 声波装饰线：相位来自音频时间，随节拍脉动
  const beat = t * BEAT_BPM / 60;
  const ph = 1 - (beat % 1);
  const n = L.C - 60;
  for (let i = 0; i < n; i++) {
    const amp = (Math.sin(i * 0.55 + beat * 1.2) * 0.5 + 0.5) * (0.5 + 0.5 * Math.pow(ph, 3));
    let c = null;
    if (amp > 0.88) c = '|'; else if (amp > 0.66) c = '='; else if (amp > 0.44) c = '-'; else if (amp > 0.22) c = '.';
    if (c) frame.set(30 + i, L.wave, c, amp > 0.8 ? C.bright : (amp > 0.5 ? C.mid : C.dark));
  }

  const lyr = CONFIG.lyrics;
  if (!lyr.length) return;
  let i = -1;
  for (let k = 0; k < lyr.length; k++) { if (norm + 1e-9 >= lyr[k].t) i = k; else break; }
  if (i < 0) return;
  const cur = lyr[i];
  if (!cur.en) return;                                  // 空行（结束标记）不画
  const age = (norm - cur.t) * total;                   // 本句已唱秒数
  const shown = clamp(Math.floor(age * 26), 0, cur.en.length);
  const enTxt = cur.en.slice(0, shown);
  const x0 = Math.floor((L.C - strW(cur.en)) / 2);
  const bp = Math.pow(beatPhase(t), 3);      // 节拍脉冲：重拍瞬间整句提亮
  frame.text(x0, L.lyr, enTxt, bp > 0.72 ? C.pure : C.bright, true);
  if (!MOTION_REDUCED.matches && (t * 2) % 1 < 0.62) frame.set(x0 + strW(enTxt), L.lyr, '█', bp > 0.5 ? C.pure : C.mid, true);
  if (cur.cn) {
    const shownCn = clamp(Math.floor(age * 21), 0, cur.cn.length);
    frame.text(Math.floor((L.C - strW(cur.cn)) / 2), L.lyrCn, cur.cn.slice(0, shownCn), C.mid);
  }
}

/* 底部提示行 */
function drawHints(frame, left, right) {
  const L = getL(), C = COL();
  if (left) frame.text(3, L.hint, left, C.dark);
  if (right) frame.rightText(L.C - 3, L.hint, right, C.dark);
}
