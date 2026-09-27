'use strict';

const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { LINES } = require('../src/voice/scenario');

const T0 = Date.parse('2026-09-28T06:30:00.000Z');

// A store on a fixed clock, its invoke, and a helper that records what the "voice feed" heard.
function setup({ now = () => T0 } = {}) {
  const store = createStore({ now });
  const invoke = createInvoke(store);
  let n = 0;
  const hear = (text) => {
    n += 1;
    const res = invoke('record_turn', { item_id: `item_t${n}`, text }, 'voice', { cause: { source: 'test' } });
    if (!res.success) throw new Error(res.error);
    return res.result.turn;
  };
  return { store, invoke, hear };
}

// The demo's opening: U1 and the answer to the size question, then the drafted quote.
const QUOTE_ARGS = {
  customer: 'Priya Shah',
  lines: [
    { sku: 'AQN-TX199', qty: 1, heard: 'an Aquilon TX-199 tankless' },
    { sku: 'BWK-BV34', qty: 2, heard: 'two Brasswick ball valves', detail_heard: 'Three-quarter' },
    { sku: 'FLX-PA34', qty: 20, heard: 'twenty feet of Flexline PEX' },
  ],
  labor_hours: 6,
  labor_heard: 'Call it six hours labor',
};

function withDraftedQuote() {
  const ctx = setup();
  ctx.hear(LINES.U1);
  ctx.hear(LINES.U1B);
  const res = ctx.invoke('draft_quote', QUOTE_ARGS, 'agent');
  if (!res.success) throw new Error(res.error);
  return { ...ctx, quoteId: res.result.draft.id };
}

function withBothDrafts() {
  const ctx = withDraftedQuote();
  ctx.hear(LINES.U3);
  const res = ctx.invoke(
    'draft_supplier_request',
    { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], needed_by: 'Thursday', needed_by_heard: 'for Thursday' },
    'agent',
  );
  if (!res.success) throw new Error(res.error);
  return { ...ctx, requestId: res.result.draft.id };
}

module.exports = { T0, setup, QUOTE_ARGS, withDraftedQuote, withBothDrafts };
