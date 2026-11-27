// 서버 없이 여는 HSP 모의 정산 데모. 서버의 라우트(src/payments/hsp-demo.mjs)를 브라우저 안에서 그대로 돌린다.
// 상태는 메모리에만 있어 새로고침하면 초안부터 다시 시작한다. 실제 인증·지갑·송금은 없다.
import { router } from '#src/http.mjs';
import { registerHspDemoRoutes } from '#src/payments/hsp-demo.mjs';

export function createHspBrowserServer({ gemini = null } = {}) {
  const routes = router();
  registerHspDemoRoutes(routes, {
    authenticate: async (req) => ({ uid: req.headers['x-demo-user'] }),
    clock: () => new Date(),
    gemini,
  });
  return async (method, pathname, actor, body = '') => {
    const hit = routes.match(method, pathname);
    if (!hit) return { status: 404, body: { error: 'NOT_FOUND' } };
    let sent;
    const res = {
      writeHead: (status) => { sent = { status }; },
      end: (text) => { sent.body = JSON.parse(text); },
    };
    try {
      const out = await hit.handler({ req: { headers: { 'x-demo-user': actor }, rawBody: body }, res, params: hit.params });
      return sent ?? { status: 200, body: structuredClone(out) };
    } catch (error) {
      return { status: error.status ?? 500, body: { error: error.message } };
    }
  };
}
