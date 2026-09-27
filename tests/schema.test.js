'use strict';

// The model never sets a price: every call is checked against its verb's JSON Schema with
// additionalProperties: false at every object level, so a price, total, discount or status
// field is refused, named and logged rather than ignored.

const { validate, objectLevels, KEYWORDS } = require('../src/schema');
const { verbSchemas } = require('../src/invoke');
const { AGENT_TOOLS } = require('../src/tools');
const { VOICE_BEATS } = require('../src/voice/scenario');
const { withDraftedQuote, QUOTE_ARGS } = require('./helpers');

function walkKeywords(schema, path, out) {
  for (const key of Object.keys(schema)) out.push([path, key]);
  for (const [k, sub] of Object.entries(schema.properties || {})) walkKeywords(sub, `${path}.${k}`, out);
  if (schema.items) walkKeywords(schema.items, `${path}[]`, out);
  return out;
}

const allSchemas = Object.entries(verbSchemas()).flatMap(([verb, byActor]) => Object.entries(byActor).map(([actor, schema]) => [`${verb} (${actor})`, schema]));

describe('every verb schema', () => {
  test.each(allSchemas)('%s: additionalProperties is false at every object level', (_name, schema) => {
    const levels = objectLevels(schema);
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) expect(level.schema.additionalProperties).toBe(false);
  });

  test.each(allSchemas)('%s: uses only the keywords the validator implements', (_name, schema) => {
    for (const [, key] of walkKeywords(schema, '', [])) expect(KEYWORDS.has(key)).toBe(true);
  });

  test('the validator refuses a schema keyword it does not implement', () => {
    expect(() => validate({ type: 'object', minProperties: 1 }, {}, 'x')).toThrow(/unsupported keyword/);
  });
});

describe('money and status fields are refused, named and logged', () => {
  const quoteFor = (extra) => ({ ...QUOTE_ARGS, customer: 'Helen Marsh', ...extra });

  test.each(['unit_price', 'sell_price', 'labor_rate', 'markup', 'total', 'discount', 'status'])('top-level %s on draft_quote', (field) => {
    const ctx = withDraftedQuote();
    const before = ctx.store.snapshot();
    const res = ctx.invoke('draft_quote', quoteFor({ [field]: 1 }), 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toContain(`"${field}" is not a field of draft_quote`);
    expect(res.details).toEqual({ field });
    expect(ctx.store.snapshot()).toEqual(before);
    expect(ctx.store.activityLog().at(-1)).toMatchObject({ actor: 'agent', tool: 'draft_quote', outcome: 'refused', error: expect.stringContaining(field) });
  });

  test('a nested lines[0].price is refused and named', () => {
    const ctx = withDraftedQuote();
    const args = quoteFor({ lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan', price: 1 }] });
    const res = ctx.invoke('draft_quote', args, 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toContain('"lines[0].price" is not a field of draft_quote');
    expect(res.error).toMatch(/owner's price list/);
  });

  test('nested fields are refused on revise_quote and draft_supplier_request too', () => {
    const ctx = withDraftedQuote();
    const revise = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'x', unit_price: 0 }] }, 'agent');
    expect(revise.error).toContain('"changes[0].unit_price"');
    const supplier = ctx.invoke('draft_supplier_request', { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'x', cost: 1 }] }, 'agent');
    expect(supplier.error).toContain('"lines[0].cost"');
  });

  test('the owner is held to the same schema: no price field from the UI either', () => {
    const ctx = withDraftedQuote();
    const res = ctx.invoke('draft_quote', quoteFor({ lines: [{ sku: 'PNR-DP24', qty: 1, unit_price: 5 }] }), 'owner');
    expect(res.success).toBe(false);
    expect(res.error).toContain('"lines[0].unit_price"');
  });
});

describe('types, enums and required fields', () => {
  test.each([
    [{ ...QUOTE_ARGS, lines: [{ sku: 'PNR-DP24', qty: '2', heard: 'x' }] }, /"lines\[0\]\.qty" must be a whole number/],
    [{ ...QUOTE_ARGS, lines: [{ sku: 'PNR-DP24', qty: 1.5, heard: 'x' }] }, /"lines\[0\]\.qty" must be a whole number/],
    [{ ...QUOTE_ARGS, lines: [{ sku: 'PNR-DP24', qty: 0, heard: 'x' }] }, /at least 1/],
    [{ ...QUOTE_ARGS, lines: [{ sku: 'PNR-DP24', qty: 1 }] }, /"lines\[0\]\.heard" is required/],
    [{ ...QUOTE_ARGS, lines: [{ sku: 'PNR DP24', qty: 1, heard: 'x' }] }, /"lines\[0\]\.sku" is empty or not in the expected form/],
    [{ ...QUOTE_ARGS, labor_hours: -1 }, /at least 0/],
    [{ ...QUOTE_ARGS, lines: 'all of it' }, /"lines" must be an array/],
    ['draft everything', /"\(arguments\)" must be an object/],
  ])('draft_quote as agent: %#', (args, message) => {
    const res = withDraftedQuote().invoke('draft_quote', args, 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(message);
  });

  test('revise_quote ops are an enum', () => {
    const ctx = withDraftedQuote();
    const res = ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_price', sku: 'FLX-PA34', heard: 'x' }] }, 'agent');
    expect(res.error).toMatch(/"changes\[0\]\.op" must be one of "set_qty", "add", "remove"/);
  });

  test('the owner needs no heard words; the agent always does', () => {
    const ctx = withDraftedQuote();
    const handTyped = { customer: 'Daniel Okafor', lines: [{ sku: 'VNT-CV3', qty: 1 }], labor_hours: 2 };
    expect(ctx.invoke('draft_quote', handTyped, 'agent').error).toMatch(/"labor_heard" is required/);
    const owner = ctx.invoke('draft_quote', handTyped, 'owner');
    expect(owner.success).toBe(true);
    expect(owner.result.draft.lines[0]).toMatchObject({ sku: 'VNT-CV3', heard: null, by: 'owner' });
  });

  test('every scripted agent tool call is schema-valid', () => {
    const toolCalls = VOICE_BEATS.flatMap((b) => b.events).filter((e) => e.type === 'tool.call');
    expect(toolCalls.length).toBeGreaterThan(5);
    const byName = Object.fromEntries(AGENT_TOOLS.map((t) => [t.name, t.parameters]));
    for (const call of toolCalls) expect(validate(byName[call.name], call.arguments, call.name)).toBeNull();
  });
});
