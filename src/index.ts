import { setupTerminationHandler } from "./exitHandler";
import { Indexer } from "./indexer/indexer";
import { Config } from "./config";
import { DB } from "./indexer/db";
import { Rest } from "./rest";
import { ElectRS } from "./indexer/electrs";

console.log("Starting holders-indexer...");

const config = Config.load();
const database = new DB("./data/index.db");
const electrs = new ElectRS(config.electrsUrl);
const indexer = new Indexer(config, database, electrs);
const rest = new Rest(database, electrs);

setupTerminationHandler(async () => rest.close());

(async () => {
    await database.initSchema();
    rest.listen(config.httpPort);
    await indexer.start();
    console.log("holders-indexer exited.");
})();