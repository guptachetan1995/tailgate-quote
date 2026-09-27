'use strict';

// The demo scenario as Voice Agent API events: the beats of the recorded session, scripted.
// It drives the fake provider for the offline demo (`npm run demo`) and the end-to-end test.
// The owner's and customer's lines are the scripted clips' words; the agent's lines are what
// the agent is expected to say, until a real session replaces them.

const U1 = 'New job for Priya Shah at 41 Linden Avenue. Swap her old tank for an Aquilon TX-199 tankless, two Brasswick ball valves, and twenty feet of Flexline PEX. Call it six hours labor.';
const U1B = 'Three-quarter.';
const U2 = 'Actually, make that thirty feet of PEX, and add a Panrite drain pan.';
const U3 = 'And check Northgate has the TX-199 in stock for Thursday.';
const U4 = 'Sounds great, go ahead and send it over!';
const SPOKEN_ANSWER = "I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it.";

function userTurn(itemId, text, partials) {
  return [
    { type: 'input.speech.started' },
    ...partials.map((p) => ({ type: 'transcript.user.delta', item_id: itemId, text: p })),
    { type: 'input.speech.stopped' },
    { type: 'transcript.user', item_id: itemId, text },
  ];
}

function reply(replyId, text, { interruptedBy } = {}) {
  if (interruptedBy) {
    return [
      { type: 'reply.started', reply_id: replyId },
      { type: 'transcript.agent.delta', delta: text },
      { type: 'reply.audio', data: 'AAAAAAAA' },
      ...interruptedBy,
      { type: 'reply.done', reply_id: replyId, status: 'interrupted' },
      { type: 'transcript.agent', text, interrupted: true },
    ];
  }
  return [
    { type: 'reply.started', reply_id: replyId },
    { type: 'transcript.agent.delta', delta: text },
    { type: 'reply.audio', data: 'AAAAAAAA' },
    { type: 'reply.done', reply_id: replyId, status: 'completed' },
    { type: 'transcript.agent', text, interrupted: false },
  ];
}

const call = (callId, name, args) => ({ type: 'tool.call', call_id: callId, name, arguments: args });

// Interactive tool calls arrive inside an agent reply, which ends with reply.done; that
// reply.done is when their results may be sent (AssemblyAI's documented order).
function toolReply(replyId, calls) {
  return [{ type: 'reply.started', reply_id: replyId }, ...calls, { type: 'reply.done', reply_id: replyId, status: 'completed' }];
}

const VOICE_BEATS = [
  {
    title: 'Open: the agent greets the owner',
    events: reply('reply_1', "Tailgate's open, Dave. Tell me about the job."),
  },
  {
    title: 'U1, Dave describes the job (live partials, then the finished turn)',
    events: [
      ...userTurn('item_u1', U1, [
        'New job for Priya Shah',
        'New job for Priya Shah at 41 Linden Avenue. Swap her old tank',
        'New job for Priya Shah at 41 Linden Avenue. Swap her old tank for an Aquilon TX-199 tankless, two Brasswick ball valves',
      ]),
      ...toolReply('reply_2', [
        call('call_1', 'search_catalog', { query: 'Aquilon TX-199' }),
        call('call_2', 'search_catalog', { query: 'Brasswick ball valve' }),
        call('call_3', 'search_catalog', { query: 'Flexline PEX' }),
      ]),
    ],
  },
  {
    title: 'Clarifying question: two valve sizes on the price list',
    events: [...reply('reply_3', 'Half-inch or three-quarter-inch ball valves?'), ...userTurn('item_u1b', U1B, ['Three'])],
  },
  {
    title: 'The agent drafts the quote, every line citing heard words',
    events: [
      call('call_4', 'draft_quote', {
        customer: 'Priya Shah',
        lines: [
          { sku: 'AQN-TX199', qty: 1, heard: 'an Aquilon TX-199 tankless' },
          { sku: 'BWK-BV34', qty: 2, heard: 'two Brasswick ball valves', detail_heard: 'Three-quarter' },
          { sku: 'FLX-PA34', qty: 20, heard: 'twenty feet of Flexline PEX' },
        ],
        labor_hours: 6,
        labor_heard: 'Call it six hours labor',
      }),
    ],
  },
  {
    title: 'U2, Dave barges in on the read-back with a correction',
    events: [
      ...reply('reply_4', "That's a draft for Priya Shah at two thousand two hundred", {
        interruptedBy: [{ type: 'input.speech.started' }],
      }),
      { type: 'transcript.user.delta', item_id: 'item_u2', text: 'Actually, make that thirty feet' },
      { type: 'input.speech.stopped' },
      { type: 'transcript.user', item_id: 'item_u2', text: U2 },
      ...toolReply('reply_5', [call('call_5', 'search_catalog', { query: 'Panrite drain pan' })]),
      call('call_6', 'revise_quote', {
        draft_id: 'Q-1001',
        changes: [
          { op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet of PEX' },
          { op: 'add', sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan' },
        ],
      }),
      ...reply('reply_6', 'Done: thirty feet of PEX and a Panrite drain pan. The new total is two thousand two hundred fifty-five dollars.'),
    ],
  },
  {
    title: 'U3, Dave asks for a supplier stock check',
    events: [
      ...userTurn('item_u3', U3, ['And check Northgate has the TX-199']),
      call('call_7', 'draft_supplier_request', {
        supplier: 'Northgate',
        lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }],
        needed_by: 'Thursday',
        needed_by_heard: 'for Thursday',
      }),
      ...reply('reply_7', "I've drafted a stock check to Northgate for one TX-199 by Thursday. It's on your screen."),
    ],
  },
  {
    title: 'U4, Priya (the customer at the tailgate) says "send it"',
    events: [...userTurn('item_u4', U4, ['Sounds great, go ahead']), ...reply('reply_8', SPOKEN_ANSWER)],
  },
];

// After the session: the owner's taps, then a judge trying the forbidden actions as the agent.
const OWNER_STEPS = [
  { title: 'Dave taps Send on the quote', tool: 'send_quote', args: { draft_id: 'Q-1001' } },
  { title: 'Dave taps Discard on the supplier request', tool: 'discard_draft', args: { draft_id: 'S-2001', reason: 'Calling Northgate myself' } },
];

const AGENT_PANEL_STEPS = [
  { title: 'send_quote as the agent', tool: 'send_quote', args: { draft_id: 'Q-1001' } },
  {
    title: 'draft_quote with a smuggled unit_price',
    tool: 'draft_quote',
    args: {
      customer: 'Daniel Okafor',
      lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan' }],
      labor_hours: 0,
      labor_heard: '',
      unit_price: 1,
    },
  },
  {
    title: 'draft_quote with a nested lines[0].price',
    tool: 'draft_quote',
    args: {
      customer: 'Daniel Okafor',
      lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan', price: 1 }],
      labor_hours: 0,
      labor_heard: '',
    },
  },
  {
    title: 'revise_quote on the sent quote',
    tool: 'revise_quote',
    args: { draft_id: 'Q-1001', changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 40, heard: 'make that thirty feet of PEX' }] },
  },
];

// Runs the whole scenario through a bridge and the real invoke(). onStep receives
// { phase, title } before each beat or step.
async function runScenario({ bridge, provider, invoke, onStep = () => {} }) {
  await bridge.start();
  for (const beat of VOICE_BEATS) {
    onStep({ phase: 'voice', title: beat.title });
    for (const event of beat.events) provider.emit(event);
  }
  onStep({ phase: 'voice', title: 'Session ends (session.end, so no billable grace window)' });
  await bridge.stop();
  const results = [];
  for (const step of OWNER_STEPS) {
    onStep({ phase: 'owner', title: step.title });
    results.push(invoke(step.tool, step.args, 'owner', { cause: { source: 'owner tap' } }));
  }
  for (const step of AGENT_PANEL_STEPS) {
    onStep({ phase: 'agent panel', title: step.title });
    results.push(invoke(step.tool, step.args, 'agent', { cause: { source: 'agent panel' } }));
  }
  return results;
}

module.exports = { VOICE_BEATS, OWNER_STEPS, AGENT_PANEL_STEPS, runScenario, LINES: { U1, U1B, U2, U3, U4, SPOKEN_ANSWER } };
