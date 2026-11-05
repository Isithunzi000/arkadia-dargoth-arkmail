// ERROR_LABEL_MS: jedna nazwana stala zamiast siedmiu literallow 3000
// na etykietach bledu w render.ts. Timer flasha w index.ts zostaje
// z literalem (poza zakresem), GUARD_ARM_MS zostaje bez zmian.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const render = readFileSync(new URL("../src/arkmail/ui/render.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/arkmail/index.ts", import.meta.url), "utf8");

test("stala ERROR_LABEL_MS zdefiniowana dokladnie raz", () => {
  const defs = render.match(/const ERROR_LABEL_MS = 3000;/g) || [];
  assert.equal(defs.length, 1, `oczekiwano 1 definicji, znaleziono ${defs.length}`);
});

test("siedem uzyc ERROR_LABEL_MS zamiast literallow", () => {
  const uses = render.match(/ERROR_LABEL_MS/g) || [];
  assert.equal(uses.length, 8, `oczekiwano 1 definicji + 7 uzyc, znaleziono ${uses.length}`);
});

test("poza stalymi pozostaje wylacznie GUARD_ARM_MS", () => {
  const literals = render.match(/(?<!GUARD_ARM_MS = )(?<!ERROR_LABEL_MS = )3000/g) || [];
  assert.deepEqual(literals, [], `znaleziono ${literals.length} niezamienionych literallow 3000`);
  assert.ok(/const GUARD_ARM_MS = 3000;/.test(render), "GUARD_ARM_MS musi zostac bez zmian");
});

test("timer flasha w index.ts poza zakresem (literal zostaje)", () => {
  const count = (index.match(/3000/g) || []).length;
  assert.ok(count >= 1, "timer flasha w index.ts powinien zostac z literalem 3000");
});
