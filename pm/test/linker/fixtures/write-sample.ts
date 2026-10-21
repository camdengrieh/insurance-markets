// Regenerates app-dataset.sample.json from the synthetic sample in app-dataset.test.ts. Run with
//   node_modules/.bin/tsx pm/test/linker/fixtures/write-sample.ts
// Nothing in the sample is a real market: ids are hashes of labels, text never reaches the file.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeAppDataset } from "../../../linker/app-dataset.js";
import { sampleDataset } from "../app-dataset.test.js";

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "app-dataset.sample.json"), serializeAppDataset(sampleDataset().dataset));
console.log("wrote app-dataset.sample.json");
