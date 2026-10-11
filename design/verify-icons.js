// 校验 export-icon.js 的产物：像素探针 + ICO/ICNS 结构 + 全部 PNG 尺寸。
// 用法：node design/verify-icons.js
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { drawIcon } from './export-icon.js';

const ROOT = import.meta.dirname;
const ICONS = path.join(ROOT, '..', 'src-tauri', 'icons');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const hex = (n) => '#' + n.toString(16).padStart(6, '0').toUpperCase();

// 1024 基准下的探针点（几何常量同 export-icon.js，色板为深色 token）
const PROBES = [
  { at: [512, 60], want: '#18181B', name: '底色（顶部留白）' },
  { at: [450, 512], want: '#18181B', name: '底色（控件与横条间空隙）' },
  { at: [240, 244], want: '#A1A1AA', name: '行1 待办描边（左缘中点）' },
  { at: [316, 244], want: '#18181B', name: '行1 待办框内空白' },
  { at: [243, 512], want: '#A1A1AA', name: '行2 描边仍为锌灰（左缘）' },
  { at: [286, 512], want: '#6366F1', name: '行2 进行中左半填充' },
  { at: [356, 512], want: '#18181B', name: '行2 右半保持空白' },
  { at: [395, 512], want: '#A1A1AA', name: '行2 描边仍为锌灰（右缘）' },
  { at: [245, 780], want: '#6366F1', name: '行3 已完成实心（勾左侧）' },
  { at: [283, 795], want: '#FFFFFF', name: '行3 白勾笔画' },
  { at: [560, 244], want: '#F4F4F5', name: '行1 横条（ink）' },
  { at: [560, 780], want: '#71717A', name: '行3 横条（faint 弱化）' },
  { at: [512, 378], want: '#27272A', name: '行分隔发丝线 1' },
  { at: [512, 646], want: '#27272A', name: '行分隔发丝线 2' },
  { at: [512, 6], want: '#303034', name: '外缘发丝线（顶边中点）' },
  { at: [512, 1017], want: '#303034', name: '外缘发丝线（底边中点）' },
];

const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');
drawIcon(ctx, 1024, 'rounded');
const data = ctx.getImageData(0, 0, 1024, 1024).data;
for (const { at: [x, y], want, name } of PROBES) {
  const i = (y * 1024 + x) * 4;
  const got = hex((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  ok(got === want, `探针 ${name} @(${x},${y}) 期望 ${want} 实得 ${got}`);
}
// 圆角外透明
const i = (4 * 1024 + 4) * 4;
ok(data[i + 3] === 0, '圆角外为透明');

// —— 全部 PNG 尺寸 ——
async function checkPng(file, size) {
  const img = await loadImage(fs.readFileSync(file));
  ok(img.width === size && img.height === size, `${path.relative(ROOT, file)} 为 ${size}x${size}（实得 ${img.width}x${img.height}）`);
}
const expect = {
  '32x32.png': 32, '64x64.png': 64, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512,
  'Square30x30Logo.png': 30, 'Square44x44Logo.png': 44, 'Square71x71Logo.png': 71, 'Square89x89Logo.png': 89,
  'Square107x107Logo.png': 107, 'Square142x142Logo.png': 142, 'Square150x150Logo.png': 150,
  'Square284x284Logo.png': 284, 'Square310x310Logo.png': 310, 'StoreLogo.png': 50,
};
for (const [f, n] of Object.entries(expect)) await checkPng(path.join(ICONS, f), n);
for (const f of fs.readdirSync(path.join(ICONS, 'ios'))) {
  const m = f.match(/(\d+(?:\.\d+)?)x/);
  if (f === 'AppIcon-512@2x.png') { await checkPng(path.join(ICONS, 'ios', f), 1024); continue; }
  if (!m) continue;
  await checkPng(path.join(ICONS, 'ios', f), Math.round(Number(m[1])));
}
for (const [d, n] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    await checkPng(path.join(ICONS, 'android', `mipmap-${d}`, f), n);
  }
}
await checkPng(path.join(ROOT, '..', 'public', 'apple-touch-icon.png'), 180);
await checkPng(path.join(ROOT, '..', 'icon-source.png'), 1024);
await checkPng(path.join(ROOT, 'app-icon-1024.png'), 1024);

// —— ICO 结构 ——
const ico = fs.readFileSync(path.join(ICONS, 'icon.ico'));
const icoCount = ico.readUInt16LE(4);
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
ok(icoCount === icoSizes.length, `ico 含 ${icoSizes.length} 个尺寸（实得 ${icoCount}）`);
for (let i = 0; i < icoCount; i++) {
  const e = 6 + 16 * i;
  const w = ico.readUInt8(e);
  const off = ico.readUInt32LE(e + 12);
  const png = ico.subarray(off, off + 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  ok(png && (w === 0 ? 256 : w) === icoSizes[i], `ico 条目 ${icoSizes[i]}px 为内嵌 PNG`);
}

// —— ICNS 结构 ——
const icns = fs.readFileSync(path.join(ICONS, 'icon.icns'));
ok(icns.subarray(0, 4).toString('ascii') === 'icns', 'icns 魔数正确');
ok(icns.readUInt32BE(4) === icns.length, 'icns 总长字段正确');
let p = 8; const types = [];
while (p < icns.length) {
  const t = icns.subarray(p, p + 4).toString('ascii');
  const len = icns.readUInt32BE(p + 4);
  types.push(t);
  p += len;
}
ok(p === icns.length, 'icns 分块连续无空洞');
ok(['ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'].every((t) => types.includes(t)), `icns 含全部类型（实得 ${types.join(',')}）`);

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
