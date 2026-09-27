'use strict';

// Handlers for the verbs both the agent and the owner may call: read the price list, read the
// board, draft and revise. None of them sends anything. Each builds its change completely before
// touching state, so a refusal leaves state exactly as it was.

const { Refusal } = require('./refusal');
const { search, sellPriceCents, laborCents, fromCents } = require('./catalog');
const { checkLine, checkLabor, checkPhrase, findInTurns, turnsAbout } = require('./evidence');
const { clone } = require('./store');

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function findItem(state, sku) {
  return state.catalog.find((item) => item.sku === String(sku).toUpperCase());
}

function siblingsOf(state, item) {
  return state.catalog.filter((other) => other.name === item.name && other.sku !== item.sku);
}

function findLead(state, customer) {
  const c = norm(customer);
  const exact = state.leads.filter((l) => l.id === customer || norm(l.name) === c || c.includes(norm(l.name)));
  if (exact.length === 1) return exact[0];
  const words = new Set(c.split(' '));
  const partial = state.leads.filter((l) => norm(l.name).split(' ').some((w) => words.has(w)));
  return partial.length === 1 ? partial[0] : null;
}

function findSupplier(state, name) {
  const words = new Set(norm(name).split(' '));
  const matches = state.suppliers.filter(
    (sup) => sup.id === name || norm(sup.name) === norm(name) || words.has(norm(sup.name).split(' ')[0]),
  );
  return matches.length === 1 ? matches[0] : null;
}

function findDraft(state, id) {
  const draft = state.drafts.find((d) => d.id === id);
  if (!draft) throw new Refusal(`There is no draft ${id}. get_board lists the open drafts.`);
  return draft;
}

function assertOpen(draft) {
  if (draft.status === 'sent') {
    throw new Refusal(`${draft.id} was sent at ${draft.sentAt} and is frozen; nothing was changed. A change after sending needs a new draft.`);
  }
  if (draft.status === 'discarded') {
    throw new Refusal(`${draft.id} was discarded by the owner ("${draft.discardReason}"); nothing was changed.`);
  }
}

function recomputeTotal(draft) {
  const cents = draft.lines.reduce((sum, l) => sum + Math.round(l.lineTotal * 100), 0) + (draft.labor ? Math.round(draft.labor.amount * 100) : 0);
  draft.total = fromCents(cents);
}

// A customer quote is built only from what was said about that customer: the turns from the
// one that named the lead onward, until another lead is named (evidence.turnsAbout). Returns
// the turns the agent may cite for `lead`.
function turnsForLead(state, lead) {
  const about = turnsAbout(state.turns, state.leads, lead.id);
  if (!about) {
    throw new Refusal(
      `No turn heard so far names ${lead.name} or ${lead.site}, so nothing heard can be cited for their quote. Ask the owner who this job is for; the quote is drafted once the owner has named the customer.`,
    );
  }
  return about;
}

// When a field's cited words are missing from the lead's own turns but were heard in another
// turn, say so: they are about another customer's job. `fields` maps a field name to the text
// cited for it.
function scopeReason(ctx, fields, reason) {
  if (!ctx.turns || !ctx.lead) return reason;
  for (const [field, text] of Object.entries(fields)) {
    if (!text || !reason.startsWith(`${field} must be the owner's exact words`)) continue;
    const elsewhere = findInTurns(ctx.store.state.turns, text, ctx.store.models);
    if (elsewhere) {
      return `${field} '${String(text).trim()}' was heard in ${elsewhere.turnId}, which is not about ${ctx.lead.name}'s job. Cite only what the owner said about ${ctx.lead.name}.`;
    }
  }
  return reason;
}

// Builds one priced line (quote) or unpriced line (supplier request) from a line spec. The agent
// must cite evidence; the owner types by hand and has nothing to cite. ctx.turns, when set, is
// the part of the conversation the line may cite (a customer's own turns).
function buildLine(ctx, spec, { priced, needQty = true, variantRule = true }) {
  const { store, actor } = ctx;
  const state = store.state;
  const item = findItem(state, spec.sku);
  if (!item) return { reason: `No item with sku ${spec.sku} is on the price list. Use search_catalog to find the sku.` };
  const line = { sku: item.sku, name: item.name, variant: item.variant, unit: item.unit, qty: spec.qty };
  if (priced) {
    const cents = sellPriceCents(item, state.business.markupPct);
    if (cents === null) {
      return { reason: `No supplier shows ${item.sku} in stock, so it has no price. Tell the owner; draft_supplier_request can ask a supplier.` };
    }
    line.unitPrice = fromCents(cents);
    line.lineTotal = fromCents(cents * spec.qty);
  }
  if (actor === 'agent') {
    const ev = checkLine({
      item,
      siblings: variantRule ? siblingsOf(state, item) : [],
      catalog: state.catalog,
      qty: spec.qty,
      heard: spec.heard,
      detailHeard: spec.detail_heard,
      turns: ctx.turns || state.turns,
      models: store.models,
      needQty,
    });
    if (ev.reason) return { reason: scopeReason(ctx, { heard: spec.heard, detail_heard: spec.detail_heard }, ev.reason) };
    Object.assign(line, { heard: spec.heard, turnId: ev.turnId });
    if (ev.detailTurnId) Object.assign(line, { detailHeard: spec.detail_heard, detailTurnId: ev.detailTurnId });
  } else {
    Object.assign(line, { heard: null, turnId: null });
  }
  line.by = actor;
  return { line };
}

function buildLines(ctx, specs, opts) {
  const lines = [];
  const refused = [];
  specs.forEach((spec, index) => {
    const built = buildLine(ctx, spec, opts);
    if (built.reason) refused.push({ index, sku: spec.sku, reason: built.reason });
    else if (lines.some((l) => l.sku === built.line.sku)) {
      refused.push({ index, sku: spec.sku, reason: `${built.line.sku} is already a line of this draft; one line per item.` });
    } else lines.push(built.line);
  });
  return { lines, refused };
}

function refuseAll(what, refused) {
  const reasons = refused.map((r) => (r.sku ? `${r.sku}: ${r.reason}` : r.reason)).join(' ');
  throw new Refusal(`No ${what} was drafted. ${reasons}`, { refused });
}

const DRAFT_NOTE = "Draft only. It is on the owner's screen, and only the owner's tap sends it.";

function searchCatalog({ store, args }) {
  const results = search(store.state, args.query, store.models);
  if (results.length === 0) {
    return { query: args.query, results, note: `Nothing on the price list matches "${args.query}". Ask the owner what they meant.` };
  }
  return { query: args.query, results };
}

function boardDraft(d) {
  const base = { id: d.id, kind: d.kind, status: d.status, refusals: d.refusals.slice(-5) };
  if (d.kind === 'customer_quote') {
    return {
      ...base,
      customer: d.customer.name,
      lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, variant: l.variant, qty: l.qty, unit_price: l.unitPrice, line_total: l.lineTotal, heard: l.heard })),
      labor: d.labor && { hours: d.labor.hours, amount: d.labor.amount },
      total: d.total,
    };
  }
  return {
    ...base,
    supplier: d.supplier.name,
    lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, variant: l.variant, qty: l.qty, heard: l.heard })),
    needed_by: d.neededBy,
  };
}

function getBoard({ store }) {
  const state = store.state;
  return {
    drafts: state.drafts.filter((d) => d.status === 'draft').map(boardDraft),
    leads: state.leads.map((l) => ({ id: l.id, name: l.name, site: l.site })),
    recent_turns: state.turns.slice(-5).map((t) => ({ id: t.id, text: t.text, spoken_approval: t.spokenApproval })),
  };
}

function draftQuote(ctx) {
  const { store, args, actor } = ctx;
  const state = store.state;
  const lead = findLead(state, args.customer);
  if (!lead) {
    const leads = state.leads.map((l) => `${l.name} (${l.site})`).join(', ');
    throw new Refusal(`No open lead matches "${args.customer}". The open leads are: ${leads}. Quotes are only for existing leads; the agent cannot create a customer.`);
  }
  const open = state.drafts.find((d) => d.kind === 'customer_quote' && d.leadId === lead.id && d.status === 'draft');
  if (open) throw new Refusal(`${lead.name} already has open draft ${open.id}. Use revise_quote to change it.`);
  if (args.lines.length === 0) throw new Refusal('A quote needs at least one line.');

  const turns = actor === 'agent' ? turnsForLead(state, lead) : null;
  const lineCtx = { ...ctx, turns, lead };
  const { lines, refused } = buildLines(lineCtx, args.lines, { priced: true });
  if (lines.length === 0) refuseAll('quote', refused);

  let labor = null;
  if (args.labor_hours > 0) {
    const rate = state.business.laborRate;
    const amount = fromCents(laborCents(args.labor_hours, rate));
    if (actor === 'agent') {
      const ev = args.labor_heard ? checkLabor({ hours: args.labor_hours, heard: args.labor_heard, turns, models: store.models }) : { reason: 'labor_heard is required when labor_hours is more than 0.' };
      if (ev.reason) refused.push({ field: 'labor', reason: scopeReason(lineCtx, { labor_heard: args.labor_heard }, ev.reason) });
      else labor = { hours: args.labor_hours, rate, amount, heard: args.labor_heard, turnId: ev.turnId, by: actor };
    } else {
      labor = { hours: args.labor_hours, rate, amount, heard: null, turnId: null, by: actor };
    }
  }

  const at = store.nowIso();
  const draft = {
    id: store.nextId('quote'),
    kind: 'customer_quote',
    status: 'draft',
    leadId: lead.id,
    customer: { name: lead.name, site: lead.site, email: lead.email, phone: lead.phone },
    lines,
    labor,
    note: args.note || null,
    total: 0,
    createdAt: at,
    createdBy: actor,
    revisions: [],
    refusals: refused.map((r) => ({ at, by: actor, sku: r.sku || null, field: r.field || null, reason: r.reason })),
    spokenApprovalsRefused: [],
    sentAt: null,
    sentBy: null,
    discardedAt: null,
    discardedBy: null,
    discardReason: null,
  };
  recomputeTotal(draft);
  state.drafts.push(draft);
  return { draft: clone(draft), refused, note: DRAFT_NOTE };
}

function reviseQuote(ctx) {
  const { store, args, actor } = ctx;
  const state = store.state;
  const draft = findDraft(state, args.draft_id);
  if (draft.kind !== 'customer_quote') throw new Refusal(`${draft.id} is a supplier request; revise_quote changes customer quotes only.`);
  assertOpen(draft);
  if (args.changes.length === 0) throw new Refusal('changes is empty; nothing was changed.');
  const lead = state.leads.find((l) => l.id === draft.leadId);
  const lineCtx = actor === 'agent' ? { ...ctx, turns: turnsForLead(state, lead), lead } : ctx;

  const lines = clone(draft.lines);
  const revisions = [];
  const refused = [];
  const at = store.nowIso();
  args.changes.forEach((change, index) => {
    const refuse = (reason) => refused.push({ index, sku: change.sku, reason });
    const sku = String(change.sku).toUpperCase();
    const pos = lines.findIndex((l) => l.sku === sku);
    if (change.op !== 'remove' && change.qty === undefined) return refuse(`qty is required for ${change.op}.`);
    if (change.op === 'add') {
      if (pos >= 0) return refuse(`${sku} is already a line; use set_qty to change its quantity.`);
      const built = buildLine(lineCtx, change, { priced: true });
      if (built.reason) return refuse(built.reason);
      lines.push(built.line);
      return revisions.push({ at, by: actor, op: 'add', sku, from: 0, to: change.qty, heard: built.line.heard, turnId: built.line.turnId });
    }
    if (pos < 0) return refuse(`${sku} is not a line of ${draft.id}.`);
    const line = lines[pos];
    // The line already names its item and size, so a correction need not repeat the size.
    const built = buildLine(lineCtx, { ...change, qty: change.qty ?? line.qty }, { priced: true, needQty: change.op === 'set_qty', variantRule: false });
    if (built.reason) return refuse(built.reason);
    if (change.op === 'set_qty') {
      if (change.qty === line.qty) return refuse(`${sku} is already ${line.qty}.`);
      const from = line.qty;
      const replacedHeard = line.heard;
      line.qty = change.qty;
      line.lineTotal = fromCents(Math.round(line.unitPrice * 100) * change.qty);
      // The receipt now points at the words that set the current quantity; the words it
      // replaces stay in the revision history.
      Object.assign(line, { heard: built.line.heard, turnId: built.line.turnId, by: actor });
      return revisions.push({ at, by: actor, op: 'set_qty', sku, from, to: change.qty, heard: built.line.heard, turnId: built.line.turnId, replacedHeard });
    }
    if (lines.length === 1) return refuse(`${sku} is the last line; a quote needs at least one. The owner can discard the draft instead.`);
    lines.splice(pos, 1);
    return revisions.push({ at, by: actor, op: 'remove', sku, from: line.qty, to: 0, heard: built.line.heard, turnId: built.line.turnId });
  });
  if (revisions.length === 0) refuseAll('change', refused);

  draft.lines = lines;
  draft.revisions.push(...revisions);
  draft.refusals.push(...refused.map((r) => ({ at, by: actor, sku: r.sku, field: null, reason: r.reason })));
  recomputeTotal(draft);
  return { draft: clone(draft), revisions, refused, note: DRAFT_NOTE };
}

function draftSupplierRequest(ctx) {
  const { store, args, actor } = ctx;
  const state = store.state;
  const supplier = findSupplier(state, args.supplier);
  if (!supplier) {
    throw new Refusal(`No supplier matches "${args.supplier}". The suppliers are: ${state.suppliers.map((s) => s.name).join(', ')}.`);
  }
  if (args.lines.length === 0) throw new Refusal('A supplier request needs at least one line.');
  if (args.needed_by_heard !== undefined && args.needed_by === undefined) throw new Refusal('needed_by_heard was given without needed_by.');

  const { lines, refused } = buildLines(ctx, args.lines, { priced: false });
  if (lines.length === 0) refuseAll('supplier request', refused);

  let neededBy = null;
  if (args.needed_by !== undefined) {
    if (actor === 'agent') {
      const ev = args.needed_by_heard
        ? checkPhrase({ field: 'needed_by', value: args.needed_by, heardField: 'needed_by_heard', heard: args.needed_by_heard, turns: state.turns, models: store.models })
        : { reason: 'needed_by_heard is required with needed_by.' };
      if (ev.reason) refused.push({ field: 'needed_by', reason: ev.reason });
      else neededBy = { words: args.needed_by, heard: args.needed_by_heard, turnId: ev.turnId };
    } else {
      neededBy = { words: args.needed_by, heard: null, turnId: null };
    }
  }

  const at = store.nowIso();
  const draft = {
    id: store.nextId('supplier'),
    kind: 'supplier_request',
    status: 'draft',
    supplierId: supplier.id,
    supplier: { name: supplier.name, email: supplier.email, phone: supplier.phone },
    lines,
    neededBy: neededBy && neededBy.words,
    neededByHeard: neededBy && neededBy.heard,
    neededByTurnId: neededBy && neededBy.turnId,
    createdAt: at,
    createdBy: actor,
    revisions: [],
    refusals: refused.map((r) => ({ at, by: actor, sku: r.sku || null, field: r.field || null, reason: r.reason })),
    spokenApprovalsRefused: [],
    sentAt: null,
    sentBy: null,
    discardedAt: null,
    discardedBy: null,
    discardReason: null,
  };
  state.drafts.push(draft);
  return { draft: clone(draft), refused, note: DRAFT_NOTE };
}

const SHARED_HANDLERS = {
  search_catalog: searchCatalog,
  get_board: getBoard,
  draft_quote: draftQuote,
  revise_quote: reviseQuote,
  draft_supplier_request: draftSupplierRequest,
};

module.exports = { SHARED_HANDLERS, findDraft, assertOpen };
