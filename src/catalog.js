'use strict';

const { tokenize, singular } = require('./evidence');

// Money is computed in whole cents so 0.1 + 0.2 never shows up on a customer's quote.
const toCents = (dollars) => Math.round(dollars * 100);
const fromCents = (cents) => cents / 100;

// Sell price = lowest cost among suppliers that show stock, plus the owner's markup, rounded to
// the cent. Returns null when no supplier has the item in stock.
function sellPriceCents(item, markupPct) {
  const costs = Object.values(item.suppliers)
    .filter((s) => s.stock > 0)
    .map((s) => toCents(s.cost));
  if (costs.length === 0) return null;
  return Math.round((Math.min(...costs) * (100 + markupPct)) / 100);
}

function sellPrice(item, markupPct) {
  const cents = sellPriceCents(item, markupPct);
  return cents === null ? null : fromCents(cents);
}

function laborCents(hours, rate) {
  return Math.round(hours * toCents(rate));
}

// The public view of an item: never its supplier costs.
function publicItem(item, business, suppliers) {
  return {
    sku: item.sku,
    name: item.name,
    variant: item.variant,
    unit: item.unit,
    price: sellPrice(item, business.markupPct),
    in_stock_at: Object.entries(item.suppliers)
      .filter(([, s]) => s.stock > 0)
      .map(([id]) => (suppliers.find((sup) => sup.id === id) || { name: id }).name),
  };
}

const SEARCH_NOISE = new Set(['a', 'an', 'the', 'of', 'and', 'for', 'with', 'some', 'any']);

// Scores items by how many of the query's words appear in the item's name, variant or SKU.
function search(state, query, models, limit = 5) {
  const words = tokenize(query, models)
    .filter((tok) => !SEARCH_NOISE.has(tok.t))
    .map((tok) => ({ t: tok.t, s: singular(tok.t), base: tok.base }));
  if (words.length === 0) return [];
  const scored = state.catalog.map((item, index) => {
    const hay = tokenize(`${item.name} ${item.variant || ''} ${item.sku} ${item.sku.replace(/-/g, ' ')}`, models);
    const keys = new Set();
    for (const tok of hay) {
      keys.add(tok.t);
      keys.add(singular(tok.t));
      if (tok.base) keys.add(tok.base);
    }
    const score = words.filter((w) => keys.has(w.t) || keys.has(w.s) || (w.base && keys.has(w.base))).length;
    return { item, index, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => publicItem(s.item, state.business, state.suppliers));
}

module.exports = { sellPrice, sellPriceCents, laborCents, toCents, fromCents, search, publicItem };
