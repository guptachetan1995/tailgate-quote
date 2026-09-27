'use strict';

// The agent's tool registry: the only verbs the model can ever see or call. Sending a quote,
// sending a supplier request, discarding a draft and recording a turn are deliberately absent;
// they exist only inside invoke(), behind an actor check.
//
// A tool's description is the only thing the model reads, so each one is written for a reader
// who cannot see the screen and says what the tool does NOT do.

const SHARED_CLAUSE =
  'Sending a quote, sending a supplier request and discarding a draft are done only by the owner tapping a button on screen. ' +
  'They are not tools, you cannot call them, and nothing said aloud performs them, whoever says "send it". ' +
  "If asked, say the draft is on the owner's screen and only their tap sends it.";

const SKU = {
  type: 'string',
  pattern: '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$',
  description: 'The sku exactly as search_catalog returned it, for example "BWK-BV34".',
};
const QTY = { type: 'integer', minimum: 1, description: 'A whole number: the quantity the owner said.' };
const HEARD = {
  type: 'string',
  pattern: '\\S',
  description: "The owner's exact words from one turn that name this item and its quantity, copied word for word.",
};
const DETAIL_HEARD = {
  type: 'string',
  pattern: '\\S',
  description: "Only when you had to ask which size: the exact words of the owner's answer, for example \"Three-quarter\".",
};

const LINE = {
  type: 'object',
  additionalProperties: false,
  required: ['sku', 'qty', 'heard'],
  properties: { sku: SKU, qty: QTY, heard: HEARD, detail_heard: DETAIL_HEARD },
};

const AGENT_TOOLS = [
  {
    name: 'search_catalog',
    execution_mode: 'interactive',
    timeout_seconds: 10,
    description:
      "Look up the owner's price list by what was said: a product name, brand, size or SKU (for example \"Brasswick ball valve\" or \"TX-199\"). " +
      'Returns up to 5 matching items, each with sku, name, variant (a size such as "3/4", or null), unit, sell price and which suppliers show stock. ' +
      'Call it before naming any sku in a draft. If more than one variant comes back and the owner did not say which, ask one short question before drafting. ' +
      'Does not add anything to a quote, does not contact a supplier and does not reveal supplier cost or margin.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', pattern: '\\S', description: 'What the owner said: a product name, brand, size or SKU.' },
      },
    },
  },
  {
    name: 'get_board',
    execution_mode: 'interactive',
    timeout_seconds: 10,
    description:
      "Read what is on the owner's screen right now: the open drafts (lines, quantities, totals, status and any refused lines so far), " +
      'the open leads (the only customers you may quote) and the last 5 heard turns with their ids and exact text. ' +
      "Use it to find a draft id or to re-read the owner's exact words before citing them. Does not change anything.",
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'draft_quote',
    execution_mode: 'hold',
    timeout_seconds: 20,
    description:
      'Create a draft customer quote for an existing lead from what the owner said. ' +
      'customer is the lead\'s name as heard (for example "Priya Shah"). ' +
      'Each line is { sku, qty, heard, detail_heard? }: sku from search_catalog; qty the quantity said; heard the owner\'s exact words from one turn that name the item and its quantity, ' +
      'copied word for word (for example "two Brasswick ball valves"); detail_heard, when you had to ask which size, the words of the owner\'s answer (for example "Three-quarter"). ' +
      'labor_hours with labor_heard, the exact words that gave the hours (for example "Call it six hours labor"). ' +
      'The system prices every line from the price list and returns the draft with its total, plus any refused line with the reason and how to fix it; read the total back in one sentence. ' +
      'Does not send the quote, does not set or change any price, discount or total (any such field is refused), does not book an install date and does not create a customer. ' +
      'A line whose heard words are not in any heard turn, or whose qty is not in those words, is refused.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['customer', 'lines', 'labor_hours', 'labor_heard'],
      properties: {
        customer: { type: 'string', pattern: '\\S', description: 'The lead\'s name as heard, for example "Priya Shah".' },
        lines: { type: 'array', items: LINE, description: 'One entry per item.' },
        labor_hours: { type: 'number', minimum: 0, description: 'Hours of labor the owner said; 0 when none was said.' },
        labor_heard: {
          type: 'string',
          description: 'The owner\'s exact words that gave the hours, for example "Call it six hours labor"; an empty string when labor_hours is 0.',
        },
        note: { type: 'string', description: 'Optional short note for the owner.' },
      },
    },
  },
  {
    name: 'revise_quote',
    execution_mode: 'hold',
    timeout_seconds: 20,
    description:
      'Change an unsent draft quote when the owner corrects it. changes is a list of { op, sku, qty?, heard, detail_heard? }: ' +
      'op "set_qty" changes a line\'s quantity (qty required), "add" adds a new item (qty required), "remove" drops a line. ' +
      'heard is the owner\'s exact words from one turn asking for that change and naming the item (for example "make that thirty feet of PEX"). ' +
      'Each change is recorded as a revision with before, after and the words that asked for it, and the total is recomputed. ' +
      'Does not send, cannot touch a sent or discarded draft and cannot change prices; the same exact-words rules as draft_quote apply.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['draft_id', 'changes'],
      properties: {
        draft_id: { type: 'string', pattern: '\\S', description: 'The draft quote id, for example "Q-1001".' },
        changes: {
          type: 'array',
          description: 'The corrections, in the order the owner gave them.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'sku', 'heard'],
            properties: {
              op: { type: 'string', enum: ['set_qty', 'add', 'remove'] },
              sku: SKU,
              qty: QTY,
              heard: HEARD,
              detail_heard: DETAIL_HEARD,
            },
          },
        },
      },
    },
  },
  {
    name: 'draft_supplier_request',
    execution_mode: 'hold',
    timeout_seconds: 20,
    description:
      'Draft a stock-and-price check to one supplier (for example "Northgate") for items on the price list. ' +
      'lines are { sku, qty, heard, detail_heard? } with the same exact-words rules as draft_quote. ' +
      'needed_by is when the owner needs the items, kept as the words heard (for example "Thursday"), with needed_by_heard the exact words it came from (for example "for Thursday"). ' +
      'Does not send the request, does not place an order and does not commit any spend.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['supplier', 'lines'],
      properties: {
        supplier: { type: 'string', pattern: '\\S', description: 'The supplier\'s name as heard, for example "Northgate".' },
        lines: { type: 'array', items: LINE, description: 'One entry per item to check.' },
        needed_by: { type: 'string', pattern: '\\S', description: 'When the items are needed, in the owner\'s words.' },
        needed_by_heard: { type: 'string', pattern: '\\S', description: 'The owner\'s exact words that said when.' },
      },
    },
  },
].map((tool) => ({ ...tool, description: `${tool.description} ${SHARED_CLAUSE}` }));

const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);

// Evidence fields are required of the agent; an owner typing into the UI has nothing to cite.
const EVIDENCE_FIELDS = new Set(['heard', 'labor_heard']);
function relaxEvidence(schema) {
  const out = { ...schema };
  if (out.required) out.required = out.required.filter((k) => !EVIDENCE_FIELDS.has(k));
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, relaxEvidence(v)]));
  }
  if (out.items) out.items = relaxEvidence(out.items);
  return out;
}

// The Voice Agent API's flat tool form, sent in session.update.
function voiceAgentTools() {
  return AGENT_TOOLS.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    execution_mode: t.execution_mode,
    timeout_seconds: t.timeout_seconds,
  }));
}

// What GET /api/tools lists: the same five, nothing else.
function listTools() {
  return voiceAgentTools().map(({ type: _type, ...rest }) => rest);
}

module.exports = { AGENT_TOOLS, AGENT_TOOL_NAMES, SHARED_CLAUSE, relaxEvidence, voiceAgentTools, listTools };
