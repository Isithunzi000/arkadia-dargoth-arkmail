var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/arkmail/meta.ts
const PLUGIN_VERSION = "1.9.0";
var PLUGIN_NAME = "ArkMail";
var PLUGIN_AUTHOR = "Isithunzi000";
var PLUGIN_DESCRIPTION = "ArkMail to kompleksowy system pocztowy dla klienta Dargoth: skrzynki, kontakty, archiwum i pisanie listow (alias /arkmail). Plugin w pelni zgodny z regulaminem gry - wszystkie komendy wysylane swiadomie przez gracza, bez automatyki.";

// src/arkmail/core/protocol/parser.ts
var CLIENT_PREFIX_RE = /^\s*\[ POCZTA \]\s+/;
function stripClientPrefix(text) {
  return text.replace(CLIENT_PREFIX_RE, "").trim();
}
var MONTHS = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12
};
var DATE_RE = /^([A-Za-z]+), (\d{1,2}) (XII|XI|IX|VIII|VII|VI|IV|V|III|II|I|X) (\d{4}), (\d{2}:\d{2}:\d{2})$/;
function parseMailDate(raw) {
  const m = raw.match(DATE_RE);
  if (!m) return null;
  return {
    raw,
    weekday: m[1],
    day: Number(m[2]),
    month: MONTHS[m[3]],
    year: Number(m[4]),
    time: m[5]
  };
}
var LISTING_HEADER_RE = /^(?:Wybrane )?[Ll]isty (nieprzeczytane|odebrane|wyslane|niewyslane)(?: \(([^)]*)\))?:$/;
function parseListingHeader(text) {
  const m = text.match(LISTING_HEADER_RE);
  if (!m) return null;
  return {
    box: m[1],
    truncated: m[2] !== void 0 && m[2].includes("pierwsz")
  };
}
var LISTING_ENTRY_RE = /^\s*(\d+)\.\s+(?:(\*R\*)\s+)?Temat: (.+)$/;
var FORWARDED_SUFFIX = " (forwardowany)";
function parseListingEntry(text) {
  const m = text.match(LISTING_ENTRY_RE);
  if (!m) return null;
  let subject = m[3];
  let forwarded = false;
  if (subject.endsWith(FORWARDED_SUFFIX)) {
    forwarded = true;
    subject = subject.slice(0, -FORWARDED_SUFFIX.length);
  }
  return { number: Number(m[1]), isRead: m[2] === "*R*", subject, forwarded };
}
var LISTING_PARTY_RE = /^(Nadawca|Odbiorc[ay]): (.+?)(?:\s{2,}(.+))?$/;
function parseListingParty(text) {
  const m = text.match(LISTING_PARTY_RE);
  if (!m) return null;
  return {
    kind: m[1] === "Nadawca" ? "nadawca" : "odbiorcy",
    names: m[2],
    date: m[3] ? parseMailDate(m[3]) : null
  };
}
var EMPTY_LISTING_RE = /^Nie masz zadnych (nieprzeczytanych|odebranych|wyslanych|niewyslanych) listow\.$/;
var FILTERED_EMPTY_RE = /^Nie znaleziono zadnych takich (nieprzeczytanych|odebranych|wyslanych|niewyslanych) listow\.$/;
var BOX_FROM_GENITIVE = {
  nieprzeczytanych: "nieprzeczytane",
  odebranych: "odebrane",
  wyslanych: "wyslane",
  niewyslanych: "niewyslane"
};
function parseEmptyListing(text) {
  const puste = text.match(EMPTY_LISTING_RE);
  if (puste) return { box: BOX_FROM_GENITIVE[puste[1]], reason: "puste" };
  const filtr = text.match(FILTERED_EMPTY_RE);
  if (filtr) return { box: BOX_FROM_GENITIVE[filtr[1]], reason: "filtr" };
  return null;
}
var LETTER_HEADER_RES = [
  { re: /^List\s*: ?(\d+)$/, field: "numer" },
  { re: /^Od\s*: ?(.+)$/, field: "od" },
  { re: /^Temat\s*: ?(.+)$/, field: "temat" },
  { re: /^Do\s*: ?(.*)$/, field: "do" },
  { re: /^DW\s*: ?(.+)$/, field: "dw" },
  { re: /^Data\s*: ?(.+)$/, field: "data" }
];
function parseLetterHeaderLine(text) {
  for (const { re, field } of LETTER_HEADER_RES) {
    const m = text.match(re);
    if (m) return { field, value: m[1] };
  }
  return null;
}
var PAGER_PROMPT_ANYWHERE_RE = /\[(\d+)-(\d+) [a-zA-Z.!?+<>\-]+\] \(aktualny: (\d+)\) --/;
function extractPagerPrompt(text) {
  const m = text.match(PAGER_PROMPT_ANYWHERE_RE);
  if (!m) return null;
  return { lo: Number(m[1]), hi: Number(m[2]), current: Number(m[3]) };
}
function parseNotification(text) {
  const t = stripClientPrefix(text);
  const nowa = t.match(/^Masz nowa poczte od ([A-Za-z]+)\.$/);
  if (nowa) return { kind: "nowa-poczte", nadawca: nowa[1] };
  if (t === "Goniec przyniosl nowa partie listow.") return { kind: "goniec" };
  const wysylasz = t.match(/^Wysylasz ([A-Za-z]+) na poczte\.$/);
  if (wysylasz) return { kind: "wysylasz", zwierze: wysylasz[1] };
  const powrot = t.match(/^Wsrod trzepotu skrzydel ([A-Za-z]+) laduje na (?:twoim|twojej) \w+(?: \w+)?\.$/);
  if (powrot) return { kind: "powrot-zwierzecia", zwierze: powrot[1] };
  if (t === "List zostal pomyslnie wyslany.") return { kind: "list-wyslany" };
  if (t === "Slucham?") return { kind: "slucham" };
  return null;
}
function parseMailError(text) {
  const zly = text.match(/^Zly numer listu: (\d+)\.$/);
  if (zly) return { kind: "zly-numer", numer: Number(zly[1]) };
  const adresat = text.match(/^(?:Adresat: |DW: |Temat: )?Nie ma takiego adresata \(gracza, aliasu\): (.+)\.$/);
  if (adresat) return { kind: "brak-adresata", adresat: adresat[1] };
  if (text === "Zadne listy nie zostaly wybrane.") return { kind: "brak-wyboru" };
  return null;
}
var COMPOSE_ECHO_RE = /^(?:(Adresat|Temat|DW): )+$/;
function parseComposeEcho(text) {
  if (!COMPOSE_ECHO_RE.test(text)) return null;
  const out = [];
  for (const m of text.matchAll(/(Adresat|Temat|DW): /g)) {
    out.push(m[1] === "Adresat" ? "adresat" : m[1] === "Temat" ? "temat" : "dw");
  }
  return out.length ? out : null;
}
var EDITOR_ECHO_RE = /^(\s*\d+\])+/;
var RESULT_WYSLANY = "List zostal pomyslnie wyslany.";
var RESULT_GOTOWY = "List jest gotowy do wyslania.";
function parseEditorEcho(text) {
  const m = text.match(EDITOR_ECHO_RE);
  if (!m) return null;
  const numbers = [...m[0].matchAll(/(\d+)\]/g)].map((x) => Number(x[1]));
  const rest = text.slice(m[0].length);
  let result = null;
  if (rest === RESULT_WYSLANY) result = "wyslany";
  else if (rest === RESULT_GOTOWY) result = "gotowy";
  else if (rest !== "") return null;
  return { consumed: Math.max(...numbers), result };
}
function parseComposeResult(text) {
  if (text === RESULT_WYSLANY) return "wyslany";
  if (text === RESULT_GOTOWY) return "gotowy";
  return null;
}

// src/arkmail/core/session/lines.ts
function isEchoLine(text) {
  return text.startsWith("\u2192 ") || text === "\u2192";
}
function isPromptLine(text) {
  return /^>+\s*$/.test(text);
}

// src/arkmail/core/protocol/commands.ts
var ROMAN_MONTHS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII"
];
function olderListingCommand(box, date) {
  const roman = ROMAN_MONTHS[date.month - 1];
  if (!roman) throw new RangeError(`nieprawidlowy miesiac: ${date.month}`);
  return `listy ${box} przed ${date.day} ${roman} ${date.year}`;
}
function nextDay(date) {
  const leap = date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const max = monthDays[date.month - 1];
  if (!max || date.day < 1 || date.day > max) {
    throw new RangeError(`nieprawidlowa data: ${date.day}.${date.month}.${date.year}`);
  }
  if (date.day < max) return { day: date.day + 1, month: date.month, year: date.year };
  if (date.month < 12) return { day: 1, month: date.month + 1, year: date.year };
  return { day: 1, month: 1, year: date.year + 1 };
}
var SENDER_BOXES = /* @__PURE__ */ new Set(["odebrane", "nieprzeczytane"]);
var datePart = (d) => `${d.day} ${ROMAN_MONTHS[d.month - 1]} ${d.year}`;
function searchListingCommand(box, q) {
  const parts = [`listy ${box}`];
  if (q.osoba) parts.push(SENDER_BOXES.has(box) ? `od ${q.osoba}` : `do ${q.osoba}`);
  if (q.odDaty) parts.push(`po ${datePart(q.odDaty)}`);
  if (q.doDaty) parts.push(`przed ${datePart(nextDay(q.doDaty))}`);
  if (q.temat) parts.push(`o temacie ${q.temat}`);
  if (q.tresc) parts.push(`o tresci ${q.tresc}`);
  return parts.join(" ");
}
var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function fromISODate(iso) {
  const m = iso.match(ISO_RE);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  try {
    nextDay(date);
  } catch {
    return null;
  }
  return date;
}
var isoOf = (d) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
function searchDescription(box, q) {
  const parts = [box];
  if (q.osoba) parts.push(`${SENDER_BOXES.has(box) ? "nadawca" : "adresat"}: ${q.osoba}`);
  if (q.odDaty) parts.push(`od dnia: ${isoOf(q.odDaty)}`);
  if (q.doDaty) parts.push(`do dnia: ${isoOf(q.doDaty)}`);
  if (q.temat) parts.push(`temat: "${q.temat}"`);
  if (q.tresc) parts.push(`tresc: "${q.tresc}"`);
  return parts.join(", ");
}

// src/arkmail/core/contacts.ts
function splitParty(party) {
  const out = [];
  for (const part of party.split(/, | i /)) {
    const name = part.trim();
    if (name !== "" && !out.includes(name)) out.push(name);
  }
  return out;
}
var directionOf = (box) => box === "odebrane" || box === "nieprzeczytane" ? "in" : "out";
function korespondencjaFromLetters(letters) {
  const korespondencja = [];
  const seen = /* @__PURE__ */ new Set();
  for (const l of letters) {
    if (!l.party) continue;
    for (const name of splitParty(l.party)) {
      const dedupKey = [
        l.direction,
        name.toLowerCase(),
        l.subject,
        l.forwarded ? "f" : "",
        l.dateRaw ?? ""
      ].join("|");
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      korespondencja.push({ name, direction: l.direction, dateRaw: l.dateRaw ?? void 0, dateKey: l.dateKey });
    }
  }
  return korespondencja;
}
function archiveToLetterLike(l) {
  const digits = Number(l.sortKey.replace(/\D/g, ""));
  return {
    direction: directionOf(l.box),
    party: l.party,
    subject: l.subject,
    forwarded: l.forwarded === true,
    dateRaw: l.dateRaw,
    dateKey: digits > 0 ? digits : void 0
  };
}
function contactsFromArchive(letters) {
  return mergeContacts({
    people: [],
    przedstawieni: [],
    korespondencja: korespondencjaFromLetters(letters.map(archiveToLetterLike)),
    aliasy: []
  });
}
var SOURCE_ORDER = ["people", "przedstawieni", "korespondencja", "alias"];
function mergeContacts(input) {
  const byKey = /* @__PURE__ */ new Map();
  const get = (name) => {
    const key = name.toLowerCase();
    let c = byKey.get(key);
    if (!c) {
      c = { name, sources: [], lettersReceived: 0, lettersSent: 0 };
      byKey.set(key, c);
    }
    return c;
  };
  const addSource = (c, s) => {
    if (!c.sources.includes(s)) c.sources.push(s);
  };
  for (const p of input.people) {
    const c = get(p.name);
    c.name = p.name;
    addSource(c, "people");
    if (p.description) c.description = p.description;
    if (p.guild) c.guild = p.guild;
  }
  for (const name of input.przedstawieni) {
    const c = get(name);
    addSource(c, "przedstawieni");
  }
  for (const k of input.korespondencja) {
    const c = get(k.name);
    addSource(c, "korespondencja");
    if (k.direction === "in") c.lettersReceived++;
    else c.lettersSent++;
    if (k.dateKey !== void 0) {
      if (c.lastContactKey === void 0 || k.dateKey > c.lastContactKey) {
        c.lastContactKey = k.dateKey;
        if (k.dateRaw) c.lastContactRaw = k.dateRaw;
      }
    } else if (k.dateRaw && c.lastContactKey === void 0) {
      if (!c.lastContactRaw || k.dateRaw > c.lastContactRaw) {
        c.lastContactRaw = k.dateRaw;
      }
    }
  }
  for (const a of input.aliasy) {
    for (const target of a.targets) {
      const c = get(target);
      addSource(c, "alias");
      if (!c.mailAlias) c.mailAlias = a.name;
    }
  }
  const out = [...byKey.values()];
  for (const c of out) {
    c.sources.sort((x, y) => SOURCE_ORDER.indexOf(x) - SOURCE_ORDER.indexOf(y));
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  return out;
}
function viewContacts(contacts, opts = {}) {
  const f = (opts.filter ?? "").trim().toLowerCase();
  const filtered = f === "" ? [...contacts] : contacts.filter(
    (c) => c.name.toLowerCase().includes(f) || c.mailAlias !== void 0 && c.mailAlias.toLowerCase().includes(f)
  );
  const byName = (a, b) => a.name.localeCompare(b.name, "pl");
  switch (opts.sort ?? "nazwa") {
    case "liczba":
      filtered.sort(
        (a, b) => b.lettersReceived + b.lettersSent - (a.lettersReceived + a.lettersSent) || byName(a, b)
      );
      break;
    case "ostatni":
      filtered.sort(
        (a, b) => (b.lastContactKey ?? -1) - (a.lastContactKey ?? -1) || byName(a, b)
      );
      break;
    default:
      filtered.sort(byName);
  }
  return filtered;
}

// src/arkmail/core/archive.ts
var SENDER_BOXES2 = /* @__PURE__ */ new Set(["odebrane", "nieprzeczytane"]);
var RECIPIENT_BOXES = /* @__PURE__ */ new Set(["wyslane", "niewyslane"]);
function fnv1a(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function sortKeyOf(date) {
  if (!date) return "0000-00-00 00:00:00";
  const p = (n) => String(n).padStart(2, "0");
  return `${date.year}-${p(date.month)}-${p(date.day)} ${date.time}`;
}
function letterId(box, party, subject, forwarded, dateRaw) {
  return fnv1a([box, party, subject, forwarded ? "f" : "", dateRaw ?? ""].join("|"));
}
function fromMailboxEntry(box, entry) {
  const dateRaw = entry.date?.raw ?? null;
  return {
    id: letterId(box, entry.party, entry.subject, entry.forwarded, dateRaw),
    box,
    number: entry.number,
    party: entry.party,
    subject: entry.subject,
    forwarded: entry.forwarded,
    dateRaw,
    sortKey: sortKeyOf(entry.date),
    read: entry.isRead,
    body: []
  };
}
function fromOpenedLetter(box, letter, entry) {
  if (entry) {
    return { ...fromMailboxEntry(box, entry), read: true, body: letter.body };
  }
  const party = SENDER_BOXES2.has(box) ? letter.from : letter.to;
  const dateRaw = letter.date;
  const parsed = dateRaw ? parseMailDate(dateRaw) : null;
  return {
    id: letterId(box, party, letter.subject, false, dateRaw),
    box,
    number: letter.number,
    party,
    subject: letter.subject,
    forwarded: false,
    dateRaw,
    sortKey: sortKeyOf(parsed),
    read: true,
    body: letter.body
  };
}
function byNewest(a, b) {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
  if (a.number !== b.number) return b.number - a.number;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function upsertLetters(existing, incoming) {
  const map = new Map(existing.map((l) => [l.id, l]));
  let added = 0;
  let updated = 0;
  for (const inc of incoming) {
    const prev = map.get(inc.id);
    if (!prev) {
      map.set(inc.id, inc);
      added++;
      continue;
    }
    map.set(inc.id, {
      ...prev,
      ...inc,
      body: inc.body.length > 0 ? inc.body : prev.body
    });
    updated++;
  }
  return { letters: [...map.values()].sort(byNewest), added, updated };
}
var norm = (s) => s.toLowerCase();
function filterLetters(letters, filter) {
  return letters.filter((l) => {
    if (filter.od !== void 0) {
      if (!SENDER_BOXES2.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.od))) return false;
    }
    if (filter.do !== void 0) {
      if (!RECIPIENT_BOXES.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.do))) return false;
    }
    if (filter.osoba !== void 0 && !norm(l.party).includes(norm(filter.osoba))) return false;
    if (filter.skrzynka !== void 0 && l.box !== filter.skrzynka) return false;
    if (filter.temat !== void 0 && !norm(l.subject).includes(norm(filter.temat))) return false;
    if (filter.tresc !== void 0 && !norm(l.body.join("\n")).includes(norm(filter.tresc))) return false;
    if (filter.odDaty !== void 0 && l.sortKey.slice(0, 10) < filter.odDaty) return false;
    if (filter.doDaty !== void 0 && l.sortKey.slice(0, 10) > filter.doDaty) return false;
    return true;
  });
}

// src/arkmail/core/session/mailbox.ts
var MAIL_ERROR_RE = /^Data zostala podana w zlym formacie\./;
var MailboxSession = class {
  constructor(transport2, opts) {
    this.transport = transport2;
    this.opts = opts;
  }
  /**
   * Pobiera listing skrzynki. command: wlasna komenda (paginacja wstecz
   * "listy <skrzynka> przed <data>", patrz protocol/commands.ts);
   * domyslnie "listy <skrzynka>".
   */
  fetch(box, command) {
    return new Promise((resolve, reject) => {
      let header = null;
      const entries = [];
      let done = false;
      const idleMs = this.opts.idleMs ?? 600;
      let idleTimer = null;
      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        unsub();
      };
      const finish = (r) => {
        cleanup();
        resolve(r);
      };
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (done || !header) return;
          finish({ kind: "lista", header, entries });
        }, idleMs);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout: mailbox fetch ${box}`));
      }, this.opts.timeoutMs);
      const unsub = this.transport.subscribe((line) => {
        if (done) return;
        if (MAIL_ERROR_RE.test(line.text)) {
          cleanup();
          reject(new Error(line.text.trim()));
          return;
        }
        if (!header) {
          if (line.cls === "command" || isEchoLine(line.text)) return;
          const empty = parseEmptyListing(line.text);
          if (empty) {
            if (empty.box !== box) {
              cleanup();
              reject(new Error(`pusta ${empty.box} podczas fetch ${box}`));
              return;
            }
            finish({ kind: "pusta", box: empty.box, reason: empty.reason });
            return;
          }
          const h = parseListingHeader(line.text);
          if (h) {
            if (h.box !== box) {
              cleanup();
              reject(new Error(`listing ${h.box} podczas fetch ${box}`));
              return;
            }
            header = h;
            armIdle();
          }
          return;
        }
        if (line.cls === "prompt" || line.cls === "command" || isPromptLine(line.text) || isEchoLine(line.text)) {
          finish({ kind: "lista", header, entries });
          return;
        }
        armIdle();
        const entry = parseListingEntry(line.text);
        if (entry) {
          entries.push({ ...entry, party: "", partyKind: null, date: null });
          return;
        }
        const party = parseListingParty(line.text);
        if (party && entries.length > 0) {
          const last = entries[entries.length - 1];
          last.party = party.names;
          last.partyKind = party.kind;
          last.date = party.date;
        }
      });
      this.transport.send(command ?? `listy ${box}`);
    });
  }
};

// src/arkmail/core/session/pager.ts
var PAGER_REJECTION_RE = /Nie ma takiej komendy\./;
var PagerSession = class {
  constructor(transport2, opts) {
    this.transport = transport2;
    this.opts = opts;
  }
  readLetter(numer) {
    return this.run(numer, () => null, (letter, pager) => ({ letter, pager }));
  }
  deleteLetters(numer, zakres) {
    let deletedNumbers = [];
    return this.run(
      numer,
      (ctx) => ({
        onPager: () => ctx.send(`d ${zakres}`),
        onLine: (line) => {
          const m = line.text.match(/^Zaznaczono do skasowania: ([\d, ]+)\.$/);
          if (m) {
            deletedNumbers = m[1].split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
          }
          return m ? "close" : void 0;
        }
      }),
      () => ({ deleted: deletedNumbers.length > 0, deletedNumbers })
    );
  }
  forwardLetter(numer, adresat) {
    let queued = false;
    let error = null;
    let dwAnswered = false;
    return this.run(
      numer,
      (ctx) => ({
        onPager: () => ctx.send(`f ${adresat}`),
        onLine: (line) => {
          const err = parseMailError(line.text);
          if (err && err.kind === "brak-adresata") {
            if (!error) error = err;
            return void 0;
          }
          if (/^DW: *$/.test(line.text)) {
            if (!dwAnswered) {
              dwAnswered = true;
              ctx.send("");
            }
            return void 0;
          }
          if (line.text === "List jest gotowy do wyslania.") {
            queued = true;
            return "close";
          }
          return void 0;
        }
      }),
      () => ({ queued, error })
    );
  }
  /**
   * Otwiera pager na liscie `numer`, wykonuje akcje, zamyka "q".
   * onPager: odpalane przy pierwszym pager prompt (wyslij akcje).
   * onLine: moze zwrocic 'close' -> wysylamy "q" przy najblizszym
   * pager prompcie. Konczy sie na linii promptu (klasa albo tresc)
   * albo idle-flush po "q".
   */
  run(numer, makeActions, build) {
    return new Promise((resolve, reject) => {
      const letter = {
        number: numer,
        from: "",
        subject: "",
        to: "",
        cc: null,
        date: null,
        body: []
      };
      let pager = { lo: 0, hi: 0, current: numer };
      let state = "letter";
      let headersDone = false;
      let wantClose = false;
      let pagerFired = false;
      let idleOpened = false;
      let retried = false;
      let done = false;
      const idleMs = this.opts.idleMs ?? 600;
      let idleTimer = null;
      let quietTimer = null;
      let graceTimer = null;
      const actions = makeActions({ send: (l) => this.transport.send(l) });
      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        if (quietTimer) clearTimeout(quietTimer);
        if (graceTimer) clearTimeout(graceTimer);
        unsub();
      };
      const finish = () => {
        cleanup();
        resolve(build(letter, pager));
      };
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!done && state === "closing") finish();
        }, idleMs);
      };
      const onQuiet = () => {
        if (done) return;
        if (state === "letter" && headersDone) {
          state = "pager";
          pagerFired = true;
          idleOpened = true;
          if (actions && actions.onPager) {
            actions.onPager();
            armQuiet();
          } else {
            enterClosing();
          }
          return;
        }
        if (state === "pager" && (wantClose || idleOpened)) enterClosing();
      };
      const armQuiet = () => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(onQuiet, idleMs);
      };
      const timer = setTimeout(() => {
        if (state === "closing") {
          cleanup();
          reject(new Error(`timeout: pager session list ${numer}`));
          return;
        }
        state = "closing";
        wantClose = false;
        idleOpened = false;
        try {
          this.transport.send("q");
        } catch {
        }
        graceTimer = setTimeout(() => {
          cleanup();
          reject(new Error(`timeout: pager session list ${numer}`));
        }, Math.max(idleMs, 400));
      }, this.opts.timeoutMs);
      const enterClosing = () => {
        wantClose = false;
        idleOpened = false;
        state = "closing";
        if (quietTimer) clearTimeout(quietTimer);
        this.transport.send("q");
        armIdle();
      };
      const unsub = this.transport.subscribe((line) => {
        if (done || line.cls === "command" || isEchoLine(line.text)) return;
        if (state === "closing") {
          if (line.cls === "prompt" || isPromptLine(line.text)) {
            finish();
            return;
          }
          armIdle();
          return;
        }
        if (state === "recovering") {
          if (line.cls === "prompt" || isPromptLine(line.text)) {
            state = "letter";
            this.transport.send(`przeczytaj list ${numer}`);
          }
          return;
        }
        if (state === "letter" && !headersDone && PAGER_REJECTION_RE.test(line.text)) {
          this.transport.send("q");
          if (retried) {
            cleanup();
            reject(new Error(`pager session list ${numer}: odrzucono przez sierocy pager`));
            return;
          }
          retried = true;
          state = "recovering";
          return;
        }
        if (state === "letter" && !headersDone) {
          const mailErr = parseMailError(line.text);
          if (mailErr) {
            cleanup();
            reject(new Error(`pager session list ${numer}: ${line.text.trim()}`));
            return;
          }
        }
        const pp = extractPagerPrompt(line.text);
        if (pp) {
          if (quietTimer) clearTimeout(quietTimer);
          pager = pp;
          state = "pager";
          if (pagerFired && wantClose) {
            enterClosing();
            return;
          }
          if (!pagerFired) {
            pagerFired = true;
            if (actions && actions.onPager) {
              actions.onPager();
              return;
            }
            enterClosing();
            return;
          }
          return;
        }
        if (state === "letter" && !headersDone) {
          const h = parseLetterHeaderLine(line.text);
          if (h) {
            if (h.field === "numer") letter.number = Number(h.value);
            else if (h.field === "od") letter.from = h.value;
            else if (h.field === "temat") letter.subject = h.value;
            else if (h.field === "do") letter.to = h.value;
            else if (h.field === "dw") letter.cc = h.value;
            else if (h.field === "data") {
              letter.date = h.value;
              headersDone = true;
              armQuiet();
            }
            return;
          }
          return;
        }
        if (state === "letter") {
          letter.body.push(line.text);
          armQuiet();
          return;
        }
        if (actions && actions.onLine) {
          const verdict = actions.onLine(line);
          if (verdict === "close") wantClose = true;
        }
        armQuiet();
      });
      this.transport.send(`przeczytaj list ${numer}`);
    });
  }
};

// src/arkmail/core/session/editor.ts
var EditorSession = class {
  constructor(transport2, opts) {
    this.transport = transport2;
    this.opts = opts;
  }
  send(input) {
    return new Promise((resolve) => {
      let stage = "adresat";
      let done = false;
      const dw = input.dw ?? "";
      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        unsub();
      };
      const finish = (r) => {
        cleanup();
        resolve(r);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: "blad", error: { kind: "timeout" } });
      }, this.opts.timeoutMs);
      const flush = (confirmed) => {
        const order = ["adresat", "temat", "dw"];
        for (const c of confirmed) {
          const idx = order.indexOf(c);
          const cur = order.indexOf(stage);
          if (idx < cur) continue;
          if (c === "adresat") {
          } else if (c === "temat") {
            this.transport.send(input.temat);
          } else if (c === "dw") {
            this.transport.send(dw);
          }
          stage = order[idx + 1] ?? "tresc";
        }
        if (stage === "tresc") {
          for (const linia of input.linie) this.transport.send(linia);
          this.transport.send("**");
          stage = "tresc-wyslana";
        }
      };
      const unsub = this.transport.subscribe((line) => {
        if (done || line.cls === "command" || isEchoLine(line.text)) return;
        const err = parseMailError(line.text);
        if (err) {
          finish({ result: "blad", error: err });
          return;
        }
        const standalone = parseComposeResult(line.text);
        if (standalone) {
          finish({ result: standalone });
          return;
        }
        const echo = parseEditorEcho(line.text);
        if (echo?.result) {
          finish({ result: echo.result });
          return;
        }
        if (stage === "tresc-wyslana") return;
        const prompts = parseComposeEcho(line.text);
        if (prompts) {
          flush(prompts);
        }
      });
      this.transport.send("napisz list");
      this.transport.send(input.adresat);
    });
  }
};

// src/arkmail/core/sessionLock.ts
var SessionLock = class {
  constructor() {
    __publicField(this, "tail", Promise.resolve());
    __publicField(this, "active", 0);
  }
  /** true, gdy ktokolwiek trzyma blokade lub czeka w kolejce. */
  get locked() {
    return this.active > 0;
  }
  /** Czeka na swoja kolej i zwraca funkcje zwalniajaca (idempotentna). */
  async acquire() {
    this.active++;
    let releaseNext;
    const next = new Promise((resolve) => {
      releaseNext = resolve;
    });
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      releaseNext();
    };
  }
  /** Wykonuje fn pod blokada; zwalnia takze przy rzuceniu wyjatku. */
  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
};

// src/arkmail/adapters/dargothTransport.ts
var MODAL_HOOK_PRIORITY = 100;
var DargothTransport = class {
  constructor(api) {
    this.api = api;
    __publicField(this, "subscribers", /* @__PURE__ */ new Set());
    __publicField(this, "triggerArmed", false);
    __publicField(this, "modalActive", false);
    __publicField(this, "hookId", null);
    __publicField(this, "queue", []);
    __publicField(this, "bypass", /* @__PURE__ */ new Set());
  }
  send(line) {
    if (this.modalActive) this.bypass.add(line);
    void this.api.command.send(line, false);
  }
  subscribe(cb) {
    this.armTrigger();
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
  /** Liczba komend gracza odlozonych w trakcie sesji modalnej. */
  get modalQueueLength() {
    return this.queue.length;
  }
  beginModal() {
    if (this.modalActive) return;
    this.modalActive = true;
    this.hookId = this.api.commandHooks.register((command) => {
      if (this.bypass.delete(command)) return void 0;
      this.queue.push(command);
      return null;
    }, MODAL_HOOK_PRIORITY);
  }
  endModal() {
    if (!this.modalActive) return;
    this.modalActive = false;
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
    this.bypass.clear();
    const pending = this.queue.splice(0);
    for (const command of pending) void this.api.command.send(command);
  }
  /** Zdejmuje trigger i modal-guard; do wywolania w destroy() pluginu. */
  dispose() {
    this.endModal();
    if (this.triggerArmed) {
      this.api.triggers.removeByTag("arkmail");
      this.triggerArmed = false;
    }
    this.subscribers.clear();
    this.queue = [];
    this.bypass.clear();
  }
  armTrigger() {
    if (this.triggerArmed) return;
    this.triggerArmed = true;
    this.api.triggers.register(
      /^/,
      // 4. argument (originalLine) niesie dziewiczy tekst linii z gry -
      // system triggerow Dargoth przekazuje kolejnym callbackom buffer
      // po cudzych modyfikacjach (np. newMail klienta dokleja prefix
      // "\n[ POCZTA ] " i suffix "\n\n"), co lamalo dopasowania
      // (Fala 8a, dowod: Triggers.ts TriggerCallback + newMail.ts).
      (line, _matches, type, originalLine) => {
        const proto = { text: originalLine ?? line.text, cls: type ?? "" };
        for (const cb of [...this.subscribers]) cb(proto);
        return line;
      },
      "arkmail"
    );
  }
};

// src/arkmail/adapters/storage.ts
var CharStorage = class {
  constructor(kv) {
    this.kv = kv;
    __publicField(this, "char", "_unknown");
  }
  setCharacter(name) {
    const normalized = name.trim().toLowerCase();
    if (normalized) this.char = normalized;
  }
  get character() {
    return this.char;
  }
  getJSON(key) {
    const raw = this.kv.getItem(this.scoped(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  setJSON(key, value) {
    this.kv.setItem(this.scoped(key), JSON.stringify(value));
  }
  remove(key) {
    this.kv.removeItem(this.scoped(key));
  }
  scoped(key) {
    return `arkmail.${this.char}.${key}`;
  }
};

// src/arkmail/adapters/notify.ts
function notify(api, text, opts = {}) {
  api.events.emit("notify", opts.time !== void 0 ? { text, time: opts.time } : { text });
}

// src/arkmail/ui/store.ts
var DEFAULT_STATE = {
  tab: "listy",
  wide: false,
  activeBox: "odebrane",
  boxes: {},
  badge: 0,
  badgeUnsent: 0,
  busy: null,
  loadAll: null,
  search: null,
  letter: null,
  contacts: [],
  archive: [],
  notifyEnabled: false,
  animalFlying: false,
  unsentFlash: false,
  composeTemplate: "plain",
  composeWidth: 60
};
var MailUiStore = class {
  constructor(initial) {
    __publicField(this, "current");
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    /** Schowek pelnych widokow skrzynek na czas trybu wynikow szukania. */
    __publicField(this, "stashedViews", {});
    this.current = { ...DEFAULT_STATE, ...initial };
  }
  get state() {
    return this.current;
  }
  subscribe(cb) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  setTab(tab) {
    this.update({ tab });
  }
  /**
   * Flip szerokosci w trakcie czytania nie gubi listu (Fala 10):
   * wide->waski przenosi otwarty list do pelnego panelu (zakladka
   * 'list'), waski->wide wraca do podzialu (zakladka 'listy').
   * Bez otwartego listu zakladka zostaje jak jest.
   */
  setWide(wide) {
    const patch = { wide };
    if (this.current.letter) {
      if (!wide && this.current.tab === "listy") patch.tab = "list";
      else if (wide && this.current.tab === "list") patch.tab = "listy";
    }
    this.update(patch);
  }
  setActiveBox(box) {
    this.update({ activeBox: box });
  }
  applyMailbox(box, result) {
    const view = result.kind === "lista" ? { entries: result.entries, truncated: result.header.truncated, empty: null } : { entries: [], truncated: false, empty: result.reason };
    const boxes = { ...this.current.boxes, [box]: view };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
  }
  /**
   * Dokleja strone starszych listow (paginacja "Wybrane listy") PRZED
   * istniejace wpisy - widok trzyma kolejnosc serwera (najstarszy
   * pierwszy). Dedup po stronie/temacie/forwarded/dacie, bo numeracja
   * stron jest wzgledna i kotwica (+1 dzien) daje nakladanie.
   * truncated=false oznacza koniec starszych (przycisk znika).
   */
  /** Dokleja strone starszych wpisow; zwraca liczbe NOWYCH (po dedup). */
  appendMailboxPage(box, entries, truncated) {
    const view = this.current.boxes[box];
    if (!view) return 0;
    const key = (e) => [e.party, e.subject, e.forwarded ? "f" : "", e.date?.raw ?? ""].join("|");
    const known = new Set(view.entries.map(key));
    const fresh = entries.filter((e) => !known.has(key(e)));
    const next = {
      entries: [...fresh, ...view.entries],
      truncated,
      empty: null
    };
    const boxes = { ...this.current.boxes, [box]: next };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
    return fresh.length;
  }
  /**
   * Sync najnowszej strony z widokiem (Fala 12b; zastepuje "replace"
   * z Fali 11e jako domyslny tryb odswiezania). Wczytane starsze strony
   * ("Wczytaj starsze" / "Wczytaj wszystkie") NIE znikaja przy
   * odswiezeniu - gracz nie wraca do domyslnych 50 wpisow.
   *
   * - wpisy znane (tozsamosc: strona|temat|forwarded|data, jak w
   *   appendMailboxPage) aktualizowane sa W MIEJSCU (np. znacznik *R*);
   * - nowe listy doklejane sa NA KONCU tablicy (koniec najnowszy; UI
   *   renderuje odwrotnie, wiec laduja na gorze ekranu);
   * - znacznik uciecia: truncated = stary && nowy (zdjety dopiero, gdy
   *   mamy komplet);
   * - usuwanie wpisow TYLKO gdy swiezy listing jest kompletny (bez
   *   uciecia): wtedy serwer raportuje pelna prawde (np. przeczytany
   *   list znika z 'nieprzeczytane'). Przy ucietych listingach brak
   *   wpisu moze byc wypchnieciem poza pierwsza strone - nic nie
   *   usuwamy.
   *
   * Zwraca null, gdy brak widoku lub widok pusty - caller powinien
   * zrobic applyMailbox. Zwraca liczby {updated, added, removed}.
   */
  syncMailboxPage(box, entries, truncated) {
    const view = this.current.boxes[box];
    if (!view || view.empty !== null) return null;
    const key = (e) => [e.party, e.subject, e.forwarded ? "f" : "", e.date?.raw ?? ""].join("|");
    const pos = new Map(view.entries.map((e, i) => [key(e), i]));
    let next = [...view.entries];
    let updated = 0;
    let added = 0;
    for (const e of entries) {
      const i = pos.get(key(e));
      if (i === void 0) {
        pos.set(key(e), next.length);
        next.push(e);
        added += 1;
      } else {
        next[i] = e;
        updated += 1;
      }
    }
    let removed = 0;
    if (!truncated) {
      const freshKeys = new Set(entries.map(key));
      const kept = next.filter((e) => freshKeys.has(key(e)));
      removed = next.length - kept.length;
      next = kept;
    }
    const nextView = {
      entries: next,
      truncated: view.truncated && truncated,
      empty: null
    };
    const boxes = { ...this.current.boxes, [box]: nextView };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
    return { updated, added, removed };
  }
  setBusy(label) {
    this.update({ busy: label });
  }
  setLoadAll(loadAll) {
    this.update({ loadAll });
  }
  setSearch(search) {
    this.update({ search });
  }
  /**
   * Wpisy wynikow szukania ZASTEPUJA widok skrzynki; pelny widok
   * chowany jest do schowka (pierwszy raz na skrzynke - powtorne
   * szukanie nie nadpisuje schowka wynikami). Przywrocenie przez
   * clearSearch - bez strzalu do serwera.
   */
  applySearchResults(box, result) {
    if (!(box in this.stashedViews)) {
      const current = this.current.boxes[box];
      if (current) this.stashedViews[box] = current;
    }
    this.applyMailbox(box, result);
  }
  /** Przywraca schowany pelny widok skrzynki i konczy tryb szukania. */
  clearSearch(box) {
    const stashed = this.stashedViews[box];
    delete this.stashedViews[box];
    const patch = { search: null };
    if (stashed) {
      const boxes = { ...this.current.boxes, [box]: stashed };
      patch.boxes = boxes;
      const b = computeBadges(boxes);
      patch.badge = b.unread;
      patch.badgeUnsent = b.unsent;
    }
    this.update(patch);
  }
  /**
   * Kasuje tryb szukania BEZ przywracania schowka - dla swiezego
   * refresha skrzynki (nowy listing i tak nadpisze widok).
   */
  clearSearchBoxes(boxes) {
    for (const b of boxes) delete this.stashedViews[b];
    if (this.current.search && boxes.includes(this.current.search.box)) {
      this.update({ search: null });
    }
  }
  /** Otwiera list: waski -> zakladka 'list', szeroki -> zostaje w podziale. */
  openLetter(box, letter, source) {
    const next = { letter: { ...letter, box, source } };
    if (!this.current.wide) next.tab = "list";
    this.update(next);
  }
  closeLetter() {
    this.update({ letter: null, tab: "listy" });
  }
  /**
   * Czysci pamiec podreczna pluginu (Fala 12e): widoki skrzynek,
   * archiwum (RAM; storage kasuje caller), kontakty, schowek wynikow
   * szukania i tryb szukania. ZACHOWUJE ustawienia (powiadomienia,
   * szablon/szerokosc compose) i otwarty list.
   */
  clearCacheData() {
    for (const b of Object.keys(this.stashedViews)) {
      delete this.stashedViews[b];
    }
    this.update({
      boxes: {},
      archive: [],
      contacts: [],
      badge: 0,
      badgeUnsent: 0,
      search: null,
      unsentFlash: false
    });
  }
  setContacts(contacts) {
    this.update({ contacts });
  }
  setArchive(archive) {
    this.update({ archive });
  }
  setNotifyEnabled(notifyEnabled) {
    this.update({ notifyEnabled });
  }
  setAnimalFlying(animalFlying) {
    this.update({ animalFlying });
  }
  setUnsentFlash(unsentFlash) {
    this.update({ unsentFlash });
  }
  setCompose(prefs) {
    const patch = {};
    if (prefs.template !== void 0) patch.composeTemplate = prefs.template;
    if (prefs.width !== void 0) patch.composeWidth = prefs.width;
    this.update(patch);
  }
  update(patch) {
    this.current = { ...this.current, ...patch };
    for (const cb of [...this.listeners]) cb(this.current);
  }
};
function computeBadges(boxes) {
  const unreadBox = boxes.nieprzeczytane;
  const unread = unreadBox ? unreadBox.entries.length : boxes.odebrane?.entries.filter((e) => !e.isRead).length ?? 0;
  const unsent = boxes.niewyslane?.entries.length ?? 0;
  return { unread, unsent };
}
function formatBadgeSuffix(unread, unsent) {
  if (unread <= 0 && unsent <= 0) return "";
  return unsent > 0 ? ` (${unread}/${unsent})` : ` (${unread})`;
}

// src/arkmail/core/letterRender.ts
var MIN_LINE_WIDTH = 20;
var MAX_LINE_WIDTH = 120;
var DEFAULT_LINE_WIDTH = 60;
function clampLineWidth(width) {
  const rounded = Math.round(width);
  return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, rounded));
}
function normalizeLine(line) {
  return line.replace(/\s+/g, " ").trim();
}
function splitLongWord(word, width) {
  const parts = [];
  for (let i = 0; i < word.length; i += width) {
    parts.push(word.slice(i, i + width));
  }
  return parts;
}
var DEFAULT_LETTER_ALIGNMENT = "justify";
function justifyWords(words, lettersLength, width) {
  if (words.length === 1) {
    return words[0];
  }
  const gaps = words.length - 1;
  const totalSpaces = width - lettersLength;
  const baseSpace = Math.max(1, Math.floor(totalSpaces / gaps));
  let extra = totalSpaces - baseSpace * gaps;
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    let spaces = baseSpace;
    if (extra > 0) {
      spaces += 1;
      extra -= 1;
    }
    line += " ".repeat(spaces) + words[i];
  }
  return line;
}
function alignWords(words, width, alignment, isLastLine) {
  if (alignment === "justify" && !isLastLine) {
    return justifyWords(words, words.reduce((sum, word) => sum + word.length, 0), width);
  }
  const text = words.join(" ");
  if (alignment === "right") {
    return text.padStart(width, " ");
  }
  if (alignment === "center") {
    return " ".repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
  }
  return text;
}
function wrapWords(normalizedLine, width) {
  if (!normalizedLine) {
    return [];
  }
  const groups = [];
  let currentWords = [];
  let lettersLength = 0;
  const flush = () => {
    if (currentWords.length) {
      groups.push(currentWords);
    }
    currentWords = [];
    lettersLength = 0;
  };
  normalizedLine.split(" ").forEach((word) => {
    if (word.length > width) {
      flush();
      const parts = splitLongWord(word, width);
      const lastPart = parts.pop();
      parts.forEach((part) => groups.push([part]));
      if (lastPart) {
        currentWords = [lastPart];
        lettersLength = lastPart.length;
      }
      return;
    }
    const minimalSpaces = currentWords.length;
    if (lettersLength + word.length + minimalSpaces > width && currentWords.length) {
      flush();
    }
    currentWords.push(word);
    lettersLength += word.length;
  });
  flush();
  return groups;
}
function wrapLine(line, width, letterAlignment) {
  const alignRight = line.startsWith(">");
  const alignment = alignRight ? "right" : letterAlignment;
  const groups = wrapWords(normalizeLine(alignRight ? line.slice(1) : line), width);
  return groups.map((words, index) => alignWords(words, width, alignment, index === groups.length - 1));
}
function formatContent(content, width, alignment) {
  const rawLines = content.split(/\r?\n/);
  const result = [];
  let pendingBlankLine = false;
  let hasContent = false;
  rawLines.forEach((line) => {
    const wrapped = wrapLine(normalizeLine(line), width, alignment);
    if (!wrapped.length) {
      if (hasContent) {
        pendingBlankLine = true;
      }
      return;
    }
    if (pendingBlankLine && result.length) {
      result.push("");
      pendingBlankLine = false;
    }
    result.push(...wrapped);
    hasContent = true;
  });
  return result;
}
var FILL_PATTERN = /\{([^{}]+)\}/g;
function expandFillLine(line, width) {
  return line.replace(FILL_PATTERN, (_match, pattern) => pattern.repeat(Math.ceil(width / pattern.length)).slice(0, width));
}
function splitBodyPattern(pattern) {
  const lines = pattern.split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
function longestLength(lines) {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}
function getLayoutBodyWidth(layout, totalWidth) {
  if (layout.raw) {
    return Infinity;
  }
  const prefixWidth = longestLength(splitBodyPattern(layout.bodyPrefix));
  const suffixWidth = longestLength(splitBodyPattern(layout.bodySuffix));
  return Math.max(1, totalWidth - prefixWidth - suffixWidth);
}
function formatBody(layout, lines, width) {
  if (layout.raw) {
    return [...lines];
  }
  const prefixes = splitBodyPattern(layout.bodyPrefix);
  const suffixes = splitBodyPattern(layout.bodySuffix);
  const prefixWidth = longestLength(prefixes);
  const framed = prefixWidth > 0 || longestLength(suffixes) > 0;
  return lines.map((line, index) => {
    const trimmed = line.length > width ? line.slice(0, width) : line;
    if (!framed) {
      return trimmed.trimEnd();
    }
    const prefix = prefixes[index % prefixes.length].padEnd(prefixWidth, " ");
    const suffix = suffixes[index % suffixes.length];
    return `${prefix}${trimmed.padEnd(width, " ")}${suffix}`;
  });
}
var BUILTIN_LETTER_LAYOUTS = {
  none: {
    header: [],
    footer: [],
    bodyPrefix: "",
    bodySuffix: ""
  },
  plain: {
    header: [
      " +--{-}--+ ",
      " |  { }  | ",
      " |  { }  | "
    ],
    footer: [
      " |  { }  | ",
      " |  { }  | ",
      " +--{-}--+ "
    ],
    bodyPrefix: " |  ",
    bodySuffix: "  | "
  },
  parchment: {
    header: [
      "  ____{_}___  ",
      "/ \\   { }   \\.",
      "|  |  { }   |.",
      "\\_ |  { }   |.",
      "   |  { }   |."
    ],
    footer: [
      "   |  { }   |.   ",
      "   |   {_}__|___ ",
      "   |  /{ }     /.",
      "   \\_/_{_}____/. "
    ],
    bodyPrefix: "   |   ",
    bodySuffix: "  |."
  },
  parchment2: {
    header: [
      " ______{_}_____  ",
      " / _\\  { }     \\ ",
      "|/ >|  { }     | ",
      " |\\_/__{_}______/",
      " \\.    { }   ./  ",
      " |     { }   |   "
    ],
    footer: [
      " |  ___{_}___|   ",
      " |/\\   { }     \\ ",
      " \\_|   { }      |",
      "  \\_/_ {_}_____/ "
    ],
    bodyPrefix: " |     ",
    bodySuffix: "   |   "
  },
  parchment3: {
    header: [
      "             { }  .---.   ",
      "             { } /  .  \\ ",
      "             { }|\\_/|   |",
      "             { }|   |  /| ",
      "   .---------{-}-------'|",
      "  /  .-.     { }        | ",
      " |  /   \\   { }         |",
      " | |\\_.  |  { }         |",
      " |\\|  | /|  { }         |",
      " | `---' |  { }         |"
    ],
    footer: [
      " |       |   { }        /   ",
      " |       |---{-}--------' ",
      " \\       |  { }            ",
      " \\.___./    { }            "
    ],
    bodyPrefix: " |       |   ",
    bodySuffix: "        | "
  },
  raw: {
    header: [],
    footer: [],
    bodyPrefix: "",
    bodySuffix: "",
    raw: true
  }
};
function renderLetterLayout(content, layout, lineWidth = DEFAULT_LINE_WIDTH, alignment = DEFAULT_LETTER_ALIGNMENT) {
  const bodyWidth = getLayoutBodyWidth(layout, lineWidth);
  const baseLines = layout.raw ? content.split(/\r?\n/) : formatContent(content, bodyWidth, alignment);
  const bodySource = baseLines.length ? baseLines : [""];
  const lines = [
    ...layout.header.map((line) => expandFillLine(line, bodyWidth)),
    ...formatBody(layout, bodySource, bodyWidth),
    ...layout.footer.map((line) => expandFillLine(line, bodyWidth))
  ];
  const hasContent = baseLines.some((line) => line.length > 0);
  return { lines, hasContent };
}
function renderLetter(content, template, lineWidth = DEFAULT_LINE_WIDTH, alignment = DEFAULT_LETTER_ALIGNMENT) {
  return renderLetterLayout(content, BUILTIN_LETTER_LAYOUTS[template], lineWidth, alignment);
}

// src/arkmail/ui/styles.ts
var BG = "#1e1f24";
var BG_PANEL = "#26272e";
var BG_RAISED = "#31333c";
var BG_INPUT = "#141519";
var FG = "#e6e6ea";
var FG_DIM = "#9a9da8";
var BORDER = "#3a3c46";
var ACCENT = "#4a7de0";
var ACCENT_FG = "#ffffff";
var DANGER = "#b04a42";
var STYLES = `
.arkmail-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Fala 11c: panele scrolluja sie niezaleznie (overflow:auto na
     .arkmail-pane); root nie rosnie poza popup i nie scrolluje calosci. */
  overflow: hidden;
  box-sizing: border-box;
  padding: 10px;
  gap: 8px;
  background: ${BG};
  color: ${FG};
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
}
.arkmail-root *, .arkmail-root *::before, .arkmail-root *::after {
  box-sizing: border-box;
}

/* --- kontrolki bazowe: JAWNE kolory (bug bialy-na-bialym) --- */
.arkmail-root button {
  background: ${BG_RAISED};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  padding: 4px 12px;
  font: inherit;
  cursor: pointer;
}
.arkmail-root button:hover { background: #3b3d47; }
.arkmail-root input, .arkmail-root textarea, .arkmail-root select {
  background: ${BG_INPUT};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
}
.arkmail-root input:focus, .arkmail-root textarea:focus, .arkmail-root select:focus {
  outline: none;
  border-color: ${ACCENT};
}
.arkmail-root input[type='checkbox'] { accent-color: ${ACCENT}; }

/* --- zakladki: segmentowana belka --- */
.arkmail-tabs {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  background: ${BG_PANEL};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 3px;
}
.arkmail-root .arkmail-tab {
  border: 1px solid ${BG_PANEL};
  border-radius: 6px;
  background: ${BG_PANEL};
  color: ${FG_DIM};
  padding: 4px 12px;
}
.arkmail-root .arkmail-tab:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-tab-active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-tab-active:hover { background: ${ACCENT}; color: ${ACCENT_FG}; }

/* --- pasek operacji --- */
.arkmail-busy {
  padding: 5px 10px;
  border: 1px solid ${BORDER};
  border-left: 3px solid ${ACCENT};
  border-radius: 6px;
  background: ${BG_PANEL};
  color: ${FG_DIM};
}

/* --- panele --- */
.arkmail-pane {
  flex: 1;
  overflow: auto;
  min-height: 0;
  background: ${BG_PANEL};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 8px;
}
.arkmail-pane::-webkit-scrollbar { width: 8px; }
.arkmail-pane::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 4px; }

/* --- skrzynki: pigulki --- */
.arkmail-boxes { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.arkmail-root .arkmail-box {
  border-radius: 999px;
  padding: 3px 12px;
  background: ${BG};
  color: ${FG_DIM};
  border: 1px solid ${BORDER};
}
.arkmail-root .arkmail-box:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-box-active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-box-active:hover { background: ${ACCENT}; color: ${ACCENT_FG}; }

/* Fala 11e: zbiorcze operacje na aktywnej skrzynce (zamiast \u21BB per box). */
.arkmail-box-ops { display: flex; gap: 6px; margin-bottom: 8px; }
.arkmail-box-ops button { flex: 1; }
.arkmail-root button:disabled { opacity: 0.45; cursor: default; }
.arkmail-root button:disabled:hover { background: ${BG_RAISED}; }

/* --- wiersze listow: nadawca | temat | data --- */
.arkmail-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border-bottom: 1px solid ${BG};
  cursor: pointer;
}
.arkmail-entry:hover { background: ${BG_RAISED}; }
.arkmail-entry-num { color: ${FG_DIM}; font-size: 11px; min-width: 26px; text-align: right; }
.arkmail-entry-party {
  min-width: 110px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${FG};
}
.arkmail-entry-subject {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${FG_DIM};
}
.arkmail-entry-date { color: ${FG_DIM}; font-size: 11px; white-space: nowrap; }
.arkmail-unread .arkmail-entry-party, .arkmail-unread .arkmail-entry-subject {
  color: ${FG};
  font-weight: 700;
}
.arkmail-unread::before {
  content: '';
  align-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${ACCENT};
  flex: none;
}

.arkmail-root .arkmail-older { margin-top: 8px; width: 100%; }
.arkmail-older-row { display: flex; gap: 6px; margin-top: 8px; }
/* Fala 11a: szukajka stosowo (2 kolumny), nie 5 w linii - w waskiej
   kolumnie splitu pola tekstowe zachowuja sensowna szerokosc. */
.arkmail-search-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 8px 0;
  align-items: center;
}
.arkmail-search-row .arkmail-search-go { grid-column: 1 / -1; }
.arkmail-search-row input[type='date'] { color-scheme: dark; }
.arkmail-search-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: ${BG_RAISED};
  border: 1px solid ${ACCENT};
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
  color: ${FG};
  font-size: 12px;
}
.arkmail-root .arkmail-search-clear { flex: none; padding: 2px 10px; }
.arkmail-older-row .arkmail-older { margin-top: 0; flex: 1; }
.arkmail-root .arkmail-older-all { flex: 1; }
.arkmail-root button.arkmail-older-all { margin-top: 8px; width: 100%; }
.arkmail-older-row button.arkmail-older-all { margin-top: 0; width: auto; }

/* --- widok listu --- */
.arkmail-letter-head {
  position: relative;
  background: ${BG};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
}
.arkmail-letter-subject { font-size: 15px; font-weight: 700; color: ${FG}; }
.arkmail-letter-meta { color: ${FG_DIM}; font-size: 12px; margin-top: 2px; }
.arkmail-letter-body {
  white-space: pre-wrap;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: ${BG};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 10px 12px;
  color: ${FG};
}
.arkmail-letter-ops { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.arkmail-letter-ops input { flex: 1; }
.arkmail-root .arkmail-del {
  background: ${DANGER};
  border-color: ${DANGER};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-del:hover { background: #c2564d; }
.arkmail-fwd { flex: none; }

/* --- formularz compose --- */
.arkmail-form label { display: block; margin: 6px 0 3px; color: ${FG_DIM}; font-size: 12px; }
.arkmail-form input, .arkmail-form textarea, .arkmail-form select {
  width: 100%;
}
.arkmail-form textarea { min-height: 120px; resize: vertical; }
.arkmail-preview {
  margin: 0;
  padding: 8px 10px;
  background: ${BG_INPUT};
  color: ${FG_DIM};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre;
  overflow: auto;
  max-height: 220px;
}
/* Fala 12d: podglad compose bez obcinania. W split (wide) pre rozciaga
   sie na pelna wysokosc prawego panelu; tryb "Pelne okno" to ten sam
   pre na calym popupie. Belka z przyciskiem nad podgladem. */
.arkmail-preview-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.arkmail-preview-bar label { margin: 0; }
.arkmail-split-compose .arkmail-pane { display: flex; flex-direction: column; }
.arkmail-split-compose .arkmail-preview { flex: 1; max-height: none; }
.arkmail-preview-full-pane { display: flex; flex-direction: column; }
.arkmail-preview-full-pane .arkmail-preview { flex: 1; max-height: none; }
.arkmail-root .arkmail-send {
  margin-top: 10px;
  padding: 6px 18px;
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-send:hover { background: #5a8ae6; }

/* --- kontakty i archiwum --- */
.arkmail-contact, .arkmail-arch-entry {
  display: flex;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  border-bottom: 1px solid ${BG};
}
/* Fala 12c: klikalne jest IMIE (kierunek domyslny) + przyciski kierunku. */
.arkmail-contact:hover, .arkmail-arch-entry:hover { background: ${BG_RAISED}; }
.arkmail-contact-name { color: ${FG}; font-weight: 600; cursor: pointer; }
.arkmail-contact-name:hover { text-decoration: underline; }
.arkmail-contact-dirs { margin-left: auto; display: flex; gap: 4px; }
.arkmail-root .arkmail-contact-dir {
  background: ${BG_RAISED};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 11px;
  cursor: pointer;
}
.arkmail-root .arkmail-contact-dir:hover { border-color: ${FG_DIM}; }
.arkmail-root .arkmail-contact-dir:disabled {
  opacity: 0.4;
  cursor: default;
}
.arkmail-contact-stats, .arkmail-arch-meta { color: ${FG_DIM}; font-size: 12px; }
.arkmail-contact-controls { display: flex; gap: 6px; margin-bottom: 8px; }
.arkmail-arch-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.arkmail-arch-controls input[type='date'] { color-scheme: dark; }
.arkmail-root .arkmail-contact-filter { flex: 1; }
.arkmail-contact-last { color: ${FG_DIM}; font-size: 11px; white-space: nowrap; }

.arkmail-notify-toggle { margin-right: 4px; }
.arkmail-dim { color: ${FG_DIM}; }

/* --- ghost-podpowiedzi (Fala 9g): wyszarzona sugestia za kursorem --- */
.arkmail-root .arkmail-ghost-wrap { position: relative; display: block; min-width: 0; }
.arkmail-root .arkmail-ghost-wrap > input { width: 100%; box-sizing: border-box; }
/* wrap przejmuje rozciaganie inputa w wierszu operacji listu (flex) */
.arkmail-root .arkmail-letter-ops .arkmail-ghost-wrap { flex: 1; }
.arkmail-root .arkmail-ghost {
  position: absolute;
  inset: 0;
  /* padding inputu (5px 8px) + jego border (1px) = tekst 1:1 nad polem */
  padding: 6px 9px;
  overflow: hidden;
  pointer-events: none;
  white-space: pre;
}
.arkmail-root .arkmail-ghost-typed { visibility: hidden; white-space: pre; }
.arkmail-root .arkmail-ghost-rest { color: ${FG_DIM}; white-space: pre; }

/* --- podzial lista|list na szerokim popupie (Fala 10) ---
   Uklad sterowany WYLACZNIE klasa .arkmail-wide z JS (ResizeObserver,
   prog 900px) - zero @container, jedno zrodlo prawdy, testowalne. */
.arkmail-wide .arkmail-split {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr);
  gap: 10px;
  flex: 1;
  min-height: 0;
}
/* Fala 11d: compose - formularz szerszy, podglad wezszy. */
.arkmail-wide .arkmail-split-compose {
  grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
}
.arkmail-root .arkmail-letter-close {
  position: absolute;
  top: 6px;
  right: 10px;
  padding: 2px 10px;
}

/* Fala 14b: pulsowanie Listy/Niewyslane po odlozeniu listu w kolejce.
   Kontrakt uiStyles: jawne hex (bez transparent/inherit). */
@keyframes arkmailFlash {
  0%, 100% { background: ${BG_RAISED}; color: ${FG}; }
  50% { background: ${ACCENT}; color: ${ACCENT_FG}; }
}
.arkmail-root .arkmail-flash {
  animation: arkmailFlash 0.6s ease-in-out 5;
}
`;

// src/arkmail/ui/ghost.ts
function attachGhost(doc, input, source) {
  const wrap = doc.createElement("span");
  wrap.className = "arkmail-ghost-wrap";
  input.parentNode?.insertBefore(wrap, input);
  wrap.appendChild(input);
  const ghost = doc.createElement("span");
  ghost.className = "arkmail-ghost";
  ghost.style.display = "none";
  const typed = doc.createElement("span");
  typed.className = "arkmail-ghost-typed";
  const rest = doc.createElement("span");
  rest.className = "arkmail-ghost-rest";
  ghost.appendChild(typed);
  ghost.appendChild(rest);
  wrap.appendChild(ghost);
  let candidate = null;
  let escapeHidden = false;
  const hide = () => {
    candidate = null;
    ghost.style.display = "none";
  };
  const update = () => {
    escapeHidden = false;
    const value = input.value;
    const atEnd = input.selectionStart === value.length && input.selectionEnd === value.length;
    candidate = value.length > 0 && atEnd ? source().find(
      (c) => c.length > value.length && c.toLowerCase().startsWith(value.toLowerCase())
    ) ?? null : null;
    if (!candidate) {
      ghost.style.display = "none";
      return;
    }
    typed.textContent = value;
    rest.textContent = candidate.slice(value.length);
    ghost.style.display = "";
  };
  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("blur", hide);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowRight" && candidate && !escapeHidden) {
      const value = input.value;
      if (input.selectionStart === value.length && input.selectionEnd === value.length) {
        ev.preventDefault();
        input.value = candidate;
        input.selectionStart = candidate.length;
        input.selectionEnd = candidate.length;
        hide();
      }
    } else if (ev.key === "Escape" && candidate) {
      escapeHidden = true;
      ghost.style.display = "none";
    }
  });
}

// src/arkmail/ui/render.ts
var TEMPLATES = [
  ["none", "Bez ramki"],
  ["plain", "Prosta ramka"],
  ["parchment", "Pergamin"],
  ["parchment2", "Pergamin II"],
  ["parchment3", "Pergamin III"],
  ["raw", "Surowy (jak wpisane)"]
];
var TABS = [
  ["listy", "Listy"],
  ["napisz", "Napisz list"],
  ["kontakty", "Kontakty"],
  ["archiwum", "Archiwum"]
];
var BOXES = [
  ["odebrane", "Odebrane"],
  ["nieprzeczytane", "Nieprzeczytane"],
  ["wyslane", "Wyslane"],
  ["niewyslane", "Niewyslane"]
];
function mountMailUi(container, store2, handlers) {
  const doc = container.ownerDocument;
  const style = doc.createElement("style");
  style.textContent = STYLES;
  container.appendChild(style);
  const root = doc.createElement("div");
  container.appendChild(root);
  const archFilter = {};
  const contactView = { filter: "", sort: "nazwa" };
  let previewFull = false;
  const searchDraft = { osoba: "", temat: "", odDaty: "", doDaty: "" };
  const focusKeyOf = (el) => {
    if (!el || typeof el.getAttribute !== "function") return null;
    if (!root.contains(el)) return null;
    for (const attr of ["data-search", "data-field", "data-filter"]) {
      const v = el.getAttribute(attr);
      if (v !== null) return `[${attr}="${v}"]`;
    }
    return null;
  };
  const snapshotView = () => {
    const snap = { focusKey: null, focusValue: null, caret: null, scroll: {} };
    const active = doc.activeElement;
    const key = focusKeyOf(active);
    if (key) {
      snap.focusKey = key;
      snap.focusValue = active.value ?? null;
      const inp = active;
      try {
        if (typeof inp.selectionStart === "number") {
          snap.caret = [inp.selectionStart, inp.selectionEnd ?? inp.selectionStart];
        }
      } catch {
      }
    }
    for (const pane of Array.from(root.querySelectorAll("[data-pane-key]"))) {
      const k = pane.getAttribute("data-pane-key");
      if (k !== null) snap.scroll[k] = pane.scrollTop;
    }
    return snap;
  };
  const restoreView = (snap) => {
    for (const pane of Array.from(root.querySelectorAll("[data-pane-key]"))) {
      const k = pane.getAttribute("data-pane-key");
      if (k !== null && snap.scroll[k] !== void 0) {
        pane.scrollTop = snap.scroll[k];
      }
    }
    if (snap.focusKey) {
      const el = root.querySelector(snap.focusKey);
      if (el) {
        if (snap.focusValue !== null) el.value = snap.focusValue;
        el.focus();
        if (snap.caret) {
          try {
            el.setSelectionRange(snap.caret[0], snap.caret[1]);
          } catch {
          }
        }
      }
    }
  };
  const personSource = () => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    const push = (v) => {
      if (!v) return;
      const k = v.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    };
    const contacts = [...store2.state.contacts].sort(
      (a, b) => (b.lastContactKey ?? -1) - (a.lastContactKey ?? -1)
    );
    for (const c of contacts) {
      push(c.name);
      push(c.mailAlias);
    }
    return out;
  };
  const subjectSource = () => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const l of store2.state.archive) {
      if (!l.subject) continue;
      const k = l.subject.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(l.subject);
    }
    return out;
  };
  const render = (state) => {
    const snap = snapshotView();
    root.className = "arkmail-root" + (state.wide ? " arkmail-wide" : "");
    composePreview = null;
    if (state.tab !== "napisz") previewFull = false;
    const nodes = [renderTabs(state)];
    if (state.busy !== null) nodes.push(renderBusy(state.busy));
    if (state.tab === "napisz" && previewFull) {
      nodes.push(renderPreviewFull());
    } else if (state.wide && state.tab === "listy") {
      const split = doc.createElement("div");
      split.className = "arkmail-split";
      split.appendChild(renderListy(state));
      split.appendChild(renderList(state));
      nodes.push(split);
    } else if (state.wide && state.tab === "napisz") {
      const split = doc.createElement("div");
      split.className = "arkmail-split arkmail-split-compose";
      split.appendChild(renderNapisz(state));
      split.appendChild(renderComposePreview());
      nodes.push(split);
    } else {
      nodes.push(renderPane(state));
    }
    root.replaceChildren(...nodes);
    restoreView(snap);
  };
  const renderTabs = (state) => {
    const bar = doc.createElement("div");
    bar.className = "arkmail-tabs";
    for (const [id, label] of TABS) {
      const btn = doc.createElement("button");
      btn.className = "arkmail-tab" + (state.tab === id ? " arkmail-tab-active" : "") + // Fala 14b: flash po odlozeniu listu w niewyslanych (compose
      // poza poczta zawsze kolejkuje) - gracz widzi, gdzie kliknac.
      (state.unsentFlash && id === "listy" ? " arkmail-flash" : "");
      btn.setAttribute("data-tab", id);
      btn.textContent = id === "listy" ? label + formatBadgeSuffix(state.badge, state.badgeUnsent) : label;
      btn.addEventListener("click", () => store2.setTab(id));
      bar.appendChild(btn);
    }
    return bar;
  };
  const renderBusy = (label) => {
    const el = doc.createElement("div");
    el.className = "arkmail-busy";
    el.textContent = `${label}`;
    return el;
  };
  const renderPane = (state) => {
    switch (state.tab) {
      case "listy":
        return renderListy(state);
      case "list":
        return renderList(state);
      case "napisz":
        return renderNapisz(state);
      case "kontakty":
        return renderKontakty(state);
      case "archiwum":
        return renderArchiwum(state);
    }
  };
  const renderListy = (state) => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane";
    pane.setAttribute("data-pane-key", `listy:${state.activeBox}`);
    const boxes = doc.createElement("div");
    boxes.className = "arkmail-boxes";
    for (const [box, label] of BOXES) {
      const btn = doc.createElement("button");
      btn.className = "arkmail-box" + (state.activeBox === box ? " arkmail-box-active" : "") + // Fala 14b: flash celu kolejki niewyslanych (jak zakladka Listy).
      (state.unsentFlash && box === "niewyslane" ? " arkmail-flash" : "");
      btn.setAttribute("data-box", box);
      btn.textContent = label;
      btn.addEventListener("click", () => {
        store2.setActiveBox(box);
        handlers.onRefreshBox(box);
      });
      boxes.appendChild(btn);
    }
    pane.appendChild(boxes);
    const ops = doc.createElement("div");
    ops.className = "arkmail-box-ops";
    const refreshAll = doc.createElement("button");
    refreshAll.className = "arkmail-refresh-global";
    refreshAll.textContent = "Odswiez";
    refreshAll.addEventListener("click", () => handlers.onRefreshBox(state.activeBox));
    ops.appendChild(refreshAll);
    const animalBtn = doc.createElement("button");
    animalBtn.className = "arkmail-animal-send";
    animalBtn.textContent = state.animalFlying ? "Zwierze w drodze..." : "Wyslij Zwierze";
    if (state.animalFlying) animalBtn.setAttribute("disabled", "");
    animalBtn.addEventListener("click", () => handlers.onSendAnimal?.());
    ops.appendChild(animalBtn);
    const view0 = state.boxes[state.activeBox];
    const searchMode0 = state.search && state.search.box === state.activeBox ? state.search : null;
    const loopHere = state.loadAll !== null && state.loadAll.box === state.activeBox;
    const loadAllBtn = doc.createElement("button");
    loadAllBtn.className = "arkmail-older-all";
    loadAllBtn.textContent = loopHere ? `Przerwij (strona ${state.loadAll.pages})` : "Wczytaj wszystkie";
    const nothingToLoad = !loopHere && (searchMode0 !== null || !view0 || view0.empty !== null || !view0.truncated || state.loadAll !== null);
    if (nothingToLoad) loadAllBtn.setAttribute("disabled", "");
    loadAllBtn.addEventListener("click", () => handlers.onLoadAll(state.activeBox));
    ops.appendChild(loadAllBtn);
    const clearBtn = doc.createElement("button");
    clearBtn.className = "arkmail-cache-clear";
    clearBtn.textContent = "Wyczysc pamiec podreczna";
    let clearArmed = false;
    let clearTimer = null;
    clearBtn.addEventListener("click", () => {
      if (!clearArmed) {
        clearArmed = true;
        clearBtn.textContent = "Na pewno? Kliknij ponownie";
        clearTimer = setTimeout(() => {
          clearArmed = false;
          clearBtn.textContent = "Wyczysc pamiec podreczna";
        }, 3e3);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      clearBtn.textContent = "Wyczysc pamiec podreczna";
      handlers.onClearCache?.();
    });
    ops.appendChild(clearBtn);
    pane.appendChild(ops);
    const notifyRow = doc.createElement("label");
    notifyRow.className = "arkmail-dim";
    const chk = doc.createElement("input");
    chk.setAttribute("type", "checkbox");
    chk.className = "arkmail-notify-toggle";
    chk.checked = state.notifyEnabled;
    chk.addEventListener("click", () => store2.setNotifyEnabled(!store2.state.notifyEnabled));
    notifyRow.appendChild(chk);
    notifyRow.appendChild(doc.createTextNode(" Powiadom o nowej poczcie"));
    pane.appendChild(notifyRow);
    const searchRow = doc.createElement("div");
    searchRow.className = "arkmail-search-row";
    const mkSearch = (key, placeholder, type = "text") => {
      const input = doc.createElement("input");
      input.setAttribute("data-search", key);
      input.setAttribute("type", type);
      input.setAttribute("placeholder", placeholder);
      input.value = searchDraft[key] ?? "";
      input.addEventListener("input", () => {
        searchDraft[key] = input.value;
      });
      return input;
    };
    const sOsoba = mkSearch("osoba", "Osoba");
    const sTemat = mkSearch("temat", "Temat");
    const sOd = mkSearch("odDaty", "Od dnia", "date");
    const sDo = mkSearch("doDaty", "Do dnia", "date");
    const go = doc.createElement("button");
    go.className = "arkmail-search-go";
    go.textContent = "Szukaj";
    go.addEventListener("click", () => {
      const osoba = sOsoba.value.trim();
      const temat = sTemat.value.trim();
      const odDaty = fromISODate(sOd.value) ?? void 0;
      const doDaty = fromISODate(sDo.value) ?? void 0;
      const query = {
        ...osoba !== "" ? { osoba } : {},
        ...odDaty ? { odDaty } : {},
        ...doDaty ? { doDaty } : {},
        ...temat !== "" ? { temat } : {}
      };
      if (Object.keys(query).length === 0) return;
      handlers.onSearch(state.activeBox, query);
    });
    searchRow.appendChild(sOsoba);
    searchRow.appendChild(sTemat);
    searchRow.appendChild(sOd);
    searchRow.appendChild(sDo);
    searchRow.appendChild(go);
    pane.appendChild(searchRow);
    attachGhost(doc, sOsoba, personSource);
    attachGhost(doc, sTemat, subjectSource);
    const searchMode = state.search && state.search.box === state.activeBox ? state.search : null;
    if (searchMode) {
      const banner = doc.createElement("div");
      banner.className = "arkmail-search-banner";
      banner.appendChild(doc.createTextNode(`Wyniki szukania: ${searchMode.label}`));
      const clear = doc.createElement("button");
      clear.className = "arkmail-search-clear";
      clear.textContent = "Wyczysc";
      clear.addEventListener("click", () => handlers.onClearSearch(state.activeBox));
      banner.appendChild(clear);
      pane.appendChild(banner);
    }
    const view = state.boxes[state.activeBox];
    if (!view) {
      pane.appendChild(dim("Skrzynka nie zaladowana - kliknij jej nazwe, aby pobrac."));
      return pane;
    }
    if (view.empty !== null) {
      pane.appendChild(dim(view.empty === "puste" ? "Skrzynka pusta." : "Brak pasujacych listow."));
      return pane;
    }
    const displayed = [...view.entries].reverse();
    for (const [idx, e] of displayed.entries()) {
      const row = doc.createElement("div");
      const unreadMark = !e.isRead && (state.activeBox === "odebrane" || state.activeBox === "nieprzeczytane");
      row.className = "arkmail-entry" + (unreadMark ? " arkmail-unread" : "");
      row.setAttribute("data-number", String(e.number));
      const num = doc.createElement("span");
      num.className = "arkmail-entry-num";
      num.textContent = `${idx + 1}.`;
      row.appendChild(num);
      const party = doc.createElement("span");
      party.className = "arkmail-entry-party";
      party.textContent = e.party || "\u2014";
      row.appendChild(party);
      const subject = doc.createElement("span");
      subject.className = "arkmail-entry-subject";
      subject.textContent = e.subject + (e.forwarded ? " (forwardowany)" : "");
      row.appendChild(subject);
      const date = doc.createElement("span");
      date.className = "arkmail-entry-date";
      date.textContent = e.date ? e.date.raw : "";
      row.appendChild(date);
      row.addEventListener("click", () => handlers.onOpenLetter(state.activeBox, e));
      pane.appendChild(row);
    }
    if (searchMode) {
    } else if (view.truncated && !state.loadAll) {
      const btn = doc.createElement("button");
      btn.className = "arkmail-older";
      btn.textContent = "Wczytaj starsze";
      btn.addEventListener("click", () => handlers.onLoadOlder(state.activeBox));
      pane.appendChild(btn);
    }
    return pane;
  };
  const renderList = (state) => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane";
    const l = state.letter;
    pane.setAttribute("data-pane-key", l ? `list:${l.box}:${l.number}` : "list:brak");
    if (!l) {
      pane.appendChild(
        dim(state.wide ? "Wybierz list z listy, aby go przeczytac." : "Nie otwarto zadnego listu.")
      );
      return pane;
    }
    const head = doc.createElement("div");
    head.className = "arkmail-letter-head";
    if (state.wide) {
      const close = doc.createElement("button");
      close.className = "arkmail-letter-close";
      close.textContent = "Zamknij";
      close.addEventListener("click", () => handlers.onCloseLetter());
      head.appendChild(close);
    }
    const subj = doc.createElement("div");
    subj.className = "arkmail-letter-subject";
    subj.textContent = l.subject;
    head.appendChild(subj);
    const meta = doc.createElement("div");
    meta.className = "arkmail-letter-meta";
    const parts = [`Od: ${l.from}`];
    if (l.to) parts.push(`Do: ${l.to}`);
    if (l.cc) parts.push(`DW: ${l.cc}`);
    if (l.date) parts.push(l.date);
    meta.textContent = parts.join(" | ");
    head.appendChild(meta);
    pane.appendChild(head);
    const body = doc.createElement("div");
    body.className = "arkmail-letter-body";
    body.textContent = l.body.join("\n");
    pane.appendChild(body);
    const ops = doc.createElement("div");
    ops.className = "arkmail-letter-ops";
    const source = l.source;
    const replyTo = (all) => {
      const received = l.box === "odebrane" || l.box === "nieprzeczytane";
      composeDraft.adresat = received ? l.from : l.to || l.cc || "";
      composeDraft.dw = all && l.cc ? l.cc : "";
      composeDraft.temat = "";
      composeDraft.tresc = "";
      store2.setTab("napisz");
    };
    const reply = doc.createElement("button");
    reply.className = "arkmail-reply";
    reply.textContent = "Odpowiedz";
    reply.addEventListener("click", () => replyTo(false));
    ops.appendChild(reply);
    const replyAll = doc.createElement("button");
    replyAll.className = "arkmail-reply-all";
    replyAll.textContent = "Odpowiedz wszystkim";
    replyAll.addEventListener("click", () => replyTo(true));
    ops.appendChild(replyAll);
    const del = doc.createElement("button");
    del.className = "arkmail-del";
    del.textContent = "Usun";
    if (source) {
      let delArmed = false;
      let delTimer = null;
      del.addEventListener("click", () => {
        if (!delArmed) {
          delArmed = true;
          del.textContent = "Na pewno? Kliknij ponownie";
          delTimer = setTimeout(() => {
            delArmed = false;
            del.textContent = "Usun";
          }, 3e3);
          return;
        }
        if (delTimer) clearTimeout(delTimer);
        delArmed = false;
        del.textContent = "Usun";
        handlers.onDeleteLetter(l.box, source);
      });
    } else {
      del.setAttribute("disabled", "");
      del.setAttribute("title", "Otworz list z zakladki Listy, aby go skasowac.");
    }
    ops.appendChild(del);
    const fwdInput = doc.createElement("input");
    fwdInput.setAttribute("data-field", "forward");
    fwdInput.setAttribute("placeholder", "Przekaz do (gracz lub alias)");
    if (!source) fwdInput.setAttribute("disabled", "");
    ops.appendChild(fwdInput);
    attachGhost(doc, fwdInput, personSource);
    const fwd = doc.createElement("button");
    fwd.className = "arkmail-fwd";
    fwd.textContent = "Przekaz";
    if (source) {
      fwd.addEventListener("click", () => {
        const adresat = fwdInput.value.trim();
        if (adresat) handlers.onForwardLetter(l.box, source, adresat);
      });
    } else {
      fwd.setAttribute("disabled", "");
      fwd.setAttribute("title", "Otworz list z zakladki Listy, aby go przekazac.");
    }
    ops.appendChild(fwd);
    pane.appendChild(ops);
    if (!state.wide) {
      const back = doc.createElement("button");
      back.className = "arkmail-older";
      back.textContent = "Zamknij list";
      back.addEventListener("click", () => handlers.onCloseLetter());
      pane.appendChild(back);
    }
    return pane;
  };
  const composeDraft = { adresat: "", temat: "", dw: "", tresc: "" };
  let composePreview = null;
  const repaintCompose = () => {
    if (!composePreview) return;
    const st = store2.state;
    composePreview.textContent = renderLetter(
      composeDraft.tresc,
      st.composeTemplate,
      st.composeWidth
    ).lines.join("\n");
  };
  const previewOpenBtn = () => {
    const btn = doc.createElement("button");
    btn.className = "arkmail-preview-open";
    btn.textContent = "Pelne okno";
    btn.addEventListener("click", () => {
      previewFull = true;
      render(store2.state);
    });
    return btn;
  };
  const renderPreviewFull = () => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane arkmail-preview-full-pane";
    pane.setAttribute("data-pane-key", "napisz:podglad-full");
    const bar = doc.createElement("div");
    bar.className = "arkmail-preview-bar";
    const lab = doc.createElement("label");
    lab.textContent = "Podglad (tak list zostanie wyslany)";
    bar.appendChild(lab);
    const close = doc.createElement("button");
    close.className = "arkmail-preview-close";
    close.textContent = "Zamknij podglad";
    close.addEventListener("click", () => {
      previewFull = false;
      render(store2.state);
    });
    bar.appendChild(close);
    pane.appendChild(bar);
    const pre = doc.createElement("pre");
    pre.className = "arkmail-preview";
    pane.appendChild(pre);
    composePreview = pre;
    repaintCompose();
    return pane;
  };
  const renderComposePreview = () => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane";
    pane.setAttribute("data-pane-key", "napisz:podglad");
    const bar = doc.createElement("div");
    bar.className = "arkmail-preview-bar";
    const lab = doc.createElement("label");
    lab.textContent = "Podglad (tak list zostanie wyslany)";
    bar.appendChild(lab);
    bar.appendChild(previewOpenBtn());
    pane.appendChild(bar);
    const pre = doc.createElement("pre");
    pre.className = "arkmail-preview";
    pane.appendChild(pre);
    composePreview = pre;
    repaintCompose();
    return pane;
  };
  const renderNapisz = (state) => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane arkmail-form";
    pane.setAttribute("data-pane-key", "napisz");
    const fields = [
      ["adresat", "Adresat"],
      ["temat", "Temat"],
      ["dw", "DW (opcjonalnie)"]
    ];
    for (const [field, label] of fields) {
      const lab2 = doc.createElement("label");
      lab2.textContent = label;
      pane.appendChild(lab2);
      const input = doc.createElement("input");
      input.setAttribute("data-field", field);
      input.value = composeDraft[field];
      input.addEventListener("input", () => {
        composeDraft[field] = input.value;
      });
      pane.appendChild(input);
      if (field === "temat") attachGhost(doc, input, subjectSource);
      else attachGhost(doc, input, personSource);
    }
    const labSz = doc.createElement("label");
    labSz.textContent = "Szablon";
    pane.appendChild(labSz);
    const sel = doc.createElement("select");
    sel.setAttribute("data-field", "szablon");
    for (const [value, label] of TEMPLATES) {
      const opt = doc.createElement("option");
      opt.setAttribute("value", value);
      opt.textContent = label;
      sel.appendChild(opt);
    }
    sel.value = state.composeTemplate;
    sel.addEventListener("change", () => {
      store2.setCompose({ template: sel.value });
    });
    pane.appendChild(sel);
    const labW = doc.createElement("label");
    labW.textContent = "Szerokosc linii (20-120)";
    pane.appendChild(labW);
    const width = doc.createElement("input");
    width.setAttribute("data-field", "szerokosc");
    width.value = String(state.composeWidth);
    width.addEventListener("change", () => {
      const parsed = Number.parseInt(width.value, 10);
      store2.setCompose({
        width: Number.isFinite(parsed) ? clampLineWidth(parsed) : 60
      });
    });
    pane.appendChild(width);
    const lab = doc.createElement("label");
    lab.textContent = "Tresc";
    pane.appendChild(lab);
    const tresc = doc.createElement("textarea");
    tresc.setAttribute("data-field", "tresc");
    tresc.value = composeDraft.tresc;
    pane.appendChild(tresc);
    if (!state.wide) {
      const barP = doc.createElement("div");
      barP.className = "arkmail-preview-bar";
      const labP = doc.createElement("label");
      labP.textContent = "Podglad (tak list zostanie wyslany)";
      barP.appendChild(labP);
      barP.appendChild(previewOpenBtn());
      pane.appendChild(barP);
      const preview = doc.createElement("pre");
      preview.className = "arkmail-preview";
      pane.appendChild(preview);
      composePreview = preview;
      repaintCompose();
    }
    tresc.addEventListener("input", () => {
      composeDraft.tresc = tresc.value;
      repaintCompose();
    });
    const send = doc.createElement("button");
    send.className = "arkmail-send";
    send.textContent = "Zapisz w kolejce do wyslania";
    const SEND_LABEL = "Zapisz w kolejce do wyslania";
    let sendArmed = false;
    let sendTimer = null;
    const disarmSend = () => {
      sendArmed = false;
      send.textContent = SEND_LABEL;
    };
    send.addEventListener("click", () => {
      const st = store2.state;
      const rendered = renderLetter(tresc.value, st.composeTemplate, st.composeWidth);
      if (!rendered.hasContent) return;
      const val = (f) => pane.querySelector(`[data-field="${f}"]`).value;
      if (!val("adresat").trim()) {
        if (sendTimer) clearTimeout(sendTimer);
        sendArmed = false;
        send.textContent = "Podaj adresata.";
        sendTimer = setTimeout(disarmSend, 3e3);
        return;
      }
      if (!val("temat").trim() && !sendArmed) {
        sendArmed = true;
        send.textContent = "Temat pusty - na pewno? Kliknij ponownie";
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = setTimeout(disarmSend, 3e3);
        return;
      }
      if (sendTimer) clearTimeout(sendTimer);
      disarmSend();
      handlers.onSendCompose({
        adresat: val("adresat"),
        temat: val("temat"),
        dw: val("dw"),
        linie: rendered.lines
      });
    });
    pane.appendChild(send);
    const clearCompose = doc.createElement("button");
    clearCompose.className = "arkmail-compose-clear";
    clearCompose.textContent = "Wyczysc";
    let clearArmed = false;
    let clearTimer = null;
    clearCompose.addEventListener("click", () => {
      if (!clearArmed) {
        clearArmed = true;
        clearCompose.textContent = "Na pewno? Kliknij ponownie";
        clearTimer = setTimeout(() => {
          clearArmed = false;
          clearCompose.textContent = "Wyczysc";
        }, 3e3);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      clearCompose.textContent = "Wyczysc";
      composeDraft.adresat = "";
      composeDraft.temat = "";
      composeDraft.dw = "";
      composeDraft.tresc = "";
      for (const f of ["adresat", "temat", "dw", "tresc"]) {
        const el = pane.querySelector(`[data-field="${f}"]`);
        if (el) el.value = "";
      }
      repaintCompose();
    });
    pane.appendChild(clearCompose);
    return pane;
  };
  const renderKontakty = (state) => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane";
    pane.setAttribute("data-pane-key", "kontakty");
    const controls = doc.createElement("div");
    controls.className = "arkmail-contact-controls";
    const input = doc.createElement("input");
    input.className = "arkmail-contact-filter";
    input.setAttribute("data-filter", "kontakty");
    input.setAttribute("placeholder", "Filtr: nazwa lub alias");
    input.value = contactView.filter;
    const sel = doc.createElement("select");
    sel.className = "arkmail-contact-sort";
    const SORT_OPTS = [
      ["nazwa", "Nazwa A-Z"],
      ["liczba", "Liczba listow"],
      ["ostatni", "Ostatni kontakt"]
    ];
    for (const [value, label] of SORT_OPTS) {
      const o = doc.createElement("option");
      o.setAttribute("value", value);
      o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = contactView.sort;
    controls.appendChild(input);
    controls.appendChild(sel);
    pane.appendChild(controls);
    const list = doc.createElement("div");
    pane.appendChild(list);
    const repaint = () => {
      const rows = viewContacts(state.contacts, contactView);
      list.replaceChildren(
        ...rows.map((c) => {
          const row = doc.createElement("div");
          row.className = "arkmail-contact";
          const name = doc.createElement("span");
          name.className = "arkmail-contact-name";
          name.textContent = c.name;
          const jumpTo = (box) => {
            searchDraft.osoba = c.name;
            store2.setActiveBox(box);
            store2.setTab("listy");
            handlers.onSearch(box, { osoba: c.name });
          };
          name.setAttribute("title", "Pokaz listy tej osoby (domyslnie: odebrane)");
          name.addEventListener("click", () => {
            if (c.lettersReceived > 0) jumpTo("odebrane");
            else if (c.lettersSent > 0) jumpTo("wyslane");
          });
          row.appendChild(name);
          const stats = doc.createElement("span");
          stats.className = "arkmail-contact-stats";
          stats.textContent = `(odebrane: ${c.lettersReceived}, wyslane: ${c.lettersSent})` + (c.mailAlias ? ` alias: ${c.mailAlias}` : "");
          row.appendChild(stats);
          if (c.lastContactRaw) {
            const last = doc.createElement("span");
            last.className = "arkmail-contact-last";
            last.textContent = c.lastContactRaw;
            row.appendChild(last);
          }
          const dirs = doc.createElement("span");
          dirs.className = "arkmail-contact-dirs";
          const DIR_OPTS = [
            ["odebrane", "Odebrane", c.lettersReceived],
            ["wyslane", "Wyslane", c.lettersSent]
          ];
          for (const [box, label, count] of DIR_OPTS) {
            const btn = doc.createElement("button");
            btn.className = "arkmail-contact-dir";
            btn.setAttribute("data-dir", box);
            btn.textContent = label;
            if (count === 0) {
              btn.setAttribute("disabled", "1");
              btn.setAttribute("title", "Brak listow w tym kierunku");
            } else {
              btn.addEventListener("click", () => jumpTo(box));
            }
            dirs.appendChild(btn);
          }
          row.appendChild(dirs);
          return row;
        })
      );
      if (rows.length === 0) {
        list.replaceChildren(
          dim(
            state.contacts.length === 0 ? "Brak kontaktow - pojawia sie po pobraniu listingow." : "Filtr niczego nie trafia."
          )
        );
      }
    };
    input.addEventListener("input", () => {
      contactView.filter = input.value;
      repaint();
    });
    sel.addEventListener("change", () => {
      contactView.sort = sel.value;
      repaint();
    });
    repaint();
    return pane;
  };
  const renderArchiwum = (state) => {
    const pane = doc.createElement("div");
    pane.className = "arkmail-pane";
    pane.setAttribute("data-pane-key", "archiwum");
    const controls = doc.createElement("div");
    controls.className = "arkmail-arch-controls";
    const mkText = (key, placeholder, type = "text") => {
      const input = doc.createElement("input");
      input.setAttribute("data-filter", key);
      input.setAttribute("type", type);
      input.setAttribute("placeholder", placeholder);
      input.value = archFilter[key] ?? "";
      input.addEventListener("input", () => {
        archFilter[key] = input.value === "" ? void 0 : input.value;
        repaint();
      });
      return input;
    };
    const aOsoba = mkText("osoba", "Osoba (nadawca lub odbiorca)");
    controls.appendChild(aOsoba);
    attachGhost(doc, aOsoba, personSource);
    const skr = doc.createElement("select");
    skr.setAttribute("data-filter", "skrzynka");
    const SKR_OPTS = [
      ["", "Wszystkie skrzynki"],
      ["odebrane", "Odebrane"],
      ["nieprzeczytane", "Nieprzeczytane"],
      ["wyslane", "Wyslane"],
      ["niewyslane", "Niewyslane"]
    ];
    for (const [value, label] of SKR_OPTS) {
      const o = doc.createElement("option");
      o.setAttribute("value", value);
      o.textContent = label;
      skr.appendChild(o);
    }
    skr.value = archFilter.skrzynka ?? "";
    skr.addEventListener("change", () => {
      archFilter.skrzynka = skr.value === "" ? void 0 : skr.value;
      repaint();
    });
    controls.appendChild(skr);
    const aTemat = mkText("temat", "Temat");
    controls.appendChild(aTemat);
    attachGhost(doc, aTemat, subjectSource);
    controls.appendChild(mkText("tresc", "Tresc listu"));
    controls.appendChild(mkText("odDaty", "Od daty", "date"));
    controls.appendChild(mkText("doDaty", "Do daty", "date"));
    pane.appendChild(controls);
    const list = doc.createElement("div");
    pane.appendChild(list);
    const repaint = () => {
      const rows = filterLetters(state.archive, archFilter);
      list.replaceChildren(
        ...rows.map((l, idx) => {
          const row = doc.createElement("div");
          row.className = "arkmail-arch-entry";
          const subj = doc.createElement("span");
          subj.textContent = `${idx + 1}. ${l.subject}`;
          row.appendChild(subj);
          const meta = doc.createElement("span");
          meta.className = "arkmail-arch-meta";
          const dir = l.box === "odebrane" || l.box === "nieprzeczytane" ? "od" : "do";
          meta.textContent = `${dir} ${l.party} | ${l.box}`;
          row.appendChild(meta);
          return row;
        })
      );
      if (rows.length === 0) {
        list.replaceChildren(dim("Archiwum puste albo filtr niczego nie trafia."));
      }
    };
    repaint();
    return pane;
  };
  const dim = (text) => {
    const el = doc.createElement("div");
    el.className = "arkmail-dim";
    el.textContent = text;
    return el;
  };
  const off = store2.subscribe(render);
  render(store2.state);
  return () => {
    off();
    container.replaceChildren();
  };
}

// src/arkmail/index.ts
var POPUP_ID = "arkmail";
var FOOTER_BUTTON_ID = "arkmail";
var FOOTER_STATE = "arkmail-poczta";
var ALIAS_REGEX = /^\/arkmail$/i;
var SESSION_OPTS = { timeoutMs: 8e3, idleMs: 400 };
var LOAD_ALL_MAX_PAGES = 40;
var WIDE_MIN_WIDTH = 900;
var LOAD_ALL_PACE_MS = 400;
var ANIMAL_TIMING = { flightTimeoutMs: 6e4, sluchamWindowMs: 2e3 };
var listingCtxSeq = 0;
var listingCtx = null;
var ARCHIVE_KEY = "archiwum";
var NOTIFY_KEY = "powiadomienia";
var COMPOSE_KEY = "compose";
function memoryKv() {
  const map = /* @__PURE__ */ new Map();
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}
var apiRef = null;
var popup = null;
var menuHandle = null;
var footerHandle = null;
var aliasId = null;
var transport = null;
var store = null;
var unmount = null;
var unsubBadge = null;
var wideObserver = null;
var animalTimer = null;
var sluchamTimer = null;
var unsentFlashTimer = null;
function createContent() {
  const root = document.createElement("div");
  root.style.height = "100%";
  root.style.minHeight = "0";
  if (unmount) {
    unmount();
    unmount = null;
  }
  if (wideObserver) {
    wideObserver.disconnect();
    wideObserver = null;
  }
  if (store && handlersRef) {
    unmount = mountMailUi(root, store, handlersRef);
    if (typeof ResizeObserver !== "undefined") {
      const s = store;
      wideObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        s.setWide(w >= WIDE_MIN_WIDTH);
      });
      wideObserver.observe(root);
    }
  }
  return root;
}
var handlersRef = null;
async function init(api) {
  apiRef = api;
  const kv = typeof localStorage !== "undefined" ? localStorage : memoryKv();
  const storage = new CharStorage(kv);
  transport = new DargothTransport(api);
  const lock = new SessionLock();
  const composePrefs = storage.getJSON(COMPOSE_KEY);
  store = new MailUiStore({
    notifyEnabled: storage.getJSON(NOTIFY_KEY) ?? false,
    archive: storage.getJSON(ARCHIVE_KEY) ?? [],
    composeTemplate: composePrefs?.template ?? "plain",
    composeWidth: composePrefs?.width ?? 60
  });
  const ui = store;
  const mailbox = new MailboxSession(transport, SESSION_OPTS);
  const pager = new PagerSession(transport, SESSION_OPTS);
  const editor = new EditorSession(transport, SESSION_OPTS);
  api.events.on("gmcp.char.info", (d) => {
    if (d?.name) storage.setCharacter(d.name);
  });
  const rebuildContacts = () => {
    ui.setContacts(contactsFromArchive(ui.state.archive));
  };
  const flashUnsent = () => {
    ui.setUnsentFlash(true);
    if (unsentFlashTimer !== null) clearTimeout(unsentFlashTimer);
    unsentFlashTimer = setTimeout(() => {
      unsentFlashTimer = null;
      ui.setUnsentFlash(false);
    }, 3e3);
  };
  const fetchBoxes = async (boxes, mode) => {
    for (const box of boxes) {
      ui.setBusy(`Pobieram skrzynke ${box}...`);
      const res = await mailbox.fetch(box);
      if (res.kind === "lista") stampEntries(box, res.entries);
      else bumpCtx(box);
      if (res.kind === "lista" && mode === "sync") {
        const synced = ui.syncMailboxPage(box, res.entries, res.header.truncated);
        if (!synced) ui.applyMailbox(box, res);
      } else {
        ui.applyMailbox(box, res);
      }
      if (res.kind === "lista") {
        const merged = upsertLetters(
          ui.state.archive,
          res.entries.map((e) => fromMailboxEntry(box, e))
        );
        ui.setArchive(merged.letters);
      }
    }
  };
  const refreshBoxes = (boxes, mode = "sync") => {
    ui.clearSearchBoxes(boxes);
    void lock.runExclusive(() => fetchBoxes(boxes, mode)).catch(() => {
    }).finally(() => {
      ui.setBusy(null);
      rebuildContacts();
      persistArchive();
    });
  };
  const pendingRefresh = /* @__PURE__ */ new Set();
  let drainScheduled = false;
  const scheduleRefresh = (boxes) => {
    for (const b of boxes) pendingRefresh.add(b);
    if (drainScheduled) return;
    drainScheduled = true;
    void lock.runExclusive(async () => {
      const batch = [...pendingRefresh];
      pendingRefresh.clear();
      ui.clearSearchBoxes(batch);
      await fetchBoxes(batch, "sync");
    }).catch(() => {
    }).finally(() => {
      ui.setBusy(null);
      rebuildContacts();
      persistArchive();
      drainScheduled = false;
      if (pendingRefresh.size > 0) scheduleRefresh([]);
    });
  };
  let lastMailState = null;
  api.events.on("gmcp.mail.state", (d) => {
    if (!d || typeof d !== "object") return;
    const s = d;
    if (typeof s.unread !== "boolean" || typeof s.unreceived !== "boolean" || typeof s.unsent !== "boolean") {
      return;
    }
    const cur = { unread: s.unread, unreceived: s.unreceived, unsent: s.unsent };
    const prev = lastMailState;
    if (prev && cur.unread === prev.unread && cur.unreceived === prev.unreceived && cur.unsent === prev.unsent) {
      return;
    }
    lastMailState = cur;
    const boxes = /* @__PURE__ */ new Set();
    const inboxTouched = prev ? cur.unread !== prev.unread || cur.unreceived !== prev.unreceived : cur.unread || cur.unreceived;
    if (inboxTouched) {
      boxes.add("odebrane");
      boxes.add("nieprzeczytane");
    }
    if (prev ? cur.unsent !== prev.unsent : cur.unsent) {
      boxes.add("niewyslane");
      boxes.add("wyslane");
    }
    if (boxes.size > 0) scheduleRefresh([...boxes]);
  });
  const persistArchive = () => {
    storage.setJSON(ARCHIVE_KEY, ui.state.archive);
  };
  const oldestEntry = (entries) => {
    let oldest = null;
    for (const e of entries) {
      if (!e.date) continue;
      if (!oldest || e.date.year < oldest.date.year || e.date.year === oldest.date.year && (e.date.month < oldest.date.month || e.date.month === oldest.date.month && (e.date.day < oldest.date.day || e.date.day === oldest.date.day && e.date.time < oldest.date.time))) {
        oldest = e;
      }
    }
    return oldest;
  };
  const entryKey = (e) => [e.party, e.subject, e.forwarded ? "f" : "", e.date?.raw ?? ""].join("|");
  const bumpCtx = (box) => {
    listingCtxSeq += 1;
    listingCtx = { box, stamp: listingCtxSeq };
  };
  const stampEntries = (box, entries) => {
    bumpCtx(box);
    for (const e of entries) e.ctx = { box, stamp: listingCtxSeq };
  };
  const resolveEntry = async (box, entry) => {
    if (entry.ctx !== void 0 && listingCtx !== null && entry.ctx.stamp === listingCtx.stamp && entry.ctx.box === listingCtx.box) {
      return entry;
    }
    if (!entry.date) {
      notify(api, "Nie moge zlokalizowac listu (brak daty) - odswiez skrzynke.");
      return null;
    }
    const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(entry.date)));
    if (res.kind !== "lista") bumpCtx(box);
    if (res.kind === "lista") {
      stampEntries(box, res.entries);
      const merged = upsertLetters(
        ui.state.archive,
        res.entries.map((e) => fromMailboxEntry(box, e))
      );
      ui.setArchive(merged.letters);
      persistArchive();
      const fresh = res.entries.find((e) => entryKey(e) === entryKey(entry));
      if (fresh) return fresh;
    }
    notify(api, "Nie znalazlem listu na swiezym listingu - odswiez skrzynke.");
    return null;
  };
  const loadOlder = (box) => {
    const view = ui.state.boxes[box];
    const oldest = oldestEntry(view?.entries ?? []);
    if (!oldest?.date) {
      notify(api, "Nie mozna wczytac starszych - najpierw pobierz skrzynke.");
      return;
    }
    const anchor = nextDay(oldest.date);
    ui.setBusy("Wczytuje starsze listy...");
    void lock.runExclusive(async () => {
      const res = await mailbox.fetch(box, olderListingCommand(box, anchor));
      if (res.kind === "lista") {
        stampEntries(box, res.entries);
        ui.appendMailboxPage(box, res.entries, res.header.truncated);
        const incoming = res.entries.map((e) => fromMailboxEntry(box, e));
        const merged = upsertLetters(ui.state.archive, incoming);
        ui.setArchive(merged.letters);
        persistArchive();
        notify(api, `Wczytano starsze listy (nowych: ${merged.added}).`);
      } else {
        bumpCtx(box);
        ui.appendMailboxPage(box, [], false);
        notify(api, "Brak starszych listow.");
      }
    }).catch(
      (err) => notify(api, `Blad wczytywania starszych: ${err instanceof Error ? err.message : String(err)}`)
    ).finally(() => ui.setBusy(null));
  };
  let loadAllFlag = null;
  const sleepOrCancel = async (ms, flag) => {
    const step = 50;
    for (let t = 0; t < ms && !flag.cancelled; t += step) {
      await new Promise((r) => setTimeout(r, Math.min(step, ms - t)));
    }
  };
  const loadAll = (box) => {
    if (loadAllFlag) {
      loadAllFlag.cancelled = true;
      return;
    }
    const flag = { cancelled: false };
    loadAllFlag = flag;
    ui.setLoadAll({ box, pages: 0 });
    void lock.runExclusive(async () => {
      let pages = 0;
      let added = 0;
      try {
        for (; ; ) {
          const view = ui.state.boxes[box];
          if (!view || !view.truncated) break;
          if (pages >= LOAD_ALL_MAX_PAGES) break;
          if (flag.cancelled) break;
          const oldest = oldestEntry(view.entries);
          if (!oldest?.date) break;
          const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(oldest.date)));
          pages += 1;
          let more = false;
          if (res.kind === "lista") {
            stampEntries(box, res.entries);
            const freshCount = ui.appendMailboxPage(box, res.entries, res.header.truncated);
            const merged = upsertLetters(
              ui.state.archive,
              res.entries.map((e) => fromMailboxEntry(box, e))
            );
            ui.setArchive(merged.letters);
            persistArchive();
            added += merged.added;
            more = res.header.truncated && freshCount > 0;
          } else {
            bumpCtx(box);
            ui.appendMailboxPage(box, [], false);
          }
          ui.setLoadAll({ box, pages });
          ui.setBusy(`Wczytuje wszystkie (${box}): strona ${pages}`);
          if (!more || flag.cancelled) break;
          await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
        }
        if (flag.cancelled) {
          notify(api, `Przerwiano (listow: ${added}, stron: ${pages}).`);
        } else if (pages >= LOAD_ALL_MAX_PAGES && ui.state.boxes[box]?.truncated) {
          notify(
            api,
            `Limit ${LOAD_ALL_MAX_PAGES} stron (listow: ${added}) - kliknij ponownie, aby kontynuowac.`
          );
        } else {
          notify(api, `Wczytano wszystkie (listow: ${added}, stron: ${pages}).`);
        }
      } finally {
        loadAllFlag = null;
        ui.setLoadAll(null);
      }
    }).catch(
      (err) => notify(api, `Blad wczytywania: ${err instanceof Error ? err.message : String(err)}`)
    ).finally(() => ui.setBusy(null));
  };
  let animalFlight = false;
  let sluchamArmed = false;
  const disarmSlucham = () => {
    sluchamArmed = false;
    if (sluchamTimer !== null) {
      clearTimeout(sluchamTimer);
      sluchamTimer = null;
    }
  };
  const armSluchamWindow = () => {
    sluchamArmed = true;
    if (sluchamTimer !== null) clearTimeout(sluchamTimer);
    sluchamTimer = setTimeout(() => {
      sluchamTimer = null;
      sluchamArmed = false;
    }, ANIMAL_TIMING.sluchamWindowMs);
  };
  const endAnimalFlight = () => {
    animalFlight = false;
    if (animalTimer !== null) {
      clearTimeout(animalTimer);
      animalTimer = null;
    }
    ui.setAnimalFlying(false);
  };
  const startAnimalFlight = () => {
    animalFlight = true;
    if (animalTimer !== null) clearTimeout(animalTimer);
    animalTimer = setTimeout(() => {
      animalTimer = null;
      if (animalFlight) endAnimalFlight();
    }, ANIMAL_TIMING.flightTimeoutMs);
    ui.setAnimalFlying(true);
  };
  handlersRef = {
    onSendAnimal: () => {
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      if (animalFlight) {
        notify(api, "Zwierze jest juz w drodze - poczekaj na jego powrot.");
        return;
      }
      startAnimalFlight();
      transport.send("wyslij zwierze");
      armSluchamWindow();
    },
    onOpenLetter: (box, entry) => {
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      ui.setBusy(`Czytam list: ${entry.subject}...`);
      void lock.runExclusive(async () => {
        const fresh = await resolveEntry(box, entry);
        if (!fresh) return;
        transport.beginModal();
        try {
          const res = await pager.readLetter(fresh.number);
          ui.openLetter(box, res.letter, fresh);
          const merged = upsertLetters(ui.state.archive, [
            fromOpenedLetter(box, res.letter, fresh)
          ]);
          ui.setArchive(merged.letters);
          persistArchive();
          if (ui.state.search?.box !== box) refreshBoxes([box]);
        } finally {
          transport.endModal();
        }
      }).catch(() => notify(api, "Nie udalo sie odczytac listu.")).finally(() => ui.setBusy(null));
    },
    onSendCompose: (input) => {
      if (!input.adresat.trim() || !input.temat.trim()) {
        notify(api, "Adresat i temat sa wymagane.");
        return;
      }
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      ui.setBusy("Wysylam list...");
      void lock.runExclusive(async () => {
        transport.beginModal();
        try {
          const out = await editor.send({
            adresat: input.adresat.trim(),
            temat: input.temat,
            dw: input.dw.trim() === "" ? void 0 : input.dw.trim(),
            linie: input.linie
          });
          if (out.result === "wyslany") {
            notify(api, "List zostal wyslany.");
            refreshBoxes(["wyslane"]);
          } else if (out.result === "gotowy") {
            notify(api, "List odlozony w niewyslanych.");
            refreshBoxes(["niewyslane"]);
            flashUnsent();
          } else {
            notify(api, "Blad wysylki - sprawdz adresata.");
          }
        } finally {
          transport.endModal();
        }
      }).catch(() => notify(api, "Blad wysylki listu.")).finally(() => ui.setBusy(null));
    },
    onCloseLetter: () => ui.closeLetter(),
    onRefreshBox: (box) => refreshBoxes([box]),
    onLoadOlder: (box) => loadOlder(box),
    onLoadAll: (box) => loadAll(box),
    onSearch: (box, query) => {
      ui.setBusy(`Szukam w skrzynce ${box}...`);
      void lock.runExclusive(async () => {
        const res = await mailbox.fetch(box, searchListingCommand(box, query));
        if (res.kind === "lista") stampEntries(box, res.entries);
        else bumpCtx(box);
        ui.setSearch({ box, label: searchDescription(box, query) });
        ui.applySearchResults(box, res);
        if (res.kind === "lista") {
          const merged = upsertLetters(
            ui.state.archive,
            res.entries.map((e) => fromMailboxEntry(box, e))
          );
          ui.setArchive(merged.letters);
          persistArchive();
          notify(api, `Wyniki szukania (listow: ${res.entries.length}).`);
        } else {
          notify(api, "Brak pasujacych listow.");
        }
      }).catch(
        (err) => notify(api, `Blad szukania: ${err instanceof Error ? err.message : String(err)}`)
      ).finally(() => ui.setBusy(null));
    },
    onClearSearch: (box) => ui.clearSearch(box),
    // Fala 12e: czyszczenie pamieci podrecznej na zadanie gracza.
    // Kasuje archiwum (storage + RAM), widoki skrzynek i kontakty;
    // ZACHOWUJE ustawienia (powiadomienia, szablon compose) - one nie
    // sa cache, tylko preferencje.
    onClearCache: () => {
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      storage.remove(ARCHIVE_KEY);
      ui.clearCacheData();
      notify(api, "Pamiec podreczna wyczyszczona - skrzynki pobiora sie na nowo.");
    },
    onDeleteLetter: (box, entry) => {
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      ui.setBusy(`Kasuje list: ${entry.subject}...`);
      void lock.runExclusive(async () => {
        const fresh = await resolveEntry(box, entry);
        if (!fresh) return;
        transport.beginModal();
        try {
          const res = await pager.deleteLetters(fresh.number, String(fresh.number));
          if (res.deleted) {
            notify(api, "List zostal usuniety.");
            ui.closeLetter();
            refreshBoxes([box], "replace");
          } else {
            notify(api, "Nie udalo sie skasowac listu.");
          }
        } finally {
          transport.endModal();
        }
      }).catch(() => notify(api, "Blad kasowania listu.")).finally(() => ui.setBusy(null));
    },
    onForwardLetter: (box, entry, adresat) => {
      if (lock.locked) {
        notify(api, "Trwa inna operacja pocztowa - poczekaj na jej koniec.");
        return;
      }
      ui.setBusy(`Przekazuje list: ${entry.subject}...`);
      void lock.runExclusive(async () => {
        const fresh = await resolveEntry(box, entry);
        if (!fresh) return;
        transport.beginModal();
        try {
          const res = await pager.forwardLetter(fresh.number, adresat);
          if (res.queued) {
            notify(api, "List przekazany - czeka w niewyslanych.");
            refreshBoxes(["niewyslane"]);
            flashUnsent();
          } else {
            notify(api, "Blad przekazania - sprawdz adresata.");
          }
        } finally {
          transport.endModal();
        }
      }).catch(() => notify(api, "Blad przekazania listu.")).finally(() => ui.setBusy(null));
    }
  };
  let lastWatchdogQ = 0;
  transport.subscribe((line) => {
    if (line.cls === "command" || isEchoLine(line.text)) return;
    if (!extractPagerPrompt(line.text)) return;
    console.error("WATCHDOG locked=", lock.locked);
    if (lock.locked) return;
    const now = Date.now();
    if (now - lastWatchdogQ < 2e3) return;
    lastWatchdogQ = now;
    transport.send("q");
  });
  transport.subscribe((line) => {
    const n = parseNotification(line.text);
    if (!n) return;
    if (n.kind === "nowa-poczte") {
      if (ui.state.notifyEnabled) notify(api, `Masz nowa poczte od ${n.nadawca}.`);
      scheduleRefresh(["odebrane", "nieprzeczytane"]);
    } else if (n.kind === "goniec") {
      scheduleRefresh(["odebrane", "nieprzeczytane"]);
    } else if (n.kind === "wysylasz") {
      if (!animalFlight) startAnimalFlight();
      disarmSlucham();
    } else if (n.kind === "slucham") {
      if (sluchamArmed) {
        disarmSlucham();
        endAnimalFlight();
        notify(api, "Zwierze nie odpowiada - sprawdz, czy masz zwierze pocztowe.");
      }
    } else if (n.kind === "powrot-zwierzecia") {
      disarmSlucham();
      endAnimalFlight();
      scheduleRefresh(["odebrane", "nieprzeczytane"]);
    } else if (n.kind === "list-wyslany") {
      if (!lock.locked) scheduleRefresh(["niewyslane", "wyslane"]);
    }
  });
  unsubBadge = ui.subscribe((s) => {
    footerHandle?.update({ label: PLUGIN_NAME + formatBadgeSuffix(s.badge, s.badgeUnsent) });
    api.ui.setFooterButtonState(FOOTER_STATE, s.badge > 0 || s.badgeUnsent > 0);
    storage.setJSON(COMPOSE_KEY, { template: s.composeTemplate, width: s.composeWidth });
    storage.setJSON(NOTIFY_KEY, s.notifyEnabled);
  });
  popup = await api.ui.registerPersistentPopup({
    id: POPUP_ID,
    title: PLUGIN_NAME,
    // Start: szeroki dwupanelowy na normalnym ekranie, waski na komorce
    // (85vw). Rozmiar ustawiony przez gracza zawsze wygrywa z tymi
    // wartosciami - po zmianie domyslnego pomocny jest reset rozmiaru.
    initialWidth: "min(1400px, 85vw)",
    initialHeight: "min(850px, 80vh)",
    createContent
  });
  const toggle = () => {
    if (!popup) return true;
    if (popup.isOpen) popup.close();
    else void popup.open();
    return true;
  };
  aliasId = api.aliases.register(ALIAS_REGEX, toggle);
  menuHandle = api.ui.addPopupMenuEntry(PLUGIN_NAME, () => {
    if (popup && !popup.isOpen) void popup.open();
  });
  footerHandle = api.ui.registerFooterButton(FOOTER_BUTTON_ID, {
    label: PLUGIN_NAME,
    command: "/arkmail",
    state: FOOTER_STATE
  });
  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    author: PLUGIN_AUTHOR,
    description: PLUGIN_DESCRIPTION
  };
}
async function destroy() {
  if (animalTimer !== null) {
    clearTimeout(animalTimer);
    animalTimer = null;
  }
  if (sluchamTimer !== null) {
    clearTimeout(sluchamTimer);
    sluchamTimer = null;
  }
  if (unsentFlashTimer !== null) {
    clearTimeout(unsentFlashTimer);
    unsentFlashTimer = null;
  }
  if (unsubBadge) {
    unsubBadge();
    unsubBadge = null;
  }
  if (unmount) {
    unmount();
    unmount = null;
  }
  if (wideObserver) {
    wideObserver.disconnect();
    wideObserver = null;
  }
  if (transport) {
    transport.dispose();
    transport = null;
  }
  handlersRef = null;
  store = null;
  if (aliasId !== null && apiRef) {
    apiRef.aliases.remove(aliasId);
    aliasId = null;
  }
  if (footerHandle) {
    footerHandle.remove();
    footerHandle = null;
  }
  if (menuHandle) {
    menuHandle.remove();
    menuHandle = null;
  }
  if (popup) {
    popup.close();
    popup = null;
  }
  apiRef = null;
}
export {
  ANIMAL_TIMING,
  LOAD_ALL_MAX_PAGES,
  LOAD_ALL_PACE_MS,
  WIDE_MIN_WIDTH,
  destroy,
  init
};
