export let shuttingDown = false;

export function setupTerminationHandler(callback: () => Promise<void>) {
    async function handleTermination(signal: string) {
        if (shuttingDown) return;
        console.log(`\nCaught ${signal}. Waiting for current batch to finish...`);
        await callback();
        shuttingDown = true;
    }

    process.on("SIGINT", () => handleTermination("SIGINT"));
    process.on("SIGTERM", () => handleTermination("SIGTERM"));
}