import express from "express";
import electrs, { Tx } from "./electrs";
import db from "./db";

const app = express();

const BATCH_SIZE = 10;
const PORT = 4000;

let shuttingDown = false;

process.on("SIGINT", async () => {
    console.log("\nCaught SIGINT. Waiting for current batch to finish...");
    shuttingDown = true;
});

export type AddressBalanceDelta = {
    address: string;
    delta: bigint;
};

function extractAddressesDeltas(tx: Tx): AddressBalanceDelta[] {
    const deltaMap = new Map<string, bigint>();
    for (const vout of tx.vout) {
        if (vout.scriptpubkey_address) {
            const prev = deltaMap.get(vout.scriptpubkey_address);
            deltaMap.set(
                vout.scriptpubkey_address,
                (prev ?? 0n) + BigInt(vout.value)
            );
        }
    }
    for (const vin of tx.vin) {
        const prevout = vin.prevout;
        if (prevout?.scriptpubkey_address) {
            const prev = deltaMap.get(prevout.scriptpubkey_address);
            deltaMap.set(prevout.scriptpubkey_address, (prev ?? 0n) - BigInt(prevout.value));
        }
    }
    return Array.from(deltaMap, ([address, delta]) => ({ address, delta }));
}

export async function processBlock(height: number): Promise<AddressBalanceDelta[]> {
    const blockHash = await electrs.getBlockHash(height);
    const txs = await electrs.getBlockTransactions(blockHash);
    const deltas = txs.flatMap(tx => extractAddressesDeltas(tx as Tx));

    const merged = new Map<string, bigint>();
    for (const { address, delta } of deltas) {
        merged.set(address, (merged.get(address) ?? 0n) + delta);
    }

    return Array.from(merged, ([address, delta]) => ({ address, delta }));
}

export async function processBlocksBatch(heights: number[]) {
    const blocksDeltas = await Promise.all(heights.map(h => processBlock(h)));
    const consolidated = new Map<string, bigint>();

    for (const deltas of blocksDeltas) {
        for (const { address, delta } of deltas) {
            consolidated.set(address, (consolidated.get(address) ?? 0n) + delta);
        }
    }

    const allDeltas: AddressBalanceDelta[] = Array.from(
        consolidated,
        ([address, delta]) => ({ address, delta })
    );

    if (allDeltas.length > 0) db.insertAddresses(allDeltas);
    db.setLastHeight(heights[heights.length - 1]);
}

async function indexBlocksForever(batchSize: number) {
    console.log("Starting continuous indexing...");
    while (!shuttingDown) {
        try {
            const tip = await electrs.getTipHeight();
            let startHeight = db.getLastHeight() + 1;
            if (startHeight > tip) {
                // Wait for new blocks
                await new Promise(res => setTimeout(res, 5000));
                continue;
            }

            const batchHeights = [];
            for (let i = 0; i < batchSize && startHeight + i <= tip; i++) {
                batchHeights.push(startHeight + i);
            }

            await processBlocksBatch(batchHeights);
            console.log(`Processed blocks ${batchHeights[0]}-${batchHeights[batchHeights.length - 1]}`);
        } catch (err) {
            console.error("Indexing error:", err);
            await new Promise(res => setTimeout(res, 5000));
        }
    }
    console.log("Indexing stopped.");
}

app.get("/addresses", (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 50);

    const total = db.getTotalAddresses();
    const data = db.getAddressesPaginated(page, limit);

    res.json({
        page,
        limit,
        total,
        data: data.map(a => ({
            address: a.address,
            balance: a.balance.toString()
        }))
    });
});

app.listen(PORT, () => console.log(`REST API running at http://localhost:${PORT}`));

// Start indexing
indexBlocksForever(BATCH_SIZE).catch(console.error);