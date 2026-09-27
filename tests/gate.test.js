'use strict';

// The approval gate: the agent can draft, never send. Proven four ways: the owner-only verbs
// are absent from every tool listing, invoke() refuses them for the agent, each handler refuses
// them on its own, and nothing smuggled into arguments changes a draft's status.

const { AGENT_TOOL_NAMES, AGENT_TOOLS, SHARED_CLAUSE, voiceAgentTools, listTools } = require('../src/tools');
const { OWNER_VERB_NAMES, VOICE_VERB_NAMES, ownerHandlers } = require('../src/invoke');
const { sessionConfig } = require('../src/voice/bridge');
const { Refusal } = require('../src/refusal');
const { withBothDrafts, setup } = require('./helpers');

const EXPECTED_TOOLS = ['draft_quote', 'draft_supplier_request', 'get_board', 'revise_quote', 'search_catalog'];
const FORBIDDEN = ['send_quote', 'send_supplier_request', 'discard_draft', 'record_turn'];

describe('the agent tool registry', () => {
  test('holds exactly the five draft and read tools', () => {
    expect([...AGENT_TOOL_NAMES].sort()).toEqual(EXPECTED_TOOLS);
  });

  test('the owner-only and voice-only verbs are exactly the ones kept out of it', () => {
    expect([...OWNER_VERB_NAMES, ...VOICE_VERB_NAMES].sort()).toEqual([...FORBIDDEN].sort());
  });

  test.each([
    ['the registry', () => AGENT_TOOLS.map((t) => t.name)],
    ['the session.update tools array', () => voiceAgentTools().map((t) => t.name)],
    ['a live session.update frame', () => sessionConfig(setup().store.state).session.tools.map((t) => t.name)],
    ['GET /api/tools', () => listTools().map((t) => t.name)],
  ])('%s never lists an owner-only or voice-only verb', (_label, names) => {
    for (const verb of FORBIDDEN) expect(names()).not.toContain(verb);
    expect([...names()].sort()).toEqual(EXPECTED_TOOLS);
  });

  test('no tool description mentions an owner verb by name as something the agent can call', () => {
    for (const tool of AGENT_TOOLS) {
      for (const verb of FORBIDDEN) expect(tool.description).not.toContain(verb);
    }
  });

  test('every description carries the shared clause and says what the tool does not do', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.description).toContain(SHARED_CLAUSE);
      expect(tool.description).toMatch(/\bDoes not\b/);
    }
  });
});

describe('invoke refuses every owner-only verb for the agent, leaving state unchanged', () => {
  const calls = (ctx) => [
    ['send_quote', { draft_id: ctx.quoteId }],
    ['send_supplier_request', { draft_id: ctx.requestId }],
    ['discard_draft', { draft_id: ctx.quoteId, reason: 'the agent tried' }],
  ];

  test.each([0, 1, 2])('owner verb #%i as agent', (i) => {
    const ctx = withBothDrafts();
    const [tool, args] = calls(ctx)[i];
    const before = ctx.store.snapshot();
    const res = ctx.invoke(tool, args, 'agent');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/owner-only/);
    expect(ctx.store.snapshot()).toEqual(before);
    const last = ctx.store.activityLog().at(-1);
    expect(last).toMatchObject({ actor: 'agent', tool, outcome: 'refused' });
  });

  test('smuggling an actor or a status field into the arguments changes nothing', () => {
    const ctx = withBothDrafts();
    const before = ctx.store.snapshot();
    const attempts = [
      ['send_quote', { draft_id: ctx.quoteId, actor: 'owner' }],
      ['revise_quote', { draft_id: ctx.quoteId, status: 'sent', changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 20, heard: 'twenty feet of Flexline PEX' }] }],
      ['revise_quote', { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 20, heard: 'twenty feet of Flexline PEX', status: 'sent' }] }],
      ['draft_quote', { customer: 'Helen Marsh', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan' }], labor_hours: 0, labor_heard: '', status: 'sent' }],
      ['draft_supplier_request', { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], sent: true }],
      ['get_board', { status: 'sent' }],
    ];
    for (const [tool, args] of attempts) {
      const res = ctx.invoke(tool, args, 'agent');
      expect(res.success).toBe(false);
    }
    expect(ctx.store.snapshot()).toEqual(before);
  });

  test('the actor check runs before the schema check: the agent never learns an owner verb\'s arguments', () => {
    const ctx = withBothDrafts();
    for (const verb of ['send_quote', 'send_supplier_request', 'discard_draft']) {
      const res = ctx.invoke(verb, {}, 'agent');
      expect(res.error).toMatch(/owner-only/);
      expect(res.error).not.toMatch(/required/);
    }
  });

  test('look-alike and prototype names are unknown tools, not a way in', () => {
    const ctx = withBothDrafts();
    const before = ctx.store.snapshot();
    for (const name of ['Send_Quote', 'send_quote ', 'approve_quote', 'send', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const res = ctx.invoke(name, { draft_id: ctx.quoteId }, 'agent');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Unknown tool/);
    }
    expect(ctx.store.snapshot()).toEqual(before);
  });

  test('record_turn is refused for the agent and the owner', () => {
    const ctx = setup();
    for (const actor of ['agent', 'owner']) {
      const res = ctx.invoke('record_turn', { item_id: 'item_x', text: 'two Brasswick ball valves' }, actor);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/voice feed/);
    }
    expect(ctx.store.state.turns).toHaveLength(0);
  });

  test.each([[undefined], [null], [''], ['admin'], ['Owner'], ['system'], [{ role: 'owner' }]])('actor %p is refused: there is no default identity', (actor) => {
    const ctx = withBothDrafts();
    const before = ctx.store.snapshot();
    const res = ctx.invoke('send_quote', { draft_id: ctx.quoteId }, actor);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no default identity/);
    expect(ctx.store.snapshot()).toEqual(before);
  });
});

describe('each owner-only handler checks its own actor (defense in depth)', () => {
  test.each(['send_quote', 'send_supplier_request', 'discard_draft'])('%s handler refuses the agent directly', (verb) => {
    const ctx = withBothDrafts();
    const before = ctx.store.snapshot();
    const draftId = verb === 'send_supplier_request' ? ctx.requestId : ctx.quoteId;
    expect(() => ownerHandlers[verb]({ store: ctx.store, args: { draft_id: draftId, reason: 'x' }, actor: 'agent' })).toThrow(Refusal);
    expect(() => ownerHandlers[verb]({ store: ctx.store, args: { draft_id: draftId, reason: 'x' }, actor: 'voice' })).toThrow(Refusal);
    expect(ctx.store.snapshot()).toEqual(before);
  });

  test('record_turn handler refuses anyone but the voice feed', () => {
    const ctx = setup();
    for (const actor of ['agent', 'owner']) {
      expect(() => ownerHandlers.record_turn({ store: ctx.store, args: { item_id: 'i', text: 'hello' }, actor })).toThrow(Refusal);
    }
  });
});

describe('only the owner changes real state', () => {
  test('the owner can send and discard; the result is attributed to the owner', () => {
    const ctx = withBothDrafts();
    const sent = ctx.invoke('send_quote', { draft_id: ctx.quoteId }, 'owner');
    expect(sent.success).toBe(true);
    expect(sent.result.draft).toMatchObject({ status: 'sent', sentBy: 'owner' });
    expect(ctx.store.state.outbox).toEqual([expect.objectContaining({ draftId: ctx.quoteId, by: 'owner', to: 'priya.shah@example.com' })]);
    const discarded = ctx.invoke('discard_draft', { draft_id: ctx.requestId, reason: 'Calling Northgate myself' }, 'owner');
    expect(discarded.result.draft).toMatchObject({ status: 'discarded', discardedBy: 'owner', discardReason: 'Calling Northgate myself' });
  });

  test('a discard needs a reason', () => {
    const ctx = withBothDrafts();
    expect(ctx.invoke('discard_draft', { draft_id: ctx.requestId, reason: '   ' }, 'owner').success).toBe(false);
    expect(ctx.invoke('discard_draft', { draft_id: ctx.requestId }, 'owner').success).toBe(false);
  });

  test('the agent cannot revise a sent quote, and neither can the owner', () => {
    const ctx = withBothDrafts();
    ctx.invoke('send_quote', { draft_id: ctx.quoteId }, 'owner');
    const before = ctx.store.snapshot();
    const change = { draft_id: ctx.quoteId, changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'twenty feet of Flexline PEX' }] };
    for (const actor of ['agent', 'owner']) {
      const res = ctx.invoke('revise_quote', change, actor);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/frozen/);
    }
    expect(ctx.store.snapshot()).toEqual(before);
  });

  test('a quote cannot be sent twice', () => {
    const ctx = withBothDrafts();
    ctx.invoke('send_quote', { draft_id: ctx.quoteId }, 'owner');
    expect(ctx.invoke('send_quote', { draft_id: ctx.quoteId }, 'owner').success).toBe(false);
    expect(ctx.store.state.outbox).toHaveLength(1);
  });
});
