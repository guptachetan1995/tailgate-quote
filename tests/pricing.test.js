'use strict';

const { sellPrice, laborCents, search } = require('../src/catalog');
const { catalogModels } = require('../src/evidence');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const seed = require('../fake-data/seed.json');
const { withDraftedQuote, T0 } = require('./helpers');
const { LINES } = require('../src/voice/scenario');

const item = (sku) => seed.catalog.find((i) => i.sku === sku);

describe('sell price: lowest in-stock supplier cost plus markup, to the cent', () => {
  test('seeded items', () => {
    expect(sellPrice(item('AQN-TX199'), 25)).toBe(1475);
    expect(sellPrice(item('BWK-BV12'), 25)).toBe(18);
    expect(sellPrice(item('FLX-PA34'), 25)).toBe(1.5);
    expect(sellPrice(item('PNR-DP24'), 25)).toBe(27.5);
  });

  test('a cheaper supplier with no stock is skipped', () => {
    // Ridgeway lists BWK-BV34 at 18.60 but has none; Northgate's 19.00 sets the price.
    expect(item('BWK-BV34').suppliers.sup_ridgeway).toEqual({ cost: 18.6, stock: 0 });
    expect(sellPrice(item('BWK-BV34'), 25)).toBe(23.75);
  });

  test('rounds to cents without floating-point residue', () => {
    const odd = { suppliers: { a: { cost: 10.01, stock: 1 }, b: { cost: 10.02, stock: 5 } } };
    expect(sellPrice(odd, 25)).toBe(12.51);
    expect(sellPrice({ suppliers: { a: { cost: 10.02, stock: 1 } } }, 25)).toBe(12.53);
    expect(sellPrice({ suppliers: { a: { cost: 0.1, stock: 1 } } }, 20)).toBe(0.12);
  });

  test('no stock anywhere means no price, and the line is refused rather than guessed', () => {
    expect(sellPrice({ suppliers: { a: { cost: 5, stock: 0 } } }, 25)).toBeNull();
    const soldOut = JSON.parse(JSON.stringify(seed));
    soldOut.catalog.find((i) => i.sku === 'PNR-DP24').suppliers.sup_northgate.stock = 0;
    const store = createStore({ seed: soldOut, now: () => T0 });
    const invoke = createInvoke(store);
    invoke('record_turn', { item_id: 'i1', text: 'For Helen Marsh, add a Panrite drain pan and a Ventora vent kit.' }, 'voice');
    const res = invoke(
      'draft_quote',
      { customer: 'Helen Marsh', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan' }, { sku: 'VNT-CV3', qty: 1, heard: 'a Ventora vent kit' }], labor_hours: 0, labor_heard: '' },
      'agent',
    );
    expect(res.result.refused[0].reason).toMatch(/No supplier shows PNR-DP24 in stock/);
    expect(res.result.draft.lines.map((l) => l.sku)).toEqual(['VNT-CV3']);
  });

  test('labor is hours times the owner rate', () => {
    expect(laborCents(6, 110)).toBe(66000);
    expect(laborCents(1.5, 110)).toBe(16500);
  });
});

describe('totals are recomputed on every change', () => {
  test('draft, set_qty, add and remove', () => {
    const ctx = withDraftedQuote();
    const total = () => ctx.store.state.drafts[0].total;
    expect(total()).toBe(1475 + 2 * 23.75 + 20 * 1.5 + 6 * 110);
    ctx.hear(LINES.U2);
    ctx.invoke(
      'revise_quote',
      {
        draft_id: ctx.quoteId,
        changes: [
          { op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet of PEX' },
          { op: 'add', sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan' },
        ],
      },
      'agent',
    );
    expect(total()).toBe(2255);
    ctx.hear('Drop the drain pan.');
    const removed = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'remove', sku: 'PNR-DP24', heard: 'the drain pan' }] }, 'agent');
    expect(removed.success).toBe(true);
    expect(total()).toBe(2227.5);
    const owner = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'AQN-TX199', qty: 2 }] }, 'owner');
    expect(owner.success).toBe(true);
    expect(total()).toBe(2227.5 + 1475);
    const line = ctx.store.state.drafts[0].lines.find((l) => l.sku === 'AQN-TX199');
    expect(line).toMatchObject({ qty: 2, lineTotal: 2950, heard: null, by: 'owner' });
  });
});

describe('search_catalog', () => {
  const state = createStore({ now: () => T0 }).state;
  const models = catalogModels(state.catalog);

  test('finds both valve sizes for "Brasswick ball valves", best matches first', () => {
    const results = search(state, 'Brasswick ball valves', models);
    expect(results.slice(0, 2).map((r) => r.sku)).toEqual(['BWK-BV12', 'BWK-BV34']);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  test('finds a model number however it was transcribed', () => {
    for (const q of ['TX-199', 'tx199', 'TX 199', 'Aquilon']) expect(search(state, q, models)[0].sku).toBe('AQN-TX199');
  });

  test('never reveals supplier cost or stock counts', () => {
    const all = search(state, 'valve pipe heater pan kit tank pump connector', models);
    expect(all.length).toBe(5);
    const json = JSON.stringify(all);
    expect(json).not.toMatch(/cost|stock"|suppliers/);
    for (const r of all) expect(Object.keys(r).sort()).toEqual(['in_stock_at', 'name', 'price', 'sku', 'unit', 'variant']);
  });

  test('an unknown product returns no results and a note, not an error', () => {
    const invoke = createInvoke(createStore({ now: () => T0 }));
    const res = invoke('search_catalog', { query: 'flux capacitor' }, 'agent');
    expect(res.success).toBe(true);
    expect(res.result.results).toEqual([]);
    expect(res.result.note).toMatch(/Ask the owner/);
  });
});
