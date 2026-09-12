/// <reference types="node" />
// Test adapter runs the migration and production SQL against SQLite. No inference/network calls.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) {
      const next = new Statement(this.sql);
      next.values = values as (string | number | null)[];
      return next;
    }
    rows() {
      return sqlite.prepare(this.sql).all(...this.values);
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
    }
  }
  const adapter = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => ({
          success: true,
          results: statement.rows(),
          meta: {},
        }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: adapter as unknown as D1Database, sqlite, close: () => sqlite.close() };
}
