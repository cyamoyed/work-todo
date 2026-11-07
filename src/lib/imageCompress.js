/* work-todo — 图片压缩管线（DOM 层，浏览器与 WebView2 同代码）
 *
 * File/Blob → createImageBitmap（EXIF 方向校正）→ 最长边缩放 →
 * WebP（JPEG 兜底）data URL。预算见 constants（IMAGE_MAX_DIM / IMAGE_MAX_BYTES）；
 * GIF 不压缩（保留动图），超出预算直接拒绝。压缩失败抛 Error（中文原因，可直接 toast）。
 */

import { IMAGE_MAX_DIM, IMAGE_MAX_BYTES } from '../constants.js';

const ENCODE_ATTEMPTS = [
  { type: 'image/webp', quality: 0.75 },
  { type: 'image/webp', quality: 0.5 },
  { type: 'image/jpeg', quality: 0.6 },
];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      /* 非图片或解码失败 → 走 <img> 兜底，最终统一报错 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('不支持的图片文件'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawToCanvas(source, w, h, opaque) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** data URL 前缀后的 base64 体估算原始字节数。 */
function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  return i === -1 ? 0 : Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

async function encode(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type, quality });
    return blobToDataUrl(blob);
  }
  return canvas.toDataURL(type, quality);
}

/**
 * 压缩一张图片，返回 { src, w, h }（src 为 data URL，w/h 为缩放后显示尺寸）。
 * 超预算/不可读/非图片抛 Error。
 */
export async function compressImage(file) {
  if (!file) throw new Error('未选择图片');
  if (file.type === 'image/gif') {
    if (file.size > IMAGE_MAX_BYTES) throw new Error('GIF 图片超过大小限制（200KB）');
    return { src: await blobToDataUrl(file), w: null, h: null };
  }
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch (err) {
    throw err instanceof Error && err.message ? err : new Error('图片文件无法读取');
  }
  const natW = bitmap.width;
  const natH = bitmap.height;
  if (!natW || !natH) throw new Error('图片文件无法读取');
  const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(natW, natH));
  const w = Math.max(1, Math.round(natW * scale));
  const h = Math.max(1, Math.round(natH * scale));

  for (const attempt of ENCODE_ATTEMPTS) {
    const opaque = attempt.type === 'image/jpeg'; // JPEG 无 alpha，垫白底防黑块
    const dataUrl = await encode(drawToCanvas(bitmap, w, h, opaque), attempt.type, attempt.quality);
    if (dataUrlBytes(dataUrl) <= IMAGE_MAX_BYTES) {
      return { src: dataUrl, w, h };
    }
  }
  throw new Error('图片过大，压缩后仍超过预算（200KB）');
}
