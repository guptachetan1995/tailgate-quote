'use strict';

// The activity log is append-only and attributes every call, refusals included, to its actor
// and its cause. Entries are snapshots taken when they were written.

const { createStore } = require('../src/store');
const { withDraftedQuote, setup, T0 } = require('./helpers');
const { LINES } = require('../src/voice/scenario');

test('every call is logged with actor, tool, args, cause and outcome, in order', () => {
  const ctx = setup();
  ctx.hear(LINES.U1);
  ctx.invoke('search_catalog', { query: 'Panrite' }, 'agent', { cause: { source: 'tool.call', call_id: 'call_9' } });
  ctx.invoke('send_quote', { draft_id: 'Q-1001' }, 'agent', { cause: { source: 'tool.call', call_id: 'call_10' } });
  ctx.invoke('get_board', {}, 'owner');
  ctx.invoke('get_board', {}, 'nobody');
  const log = ctx.store.activityLog();
  expect(log.map((e) => [e.seq, e.actor, e.tool, e.outcome])).toEqual([
    [1, 'voice', 'record_turn', 'ok'],
    [2, 'agent', 'search_catalog', 'ok'],
    [3, 'agent', 'send_quote', 'refused'],
    [4, 'owner', 'get_board', 'ok'],
    [5, 'nobody', 'get_board', 'refused'],
  ]);
  expect(log[1]).toMatchObject({ args: { query: 'Panrite' }, cause: { source: 'tool.call', call_id: 'call_9' }, at: new Date(T0).toISOString() });
  expect(log[2]).toMatchObject({ cause: { call_id: 'call_10' }, error: expect.stringMatching(/owner-only/) });
  expect(log[3].cause).toEqual({ source: 'direct' });
});

test('entries are snapshots: a later revision does not rewrite what the draft looked like', () => {
  const ctx = withDraftedQuote();
  ctx.hear(LINES.U2);
  ctx.invoke('revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet of PEX' }] }, 'agent');
  const log = ctx.store.activityLog();
  const drafted = log.find((e) => e.tool === 'draft_quote');
  const revised = log.find((e) => e.tool === 'revise_quote');
  expect(drafted.result.draft.lines.find((l) => l.sku === 'FLX-PA34').qty).toBe(20);
  expect(revised.result.draft.lines.find((l) => l.sku === 'FLX-PA34').qty).toBe(30);
});

test('arguments are snapshotted too: mutating them after the call changes nothing logged', () => {
  const ctx = setup();
  const args = { query: 'Panrite' };
  ctx.invoke('search_catalog', args, 'agent');
  args.query = 'something else';
  expect(ctx.store.activityLog()[0].args).toEqual({ query: 'Panrite' });
});

test('the log cannot be edited through what the store hands out, and entries are frozen inside', () => {
  const store = createStore({ now: () => T0 });
  const seen = [];
  store.subscribe((e) => seen.push(e));
  const returned = store.appendLog({ actor: 'owner', tool: 'get_board', args: {}, outcome: 'ok' });
  returned.actor = 'agent';
  store.activityLog()[0].actor = 'agent';
  expect(store.activityLog()[0].actor).toBe('owner');
  expect(Object.isFrozen(seen[0])).toBe(true);
  expect(Object.isFrozen(seen[0].args)).toBe(true);
});

test('invoke never throws to its caller, even for a malformed call', () => {
  const ctx = setup();
  expect(() => ctx.invoke(undefined, undefined, undefined)).not.toThrow();
  expect(ctx.invoke('draft_quote', null, 'agent')).toMatchObject({ success: false });
  expect(ctx.store.activityLog()).toHaveLength(2);
});

test('replay is day-independent: the injected clock, not the system clock, dates the seed and the log', () => {
  const a = createStore({ now: () => T0 });
  const b = createStore({ now: () => T0 });
  expect(a.snapshot()).toEqual(b.snapshot());
  expect(a.snapshot().leads.find((l) => l.id === 'lead_shah').createdAt).toBe('2026-09-26T06:30:00.000Z');
  const later = createStore({ now: () => T0 + 3 * 86400000 });
  expect(later.snapshot().leads.find((l) => l.id === 'lead_shah').createdAt).toBe('2026-09-29T06:30:00.000Z');
});
