// hsp-demo.js보다 먼저 돌며 /api/hsp-demo 요청을 브라우저 안의 데모 서버로 돌린다.
import { createHspBrowserServer } from './hsp-server.js';

const handle = createHspBrowserServer();
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/hsp-demo/')) return realFetch(input, init);
  const out = await handle(init.method ?? 'GET', url.pathname, init.headers?.['x-demo-user'], init.body);
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
};
