export interface ConfigData {
    electrsUrl: string;
    httpPort: number;
    batchSize: number;
}

export const Config = {
    load(): ConfigData {
        const electrsUrl = process.env.ELECTRS_URL || 'http://localhost:3000';
        const batchSize = parseInt(process.env.BATCH_SIZE || '10', 10);
        const httpPort = parseInt(process.env.HTTP_PORT || '4000', 10);

        try {
            validateUrl(electrsUrl);
            validateHttpPort(httpPort);
            validateBatchSize(batchSize);
        } catch (err: any) {
            console.error(`Configuration error: ${err.message}`);
            process.exit(1); // Exit on invalid config
        }

        const result: ConfigData = { electrsUrl, httpPort, batchSize };
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

function validateHttpPort(httpPort: number) {
    if (isNaN(httpPort) || httpPort <= 0) {
        throw new Error("HTTP_PORT must be a positive number");
    }
}