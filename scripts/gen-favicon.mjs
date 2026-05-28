import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'favicon.svg'));

async function main() {
  const png512 = await sharp(svg).resize(512, 512).png().toBuffer();
  const png192 = await sharp(svg).resize(192, 192).png().toBuffer();
  const png180 = await sharp(svg).resize(180, 180).png().toBuffer();
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const png16 = await sharp(svg).resize(16, 16).png().toBuffer();

  writeFileSync(join(root, 'icon-512.png'), png512);
  writeFileSync(join(root, 'icon-192.png'), png192);
  writeFileSync(join(root, 'apple-touch-icon.png'), png180);

  writeFileSync(join(root, 'favicon-32.png'), png32);
  writeFileSync(join(root, 'favicon-16.png'), png16);

  let icoBuf = png32;
  try {
    const { default: toIco } = await import('to-ico');
    icoBuf = await toIco([png16, png32, png192]);
  } catch (e) {
    console.warn('to-ico unavailable, writing 32px PNG as favicon.ico');
  }
  writeFileSync(join(root, 'favicon.ico'), icoBuf);
  console.log('Generated icon-512.png, icon-192.png, apple-touch-icon.png, favicon.ico');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
