'use strict';

// Evidence matching: every line the agent drafts must cite words that were actually heard, and
// its quantity must be in those words. The tokenizer is what makes that check honest:
//   - sizes, fractions, decimals and model numbers are protected, so "3/4" never becomes 34, a
//     "24-inch drain pan" is not 24 drain pans and a "TX-199" is not 199 heaters;
//   - spoken numbers become digits ("twenty" and "20" match), and "three-quarter" becomes 3/4;
//   - the same normalization runs on the transcript and on the cited words, so punctuation and
//     number formatting differences between the two never cause a false refusal.
// What this cannot catch is speech-to-text hearing the wrong number: that is what the owner's
// review of the draft, receipt beside every line, is for.

const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SIZE_UNITS = {
  inch: 'inch', inches: 'inch', gallon: 'gallon', gallons: 'gallon', hp: 'hp', amp: 'amp',
  amps: 'amp', volt: 'volt', volts: 'volt', btu: 'btu', psi: 'psi', mm: 'mm',
};
// Words that never identify an item on their own; used by the "does the cited text name the
// item" check.
const GENERIC = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'for', 'with', 'to', 'in', 'on', 'at', 'by', 'from',
  'it', 'its', 'that', 'this', 'these', 'those', 'them', 'her', 'his', 'my', 'our', 'their',
  'your', 'some', 'more', 'another', 'other', 'new', 'old', 'make', 'add', 'swap', 'put', 'get',
  'got', 'need', 'needs', 'want', 'call', 'also', 'plus', 'just', 'then', 'actually', 'one',
  'ones', 'piece', 'each', 'feet', 'foot', 'ft', 'inch', 'type', 'l', 'is', 'be', 'we', 'i',
  'us', 'there', 'here', 'check', 'has', 'have', 'stock', 'drop', 'remove', 'take', 'out',
]);
const LABOR_WORDS = new Set(['hour', 'hours', 'hr', 'hrs', 'labor', 'labour']);

function singular(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function rawTokens(text) {
  const s = String(text)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d)\s*"/g, '$1-inch');
  const out = [];
  for (const tok of s.match(/[a-z0-9]+(?:[-/.'][a-z0-9]+)*/g) || []) {
    const t = tok.replace(/'/g, '');
    // Hyphenated words without digits ("three-quarter", "twenty-five", "PEX-A") are read as
    // separate words so the number and size rules below see them the same way as when spoken
    // with a space.
    if (!/\d/.test(t) && t.includes('-')) out.push(...t.split('-').filter(Boolean));
    else out.push(t);
  }
  return out;
}

function classify(t) {
  if (/^\d+$/.test(t)) return { t, kind: 'number', value: Number(t) };
  if (/^\d+\/\d+$/.test(t)) return { t, kind: 'fraction', base: t };
  if (/^\d+\.\d+$/.test(t)) return { t: String(Number(t)), kind: 'decimal', value: Number(t) };
  const size = t.match(/^(\d+(?:[/.]\d+)?)-([a-z]+)$/);
  if (size && SIZE_UNITS[size[2]]) return { t: `${size[1]}-${SIZE_UNITS[size[2]]}`, kind: 'size', base: size[1] };
  // Model numbers are compared without hyphens: "TX-199", "TX199" and a spoken "TX 199" match.
  if (/\d/.test(t)) return { t: t.replace(/[-.]/g, ''), kind: 'model' };
  return { t, kind: 'word' };
}

const wordAt = (toks, k) => (toks[k] && toks[k].kind === 'word' ? toks[k].t : null);

function readSmall(toks, j) {
  const w = wordAt(toks, j);
  if (TENS[w] !== undefined) {
    const next = ONES[wordAt(toks, j + 1)];
    if (next >= 1 && next <= 9) return { value: TENS[w] + next, next: j + 2 };
    return { value: TENS[w], next: j + 1 };
  }
  if (ONES[w] !== undefined) return { value: ONES[w], next: j + 1 };
  return null;
}

// Reads a spoken number starting at toks[i]: "twenty five", "a dozen", "a couple",
// "one hundred and twenty", "six and a half". Returns { value, next } or null.
function readNumberWords(toks, i) {
  let chunk;
  let j;
  const first = wordAt(toks, i);
  const after = wordAt(toks, i + 1);
  if (first === 'a' && ['hundred', 'dozen', 'couple', 'pair'].includes(after)) {
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
  if (mult === 'hundred') {
    value = chunk * 100;
    j += 1;
    const k = wordAt(toks, j) === 'and' ? j + 1 : j;
    const rest = readSmall(toks, k);
    if (rest) {
      value += rest.value;
      j = rest.next;
    }
  } else if (mult === 'dozen') {
    value = chunk * 12;
    j += 1;
  } else if (mult === 'couple' || mult === 'pair') {
    value = chunk * 2;
    j += 1;
  }
  if (wordAt(toks, j) === 'and' && wordAt(toks, j + 1) === 'a' && wordAt(toks, j + 2) === 'half') {
    value += 0.5;
    j += 3;
  }
  return { value, next: j };
}

// Builds the set of model tokens that appear in the price list, so a spoken "TX 199" can be
// joined back into the model number instead of being read as a quantity of 199.
function catalogModels(catalog) {
  const models = new Set();
  for (const item of catalog) {
    for (const text of [item.name, item.variant || '', item.sku, ...item.sku.split('-')]) {
      for (const tok of rawTokens(text).map(classify)) if (tok.kind === 'model') models.add(tok.t);
    }
  }
  return models;
}

function tokenize(text, models = new Set()) {
  const toks = rawTokens(text).map(classify);
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const cur = toks[i];
    const w = cur.kind === 'word' ? cur.t : null;
    // Spoken fractions: "three quarter", "half inch", "quarter inch".
    if (w === 'three' && ['quarter', 'quarters'].includes(wordAt(toks, i + 1))) {
      out.push({ t: '3/4', kind: 'fraction', base: '3/4' });
      i += 2;
      continue;
    }
    if ((w === 'half' || w === 'quarter') && SIZE_UNITS[wordAt(toks, i + 1)]) {
      const base = w === 'half' ? '1/2' : '1/4';
      out.push({ t: base, kind: 'fraction', base });
      i += 1;
      continue;
    }
    const spoken = w ? readNumberWords(toks, i) : null;
    if (spoken) {
      out.push({ t: String(spoken.value), kind: 'number', value: spoken.value });
      i = spoken.next;
      continue;
    }
    // A word followed by a number that together form a model number on the price list.
    if (w && toks[i + 1] && toks[i + 1].kind === 'number' && models.has(`${w}${toks[i + 1].t}`)) {
      out.push({ t: `${w}${toks[i + 1].t}`, kind: 'model' });
      i += 2;
      continue;
    }
    out.push(cur);
    i += 1;
  }
  // Second pass: a number or fraction followed by a size unit is a size, never a quantity.
  const merged = [];
  for (let k = 0; k < out.length; k += 1) {
    const tok = out[k];
    const unit = out[k + 1] && out[k + 1].kind === 'word' ? SIZE_UNITS[out[k + 1].t] : undefined;
    if (unit && (tok.kind === 'number' || tok.kind === 'fraction' || tok.kind === 'decimal')) {
      const base = tok.base || tok.t;
      merged.push({ t: `${base}-${unit}`, kind: 'size', base });
      k += 1;
    } else {
      merged.push(tok);
    }
  }
  return merged;
}

// Unprotected numbers: the only tokens that can be a quantity.
function quantities(tokens) {
  return tokens.filter((tok) => tok.kind === 'number').map((tok) => tok.value);
}

function indexOfRun(hay, needle) {
  if (needle.length === 0 || needle.length > hay.length) return -1;
  outer: for (let i = 0; i <= hay.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (hay[i + j].t !== needle[j].t) continue outer;
    return i;
  }
  return -1;
}

// Finds the most recent recorded turn that contains `text` as a contiguous run of tokens.
function findInTurns(turns, text, models) {
  const needle = tokenize(text, models);
  if (needle.length === 0) return null;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (indexOfRun(tokenize(turns[i].text, models), needle) >= 0) return { turnId: turns[i].id, tokens: needle };
  }
  return null;
}

const q = (s) => `'${String(s).trim()}'`;

function notHeard(field, text) {
  return `${field} must be the owner's exact words from one turn; ${q(text)} is not in any turn heard so far. Quote the turn exactly, or wait until the owner has finished speaking.`;
}

function itemLabel(item) {
  return item.variant ? `${item.name} ${item.variant} (${item.sku})` : `${item.name} (${item.sku})`;
}

function itemKeywords(item, models) {
  const kw = new Set();
  for (const tok of tokenize(`${item.name} ${item.sku} ${item.sku.replace(/-/g, ' ')}`, models)) {
    if ((tok.kind === 'word' || tok.kind === 'model') && !GENERIC.has(tok.t)) {
      kw.add(tok.t);
      kw.add(singular(tok.t));
    }
  }
  return kw;
}

const isNaming = (tok) => (tok.kind === 'word' || tok.kind === 'model') && !GENERIC.has(tok.t);
const hasKeyword = (kw, tok) => kw.has(tok.t) || kw.has(singular(tok.t));

function namesItem(tokens, item, models) {
  const kw = itemKeywords(item, models);
  return tokens.some((tok) => isNaming(tok) && hasKeyword(kw, tok));
}

// The quantities the cited words give THIS item, not every number in them. A number belongs to
// the next word that names any price-list item ("two Brasswick ball valves, and twenty feet of
// Flexline PEX": 2 is the valves', 20 the PEX's); a number after the last item named belongs to
// that item ("the valves, make it three"), unless it counts hours of labor.
function quantitiesFor(tokens, item, catalog, models) {
  const keywords = catalog.map((it) => [it.sku, itemKeywords(it, models)]);
  const named = tokens.map((tok) => (isNaming(tok) ? keywords.filter(([, kw]) => hasKeyword(kw, tok)).map(([sku]) => sku) : []));
  const own = (k) => named[k].includes(item.sku);
  const out = [];
  let lastNamed = -1;
  tokens.forEach((tok, i) => {
    if (named[i].length) lastNamed = i;
    if (tok.kind !== 'number') return;
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
  const said = own.length ? `it says ${own.join(' and ')}` : 'it names no quantity, which means 1';
  const others = quantities(tokens).filter((n) => !own.includes(n));
  const elsewhere = others.length ? `; ${others.join(' and ')} there ${others.length > 1 ? 'go' : 'goes'} with another item` : '';
  return `qty ${qty} is not in ${q(heard)} for ${item.name} (${said}${elsewhere}). Use the quantity the owner said for this item, and quote only the words about it.`;
}

// A bare "half" answers "half-inch or three-quarter?" as clearly as "half-inch" does.
function hasVariant(tokens, variant) {
  return tokens.some((tok) => tok.t === variant || tok.base === variant || (variant === '1/2' && tok.t === 'half'));
}

// Checks one cited line. `siblings` are the other price-list items with the same name (other
// sizes); `catalog` is the whole price list, which decides which item each number in the
// cited words belongs to. Returns { turnId, detailTurnId? } or { reason }.
function checkLine({ item, siblings, catalog, qty, heard, detailHeard, turns, models, needQty = true }) {
  const found = findInTurns(turns, heard, models);
  if (!found) return { reason: notHeard('heard', heard) };
  if (!namesItem(found.tokens, item, models)) {
    return { reason: `${q(heard)} does not name ${itemLabel(item)}. Quote the words where the owner named the item.` };
  }
  if (needQty) {
    const bad = checkQuantity(found.tokens, qty, heard, item, catalog, models);
    if (bad) return { reason: bad };
  }
  const result = { turnId: found.turnId };
  // An item that comes in one size has no size to choose, so a size answer cited on its line
  // proves nothing and is ignored rather than failing the line (seen on a real session: the
  // agent put the answer "3/4." on every line, the one-size heater included).
  const sized = Boolean(item.variant) && catalog.some((other) => other.name === item.name && other.sku !== item.sku);
  if (detailHeard !== undefined && sized) {
    const detail = findInTurns(turns, detailHeard, models);
    if (!detail) return { reason: notHeard('detail_heard', detailHeard) };
    if (!hasVariant(detail.tokens, item.variant)) {
      return { reason: `detail_heard ${q(detailHeard)} does not say ${item.variant}, the size of ${item.sku}.` };
    }
    result.detailTurnId = detail.turnId;
  } else if (detailHeard === undefined && item.variant && siblings.length > 0 && !hasVariant(found.tokens, item.variant)) {
    const sizes = [item, ...siblings].map((s) => s.variant).join(' and ');
    return {
      reason: `The price list has ${item.name} in ${sizes}, and ${q(heard)} does not say which. If the owner already answered which size, put the exact words of that answer in detail_heard on this line; otherwise ask the owner which one, then put the words of their answer in detail_heard.`,
    };
  }
  return result;
}

function checkLabor({ hours, heard, turns, models }) {
  const found = findInTurns(turns, heard, models);
  if (!found) return { reason: notHeard('labor_heard', heard) };
  if (!found.tokens.some((tok) => LABOR_WORDS.has(tok.t))) {
    return { reason: `labor_heard ${q(heard)} does not mention hours or labor. Quote the words where the owner gave the labor.` };
  }
  const nums = found.tokens.filter((tok) => tok.kind === 'number' || tok.kind === 'decimal').map((tok) => tok.value);
  if (!nums.includes(hours)) {
    return { reason: `labor_hours ${hours} is not in ${q(heard)}${nums.length ? ` (it says ${nums.join(' and ')})` : ''}. Use the hours the owner said.` };
  }
  return { turnId: found.turnId };
}

// ---- which turns are about which customer ---------------------------------------------------

// Street-type words say nothing about which customer is meant.
const STREET_WORDS = new Set(['avenue', 'ave', 'street', 'st', 'road', 'rd', 'court', 'ct', 'lane', 'ln', 'drive', 'dr', 'way', 'place', 'pl', 'boulevard', 'blvd', 'terrace', 'close']);

// The words that identify a lead when spoken: first and last name, and the street name.
function leadKeys(lead) {
  return new Set([...rawTokens(lead.name), ...rawTokens(lead.site)].filter((t) => !/\d/.test(t) && !STREET_WORDS.has(t) && !GENERIC.has(t)));
}

// One letter off, for names speech-to-text may spell differently ("Pria" for "Priya"). Only
// for keys of five letters or more, so short words never match by accident.
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

// The heard turns that are about one lead: from a turn that names the lead (by name or street)
// up to, not including, the next turn that names other leads and not this one. Returns null
// when no turn has named the lead at all.
function turnsAbout(turns, leads, leadId) {
  const keys = new Map(leads.map((l) => [l.id, leadKeys(l)]));
  let current = new Set();
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
  singular,
};
