export interface ConfigData {
    electrsUrl: string;
    batchSize: number;
}

export const Config = {
    load(): ConfigData {
        const electrsUrl = process.env.ELECTRS_URL || 'http://localhost:3000';
        const batchSize = parseInt(process.env.BATCH_SIZE || '10', 10);

        try {
            validateUrl(electrsUrl);
            validateBatchSize(batchSize);
        } catch (err: any) {
            console.error(`Configuration error: ${err.message}`);
            process.exit(1); // Exit on invalid config
        }

        const result: ConfigData = { electrsUrl, batchSize };
        console.log(`Config loaded: \n${JSON.stringify(result, null, 2)}`);
        
        return result;
    }
};

function validateUrl(url: string) {
    try {
        new URL(url);
    } catch {
        throw new Error(`Invalid ELECTRS_URL: ${url}`);
    }
}

function validateBatchSize(batchSize: number) {
    if (isNaN(batchSize) || batchSize <= 0) {
        throw new Error("BATCH_SIZE must be a positive number");
    }
}