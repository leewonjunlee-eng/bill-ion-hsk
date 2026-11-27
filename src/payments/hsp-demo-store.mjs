import { DatabaseSync } from 'node:sqlite';

export function openHspDemoStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS hsp_demo_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state TEXT NOT NULL
    );
  `);
  const read = db.prepare('SELECT state FROM hsp_demo_state WHERE id = 1');
  const write = db.prepare(`
    INSERT INTO hsp_demo_state VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET state = excluded.state
  `);
  return {
    read() {
      const row = read.get();
      return row ? JSON.parse(row.state) : null;
    },
    change(initial, update) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = this.read() ?? initial();
        const result = update(state);
        write.run(JSON.stringify(state));
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
