import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateRuptureFixture } from "./rupture-fixture";

const path = resolve(process.cwd(), "src/lib/stock/fixtures/rupture-v1.json");
const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
console.log(JSON.stringify({ sha256, ...evaluateRuptureFixture() }, null, 2));
