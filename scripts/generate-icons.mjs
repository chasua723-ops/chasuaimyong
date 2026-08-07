import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const BG = '#fbfaf7';
const FG = '#0f9488';

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = FG;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.58)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillText('中', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', drawIcon(192));
writeFileSync('public/icon-512.png', drawIcon(512));
writeFileSync('public/apple-touch-icon.png', drawIcon(180));

for (const name of ['orange', 'terracotta', 'cream', 'deepteal']) {
  try { rmSync(`public/icon-preview-${name}.png`); } catch {}
}

console.log('Icons generated (cream/teal).');
