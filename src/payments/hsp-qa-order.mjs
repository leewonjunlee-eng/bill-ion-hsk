import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const networks = new Map([[133, 'hashkey-testnet'], [11155111, 'sepolia']]);
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const address = /^0x[0-9a-f]{40}$/i;
const digest = /^0x[0-9a-f]{64}$/i;

export function openHspQaOrders(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS hsp_qa_orders (
      revision TEXT PRIMARY KEY,
      request_id TEXT UNIQUE NOT NULL,
      state TEXT NOT NULL,
      flow_id TEXT UNIQUE,
      data TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS hsp_qa_one_order_per_room
    ON hsp_qa_orders (json_extract(data, '$.roomId'));
    CREATE TABLE IF NOT EXISTS hsp_qa_current_revision (
      room_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      commitment TEXT NOT NULL,
      roster TEXT NOT NULL
    )
  `);
  const select = db.prepare('SELECT data FROM hsp_qa_orders WHERE revision = ?');
  const insert = db.prepare(`
    INSERT INTO hsp_qa_orders VALUES (?, ?, 'CREATING', NULL, ?)
    ON CONFLICT DO NOTHING
  `);
  const update = db.prepare(`
    UPDATE hsp_qa_orders SET state = ?, flow_id = ?, data = ?
    WHERE revision = ? AND request_id = ? AND state = ?
  `);
  const readRevision = db.prepare('SELECT version, commitment, roster FROM hsp_qa_current_revision WHERE room_id = ?');
  const hasRoomOrder = db.prepare("SELECT 1 FROM hsp_qa_orders WHERE json_extract(data, '$.roomId') = ?");
  const writeRevision = db.prepare(`
    INSERT INTO hsp_qa_current_revision VALUES (?, ?, ?, ?)
    ON CONFLICT(room_id) DO UPDATE SET version = excluded.version, commitment = excluded.commitment
  `);
  function transaction(operation) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function assertCurrent({ roomId, version, revisionCommitment }) {
    if (!roomId) return;
    const current = readRevision.get(roomId);
    if (!current || current.version !== version || current.commitment !== revisionCommitment) {
      throw new Error('HSP_QA_STALE_OR_UNPUBLISHED_REVISION');
    }
  }
  return {
    publishRevision({ roomId, version, revisionCommitment, participants }) {
      return transaction(() => {
        const roster = JSON.stringify([...participants].sort());
        const current = readRevision.get(roomId);
        if (current?.roster !== undefined && current.roster !== roster) throw new Error('HSP_QA_ROOM_ROSTER_CHANGED');
        if (current?.version === version && current.commitment === revisionCommitment) return false;
        if (hasRoomOrder.get(roomId)) throw new Error('HSP_QA_ROOM_ALREADY_RESERVED');
        if (current && current.version >= version) throw new Error('HSP_QA_REVISION_NOT_NEWER');
        writeRevision.run(roomId, version, revisionCommitment, roster);
        return true;
      });
    },
    assertCurrent,
    read(revision) {
      const row = select.get(revision);
      return row ? JSON.parse(row.data) : null;
    },
    reserve(order) {
      return transaction(() => {
        assertCurrent(order);
        return insert.run(order.revisionCommitment, order.paymentRequestId, JSON.stringify(order)).changes === 1;
      });
    },
    transition(order, from) {
      if (update.run(order.status, order.flowId ?? null, JSON.stringify(order),
        order.revisionCommitment, order.paymentRequestId, from).changes !== 1) return false;
      return true;
    },
    close: () => db.close(),
  };
}

export async function createHspQaOrder({ call, rpc, store, approval, clock = Date.now }) {
  const { chainId, merchantName, atomicAmount } = approval;
  const network = networks.get(chainId);
  if (!network || ![approval.payer, approval.payee, approval.token].every((value) => matches(address, value)) ||
      !matches(digest, approval.revisionCommitment) || /^0x0{64}$/i.test(approval.revisionCommitment) ||
      !matches(/^[1-9][0-9]{0,11}0000$/, atomicAmount) ||
      typeof merchantName !== 'string' || !merchantName.trim() || merchantName.length > 100 ||
      typeof approval.validUntil !== 'string') throw new Error('HSP_QA_APPROVAL_INVALID');
  const payer = approval.payer.toLowerCase();
  const payee = approval.payee.toLowerCase();
  if (payer === payee) throw new Error('HSP_QA_APPROVAL_INVALID');
  const terms = {
    revisionCommitment: approval.revisionCommitment.toLowerCase(), chainId, payer, payee,
    token: approval.token.toLowerCase(), merchantName, atomicAmount, validUntil: approval.validUntil,
    ...(approval.roomId ? { roomId: approval.roomId, version: approval.version } : {}),
  };
  const existing = () => {
    const saved = store.read(terms.revisionCommitment);
    if (saved && Object.entries(terms).some(([key, value]) => saved[key] !== value)) throw new Error('HSP_QA_ORDER_TERMS_CONFLICT');
    return saved;
  };
  const saved = existing();
  if (saved) return saved;
  store.assertCurrent(terms);
  const expires = Date.parse(terms.validUntil);
  if (!(expires - clock() >= 1000)) throw new Error('HSP_QA_APPROVAL_EXPIRED');

  const config = await call('get_chain_config', {});
  const tokens = Array.isArray(config?.tokens) ? config.tokens.filter((item) =>
    Number(item?.chain_id) === chainId && item.symbol === 'USDC' && item.payment_protocol === 'eip3009' &&
    typeof item.address === 'string' && item.address.toLowerCase() === terms.token && Number(item.decimals) === 6) : [];
  if (!Array.isArray(config?.networks) || !config.networks.some((item) =>
    item?.name === network && item.is_testnet === true && Number(item.chain_id) === chainId) || tokens.length !== 1) {
    throw new Error('HSP_QA_APPROVED_TOKEN_UNAVAILABLE');
  }
  const [rpcNetwork, head] = await Promise.all([rpc('eth_chainId'), rpc('eth_blockNumber')]);
  const quantity = /^0x(?:0|[1-9a-f][0-9a-f]{0,15})$/i;
  if (!matches(quantity, rpcNetwork) || BigInt(rpcNetwork) !== BigInt(chainId) || !matches(quantity, head)) {
    throw new Error('HSP_QA_RPC_NETWORK_OR_HEAD_INVALID');
  }
  const now = clock();
  if (!(expires - now >= 1000)) throw new Error('HSP_QA_APPROVAL_EXPIRED');
  const paymentRequestId = `BILLION-PR-${randomUUID()}`;
  const reserved = {
    ...terms, paymentRequestId, network, status: 'CREATING', minConfirmations: 5, earliestBlock: (BigInt(head) + 1n).toString(),
    domainName: tokens[0].name || 'USDC', domainVersion: String(tokens[0].version ?? '2'),
    proofSalt: '0x' + randomBytes(32).toString('hex'),
  };
  const cents = BigInt(atomicAmount) / 10_000n;
  const amount = { currency: 'USD', value: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` };
  const cartExpiry = new Date(Math.min(expires, now + 3_600_000)).toISOString().replace(/\.\d+Z$/, 'Z');
  const cart = {
    contents: {
      id: `BILLION-CART-${randomUUID()}`, merchant_name: merchantName, user_cart_confirmation_required: false,
      cart_expiry: cartExpiry,
      payment_request: {
        method_data: [{ supported_methods: 'https://www.x402.org/', data: {
          x402Version: 2, network, chain_id: chainId, contract_address: terms.token, pay_to: payee, coin: 'USDC',
        } }],
        details: {
          id: paymentRequestId, display_items: [{ label: 'Bill:ION shared receipt', amount }],
          total: { label: 'Total', amount },
        },
      },
    },
  };
  if (!store.reserve(reserved)) {
    const current = existing();
    if (!current) throw new Error('HSP_QA_ROOM_ALREADY_RESERVED');
    return current;
  }

  let result;
  try {
    const order = await call('create_order', { merchant_name: merchantName, pay_to: payee, cart_mandate: cart });
    if (typeof order?.flow_id !== 'string' || !order.flow_id.trim() ||
        (order.payment_request_id !== undefined && order.payment_request_id !== paymentRequestId)) {
      throw new Error('HSP_QA_CREATE_REPLY_MISMATCH');
    }
    result = { ...reserved, status: 'ORDER_CREATED', flowId: order.flow_id };
  } catch {
    result = { ...reserved, status: 'UNKNOWN' };
  }
  if (!store.transition(result, 'CREATING')) throw new Error('HSP_ORDER_RESERVATION_LOST');
  return result;
}
