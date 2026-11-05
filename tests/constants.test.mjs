// Stałe magazynowe: jedno zrodlo prawdy dla retry/idle/grace/limit
// oraz pojedyncza definicja entryKey w mailbox.ts (wlasciciel typu).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mailbox = read("../src/arkmail/core/session/mailbox.ts");
const pager = read("../src/arkmail/core/session/pager.ts");
const parser = read("../src/arkmail/core/protocol/parser.ts");
const pagination = read("../src/arkmail/core/pagination.ts");
const bulkDelete = read("../src/arkmail/core/bulkDelete.ts");

test("mailbox eksportuje LISTS_LOADING_RETRY_MS i DEFAULT_IDLE_FLUSH_MS", () => {
  assert.ok(/export const LISTS_LOADING_RETRY_MS = 2000;/.test(mailbox), "brak eksportu LISTS_LOADING_RETRY_MS = 2000");
  assert.ok(/export const DEFAULT_IDLE_FLUSH_MS = 600;/.test(mailbox), "brak eksportu DEFAULT_IDLE_FLUSH_MS = 600");
  assert.doesNotMatch(mailbox, /}, 2000\);/, "literal 2000 zostal w mailbox.ts");
  assert.doesNotMatch(mailbox, /\?\? 600/, "literal ?? 600 zostal w mailbox.ts");
});

test("pager uzywa stalych zamiast literallow", () => {
  assert.ok(/import \{ DEFAULT_IDLE_FLUSH_MS, LISTS_LOADING_RETRY_MS \} from '\.\/mailbox\.js';/.test(pager),
    "pager nie importuje stalych z mailbox.js");
  assert.ok(/const CLOSE_GRACE_MS = 400;/.test(pager), "brak CLOSE_GRACE_MS = 400 w pager.ts");
  assert.ok(pager.includes("this.opts.idleMs ?? DEFAULT_IDLE_FLUSH_MS"), "pager: ?? 600 niezamienione");
  assert.ok(pager.includes("Math.max(idleMs, CLOSE_GRACE_MS)"), "pager: Math.max(idleMs, 400) niezamienione");
  assert.doesNotMatch(pager, /}, 2000\);/, "literal 2000 zostal w pager.ts");
  assert.doesNotMatch(pager, /\?\? 600/, "literal ?? 600 zostal w pager.ts");
});

test("SERVER_LISTING_LIMIT jest eksportem parsera", () => {
  assert.ok(/export const SERVER_LISTING_LIMIT = 50;/.test(parser), "SERVER_LISTING_LIMIT nie jest eksportem");
});

test("komunikat luki w pagination uzywa SERVER_LISTING_LIMIT", () => {
  assert.ok(pagination.includes("import { SERVER_LISTING_LIMIT } from './protocol/parser.js';"),
    "pagination nie importuje SERVER_LISTING_LIMIT");
  assert.ok(pagination.includes("ponad ${SERVER_LISTING_LIMIT} listow"),
    "komunikat luki nadal zawiera literal 50");
});

test("entryKey: jedna definicja w mailbox.ts, importy w pagination i bulkDelete", () => {
  const defs = [mailbox, pagination, bulkDelete].map((s) => (s.match(/const entryKey = /g) || []).length);
  assert.deepEqual(defs, [1, 0, 0], `definicje entryKey: mailbox=${defs[0]}, pagination=${defs[1]}, bulkDelete=${defs[2]}`);
  assert.ok(/import \{ entryKey \} from '\.\/session\/mailbox\.js';/.test(pagination),
    "pagination nie importuje entryKey");
  assert.ok(/export \{ entryKey \};/.test(pagination), "pagination nie reeksportuje entryKey");
  assert.ok(/import \{ entryKey \} from '\.\/session\/mailbox\.js';/.test(bulkDelete),
    "bulkDelete nie importuje entryKey");
});

test("entryKey dziala identycznie jak poprzednio", async () => {
  const { entryKey } = await import("../out-test/src/arkmail/core/session/mailbox.js");
  const base = { party: "Kowal", subject: "Temat", forwarded: false, date: { raw: "Pon 01-01" } };
  assert.equal(entryKey(base), "Kowal|Temat||Pon 01-01");
  assert.equal(entryKey({ ...base, forwarded: true }), "Kowal|Temat|f|Pon 01-01");
  assert.equal(entryKey({ party: "Kowal", subject: "Temat", forwarded: false, date: null }), "Kowal|Temat||");
});
