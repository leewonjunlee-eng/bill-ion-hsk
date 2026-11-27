import { DatabaseSync } from 'node:sqlite';

export function openHspEvidenceStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS hsp_qa_evidence (
      flow_id TEXT PRIMARY KEY,
      payment_request_id TEXT NOT NULL UNIQUE,
      chain_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL COLLATE NOCASE,
      proof TEXT NOT NULL,
      UNIQUE (chain_id, tx_hash)
    );
  `);
  const byOrder = db.prepare('SELECT proof FROM hsp_qa_evidence WHERE flow_id = ? OR payment_request_id = ?');
  const byFlow = db.prepare('SELECT proof FROM hsp_qa_evidence WHERE flow_id = ?');
  const byTransfer = db.prepare('SELECT 1 FROM hsp_qa_evidence WHERE chain_id = ? AND tx_hash = ?');
  const insert = db.prepare('INSERT INTO hsp_qa_evidence VALUES (?, ?, ?, ?, ?)');

  return {
    get(flowId) {
      const row = byFlow.get(flowId);
      return row ? JSON.parse(row.proof) : null;
    },
    claim(evidence) {
      const { flowId, paymentRequestId, transfer, terms } = evidence;
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = byOrder.all(flowId, paymentRequestId);
        if (existing.length) {
          const saved = JSON.parse(existing[0].proof);
          if (existing.length !== 1 || saved.flowId !== flowId || saved.paymentRequestId !== paymentRequestId ||
              saved.transfer.chainId !== transfer.chainId ||
              saved.transfer.transactionHash !== transfer.transactionHash ||
              saved.transfer.blockHash !== transfer.blockHash || saved.transfer.logIndex !== transfer.logIndex ||
              saved.revision !== evidence.revision || saved.proof !== evidence.proof ||
              JSON.stringify(saved.terms) !== JSON.stringify(terms)) {
            throw new Error('HSP_ORDER_EVIDENCE_CONFLICT');
          }
          db.exec('COMMIT');
          return { created: false, evidence: saved };
        }
        // One settlement per transaction. Reject batched transactions across orders,
        // including after re-inclusion changes a log's block-wide index.
        if (byTransfer.get(transfer.chainId, transfer.transactionHash)) throw new Error('HSP_TRANSFER_ALREADY_CLAIMED');
        insert.run(flowId, paymentRequestId, transfer.chainId, transfer.transactionHash, JSON.stringify(evidence));
        db.exec('COMMIT');
        return { created: true, evidence };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
