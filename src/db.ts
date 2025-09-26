import Database, { Statement } from "better-sqlite3";
import { AddressBalanceDelta } from ".";

export type DbAddress = {
  address: string;
  balance: bigint;
};

class DB {
  public database: Database.Database;

  private stmt!: {
    getLastHeight: Statement;
    setLastHeight: Statement;
    insertAddress: Statement;
    deleteAddress: Statement;
    getBalance: Statement;
    getAddressesPaginated: Statement;
  };

  constructor() {
    this.database = new Database("./data/index.db");

    this.database
      .prepare(`
        CREATE TABLE IF NOT EXISTS progress (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          last_height INTEGER NOT NULL
        )
      `)
      .run();

    this.database
      .prepare(`
        CREATE TABLE IF NOT EXISTS balances (
          address TEXT PRIMARY KEY,
          balance TEXT NOT NULL
        )
      `)
      .run();

    // Index on balance DESC for fast ordering
    this.database
      .prepare(`CREATE INDEX IF NOT EXISTS idx_balance_desc ON balances(balance DESC)`)
      .run();

    this.stmt = {
      getLastHeight: this.database.prepare("SELECT last_height FROM progress WHERE id = 1"),
      setLastHeight: this.database.prepare("UPDATE progress SET last_height = ? WHERE id = 1"),
      insertAddress: this.database.prepare(`
        INSERT INTO balances(address, balance)
        VALUES (?, ?)
        ON CONFLICT(address) DO UPDATE SET balance = CAST(balance AS INTEGER) + CAST(excluded.balance AS INTEGER)
      `),
      deleteAddress: this.database.prepare("DELETE FROM balances WHERE address = ?"),
      getBalance: this.database.prepare("SELECT balance FROM balances WHERE address = ?"),
      getAddressesPaginated: this.database.prepare(`
        SELECT address, balance FROM balances
        ORDER BY CAST(balance AS INTEGER) DESC
        LIMIT ? OFFSET ?
      `),
    };
    
    const progressRow = this.stmt.getLastHeight.get();
    if (!progressRow) {
      this.database.prepare("INSERT INTO progress(id, last_height) VALUES (1, 0)").run();
    }
  }

  getLastHeight(): number {
    return (this.stmt.getLastHeight.get() as { last_height: number }).last_height;
  }

  setLastHeight(height: number): void {
    this.stmt.setLastHeight.run(height);
  }

  insertAddresses(addresses: AddressBalanceDelta[]): void {
    const transaction = this.database.transaction((addrs: AddressBalanceDelta[]) => {
      for (const addr of addrs) {
        this.stmt.insertAddress.run(addr.address, addr.delta.toString());

        const row = this.stmt.getBalance.get(addr.address) as { balance: string } | undefined;
        if (row && BigInt(row.balance) === 0n) {
          this.stmt.deleteAddress.run(addr.address);
        }
      }
    });
    transaction(addresses);
  }

  getAddressesPaginated(page: number, limit: number): DbAddress[] {
    const offset = (page - 1) * limit;
    const rows = this.stmt.getAddressesPaginated.all(limit, offset) as { address: string; balance: string }[];
    return rows.map(r => ({ address: r.address, balance: BigInt(r.balance) }));
  }

  getTotalAddresses(): number {
    return (this.database.prepare("SELECT COUNT(*) as count FROM balances").get() as any).count;
  }
}

const db = new DB();
export default db;