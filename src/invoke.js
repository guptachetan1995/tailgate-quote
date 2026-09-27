'use strict';

// invoke(tool, args, actor, { cause }): the one path by which anything changes.
//
// The agent's tool calls (from the voice bridge), the owner's taps (from the UI, over HTTP) and
// the voice feed's finished transcripts all arrive here. In order, every call is:
//   1. checked for a known actor: there is no default identity;
//   2. checked for a known verb;
//   3. checked against the verb's allowed actors: the owner-only verbs below are not in the
//      agent's tool registry and refuse any actor but "owner";
//   4. validated against the verb's JSON Schema, refusing any field it does not declare;
//   5. run, and logged with its actor and cause, refusals included.
// invoke never throws to its caller; it returns { success, result | error, activity }.

const { Refusal } = require('./refusal');
const { validate } = require('./schema');
const { AGENT_TOOLS, AGENT_TOOL_NAMES, relaxEvidence } = require('./tools');
const { SHARED_HANDLERS, findDraft, assertOpen } = require('./drafts');
const { detectSpokenApproval } = require('./spoken');
const { clone } = require('./store');

const ACTORS = ['agent', 'owner', 'voice'];
const SPOKEN_REFUSAL = 'refused as approval: a voice is not a signature; only a tap sends';

function ownerOnly(tool) {
  return `${tool} is owner-only: it is not a tool, and only the owner's tap on screen does it. Nothing said aloud and nothing the agent calls performs it. Nothing was changed.`;
}

function customerCopy(state, draft) {
  const b = state.business;
  return {
    from: { name: b.name, owner: b.owner, email: b.email, phone: b.phone, address: b.address },
    to: draft.customer,
    quote: draft.id,
    date: draft.sentAt,
    lines: draft.lines.map((l) => ({
      description: l.variant ? `${l.name}, ${l.variant}-inch` : l.name,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    labor: draft.labor && { hours: draft.labor.hours, rate: draft.labor.rate, amount: draft.labor.amount },
    total: draft.total,
    taxNote: 'Tax calculated at invoicing',
  };
}

// ---- owner-only verbs: never registered as a tool --------------------------------------------
// invoke() already refuses them for any other actor; each handler checks again so that the gate
// does not depend on one table being right.

function sendQuote({ store, args, actor }) {
  if (actor !== 'owner') throw new Refusal(ownerOnly('send_quote'));
  const state = store.state;
  const draft = findDraft(state, args.draft_id);
  if (draft.kind !== 'customer_quote') throw new Refusal(`${draft.id} is a supplier request; use send_supplier_request.`);
  assertOpen(draft);
  draft.status = 'sent';
  draft.sentAt = store.nowIso();
  draft.sentBy = 'owner';
  const copy = customerCopy(state, draft);
  const entry = { id: store.nextId('outbox'), draftId: draft.id, kind: draft.kind, to: draft.customer.email, toName: draft.customer.name, at: draft.sentAt, by: 'owner', copy };
  state.outbox.push(entry);
  return { draft: clone(draft), outbox: clone(entry), customer_copy: clone(copy) };
}

function sendSupplierRequest({ store, args, actor }) {
  if (actor !== 'owner') throw new Refusal(ownerOnly('send_supplier_request'));
  const state = store.state;
  const draft = findDraft(state, args.draft_id);
  if (draft.kind !== 'supplier_request') throw new Refusal(`${draft.id} is a customer quote; use send_quote.`);
  assertOpen(draft);
  draft.status = 'sent';
  draft.sentAt = store.nowIso();
  draft.sentBy = 'owner';
  const entry = { id: store.nextId('outbox'), draftId: draft.id, kind: draft.kind, to: draft.supplier.email, toName: draft.supplier.name, at: draft.sentAt, by: 'owner' };
  state.outbox.push(entry);
  return { draft: clone(draft), outbox: clone(entry) };
}

function discardDraft({ store, args, actor }) {
  if (actor !== 'owner') throw new Refusal(ownerOnly('discard_draft'));
  const draft = findDraft(store.state, args.draft_id);
  assertOpen(draft);
  draft.status = 'discarded';
  draft.discardedAt = store.nowIso();
  draft.discardedBy = 'owner';
  draft.discardReason = args.reason.trim();
  return { draft: clone(draft) };
}

// ---- voice feed: finished user transcripts become evidence -------------------------------------

function recordTurn({ store, args, actor }) {
  if (actor !== 'voice') {
    throw new Refusal('record_turn is written only by the voice feed inside the process that holds the voice session; it is not a tool and cannot be called by the agent or the owner.');
  }
  const state = store.state;
  if (state.turns.some((t) => t.itemId === args.item_id)) throw new Refusal(`Turn ${args.item_id} is already recorded.`);
  const spoken = detectSpokenApproval(args.text);
  const turn = { id: store.nextId('turn'), itemId: args.item_id, text: args.text, at: store.nowIso(), clip: args.clip || null, spokenApproval: spoken.approval };
  state.turns.push(turn);
  if (!spoken.approval) return { turn: clone(turn), spoken_approval: null };
  // The detector changes no draft's status; it only records that consent was heard and refused.
  const open = state.drafts.filter((d) => d.status === 'draft');
  for (const d of open) d.spokenApprovalsRefused.push(turn.id);
  return {
    turn: clone(turn),
    spoken_approval: { heard: args.text, refused: SPOKEN_REFUSAL, drafts_unchanged: open.map((d) => d.id) },
  };
}

const DRAFT_ID = { type: 'string', pattern: '\\S', description: 'The draft id, for example "Q-1001".' };
const OWNER_VERBS = {
  send_quote: {
    handler: sendQuote,
    schema: { type: 'object', additionalProperties: false, required: ['draft_id'], properties: { draft_id: DRAFT_ID } },
  },
  send_supplier_request: {
    handler: sendSupplierRequest,
    schema: { type: 'object', additionalProperties: false, required: ['draft_id'], properties: { draft_id: DRAFT_ID } },
  },
  discard_draft: {
    handler: discardDraft,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['draft_id', 'reason'],
      properties: { draft_id: DRAFT_ID, reason: { type: 'string', pattern: '\\S' } },
    },
  },
};
const VOICE_VERBS = {
  record_turn: {
    handler: recordTurn,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['item_id', 'text'],
      properties: {
        item_id: { type: 'string', pattern: '\\S' },
        text: { type: 'string', pattern: '\\S' },
        clip: { type: 'string', pattern: '^[a-z0-9_-]+$' },
      },
    },
  },
};

// verb -> { actors, schemas by actor, handler }
const VERBS = {};
for (const tool of AGENT_TOOLS) {
  VERBS[tool.name] = {
    actors: ['agent', 'owner'],
    schemas: { agent: tool.parameters, owner: relaxEvidence(tool.parameters) },
    handler: SHARED_HANDLERS[tool.name],
  };
}
for (const [name, verb] of Object.entries(OWNER_VERBS)) VERBS[name] = { actors: ['owner'], schemas: { owner: verb.schema }, handler: verb.handler };
for (const [name, verb] of Object.entries(VOICE_VERBS)) VERBS[name] = { actors: ['voice'], schemas: { voice: verb.schema }, handler: verb.handler };

function actorRefusal(tool, actor) {
  if (OWNER_VERBS[tool]) return ownerOnly(tool);
  if (VOICE_VERBS[tool]) return 'record_turn is written only by the voice feed; it is not a tool and cannot be called by the agent or the owner.';
  return `${tool} cannot be called by ${actor}.`;
}

function createInvoke(store) {
  return function invoke(tool, args, actor, { cause } = {}) {
    const input = args === undefined ? {} : args;
    const entry = { actor: typeof actor === 'string' ? actor : null, tool: String(tool), args: input, cause: cause || { source: 'direct' } };
    const refuse = (message, details) => {
      const activity = store.appendLog({ ...entry, outcome: 'refused', error: message });
      return { success: false, error: message, ...(details ? { details: clone(details) } : {}), activity };
    };

    if (!ACTORS.includes(actor)) {
      return refuse(`invoke needs an actor ("agent", "owner" or "voice"); ${JSON.stringify(actor ?? null)} is not one. There is no default identity.`);
    }
    const verb = Object.hasOwn(VERBS, tool) ? VERBS[tool] : null;
    if (!verb) return refuse(`Unknown tool "${tool}". The agent's tools are: ${AGENT_TOOL_NAMES.join(', ')}.`);
    if (!verb.actors.includes(actor)) return refuse(actorRefusal(tool, actor));

    const invalid = validate(verb.schemas[actor], input, tool);
    if (invalid) return refuse(invalid.message, { field: invalid.path });

    try {
      const result = verb.handler({ store, args: input, actor });
      const flagged = tool === 'record_turn' && result.spoken_approval;
      const activity = store.appendLog({ ...entry, outcome: flagged ? 'refused_as_approval' : 'ok', result, ...(flagged ? { note: SPOKEN_REFUSAL } : {}) });
      return { success: true, result: clone(result), activity };
    } catch (err) {
      if (err instanceof Refusal) return refuse(err.message, err.details);
      // A bug, not a refusal: still logged and returned, so the voice session and the UI keep
      // running and the failure is visible in the activity log.
      const activity = store.appendLog({ ...entry, outcome: 'error', error: String(err && err.message) });
      return { success: false, error: `internal error in ${tool}: ${err && err.message}`, activity };
    }
  };
}

// Every verb's schema per actor, for the test that walks them all.
function verbSchemas() {
  return Object.fromEntries(Object.entries(VERBS).map(([name, verb]) => [name, verb.schemas]));
}

module.exports = {
  createInvoke,
  verbSchemas,
  ACTORS,
  OWNER_VERB_NAMES: Object.keys(OWNER_VERBS),
  VOICE_VERB_NAMES: Object.keys(VOICE_VERBS),
  // Exposed so a test can call each owner-only handler directly with actor "agent" and prove the
  // handler's own check refuses, independent of the actor table above.
  ownerHandlers: { send_quote: sendQuote, send_supplier_request: sendSupplierRequest, discard_draft: discardDraft, record_turn: recordTurn },
  SPOKEN_REFUSAL,
};
