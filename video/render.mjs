// Renders video.html to bill-ion-demo.mp4 frame by frame. Usage: node video/render.mjs [--stills 3,20,40]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openChrome } from './cdp.mjs';

const FPS = 30;
const here = import.meta.dirname;
const page = await openChrome({ width: 1920, height: 1080 });
try {
  await page.goto(pathToFileURL(path.join(here, 'video.html')).href, `Boolean(window.seek) && [...document.images].every((i) => i.complete && i.naturalWidth > 0)`);
  const duration = await page.evaluate('window.DURATION');
  // A screenshot reply can get lost in headless Chrome, so one retry; a second failure stops the render.
  const frame = async (t) => { await page.evaluate(`window.seek(${t})`); return page.shot().catch((e) => { console.log(`retry at ${t.toFixed(2)}s: ${e.message}`); return page.shot(); }); };
  const stills = process.argv[2] === '--stills' ? process.argv[3].split(',').map(Number) : null;
  if (stills) {
    for (const t of stills) fs.writeFileSync(path.join(here, 'shots', `still-${t}.jpg`), await frame(t));
  } else {
    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(here, 'bill-ion-demo.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = once(ffmpeg, 'close');
    for (let i = 0; i < duration * FPS; i++) {
      if (i % (FPS * 8) === 0) console.log(`frame ${i}/${duration * FPS}`);
      if (!ffmpeg.stdin.write(await frame(i / FPS))) await once(ffmpeg.stdin, 'drain');
    }
    ffmpeg.stdin.end();
    const [code] = await done;
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(`rendered ${duration}s`);
  }
} finally {
  page.close();
}
