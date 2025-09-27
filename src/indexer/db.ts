import { AddressBalanceDelta } from "../delta";
import knex from "knex";

type DbAddress = {
  address: string;
  balance: bigint;
};

export class DB {
  private db;

  constructor(path: string) {
    this.db = knex({
      client: "sqlite3",
      connection: { filename: path },
      useNullAsDefault: true,
    });
  }

  async initSchema() {
    try {
      console.log("Starting database schema initialization...");

      // ----------------------
      // Progress Table
      // ----------------------
      const progressExists = await this.db.schema.hasTable("progress");
      if (!progressExists) {
        await this.db.schema.createTable("progress", table => {
          table.integer("id").primary();
          table.integer("last_height").notNullable();
        });
        // Initialize progress row
        await this.db("progress").insert({ id: 1, last_height: 0 });
        console.log("Created 'progress' table.");
      } else {
        console.log("'progress' table already exists.");
      }

      // ----------------------
      // Balances Table
      // ----------------------
      const balancesExists = await this.db.schema.hasTable("balances");
      if (!balancesExists) {
        await this.db.schema.createTable("balances", table => {
          table.text("address").primary();
          table.text("balance").notNullable(); // store bigint as string
        });

        // Create index for sorting by balance descending
        await this.db.schema.raw("CREATE INDEX IF NOT EXISTS idx_balance_desc ON balances(balance DESC)");
        console.log("Created 'balances' table and index.");
      } else {
        console.log("'balances' table already exists.");
      }

      console.log("Database schema initialization complete.");
    } catch (err) {
      console.error("Database initialization failed:", err);
      process.exit(1);
    }
  }

  async getLastHeight(): Promise<number> {
    try {
      const row = await this.db("progress").first("last_height").where({ id: 1 });
      return row?.last_height ?? 0;
    } catch (err) {
      throw new Error(`Failed to get last height: ${(err as Error).message}`);
    }
  }

  async setLastHeight(height: number): Promise<void> {
    try {
      await this.db("progress").where({ id: 1 }).update({ last_height: height });
    } catch (err) {
      throw new Error(`Failed to set last height to ${height}: ${(err as Error).message}`);
    }
  }

  async insertDeltas(deltas: AddressBalanceDelta[], newHeight: number): Promise<void> {
    try {
      await this.db.transaction(async trx => {
        if (deltas.length !== 0) {
          // Apply balance deltas
          for (const { address, delta } of deltas) {
            await trx("balances")
              .insert({ address, balance: delta.toString() })
              .onConflict("address")
              .merge({ balance: this.db.raw("balance + ?", [delta.toString()]) });

            const row = await trx("balances").first("balance").where({ address });
            if (row && BigInt(row.balance) === 0n) {
              await trx("balances").where({ address }).del();
            }
          }
        }

        // Update last_height in the same transaction
        await trx("progress").where({ id: 1 }).update({ last_height: newHeight });
      });
    } catch (err) {
      throw new Error(`Failed to insert deltas: ${(err as Error).message}`);
    }
  }

  async getAddressesPaginated(page: number, limit: number): Promise<DbAddress[]> {
    try {
      const offset = (page - 1) * limit;
      const rows = await this.db("balances")
        .select("address", "balance")
        .orderBy("balance", "desc")
        .limit(limit)
        .offset(offset);

      return rows.map(r => ({ address: r.address, balance: BigInt(r.balance) }));
    } catch (err) {
      throw new Error(`Failed to get paginated addresses (page ${page}, limit ${limit}): ${(err as Error).message}`);
    }
  }

  async getTotalAddresses(): Promise<number> {
    try {
      const row = await this.db("balances").count<{ count: number }>("address as count").first();
      return row?.count ?? 0;
    } catch (err) {
      throw new Error(`Failed to get total addresses: ${(err as Error).message}`);
    }
  }
}