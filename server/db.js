import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";

// All data lives in this one local JSON file. Delete it anytime to reset the app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "messaging-app-data.json");

const adapter = new JSONFile(file);
const defaultData = { users: [], messages: [], pushSubscriptions: [], contacts: [] };

const db = new Low(adapter, defaultData);

await db.read();
db.data ||= defaultData;
db.data.pushSubscriptions ||= [];
db.data.contacts ||= [];
await db.write();

export default db;