// Minimal headless Chrome driver over the DevTools protocol (Node 22 built-ins only).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function openChrome({ width, height, scale = 1 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'billion-video-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank']);
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20_000);
    proc.stderr.on('data', (chunk) => {
      const hit = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(chunk));
      if (hit) { clearTimeout(timer); resolve(hit[1]); }
    });
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method}: no reply in 30s`)); }, 30_000);
    waiting.set(id, (m) => { clearTimeout(timer); return m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text);
    return out.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  return {
    send,
    evaluate,
    async goto(url, ready) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (await evaluate(ready).catch(() => false)) return;
      }
      throw new Error(`Page never became ready: ${url}`);
    },
    async shot(params = {}) {
      return Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, ...params })).data, 'base64');
    },
    close() { socket.close(); proc.kill(); },
  };
}
