'use strict';

// Routes as plain functions returning { status, body }. The local Express server and the static
// demo's bundle call these same functions, so both run the same gate.

const { listTools } = require('./tools');
const { publicItem } = require('./catalog');

// Over HTTP only the UI's two identities exist. "voice" is asserted only in-process by the
// bridge that holds the voice session, never by a request.
const HTTP_ACTORS = ['agent', 'owner'];

function createApi({ store, invoke }) {
  function getState() {
    const s = store.snapshot();
    return {
      status: 200,
      body: {
        business: s.business,
        suppliers: s.suppliers,
        catalog: s.catalog.map((item) => publicItem(item, s.business, s.suppliers)),
        leads: s.leads,
        turns: s.turns,
        drafts: s.drafts,
        outbox: s.outbox,
      },
    };
  }

  function getActivityLog() {
    return { status: 200, body: store.activityLog() };
  }

  function getTools() {
    return { status: 200, body: listTools() };
  }

  function postInvoke(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: 'The request body must be a JSON object: { tool, args, actor }.' } };
    }
    const { tool, args, actor } = body;
    if (typeof tool !== 'string' || tool === '') return { status: 400, body: { error: 'tool is required.' } };
    if (actor === undefined || actor === null || actor === '') {
      return { status: 400, body: { error: 'actor is required ("agent" or "owner"). There is no default identity.' } };
    }
    if (!HTTP_ACTORS.includes(actor)) {
      return { status: 400, body: { error: `actor must be "agent" or "owner"; ${JSON.stringify(actor)} cannot be asserted over HTTP.` } };
    }
    const extra = Object.keys(body).filter((k) => !['tool', 'args', 'actor'].includes(k));
    if (extra.length) return { status: 400, body: { error: `Unexpected field(s): ${extra.join(', ')}. The body is { tool, args, actor }.` } };
    return { status: 200, body: invoke(tool, args, actor, { cause: { source: 'http' } }) };
  }

  return { getState, getActivityLog, getTools, postInvoke };
}

module.exports = { createApi, HTTP_ACTORS };
