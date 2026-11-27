// Captures the real mock demo at phone size, one full-page image per step, plus tap and scroll positions.
// Needs `npm start` running. Fails if a step does not give the expected reply.
import fs from 'node:fs';
import path from 'node:path';
import { openChrome } from './cdp.mjs';

const out = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(out, { recursive: true });
const WIDTH = 390;
const page = await openChrome({ width: WIDTH, height: 800, scale: 3 }); // 844pt phone minus the 44pt status bar
const shots = {};

async function snap(name) {
  const meta = await page.evaluate(`(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + scrollY + r.height / 2), top: Math.round(r.y + scrollY) }; };
    const buttons = Object.fromEntries([...document.querySelectorAll('button')].map((b) => [b.textContent, box(b)]));
    const find = (s) => { const el = document.querySelector(s); return el && !el.hidden ? box(el).top : null; };
    return { height: document.documentElement.scrollHeight, buttons, top: {
      mediation: find('#mediation'), receipt: find('section[aria-labelledby="receipt-label"]'), shares: find('#shares'),
      payment: find('section[aria-labelledby="payment-label"]'), status: find('#status'), log: find('.attempts') } };
  })()`);
  const image = await page.shot({ clip: { x: 0, y: 0, width: WIDTH, height: meta.height, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(path.join(out, `${name}.jpg`), image);
  shots[name] = meta;
}
async function click(label, expected) {
  const status = await page.evaluate(`(async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b || b.disabled) return 'NO BUTTON'; b.click(); await new Promise((r) => setTimeout(r, 600)); return document.getElementById('status').textContent; })()`);
  if (!status.includes(expected)) throw new Error(`${label}: expected "${expected}", got "${status}"`);
}

try {
  await page.goto('http://127.0.0.1:4500/demo/hsp.html', `document.getElementById('status')?.textContent === 'Choose an action to verify.'`);
  await snap('start');
  await click("Apply B's dispute", 'Earlier approvals were cleared');
  await snap('revised');
  await click('Try ordering with the draft', 'No new order can be created for the draft');
  await snap('stale');
  await click('A approve', 'A approved');
  await snap('a-ok');
  await click('B approve', 'B approved');
  await snap('ab-ok');
  await click('Prepare order for current split', 'has not approved');
  await snap('missing');
  await click('C approve', 'C approved');
  await snap('abc-ok');
  await click('Prepare order for current split', 'Mock order created');
  await snap('created');
  fs.writeFileSync(path.join(out, 'meta.js'), `window.SHOTS = ${JSON.stringify(shots)};\n`);
  console.log('captured', Object.keys(shots).join(' '));
} finally {
  page.close();
}
