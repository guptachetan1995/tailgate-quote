'use strict';

// Every line has a receipt: the cited words must be a contiguous run of one heard turn, must
// name the item, and must contain the quantity. Sizes, fractions and model numbers are never
// quantities.

const { tokenize, quantities, quantitiesFor, catalogModels, checkLine, checkLabor, findInTurns, turnsAbout } = require('../src/evidence');
const seed = require('../fake-data/seed.json');
const { setup, withDraftedQuote, QUOTE_ARGS } = require('./helpers');
const { LINES } = require('../src/voice/scenario');

const models = catalogModels(seed.catalog);
const item = (sku) => seed.catalog.find((i) => i.sku === sku);
const siblings = (sku) => seed.catalog.filter((i) => i.name === item(sku).name && i.sku !== sku);
const turns = (...texts) => texts.map((text, i) => ({ id: `turn_${i + 1}`, text }));
const texts = (s) => tokenize(s, models).map((t) => t.t);

function line(sku, qty, heard, turnTexts, detailHeard) {
  return checkLine({ item: item(sku), siblings: siblings(sku), catalog: seed.catalog, qty, heard, detailHeard, turns: turns(...turnTexts), models });
}

describe('tokenizer', () => {
  test('3/4 stays 3/4 and never becomes 34', () => {
    expect(texts('3/4')).toEqual(['3/4']);
    expect(quantities(tokenize('two 3/4 valves', models))).toEqual([2]);
  });

  test('spoken and written sizes normalize to the same token', () => {
    for (const s of ['3/4-inch', '3/4 inch', '3/4"', 'three-quarter-inch', 'three quarter inch', 'three-quarter inch']) {
      expect(texts(s)).toEqual(['3/4-inch']);
    }
    expect(texts('Three-quarter.')).toEqual(['3/4']);
    expect(texts('half-inch')).toEqual(['1/2-inch']);
    expect(texts('24 inch')).toEqual(['24-inch']);
    expect(texts('twenty-four inch')).toEqual(['24-inch']);
  });

  test('number words become digits', () => {
    expect(quantities(tokenize('twenty feet', models))).toEqual([20]);
    expect(quantities(tokenize('twenty-five feet', models))).toEqual([25]);
    expect(quantities(tokenize('twenty five feet', models))).toEqual([25]);
    expect(quantities(tokenize('a dozen caps', models))).toEqual([12]);
    expect(quantities(tokenize('a couple of valves', models))).toEqual([2]);
    expect(quantities(tokenize('one hundred and twenty feet', models))).toEqual([120]);
    expect(quantities(tokenize('six and a half hours', models))).toEqual([6.5]);
    expect(quantities(tokenize('1,000 feet', models))).toEqual([1000]);
  });

  test('model numbers are protected, including a spoken "TX 199"', () => {
    for (const s of ['TX-199', 'TX199', 'tx 199']) {
      expect(texts(s)).toEqual(['tx199']);
      expect(quantities(tokenize(s, models))).toEqual([]);
    }
    expect(quantities(tokenize('a Panrite 24-inch drain pan', models))).toEqual([]);
    expect(quantities(tokenize('the 50-gallon Halden', models))).toEqual([]);
    expect(quantities(tokenize('a Sumpro 1/3 HP pump', models))).toEqual([]);
  });

  test('punctuation and case do not matter', () => {
    expect(texts('Actually, make that THIRTY feet of PEX!')).toEqual(texts('actually make that 30 feet of pex'));
  });
});

describe('quantity scan', () => {
  test('"an Aquilon TX-199 tankless" accepts 1 and refuses 199', () => {
    expect(line('AQN-TX199', 1, 'an Aquilon TX-199 tankless', [LINES.U1])).toEqual({ turnId: 'turn_1' });
    expect(line('AQN-TX199', 199, 'an Aquilon TX-199 tankless', [LINES.U1]).reason).toMatch(/qty 199 is not in/);
  });

  test('"a Panrite 24-inch drain pan" accepts 1 and refuses 24', () => {
    const t = ['Add a Panrite 24-inch drain pan.'];
    expect(line('PNR-DP24', 1, 'a Panrite 24-inch drain pan', t).turnId).toBe('turn_1');
    expect(line('PNR-DP24', 24, 'a Panrite 24-inch drain pan', t).reason).toMatch(/qty 24/);
  });

  test('"two Brasswick ball valves" accepts 2 and refuses 3 and 4', () => {
    const t = [LINES.U1, LINES.U1B];
    expect(line('BWK-BV34', 2, 'two Brasswick ball valves', t, 'Three-quarter')).toEqual({ turnId: 'turn_1', detailTurnId: 'turn_2' });
    expect(line('BWK-BV34', 3, 'two Brasswick ball valves', t, 'Three-quarter').reason).toMatch(/qty 3 is not in 'two Brasswick ball valves' for Brasswick ball valve \(it says 2\)/);
    expect(line('BWK-BV34', 4, 'two Brasswick ball valves', t, 'Three-quarter').reason).toMatch(/qty 4/);
  });

  test('"fifteen feet" refuses 50', () => {
    const t = ['Run fifteen feet of Flexline PEX to the heater.'];
    expect(line('FLX-PA34', 15, 'fifteen feet of Flexline PEX', t).turnId).toBe('turn_1');
    expect(line('FLX-PA34', 50, 'fifteen feet of Flexline PEX', t).reason).toMatch(/qty 50 is not in 'fifteen feet of Flexline PEX' for Flexline 3\/4-inch PEX-A pipe \(it says 15\)/);
  });

  test('"twenty" in the transcript matches "20" in the citation, and the other way round', () => {
    expect(line('FLX-PA34', 20, '20 feet of Flexline PEX', [LINES.U1]).turnId).toBe('turn_1');
    expect(line('FLX-PA34', 20, 'twenty feet of Flexline PEX', ['Twenty feet of Flexline PEX.']).turnId).toBe('turn_1');
  });

  test('qty 1 is refused when the words carry another number', () => {
    expect(line('FLX-PA34', 1, 'twenty feet of Flexline PEX', [LINES.U1]).reason).toMatch(/qty 1/);
  });
});

describe('a quantity belongs to the item it was said for', () => {
  test('cited words that run into the next item never lend it their number', () => {
    // One heater and twenty feet of PEX were said; two is the valves'.
    const heater = line('AQN-TX199', 2, 'an Aquilon TX-199 tankless, two Brasswick ball valves', [LINES.U1]);
    expect(heater.reason).toMatch(/qty 2 is not in 'an Aquilon TX-199 tankless, two Brasswick ball valves' for Aquilon TX-199 tankless water heater \(it names no quantity, which means 1; 2 there goes with another item\)/);
    const pex = line('FLX-PA34', 2, 'two Brasswick ball valves, and twenty feet of Flexline PEX', [LINES.U1]);
    expect(pex.reason).toMatch(/qty 2 is not in .* for Flexline 3\/4-inch PEX-A pipe \(it says 20; 2 there goes with another item\)/);
  });

  test('the same wide spans give each item its own number', () => {
    expect(line('AQN-TX199', 1, 'an Aquilon TX-199 tankless, two Brasswick ball valves', [LINES.U1])).toEqual({ turnId: 'turn_1' });
    expect(line('FLX-PA34', 20, 'two Brasswick ball valves, and twenty feet of Flexline PEX', [LINES.U1])).toEqual({ turnId: 'turn_1' });
  });

  test('a number after the last item named is that item\'s, unless it counts hours', () => {
    const t = ['The Brasswick valves, make it three.', 'Twenty feet of Flexline PEX, call it six hours.'];
    expect(line('BWK-BV34', 3, 'The Brasswick valves, make it three', t, undefined).reason).toMatch(/does not say which/);
    expect(quantitiesFor(tokenize('the Brasswick valves, make it three', models), item('BWK-BV34'), seed.catalog, models)).toEqual([3]);
    expect(quantitiesFor(tokenize('Twenty feet of Flexline PEX, call it six hours', models), item('FLX-PA34'), seed.catalog, models)).toEqual([20]);
  });
});

describe('a quote cites only what was said about its customer', () => {
  test("words from another lead's job are refused for this lead, with the reason", () => {
    const ctx = setup();
    ctx.hear('New job for Priya Shah. Actually, make that thirty feet of PEX, and add a Panrite drain pan.');
    ctx.hear('Next, Daniel Okafor at 9 Birch Court wants a Ventora vent kit.');
    const res = ctx.invoke('draft_quote', { customer: 'Daniel Okafor', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan' }], labor_hours: 0, labor_heard: '' }, 'agent');
    expect(res.success).toBe(false);
    expect(res.details.refused[0].reason).toBe("heard 'add a Panrite drain pan' was heard in turn_1, which is not about Daniel Okafor's job. Cite only what the owner said about Daniel Okafor.");
    const ok = ctx.invoke('draft_quote', { customer: 'Daniel Okafor', lines: [{ sku: 'VNT-CV3', qty: 1, heard: 'a Ventora vent kit' }], labor_hours: 0, labor_heard: '' }, 'agent');
    expect(ok.result.draft.lines[0]).toMatchObject({ sku: 'VNT-CV3', turnId: 'turn_2' });
  });

  test('a lead nobody has named gets no quote from the agent; the owner, typing by hand, still can', () => {
    const ctx = setup();
    ctx.hear('Add a Panrite drain pan.');
    const res = ctx.invoke('draft_quote', { customer: 'Helen Marsh', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan' }], labor_hours: 0, labor_heard: '' }, 'agent');
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/No turn heard so far names Helen Marsh or 207 Quarry Road/) });
    expect(ctx.invoke('draft_quote', { customer: 'Helen Marsh', lines: [{ sku: 'PNR-DP24', qty: 1 }], labor_hours: 0 }, 'owner').success).toBe(true);
  });

  test('a turn about the job that does not repeat the name stays with the customer last named', () => {
    const ctx = withDraftedQuote();
    ctx.hear(LINES.U2);
    const res = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'add', sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan' }] }, 'agent');
    expect(res.success).toBe(true);
    ctx.hear('Okay, Daniel Okafor next: add a Panrite drain pan there too.');
    const other = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan there too' }] }, 'agent');
    expect(other.success).toBe(false);
    expect(other.error).toMatch(/not about Priya Shah's job/);
  });

  test('a name the transcript spells one letter off still names the lead; a different name does not', () => {
    expect(turnsAbout(turns('New job for Pria Shaw at the Linden house.'), seed.leads, 'lead_shah')).toHaveLength(1);
    expect(turnsAbout(turns('New job for Maria at the corner.'), seed.leads, 'lead_shah')).toBeNull();
  });
});

describe('the cited words must be heard, in one turn, and name the item', () => {
  test('words never heard are refused with a message the model can act on', () => {
    const r = line('FLX-PA34', 30, 'thirty feet of pex', [LINES.U1]);
    expect(r.reason).toBe("heard must be the owner's exact words from one turn; 'thirty feet of pex' is not in any turn heard so far. Quote the turn exactly, or wait until the owner has finished speaking.");
  });

  test('words must be contiguous, not picked out of a turn', () => {
    expect(line('AQN-TX199', 1, 'an Aquilon tankless', [LINES.U1]).reason).toMatch(/not in any turn/);
  });

  test('words may not span two turns', () => {
    const t = ['Two Brasswick ball', 'valves, three-quarter.'];
    expect(line('BWK-BV34', 2, 'two Brasswick ball valves', t).reason).toMatch(/not in any turn/);
  });

  test('the cited words must name the item', () => {
    expect(line('FLX-PA34', 6, 'Call it six hours labor', [LINES.U1]).reason).toMatch(/does not name Flexline 3\/4-inch PEX-A pipe/);
  });

  test('the most recent turn with the words is cited', () => {
    const found = findInTurns(turns('two Brasswick ball valves', 'again, two Brasswick ball valves'), 'two Brasswick ball valves', models);
    expect(found.turnId).toBe('turn_2');
  });
});

describe('sizes: the agent must ask when the price list has more than one', () => {
  test('a valve without a size is refused with an instruction to ask', () => {
    const r = line('BWK-BV34', 2, 'two Brasswick ball valves', [LINES.U1]);
    expect(r.reason).toMatch(/has Brasswick ball valve in 3\/4 and 1\/2/);
    expect(r.reason).toMatch(/Ask the owner which one, then put the words of their answer in detail_heard/);
  });

  test('a size said in the same words needs no detail', () => {
    expect(line('BWK-BV34', 2, 'two three-quarter-inch Brasswick ball valves', ['Two three-quarter-inch Brasswick ball valves.']).turnId).toBe('turn_1');
  });

  test('detail_heard must contain the chosen size', () => {
    const t = [LINES.U1, 'Half-inch.'];
    expect(line('BWK-BV34', 2, 'two Brasswick ball valves', t, 'Half-inch').reason).toMatch(/does not say 3\/4/);
    expect(line('BWK-BV12', 2, 'two Brasswick ball valves', t, 'Half-inch')).toEqual({ turnId: 'turn_1', detailTurnId: 'turn_2' });
    expect(line('BWK-BV12', 2, 'two Brasswick ball valves', [LINES.U1, 'Half.'], 'Half')).toEqual({ turnId: 'turn_1', detailTurnId: 'turn_2' });
  });

  test('detail_heard must itself have been heard', () => {
    expect(line('BWK-BV34', 2, 'two Brasswick ball valves', [LINES.U1], 'Three-quarter').reason).toMatch(/detail_heard must be the owner's exact words/);
  });
});

describe('labor evidence', () => {
  const t = turns(LINES.U1);
  test('"Call it six hours labor" gives 6 hours, not 7', () => {
    expect(checkLabor({ hours: 6, heard: 'Call it six hours labor', turns: t, models })).toEqual({ turnId: 'turn_1' });
    expect(checkLabor({ hours: 7, heard: 'Call it six hours labor', turns: t, models }).reason).toMatch(/labor_hours 7 is not in/);
  });
  test('labor words must mention hours or labor', () => {
    expect(checkLabor({ hours: 2, heard: 'two Brasswick ball valves', turns: t, models }).reason).toMatch(/does not mention hours or labor/);
  });
});

describe('evidence through invoke(): every agent line carries its receipt', () => {
  test('the drafted quote cites a recorded turn on every line and on labor', () => {
    const ctx = withDraftedQuote();
    const draft = ctx.store.state.drafts[0];
    const turnById = Object.fromEntries(ctx.store.state.turns.map((tn) => [tn.id, tn]));
    for (const l of draft.lines) {
      expect(l.by).toBe('agent');
      expect(turnById[l.turnId]).toBeDefined();
      expect(findInTurns([turnById[l.turnId]], l.heard, ctx.store.models)).not.toBeNull();
    }
    expect(draft.lines.find((l) => l.sku === 'BWK-BV34')).toMatchObject({ detailHeard: 'Three-quarter', detailTurnId: 'turn_2' });
    expect(turnById[draft.labor.turnId].text).toContain('six hours labor');
  });

  test('refused lines are reported with the reason while good lines are drafted', () => {
    const ctx = setup();
    ctx.hear(LINES.U1);
    const res = ctx.invoke('draft_quote', { ...QUOTE_ARGS, lines: [QUOTE_ARGS.lines[0], { sku: 'FLX-PA34', qty: 50, heard: 'twenty feet of Flexline PEX' }] }, 'agent');
    expect(res.success).toBe(true);
    expect(res.result.draft.lines.map((l) => l.sku)).toEqual(['AQN-TX199']);
    expect(res.result.refused).toEqual([{ index: 1, sku: 'FLX-PA34', reason: expect.stringMatching(/qty 50/) }]);
    expect(ctx.store.state.drafts[0].refusals).toHaveLength(1);
  });

  test('a draft whose every line is refused is not created at all', () => {
    const ctx = setup();
    ctx.hear(LINES.U1);
    const before = ctx.store.snapshot();
    const res = ctx.invoke('draft_quote', { ...QUOTE_ARGS, lines: [{ sku: 'FLX-PA34', qty: 30, heard: 'thirty feet of pex' }] }, 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No quote was drafted/);
    expect(res.details.refused).toHaveLength(1);
    expect(ctx.store.snapshot()).toEqual(before);
  });

  test('a draft before anything was heard is refused', () => {
    const ctx = setup();
    const res = ctx.invoke('draft_quote', QUOTE_ARGS, 'agent');
    expect(res.success).toBe(false);
    expect(ctx.store.state.drafts).toHaveLength(0);
  });

  test('a revision cites the words that asked for it, and the receipt follows', () => {
    const ctx = withDraftedQuote();
    ctx.hear(LINES.U2);
    const res = ctx.invoke(
      'revise_quote',
      { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet of PEX' }] },
      'agent',
    );
    expect(res.success).toBe(true);
    expect(res.result.revisions[0]).toMatchObject({ op: 'set_qty', sku: 'FLX-PA34', from: 20, to: 30, heard: 'make that thirty feet of PEX', turnId: 'turn_3', replacedHeard: 'twenty feet of Flexline PEX' });
    expect(res.result.draft.lines.find((l) => l.sku === 'FLX-PA34')).toMatchObject({ qty: 30, heard: 'make that thirty feet of PEX', turnId: 'turn_3' });
  });

  test('a revision that misattributes the words to another item is refused', () => {
    const ctx = withDraftedQuote();
    ctx.hear(LINES.U2);
    const res = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'BWK-BV34', qty: 30, heard: 'make that thirty feet of PEX' }] }, 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/does not name Brasswick ball valve/);
  });

  test('a supplier request keeps "needed by" as the words heard', () => {
    const ctx = withDraftedQuote();
    ctx.hear(LINES.U3);
    const ok = ctx.invoke(
      'draft_supplier_request',
      { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], needed_by: 'Thursday', needed_by_heard: 'for Thursday' },
      'agent',
    );
    expect(ok.result.draft).toMatchObject({ neededBy: 'Thursday', neededByHeard: 'for Thursday', neededByTurnId: 'turn_3', supplierId: 'sup_northgate' });
    const bad = ctx.invoke(
      'draft_supplier_request',
      { supplier: 'Ridgeway', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], needed_by: 'Friday', needed_by_heard: 'for Thursday' },
      'agent',
    );
    expect(bad.result.refused).toEqual([{ field: 'needed_by', reason: expect.stringMatching(/'Friday' is not in needed_by_heard/) }]);
    expect(bad.result.draft.neededBy).toBeNull();
  });
});
