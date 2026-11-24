'use strict';

/* Normalized silhouettes. Each layer selects a glyph density and a palette color. */
const ASCII_SHAPES = {
  eggplant(x, y) {
    if (insideEllipse(x + 0.24 + y * 0.45, y + 0.79, 0.09, 0.24)) return 4;
    const neck = insideEllipse(x + 0.27 + y * 0.24, y + 0.27, 0.29, 0.61);
    const bulb = insideEllipse(x - 0.21 * y, y - 0.28, 0.66, 0.66);
    if (!neck && !bulb) return 0;
    if (y < -0.51 + 0.11 * Math.cos(x * 21)) return 4;
    return x < -0.15 + y * 0.2 ? 1 : x > 0.26 ? 3 : 2;
  },
  tomato(x, y) {
    const field = x * x / 0.86 + (y - 0.15) ** 2 / 0.59;
    const leaf = (y > -0.67 && y < -0.49 - Math.abs(x) * 0.16 && Math.abs(x) < 0.57)
      || insideEllipse(x - 0.07 + y * 0.09, y + 0.76, 0.11, 0.23);
    if (leaf) return 4;
    if (field > 1) return 0;
    const crease = Math.abs(x + Math.sin(y * 2) * 0.10) > 0.56;
    return crease ? 3 : insideEllipse(x + 0.34, y + 0.16, 0.22, 0.28) ? 1 : 2;
  },
  cat(x, y) {
    const u = Math.abs(x);
    const ear = y < -0.22 && y > -0.99 + Math.abs(u - 0.70) * 2.5;
    const face = insideEllipse(x, y - 0.12, 0.90, 0.77);
    if (!face && !ear) return 0;
    if (ear && y < -0.34) return Math.abs(u - 0.69) < 0.12 ? 4 : 2;
    if (insideEllipse(u - 0.37, y - 0.02 + (u - 0.37) * 0.25, 0.23, 0.13)) {
      return Math.abs(u - 0.37) < 0.055 ? 3 : 4;
    }
    if (y > 0.25 && y < 0.41 - u * 0.48) return 4;
    if (insideEllipse(u - 0.17, y - 0.48, 0.28, 0.24)) return 1;
    const stripes = y < -0.20 && u < 0.38 && Math.abs((u + y * 0.14) % 0.17) < 0.069
      || u > 0.56 && Math.abs((y - u * 0.63) % 0.28) < 0.088;
    return stripes ? 3 : 2;
  },
  dog(x, y) {
    const u = Math.abs(x);
    if (insideEllipse(u - 0.73 - y * 0.1, y + 0.12, 0.28, 0.75) && u > 0.55) return 3;
    const face = insideEllipse(x, y + 0.06, 0.70, 0.77);
    const muzzle = insideEllipse(x, y - 0.49, 0.52, 0.44);
    if (!face && !muzzle) return 0;
    if (insideEllipse(u - 0.31, y + 0.13, 0.11, 0.12) || insideEllipse(x, y - 0.39, 0.23, 0.14)) return 4;
    return muzzle ? 1 : 2;
  },
  flower(x, y) {
    const headY = y + 0.42;
    const radius = Math.hypot(x, headY * 1.13);
    const theta = Math.atan2(headY * 1.13, x);
    if (radius < 0.17) return 4;
    if (radius < 0.49 + 0.16 * Math.cos(theta * 7)) return radius < 0.30 ? 3 : 2;
    if (y > 0 && Math.abs(x - Math.sin(y * 3) * 0.12) < 0.038) return 3;
    if (insideEllipse(x + 0.21 + (y - 0.37) * 0.85, y - 0.37, 0.26, 0.12)
      || insideEllipse(x - 0.22 - (y - 0.65) * 0.9, y - 0.65, 0.26, 0.12)) return 2;
    return 0;
  },
  human(x, y) {
    if (insideEllipse(x, y + 0.54, 0.28, 0.42)) return y < -0.68 ? 3 : 2;
    if (Math.abs(x) < 0.16 && y > -0.35 && y < 0.24) return 1;
    if (y > 0.1 && y < 0.68 && Math.abs(x) < 0.77 * Math.sqrt((y - 0.10) / 0.58)) {
      return Math.abs(x) < 0.17 && y < 0.38 ? 1 : 3;
    }
    if (y >= 0.68 && y < 0.98 && Math.abs(x) < 0.77 - (y - 0.68) * 0.50) return 2;
    return 0;
  },
  heart(x, y) {
    const u = x * 1.18;
    const v = -y * 1.26 + 0.10;
    const field = (u * u + v * v - 1) ** 3 - u * u * v ** 3;
    if (field > 0) return 0;
    return field < -0.38 ? 2 : 3;
  }
};

function insideEllipse(x, y, rx, ry) {
  return (x / rx) ** 2 + (y / ry) ** 2 <= 1;
}

// Cache the character-space silhouette. Motion repositions cells without resampling the artwork.
const ASCII_RASTERS = new Map();

function asciiRaster(name, width, height) {
  const rx = Math.max(2, Math.round(width / 2));
  const ry = Math.max(2, Math.round(height / 2));
  const key = name + ':' + rx + ':' + ry;
  if (ASCII_RASTERS.has(key)) return ASCII_RASTERS.get(key);
  const sample = ASCII_SHAPES[name];
  const cells = [];
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const nx = x / rx, ny = y / ry;
      const layer = sample(nx, ny);
      if (!layer) continue;
      const edge = !sample(nx - 1 / rx, ny) || !sample(nx + 1 / rx, ny)
        || !sample(nx, ny - 1 / ry) || !sample(nx, ny + 1 / ry);
      cells.push({ x, y, nx, ny, layer, edge, seed: hash2(x + layer, y) });
    }
  }
  if (ASCII_RASTERS.size >= 64) ASCII_RASTERS.delete(ASCII_RASTERS.keys().next().value);
  ASCII_RASTERS.set(key, cells);
  return cells;
}

function drawAsciiShape(frame, name, cx, cy, width, height, options = {}) {
  const { progress = 1, mode = 'crt', phase = 0, bounds, fracture = 0, tint } = options;
  const C = COL();
  const palette = [C.deep, C.dark, C.mid, tint || C.bright, C.alert];
  const strokes = mode === 'paper' ? ['.', ',', ':', '-', '=', '*', '@'] : ['.', ':', '+', '=', '#', '%', '@'];
  const x0 = bounds ? bounds.cx0 : 0, x1 = bounds ? bounds.cx1 : frame.cols - 1;
  const y0 = bounds ? bounds.mainTop : 0, y1 = bounds ? bounds.mainBot : frame.rows - 1;
  const crt = mode === 'crt';
  for (const cell of asciiRaster(name, width, height)) {
    const { x, y, nx, ny, layer, edge, seed } = cell;
    const delay = crt ? (ny + 1) * 0.34 + seed * 0.22 : Math.hypot(nx, ny) * 0.50 + seed * 0.23;
    if (progress < delay) continue;
    const seam = Math.sin(ny * 12) * 0.10 + ny * 0.11;
    const side = nx < seam ? -1 : 1;
    if (fracture > 0 && Math.abs(nx - seam) < fracture * 0.13) continue;
    const px = Math.round(cx + x + side * fracture * (7 + seed * 3));
    const py = Math.round(cy + y + (side === 1 ? fracture * 3 : 0));
    if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    const front = crt && progress < 0.95 && progress - delay < 0.09;
    const fleck = seed > 0.79;
    const density = edge ? 5 : Math.min(6, layer + (fleck ? 1 : 0));
    frame.set(px, py, strokes[front ? 6 : density], front ? C.pure : palette[edge ? Math.max(layer, 3) : layer],
      crt && (front || (edge && fleck)));
  }
  if (name !== 'cat' && name !== 'dog') return;
  // Whiskers and speech stay legible outside the ink or phosphor silhouette.
  const whiskers = name === 'cat' && progress > 0.68;
  if (whiskers) {
    for (const side of [-1, 1]) for (let i = 0; i < width * 0.18; i++) {
      const px = Math.round(cx + side * (width * 0.39 + i));
      const py = cy + Math.round(height * 0.10);
      if (px < x0 || px > x1) continue;
      frame.set(px, py + Math.round(i / 4), '-', C.dark);
      frame.set(px, py - Math.round(i / 4) - 1, '-', C.dark);
    }
  }
  if (phase > 0) {
    phosphorPulse(frame, cx + width * 0.46, cy + height * 0.1, Math.max(4, width * 0.35), phase, C.alert, bounds);
  }
}

function asciiLine(frame, x0, y0, x1, y1, glyph, color, glow = false, bounds) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(lerp(x0, x1, i / steps));
    const y = Math.round(lerp(y0, y1, i / steps));
    if (bounds && (x < bounds.cx0 || x > bounds.cx1 || y < bounds.mainTop || y > bounds.mainBot)) continue;
    frame.set(x, y, glyph, color, glow);
  }
}

function phosphorPulse(frame, cx, cy, width, phase, color, bounds) {
  for (let i = 0; i < 3; i++) {
    const p = (phase + i / 3) % 1;
    const r = 2 + width * p;
    for (let j = -3; j <= 3; j++) {
      const a = j * 0.17;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.65);
      if (bounds && (x > bounds.cx1 || y < bounds.mainTop || y > bounds.mainBot)) continue;
      frame.set(x, y, p < 0.38 ? ')' : '.', color);
    }
  }
}

function drawPlot(frame, at, reveal, head, bounds) {
  const C = COL();
  const steps = 224;
  let last = at(0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const next = at(t);
    const leading = t <= head && head - t < 0.07;
    const on = t <= reveal;
    asciiLine(frame, ...last, ...next, leading ? '@' : on ? '=' : '.', leading ? C.pure : on ? C.bright : C.dark,
      leading && i % 4 === 0, bounds);
    last = next;
  }
  const [x, y] = at(head);
  if (x >= bounds.cx0 && x <= bounds.cx1 && y >= bounds.mainTop && y <= bounds.mainBot) {
    frame.set(Math.round(x), Math.round(y), 'O', C.alert, true);
  }
}
