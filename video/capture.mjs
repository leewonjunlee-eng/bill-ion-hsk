// Captures the real mock demo at each step. Needs `npm start` running. Fails if a step does not give the expected reply.
import fs from 'node:fs';
import path from 'node:path';
import { openChrome } from './cdp.mjs';

const out = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(out, { recursive: true });
const page = await openChrome({ width: 1100, height: 900, scale: 1.5 });

// Screenshot of one element, in page coordinates.
async function element(selector, name) {
  const box = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
  fs.writeFileSync(path.join(out, `${name}.jpg`), await page.shot({ clip: { ...box, scale: 1 }, captureBeyondViewport: true }));
}
async function click(label, expected) {
  const status = await page.evaluate(`(async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b || b.disabled) return 'NO BUTTON'; b.click(); await new Promise((r) => setTimeout(r, 600)); return document.getElementById('status').textContent; })()`);
  if (!status.includes(expected)) throw new Error(`${label}: expected "${expected}", got "${status}"`);
}
const receipt = 'section[aria-labelledby="receipt-label"]';
const payment = 'section[aria-labelledby="payment-label"]';

try {
  await page.goto('http://127.0.0.1:4500/demo/hsp.html', `document.getElementById('status')?.textContent === 'Choose an action to verify.'`);
  await element(receipt, 'receipt-v1');
  await click("Apply B's dispute", 'Earlier approvals were cleared');
  await element('#mediation', 'agents');
  await element(receipt, 'receipt-v2');
  await click('Try ordering with the draft', 'No new order can be created for the draft');
  await element(payment, 'stale');
  await click('A approve', 'A approved');
  await click('B approve', 'B approved');
  await click('Prepare order for current split', 'has not approved');
  await element(payment, 'missing');
  await click('C approve', 'C approved');
  await click('Prepare order for current split', 'Mock order created');
  await element(payment, 'created');
  await element('.attempts', 'log');
  console.log('captured', fs.readdirSync(out).join(' '));
} finally {
  page.close();
}
