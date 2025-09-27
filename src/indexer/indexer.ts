import { AddressBalanceDelta, mergeDeltas } from "../delta";
import { shuttingDown } from "../exitHandler";
import { ConfigData } from "../config";
import { ElectRS } from "./electrs";
import { DB } from "./db";

class ProgressTracker {
    private batchTimes: { time: number; ts: number }[] = [];
    private startTime: number = Date.now();

    addBatch(durationMs: number) {
        const now = Date.now();
        this.batchTimes.push({ time: durationMs, ts: now });

        // Keep only last 2 minutes
        this.batchTimes = this.batchTimes.filter(
            entry => now - entry.ts <= 2 * 60 * 1000
        );
    }

    getAverageBatchTime(): number {
        if (!this.batchTimes.length) return 0;
        const sum = this.batchTimes.reduce((a, b) => a + b.time, 0);
        return sum / this.batchTimes.length;
    }

    getElapsed(): string {
        const elapsed = Date.now() - this.startTime;
        return this.formatDuration(elapsed);
    }

    getETA(remainingBatches: number): string {
        const avg = this.getAverageBatchTime();
        if (!avg || !remainingBatches) return "??:??:??";
        const etaMs = avg * remainingBatches;
        return this.formatDuration(etaMs);
    }

    private formatDuration(ms: number): string {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return [h, m, s].map(x => String(x).padStart(2, "0")).join(":");
    }
}

export class Indexer {
    private started: boolean = false;
    private progress: ProgressTracker = new ProgressTracker();

    constructor(private config: ConfigData, private db: DB, private electrs: ElectRS) { }

    async start() {
        if (this.started) return;
        this.started = true;

        await this.indexBlocksForever(this.config.batchSize);
    }

    private async indexBlocksForever(batchSize: number) {
        console.log("Starting continuous indexing...");

        let connected: boolean = false;
        while (!shuttingDown) {
            try {
                const lastHeight = await this.db.getLastHeight();

                if (!connected) {
                    connected = await this.electrs.checkConnection();
                    if (!connected) {
                        console.log("Electrs not available. Waiting...");
                        while (!shuttingDown && !connected) {
                            await this.wait(5000);
                            connected = await this.electrs.checkConnection();
                        }
                    }
                }

                try {
                    let batchHeights: number[] | null = null;
                    let tip: number | null = null;

                    try {
                        tip = await this.electrs.getTipHeight();
                    } catch (err) {
                        console.error(`Failed to query electrs tip height. Retrying in 5 seconds...`);
                        await this.wait(5000);
                        connected = false;
                        continue;
                    }

                    batchHeights = this.getBatchHeights(lastHeight + 1, tip, batchSize);
                    if (!batchHeights.length) {
                        // No blocks to process, wait 5 seconds and try again
                        await this.wait(5000);
                        connected = false;
                        continue;
                    }

                    const batchStart = batchHeights[0];
                    const batchEnd = batchHeights[batchHeights.length - 1];
                    const totalBlocks = tip;
                    const doneBlocks = batchEnd;
                    const remainingBlocks = totalBlocks - doneBlocks;

                    const t0 = Date.now();
                    try {
                        const batchDeltas = await this.processBlocksBatch(batchHeights);
                        await this.db.insertDeltas(batchDeltas, batchEnd);
                        const t1 = Date.now();

                        const duration = t1 - t0;
                        this.progress.addBatch(duration);

                        const percent = ((doneBlocks / totalBlocks) * 100).toFixed(2);
                        const avgMs = this.progress.getAverageBatchTime().toFixed(0);
                        const elapsed = this.progress.getElapsed();
                        const eta = this.progress.getETA(Math.ceil(remainingBlocks / batchSize));

                        console.log(`Progress: ${batchEnd}/${tip} (${percent}%) | Batch: ${duration}ms | Avg: ${avgMs}ms | Elapsed: ${elapsed} | ETA: ${eta}`);
                    } catch (err) {
                        console.error(`Failed to write blocks batch ${batchStart}-${batchEnd} deltas to database: `, err);
                        await this.wait(5000);
                        connected = false;
                        continue;
                    }
                } catch (err) {
                    console.error(`Failed to index blocks: `, err);
                    await this.wait(5000);
                    connected = false;
                }
            } catch (e) {
                this.wait(5000);
                connected = false;
            }
        }

        console.log("Indexing stopped.");
    }

    private async processBlocksBatch(heights: number[]): Promise<AddressBalanceDelta[]> {
        const blocksDeltas = await Promise.all(heights.map(this.processBlock.bind(this)));
        return mergeDeltas(blocksDeltas.flat());
    }

    private async processBlock(height: number): Promise<AddressBalanceDelta[]> {
        const blockHash = await this.electrs.getBlockHash(height);
        const txs = await this.electrs.getBlockTransactions(blockHash);
        return mergeDeltas(txs.flatMap(tx => tx.extractTxDeltas()));
    }

    private getBatchHeights(start: number, tip: number, batchSize: number) {
        const heights: number[] = [];
        for (let i = 0; i < batchSize && start + i <= tip; i++) heights.push(start + i);
        return heights;
    }

    private async wait(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }
}