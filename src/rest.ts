import { Server } from "http";
import { DB } from "./indexer/db";
import express, { response } from "express";
import { Indexer } from "./indexer/indexer";
import { ElectRS } from "./indexer/electrs";

const app = express();
const PORT = 4000;

export class Rest {
    private server: Server | null = null;

    constructor(private indexer: Indexer, private db: DB, private electrs: ElectRS) { }

    listen() {
        app.get("/", async (_, res) => {
            try {
                const indexerHeight = this.db.getLastHeight();
                try {
                    const electrsHeight = await this.electrs.getTipHeight();
                    res.json({ electrs_height: electrsHeight, indexer_height: indexerHeight });
                } catch (err) {
                    res.status(500).json({ status: "error" });
                }
            } catch (err) {
                res.status(500).json({ status: "error" });
            }
        });

        app.get("/addresses", async (req, res) => {
            try {
                const { page, limit } = this.parseQueryPagination(req.query.page, req.query.limit);
                const total = await this.db.getTotalAddresses();
                const paginatedAddresses = await this.db.getAddressesPaginated(page, limit);
                const data = paginatedAddresses.map(this.formatAddress);
                res.json({ page, limit, total, data });
            } catch (err) {
                res.status(500).json({ status: "error" });
            }
        });

        this.server = app.listen(PORT, () => console.log(`REST API running at http://localhost:${PORT}`));
    }

    close() {
        this.server?.close();
    }

    private parseQueryPagination(pageQuery: unknown, limitQuery: unknown) {
        const page = Math.max(1, parseInt(pageQuery as string) || 1);
        const limit = Math.max(1, parseInt(limitQuery as string) || 10);
        return { page, limit };
    }

    private formatAddress(a: { address: string; balance: bigint }) {
        return { address: a.address, balance: a.balance.toString() };
    }
}