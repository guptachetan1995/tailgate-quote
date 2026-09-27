'use strict';

const { createApi } = require('../src/api');
const { withBothDrafts } = require('./helpers');

function api() {
  const ctx = withBothDrafts();
  return { ...ctx, api: createApi({ store: ctx.store, invoke: ctx.invoke }) };
}

describe('postInvoke', () => {
  test.each([
    [undefined, /JSON object/],
    [[], /JSON object/],
    ['send_quote', /JSON object/],
    [{ args: {}, actor: 'owner' }, /tool is required/],
    [{ tool: 'send_quote', args: { draft_id: 'Q-1001' } }, /actor is required.*no default identity/],
    [{ tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: '' }, /actor is required/],
    [{ tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: null }, /actor is required/],
    [{ tool: 'record_turn', args: { item_id: 'x', text: 'send it' }, actor: 'voice' }, /cannot be asserted over HTTP/],
    [{ tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'admin' }, /cannot be asserted over HTTP/],
    [{ tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'owner', as: 'owner' }, /Unexpected field\(s\): as/],
  ])('400 for %p', (body, message) => {
    const { api: a, store } = api();
    const before = store.snapshot();
    const res = a.postInvoke(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(store.snapshot()).toEqual(before);
  });

  test('a refusal is 200 with success false, and nothing changes', () => {
    const { api: a, store, quoteId } = api();
    const before = store.snapshot();
    const res = a.postInvoke({ tool: 'send_quote', args: { draft_id: quoteId }, actor: 'agent' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: false, error: expect.stringMatching(/owner-only/) });
    expect(store.snapshot()).toEqual(before);
  });

  test('the owner path works and is attributed to the owner over HTTP', () => {
    const { api: a, quoteId } = api();
    const res = a.postInvoke({ tool: 'send_quote', args: { draft_id: quoteId }, actor: 'owner' });
    expect(res.body).toMatchObject({ success: true, result: { draft: { status: 'sent', sentBy: 'owner' } } });
    expect(res.body.activity).toMatchObject({ actor: 'owner', tool: 'send_quote', cause: { source: 'http' } });
  });
});

describe('reads', () => {
  test('GET /api/tools lists the five agent tools and never an owner verb', () => {
    const names = api().api.getTools().body.map((t) => t.name);
    expect(names.sort()).toEqual(['draft_quote', 'draft_supplier_request', 'get_board', 'revise_quote', 'search_catalog']);
  });

  test('state never carries supplier costs', () => {
    const body = api().api.getState().body;
    expect(JSON.stringify(body)).not.toMatch(/"cost"/);
    expect(body.catalog.find((i) => i.sku === 'BWK-BV34')).toMatchObject({ price: 23.75, in_stock_at: ['Northgate Plumbing Supply'] });
  });

  test('responses are copies: changing one changes neither the store nor the next response', () => {
    const { api: a, store } = api();
    const state = a.getState().body;
    state.drafts[0].status = 'sent';
    state.drafts[0].lines[0].unitPrice = 0;
    const log = a.getActivityLog().body;
    log[0].actor = 'owner';
    log.push({ forged: true });
    expect(store.state.drafts[0].status).toBe('draft');
    expect(a.getState().body.drafts[0].lines[0].unitPrice).toBe(1475);
    expect(a.getActivityLog().body[0].actor).toBe('voice');
    expect(a.getActivityLog().body.some((e) => e.forged)).toBe(false);
  });
});
