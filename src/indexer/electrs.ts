import { AddressBalanceDelta, mergeDeltas, sumDeltas } from '../delta';
import { plainToInstance } from 'class-transformer';
import fetch from 'node-fetch';

export class TxStatus {
    block_height!: number;
}

export class TxVout {
    value!: bigint;
    scriptpubkey_address?: string;
}

export class TxVin {
    txid!: string;
    vout!: number;
    prevout?: TxVout;
}

export class Tx {
    txid!: string;
    vin!: TxVin[];
    vout!: TxVout[];
    status!: TxStatus;

    extractTxDeltas(): AddressBalanceDelta[] {
        const outputDeltas = this.extractOutputDeltas();
        const inputDeltas = this.extractInputDeltas();
        return mergeDeltas([...outputDeltas, ...inputDeltas]);
    }

    extractInputDeltas(): AddressBalanceDelta[] {
        const deltaMap = new Map<string, bigint>();
        this.vin.forEach(vin => {
            const prevout = vin.prevout;
            if (prevout?.scriptpubkey_address) {
                sumDeltas(deltaMap, prevout.scriptpubkey_address, -BigInt(prevout.value));
            }
        });
        return Array.from(deltaMap, ([address, delta]) => ({ address, delta }));
    }

    extractOutputDeltas(): AddressBalanceDelta[] {
        const deltaMap = new Map<string, bigint>();
        this.vout.forEach(vout => {
            if (vout.scriptpubkey_address) {
                sumDeltas(deltaMap, vout.scriptpubkey_address, BigInt(vout.value));
            }
        });
        return Array.from(deltaMap, ([address, delta]) => ({ address, delta }));
    }
}

export class ElectRS {
    private url: string;

    constructor(url: string) {
        this.url = url;
    }

    async checkConnection(): Promise<boolean> {
        try {
            const res = await fetch(`${this.url}/blocks/tip/height`);
            if (!res.ok) return false;
            parseInt(await res.text());
            return res.ok;
        } catch (err) {
            return false;
        }
    }

    async getTipHeight(): Promise<number> {
        try {
            const res = await fetch(`${this.url}/blocks/tip/height`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return parseInt(await res.text());
        } catch (err) {
            throw new Error(`Failed to get tip height: ${(err as Error).message}`);
        }
    }

    async getBlockHash(height: number): Promise<string> {
        try {
            const res = await fetch(`${this.url}/block-height/${height}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            throw new Error(`Failed to get block hash for height ${height}: ${(err as Error).message}`);
        }
    }

    async getBlockTransactions(blockHash: string): Promise<Tx[]> {
        try {
            const res = await fetch(`${this.url}/internal/block/${blockHash}/txs`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const txs = await res.json();
            return plainToInstance(Tx, txs as object[]);
        } catch (err) {
            throw new Error(`Failed to get transactions for block ${blockHash}: ${(err as Error).message}`);
        }
    }

    async getAddressBalance(address: string): Promise<bigint> {
        try {
            const res = await fetch(`${this.url}/address/${address}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const info = await res.json() as any;
            const funded = BigInt(info.chain_stats?.funded_txo_sum || 0);
            const spent = BigInt(info.chain_stats?.spent_txo_sum || 0);
            return funded - spent;
        } catch (err) {
            throw new Error(`Failed to get balance for address ${address}: ${(err as Error).message}`);
        }
    }
}