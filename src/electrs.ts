import fetch from 'node-fetch';

const ELECTRS_URL = process.env.ELECTRS_URL || 'http://localhost:3000';

type TxStatus = {
    block_height: number;
}

type TxVout = {
    value: number;
    scriptpubkey_address?: string;
};

type TxVin = {
    txid: string;
    vout: number;
    prevout?: TxVout;
};

export type Tx = {
    txid: string;
    vin: TxVin[];
    vout: TxVout[];
    status: TxStatus;
};

class ElectRS {
    public async getTipHeight(): Promise<number> {
        const res = await fetch(`${ELECTRS_URL}/blocks/tip/height`);
        return parseInt(await res.text());
    }

    public async getBlockHash(height: number): Promise<string> {
        const res = await fetch(`${ELECTRS_URL}/block-height/${height}`);
        return await res.text();
    }

    public async getBlockTransactions(blockHash: string): Promise<Tx[]> {
        const res = await fetch(`${ELECTRS_URL}/internal/block/${blockHash}/txs`);
        return await res.json() as Tx[];
    }

    public async getAddressBalance(address: string): Promise<bigint> {
        const res = await fetch(`${ELECTRS_URL}/address/${address}`);
        const info = await res.json() as any;
        const funded = BigInt(info.chain_stats.funded_txo_sum || 0);
        const spent = BigInt(info.chain_stats.spent_txo_sum || 0);
        return funded - spent;
    }
}

const electrs = new ElectRS();

export default electrs;