// work-todo 应用图标唯一源 —— 纯 node canvas 渲染，不再依赖浏览器。
// 设计「墨面台 · 三态清单」：把 styles.css 的行首状态勾选语言直接上图标——
//   待办   = 锌灰描边方框（.status-dot 用 --faint 描边）
//   进行中 = 锌灰描边 + 靛青左半填充（.status-toggle.st-in-progress 的硬切半填充）
//   已完成 = 靛青实心方框 + 白勾（.status-toggle.st-done）
// 三态读作「逐渐填满」；外加发丝线行分隔（--line）。
// 底色用深色面板（浅色版白底在系统深色模式下过亮刺眼）；强调色按系统深色
// 规则提亮为 #6366F1。全部颜色取自 styles.css 深色 token，无渐变、无新色相。
// 用法：node design/export-icon.js          # 全量导出
//       node design/export-icon.js --preview  # 只出 design/app-icon-preview.png 预览
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

// —— 色板：与 styles.css 深色 token 一一对应，改 token 时同步这里 ——
const C = {
  bg: '#18181B', // --panel（深色面板）
  border: '#303034', // --line-strong（图标外缘发丝线）
  hairline: '#27272A', // --line（行分隔）
  ink: '#F4F4F5', // --ink（横条）
  faint: '#71717A', // --faint（已完成横条弱化）
  muted: '#A1A1AA', // --muted（待办/进行中描边；细线需比弱化横条高一档对比）
  accent: '#6366F1', // --accent 深色填充（进行中半填充 / 已完成实心）
  white: '#FFFFFF', // --accent-on（白勾）
};

// 几何常量以 1024 画布为基准，按 size 等比缩放
const G = {
  corner: 232, // 圆角半径（≈22.7%，与旧图标一致的平台比例）
  borderW: 10, // 外缘发丝线宽
  box: 172, // 方形勾选控件边长（比旧圆 168 略大：方角视觉占位小）
  boxR: 16, // 方框小圆角（UI 里是直角，这里留一点抗锯齿量）
  glyphCx: 316, // 勾选控件圆心 x
  rowCy: [244, 512, 780], // 三行圆心 y：待办 / 进行中 / 已完成
  barX: 492, // 横条起点 x
  barH: 64, // 横条高（全圆角）
  barLen: [328, 328, 200], // 末条略短（已完成横条用 faint，对应 .is-done 弱化）
  stroke: 26, // 描边空框线宽
  checkStroke: 32, // 对勾笔画
  sepX: [204, 820], // 行分隔线范围（对齐内容块左右缘）
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 三态勾选控件：state = 'todo' | 'doing' | 'done'
function drawGlyph(ctx, cx, cy, state, s) {
  const half = (G.box / 2) * s;
  const x0 = cx - half;
  const y0 = cy - half;
  const r = G.boxR * s;
  const strokeHalf = (G.stroke / 2) * s;

  if (state === 'done') {
    roundRectPath(ctx, x0, y0, half * 2, half * 2, r);
    ctx.fillStyle = C.accent;
    ctx.fill();
    // 白勾：几何同 UI 的 45° 短臂 + 长臂，笔画圆头
    ctx.beginPath();
    ctx.moveTo(cx - 40 * s, cy + 2 * s);
    ctx.lineTo(cx - 8 * s, cy + 36 * s);
    ctx.lineTo(cx + 46 * s, cy - 36 * s);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = G.checkStroke * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    return;
  }

  if (state === 'doing') {
    // 左半实心（硬切，同 UI 的 50% 停止填充）：裁掉描边内缘圆角后只填左半，
    // 描边保持锌灰 —— 三态读作「空框 → 半填 → 实心」的递进
    const inner = G.stroke * s;
    ctx.save();
    roundRectPath(ctx, x0 + inner, y0 + inner, half * 2 - inner * 2, half * 2 - inner * 2, Math.max(r - inner, 0));
    ctx.clip();
    ctx.fillStyle = C.accent;
    ctx.fillRect(x0, y0, half, half * 2);
    ctx.restore();
  }

  // 描边空框：待办 / 进行中共用（进行中的半填充压在描边内缘之下）
  roundRectPath(ctx, x0 + strokeHalf, y0 + strokeHalf, half * 2 - strokeHalf * 2, half * 2 - strokeHalf * 2, Math.max(r - strokeHalf, 0));
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = G.stroke * s;
  ctx.stroke();
}

// mode:
//   'rounded'    — 圆角透明外角（桌面 png / ico / icns）
//   'flat'       — 满幅方底（iOS / Android legacy / 商店方标 / icon-source / apple-touch）
//   'round-clip' — 满幅圆裁（Android ic_launcher_round）
//   'foreground' — 仅内容、透明底、缩至自适应图标安全区（Android adaptive 前景层）
export function drawIcon(ctx, size, mode = 'rounded') {
  const s = size / 1024;
  ctx.clearRect(0, 0, size, size);

  if (mode === 'foreground') {
    // 内容整体缩到 58% 居中（108dp 网格的 66dp 安全区内）
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(0.58, 0.58);
    ctx.translate(-size / 2, -size / 2);
    drawContent(ctx, size, s);
    ctx.restore();
    return;
  }

  // 底
  ctx.save();
  if (mode === 'rounded') {
    roundRectPath(ctx, 0, 0, size, size, G.corner * s);
    ctx.clip();
  } else if (mode === 'round-clip') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size, size);
  drawContent(ctx, size, s);
  ctx.restore();

  // 外缘发丝线：只在圆角版画（满幅版会被平台裁角裁断）
  if (mode === 'rounded') {
    const inset = (G.borderW / 2) * s;
    roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, G.corner * s - inset);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = G.borderW * s;
    ctx.stroke();
  }
}

function drawContent(ctx, size, s) {
  // 行间发丝线
  ctx.strokeStyle = C.hairline;
  ctx.lineWidth = 8 * s;
  ctx.beginPath();
  ctx.moveTo(G.sepX[0] * s, ((G.rowCy[0] + G.rowCy[1]) / 2) * s);
  ctx.lineTo(G.sepX[1] * s, ((G.rowCy[0] + G.rowCy[1]) / 2) * s);
  ctx.moveTo(G.sepX[0] * s, ((G.rowCy[1] + G.rowCy[2]) / 2) * s);
  ctx.lineTo(G.sepX[1] * s, ((G.rowCy[1] + G.rowCy[2]) / 2) * s);
  ctx.stroke();

  // 三行清单：待办 / 进行中 / 已完成
  const states = ['todo', 'doing', 'done'];
  for (let i = 0; i < 3; i++) {
    const cy = G.rowCy[i] * s;
    drawGlyph(ctx, G.glyphCx * s, cy, states[i], s);
    const bh = G.barH * s;
    roundRectPath(ctx, G.barX * s, cy - bh / 2, G.barLen[i] * s, bh, bh / 2);
    ctx.fillStyle = i === 2 ? C.faint : C.ink; // 已完成横条弱化
    ctx.fill();
  }
}

function render(size, mode) {
  const canvas = createCanvas(size, size);
  drawIcon(canvas.getContext('2d'), size, mode);
  return canvas.toBuffer('image/png');
}

// —— ICO：PNG 内嵌多尺寸容器 ——
function buildIco(buffers) {
  const count = buffers.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  let offset = header.length;
  buffers.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); // 宽（0 = 256）
    header.writeUInt8(size >= 256 ? 0 : size, e + 1); // 高
    header.writeUInt8(0, e + 2); // 调色板数
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); // planes
    header.writeUInt16LE(32, e + 6); // bpp
    header.writeUInt32LE(buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, ...buffers.map(([, buf]) => buf)]);
}

// —— ICNS：PNG 载荷的 Apple 图标容器（10.7+ 支持 PNG） ——
function buildIcns(entries) {
  const chunks = entries.map(([type, buf]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + buf.length, 4);
    return Buffer.concat([head, buf]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

const ROOT = import.meta.dirname;
const ICONS = path.join(ROOT, '..', 'src-tauri', 'icons');
const PUBLIC = path.join(ROOT, '..', 'public');

function write(file, buf) {
  fs.writeFileSync(file, buf);
  console.log('written', path.relative(ROOT, file), `(${buf.length} bytes)`);
}

function writeRender(file, size, mode) {
  write(file, render(size, mode));
}

// Windows 商店方标 / StoreLogo：从文件名解析边长（StoreLogo.png = 50）
const SQUARE_SIZES = { StoreLogo: 50 };

function exportAll() {
  // —— 桌面圆角 png ——
  writeRender(path.join(ICONS, '32x32.png'), 32, 'rounded');
  writeRender(path.join(ICONS, '64x64.png'), 64, 'rounded');
  writeRender(path.join(ICONS, '128x128.png'), 128, 'rounded');
  writeRender(path.join(ICONS, '128x128@2x.png'), 256, 'rounded');
  writeRender(path.join(ICONS, 'icon.png'), 512, 'rounded');
  writeRender(path.join(ROOT, 'app-icon-1024.png'), 1024, 'rounded');

  // —— ico / icns ——
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  write(path.join(ICONS, 'icon.ico'), buildIco(icoSizes.map((n) => [n, render(n, 'rounded')])));
  const icnsMap = [
    ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 256], ['ic13', 128], ['ic14', 512],
  ];
  write(path.join(ICONS, 'icon.icns'), buildIcns(icnsMap.map(([t, n]) => [t, render(n, 'rounded')])));

  // —— Windows 商店方标（满幅） ——
  for (const file of fs.readdirSync(ICONS)) {
    const m = file.match(/^Square(\d+)x\1Logo\.png$/);
    if (!m) continue;
    writeRender(path.join(ICONS, file), Number(m[1]), 'flat');
  }
  writeRender(path.join(ICONS, 'StoreLogo.png'), SQUARE_SIZES.StoreLogo, 'flat');

  // —— iOS AppIcon（满幅，从现有文件名解析尺寸） ——
  const iosDir = path.join(ICONS, 'ios');
  for (const file of fs.readdirSync(iosDir)) {
    const m = file.match(/AppIcon-(\d+(?:\.\d+)?)x\1/);
    let px = m ? Math.round(Number(m[1])) : null;
    if (file === 'AppIcon-512@2x.png') px = 1024; // marketing 图，文件名不带 NxN 重复段
    if (!px) continue;
    writeRender(path.join(iosDir, file), px, 'flat');
  }

  // —— Android：legacy 方 / 圆 / 自适应前景 ——
  const dpi = { mdpi: 48, hdpi: 72, xhdpi: 96, 'xxhdpi': 144, 'xxxhdpi': 192 };
  for (const [name, px] of Object.entries(dpi)) {
    const dir = path.join(ICONS, 'android', `mipmap-${name}`);
    writeRender(path.join(dir, 'ic_launcher.png'), px, 'flat');
    writeRender(path.join(dir, 'ic_launcher_round.png'), px, 'round-clip');
    writeRender(path.join(dir, 'ic_launcher_foreground.png'), px, 'foreground');
  }

  // —— 网页 favicon 家族 ——
  writeRender(path.join(PUBLIC, 'apple-touch-icon.png'), 180, 'flat'); // iOS 自行裁圆角
  writeRender(path.join(ROOT, '..', 'icon-source.png'), 1024, 'flat'); // cargo tauri icon 的输入源
}

// 预览：亮 / 暗双底，512→16 检查小尺寸可读性（替代旧 app-icon.html）
function exportPreview() {
  const sizes = [512, 256, 128, 64, 48, 32, 24, 16];
  const pad = 28;
  const bandH = 512 + pad * 2;
  const width = sizes.reduce((w, px) => w + px + pad * 2, 0) + pad;
  const height = bandH * 2 + pad;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (const [band, bg] of [['light', '#FAFAFA'], ['dark', '#101013']]) {
    const y0 = band === 'light' ? pad : bandH + pad * 2;
    ctx.fillStyle = bg;
    ctx.fillRect(0, band === 'light' ? 0 : bandH + pad, width, bandH);
    let x = pad;
    for (const px of sizes) {
      const sub = createCanvas(px, px);
      drawIcon(sub.getContext('2d'), px, 'rounded');
      ctx.drawImage(sub, x, y0 + (512 - px) / 2);
      ctx.fillStyle = band === 'light' ? '#71717A' : '#A1A1AA';
      ctx.font = '22px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(px), x + px / 2, y0 + 512 + 14);
      x += px + pad * 2;
    }
  }
  write(path.join(ROOT, 'app-icon-preview.png'), canvas.toBuffer('image/png'));
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (process.argv.includes('--preview')) {
  exportPreview();
} else if (isCli) {
  exportAll();
  exportPreview();
}
