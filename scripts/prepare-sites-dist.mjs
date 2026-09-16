import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

if (process.env.FINORA_INCLUDE_SITES_ARTIFACTS !== "1") {
  process.exit(0);
}

await mkdir(resolve(root, "dist/server"), { recursive: true });
await mkdir(resolve(root, "dist/.openai"), { recursive: true });
await cp(resolve(root, "worker/index.js"), resolve(root, "dist/server/index.js"));
await cp(resolve(root, ".openai/hosting.json"), resolve(root, "dist/.openai/hosting.json"));
