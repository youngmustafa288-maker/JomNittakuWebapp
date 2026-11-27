// Cleans up uploaded logos so they sit on any background.
// If the logo has a plain background (e.g. white box around it), that
// background is made see-through. Only colour connected to the edges is
// removed, so white parts inside the logo (a white ball, white text in a
// badge) are kept. Then the empty space around the logo is trimmed.
// Photos and logos that are already see-through are left as they are.

const MAX_SIDE = 1200;
const TOLERANCE = 42;   // colour distance treated as "background"
const SOFT_EDGE = 95;   // up to here, edge pixels fade instead of cutting hard
const MIN_BORDER_SHARE = 0.6; // the edge must be mostly one colour

function distance(data, i, bg) {
  const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Finds the main colour around the edge. Returns null if the edge isn't
// mostly one colour, or the image already has see-through edges.
export function findPlainBackground({ data, width, height }) {
  const counts = new Map();
  let total = 0, clear = 0;
  const visit = (x, y) => {
    const i = (y * width + x) * 4;
    total += 1;
    if (data[i + 3] < 200) { clear += 1; return; }
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    const entry = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    entry.n += 1; entry.r += data[i]; entry.g += data[i + 1]; entry.b += data[i + 2];
    counts.set(key, entry);
  };
  for (let x = 0; x < width; x += 1) { visit(x, 0); visit(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { visit(0, y); visit(width - 1, y); }
  if (!total || clear / total > 0.3) return null;
  let best = null;
  counts.forEach(entry => { if (!best || entry.n > best.n) best = entry; });
  if (!best || best.n / total < MIN_BORDER_SHARE) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

// Makes the plain background see-through (in place). Returns true if changed.
export function removePlainBackground(image) {
  const { data, width, height } = image;
  const bg = findPlainBackground(image);
  if (!bg) return false;
  const removed = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const p = y * width + x;
    if (removed[p]) return;
    const i = p * 4;
    if (data[i + 3] < 10 || distance(data, i, bg) <= TOLERANCE) { removed[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width, y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  let changed = false;
  for (let p = 0; p < removed.length; p += 1) {
    const i = p * 4;
    if (removed[p]) { if (data[i + 3]) changed = true; data[i + 3] = 0; continue; }
    // Soft edge: pixels touching the removed area that are close to the
    // background colour fade out, so there's no white fringe.
    const x = p % width, y = (p - x) / width;
    const touches = (x > 0 && removed[p - 1]) || (x < width - 1 && removed[p + 1])
      || (y > 0 && removed[p - width]) || (y < height - 1 && removed[p + width]);
    if (!touches) continue;
    const d = distance(data, i, bg);
    if (d < SOFT_EDGE) {
      const keep = (d - TOLERANCE) / (SOFT_EDGE - TOLERANCE);
      data[i + 3] = Math.round(data[i + 3] * Math.max(0, Math.min(1, keep)));
      changed = true;
    }
  }
  return changed;
}

// The box around everything that isn't see-through, with a little padding.
export function visibleBounds({ data, width, height }) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03);
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unable to read this image.")); };
    img.src = url;
  });
}

// Returns a cleaned PNG file, or the original file if nothing needed doing
// (or the browser can't process it). Never throws.
export async function cleanLogoFile(file) {
  try {
    if (!file?.type?.startsWith("image/") || /svg|gif/.test(file.type)) return file;
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const changed = removePlainBackground(image);
    const box = visibleBounds(image);
    if (!box) return file;
    const trims = box.width < width * 0.97 || box.height < height * 0.97;
    if (!changed && !trims) return file;
    ctx.putImageData(image, 0, 0);
    const out = document.createElement("canvas");
    out.width = box.width; out.height = box.height;
    out.getContext("2d").drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    const blob = await new Promise(resolve => out.toBlob(resolve, "image/png"));
    if (!blob) return file;
    const name = `${(file.name || "logo").replace(/\.[^.]+$/, "")}.png`;
    return new File([blob], name, { type: "image/png" });
  } catch (error) {
    console.warn("Logo cleanup skipped", error);
    return file;
  }
}
