const endpoint = '/api/hsp-demo/rooms/shared-receipt';
const get = (id) => document.getElementById(id);
const messages = {
  STALE_SNAPSHOT: 'Blocked. No new order can be created for the draft.',
  APPROVALS_MISSING: 'Blocked. Someone has not approved the current split yet.',
  DISPUTE_OPEN: 'Blocked. Apply the dispute first.',
  SNAPSHOT_EXPIRED: 'This split has expired.',
  MEDIATION_UNUSABLE: 'The proposal cannot be turned into a payment, so the draft is kept.',
  ROOM_NOT_FOUND: 'The local mock payment feature is turned off.',
};
let state;
let busy = false;

const record = (text) => get('log').append(node('li', text));

async function request(path, actor, body) {
  const response = await fetch(endpoint + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-demo-user': actor, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (body) record(`${actor.toUpperCase()} · POST ${path} → ${response.status} ${response.ok ? 'allowed' : 'blocked ' + value.error}`);
  if (!response.ok) throw new Error(value.error ?? 'REQUEST_FAILED');
  return value;
}

function node(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function render() {
  const { current, previous, requiredApprovers, approvals, payment } = state;
  const before = previous ?? current;
  get('version').textContent = current.id.toUpperCase();
  const { mediation } = current;
  get('mediation').hidden = !mediation;
  for (const key of ['claim', 'counter', 'summary']) get(key).textContent = mediation?.[key] ?? '';
  get('source').textContent = !mediation ? '' : (mediation.source === 'rules'
    ? 'Mediation: rule mode (no AI model call)' : `Mediation model: ${mediation.source}`) + ' · The agent only proposes. Payment needs approval from all three.';
  get('lines').replaceChildren(...current.lines.map((line) => {
    const row = document.createElement('li');
    row.append(node('strong', `${line.label} · ${line.time ?? ''}`), node('span', `${line.halfUnits / 2} units · ${line.members.join(', ').toUpperCase()}`));
    if (line.reason) row.append(node('small', line.reason));
    return row;
  }));
  get('shares').replaceChildren(...requiredApprovers.map((actor) => {
    const row = document.createElement('tr');
    const name = node('th', actor.toUpperCase());
    name.scope = 'row';
    const latest = node('td', current.shares[actor] / 2);
    if (current.shares[actor] !== before.shares[actor]) latest.className = 'changed';
    row.append(name, node('td', before.shares[actor] / 2), latest);
    return row;
  }));
  get('approvals').replaceChildren(...requiredApprovers.map((actor) => {
    const approved = approvals.includes(actor);
    const button = node('button', `${actor.toUpperCase()} ${approved ? 'approved' : 'approve'}`);
    button.type = 'button';
    button.disabled = busy || approved || Boolean(payment);
    button.addEventListener('click', () => act(
      () => request(`/snapshots/${current.id}/approvals`, actor, { snapshotHash: current.hash }),
      `${actor.toUpperCase()} approved ${current.id.toUpperCase()}.`,
    ));
    return button;
  }));
  get('amount').textContent = (Number(current.payment.atomicAmount) / 10 ** current.payment.decimals).toFixed(6) + ' MOCK';
  get('revise').disabled = busy || Boolean(previous) || Boolean(payment);
  get('pay').disabled = busy || Boolean(payment);
  get('stale').disabled = busy || !previous;
  const order = get('order');
  order.hidden = !payment;
  order.textContent = payment
    ? `${payment.orderId ? 'Mock order created · ' + payment.orderId : 'Reservation ' + payment.status} · No real transfer`
    : '';
}

async function act(action, message) {
  if (busy || !state) return;
  busy = true;
  render();
  try {
    const result = await action();
    get('status').textContent = typeof message === 'function' ? message(result) : message;
  } catch (error) {
    get('status').textContent = messages[error.message] ?? `The request failed. (${error.message})`;
  } finally {
    try {
      state = await request('', 'a');
    } catch {
      get('status').textContent = 'Could not reload the status. Please refresh the page.';
      return;
    }
    busy = false;
    render();
  }
}

const references = (snapshot) => ({ snapshotId: snapshot.id, snapshotHash: snapshot.hash });
const paymentFor = (snapshot) => ({ ...references(snapshot), edgeId: snapshot.payment.id });
get('revise').addEventListener('click', () => act(
  () => request('/revise', 'b', references(state.current)),
  'B’s dispute was applied. Earlier approvals were cleared.',
));
get('pay').addEventListener('click', () => act(
  () => request('/payments', 'b', paymentFor(state.current)),
  (payment) => payment.status === 'ORDER_CREATED' ? 'Mock order created.' : 'The order result is unknown, so the existing reservation is kept.',
));
get('stale').addEventListener('click', () => act(
  () => request('/payments', 'b', paymentFor(state.previous)),
  'A request for the old split was accepted. Check the result.',
));

try {
  state = await request('', 'a');
  render();
  get('status').textContent = state.payment ? 'Loaded the existing mock order.' : 'Choose an action to verify.';
} catch (error) {
  get('status').textContent = messages[error.message] ?? 'Cannot reach the local mock settlement server.';
}
