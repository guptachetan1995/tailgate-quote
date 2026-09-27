var TailgateStatic = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // fake-data/seed.json
  var require_seed = __commonJS({
    "fake-data/seed.json"(exports, module) {
      module.exports = {
        business: {
          name: "Oakridge Plumbing & Heating",
          owner: "Dave Rourke",
          laborRate: 110,
          markupPct: 25,
          email: "office@oakridge.example.com",
          phone: "555-0100",
          address: "12 Mill Street, Oakridge"
        },
        suppliers: [
          {
            id: "sup_northgate",
            name: "Northgate Plumbing Supply",
            email: "counter@northgate.example.com",
            phone: "555-0142"
          },
          {
            id: "sup_ridgeway",
            name: "Ridgeway Pipe and Supply",
            email: "orders@ridgeway.example.com",
            phone: "555-0156"
          }
        ],
        catalog: [
          {
            sku: "AQN-TX199",
            name: "Aquilon TX-199 tankless water heater",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 1180, stock: 3 },
              sup_ridgeway: { cost: 1215, stock: 0 }
            }
          },
          {
            sku: "HLD-G50",
            name: "Halden 50-gallon gas water heater",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 820, stock: 2 },
              sup_ridgeway: { cost: 845, stock: 5 }
            }
          },
          {
            sku: "BWK-BV12",
            name: "Brasswick ball valve",
            variant: "1/2",
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 14.4, stock: 60 },
              sup_ridgeway: { cost: 15.1, stock: 25 }
            }
          },
          {
            sku: "BWK-BV34",
            name: "Brasswick ball valve",
            variant: "3/4",
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 19, stock: 40 },
              sup_ridgeway: { cost: 18.6, stock: 0 }
            }
          },
          {
            sku: "FLX-PA34",
            name: "Flexline 3/4-inch PEX-A pipe",
            variant: null,
            unit: "foot",
            suppliers: {
              sup_northgate: { cost: 1.2, stock: 500 },
              sup_ridgeway: { cost: 1.28, stock: 300 }
            }
          },
          {
            sku: "KLR-CP12",
            name: "Keeler Type L copper pipe",
            variant: "1/2",
            unit: "10-ft length",
            suppliers: {
              sup_northgate: { cost: 31.2, stock: 40 }
            }
          },
          {
            sku: "KLR-CP34",
            name: "Keeler Type L copper pipe",
            variant: "3/4",
            unit: "10-ft length",
            suppliers: {
              sup_northgate: { cost: 44, stock: 30 }
            }
          },
          {
            sku: "PNR-DP24",
            name: "Panrite 24-inch drain pan",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 22, stock: 12 }
            }
          },
          {
            sku: "VNT-CV3",
            name: "Ventora 3-inch concentric vent kit",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 96, stock: 6 },
              sup_ridgeway: { cost: 92, stock: 4 }
            }
          },
          {
            sku: "CRV-SVK",
            name: "Corvel tankless service valve kit",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 64, stock: 8 }
            }
          },
          {
            sku: "DRN-ET2",
            name: "Dorran 2-gallon expansion tank",
            variant: null,
            unit: "each",
            suppliers: {
              sup_ridgeway: { cost: 38.4, stock: 10 }
            }
          },
          {
            sku: "ASH-GF24",
            name: "Ashby 24-inch gas flex connector",
            variant: null,
            unit: "each",
            suppliers: {
              sup_northgate: { cost: 17.6, stock: 25 }
            }
          },
          {
            sku: "SMP-13",
            name: "Sumpro 1/3 HP sump pump",
            variant: null,
            unit: "each",
            suppliers: {
              sup_ridgeway: { cost: 148, stock: 3 }
            }
          }
        ],
        leads: [
          {
            id: "lead_shah",
            name: "Priya Shah",
            site: "41 Linden Avenue",
            email: "priya.shah@example.com",
            phone: "555-0117",
            createdDaysAgo: 2
          },
          {
            id: "lead_okafor",
            name: "Daniel Okafor",
            site: "9 Birch Court",
            email: "daniel.okafor@example.com",
            phone: "555-0123",
            createdDaysAgo: 1
          },
          {
            id: "lead_marsh",
            name: "Helen Marsh",
            site: "207 Quarry Road",
            email: "helen.marsh@example.com",
            phone: "555-0131",
            createdDaysAgo: 4
          }
        ]
      };
    }
  });

  // src/evidence.js
  var require_evidence = __commonJS({
    "src/evidence.js"(exports, module) {
      "use strict";
      var ONES = {
        zero: 0,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        eleven: 11,
        twelve: 12,
        thirteen: 13,
        fourteen: 14,
        fifteen: 15,
        sixteen: 16,
        seventeen: 17,
        eighteen: 18,
        nineteen: 19
      };
      var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
      var SIZE_UNITS = {
        inch: "inch",
        inches: "inch",
        gallon: "gallon",
        gallons: "gallon",
        hp: "hp",
        amp: "amp",
        amps: "amp",
        volt: "volt",
        volts: "volt",
        btu: "btu",
        psi: "psi",
        mm: "mm"
      };
      var GENERIC = /* @__PURE__ */ new Set([
        "a",
        "an",
        "the",
        "of",
        "and",
        "or",
        "for",
        "with",
        "to",
        "in",
        "on",
        "at",
        "by",
        "from",
        "it",
        "its",
        "that",
        "this",
        "these",
        "those",
        "them",
        "her",
        "his",
        "my",
        "our",
        "their",
        "your",
        "some",
        "more",
        "another",
        "other",
        "new",
        "old",
        "make",
        "add",
        "swap",
        "put",
        "get",
        "got",
        "need",
        "needs",
        "want",
        "call",
        "also",
        "plus",
        "just",
        "then",
        "actually",
        "one",
        "ones",
        "piece",
        "each",
        "feet",
        "foot",
        "ft",
        "inch",
        "type",
        "l",
        "is",
        "be",
        "we",
        "i",
        "us",
        "there",
        "here",
        "check",
        "has",
        "have",
        "stock",
        "drop",
        "remove",
        "take",
        "out"
      ]);
      var LABOR_WORDS = /* @__PURE__ */ new Set(["hour", "hours", "hr", "hrs", "labor", "labour"]);
      function singular(word) {
        if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
        if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
        return word;
      }
      function rawTokens(text) {
        const s = String(text).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[‐-―]/g, "-").replace(/[“”]/g, '"').replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/(\d)\s*"/g, "$1-inch");
        const out = [];
        for (const tok of s.match(/[a-z0-9]+(?:[-/.'][a-z0-9]+)*/g) || []) {
          const t = tok.replace(/'/g, "");
          if (!/\d/.test(t) && t.includes("-")) out.push(...t.split("-").filter(Boolean));
          else out.push(t);
        }
        return out;
      }
      function classify(t) {
        if (/^\d+$/.test(t)) return { t, kind: "number", value: Number(t) };
        if (/^\d+\/\d+$/.test(t)) return { t, kind: "fraction", base: t };
        if (/^\d+\.\d+$/.test(t)) return { t: String(Number(t)), kind: "decimal", value: Number(t) };
        const size = t.match(/^(\d+(?:[/.]\d+)?)-([a-z]+)$/);
        if (size && SIZE_UNITS[size[2]]) return { t: `${size[1]}-${SIZE_UNITS[size[2]]}`, kind: "size", base: size[1] };
        if (/\d/.test(t)) return { t: t.replace(/[-.]/g, ""), kind: "model" };
        return { t, kind: "word" };
      }
      var wordAt = (toks, k) => toks[k] && toks[k].kind === "word" ? toks[k].t : null;
      function readSmall(toks, j) {
        const w = wordAt(toks, j);
        if (TENS[w] !== void 0) {
          const next = ONES[wordAt(toks, j + 1)];
          if (next >= 1 && next <= 9) return { value: TENS[w] + next, next: j + 2 };
          return { value: TENS[w], next: j + 1 };
        }
        if (ONES[w] !== void 0) return { value: ONES[w], next: j + 1 };
        return null;
      }
      function readNumberWords(toks, i) {
        let chunk;
        let j;
        const first = wordAt(toks, i);
        const after = wordAt(toks, i + 1);
        if (first === "a" && ["hundred", "dozen", "couple", "pair"].includes(after)) {
          chunk = 1;
          j = i + 1;
        } else {
          const small = readSmall(toks, i);
          if (!small) return null;
          chunk = small.value;
          j = small.next;
        }
        let value = chunk;
        const mult = wordAt(toks, j);
        if (mult === "hundred") {
          value = chunk * 100;
          j += 1;
          const k = wordAt(toks, j) === "and" ? j + 1 : j;
          const rest = readSmall(toks, k);
          if (rest) {
            value += rest.value;
            j = rest.next;
          }
        } else if (mult === "dozen") {
          value = chunk * 12;
          j += 1;
        } else if (mult === "couple" || mult === "pair") {
          value = chunk * 2;
          j += 1;
        }
        if (wordAt(toks, j) === "and" && wordAt(toks, j + 1) === "a" && wordAt(toks, j + 2) === "half") {
          value += 0.5;
          j += 3;
        }
        return { value, next: j };
      }
      function catalogModels(catalog) {
        const models = /* @__PURE__ */ new Set();
        for (const item of catalog) {
          for (const text of [item.name, item.variant || "", item.sku, ...item.sku.split("-")]) {
            for (const tok of rawTokens(text).map(classify)) if (tok.kind === "model") models.add(tok.t);
          }
        }
        return models;
      }
      function tokenize(text, models = /* @__PURE__ */ new Set()) {
        const toks = rawTokens(text).map(classify);
        const out = [];
        let i = 0;
        while (i < toks.length) {
          const cur = toks[i];
          const w = cur.kind === "word" ? cur.t : null;
          if (w === "three" && ["quarter", "quarters"].includes(wordAt(toks, i + 1))) {
            out.push({ t: "3/4", kind: "fraction", base: "3/4" });
            i += 2;
            continue;
          }
          if ((w === "half" || w === "quarter") && SIZE_UNITS[wordAt(toks, i + 1)]) {
            const base = w === "half" ? "1/2" : "1/4";
            out.push({ t: base, kind: "fraction", base });
            i += 1;
            continue;
          }
          const spoken = w ? readNumberWords(toks, i) : null;
          if (spoken) {
            out.push({ t: String(spoken.value), kind: "number", value: spoken.value });
            i = spoken.next;
            continue;
          }
          if (w && toks[i + 1] && toks[i + 1].kind === "number" && models.has(`${w}${toks[i + 1].t}`)) {
            out.push({ t: `${w}${toks[i + 1].t}`, kind: "model" });
            i += 2;
            continue;
          }
          out.push(cur);
          i += 1;
        }
        const merged = [];
        for (let k = 0; k < out.length; k += 1) {
          const tok = out[k];
          const unit = out[k + 1] && out[k + 1].kind === "word" ? SIZE_UNITS[out[k + 1].t] : void 0;
          if (unit && (tok.kind === "number" || tok.kind === "fraction" || tok.kind === "decimal")) {
            const base = tok.base || tok.t;
            merged.push({ t: `${base}-${unit}`, kind: "size", base });
            k += 1;
          } else {
            merged.push(tok);
          }
        }
        return merged;
      }
      function quantities(tokens) {
        return tokens.filter((tok) => tok.kind === "number").map((tok) => tok.value);
      }
      function indexOfRun(hay, needle) {
        if (needle.length === 0 || needle.length > hay.length) return -1;
        outer: for (let i = 0; i <= hay.length - needle.length; i += 1) {
          for (let j = 0; j < needle.length; j += 1) if (hay[i + j].t !== needle[j].t) continue outer;
          return i;
        }
        return -1;
      }
      function findInTurns(turns, text, models) {
        const needle = tokenize(text, models);
        if (needle.length === 0) return null;
        for (let i = turns.length - 1; i >= 0; i -= 1) {
          if (indexOfRun(tokenize(turns[i].text, models), needle) >= 0) return { turnId: turns[i].id, tokens: needle };
        }
        return null;
      }
      var q = (s) => `'${String(s).trim()}'`;
      function notHeard(field, text) {
        return `${field} must be the owner's exact words from one turn; ${q(text)} is not in any turn heard so far. Quote the turn exactly, or wait until the owner has finished speaking.`;
      }
      function itemLabel(item) {
        return item.variant ? `${item.name} ${item.variant} (${item.sku})` : `${item.name} (${item.sku})`;
      }
      function itemKeywords(item, models) {
        const kw = /* @__PURE__ */ new Set();
        for (const tok of tokenize(`${item.name} ${item.sku} ${item.sku.replace(/-/g, " ")}`, models)) {
          if ((tok.kind === "word" || tok.kind === "model") && !GENERIC.has(tok.t)) {
            kw.add(tok.t);
            kw.add(singular(tok.t));
          }
        }
        return kw;
      }
      var isNaming = (tok) => (tok.kind === "word" || tok.kind === "model") && !GENERIC.has(tok.t);
      var hasKeyword = (kw, tok) => kw.has(tok.t) || kw.has(singular(tok.t));
      function namesItem(tokens, item, models) {
        const kw = itemKeywords(item, models);
        return tokens.some((tok) => isNaming(tok) && hasKeyword(kw, tok));
      }
      function quantitiesFor(tokens, item, catalog, models) {
        const keywords = catalog.map((it) => [it.sku, itemKeywords(it, models)]);
        const named = tokens.map((tok) => isNaming(tok) ? keywords.filter(([, kw]) => hasKeyword(kw, tok)).map(([sku]) => sku) : []);
        const own = (k) => named[k].includes(item.sku);
        const out = [];
        let lastNamed = -1;
        tokens.forEach((tok, i) => {
          if (named[i].length) lastNamed = i;
          if (tok.kind !== "number") return;
          const next = named.findIndex((skus, k) => k > i && skus.length > 0);
          if (next >= 0) {
            if (own(next)) out.push(tok.value);
          } else if (lastNamed >= 0 && own(lastNamed) && !tokens.slice(i + 1, i + 3).some((t) => LABOR_WORDS.has(t.t))) {
            out.push(tok.value);
          }
        });
        return out;
      }
      function checkQuantity(tokens, qty, heard, item, catalog, models) {
        const own = quantitiesFor(tokens, item, catalog, models);
        if (own.includes(qty)) return null;
        if (qty === 1 && own.length === 0) return null;
        const said = own.length ? `it says ${own.join(" and ")}` : "it names no quantity, which means 1";
        const others = quantities(tokens).filter((n) => !own.includes(n));
        const elsewhere = others.length ? `; ${others.join(" and ")} there ${others.length > 1 ? "go" : "goes"} with another item` : "";
        return `qty ${qty} is not in ${q(heard)} for ${item.name} (${said}${elsewhere}). Use the quantity the owner said for this item, and quote only the words about it.`;
      }
      function hasVariant(tokens, variant) {
        return tokens.some((tok) => tok.t === variant || tok.base === variant || variant === "1/2" && tok.t === "half");
      }
      function checkLine({ item, siblings, catalog, qty, heard, detailHeard, turns, models, needQty = true }) {
        const found = findInTurns(turns, heard, models);
        if (!found) return { reason: notHeard("heard", heard) };
        if (!namesItem(found.tokens, item, models)) {
          return { reason: `${q(heard)} does not name ${itemLabel(item)}. Quote the words where the owner named the item.` };
        }
        if (needQty) {
          const bad = checkQuantity(found.tokens, qty, heard, item, catalog, models);
          if (bad) return { reason: bad };
        }
        const result = { turnId: found.turnId };
        if (detailHeard !== void 0) {
          const detail = findInTurns(turns, detailHeard, models);
          if (!detail) return { reason: notHeard("detail_heard", detailHeard) };
          if (!item.variant || !hasVariant(detail.tokens, item.variant)) {
            return { reason: `detail_heard ${q(detailHeard)} does not say ${item.variant || "a size"}, the size of ${item.sku}.` };
          }
          result.detailTurnId = detail.turnId;
        } else if (item.variant && siblings.length > 0 && !hasVariant(found.tokens, item.variant)) {
          const sizes = [item, ...siblings].map((s) => s.variant).join(" and ");
          return {
            reason: `The price list has ${item.name} in ${sizes}, and ${q(heard)} does not say which. Ask the owner which one, then put the words of their answer in detail_heard.`
          };
        }
        return result;
      }
      function checkLabor({ hours, heard, turns, models }) {
        const found = findInTurns(turns, heard, models);
        if (!found) return { reason: notHeard("labor_heard", heard) };
        if (!found.tokens.some((tok) => LABOR_WORDS.has(tok.t))) {
          return { reason: `labor_heard ${q(heard)} does not mention hours or labor. Quote the words where the owner gave the labor.` };
        }
        const nums = found.tokens.filter((tok) => tok.kind === "number" || tok.kind === "decimal").map((tok) => tok.value);
        if (!nums.includes(hours)) {
          return { reason: `labor_hours ${hours} is not in ${q(heard)}${nums.length ? ` (it says ${nums.join(" and ")})` : ""}. Use the hours the owner said.` };
        }
        return { turnId: found.turnId };
      }
      var STREET_WORDS = /* @__PURE__ */ new Set(["avenue", "ave", "street", "st", "road", "rd", "court", "ct", "lane", "ln", "drive", "dr", "way", "place", "pl", "boulevard", "blvd", "terrace", "close"]);
      function leadKeys(lead) {
        return new Set([...rawTokens(lead.name), ...rawTokens(lead.site)].filter((t) => !/\d/.test(t) && !STREET_WORDS.has(t) && !GENERIC.has(t)));
      }
      function nearly(word, key) {
        if (key.length < 5 || Math.abs(word.length - key.length) > 1) return false;
        let i = 0;
        let j = 0;
        let edits = 0;
        while (i < word.length && j < key.length) {
          if (word[i] === key[j]) {
            i += 1;
            j += 1;
          } else {
            edits += 1;
            if (edits > 1) return false;
            if (word.length > key.length) i += 1;
            else if (word.length < key.length) j += 1;
            else {
              i += 1;
              j += 1;
            }
          }
        }
        return edits + (word.length - i) + (key.length - j) <= 1;
      }
      function namesLead(words, keys) {
        return [...keys].some((k) => words.has(k) || [...words].some((w) => nearly(w, k)));
      }
      function turnsAbout(turns, leads, leadId) {
        const keys = new Map(leads.map((l) => [l.id, leadKeys(l)]));
        let current = /* @__PURE__ */ new Set();
        let named = false;
        const out = [];
        for (const turn of turns) {
          const words = new Set(rawTokens(turn.text));
          const here = leads.filter((l) => namesLead(words, keys.get(l.id))).map((l) => l.id);
          if (here.length) current = new Set(here);
          if (current.has(leadId)) {
            named = true;
            out.push(turn);
          }
        }
        return named ? out : null;
      }
      function checkPhrase({ field, value, heardField, heard, turns, models }) {
        const found = findInTurns(turns, heard, models);
        if (!found) return { reason: notHeard(heardField, heard) };
        if (indexOfRun(found.tokens, tokenize(value, models)) < 0) {
          return { reason: `${field} ${q(value)} is not in ${heardField} ${q(heard)}. Keep the owner's own words.` };
        }
        return { turnId: found.turnId };
      }
      module.exports = {
        tokenize,
        quantities,
        quantitiesFor,
        catalogModels,
        findInTurns,
        checkLine,
        checkLabor,
        checkPhrase,
        turnsAbout,
        singular
      };
    }
  });

  // src/store.js
  var require_store = __commonJS({
    "src/store.js"(exports, module) {
      "use strict";
      var defaultSeed = require_seed();
      var { catalogModels } = require_evidence();
      var DAY_MS = 24 * 60 * 60 * 1e3;
      function createIds() {
        const counters = { quote: 1e3, supplier: 2e3, turn: 0, outbox: 0 };
        const format = {
          quote: (n) => `Q-${n}`,
          supplier: (n) => `S-${n}`,
          turn: (n) => `turn_${n}`,
          outbox: (n) => `OUT-${n}`
        };
        return {
          next(kind) {
            counters[kind] += 1;
            return format[kind](counters[kind]);
          }
        };
      }
      var clone = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
      function deepFreeze(value) {
        if (value && typeof value === "object") {
          for (const v of Object.values(value)) deepFreeze(v);
          Object.freeze(value);
        }
        return value;
      }
      function resolveSeed(seed, now) {
        const base = clone(seed);
        return {
          business: base.business,
          suppliers: base.suppliers,
          catalog: base.catalog,
          leads: base.leads.map(({ createdDaysAgo, ...lead }) => ({
            ...lead,
            createdAt: new Date(now() - createdDaysAgo * DAY_MS).toISOString()
          })),
          turns: [],
          drafts: [],
          outbox: []
        };
      }
      function createStore({ seed = defaultSeed, now = Date.now, ids = createIds } = {}) {
        let state;
        let log;
        let idSource;
        let models;
        let seq;
        const listeners = /* @__PURE__ */ new Set();
        function reset() {
          state = resolveSeed(seed, now);
          log = [];
          idSource = ids();
          models = catalogModels(state.catalog);
          seq = 0;
        }
        reset();
        return {
          // Live state, for the verb handlers only. Everything leaving the store is a copy.
          get state() {
            return state;
          },
          get models() {
            return models;
          },
          nowIso: () => new Date(now()).toISOString(),
          nextId: (kind) => idSource.next(kind),
          snapshot: () => clone(state),
          // Entries are frozen JSON snapshots taken at append time: a later change to a draft never
          // rewrites what the log says happened.
          appendLog(entry) {
            seq += 1;
            const frozen = deepFreeze(clone({ seq, at: new Date(now()).toISOString(), ...entry }));
            log.push(frozen);
            for (const fn of listeners) fn(frozen);
            return clone(frozen);
          },
          activityLog: () => clone(log),
          subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          reset
        };
      }
      module.exports = { createStore, createIds, clone };
    }
  });

  // src/refusal.js
  var require_refusal = __commonJS({
    "src/refusal.js"(exports, module) {
      "use strict";
      var Refusal = class extends Error {
        constructor(message, details) {
          super(message);
          this.name = "Refusal";
          this.details = details;
        }
      };
      module.exports = { Refusal };
    }
  });

  // src/schema.js
  var require_schema = __commonJS({
    "src/schema.js"(exports, module) {
      "use strict";
      var KEYWORDS = /* @__PURE__ */ new Set([
        "type",
        "properties",
        "required",
        "additionalProperties",
        "items",
        "enum",
        "minimum",
        "pattern",
        "description"
      ]);
      var MONEY_OR_STATUS = /price|cost|total|discount|markup|margin|rate|amount|status|tax/i;
      function describeType(value) {
        if (value === null) return "null";
        if (Array.isArray(value)) return "array";
        if (Number.isInteger(value)) return "integer";
        return typeof value;
      }
      function typeMatches(type, value) {
        switch (type) {
          case "object":
            return value !== null && typeof value === "object" && !Array.isArray(value);
          case "array":
            return Array.isArray(value);
          case "string":
            return typeof value === "string";
          case "integer":
            return Number.isInteger(value);
          case "number":
            return typeof value === "number" && Number.isFinite(value);
          case "boolean":
            return typeof value === "boolean";
          default:
            throw new Error(`schema uses unsupported type "${type}"`);
        }
      }
      function unknownFieldMessage(path, verb) {
        const field = path.split(/[.[]/).pop().replace(/]$/, "");
        const base = `"${path}" is not a field of ${verb}; nothing was changed.`;
        if (MONEY_OR_STATUS.test(field)) {
          return `${base} Prices, totals and discounts come only from the owner's price list, and a draft's status changes only when the owner taps a button on screen.`;
        }
        return `${base} Send only the fields the tool describes.`;
      }
      var join = (path, key) => path ? `${path}.${key}` : key;
      var label = (path) => path || "(arguments)";
      function check(schema, value, path, verb) {
        for (const key of Object.keys(schema)) {
          if (!KEYWORDS.has(key)) throw new Error(`schema for ${verb} uses unsupported keyword "${key}"`);
        }
        const at = label(path);
        if (schema.type && !typeMatches(schema.type, value)) {
          const want = schema.type === "integer" ? "a whole number" : `${schema.type === "object" || schema.type === "array" ? "an" : "a"} ${schema.type}`;
          return { path: at, message: `"${at}" must be ${want}, not ${describeType(value)}.` };
        }
        if (schema.enum && !schema.enum.includes(value)) {
          return { path: at, message: `"${at}" must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}.` };
        }
        if (schema.minimum !== void 0 && typeof value === "number" && value < schema.minimum) {
          return { path: at, message: `"${at}" must be at least ${schema.minimum}.` };
        }
        if (schema.pattern !== void 0 && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
          return { path: at, message: `"${at}" is empty or not in the expected form.` };
        }
        if (schema.type === "object") {
          const props = schema.properties || {};
          if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
              if (!Object.hasOwn(props, key)) {
                const field = join(path, key);
                return { path: field, message: unknownFieldMessage(field, verb) };
              }
            }
          }
          for (const key of schema.required || []) {
            if (value[key] === void 0) {
              const field = join(path, key);
              return { path: field, message: `"${field}" is required.` };
            }
          }
          for (const [key, sub] of Object.entries(props)) {
            if (value[key] === void 0) continue;
            const found = check(sub, value[key], join(path, key), verb);
            if (found) return found;
          }
        }
        if (schema.type === "array" && schema.items) {
          for (let i = 0; i < value.length; i += 1) {
            const found = check(schema.items, value[i], `${path}[${i}]`, verb);
            if (found) return found;
          }
        }
        return null;
      }
      function validate(schema, value, verb) {
        return check(schema, value, "", verb);
      }
      function objectLevels(schema, path = "") {
        const out = [];
        if (schema.type === "object") {
          out.push({ path: path || "(root)", schema });
          for (const [key, sub] of Object.entries(schema.properties || {})) out.push(...objectLevels(sub, `${path}.${key}`));
        }
        if (schema.type === "array" && schema.items) out.push(...objectLevels(schema.items, `${path}[]`));
        return out;
      }
      module.exports = { validate, objectLevels, KEYWORDS };
    }
  });

  // src/tools.js
  var require_tools = __commonJS({
    "src/tools.js"(exports, module) {
      "use strict";
      var SHARED_CLAUSE = `Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says "send it". If asked, say the draft is on the owner's screen and only their tap sends it.`;
      var SKU = {
        type: "string",
        pattern: "^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$",
        description: 'The sku exactly as search_catalog returned it, for example "BWK-BV34".'
      };
      var QTY = { type: "integer", minimum: 1, description: "A whole number: the quantity the owner said." };
      var HEARD = {
        type: "string",
        pattern: "\\S",
        description: "The owner's exact words from one turn that name this item and its quantity, copied word for word."
      };
      var DETAIL_HEARD = {
        type: "string",
        pattern: "\\S",
        description: `Only when you had to ask which size: the exact words of the owner's answer, for example "Three-quarter".`
      };
      var LINE = {
        type: "object",
        additionalProperties: false,
        required: ["sku", "qty", "heard"],
        properties: { sku: SKU, qty: QTY, heard: HEARD, detail_heard: DETAIL_HEARD }
      };
      var AGENT_TOOLS = [
        {
          name: "search_catalog",
          execution_mode: "interactive",
          timeout_seconds: 10,
          description: `Look up the owner's price list by what was said: a product name, brand, size or SKU (for example "Brasswick ball valve" or "TX-199"). Returns up to 5 matching items, each with sku, name, variant (a size such as "3/4", or null), unit, sell price and which suppliers show stock. Call it before naming any sku in a draft. If more than one variant comes back and the owner did not say which, ask one short question before drafting. Does not add anything to a quote, does not contact a supplier and does not reveal supplier cost or margin.`,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["query"],
            properties: {
              query: { type: "string", pattern: "\\S", description: "What the owner said: a product name, brand, size or SKU." }
            }
          }
        },
        {
          name: "get_board",
          execution_mode: "interactive",
          timeout_seconds: 10,
          description: "Read what is on the owner's screen right now: the open drafts (lines, quantities, totals, status and any refused lines so far), the open leads (the only customers you may quote) and the last 5 heard turns with their ids and exact text. Use it to find a draft id or to re-read the owner's exact words before citing them. Does not change anything.",
          parameters: { type: "object", additionalProperties: false, properties: {} }
        },
        {
          name: "draft_quote",
          execution_mode: "hold",
          timeout_seconds: 20,
          description: `Create a draft customer quote for an existing lead from what the owner said. customer is the lead's name as heard (for example "Priya Shah"). Each line is { sku, qty, heard, detail_heard? }: sku from search_catalog; qty the quantity said; heard the owner's exact words from one turn that name the item and its quantity, copied word for word (for example "two Brasswick ball valves"); detail_heard, when you had to ask which size, the words of the owner's answer (for example "Three-quarter"). labor_hours with labor_heard, the exact words that gave the hours (for example "Call it six hours labor"). The system prices every line from the price list and returns the draft with its total, plus any refused line with the reason and how to fix it; read the total back in one sentence. Does not send the quote, does not set or change any price, discount or total (any such field is refused), does not book an install date and does not create a customer. A line whose heard words are not in any heard turn, or whose qty is not in those words, is refused.`,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["customer", "lines", "labor_hours", "labor_heard"],
            properties: {
              customer: { type: "string", pattern: "\\S", description: `The lead's name as heard, for example "Priya Shah".` },
              lines: { type: "array", items: LINE, description: "One entry per item." },
              labor_hours: { type: "number", minimum: 0, description: "Hours of labor the owner said; 0 when none was said." },
              labor_heard: {
                type: "string",
                description: `The owner's exact words that gave the hours, for example "Call it six hours labor"; an empty string when labor_hours is 0.`
              },
              note: { type: "string", description: "Optional short note for the owner." }
            }
          }
        },
        {
          name: "revise_quote",
          execution_mode: "hold",
          timeout_seconds: 20,
          description: `Change an unsent draft quote when the owner corrects it. changes is a list of { op, sku, qty?, heard, detail_heard? }: op "set_qty" changes a line's quantity (qty required), "add" adds a new item (qty required), "remove" drops a line. heard is the owner's exact words from one turn asking for that change and naming the item (for example "make that thirty feet of PEX"). Each change is recorded as a revision with before, after and the words that asked for it, and the total is recomputed. Does not send, cannot touch a sent or discarded draft and cannot change prices; the same exact-words rules as draft_quote apply.`,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["draft_id", "changes"],
            properties: {
              draft_id: { type: "string", pattern: "\\S", description: 'The draft quote id, for example "Q-1001".' },
              changes: {
                type: "array",
                description: "The corrections, in the order the owner gave them.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["op", "sku", "heard"],
                  properties: {
                    op: { type: "string", enum: ["set_qty", "add", "remove"] },
                    sku: SKU,
                    qty: QTY,
                    heard: HEARD,
                    detail_heard: DETAIL_HEARD
                  }
                }
              }
            }
          }
        },
        {
          name: "draft_supplier_request",
          execution_mode: "hold",
          timeout_seconds: 20,
          description: 'Draft a stock-and-price check to one supplier (for example "Northgate") for items on the price list. lines are { sku, qty, heard, detail_heard? } with the same exact-words rules as draft_quote. needed_by is when the owner needs the items, kept as the words heard (for example "Thursday"), with needed_by_heard the exact words it came from (for example "for Thursday"). Does not send the request, does not place an order and does not commit any spend.',
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["supplier", "lines"],
            properties: {
              supplier: { type: "string", pattern: "\\S", description: `The supplier's name as heard, for example "Northgate".` },
              lines: { type: "array", items: LINE, description: "One entry per item to check." },
              needed_by: { type: "string", pattern: "\\S", description: "When the items are needed, in the owner's words." },
              needed_by_heard: { type: "string", pattern: "\\S", description: "The owner's exact words that said when." }
            }
          }
        }
      ].map((tool) => ({ ...tool, description: `${tool.description} ${SHARED_CLAUSE}` }));
      var AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);
      var EVIDENCE_FIELDS = /* @__PURE__ */ new Set(["heard", "labor_heard"]);
      function relaxEvidence(schema) {
        const out = { ...schema };
        if (out.required) out.required = out.required.filter((k) => !EVIDENCE_FIELDS.has(k));
        if (out.properties) {
          out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, relaxEvidence(v)]));
        }
        if (out.items) out.items = relaxEvidence(out.items);
        return out;
      }
      function voiceAgentTools() {
        return AGENT_TOOLS.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          execution_mode: t.execution_mode,
          timeout_seconds: t.timeout_seconds
        }));
      }
      function listTools() {
        return voiceAgentTools().map(({ type: _type, ...rest }) => rest);
      }
      module.exports = { AGENT_TOOLS, AGENT_TOOL_NAMES, SHARED_CLAUSE, relaxEvidence, voiceAgentTools, listTools };
    }
  });

  // src/catalog.js
  var require_catalog = __commonJS({
    "src/catalog.js"(exports, module) {
      "use strict";
      var { tokenize, singular } = require_evidence();
      var toCents = (dollars) => Math.round(dollars * 100);
      var fromCents = (cents) => cents / 100;
      function sellPriceCents(item, markupPct) {
        const costs = Object.values(item.suppliers).filter((s) => s.stock > 0).map((s) => toCents(s.cost));
        if (costs.length === 0) return null;
        return Math.round(Math.min(...costs) * (100 + markupPct) / 100);
      }
      function sellPrice(item, markupPct) {
        const cents = sellPriceCents(item, markupPct);
        return cents === null ? null : fromCents(cents);
      }
      function laborCents(hours, rate) {
        return Math.round(hours * toCents(rate));
      }
      function publicItem(item, business, suppliers) {
        return {
          sku: item.sku,
          name: item.name,
          variant: item.variant,
          unit: item.unit,
          price: sellPrice(item, business.markupPct),
          in_stock_at: Object.entries(item.suppliers).filter(([, s]) => s.stock > 0).map(([id]) => (suppliers.find((sup) => sup.id === id) || { name: id }).name)
        };
      }
      var SEARCH_NOISE = /* @__PURE__ */ new Set(["a", "an", "the", "of", "and", "for", "with", "some", "any"]);
      function search(state, query, models, limit = 5) {
        const words = tokenize(query, models).filter((tok) => !SEARCH_NOISE.has(tok.t)).map((tok) => ({ t: tok.t, s: singular(tok.t), base: tok.base }));
        if (words.length === 0) return [];
        const scored = state.catalog.map((item, index) => {
          const hay = tokenize(`${item.name} ${item.variant || ""} ${item.sku} ${item.sku.replace(/-/g, " ")}`, models);
          const keys = /* @__PURE__ */ new Set();
          for (const tok of hay) {
            keys.add(tok.t);
            keys.add(singular(tok.t));
            if (tok.base) keys.add(tok.base);
          }
          const score = words.filter((w) => keys.has(w.t) || keys.has(w.s) || w.base && keys.has(w.base)).length;
          return { item, index, score };
        });
        return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((s) => publicItem(s.item, state.business, state.suppliers));
      }
      module.exports = { sellPrice, sellPriceCents, laborCents, toCents, fromCents, search, publicItem };
    }
  });

  // src/drafts.js
  var require_drafts = __commonJS({
    "src/drafts.js"(exports, module) {
      "use strict";
      var { Refusal } = require_refusal();
      var { search, sellPriceCents, laborCents, fromCents } = require_catalog();
      var { checkLine, checkLabor, checkPhrase, findInTurns, turnsAbout } = require_evidence();
      var { clone } = require_store();
      var norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      function findItem(state, sku) {
        return state.catalog.find((item) => item.sku === String(sku).toUpperCase());
      }
      function siblingsOf(state, item) {
        return state.catalog.filter((other) => other.name === item.name && other.sku !== item.sku);
      }
      function findLead(state, customer) {
        const c = norm(customer);
        const exact = state.leads.filter((l) => l.id === customer || norm(l.name) === c || c.includes(norm(l.name)));
        if (exact.length === 1) return exact[0];
        const words = new Set(c.split(" "));
        const partial = state.leads.filter((l) => norm(l.name).split(" ").some((w) => words.has(w)));
        return partial.length === 1 ? partial[0] : null;
      }
      function findSupplier(state, name) {
        const words = new Set(norm(name).split(" "));
        const matches = state.suppliers.filter(
          (sup) => sup.id === name || norm(sup.name) === norm(name) || words.has(norm(sup.name).split(" ")[0])
        );
        return matches.length === 1 ? matches[0] : null;
      }
      function findDraft(state, id) {
        const draft = state.drafts.find((d) => d.id === id);
        if (!draft) throw new Refusal(`There is no draft ${id}. get_board lists the open drafts.`);
        return draft;
      }
      function assertOpen(draft) {
        if (draft.status === "sent") {
          throw new Refusal(`${draft.id} was sent at ${draft.sentAt} and is frozen; nothing was changed. A change after sending needs a new draft.`);
        }
        if (draft.status === "discarded") {
          throw new Refusal(`${draft.id} was discarded by the owner ("${draft.discardReason}"); nothing was changed.`);
        }
      }
      function recomputeTotal(draft) {
        const cents = draft.lines.reduce((sum, l) => sum + Math.round(l.lineTotal * 100), 0) + (draft.labor ? Math.round(draft.labor.amount * 100) : 0);
        draft.total = fromCents(cents);
      }
      function turnsForLead(state, lead) {
        const about = turnsAbout(state.turns, state.leads, lead.id);
        if (!about) {
          throw new Refusal(
            `No turn heard so far names ${lead.name} or ${lead.site}, so nothing heard can be cited for their quote. Ask the owner who this job is for; the quote is drafted once the owner has named the customer.`
          );
        }
        return about;
      }
      function scopeReason(ctx, fields, reason) {
        if (!ctx.turns || !ctx.lead) return reason;
        for (const [field, text] of Object.entries(fields)) {
          if (!text || !reason.startsWith(`${field} must be the owner's exact words`)) continue;
          const elsewhere = findInTurns(ctx.store.state.turns, text, ctx.store.models);
          if (elsewhere) {
            return `${field} '${String(text).trim()}' was heard in ${elsewhere.turnId}, which is not about ${ctx.lead.name}'s job. Cite only what the owner said about ${ctx.lead.name}.`;
          }
        }
        return reason;
      }
      function buildLine(ctx, spec, { priced, needQty = true, variantRule = true }) {
        const { store, actor } = ctx;
        const state = store.state;
        const item = findItem(state, spec.sku);
        if (!item) return { reason: `No item with sku ${spec.sku} is on the price list. Use search_catalog to find the sku.` };
        const line = { sku: item.sku, name: item.name, variant: item.variant, unit: item.unit, qty: spec.qty };
        if (priced) {
          const cents = sellPriceCents(item, state.business.markupPct);
          if (cents === null) {
            return { reason: `No supplier shows ${item.sku} in stock, so it has no price. Tell the owner; draft_supplier_request can ask a supplier.` };
          }
          line.unitPrice = fromCents(cents);
          line.lineTotal = fromCents(cents * spec.qty);
        }
        if (actor === "agent") {
          const ev = checkLine({
            item,
            siblings: variantRule ? siblingsOf(state, item) : [],
            catalog: state.catalog,
            qty: spec.qty,
            heard: spec.heard,
            detailHeard: spec.detail_heard,
            turns: ctx.turns || state.turns,
            models: store.models,
            needQty
          });
          if (ev.reason) return { reason: scopeReason(ctx, { heard: spec.heard, detail_heard: spec.detail_heard }, ev.reason) };
          Object.assign(line, { heard: spec.heard, turnId: ev.turnId });
          if (ev.detailTurnId) Object.assign(line, { detailHeard: spec.detail_heard, detailTurnId: ev.detailTurnId });
        } else {
          Object.assign(line, { heard: null, turnId: null });
        }
        line.by = actor;
        return { line };
      }
      function buildLines(ctx, specs, opts) {
        const lines = [];
        const refused = [];
        specs.forEach((spec, index) => {
          const built = buildLine(ctx, spec, opts);
          if (built.reason) refused.push({ index, sku: spec.sku, reason: built.reason });
          else if (lines.some((l) => l.sku === built.line.sku)) {
            refused.push({ index, sku: spec.sku, reason: `${built.line.sku} is already a line of this draft; one line per item.` });
          } else lines.push(built.line);
        });
        return { lines, refused };
      }
      function refuseAll(what, refused) {
        const reasons = refused.map((r) => r.sku ? `${r.sku}: ${r.reason}` : r.reason).join(" ");
        throw new Refusal(`No ${what} was drafted. ${reasons}`, { refused });
      }
      var DRAFT_NOTE = "Draft only. It is on the owner's screen, and only the owner's tap sends it.";
      function searchCatalog({ store, args }) {
        const results = search(store.state, args.query, store.models);
        if (results.length === 0) {
          return { query: args.query, results, note: `Nothing on the price list matches "${args.query}". Ask the owner what they meant.` };
        }
        return { query: args.query, results };
      }
      function boardDraft(d) {
        const base = { id: d.id, kind: d.kind, status: d.status, refusals: d.refusals.slice(-5) };
        if (d.kind === "customer_quote") {
          return {
            ...base,
            customer: d.customer.name,
            lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, variant: l.variant, qty: l.qty, unit_price: l.unitPrice, line_total: l.lineTotal, heard: l.heard })),
            labor: d.labor && { hours: d.labor.hours, amount: d.labor.amount },
            total: d.total
          };
        }
        return {
          ...base,
          supplier: d.supplier.name,
          lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, variant: l.variant, qty: l.qty, heard: l.heard })),
          needed_by: d.neededBy
        };
      }
      function getBoard({ store }) {
        const state = store.state;
        return {
          drafts: state.drafts.filter((d) => d.status === "draft").map(boardDraft),
          leads: state.leads.map((l) => ({ id: l.id, name: l.name, site: l.site })),
          recent_turns: state.turns.slice(-5).map((t) => ({ id: t.id, text: t.text, spoken_approval: t.spokenApproval }))
        };
      }
      function draftQuote(ctx) {
        const { store, args, actor } = ctx;
        const state = store.state;
        const lead = findLead(state, args.customer);
        if (!lead) {
          const leads = state.leads.map((l) => `${l.name} (${l.site})`).join(", ");
          throw new Refusal(`No open lead matches "${args.customer}". The open leads are: ${leads}. Quotes are only for existing leads; the agent cannot create a customer.`);
        }
        const open = state.drafts.find((d) => d.kind === "customer_quote" && d.leadId === lead.id && d.status === "draft");
        if (open) throw new Refusal(`${lead.name} already has open draft ${open.id}. Use revise_quote to change it.`);
        if (args.lines.length === 0) throw new Refusal("A quote needs at least one line.");
        const turns = actor === "agent" ? turnsForLead(state, lead) : null;
        const lineCtx = { ...ctx, turns, lead };
        const { lines, refused } = buildLines(lineCtx, args.lines, { priced: true });
        if (lines.length === 0) refuseAll("quote", refused);
        let labor = null;
        if (args.labor_hours > 0) {
          const rate = state.business.laborRate;
          const amount = fromCents(laborCents(args.labor_hours, rate));
          if (actor === "agent") {
            const ev = args.labor_heard ? checkLabor({ hours: args.labor_hours, heard: args.labor_heard, turns, models: store.models }) : { reason: "labor_heard is required when labor_hours is more than 0." };
            if (ev.reason) refused.push({ field: "labor", reason: scopeReason(lineCtx, { labor_heard: args.labor_heard }, ev.reason) });
            else labor = { hours: args.labor_hours, rate, amount, heard: args.labor_heard, turnId: ev.turnId, by: actor };
          } else {
            labor = { hours: args.labor_hours, rate, amount, heard: null, turnId: null, by: actor };
          }
        }
        const at = store.nowIso();
        const draft = {
          id: store.nextId("quote"),
          kind: "customer_quote",
          status: "draft",
          leadId: lead.id,
          customer: { name: lead.name, site: lead.site, email: lead.email, phone: lead.phone },
          lines,
          labor,
          note: args.note || null,
          total: 0,
          createdAt: at,
          createdBy: actor,
          revisions: [],
          refusals: refused.map((r) => ({ at, by: actor, sku: r.sku || null, field: r.field || null, reason: r.reason })),
          spokenApprovalsRefused: [],
          sentAt: null,
          sentBy: null,
          discardedAt: null,
          discardedBy: null,
          discardReason: null
        };
        recomputeTotal(draft);
        state.drafts.push(draft);
        return { draft: clone(draft), refused, note: DRAFT_NOTE };
      }
      function reviseQuote(ctx) {
        const { store, args, actor } = ctx;
        const state = store.state;
        const draft = findDraft(state, args.draft_id);
        if (draft.kind !== "customer_quote") throw new Refusal(`${draft.id} is a supplier request; revise_quote changes customer quotes only.`);
        assertOpen(draft);
        if (args.changes.length === 0) throw new Refusal("changes is empty; nothing was changed.");
        const lead = state.leads.find((l) => l.id === draft.leadId);
        const lineCtx = actor === "agent" ? { ...ctx, turns: turnsForLead(state, lead), lead } : ctx;
        const lines = clone(draft.lines);
        const revisions = [];
        const refused = [];
        const at = store.nowIso();
        args.changes.forEach((change, index) => {
          const refuse = (reason) => refused.push({ index, sku: change.sku, reason });
          const sku = String(change.sku).toUpperCase();
          const pos = lines.findIndex((l) => l.sku === sku);
          if (change.op !== "remove" && change.qty === void 0) return refuse(`qty is required for ${change.op}.`);
          if (change.op === "add") {
            if (pos >= 0) return refuse(`${sku} is already a line; use set_qty to change its quantity.`);
            const built2 = buildLine(lineCtx, change, { priced: true });
            if (built2.reason) return refuse(built2.reason);
            lines.push(built2.line);
            return revisions.push({ at, by: actor, op: "add", sku, from: 0, to: change.qty, heard: built2.line.heard, turnId: built2.line.turnId });
          }
          if (pos < 0) return refuse(`${sku} is not a line of ${draft.id}.`);
          const line = lines[pos];
          const built = buildLine(lineCtx, { ...change, qty: change.qty ?? line.qty }, { priced: true, needQty: change.op === "set_qty", variantRule: false });
          if (built.reason) return refuse(built.reason);
          if (change.op === "set_qty") {
            if (change.qty === line.qty) return refuse(`${sku} is already ${line.qty}.`);
            const from = line.qty;
            const replacedHeard = line.heard;
            line.qty = change.qty;
            line.lineTotal = fromCents(Math.round(line.unitPrice * 100) * change.qty);
            Object.assign(line, { heard: built.line.heard, turnId: built.line.turnId, by: actor });
            return revisions.push({ at, by: actor, op: "set_qty", sku, from, to: change.qty, heard: built.line.heard, turnId: built.line.turnId, replacedHeard });
          }
          if (lines.length === 1) return refuse(`${sku} is the last line; a quote needs at least one. The owner can discard the draft instead.`);
          lines.splice(pos, 1);
          return revisions.push({ at, by: actor, op: "remove", sku, from: line.qty, to: 0, heard: built.line.heard, turnId: built.line.turnId });
        });
        if (revisions.length === 0) refuseAll("change", refused);
        draft.lines = lines;
        draft.revisions.push(...revisions);
        draft.refusals.push(...refused.map((r) => ({ at, by: actor, sku: r.sku, field: null, reason: r.reason })));
        recomputeTotal(draft);
        return { draft: clone(draft), revisions, refused, note: DRAFT_NOTE };
      }
      function draftSupplierRequest(ctx) {
        const { store, args, actor } = ctx;
        const state = store.state;
        const supplier = findSupplier(state, args.supplier);
        if (!supplier) {
          throw new Refusal(`No supplier matches "${args.supplier}". The suppliers are: ${state.suppliers.map((s) => s.name).join(", ")}.`);
        }
        if (args.lines.length === 0) throw new Refusal("A supplier request needs at least one line.");
        if (args.needed_by_heard !== void 0 && args.needed_by === void 0) throw new Refusal("needed_by_heard was given without needed_by.");
        const { lines, refused } = buildLines(ctx, args.lines, { priced: false });
        if (lines.length === 0) refuseAll("supplier request", refused);
        let neededBy = null;
        if (args.needed_by !== void 0) {
          if (actor === "agent") {
            const ev = args.needed_by_heard ? checkPhrase({ field: "needed_by", value: args.needed_by, heardField: "needed_by_heard", heard: args.needed_by_heard, turns: state.turns, models: store.models }) : { reason: "needed_by_heard is required with needed_by." };
            if (ev.reason) refused.push({ field: "needed_by", reason: ev.reason });
            else neededBy = { words: args.needed_by, heard: args.needed_by_heard, turnId: ev.turnId };
          } else {
            neededBy = { words: args.needed_by, heard: null, turnId: null };
          }
        }
        const at = store.nowIso();
        const draft = {
          id: store.nextId("supplier"),
          kind: "supplier_request",
          status: "draft",
          supplierId: supplier.id,
          supplier: { name: supplier.name, email: supplier.email, phone: supplier.phone },
          lines,
          neededBy: neededBy && neededBy.words,
          neededByHeard: neededBy && neededBy.heard,
          neededByTurnId: neededBy && neededBy.turnId,
          createdAt: at,
          createdBy: actor,
          revisions: [],
          refusals: refused.map((r) => ({ at, by: actor, sku: r.sku || null, field: r.field || null, reason: r.reason })),
          spokenApprovalsRefused: [],
          sentAt: null,
          sentBy: null,
          discardedAt: null,
          discardedBy: null,
          discardReason: null
        };
        state.drafts.push(draft);
        return { draft: clone(draft), refused, note: DRAFT_NOTE };
      }
      var SHARED_HANDLERS = {
        search_catalog: searchCatalog,
        get_board: getBoard,
        draft_quote: draftQuote,
        revise_quote: reviseQuote,
        draft_supplier_request: draftSupplierRequest
      };
      module.exports = { SHARED_HANDLERS, findDraft, assertOpen };
    }
  });

  // src/spoken.js
  var require_spoken = __commonJS({
    "src/spoken.js"(exports, module) {
      "use strict";
      var COMMIT_PATTERNS = [
        /\b(send|ship|email|e-mail|mail|text|submit|forward)\s+(it|this|that|them|the\s+(quote|estimate|request|order|price))\b/,
        /\bsend\s+(it\s+)?(over|off|out|through)\b/,
        /\bbook\s+(it|that|this|me|us|the\s+(job|install|installation|date))\b/,
        /\bplace\s+the\s+order\b/,
        /\border\s+(it|them|that|those)\b/,
        /\bi\s+approve\b|\bapproved\b|\bapprove\s+(it|this|that|the\s+quote)\b/,
        /\bgo\s+ahead\s+(and\s+(send|book|order|place|submit|ship|email)\b|with\s+(it|that|the\s+(quote|order|job))\b)/,
        /\bwe'?ll\s+take\s+it\b/
      ];
      var FILLER = /\b(yeah|yes|yep|ok|okay|sure|alright|all right|great|sounds good|sounds great|perfect|then|just|please|so)\b/g;
      var BARE_GO_AHEAD = /^go\s+ahead$/;
      var NEGATION = /\b(don'?t|do\s+not|not|never|no|wait|hold\s+off|hold\s+on|stop|cancel|nope|shouldn'?t|won'?t|before\s+you)\b/;
      var QUESTION_START = /^(can|could|would|will|should|shall|did|do|does|are|is|have|has|may|might)\b/;
      function sentences(text) {
        return String(text).toLowerCase().replace(/[‘’]/g, "'").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      }
      function detectSpokenApproval(text) {
        for (const sentence of sentences(text)) {
          const isQuestion = sentence.endsWith("?") || QUESTION_START.test(sentence);
          if (isQuestion) continue;
          for (const clause of sentence.replace(/[.!]+$/, "").split(/[,;:]|\s+-\s+|\s+but\s+/)) {
            const c = clause.trim();
            if (!c) continue;
            const bare = c.replace(FILLER, " ").replace(/\s+/g, " ").trim();
            let match = null;
            if (BARE_GO_AHEAD.test(bare)) match = "go ahead";
            for (const re of COMMIT_PATTERNS) {
              if (match) break;
              const m = c.match(re);
              if (m) match = m[0];
            }
            if (!match) continue;
            const before = sentence.slice(0, sentence.indexOf(c) + c.indexOf(match)).replace(/\bno\s+(problem|worries)\b/g, "");
            if (NEGATION.test(before) || /\bnot\s+yet\b/.test(c)) continue;
            return { approval: true, phrase: clause.trim() };
          }
        }
        return { approval: false };
      }
      module.exports = { detectSpokenApproval };
    }
  });

  // src/invoke.js
  var require_invoke = __commonJS({
    "src/invoke.js"(exports, module) {
      "use strict";
      var { Refusal } = require_refusal();
      var { validate } = require_schema();
      var { AGENT_TOOLS, AGENT_TOOL_NAMES, relaxEvidence } = require_tools();
      var { SHARED_HANDLERS, findDraft, assertOpen } = require_drafts();
      var { detectSpokenApproval } = require_spoken();
      var { clone } = require_store();
      var ACTORS = ["agent", "owner", "voice"];
      var SPOKEN_REFUSAL = "refused as approval: a voice is not a signature; only a tap sends";
      function ownerOnly(tool) {
        return `${tool} is owner-only: it is not a tool, and only the owner's tap on screen does it. Nothing said aloud and nothing the agent calls performs it. Nothing was changed.`;
      }
      function customerCopy(state, draft) {
        const b = state.business;
        return {
          from: { name: b.name, owner: b.owner, email: b.email, phone: b.phone, address: b.address },
          to: draft.customer,
          quote: draft.id,
          date: draft.sentAt,
          lines: draft.lines.map((l) => ({
            description: l.variant ? `${l.name}, ${l.variant}-inch` : l.name,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal
          })),
          labor: draft.labor && { hours: draft.labor.hours, rate: draft.labor.rate, amount: draft.labor.amount },
          total: draft.total,
          taxNote: "Tax calculated at invoicing"
        };
      }
      function sendQuote({ store, args, actor }) {
        if (actor !== "owner") throw new Refusal(ownerOnly("send_quote"));
        const state = store.state;
        const draft = findDraft(state, args.draft_id);
        if (draft.kind !== "customer_quote") throw new Refusal(`${draft.id} is a supplier request; use send_supplier_request.`);
        assertOpen(draft);
        draft.status = "sent";
        draft.sentAt = store.nowIso();
        draft.sentBy = "owner";
        const copy = customerCopy(state, draft);
        const entry = { id: store.nextId("outbox"), draftId: draft.id, kind: draft.kind, to: draft.customer.email, toName: draft.customer.name, at: draft.sentAt, by: "owner", copy };
        state.outbox.push(entry);
        return { draft: clone(draft), outbox: clone(entry), customer_copy: clone(copy) };
      }
      function sendSupplierRequest({ store, args, actor }) {
        if (actor !== "owner") throw new Refusal(ownerOnly("send_supplier_request"));
        const state = store.state;
        const draft = findDraft(state, args.draft_id);
        if (draft.kind !== "supplier_request") throw new Refusal(`${draft.id} is a customer quote; use send_quote.`);
        assertOpen(draft);
        draft.status = "sent";
        draft.sentAt = store.nowIso();
        draft.sentBy = "owner";
        const entry = { id: store.nextId("outbox"), draftId: draft.id, kind: draft.kind, to: draft.supplier.email, toName: draft.supplier.name, at: draft.sentAt, by: "owner" };
        state.outbox.push(entry);
        return { draft: clone(draft), outbox: clone(entry) };
      }
      function discardDraft({ store, args, actor }) {
        if (actor !== "owner") throw new Refusal(ownerOnly("discard_draft"));
        const draft = findDraft(store.state, args.draft_id);
        assertOpen(draft);
        draft.status = "discarded";
        draft.discardedAt = store.nowIso();
        draft.discardedBy = "owner";
        draft.discardReason = args.reason.trim();
        return { draft: clone(draft) };
      }
      function recordTurn({ store, args, actor }) {
        if (actor !== "voice") {
          throw new Refusal("record_turn is written only by the voice feed inside the process that holds the voice session; it is not a tool and cannot be called by the agent or the owner.");
        }
        const state = store.state;
        if (state.turns.some((t) => t.itemId === args.item_id)) throw new Refusal(`Turn ${args.item_id} is already recorded.`);
        const spoken = detectSpokenApproval(args.text);
        const turn = { id: store.nextId("turn"), itemId: args.item_id, text: args.text, at: store.nowIso(), clip: args.clip || null, spokenApproval: spoken.approval };
        state.turns.push(turn);
        if (!spoken.approval) return { turn: clone(turn), spoken_approval: null };
        const open = state.drafts.filter((d) => d.status === "draft");
        for (const d of open) d.spokenApprovalsRefused.push(turn.id);
        return {
          turn: clone(turn),
          spoken_approval: { heard: args.text, refused: SPOKEN_REFUSAL, drafts_unchanged: open.map((d) => d.id) }
        };
      }
      var DRAFT_ID = { type: "string", pattern: "\\S", description: 'The draft id, for example "Q-1001".' };
      var OWNER_VERBS = {
        send_quote: {
          handler: sendQuote,
          schema: { type: "object", additionalProperties: false, required: ["draft_id"], properties: { draft_id: DRAFT_ID } }
        },
        send_supplier_request: {
          handler: sendSupplierRequest,
          schema: { type: "object", additionalProperties: false, required: ["draft_id"], properties: { draft_id: DRAFT_ID } }
        },
        discard_draft: {
          handler: discardDraft,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["draft_id", "reason"],
            properties: { draft_id: DRAFT_ID, reason: { type: "string", pattern: "\\S" } }
          }
        }
      };
      var VOICE_VERBS = {
        record_turn: {
          handler: recordTurn,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["item_id", "text"],
            properties: {
              item_id: { type: "string", pattern: "\\S" },
              text: { type: "string", pattern: "\\S" },
              clip: { type: "string", pattern: "^[a-z0-9_-]+$" }
            }
          }
        }
      };
      var VERBS = {};
      for (const tool of AGENT_TOOLS) {
        VERBS[tool.name] = {
          actors: ["agent", "owner"],
          schemas: { agent: tool.parameters, owner: relaxEvidence(tool.parameters) },
          handler: SHARED_HANDLERS[tool.name]
        };
      }
      for (const [name, verb] of Object.entries(OWNER_VERBS)) VERBS[name] = { actors: ["owner"], schemas: { owner: verb.schema }, handler: verb.handler };
      for (const [name, verb] of Object.entries(VOICE_VERBS)) VERBS[name] = { actors: ["voice"], schemas: { voice: verb.schema }, handler: verb.handler };
      function actorRefusal(tool, actor) {
        if (OWNER_VERBS[tool]) return ownerOnly(tool);
        if (VOICE_VERBS[tool]) return "record_turn is written only by the voice feed; it is not a tool and cannot be called by the agent or the owner.";
        return `${tool} cannot be called by ${actor}.`;
      }
      function createInvoke(store) {
        return function invoke(tool, args, actor, { cause } = {}) {
          const input = args === void 0 ? {} : args;
          const entry = { actor: typeof actor === "string" ? actor : null, tool: String(tool), args: input, cause: cause || { source: "direct" } };
          const refuse = (message, details) => {
            const activity = store.appendLog({ ...entry, outcome: "refused", error: message });
            return { success: false, error: message, ...details ? { details: clone(details) } : {}, activity };
          };
          if (!ACTORS.includes(actor)) {
            return refuse(`invoke needs an actor ("agent", "owner" or "voice"); ${JSON.stringify(actor ?? null)} is not one. There is no default identity.`);
          }
          const verb = Object.hasOwn(VERBS, tool) ? VERBS[tool] : null;
          if (!verb) return refuse(`Unknown tool "${tool}". The agent's tools are: ${AGENT_TOOL_NAMES.join(", ")}.`);
          if (!verb.actors.includes(actor)) return refuse(actorRefusal(tool, actor));
          const invalid = validate(verb.schemas[actor], input, tool);
          if (invalid) return refuse(invalid.message, { field: invalid.path });
          try {
            const result = verb.handler({ store, args: input, actor });
            const flagged = tool === "record_turn" && result.spoken_approval;
            const activity = store.appendLog({ ...entry, outcome: flagged ? "refused_as_approval" : "ok", result, ...flagged ? { note: SPOKEN_REFUSAL } : {} });
            return { success: true, result: clone(result), activity };
          } catch (err) {
            if (err instanceof Refusal) return refuse(err.message, err.details);
            const activity = store.appendLog({ ...entry, outcome: "error", error: String(err && err.message) });
            return { success: false, error: `internal error in ${tool}: ${err && err.message}`, activity };
          }
        };
      }
      function verbSchemas() {
        return Object.fromEntries(Object.entries(VERBS).map(([name, verb]) => [name, verb.schemas]));
      }
      module.exports = {
        createInvoke,
        verbSchemas,
        ACTORS,
        OWNER_VERB_NAMES: Object.keys(OWNER_VERBS),
        VOICE_VERB_NAMES: Object.keys(VOICE_VERBS),
        // Exposed so a test can call each owner-only handler directly with actor "agent" and prove the
        // handler's own check refuses, independent of the actor table above.
        ownerHandlers: { send_quote: sendQuote, send_supplier_request: sendSupplierRequest, discard_draft: discardDraft, record_turn: recordTurn },
        SPOKEN_REFUSAL
      };
    }
  });

  // src/api.js
  var require_api = __commonJS({
    "src/api.js"(exports, module) {
      "use strict";
      var { listTools } = require_tools();
      var { publicItem } = require_catalog();
      var HTTP_ACTORS = ["agent", "owner"];
      function createApi({ store, invoke }) {
        function getState() {
          const s = store.snapshot();
          return {
            status: 200,
            body: {
              business: s.business,
              suppliers: s.suppliers,
              catalog: s.catalog.map((item) => publicItem(item, s.business, s.suppliers)),
              leads: s.leads,
              turns: s.turns,
              drafts: s.drafts,
              outbox: s.outbox
            }
          };
        }
        function getActivityLog() {
          return { status: 200, body: store.activityLog() };
        }
        function getTools() {
          return { status: 200, body: listTools() };
        }
        function postInvoke(body) {
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return { status: 400, body: { error: "The request body must be a JSON object: { tool, args, actor }." } };
          }
          const { tool, args, actor } = body;
          if (typeof tool !== "string" || tool === "") return { status: 400, body: { error: "tool is required." } };
          if (actor === void 0 || actor === null || actor === "") {
            return { status: 400, body: { error: 'actor is required ("agent" or "owner"). There is no default identity.' } };
          }
          if (!HTTP_ACTORS.includes(actor)) {
            return { status: 400, body: { error: `actor must be "agent" or "owner"; ${JSON.stringify(actor)} cannot be asserted over HTTP.` } };
          }
          const extra = Object.keys(body).filter((k) => !["tool", "args", "actor"].includes(k));
          if (extra.length) return { status: 400, body: { error: `Unexpected field(s): ${extra.join(", ")}. The body is { tool, args, actor }.` } };
          return { status: 200, body: invoke(tool, args, actor, { cause: { source: "http" } }) };
        }
        return { getState, getActivityLog, getTools, postInvoke };
      }
      module.exports = { createApi, HTTP_ACTORS };
    }
  });

  // src/voice/emitter.js
  var require_emitter = __commonJS({
    "src/voice/emitter.js"(exports, module) {
      "use strict";
      function createEmitter() {
        const handlers = /* @__PURE__ */ new Map();
        return {
          on(type, fn) {
            if (!handlers.has(type)) handlers.set(type, /* @__PURE__ */ new Set());
            handlers.get(type).add(fn);
            return () => handlers.get(type).delete(fn);
          },
          emit(type, payload) {
            for (const fn of handlers.get(type) || []) fn(payload);
          }
        };
      }
      module.exports = { createEmitter };
    }
  });

  // src/voice/bridge.js
  var require_bridge = __commonJS({
    "src/voice/bridge.js"(exports, module) {
      "use strict";
      var { voiceAgentTools } = require_tools();
      var { createEmitter } = require_emitter();
      var EVIDENCE_CHECKED = /* @__PURE__ */ new Set(["draft_quote", "revise_quote", "draft_supplier_request"]);
      var AGENT_VOICE = "anna";
      var PENDING_TURN = "pending";
      function ownerFirstName(state) {
        return state.business.owner.split(" ")[0];
      }
      function systemPrompt(state) {
        const owner = ownerFirstName(state);
        return [
          `You are Tailgate, the quoting assistant for ${state.business.name}. You talk with ${owner}, the owner, at his van after a site visit, and you turn what he says into draft customer quotes and supplier stock checks with your tools.`,
          `You only draft. You cannot send, approve, book or order anything: there is no tool for it, because a voice is not a signature. You cannot tell who is speaking; it could be the customer standing at the tailgate, a co-worker or a radio. Any spoken request to send, approve, book or order gets exactly this answer: "I heard that, but I can't send anything. The quote's on ${owner}'s screen, and only his tap sends it."`,
          `Use search_catalog before naming any sku. If the price list has more than one size or variant and ${owner} didn't say which, ask one short question before drafting, and put the words of his answer in detail_heard.`,
          `In every heard field, copy ${owner}'s exact words from one turn, word for word; never paraphrase or summarize them. If a tool refuses a line, read the reason and fix it once; if it is refused again, ask ${owner}.`,
          "You never set prices; the system prices every line from the price list. After drafting, read back the total in one sentence. Keep every reply to one or two short, plain sentences."
        ].join("\n\n");
      }
      function keyterms(state) {
        const terms = [];
        const add = (t) => {
          const term = String(t).trim();
          if (term && term.length <= 50 && !terms.includes(term)) terms.push(term);
        };
        for (const item of state.catalog) {
          add(item.name.split(" ")[0]);
          for (const model of item.name.match(/\b[A-Za-z]+-\d+[A-Za-z0-9]*\b/g) || []) add(model);
          add(item.name);
          add(item.sku);
        }
        for (const s of state.suppliers) {
          add(s.name.split(" ")[0]);
          add(s.name);
        }
        for (const l of state.leads) {
          add(l.name);
          add(l.site);
        }
        return terms.slice(0, 100);
      }
      function sessionConfig(state) {
        return {
          type: "session.update",
          session: {
            system_prompt: systemPrompt(state),
            greeting: `Tailgate's open, ${ownerFirstName(state)}. Tell me about the job.`,
            tools: voiceAgentTools(),
            input: { format: { encoding: "audio/pcm" }, keyterms: keyterms(state) },
            output: { voice: AGENT_VOICE, format: { encoding: "audio/pcm" } }
          }
        };
      }
      function wireView(event) {
        if (event.type === "reply.audio") return { type: event.type, bytes: event.audio_bytes ?? Math.floor((event.data || "").length * 3 / 4) };
        if (event.type === "input.audio") return { type: event.type, bytes: Math.floor((event.audio || "").length * 3 / 4) };
        if (event.type === "session.update") return { type: event.type, tools: event.session.tools.map((t) => t.name) };
        return event;
      }
      var EXECUTION_MODES = new Map(voiceAgentTools().map((t) => [t.name, t.execution_mode]));
      function createBridge({
        provider,
        invoke,
        store,
        evidenceWaitMs = 3e3,
        resultFallbackMs = 1500,
        endWaitMs = 2e3,
        timers = { setTimeout, clearTimeout }
      }) {
        const events = createEmitter();
        const partials = /* @__PURE__ */ new Map();
        let ready = false;
        let ended = false;
        let closed = false;
        let started = false;
        let connected = false;
        let stopRequested = false;
        let sessionId = null;
        let replyInFlight = false;
        let lastTurnEvent = null;
        let held = [];
        let fallbackTimer = null;
        let waiting = [];
        let beforeReady = [];
        let textSeq = 0;
        let droppedAudio = 0;
        let lastAgentText = null;
        let endResolve = null;
        function send(event) {
          if (closed || ended) return false;
          try {
            provider.send(event);
          } catch (err) {
            events.emit("error", { code: "send_failed", message: `${event.type} was not sent: ${err && err.message}` });
            return false;
          }
          if (event.type !== "input.audio") events.emit("wire", { dir: "out", event: wireView(event) });
          return true;
        }
        function sendResult(r) {
          if (send({ type: "tool.result", call_id: r.call_id, result: r.result, is_error: r.is_error })) events.emit("result", { ...r, status: "sent" });
        }
        function clearFallback() {
          if (fallbackTimer !== null) timers.clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        function flushHeld() {
          clearFallback();
          const due = held;
          held = [];
          for (const r of due) sendResult(r);
        }
        function hold(r, why) {
          held.push(r);
          events.emit("result", { ...r, status: "held", why });
        }
        function queueResult(r) {
          if (closed || ended) return;
          if (replyInFlight) return hold(r, "reply");
          if (EXECUTION_MODES.get(r.name) === "hold" || lastTurnEvent === "reply.done") return sendResult(r);
          hold(r, "next-reply");
          if (fallbackTimer === null) {
            fallbackTimer = timers.setTimeout(() => {
              fallbackTimer = null;
              if (!replyInFlight) flushHeld();
            }, resultFallbackMs);
          }
          return void 0;
        }
        function cancelPending() {
          for (const w of waiting) timers.clearTimeout(w.timer);
          waiting = [];
          clearFallback();
          const dropped = held;
          held = [];
          for (const r of dropped) events.emit("result", { ...r, status: "dropped", why: "session-over" });
        }
        function runCall(ev) {
          let args = ev.arguments;
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
            }
          }
          const res = invoke(ev.name, args, "agent", { cause: { source: "tool.call", call_id: ev.call_id, session_id: sessionId } });
          const payload = res.success ? res.result : { error: res.error, ...res.details ? { details: res.details } : {} };
          queueResult({ call_id: ev.call_id, name: ev.name, result: JSON.stringify(payload), is_error: !res.success });
        }
        function releaseWaiting() {
          const due = waiting;
          waiting = [];
          for (const w of due) {
            timers.clearTimeout(w.timer);
            runCall(w.event);
          }
        }
        function onToolCall(ev) {
          if (EVIDENCE_CHECKED.has(ev.name) && partials.size > 0) {
            const entry = { event: ev, timer: null };
            entry.timer = timers.setTimeout(() => {
              waiting = waiting.filter((w) => w !== entry);
              runCall(ev);
            }, evidenceWaitMs);
            waiting.push(entry);
            events.emit("waiting", { call_id: ev.call_id, name: ev.name });
            return;
          }
          runCall(ev);
        }
        function recordTurn(itemId, text, cause) {
          const res = invoke("record_turn", { item_id: itemId, text }, "voice", { cause });
          events.emit("turn", res);
          return res;
        }
        function onMessage(ev) {
          events.emit("wire", { dir: "in", event: wireView(ev) });
          switch (ev.type) {
            case "session.ready": {
              ready = true;
              sessionId = ev.session_id || null;
              events.emit("ready", { session_id: sessionId });
              const queued = beforeReady;
              beforeReady = [];
              for (const e of queued) send(e);
              break;
            }
            case "transcript.user.delta": {
              const text = ev.text ?? ev.delta ?? "";
              const itemId = ev.item_id ?? null;
              partials.set(itemId ?? PENDING_TURN, text);
              events.emit("partial", { item_id: itemId, text });
              break;
            }
            case "transcript.user":
              partials.clear();
              recordTurn(ev.item_id, ev.text, { source: "transcript.user", item_id: ev.item_id, session_id: sessionId });
              releaseWaiting();
              break;
            case "tool.call":
              onToolCall(ev);
              break;
            case "input.speech.started":
              lastTurnEvent = ev.type;
              break;
            case "reply.started":
              lastTurnEvent = ev.type;
              replyInFlight = true;
              break;
            case "reply.audio":
              events.emit("audio", ev.data);
              break;
            case "transcript.agent.delta":
              events.emit("agentDelta", { delta: ev.delta });
              break;
            case "transcript.agent":
              lastAgentText = ev.text;
              events.emit("agent", { text: ev.text, interrupted: Boolean(ev.interrupted) });
              break;
            case "reply.done": {
              lastTurnEvent = ev.type;
              replyInFlight = false;
              if (ev.status === "interrupted") {
                clearFallback();
                const due = held;
                held = [];
                for (const r of due) events.emit("result", { ...r, status: "dropped", why: "interrupted" });
              } else {
                flushHeld();
              }
              break;
            }
            case "session.error":
              events.emit("error", ev);
              break;
            case "session.ended":
              ended = true;
              events.emit("ended", ev);
              if (endResolve) endResolve();
              break;
            default:
              break;
          }
        }
        return {
          on: events.on,
          async start() {
            if (started) throw new Error("bridge already started");
            started = true;
            provider.on("message", onMessage);
            provider.on("close", (info) => {
              closed = true;
              cancelPending();
              events.emit("close", info);
            });
            await provider.connect();
            connected = true;
            if (stopRequested) {
              send({ type: "session.end" });
              provider.close();
              return;
            }
            const config = sessionConfig(store.state);
            provider.send(config);
            events.emit("wire", { dir: "out", event: wireView(config) });
          },
          // PCM16 mono 24 kHz, base64. Audio before session.ready is dropped rather than queued: a
          // burst of queued audio would arrive faster than real time.
          sendAudio(base64) {
            if (!ready || ended || closed || !send({ type: "input.audio", audio: base64 })) {
              droppedAudio += 1;
              return false;
            }
            return true;
          },
          // Typed text for smoke tests: recorded as a voice turn (it is what the owner "said"), then
          // given to the agent as a user message.
          sendText(text) {
            textSeq += 1;
            recordTurn(`text_${textSeq}`, text, { source: "typed text", session_id: sessionId });
            const frames = [{ type: "conversation.message", role: "user", content: text }, { type: "reply.create" }];
            if (ready) for (const f of frames) send(f);
            else beforeReady.push(...frames);
          },
          async stop() {
            cancelPending();
            if (!started || ended || closed) return;
            if (!connected) {
              stopRequested = true;
              return;
            }
            let timer;
            const done = new Promise((resolve) => {
              endResolve = resolve;
              timer = timers.setTimeout(resolve, endWaitMs);
            });
            send({ type: "session.end" });
            await done;
            timers.clearTimeout(timer);
            provider.close();
          },
          status: () => ({ ready, connected, ended, closed, sessionId, replyInFlight, held: held.length, waiting: waiting.length, droppedAudio, lastAgentText })
        };
      }
      module.exports = { createBridge, sessionConfig, systemPrompt, keyterms, EVIDENCE_CHECKED, AGENT_VOICE };
    }
  });

  // src/voice/sessions.js
  var require_sessions = __commonJS({
    "src/voice/sessions.js"(exports, module) {
      "use strict";
      var { createBridge } = require_bridge();
      var FORWARD = ["wire", "partial", "agentDelta", "agent", "result", "waiting", "ready", "ended", "error"];
      function createSessions({ store, invoke, voices = [], broadcast }) {
        let session = null;
        const clockMs = () => Date.parse(store.nowIso());
        function describe() {
          return {
            modes: voices.map((v) => ({ mode: v.mode, label: v.label || null, synthetic: Boolean(v.synthetic), audio: Boolean(v.audio) })),
            active: Boolean(session),
            mode: session ? session.voice.mode : null,
            label: session ? session.voice.label || null : null,
            status: session ? session.bridge.status() : null
          };
        }
        async function stop() {
          if (!session) return { status: 409, body: { error: "No voice session is running.", ...describe() } };
          const current = session;
          session = null;
          if (current.starting) await current.starting;
          await current.bridge.stop();
          return { status: 200, body: { ...describe(), status: current.bridge.status() } };
        }
        async function start(body = {}) {
          if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "The request body must be a JSON object: { mode }." } };
          const extra = Object.keys(body).filter((k) => k !== "mode");
          if (extra.length) return { status: 400, body: { error: `Unexpected field(s): ${extra.join(", ")}. The body is { mode }.` } };
          if (voices.length === 0) return { status: 404, body: { error: "This surface has no voice session configured." } };
          const mode = body.mode === void 0 ? voices[0].mode : body.mode;
          const voice = voices.find((v) => v.mode === mode);
          if (!voice) {
            const offered = voices.map((v) => JSON.stringify(v.mode)).join(" or ");
            const hint = mode === "live" ? " Live mode needs the local server started with ASSEMBLYAI_API_KEY set in .env." : "";
            return { status: 400, body: { error: `mode must be ${offered}; ${JSON.stringify(mode)} is not offered here.${hint}` } };
          }
          if (session) return { status: 409, body: { error: "A voice session is already running; stop it first.", ...describe() } };
          const provider = voice.create();
          const timers = provider.bridgeTimers || voice.timers;
          const bridge = createBridge({ provider, invoke, store, ...timers ? { timers } : {} });
          const current = { voice, provider, bridge, starting: null };
          session = current;
          const t0 = typeof provider.originMs === "number" ? provider.originMs : clockMs();
          const emit = (type, data) => broadcast(type, { ...data, ms: Math.max(0, clockMs() - t0) });
          for (const type of FORWARD) bridge.on(type, (data) => emit(`voice.${type}`, data));
          bridge.on("audio", (data) => {
            if (data) emit("voice.audio", { data });
          });
          provider.on("progress", (p) => emit("voice.progress", { index: p.index, total: p.total, durationMs: provider.durationMs }));
          bridge.on("close", (info) => {
            if (session === current) session = null;
            emit("voice.close", info || {});
          });
          emit("voice.start", {
            mode: voice.mode,
            label: voice.label || null,
            synthetic: Boolean(voice.synthetic),
            durationMs: provider.durationMs ?? null,
            speed: provider.speed ?? 1
          });
          current.starting = bridge.start().then(
            () => null,
            (err) => err
          );
          const failed = await current.starting;
          current.starting = null;
          if (failed) {
            if (session === current) session = null;
            return { status: 502, body: { error: String(failed && failed.message) } };
          }
          if (session !== current) {
            return { status: 409, body: { error: "The voice session was stopped before it finished starting; it has been ended.", ...describe() } };
          }
          if (provider.done && typeof provider.done.then === "function") {
            provider.done.then(() => {
              if (session === current) stop();
            });
          }
          return { status: 200, body: describe() };
        }
        function sendAudio(base64) {
          if (!session) return { status: 409, body: { error: "No voice session is running; POST /api/voice/start first." } };
          if (!session.bridge.sendAudio(base64)) return { status: 409, body: { error: "The voice session is not ready for audio." } };
          return null;
        }
        return { describe, start, stop, sendAudio, active: () => Boolean(session) };
      }
      module.exports = { createSessions, FORWARD };
    }
  });

  // src/voice/tape.js
  var require_tape = __commonJS({
    "src/voice/tape.js"(exports, module) {
      "use strict";
      var { createEmitter } = require_emitter();
      var ALLOW = {
        "session.ready": ["session_id", "expires_at", "config"],
        "session.updated": [],
        "input.speech.started": [],
        "input.speech.stopped": [],
        "transcript.user.delta": ["item_id", "text", "delta"],
        "transcript.user": ["item_id", "text"],
        "reply.started": ["reply_id", "item_id"],
        "transcript.agent.delta": ["delta", "start_ms", "end_ms"],
        "transcript.agent": ["text", "interrupted"],
        "reply.done": ["reply_id", "status"],
        "tool.call": ["call_id", "name", "arguments"],
        "session.error": ["code", "message", "param"],
        "session.ended": ["session_duration_seconds", "audio_duration_seconds"],
        "session.update": ["session"],
        "tool.result": ["call_id", "result", "is_error"],
        "conversation.message": ["role", "content"],
        "reply.create": ["instructions"],
        "session.end": []
      };
      function stripUrl(s) {
        if (!/^(https?|wss?):\/\//i.test(s)) return s;
        try {
          const url = new URL(s);
          url.search = "";
          url.hash = "";
          return url.toString();
        } catch {
          return s.replace(/[?#].*$/, "");
        }
      }
      function scrub(value) {
        if (typeof value === "string") return stripUrl(value);
        if (Array.isArray(value)) return value.map(scrub);
        if (value && typeof value === "object") {
          const out = {};
          for (const [k, v] of Object.entries(value)) if (!/token/i.test(k)) out[k] = scrub(v);
          return out;
        }
        return value;
      }
      function base64Length(b64) {
        const s = String(b64 || "");
        return Math.floor(s.length * 3 / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
      }
      function scrubEvent(event) {
        const keep = ALLOW[event.type] || [];
        const out = { type: event.type };
        for (const k of keep) if (event[k] !== void 0) out[k] = scrub(event[k]);
        return out;
      }
      function tapeHeader({ recordedAt, seedHash = null, sessionId = null, model = null, synthetic = false, label = null }) {
        return scrub({ type: "tape.header", recordedAt, seedHash, sessionId, model, synthetic, label });
      }
      function tapeLabel(header) {
        if (header.synthetic) return header.label || "Scripted sample, not a recorded session";
        const day = String(header.recordedAt).slice(0, 10);
        return `Replay of a real AssemblyAI Voice Agent session (${header.sessionId}, recorded ${day})`;
      }
      function fingerprint(value) {
        const text = JSON.stringify(value);
        let h = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          h ^= text.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(16).padStart(8, "0");
      }
      function createTapeClock(recordedAt) {
        const base = Date.parse(recordedAt);
        if (Number.isNaN(base)) throw new Error(`tape recordedAt "${recordedAt}" is not a date`);
        let t = 0;
        return {
          now: () => base + t,
          advance(ms) {
            if (ms > t) t = ms;
          },
          get t() {
            return t;
          }
        };
      }
      function recordingProvider(inner, { writer, elapsed, clock = null }) {
        const events = createEmitter();
        inner.on("message", (event) => {
          const t = elapsed();
          if (clock) clock.advance(t);
          writer.record("in", event, t);
          events.emit("message", event);
        });
        inner.on("open", (info) => events.emit("open", info));
        inner.on("close", (info) => events.emit("close", info));
        return {
          on: events.on,
          connect: () => inner.connect(),
          send(event) {
            writer.record("out", event, elapsed());
            inner.send(event);
          },
          close: () => inner.close()
        };
      }
      function createTapeWriter({ write, writeAudio = () => {
      }, header }) {
        write(JSON.stringify(tapeHeader(header)));
        let audioOffset = 0;
        return {
          // t: milliseconds since the session started; dir: "in" (server to client) or "out".
          record(dir, event, t) {
            if (event.type === "input.audio") return;
            let line;
            if (event.type === "reply.audio") {
              const bytes = base64Length(event.data);
              writeAudio(event.data);
              line = { t, dir, event: { type: "reply.audio", audio_offset: audioOffset, audio_bytes: bytes } };
              audioOffset += bytes;
            } else {
              line = { t, dir, event: scrubEvent(event) };
            }
            write(JSON.stringify(line));
          }
        };
      }
      function parseTape(text) {
        const rows = String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
          try {
            return JSON.parse(l);
          } catch {
            throw new Error(`tape line ${i + 1} is not JSON`);
          }
        });
        if (rows.length === 0 || rows[0].type !== "tape.header") throw new Error("tape must start with a tape.header line");
        const [header, ...lines] = rows;
        lines.forEach((row, i) => {
          if (typeof row.t !== "number" || !["in", "out"].includes(row.dir) || !row.event || typeof row.event.type !== "string") {
            throw new Error(`tape line ${i + 2} must be { t, dir, event: { type, ... } }`);
          }
        });
        return { header, lines };
      }
      module.exports = {
        createTapeWriter,
        parseTape,
        scrub,
        scrubEvent,
        tapeHeader,
        tapeLabel,
        fingerprint,
        createTapeClock,
        recordingProvider,
        ALLOW
      };
    }
  });

  // src/voice/virtual-time.js
  var require_virtual_time = __commonJS({
    "src/voice/virtual-time.js"(exports, module) {
      "use strict";
      function createVirtualTime(start = 0) {
        let now = start;
        let seq = 0;
        const queue = [];
        function earliest() {
          let best = null;
          for (const item of queue) if (!best || item.at < best.at || item.at === best.at && item.id < best.id) best = item;
          return best;
        }
        const time = {
          now: () => now,
          setTimeout(fn, ms) {
            seq += 1;
            queue.push({ id: seq, at: now + Math.max(0, Number(ms) || 0), fn });
            return seq;
          },
          clearTimeout(id) {
            const at = queue.findIndex((item) => item.id === id);
            if (at >= 0) queue.splice(at, 1);
          },
          // Runs every timer due by `target`, in time order, with now() reading each timer's own
          // time while it runs; then leaves now() at target.
          advanceTo(target) {
            for (; ; ) {
              const next = earliest();
              if (!next || next.at > target) break;
              queue.splice(queue.indexOf(next), 1);
              if (next.at > now) now = next.at;
              next.fn();
            }
            if (target > now) now = target;
          },
          advance(ms) {
            time.advanceTo(now + Math.max(0, ms));
          },
          // Runs timers until none is left (a tape played to its end), at most `limit` of them.
          runAll(limit = 1e5) {
            for (let n = 0; n < limit; n += 1) {
              const next = earliest();
              if (!next) return;
              time.advanceTo(next.at);
            }
            throw new Error(`virtual time: more than ${limit} timers; something reschedules forever`);
          },
          pending: () => queue.length
        };
        return time;
      }
      module.exports = { createVirtualTime };
    }
  });

  // src/voice/replay.js
  var require_replay = __commonJS({
    "src/voice/replay.js"(exports, module) {
      "use strict";
      var { createEmitter } = require_emitter();
      var { createTapeClock } = require_tape();
      var { createVirtualTime } = require_virtual_time();
      var clone = (v) => JSON.parse(JSON.stringify(v));
      var REAL_TIMERS = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
      function scaledTimers(timers, speed) {
        if (speed === 1) return timers;
        return { setTimeout: (fn, ms) => timers.setTimeout(fn, ms / speed), clearTimeout: (id) => timers.clearTimeout(id) };
      }
      var ReplayVoiceProvider = class {
        constructor({ tape, speed = 1, now = () => Date.now(), timers = null, readAudio = null }) {
          if (!(speed > 0)) throw new Error("speed must be a positive number; Infinity replays instantly");
          this.header = tape.header;
          this.speed = speed;
          this.clock = createTapeClock(tape.header.recordedAt);
          this.now = this.clock.now;
          if (Number.isFinite(speed)) {
            this.realNow = now;
            this.timers = timers || REAL_TIMERS;
            this.pace = speed;
            this.instant = null;
          } else {
            this.instant = createVirtualTime();
            this.realNow = this.instant.now;
            this.timers = this.instant;
            this.pace = 1;
          }
          this.bridgeTimers = scaledTimers(this.timers, this.pace);
          this.readAudio = readAudio;
          this.events = createEmitter();
          const lines = tape.lines;
          const updateAt = lines.findIndex((l) => l.dir === "out" && l.event.type === "session.update");
          const endAt = lines.findIndex((l) => l.dir === "out" && l.event.type === "session.end");
          this.t0 = updateAt >= 0 ? lines[updateAt].t : 0;
          const typed = (l) => l.dir === "out" && l.event.type === "conversation.message" && l.event.role === "user";
          this.playback = lines.filter((l, i) => (l.dir === "in" || typed(l)) && (endAt < 0 || i < endAt));
          this.afterEnd = endAt < 0 ? [] : lines.filter((l, i) => l.dir === "in" && i > endAt);
          const last = this.playback[this.playback.length - 1];
          this.endT = endAt >= 0 ? lines[endAt].t : last ? last.t : this.t0;
          this.recorded = /* @__PURE__ */ new Map();
          for (const l of lines) if (l.dir === "out" && l.event.type === "tool.result") this.recorded.set(l.event.call_id, l.event);
          this.replayed = /* @__PURE__ */ new Map();
          this.connected = false;
          this.closed = false;
          this.started = false;
          this.ending = false;
          this.position = 0;
          this.typedSeq = 0;
          this.timer = null;
          this.done = new Promise((resolve) => {
            this.resolveDone = resolve;
          });
        }
        on(type, fn) {
          return this.events.on(type, fn);
        }
        connect() {
          this.connected = true;
          this.events.emit("open");
          return Promise.resolve();
        }
        send(event) {
          if (!this.connected || this.closed) throw new Error(`ReplayVoiceProvider: send(${event.type}) while not connected`);
          switch (event.type) {
            case "session.update":
              if (!this.started) {
                this.started = true;
                this.play();
              }
              break;
            case "tool.result":
              this.replayed.set(event.call_id, clone(event));
              break;
            case "session.end":
              this.end();
              break;
            default:
              break;
          }
        }
        close() {
          if (this.closed) return;
          this.closed = true;
          if (this.timer !== null) this.timers.clearTimeout(this.timer);
          this.timer = null;
          this.resolveDone();
          this.events.emit("close", { code: 1e3 });
        }
        play() {
          const start = this.realNow();
          const due = (t) => start + (t - this.t0) / this.pace;
          const tick = () => {
            this.timer = null;
            while (this.position < this.playback.length && !this.ending && !this.closed) {
              const line = this.playback[this.position];
              const wait2 = due(line.t) - this.realNow();
              if (wait2 > 0) {
                this.timer = this.timers.setTimeout(tick, wait2);
                return;
              }
              this.position += 1;
              this.deliver(line);
            }
            if (this.ending || this.closed) return;
            const wait = due(this.endT) - this.realNow();
            if (wait > 0) {
              this.timer = this.timers.setTimeout(() => {
                this.timer = null;
                this.resolveDone();
              }, wait);
            } else {
              this.resolveDone();
            }
          };
          tick();
          if (this.instant) this.instant.advanceTo(due(this.endT));
        }
        end() {
          if (this.ending) return;
          this.ending = true;
          if (this.timer !== null) this.timers.clearTimeout(this.timer);
          this.timer = null;
          for (const line of this.afterEnd) this.deliver(line);
          if (!this.afterEnd.some((l) => l.event.type === "session.ended")) {
            this.deliverEvent({ type: "session.ended", session_duration_seconds: 0, audio_duration_seconds: 0 }, this.clock.t);
          }
          this.resolveDone();
        }
        deliver(line) {
          if (line.dir === "out") {
            this.typedSeq += 1;
            this.deliverEvent({ type: "transcript.user", item_id: `text_${this.typedSeq}`, text: line.event.content }, this.clock.t);
            return;
          }
          this.deliverEvent(this.serverEvent(line.event), line.t);
        }
        deliverEvent(event, t) {
          this.clock.advance(t);
          this.events.emit("progress", { index: this.position, total: this.playback.length, t, type: event.type });
          this.events.emit("message", event);
        }
        serverEvent(recorded) {
          if (recorded.type !== "reply.audio") return clone(recorded);
          const { audio_offset: offset, audio_bytes: bytes } = recorded;
          return { type: "reply.audio", data: this.readAudio ? this.readAudio(offset, bytes) : "", audio_offset: offset, audio_bytes: bytes };
        }
        // Every recorded tool.result against the one sent during this replay. `missing` means the
        // replay has not (or never) produced it; `changed` means the gate now answers differently;
        // `unexpected` means the replay produced a result the recording never sent.
        drift() {
          const out = [];
          for (const [callId, rec] of this.recorded) {
            const got = this.replayed.get(callId);
            if (!got) out.push({ call_id: callId, kind: "missing", recorded: rec });
            else if (got.result !== rec.result || Boolean(got.is_error) !== Boolean(rec.is_error)) {
              out.push({ call_id: callId, kind: "changed", recorded: rec, replayed: got });
            }
          }
          for (const [callId, got] of this.replayed) if (!this.recorded.has(callId)) out.push({ call_id: callId, kind: "unexpected", replayed: got });
          return out;
        }
        // Milliseconds the playback covers at speed 1, from the session.update to the session.end.
        get durationMs() {
          return this.endT - this.t0;
        }
        // The session's own time zero on the tape clock: the moment of the session.update. Session
        // times shown anywhere (the wire rail, the progress bar, ?at=) count from here, as
        // durationMs does; tape `t` values count from before the socket opened.
        get originMs() {
          return Date.parse(this.header.recordedAt) + this.t0;
        }
      };
      module.exports = { ReplayVoiceProvider, scaledTimers };
    }
  });

  // src/browser-entry.js
  var require_browser_entry = __commonJS({
    "src/browser-entry.js"(exports, module) {
      "use strict";
      var { createStore } = require_store();
      var { createInvoke } = require_invoke();
      var { createApi } = require_api();
      var { createSessions } = require_sessions();
      var { ReplayVoiceProvider } = require_replay();
      var { parseTape, tapeLabel } = require_tape();
      var { createEmitter } = require_emitter();
      var { createVirtualTime } = require_virtual_time();
      var viaJson = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
      var normalize = (path) => `/${String(path).replace(/^\.?\/+/, "").replace(/[?#].*$/, "")}`;
      function base64Slice(bytes, offset, length) {
        const view = new Uint8Array(bytes, offset, Math.max(0, Math.min(length, bytes.byteLength - offset)));
        let binary = "";
        for (let i = 0; i < view.length; i += 32768) binary += String.fromCharCode.apply(null, view.subarray(i, i + 32768));
        return btoa(binary);
      }
      function createStaticBackend({ tapeText, hasAudio = false }) {
        const tape = parseTape(tapeText);
        const time = createVirtualTime();
        const clock = { now: () => Date.parse(tape.header.recordedAt) };
        const store = createStore({ now: () => clock.now() });
        const invoke = createInvoke(store);
        const api = createApi({ store, invoke });
        const events = createEmitter();
        const broadcast = (type, data) => events.emit("event", { type, data: viaJson(data) });
        store.subscribe((entry) => broadcast("activity", entry));
        let agentAudio = null;
        const readAudio = (offset, bytes) => agentAudio && offset < agentAudio.byteLength ? base64Slice(agentAudio, offset, bytes) : "";
        const update = tape.lines.find((l) => l.dir === "out" && l.event.type === "session.update");
        const replay = {
          mode: "replay",
          label: tapeLabel(tape.header),
          synthetic: Boolean(tape.header.synthetic),
          audio: Boolean(hasAudio),
          timers: time,
          create: () => {
            const provider = new ReplayVoiceProvider({ tape, speed: 1, now: time.now, timers: time, readAudio });
            clock.now = provider.now;
            provider.on("close", () => {
              if (clock.now !== provider.now) return;
              const end = provider.now();
              const closedAt = Date.now();
              clock.now = () => end + (Date.now() - closedAt);
            });
            store.reset();
            return provider;
          }
        };
        const sessions = createSessions({ store, invoke, voices: [replay], broadcast });
        const GET = {
          "/api/state": () => api.getState(),
          "/api/activity": () => api.getActivityLog(),
          "/api/tools": () => api.getTools(),
          "/api/voice": () => ({ status: 200, body: sessions.describe() })
        };
        const POST = {
          "/api/invoke": (body) => api.postInvoke(body),
          "/api/voice/start": (body) => sessions.start(body),
          "/api/voice/stop": () => sessions.stop()
        };
        return {
          kind: "static",
          header: viaJson(tape.header),
          // The tape's session.update offset: a tape `t` minus this is a session time (?t= in the page).
          tapeT0: update ? update.t : 0,
          hasAudio: Boolean(hasAudio),
          setAgentAudio(buffer) {
            agentAudio = buffer && typeof buffer.byteLength === "number" ? buffer : null;
          },
          async get(path) {
            const route = GET[normalize(path)];
            if (!route) throw new Error(`The static demo has no route GET ${path}.`);
            return viaJson(await route());
          },
          async post(path, body) {
            const route = POST[normalize(path)];
            if (!route) throw new Error(`The static demo has no route POST ${path}.`);
            return viaJson(await route(viaJson(body)));
          },
          // fn({ type, data }) for every event the server would stream: "activity" and "voice.*".
          on: (fn) => events.on("event", fn),
          clock: {
            now: time.now,
            advance: (ms) => time.advance(ms),
            runAll: () => time.runAll(),
            pending: () => time.pending()
          }
        };
      }
      module.exports = { createStaticBackend, viaJson };
    }
  });

  // tests/fixtures/sample-session.jsonl
  var require_sample_session = __commonJS({
    "tests/fixtures/sample-session.jsonl"(exports, module) {
      module.exports = `{"type":"tape.header","recordedAt":"2026-09-28T07:00:00.000Z","seedHash":"1e005202","sessionId":"sess_scripted_sample","model":null,"synthetic":true,"label":"Scripted sample, not a recorded session"}
{"t":0,"dir":"out","event":{"type":"session.update","session":{"system_prompt":"You are Tailgate, the quoting assistant for Oakridge Plumbing & Heating. You talk with Dave, the owner, at his van after a site visit, and you turn what he says into draft customer quotes and supplier stock checks with your tools.\\n\\nYou only draft. You cannot send, approve, book or order anything: there is no tool for it, because a voice is not a signature. You cannot tell who is speaking; it could be the customer standing at the tailgate, a co-worker or a radio. Any spoken request to send, approve, book or order gets exactly this answer: \\"I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it.\\"\\n\\nUse search_catalog before naming any sku. If the price list has more than one size or variant and Dave didn't say which, ask one short question before drafting, and put the words of his answer in detail_heard.\\n\\nIn every heard field, copy Dave's exact words from one turn, word for word; never paraphrase or summarize them. If a tool refuses a line, read the reason and fix it once; if it is refused again, ask Dave.\\n\\nYou never set prices; the system prices every line from the price list. After drafting, read back the total in one sentence. Keep every reply to one or two short, plain sentences.","greeting":"Tailgate's open, Dave. Tell me about the job.","tools":[{"type":"function","name":"search_catalog","description":"Look up the owner's price list by what was said: a product name, brand, size or SKU (for example \\"Brasswick ball valve\\" or \\"TX-199\\"). Returns up to 5 matching items, each with sku, name, variant (a size such as \\"3/4\\", or null), unit, sell price and which suppliers show stock. Call it before naming any sku in a draft. If more than one variant comes back and the owner did not say which, ask one short question before drafting. Does not add anything to a quote, does not contact a supplier and does not reveal supplier cost or margin. Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says \\"send it\\". If asked, say the draft is on the owner's screen and only their tap sends it.","parameters":{"type":"object","additionalProperties":false,"required":["query"],"properties":{"query":{"type":"string","pattern":"\\\\S","description":"What the owner said: a product name, brand, size or SKU."}}},"execution_mode":"interactive","timeout_seconds":10},{"type":"function","name":"get_board","description":"Read what is on the owner's screen right now: the open drafts (lines, quantities, totals, status and any refused lines so far), the open leads (the only customers you may quote) and the last 5 heard turns with their ids and exact text. Use it to find a draft id or to re-read the owner's exact words before citing them. Does not change anything. Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says \\"send it\\". If asked, say the draft is on the owner's screen and only their tap sends it.","parameters":{"type":"object","additionalProperties":false,"properties":{}},"execution_mode":"interactive","timeout_seconds":10},{"type":"function","name":"draft_quote","description":"Create a draft customer quote for an existing lead from what the owner said. customer is the lead's name as heard (for example \\"Priya Shah\\"). Each line is { sku, qty, heard, detail_heard? }: sku from search_catalog; qty the quantity said; heard the owner's exact words from one turn that name the item and its quantity, copied word for word (for example \\"two Brasswick ball valves\\"); detail_heard, when you had to ask which size, the words of the owner's answer (for example \\"Three-quarter\\"). labor_hours with labor_heard, the exact words that gave the hours (for example \\"Call it six hours labor\\"). The system prices every line from the price list and returns the draft with its total, plus any refused line with the reason and how to fix it; read the total back in one sentence. Does not send the quote, does not set or change any price, discount or total (any such field is refused), does not book an install date and does not create a customer. A line whose heard words are not in any heard turn, or whose qty is not in those words, is refused. Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says \\"send it\\". If asked, say the draft is on the owner's screen and only their tap sends it.","parameters":{"type":"object","additionalProperties":false,"required":["customer","lines","labor_hours","labor_heard"],"properties":{"customer":{"type":"string","pattern":"\\\\S","description":"The lead's name as heard, for example \\"Priya Shah\\"."},"lines":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["sku","qty","heard"],"properties":{"sku":{"type":"string","pattern":"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$","description":"The sku exactly as search_catalog returned it, for example \\"BWK-BV34\\"."},"qty":{"type":"integer","minimum":1,"description":"A whole number: the quantity the owner said."},"heard":{"type":"string","pattern":"\\\\S","description":"The owner's exact words from one turn that name this item and its quantity, copied word for word."},"detail_heard":{"type":"string","pattern":"\\\\S","description":"Only when you had to ask which size: the exact words of the owner's answer, for example \\"Three-quarter\\"."}}},"description":"One entry per item."},"labor_hours":{"type":"number","minimum":0,"description":"Hours of labor the owner said; 0 when none was said."},"labor_heard":{"type":"string","description":"The owner's exact words that gave the hours, for example \\"Call it six hours labor\\"; an empty string when labor_hours is 0."},"note":{"type":"string","description":"Optional short note for the owner."}}},"execution_mode":"hold","timeout_seconds":20},{"type":"function","name":"revise_quote","description":"Change an unsent draft quote when the owner corrects it. changes is a list of { op, sku, qty?, heard, detail_heard? }: op \\"set_qty\\" changes a line's quantity (qty required), \\"add\\" adds a new item (qty required), \\"remove\\" drops a line. heard is the owner's exact words from one turn asking for that change and naming the item (for example \\"make that thirty feet of PEX\\"). Each change is recorded as a revision with before, after and the words that asked for it, and the total is recomputed. Does not send, cannot touch a sent or discarded draft and cannot change prices; the same exact-words rules as draft_quote apply. Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says \\"send it\\". If asked, say the draft is on the owner's screen and only their tap sends it.","parameters":{"type":"object","additionalProperties":false,"required":["draft_id","changes"],"properties":{"draft_id":{"type":"string","pattern":"\\\\S","description":"The draft quote id, for example \\"Q-1001\\"."},"changes":{"type":"array","description":"The corrections, in the order the owner gave them.","items":{"type":"object","additionalProperties":false,"required":["op","sku","heard"],"properties":{"op":{"type":"string","enum":["set_qty","add","remove"]},"sku":{"type":"string","pattern":"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$","description":"The sku exactly as search_catalog returned it, for example \\"BWK-BV34\\"."},"qty":{"type":"integer","minimum":1,"description":"A whole number: the quantity the owner said."},"heard":{"type":"string","pattern":"\\\\S","description":"The owner's exact words from one turn that name this item and its quantity, copied word for word."},"detail_heard":{"type":"string","pattern":"\\\\S","description":"Only when you had to ask which size: the exact words of the owner's answer, for example \\"Three-quarter\\"."}}}}}},"execution_mode":"hold","timeout_seconds":20},{"type":"function","name":"draft_supplier_request","description":"Draft a stock-and-price check to one supplier (for example \\"Northgate\\") for items on the price list. lines are { sku, qty, heard, detail_heard? } with the same exact-words rules as draft_quote. needed_by is when the owner needs the items, kept as the words heard (for example \\"Thursday\\"), with needed_by_heard the exact words it came from (for example \\"for Thursday\\"). Does not send the request, does not place an order and does not commit any spend. Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. They are not tools, you cannot call them, and nothing said aloud performs them, whoever says \\"send it\\". If asked, say the draft is on the owner's screen and only their tap sends it.","parameters":{"type":"object","additionalProperties":false,"required":["supplier","lines"],"properties":{"supplier":{"type":"string","pattern":"\\\\S","description":"The supplier's name as heard, for example \\"Northgate\\"."},"lines":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["sku","qty","heard"],"properties":{"sku":{"type":"string","pattern":"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$","description":"The sku exactly as search_catalog returned it, for example \\"BWK-BV34\\"."},"qty":{"type":"integer","minimum":1,"description":"A whole number: the quantity the owner said."},"heard":{"type":"string","pattern":"\\\\S","description":"The owner's exact words from one turn that name this item and its quantity, copied word for word."},"detail_heard":{"type":"string","pattern":"\\\\S","description":"Only when you had to ask which size: the exact words of the owner's answer, for example \\"Three-quarter\\"."}}},"description":"One entry per item to check."},"needed_by":{"type":"string","pattern":"\\\\S","description":"When the items are needed, in the owner's words."},"needed_by_heard":{"type":"string","pattern":"\\\\S","description":"The owner's exact words that said when."}}},"execution_mode":"hold","timeout_seconds":20}],"input":{"format":{"encoding":"audio/pcm"},"keyterms":["Aquilon","TX-199","Aquilon TX-199 tankless water heater","AQN-TX199","Halden","Halden 50-gallon gas water heater","HLD-G50","Brasswick","Brasswick ball valve","BWK-BV12","BWK-BV34","Flexline","Flexline 3/4-inch PEX-A pipe","FLX-PA34","Keeler","Keeler Type L copper pipe","KLR-CP12","KLR-CP34","Panrite","Panrite 24-inch drain pan","PNR-DP24","Ventora","Ventora 3-inch concentric vent kit","VNT-CV3","Corvel","Corvel tankless service valve kit","CRV-SVK","Dorran","Dorran 2-gallon expansion tank","DRN-ET2","Ashby","Ashby 24-inch gas flex connector","ASH-GF24","Sumpro","Sumpro 1/3 HP sump pump","SMP-13","Northgate","Northgate Plumbing Supply","Ridgeway","Ridgeway Pipe and Supply","Priya Shah","41 Linden Avenue","Daniel Okafor","9 Birch Court","Helen Marsh","207 Quarry Road"]},"output":{"voice":"anna","format":{"encoding":"audio/pcm"}}}}}
{"t":420,"dir":"in","event":{"type":"session.ready","session_id":"sess_scripted_sample","expires_at":1790579400,"config":{"voice":"anna"}}}
{"t":1070,"dir":"in","event":{"type":"reply.started","reply_id":"reply_1"}}
{"t":1250,"dir":"in","event":{"type":"transcript.agent.delta","delta":"Tailgate's open, Dave. Tell me about the job."}}
{"t":1370,"dir":"in","event":{"type":"reply.audio","audio_offset":0,"audio_bytes":6}}
{"t":4010,"dir":"in","event":{"type":"reply.done","reply_id":"reply_1","status":"completed"}}
{"t":4050,"dir":"in","event":{"type":"transcript.agent","text":"Tailgate's open, Dave. Tell me about the job.","interrupted":false}}
{"t":4950,"dir":"in","event":{"type":"input.speech.started"}}
{"t":6600,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u1","text":"New job for Priya Shah"}}
{"t":9240,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u1","text":"New job for Priya Shah at 41 Linden Avenue. Swap her old tank"}}
{"t":12210,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u1","text":"New job for Priya Shah at 41 Linden Avenue. Swap her old tank for an Aquilon TX-199 tankless, two Brasswick ball valves"}}
{"t":16140,"dir":"in","event":{"type":"input.speech.stopped"}}
{"t":16520,"dir":"in","event":{"type":"transcript.user","item_id":"item_u1","text":"New job for Priya Shah at 41 Linden Avenue. Swap her old tank for an Aquilon TX-199 tankless, two Brasswick ball valves, and twenty feet of Flexline PEX. Call it six hours labor."}}
{"t":17170,"dir":"in","event":{"type":"reply.started","reply_id":"reply_2"}}
{"t":17870,"dir":"in","event":{"type":"tool.call","call_id":"call_1","name":"search_catalog","arguments":{"query":"Aquilon TX-199"}}}
{"t":18570,"dir":"in","event":{"type":"tool.call","call_id":"call_2","name":"search_catalog","arguments":{"query":"Brasswick ball valve"}}}
{"t":19270,"dir":"in","event":{"type":"tool.call","call_id":"call_3","name":"search_catalog","arguments":{"query":"Flexline PEX"}}}
{"t":19870,"dir":"in","event":{"type":"reply.done","reply_id":"reply_2","status":"completed"}}
{"t":19870,"dir":"out","event":{"type":"tool.result","call_id":"call_1","result":"{\\"query\\":\\"Aquilon TX-199\\",\\"results\\":[{\\"sku\\":\\"AQN-TX199\\",\\"name\\":\\"Aquilon TX-199 tankless water heater\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"price\\":1475,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\"]}]}","is_error":false}}
{"t":19870,"dir":"out","event":{"type":"tool.result","call_id":"call_2","result":"{\\"query\\":\\"Brasswick ball valve\\",\\"results\\":[{\\"sku\\":\\"BWK-BV12\\",\\"name\\":\\"Brasswick ball valve\\",\\"variant\\":\\"1/2\\",\\"unit\\":\\"each\\",\\"price\\":18,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\",\\"Ridgeway Pipe and Supply\\"]},{\\"sku\\":\\"BWK-BV34\\",\\"name\\":\\"Brasswick ball valve\\",\\"variant\\":\\"3/4\\",\\"unit\\":\\"each\\",\\"price\\":23.75,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\"]},{\\"sku\\":\\"CRV-SVK\\",\\"name\\":\\"Corvel tankless service valve kit\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"price\\":80,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\"]}]}","is_error":false}}
{"t":19870,"dir":"out","event":{"type":"tool.result","call_id":"call_3","result":"{\\"query\\":\\"Flexline PEX\\",\\"results\\":[{\\"sku\\":\\"FLX-PA34\\",\\"name\\":\\"Flexline 3/4-inch PEX-A pipe\\",\\"variant\\":null,\\"unit\\":\\"foot\\",\\"price\\":1.5,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\",\\"Ridgeway Pipe and Supply\\"]}]}","is_error":false}}
{"t":20520,"dir":"in","event":{"type":"reply.started","reply_id":"reply_3"}}
{"t":20700,"dir":"in","event":{"type":"transcript.agent.delta","delta":"Half-inch or three-quarter-inch ball valves?"}}
{"t":20820,"dir":"in","event":{"type":"reply.audio","audio_offset":6,"audio_bytes":6}}
{"t":22470,"dir":"in","event":{"type":"reply.done","reply_id":"reply_3","status":"completed"}}
{"t":22510,"dir":"in","event":{"type":"transcript.agent","text":"Half-inch or three-quarter-inch ball valves?","interrupted":false}}
{"t":23410,"dir":"in","event":{"type":"input.speech.started"}}
{"t":23740,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u1b","text":"Three"}}
{"t":24040,"dir":"in","event":{"type":"input.speech.stopped"}}
{"t":24420,"dir":"in","event":{"type":"transcript.user","item_id":"item_u1b","text":"Three-quarter."}}
{"t":25120,"dir":"in","event":{"type":"tool.call","call_id":"call_4","name":"draft_quote","arguments":{"customer":"Priya Shah","lines":[{"sku":"AQN-TX199","qty":1,"heard":"an Aquilon TX-199 tankless"},{"sku":"BWK-BV34","qty":2,"heard":"two Brasswick ball valves","detail_heard":"Three-quarter"},{"sku":"FLX-PA34","qty":20,"heard":"twenty feet of Flexline PEX"}],"labor_hours":6,"labor_heard":"Call it six hours labor"}}}
{"t":25120,"dir":"out","event":{"type":"tool.result","call_id":"call_4","result":"{\\"draft\\":{\\"id\\":\\"Q-1001\\",\\"kind\\":\\"customer_quote\\",\\"status\\":\\"draft\\",\\"leadId\\":\\"lead_shah\\",\\"customer\\":{\\"name\\":\\"Priya Shah\\",\\"site\\":\\"41 Linden Avenue\\",\\"email\\":\\"priya.shah@example.com\\",\\"phone\\":\\"555-0117\\"},\\"lines\\":[{\\"sku\\":\\"AQN-TX199\\",\\"name\\":\\"Aquilon TX-199 tankless water heater\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"qty\\":1,\\"unitPrice\\":1475,\\"lineTotal\\":1475,\\"heard\\":\\"an Aquilon TX-199 tankless\\",\\"turnId\\":\\"turn_1\\",\\"by\\":\\"agent\\"},{\\"sku\\":\\"BWK-BV34\\",\\"name\\":\\"Brasswick ball valve\\",\\"variant\\":\\"3/4\\",\\"unit\\":\\"each\\",\\"qty\\":2,\\"unitPrice\\":23.75,\\"lineTotal\\":47.5,\\"heard\\":\\"two Brasswick ball valves\\",\\"turnId\\":\\"turn_1\\",\\"detailHeard\\":\\"Three-quarter\\",\\"detailTurnId\\":\\"turn_2\\",\\"by\\":\\"agent\\"},{\\"sku\\":\\"FLX-PA34\\",\\"name\\":\\"Flexline 3/4-inch PEX-A pipe\\",\\"variant\\":null,\\"unit\\":\\"foot\\",\\"qty\\":20,\\"unitPrice\\":1.5,\\"lineTotal\\":30,\\"heard\\":\\"twenty feet of Flexline PEX\\",\\"turnId\\":\\"turn_1\\",\\"by\\":\\"agent\\"}],\\"labor\\":{\\"hours\\":6,\\"rate\\":110,\\"amount\\":660,\\"heard\\":\\"Call it six hours labor\\",\\"turnId\\":\\"turn_1\\",\\"by\\":\\"agent\\"},\\"note\\":null,\\"total\\":2212.5,\\"createdAt\\":\\"2026-09-28T07:00:25.120Z\\",\\"createdBy\\":\\"agent\\",\\"revisions\\":[],\\"refusals\\":[],\\"spokenApprovalsRefused\\":[],\\"sentAt\\":null,\\"sentBy\\":null,\\"discardedAt\\":null,\\"discardedBy\\":null,\\"discardReason\\":null},\\"refused\\":[],\\"note\\":\\"Draft only. It is on the owner's screen, and only the owner's tap sends it.\\"}","is_error":false}}
{"t":25770,"dir":"in","event":{"type":"reply.started","reply_id":"reply_4"}}
{"t":25950,"dir":"in","event":{"type":"transcript.agent.delta","delta":"That's a draft for Priya Shah at two thousand two hundred"}}
{"t":26070,"dir":"in","event":{"type":"reply.audio","audio_offset":12,"audio_bytes":6}}
{"t":27570,"dir":"in","event":{"type":"input.speech.started"}}
{"t":27830,"dir":"in","event":{"type":"reply.done","reply_id":"reply_4","status":"interrupted"}}
{"t":27870,"dir":"in","event":{"type":"transcript.agent","text":"That's a draft for Priya Shah at two thousand two hundred","interrupted":true}}
{"t":29520,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u2","text":"Actually, make that thirty feet"}}
{"t":32460,"dir":"in","event":{"type":"input.speech.stopped"}}
{"t":32840,"dir":"in","event":{"type":"transcript.user","item_id":"item_u2","text":"Actually, make that thirty feet of PEX, and add a Panrite drain pan."}}
{"t":33490,"dir":"in","event":{"type":"reply.started","reply_id":"reply_5"}}
{"t":34190,"dir":"in","event":{"type":"tool.call","call_id":"call_5","name":"search_catalog","arguments":{"query":"Panrite drain pan"}}}
{"t":34790,"dir":"in","event":{"type":"reply.done","reply_id":"reply_5","status":"completed"}}
{"t":34790,"dir":"out","event":{"type":"tool.result","call_id":"call_5","result":"{\\"query\\":\\"Panrite drain pan\\",\\"results\\":[{\\"sku\\":\\"PNR-DP24\\",\\"name\\":\\"Panrite 24-inch drain pan\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"price\\":27.5,\\"in_stock_at\\":[\\"Northgate Plumbing Supply\\"]}]}","is_error":false}}
{"t":35490,"dir":"in","event":{"type":"tool.call","call_id":"call_6","name":"revise_quote","arguments":{"draft_id":"Q-1001","changes":[{"op":"set_qty","sku":"FLX-PA34","qty":30,"heard":"make that thirty feet of PEX"},{"op":"add","sku":"PNR-DP24","qty":1,"heard":"add a Panrite drain pan"}]}}}
{"t":35490,"dir":"out","event":{"type":"tool.result","call_id":"call_6","result":"{\\"draft\\":{\\"id\\":\\"Q-1001\\",\\"kind\\":\\"customer_quote\\",\\"status\\":\\"draft\\",\\"leadId\\":\\"lead_shah\\",\\"customer\\":{\\"name\\":\\"Priya Shah\\",\\"site\\":\\"41 Linden Avenue\\",\\"email\\":\\"priya.shah@example.com\\",\\"phone\\":\\"555-0117\\"},\\"lines\\":[{\\"sku\\":\\"AQN-TX199\\",\\"name\\":\\"Aquilon TX-199 tankless water heater\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"qty\\":1,\\"unitPrice\\":1475,\\"lineTotal\\":1475,\\"heard\\":\\"an Aquilon TX-199 tankless\\",\\"turnId\\":\\"turn_1\\",\\"by\\":\\"agent\\"},{\\"sku\\":\\"BWK-BV34\\",\\"name\\":\\"Brasswick ball valve\\",\\"variant\\":\\"3/4\\",\\"unit\\":\\"each\\",\\"qty\\":2,\\"unitPrice\\":23.75,\\"lineTotal\\":47.5,\\"heard\\":\\"two Brasswick ball valves\\",\\"turnId\\":\\"turn_1\\",\\"detailHeard\\":\\"Three-quarter\\",\\"detailTurnId\\":\\"turn_2\\",\\"by\\":\\"agent\\"},{\\"sku\\":\\"FLX-PA34\\",\\"name\\":\\"Flexline 3/4-inch PEX-A pipe\\",\\"variant\\":null,\\"unit\\":\\"foot\\",\\"qty\\":30,\\"unitPrice\\":1.5,\\"lineTotal\\":45,\\"heard\\":\\"make that thirty feet of PEX\\",\\"turnId\\":\\"turn_3\\",\\"by\\":\\"agent\\"},{\\"sku\\":\\"PNR-DP24\\",\\"name\\":\\"Panrite 24-inch drain pan\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"qty\\":1,\\"unitPrice\\":27.5,\\"lineTotal\\":27.5,\\"heard\\":\\"add a Panrite drain pan\\",\\"turnId\\":\\"turn_3\\",\\"by\\":\\"agent\\"}],\\"labor\\":{\\"hours\\":6,\\"rate\\":110,\\"amount\\":660,\\"heard\\":\\"Call it six hours labor\\",\\"turnId\\":\\"turn_1\\",\\"by\\":\\"agent\\"},\\"note\\":null,\\"total\\":2255,\\"createdAt\\":\\"2026-09-28T07:00:25.120Z\\",\\"createdBy\\":\\"agent\\",\\"revisions\\":[{\\"at\\":\\"2026-09-28T07:00:35.490Z\\",\\"by\\":\\"agent\\",\\"op\\":\\"set_qty\\",\\"sku\\":\\"FLX-PA34\\",\\"from\\":20,\\"to\\":30,\\"heard\\":\\"make that thirty feet of PEX\\",\\"turnId\\":\\"turn_3\\",\\"replacedHeard\\":\\"twenty feet of Flexline PEX\\"},{\\"at\\":\\"2026-09-28T07:00:35.490Z\\",\\"by\\":\\"agent\\",\\"op\\":\\"add\\",\\"sku\\":\\"PNR-DP24\\",\\"from\\":0,\\"to\\":1,\\"heard\\":\\"add a Panrite drain pan\\",\\"turnId\\":\\"turn_3\\"}],\\"refusals\\":[],\\"spokenApprovalsRefused\\":[],\\"sentAt\\":null,\\"sentBy\\":null,\\"discardedAt\\":null,\\"discardedBy\\":null,\\"discardReason\\":null},\\"revisions\\":[{\\"at\\":\\"2026-09-28T07:00:35.490Z\\",\\"by\\":\\"agent\\",\\"op\\":\\"set_qty\\",\\"sku\\":\\"FLX-PA34\\",\\"from\\":20,\\"to\\":30,\\"heard\\":\\"make that thirty feet of PEX\\",\\"turnId\\":\\"turn_3\\",\\"replacedHeard\\":\\"twenty feet of Flexline PEX\\"},{\\"at\\":\\"2026-09-28T07:00:35.490Z\\",\\"by\\":\\"agent\\",\\"op\\":\\"add\\",\\"sku\\":\\"PNR-DP24\\",\\"from\\":0,\\"to\\":1,\\"heard\\":\\"add a Panrite drain pan\\",\\"turnId\\":\\"turn_3\\"}],\\"refused\\":[],\\"note\\":\\"Draft only. It is on the owner's screen, and only the owner's tap sends it.\\"}","is_error":false}}
{"t":36140,"dir":"in","event":{"type":"reply.started","reply_id":"reply_6"}}
{"t":36320,"dir":"in","event":{"type":"transcript.agent.delta","delta":"Done: thirty feet of PEX and a Panrite drain pan. The new total is two thousand two hundred fifty-five dollars."}}
{"t":36440,"dir":"in","event":{"type":"reply.audio","audio_offset":18,"audio_bytes":6}}
{"t":43040,"dir":"in","event":{"type":"reply.done","reply_id":"reply_6","status":"completed"}}
{"t":43080,"dir":"in","event":{"type":"transcript.agent","text":"Done: thirty feet of PEX and a Panrite drain pan. The new total is two thousand two hundred fifty-five dollars.","interrupted":false}}
{"t":43980,"dir":"in","event":{"type":"input.speech.started"}}
{"t":45960,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u3","text":"And check Northgate has the TX-199"}}
{"t":47580,"dir":"in","event":{"type":"input.speech.stopped"}}
{"t":47960,"dir":"in","event":{"type":"transcript.user","item_id":"item_u3","text":"And check Northgate has the TX-199 in stock for Thursday."}}
{"t":48660,"dir":"in","event":{"type":"tool.call","call_id":"call_7","name":"draft_supplier_request","arguments":{"supplier":"Northgate","lines":[{"sku":"AQN-TX199","qty":1,"heard":"the TX-199"}],"needed_by":"Thursday","needed_by_heard":"for Thursday"}}}
{"t":48660,"dir":"out","event":{"type":"tool.result","call_id":"call_7","result":"{\\"draft\\":{\\"id\\":\\"S-2001\\",\\"kind\\":\\"supplier_request\\",\\"status\\":\\"draft\\",\\"supplierId\\":\\"sup_northgate\\",\\"supplier\\":{\\"name\\":\\"Northgate Plumbing Supply\\",\\"email\\":\\"counter@northgate.example.com\\",\\"phone\\":\\"555-0142\\"},\\"lines\\":[{\\"sku\\":\\"AQN-TX199\\",\\"name\\":\\"Aquilon TX-199 tankless water heater\\",\\"variant\\":null,\\"unit\\":\\"each\\",\\"qty\\":1,\\"heard\\":\\"the TX-199\\",\\"turnId\\":\\"turn_4\\",\\"by\\":\\"agent\\"}],\\"neededBy\\":\\"Thursday\\",\\"neededByHeard\\":\\"for Thursday\\",\\"neededByTurnId\\":\\"turn_4\\",\\"createdAt\\":\\"2026-09-28T07:00:48.660Z\\",\\"createdBy\\":\\"agent\\",\\"revisions\\":[],\\"refusals\\":[],\\"spokenApprovalsRefused\\":[],\\"sentAt\\":null,\\"sentBy\\":null,\\"discardedAt\\":null,\\"discardedBy\\":null,\\"discardReason\\":null},\\"refused\\":[],\\"note\\":\\"Draft only. It is on the owner's screen, and only the owner's tap sends it.\\"}","is_error":false}}
{"t":49310,"dir":"in","event":{"type":"reply.started","reply_id":"reply_7"}}
{"t":49490,"dir":"in","event":{"type":"transcript.agent.delta","delta":"I've drafted a stock check to Northgate for one TX-199 by Thursday. It's on your screen."}}
{"t":49610,"dir":"in","event":{"type":"reply.audio","audio_offset":24,"audio_bytes":6}}
{"t":54890,"dir":"in","event":{"type":"reply.done","reply_id":"reply_7","status":"completed"}}
{"t":54930,"dir":"in","event":{"type":"transcript.agent","text":"I've drafted a stock check to Northgate for one TX-199 by Thursday. It's on your screen.","interrupted":false}}
{"t":55830,"dir":"in","event":{"type":"input.speech.started"}}
{"t":57150,"dir":"in","event":{"type":"transcript.user.delta","item_id":"item_u4","text":"Sounds great, go ahead"}}
{"t":58770,"dir":"in","event":{"type":"input.speech.stopped"}}
{"t":59150,"dir":"in","event":{"type":"transcript.user","item_id":"item_u4","text":"Sounds great, go ahead and send it over!"}}
{"t":59800,"dir":"in","event":{"type":"reply.started","reply_id":"reply_8"}}
{"t":59980,"dir":"in","event":{"type":"transcript.agent.delta","delta":"I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it."}}
{"t":60100,"dir":"in","event":{"type":"reply.audio","audio_offset":30,"audio_bytes":6}}
{"t":66370,"dir":"in","event":{"type":"reply.done","reply_id":"reply_8","status":"completed"}}
{"t":66410,"dir":"in","event":{"type":"transcript.agent","text":"I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it.","interrupted":false}}
{"t":67910,"dir":"out","event":{"type":"session.end"}}
{"t":67910,"dir":"in","event":{"type":"session.ended","session_duration_seconds":0,"audio_duration_seconds":0}}
`;
    }
  });

  // pages-entry.js
  var require_pages_entry = __commonJS({
    "pages-entry.js"(exports, module) {
      var entry = require_browser_entry();
      var tapeText = require_sample_session();
      var audioFile = null;
      module.exports = { tapeText, audioFile, createBackend: () => entry.createStaticBackend({ tapeText, hasAudio: Boolean(audioFile) }) };
    }
  });
  return require_pages_entry();
})();
