import { randomUUID } from 'node:crypto';

// Keep shared monetary amounts and ordering, but unlink them from the account.
// Each room receives a different anonymous identity; there is no reverse map.
// MemoryStore publishes the transformed snapshot atomically. Persistent stores
// must implement the same operation transactionally before enabling deletion.
export function eraseUserSnapshot(cols, events, uid, now = new Date()) {
  const next = structuredClone(cols);
  const logs = structuredClone(events);
  const removedLinks = [];
  for (const col of ['users', 'agents']) next.get(col)?.delete(uid);
  for (const col of ['locationConsents', 'locationEvidence']) {
    for (const [id, doc] of next.get(col) || []) if (doc.uid === uid) next.get(col).delete(id);
  }
  for (const [roomId, room] of next.get('rooms') || []) {
    if (!room.members.some(m => m.uid === uid)) continue;
    const anonymous = `deleted-${randomUUID()}`;
    const reference = value => {
      if (typeof value === 'string') return value === uid ? anonymous : value.split(':').map(part => part === uid ? anonymous : part).join(':');
      if (Array.isArray(value)) return value.map(reference);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k === uid ? anonymous : k, reference(v)]));
      return value;
    };
    const savedRoom = reference(room);
    savedRoom.members = savedRoom.members.map(m => m.uid === anonymous ? { uid: anonymous, name: 'Deleted user', deleted: true } : m);
    next.get('rooms').set(roomId, savedRoom);
    for (const col of ['expenses', 'invoices', 'disputes', 'transfers', 'receipts', 'invites']) { // invites: 링크를 만든 사람(createdBy)만 끊고 링크는 남긴다
      for (const [id, original] of [...next.get(col) || []]) {
        if (original.roomId !== roomId) continue;
        const saved = reference(original);
        if (col === 'expenses') {
          if (original.createdBy === uid || original.payer === uid) {
            next.get('receipts')?.delete(original.id);
            saved.hasReceipt = false;
            saved.title = 'Expense from a deleted user';
            if (saved.items) saved.items = saved.items.map(it => ({ ...it, name: 'Order item' }));
          }
          // Allocation explanations can quote private agent memories.
          for (const line of Object.values(saved.alloc || {})) line.reason = 'Shared settlement record';
        }
        if (col === 'invoices') saved.reasons = ['Shared settlement record'];
        if (col === 'disputes') {
          saved.claim = 'Settlement dispute kept after personal data was deleted';
          saved.evidence = [];
          if (saved.status !== 'resolved') { saved.status = 'open'; saved.agreedBy = []; }
          delete saved.proposal;
        }
        if (col === 'transfers' && (original.from === uid || original.to === uid)) {
          if (original.link) removedLinks.push(original.link);
          saved.link = null;
          saved.fallback = null;
          delete saved.qr;
          delete saved.qrExpiresAt;
        }
        next.get(col).delete(id);
        next.get(col).set(saved.id, saved);
      }
    }
    // Event text/meta can contain copied names, memories, account details or
    // location. Retain sequence/time/actions without retaining those copies.
    logs.set(roomId, (logs.get(roomId) || []).map(ev => {
      const out = reference(ev);
      return { seq: out.seq, roomId, at: out.at, from: out.from, to: out.to,
        kind: out.kind, text: 'Settlement record kept after personal data was deleted', ...(out.action ? { action: out.action } : {}) };
    }));
    const roomLog = logs.get(roomId);
    roomLog.push({ seq: (roomLog.at(-1)?.seq || 0) + 1, roomId, at: now.toISOString(), from: 'system', to: 'all', kind: 'account_erased', text: 'A former member’s personal data was deleted and the settlement records were anonymized.' });
  }
  return { cols: next, events: logs, removedLinks };
}
