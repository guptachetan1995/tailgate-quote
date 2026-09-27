'use strict';

// The demo scenario end to end: scripted Voice Agent events through the fake provider, the real
// bridge and the real invoke(), then the owner's taps and the agent-panel refusals.

const { execFileSync } = require('child_process');
const path = require('path');
const { createBridge } = require('../src/voice/bridge');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { runScenario, LINES } = require('../src/voice/scenario');
const { SPOKEN_REFUSAL } = require('../src/invoke');
const { setup } = require('./helpers');

async function play() {
  const ctx = setup();
  const provider = new FakeVoiceProvider({ sessionId: 'sess_scripted_demo' });
  const bridge = createBridge({ provider, invoke: ctx.invoke, store: ctx.store });
  const snapshots = {};
  const results = await runScenario({
    bridge,
    provider,
    invoke: ctx.invoke,
    onStep: ({ title }) => {
      if (title.startsWith('Dave taps Send')) snapshots.beforeOwner = ctx.store.snapshot();
    },
  });
  return { ...ctx, provider, bridge, results, snapshots };
}

test('the session drafts, revises and refuses; only the owner sends', async () => {
  const { store, snapshots } = await play();
  const before = snapshots.beforeOwner;
  // At the end of the voice session nothing has been sent, whatever was said.
  expect(before.drafts.map((d) => [d.id, d.status])).toEqual([
    ['Q-1001', 'draft'],
    ['S-2001', 'draft'],
  ]);
  expect(before.outbox).toEqual([]);

  const quote = before.drafts[0];
  expect(quote.lines.map((l) => [l.sku, l.qty, l.lineTotal])).toEqual([
    ['AQN-TX199', 1, 1475],
    ['BWK-BV34', 2, 47.5],
    ['FLX-PA34', 30, 45],
    ['PNR-DP24', 1, 27.5],
  ]);
  expect(quote.total).toBe(2255);
  expect(quote.revisions.map((r) => [r.op, r.sku, r.from, r.to, r.heard])).toEqual([
    ['set_qty', 'FLX-PA34', 20, 30, 'make that thirty feet of PEX'],
    ['add', 'PNR-DP24', 0, 1, 'add a Panrite drain pan'],
  ]);
  expect(before.drafts[1]).toMatchObject({ kind: 'supplier_request', supplierId: 'sup_northgate', neededBy: 'Thursday' });

  const spoken = before.turns.find((t) => t.text === LINES.U4);
  expect(spoken.spokenApproval).toBe(true);
  for (const d of before.drafts) expect(d.spokenApprovalsRefused).toEqual([spoken.id]);

  const after = store.snapshot();
  expect(after.drafts.map((d) => [d.id, d.status, d.sentBy || d.discardedBy])).toEqual([
    ['Q-1001', 'sent', 'owner'],
    ['S-2001', 'discarded', 'owner'],
  ]);
  expect(after.outbox).toEqual([expect.objectContaining({ draftId: 'Q-1001', to: 'priya.shah@example.com', by: 'owner' })]);
});

test('every line of the final quote carries a receipt from a recorded turn', async () => {
  const { store } = await play();
  const turns = Object.fromEntries(store.state.turns.map((t) => [t.id, t.text]));
  for (const line of store.state.drafts[0].lines) {
    expect(line.by).toBe('agent');
    expect(turns[line.turnId]).toBeDefined();
  }
  expect(store.state.drafts[0].labor).toMatchObject({ hours: 6, amount: 660, heard: 'Call it six hours labor' });
});

test('the activity log attributes every step: voice turns, agent calls, owner taps, refusals', async () => {
  const { store } = await play();
  const log = store.activityLog();
  const count = (pred) => log.filter(pred).length;
  expect(count((e) => e.actor === 'voice' && e.tool === 'record_turn')).toBe(5);
  expect(count((e) => e.actor === 'agent' && e.cause.source === 'tool.call')).toBe(7);
  expect(log.filter((e) => e.cause.source === 'tool.call').every((e) => e.outcome === 'ok')).toBe(true);
  expect(log.filter((e) => e.outcome === 'refused_as_approval')).toEqual([expect.objectContaining({ actor: 'voice', note: SPOKEN_REFUSAL })]);
  expect(log.filter((e) => ['send_quote', 'send_supplier_request', 'discard_draft'].includes(e.tool) && e.outcome === 'ok').map((e) => e.actor)).toEqual(['owner', 'owner']);
  const panel = log.filter((e) => e.cause.source === 'agent panel');
  expect(panel.map((e) => [e.tool, e.outcome])).toEqual([
    ['send_quote', 'refused'],
    ['draft_quote', 'refused'],
    ['draft_quote', 'refused'],
    ['revise_quote', 'refused'],
  ]);
});

test('the protocol side: every tool call answered, in order, and the session ended', async () => {
  const { provider, bridge } = await play();
  const sent = provider.sent.map((e) => e.type);
  expect(sent[0]).toBe('session.update');
  expect(sent.at(-1)).toBe('session.end');
  const answered = provider.sentOfType('tool.result').map((r) => r.call_id);
  expect(answered).toEqual(['call_1', 'call_2', 'call_3', 'call_4', 'call_5', 'call_6', 'call_7']);
  expect(provider.sentOfType('tool.result').every((r) => r.is_error === false && typeof r.result === 'string')).toBe(true);
  expect(bridge.status()).toMatchObject({ held: 0, waiting: 0, ended: true, sessionId: 'sess_scripted_demo' });
  expect(provider.closed).toBe(true);
});

test('npm run demo prints the scenario offline and exits 0', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'demo.js')], {
    env: { PATH: process.env.PATH, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  expect(out).toContain('heard "Sounds great, go ahead and send it over!"');
  expect(out).toContain(SPOKEN_REFUSAL);
  expect(out).toContain('sent Q-1001 to priya.shah@example.com');
  expect(out).toMatch(/\[agent\] send_quote refused: send_quote is owner-only/);
  expect(out).toContain('never registered as a tool');
  expect(out.includes('\u001b[')).toBe(false);
});
