// Tailgate Quote dashboard. One page, two backends with the same routes and events:
//
//   - the local server (npm start): fetch() for GET /api/state, /api/voice, /api/tools and
//     POST /api/invoke, /api/voice/start, /api/voice/stop; EventSource on /api/events;
//   - the static demo's bundle (window.TailgateStatic, injected by the Pages build): the same
//     api.js, invoke.js and session hub running in this page, answering the same paths.
//
// Every button below that changes anything posts { tool, args, actor } to api/invoke: the
// owner's buttons with actor "owner", the "Try it as the agent" buttons with actor "agent". The
// voice agent's own tool calls reach the same invoke() through the session bridge, as "agent".
// There is no other path to a change.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '');
  const seconds = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const mmss = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  const params = new URLSearchParams(window.location.search);

  // ---- backends ------------------------------------------------------------------------------

  const EVENT_TYPES = [
    'activity',
    'voice.start',
    'voice.wire',
    'voice.partial',
    'voice.agentDelta',
    'voice.agent',
    'voice.result',
    'voice.waiting',
    'voice.ready',
    'voice.ended',
    'voice.error',
    'voice.audio',
    'voice.progress',
    'voice.close',
  ];

  function serverBackend() {
    const listeners = new Set();
    let source = null;
    const emit = (event) => {
      for (const fn of listeners) fn(event);
    };
    function connect() {
      source = new EventSource('api/events');
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (e) => {
          let data;
          try {
            data = JSON.parse(e.data);
          } catch {
            return;
          }
          emit({ type, data });
        });
      }
      source.addEventListener('open', () => emit({ type: 'connection.open', data: {} }));
      source.addEventListener('error', () => emit({ type: 'connection.error', data: {} }));
    }
    async function call(method, path, body) {
      const init = { method, headers: {} };
      if (method === 'POST') {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body === undefined ? {} : body);
      }
      const res = await fetch(path, init);
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = { error: `HTTP ${res.status}` };
      }
      return { status: res.status, body: json };
    }
    return {
      kind: 'server',
      get: (path) => call('GET', path),
      post: (path, body) => call('POST', path, body),
      on(fn) {
        listeners.add(fn);
        if (!source) connect();
        return () => listeners.delete(fn);
      },
      postAudio(buffer) {
        return fetch('api/audio', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer });
      },
    };
  }

  const backend = window.TailgateStatic ? window.TailgateStatic.createBackend() : serverBackend();
  const isStatic = backend.kind === 'static';

  // ---- page state ----------------------------------------------------------------------------

  // ?layout=tailgate: the board beside a phone-width column holding the drafts and the owner's
  // Approve & send, as the owner would see it at the van.
  if (params.get('layout') === 'tailgate') document.body.classList.add('layout-tailgate');

  const ui = {
    state: null,
    voice: null,
    log: new Map(),
    transcript: [],
    agentSeq: 0,
    openAgent: null,
    wire: [],
    session: { active: false, mode: null, synthetic: false, speed: 1, ready: false, sessionId: null, model: null, ms: 0, durationMs: 0, index: 0, total: 0, ended: false },
    selectedMode: 'replay',
    editing: {},
    rejecting: {},
    hand: { lines: [], results: [] },
    tries: [],
    notice: null,
    playing: false,
    speed: Number(params.get('speed')) || 1,
    playStartedAt: 0,
    mic: null,
    player: null,
    busy: false,
  };

  // ---- rendering helpers ---------------------------------------------------------------------

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  // Keyed list update: an item's element is replaced only when its signature changes, so a
  // replay event does not rebuild a card the owner is editing, and focus survives a rebuild.
  function patch(container, items) {
    const existing = new Map();
    for (const el of Array.from(container.children)) existing.set(el.dataset.key, el);
    const active = document.activeElement;
    const focusId = active && container.contains(active) ? active.id : null;
    const caret = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const stale = [];
    let prev = null;
    for (const item of items) {
      let el = existing.get(item.key);
      if (el && el.dataset.sig === item.sig) {
        existing.delete(item.key);
      } else {
        if (el) {
          stale.push(el);
          existing.delete(item.key);
        }
        const tpl = document.createElement('template');
        tpl.innerHTML = item.html.trim();
        el = tpl.content.firstElementChild;
        el.dataset.key = item.key;
        el.dataset.sig = item.sig;
      }
      const want = prev ? prev.nextSibling : container.firstChild;
      if (el !== want) container.insertBefore(el, want);
      prev = el;
    }
    for (const el of stale) el.remove();
    for (const el of existing.values()) el.remove();
    if (focusId && document.activeElement !== document.getElementById(focusId)) {
      const again = document.getElementById(focusId);
      if (again) {
        again.focus();
        if (caret && typeof again.setSelectionRange === 'function') again.setSelectionRange(caret[0], caret[1]);
      }
    }
  }

  const ownerName = () => (ui.state ? ui.state.business.owner.split(' ')[0] : 'the owner');
  // While a replay plays, the owner's commit buttons wait: the recording goes on to change the
  // drafts, and a tap mid-tape would leave the board contradicting the agent's recorded words.
  const replayRunning = () => ui.session.active && ui.session.mode === 'replay';
  const turnById = (id) => (ui.state ? ui.state.turns.find((t) => t.id === id) : null);

  // Where the cited words sit in the turn they came from, tolerant of punctuation and case.
  function findSpan(text, words) {
    const parts = String(words || '')
      .split(/[^A-Za-z0-9/]+/)
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
    if (!text || parts.length === 0) return null;
    const m = new RegExp(parts.join('[^A-Za-z0-9/]+'), 'i').exec(text);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  }

  function excerpt(text, span, radius = 44) {
    if (!span) return esc(trunc(text, radius * 2 + 20));
    let a = Math.max(0, span.start - radius);
    let b = Math.min(text.length, span.end + radius);
    if (a > 0) a = text.indexOf(' ', a) + 1 || a;
    if (b < text.length) b = text.lastIndexOf(' ', b) > span.end ? text.lastIndexOf(' ', b) : b;
    return `${a > 0 ? '…' : ''}${esc(text.slice(a, span.start))}<mark>${esc(text.slice(span.start, span.end))}</mark>${esc(text.slice(span.end, b))}${b < text.length ? '…' : ''}`;
  }

  // The receipt for one cited phrase: the words, highlighted inside the turn they came from.
  function receipt(label, heard, turnId) {
    if (!heard) return `<p class="receipt hand"><span class="src">${esc(label)}:</span> entered by hand by the owner</p>`;
    const turn = turnById(turnId);
    const body = turn ? excerpt(turn.text, findSpan(turn.text, heard)) : `“${esc(heard)}”`;
    return `<p class="receipt"><span class="src">${esc(label)}, heard in ${esc(turnId)}:</span> ${body}</p>`;
  }

  // ---- transcript ----------------------------------------------------------------------------

  function upsertUser(itemId, patchFields) {
    const key = `u:${itemId}`;
    let item = ui.transcript.find((t) => t.key === key);
    if (!item) {
      item = { key, kind: 'user', text: '', final: false, turnId: null, spoken: false };
      ui.transcript.push(item);
    }
    Object.assign(item, patchFields);
  }

  // A partial that came without an item_id is kept as "pending"; the finished turn takes its
  // place instead of leaving a grey row behind.
  const PENDING = 'pending';
  function finalizeUser(itemId, fields) {
    if (!ui.transcript.some((t) => t.key === `u:${itemId}`)) {
      const pending = ui.transcript.find((t) => t.key === `u:${PENDING}` && !t.final);
      if (pending) pending.key = `u:${itemId}`;
    }
    upsertUser(itemId, { ...fields, final: true });
  }

  function agentDelta(delta) {
    if (!ui.openAgent) {
      ui.agentSeq += 1;
      ui.openAgent = { key: `a:${ui.agentSeq}`, kind: 'agent', text: '', final: false, interrupted: false };
      ui.transcript.push(ui.openAgent);
    }
    const t = ui.openAgent.text;
    ui.openAgent.text = t && !/\s$/.test(t) && !/^[\s,.;:!?]/.test(delta) ? `${t} ${delta}` : t + delta;
  }

  function agentFinal(text, interrupted) {
    if (!ui.openAgent) agentDelta('');
    Object.assign(ui.openAgent, { text, final: true, interrupted: Boolean(interrupted) });
    ui.openAgent = null;
  }

  function transcriptFromState() {
    if (!ui.state) return;
    for (const t of ui.state.turns) {
      if (!ui.transcript.some((i) => i.key === `u:${t.itemId}` && i.final)) {
        finalizeUser(t.itemId, { text: t.text, turnId: t.id, spoken: t.spokenApproval });
      }
    }
  }

  // Who spoke the agent's lines: AssemblyAI's voice in a live or recorded session; nobody in
  // the scripted sample, which says so.
  const agentLabel = () => (ui.session.synthetic ? 'Agent (scripted sample)' : 'Agent (AssemblyAI voice)');

  function renderTranscript() {
    const items = ui.transcript.map((t) => {
      const cls = ['turn', t.kind, t.final ? 'final' : 'partial', t.spoken ? 'spoken' : ''].join(' ');
      const who =
        t.kind === 'agent'
          ? `<span>${esc(agentLabel())}</span>${t.final ? '' : '<span>speaking…</span>'}`
          : `<span>${t.final ? 'Heard' : 'Hearing… (partial)'}</span><span>${esc(t.turnId || '')}</span>`;
      const flag = t.spoken
        ? `<p class="flag">Heard as a request to send. Not accepted: a voice is not a signature, so only ${esc(ownerName())}'s tap sends.</p>`
        : '';
      const cut = t.interrupted ? ' <span class="cut">(interrupted: the owner talked over it)</span>' : '';
      const html = `<li class="${cls}"><div class="who">${who}</div><p>${esc(t.text)}${cut}</p>${flag}</li>`;
      return { key: t.key, sig: html, html };
    });
    patch($('transcript'), items);
    $('transcript-empty').hidden = items.length > 0;
    // On a wide screen the pane scrolls on its own; keep the newest words in view without
    // moving the page. On a phone the page scrolls, and is left where the reader put it.
    const pane = $('transcript-pane');
    if (items.length && pane.scrollHeight > pane.clientHeight && getComputedStyle(pane).overflowY !== 'visible') {
      const below = $('transcript').lastElementChild.getBoundingClientRect().bottom - pane.getBoundingClientRect().bottom + 12;
      if (below > 0) pane.scrollTop += below;
    }
  }

  // ---- wire rail -----------------------------------------------------------------------------

  function wireRow(ms, dir, text, tone) {
    ui.wire.unshift({ key: `w${ui.wire.length}-${ms}-${Math.random().toString(36).slice(2, 7)}`, ms, dir, text, tone });
    if (ui.wire.length > 300) ui.wire.length = 300;
  }

  function wireText(ev) {
    switch (ev.type) {
      case 'session.update':
        return [`session.update: ${ev.tools.length} tools (${ev.tools.join(', ')})`];
      case 'session.ready':
        return [`session.ready ${ev.session_id || ''}${ev.config && ev.config.model ? ` · model ${ev.config.model}` : ''}`, 'good'];
      case 'transcript.user.delta':
        return [`transcript.user.delta “${trunc(ev.text ?? ev.delta ?? '', 48)}”`];
      case 'transcript.user':
        return [`transcript.user “${trunc(ev.text, 48)}”`];
      case 'tool.call':
        return [`tool.call ${ev.name} (${ev.call_id})`];
      case 'tool.result':
        return [`tool.result ${ev.call_id}${ev.is_error ? ': refused by the gate' : ''}`, ev.is_error ? 'bad' : ''];
      case 'reply.done':
        return [`reply.done ${ev.status || ''}`, ev.status === 'interrupted' ? 'bad' : ''];
      case 'reply.audio':
        return [`reply.audio ${ev.bytes} bytes`];
      case 'transcript.agent':
        return [`transcript.agent${ev.interrupted ? ' (interrupted)' : ''}`, ev.interrupted ? 'bad' : ''];
      case 'transcript.agent.delta':
        return [`transcript.agent.delta “${trunc(ev.delta, 40)}”`];
      case 'session.error':
        return [`session.error ${ev.code}: ${ev.message}`, 'bad'];
      case 'conversation.message':
        return [`conversation.message (typed) “${trunc(ev.content, 40)}”`];
      default:
        return [ev.type];
    }
  }

  function renderWire() {
    const items = ui.wire.map((w) => {
      const html = `<li><span class="t">${esc(seconds(w.ms))}</span><span aria-label="${w.dir === 'out' ? 'sent' : 'received'}">${w.dir === 'out' ? '→' : '←'}</span><span class="${esc(w.tone || '')}">${esc(w.text)}</span></li>`;
      return { key: w.key, sig: html, html };
    });
    patch($('wire'), items);
  }

  // ---- activity log --------------------------------------------------------------------------

  const ACTORS = { agent: ['agent', 'Agent'], owner: ['owner', 'Owner · human'], voice: ['voice', 'Heard'] };

  function summarize(e) {
    const r = e.result || {};
    if (e.outcome === 'refused') return `<span class="out">Refused.</span> ${esc(e.tool)}: ${esc(e.error)}`;
    if (e.outcome === 'error') return `<span class="out">Failed.</span> ${esc(e.tool)}: ${esc(e.error)}`;
    switch (e.tool) {
      case 'record_turn':
        return e.outcome === 'refused_as_approval'
          ? `heard “${esc(e.args.text)}” <span class="out">Refused as approval: a voice is not a signature; only a tap sends.</span>`
          : `heard “${esc(e.args.text)}”`;
      case 'search_catalog':
        return `search_catalog “${esc(e.args.query)}”: ${r.results.length ? esc(r.results.map((x) => x.sku).join(', ')) : 'no match'}`;
      case 'get_board':
        return `get_board: ${r.drafts.length} open draft(s)`;
      case 'draft_quote':
        return `draft_quote: drafted ${esc(r.draft.id)} for ${esc(r.draft.customer.name)}, ${money(r.draft.total)}${r.refused.length ? `; ${r.refused.length} line(s) refused` : ''}`;
      case 'revise_quote': {
        const changes = r.revisions.map((v) => (v.op === 'add' ? `added ${v.sku} ×${v.to}` : v.op === 'remove' ? `removed ${v.sku}` : `${v.sku} ${v.from}→${v.to}`));
        return `revise_quote: ${esc(r.draft.id)} ${esc(changes.join('; '))}, now ${money(r.draft.total)}`;
      }
      case 'draft_supplier_request':
        return `draft_supplier_request: drafted ${esc(r.draft.id)} to ${esc(r.draft.supplier.name)}${r.draft.neededBy ? `, needed by “${esc(r.draft.neededBy)}”` : ''}`;
      case 'send_quote':
      case 'send_supplier_request':
        return `${esc(e.tool)}: sent ${esc(r.draft.id)} to ${esc(r.outbox.to)}`;
      case 'discard_draft':
        return `discard_draft: rejected ${esc(r.draft.id)} (“${esc(r.draft.discardReason)}”)`;
      default:
        return esc(e.tool);
    }
  }

  function via(cause) {
    if (!cause) return '';
    if (cause.source === 'tool.call') return ` · via tool.call ${cause.call_id || ''}`;
    if (cause.source === 'http') return ' · from this page';
    if (cause.source === 'transcript.user') return ' · from transcript.user';
    return ` · ${cause.source}`;
  }

  function renderLog() {
    const entries = Array.from(ui.log.values()).sort((a, b) => b.seq - a.seq);
    const items = entries.map((e) => {
      const [cls, label] = ACTORS[e.actor] || ['none', 'No actor'];
      const refused = e.outcome === 'refused' || e.outcome === 'refused_as_approval' || e.outcome === 'error';
      const html = `<li class="entry${refused ? ' refused' : ''}"><span class="badge ${cls}">${esc(label)}</span><span class="what">${summarize(e)}</span><span class="when">#${e.seq} · ${esc(clock(e.at))}${esc(via(e.cause))}</span></li>`;
      return { key: String(e.seq), sig: html, html };
    });
    patch($('log'), items);
    $('log-empty').hidden = items.length > 0;
  }

  // ---- drafts --------------------------------------------------------------------------------

  const variantName = (l) => (l.variant ? `${l.name}, ${l.variant}-inch` : l.name);

  function quoteLines(d, editing) {
    return d.lines
      .map((l) => {
        const qtyCell = editing
          ? `<label class="sr-only" for="qty-${esc(d.id)}-${esc(l.sku)}">Quantity of ${esc(variantName(l))}</label><input class="qty-input" type="number" min="0" step="1" inputmode="numeric" id="qty-${esc(d.id)}-${esc(l.sku)}" data-draft="${esc(d.id)}" data-sku="${esc(l.sku)}" value="${esc(editing[l.sku] !== undefined ? editing[l.sku] : l.qty)}"> <span class="qty">${esc(l.unit)} × ${money(l.unitPrice)}</span>`
          : `<span class="qty">${esc(l.qty)} ${esc(l.unit)} × ${money(l.unitPrice)}</span>`;
        const detail = l.detailHeard ? receipt('size', l.detailHeard, l.detailTurnId) : '';
        return `<li class="line"><span class="name">${esc(variantName(l))}</span><span class="amount">${money(l.lineTotal)}</span><span>${qtyCell}</span><span></span>${receipt('line', l.heard, l.turnId)}${detail}</li>`;
      })
      .join('');
  }

  function supplierLines(d) {
    return d.lines
      .map((l) => {
        const detail = l.detailHeard ? receipt('size', l.detailHeard, l.detailTurnId) : '';
        return `<li class="line"><span class="name">${esc(variantName(l))}</span><span class="amount">${esc(l.qty)} ${esc(l.unit)}</span>${receipt('line', l.heard, l.turnId)}${detail}</li>`;
      })
      .join('');
  }

  function revisionsList(d) {
    if (!d.revisions.length) return '';
    const rows = d.revisions.map((v) => {
      const who = v.by === 'agent' ? 'agent' : 'owner';
      const asked = v.heard ? `, asked “${esc(v.heard)}” (${esc(v.turnId)})` : ', edited by hand';
      if (v.op === 'add') return `<li>${esc(v.sku)} <ins>added ×${esc(v.to)}</ins>${asked} · ${who}</li>`;
      if (v.op === 'remove') return `<li>${esc(v.sku)} <del>removed</del>${asked} · ${who}</li>`;
      return `<li>${esc(v.sku)} <del>${esc(v.from)}</del> → <ins>${esc(v.to)}</ins>${asked} · ${who}</li>`;
    });
    return `<p class="meta sub">Revisions</p><ul class="revisions">${rows.join('')}</ul>`;
  }

  function refusalsList(d) {
    if (!d.refusals.length) return '';
    const rows = d.refusals.slice(-4).map((r) => `<li>${esc(r.sku || r.field || 'line')}: ${esc(r.reason)}</li>`);
    return `<p class="meta sub">Refused by the gate (not on the draft)</p><ul class="refusals">${rows.join('')}</ul>`;
  }

  function customerCopy(d) {
    const out = ui.state.outbox.find((o) => o.draftId === d.id && o.copy);
    if (!out) return '';
    const c = out.copy;
    const rows = c.lines
      .map((l) => `<tr><td>${esc(l.description)}</td><td class="num">${esc(l.qty)} ${esc(l.unit)}</td><td class="num">${money(l.unitPrice)}</td><td class="num">${money(l.lineTotal)}</td></tr>`)
      .join('');
    const labor = c.labor ? `<tr><td>Labor</td><td class="num">${esc(c.labor.hours)} h</td><td class="num">${money(c.labor.rate)}</td><td class="num">${money(c.labor.amount)}</td></tr>` : '';
    return `<section class="copy" aria-label="The customer's copy of quote ${esc(d.id)}">
      <h4>${esc(c.from.name)} · Quote ${esc(c.quote)}</h4>
      <p class="small">${esc(c.from.address)} · ${esc(c.from.phone)} · ${esc(c.from.email)}</p>
      <p class="small">For ${esc(c.to.name)}, ${esc(c.to.site)} · ${esc(c.to.email)} · ${esc(c.to.phone)} · ${esc(clock(c.date))}</p>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>${rows}${labor}</tbody></table>
      <div class="total"><span>Total</span><span>${money(c.total)}</span></div>
      <p class="small">${esc(c.taxNote)}. The customer's copy, as written to the in-app outbox; nothing leaves this demo.</p>
    </section>`;
  }

  function spokenNote(d) {
    if (d.status !== 'draft' || !d.spokenApprovalsRefused.length) return '';
    const turn = turnById(d.spokenApprovalsRefused[d.spokenApprovalsRefused.length - 1]);
    return `<p class="spoken-note"><strong>Heard: “${esc(turn ? turn.text : '')}”</strong> Not accepted. Only ${esc(ownerName())}'s tap sends.</p>`;
  }

  function cardHtml(d) {
    const isQuote = d.kind === 'customer_quote';
    const title = isQuote ? `Quote ${d.id} · ${d.customer.name}` : `Stock check ${d.id} · ${d.supplier.name}`;
    const pill =
      d.status === 'draft'
        ? '<span class="pill draft">Draft · not sent</span>'
        : d.status === 'sent'
          ? `<span class="pill sent">Sent by the owner · ${esc(clock(d.sentAt))}</span>`
          : '<span class="pill discarded">Rejected by the owner</span>';
    const who = d.createdBy === 'agent' ? 'the agent' : 'the owner';
    const meta = isQuote
      ? `${esc(d.customer.site)} · ${esc(d.customer.email)} · drafted by ${who} at ${esc(clock(d.createdAt))}`
      : `${esc(d.supplier.email)} · drafted by ${who} at ${esc(clock(d.createdAt))}`;
    const editing = d.status === 'draft' ? ui.editing[d.id] : null;
    let body;
    if (isQuote) {
      const labor = d.labor
        ? `<li class="line"><span class="name">Labor</span><span class="amount">${money(d.labor.amount)}</span><span class="qty">${esc(d.labor.hours)} h × ${money(d.labor.rate)}</span><span></span>${receipt('labor', d.labor.heard, d.labor.turnId)}</li>`
        : '';
      body = `<ol class="lines">${quoteLines(d, editing)}${labor}</ol><div class="total"><span>Total (tax calculated at invoicing)</span><span>${money(d.total)}</span></div>`;
    } else {
      const needed = d.neededBy ? `<p class="meta sub">Needed by “${esc(d.neededBy)}”</p>${receipt('needed by', d.neededByHeard, d.neededByTurnId)}` : '';
      body = `<ol class="lines">${supplierLines(d)}</ol>${needed}`;
    }
    let actions = '';
    if (d.status === 'draft' && replayRunning()) {
      // A tap now would split the board from the recording, which goes on to change this draft.
      const how = isStatic ? 'press Skip to end, or let it finish' : 'let it finish, or press Stop';
      actions = `<div class="actions">
          <button type="button" class="btn send" disabled aria-describedby="gate-${esc(d.id)}">Approve &amp; send</button>
          ${isQuote ? '<button type="button" class="btn" disabled>Edit</button>' : ''}
          <button type="button" class="btn danger" disabled>Reject</button>
        </div>
        <p class="gate-note" id="gate-${esc(d.id)}">The recorded session is still playing and may change this draft; ${how}, then decide. Only ${esc(ownerName())}'s tap sends.</p>`;
    } else if (d.status === 'draft') {
      const called = d.spokenApprovalsRefused.length ? ' called' : '';
      const reject = ui.rejecting[d.id];
      if (editing) {
        actions = `<div class="actions"><button type="button" class="btn send" data-act="save" data-id="${esc(d.id)}">Save changes</button><button type="button" class="btn" data-act="cancel-edit" data-id="${esc(d.id)}">Cancel</button><span class="hint">Set a quantity to 0 to remove the line. Prices come from the price list.</span></div>`;
      } else if (reject !== undefined) {
        actions = `<div class="reason"><label for="reason-${esc(d.id)}">Why reject ${esc(d.id)}?</label><input id="reason-${esc(d.id)}" data-reason="${esc(d.id)}" value="${esc(reject)}" autocomplete="off"><button type="button" class="btn danger" data-act="confirm-reject" data-id="${esc(d.id)}">Reject draft</button><button type="button" class="btn" data-act="cancel-reject" data-id="${esc(d.id)}">Cancel</button></div>`;
      } else {
        actions = `<div class="actions">
          <button type="button" class="btn send${called}" data-act="send" data-id="${esc(d.id)}" data-kind="${esc(d.kind)}" aria-describedby="gate-${esc(d.id)}">Approve &amp; send</button>
          ${isQuote ? `<button type="button" class="btn" data-act="edit" data-id="${esc(d.id)}">Edit</button>` : ''}
          <button type="button" class="btn danger" data-act="reject" data-id="${esc(d.id)}">Reject</button>
        </div>
        <p class="gate-note" id="gate-${esc(d.id)}">Only this tap sends. ${isQuote ? 'send_quote' : 'send_supplier_request'} is owner-only and is not one of the agent's tools.</p>`;
      }
    } else if (d.status === 'discarded') {
      actions = `<p class="meta sub">Rejected at ${esc(clock(d.discardedAt))}: “${esc(d.discardReason)}”</p>`;
    }
    return `<article class="card status-${esc(d.status)}" aria-labelledby="title-${esc(d.id)}">
      <header><h3 id="title-${esc(d.id)}">${esc(title)}</h3>${pill}</header>
      <p class="meta">${meta}</p>
      ${body}
      ${revisionsList(d)}
      ${refusalsList(d)}
      ${spokenNote(d)}
      ${actions}
      ${d.status === 'sent' && isQuote ? customerCopy(d) : ''}
    </article>`;
  }

  function renderDrafts() {
    const s = ui.state;
    if (!s) return;
    const tailgate = document.body.classList.contains('layout-tailgate');
    $('h-drafts').textContent = tailgate ? `${ownerName()}'s phone · drafts waiting for his tap` : `Drafts waiting for ${ownerName()}`;
    const order = { draft: 0, sent: 1, discarded: 2 };
    const drafts = s.drafts.slice().sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
    const turnsSig = s.turns.map((t) => t.id).join(',');
    patch(
      $('cards'),
      drafts.map((d) => {
        const sig = JSON.stringify([d, turnsSig, Boolean(ui.editing[d.id]), ui.rejecting[d.id] !== undefined, s.outbox.length, replayRunning()]);
        return { key: d.id, sig, html: cardHtml(d) };
      }),
    );
    $('cards-empty').hidden = drafts.length > 0;
    const replay = replayMode();
    const hero = $('hero-play');
    hero.hidden = drafts.length > 0 || ui.session.active || !replay || ui.selectedMode !== 'replay';
    hero.disabled = ui.busy;
    if (replay) hero.textContent = replay.synthetic ? '▶ Play the scripted sample' : '▶ Play the recorded AssemblyAI session';
    const leads = s.leads.map((l) => {
      const html = `<li>${esc(l.name)} · ${esc(l.site)}</li>`;
      return { key: l.id, sig: html, html };
    });
    patch($('leads'), leads);
    const n = ui.notice;
    $('notice').innerHTML = n ? `<p class="notice ${esc(n.tone)}">${esc(n.text)}</p>` : '';
  }

  function renderBanner() {
    const s = ui.state;
    const banner = $('banner');
    const turn = s ? s.turns.filter((t) => t.spokenApproval).pop() : null;
    if (!turn) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    // What the spoken request did, frozen at the moment it was heard (it changed nothing), then
    // what the owner's taps did afterwards, said separately.
    const named = s.drafts.filter((d) => d.spokenApprovalsRefused.includes(turn.id));
    const stayed = named.length ? ` ${named.map((d) => d.id).join(' and ')} stayed ${named.length > 1 ? 'drafts' : 'a draft'}.` : '';
    const later = named
      .filter((d) => d.status !== 'draft')
      .map((d) => `${d.id} was ${d.status === 'sent' ? 'sent' : 'rejected'} later, by ${ownerName()}'s tap.`)
      .join(' ');
    const html = `<p><strong>Heard: “${esc(turn.text)}” Not accepted.</strong> A voice is not a signature: the agent cannot tell who is speaking, so only ${esc(ownerName())}'s tap sends. Logged as refused as approval; the spoken request changed nothing.${esc(stayed)}${later ? ` ${esc(later)}` : ''}</p>`;
    if (banner.dataset.sig !== html) {
      banner.dataset.sig = html;
      banner.innerHTML = html;
    }
    banner.hidden = false;
  }

  // ---- header: mode switch and session controls -----------------------------------------------

  function modes() {
    return ui.voice ? ui.voice.modes : [];
  }

  function replayMode() {
    return modes().find((m) => m.mode === 'replay') || null;
  }

  function renderHeader() {
    const s = ui.session;
    const replay = replayMode();
    const liveOffered = modes().some((m) => m.mode === 'live');
    const labelEl = $('session-label');
    let label;
    if (s.active && s.mode === 'live') label = '<span class="tag live">Live</span>Live AssemblyAI Voice Agent session';
    else if (replay) label = `<span class="tag ${replay.synthetic ? 'sample' : 'recorded'}">${replay.synthetic ? 'Sample' : 'Replay'}</span>${esc(replay.label)}`;
    else label = 'No voice session is configured on this server.';
    if (isStatic) label += ' · replayed in your browser through the real approval gate; no API key, no network';
    if (labelEl.dataset.sig !== label) {
      labelEl.dataset.sig = label;
      labelEl.innerHTML = label;
    }

    $('replay-name').textContent = replay && replay.synthetic ? 'Replay the scripted sample' : 'Replay recorded session';
    for (const input of document.querySelectorAll('input[name="mode"]')) {
      const offered = input.value === 'live' ? liveOffered : Boolean(replay);
      input.disabled = !offered || s.active;
      input.checked = input.value === ui.selectedMode;
    }

    const primary = $('primary');
    const live = ui.selectedMode === 'live';
    if (s.active && s.mode === 'live') primary.textContent = 'Stop talking';
    else if (s.active && isStatic) primary.textContent = ui.playing ? 'Pause' : 'Resume';
    else if (s.active) primary.textContent = 'Stop';
    else if (live) primary.textContent = 'Start talking';
    else if (replay) primary.textContent = s.ended ? 'Replay again' : replay.synthetic ? 'Play the scripted sample' : 'Play the recorded session';
    else primary.textContent = 'Play';
    primary.disabled = ui.busy || (!s.active && (live ? !liveOffered : !replay));

    $('speed-wrap').hidden = !isStatic;
    $('skip').hidden = !isStatic;
    $('skip').disabled = !(isStatic && s.active && s.mode === 'replay');
    $('speed').value = String(ui.speed);

    const progress = $('progress');
    const showProgress = (s.active || s.ended) && s.mode === 'replay' && s.durationMs > 0;
    progress.hidden = !showProgress;
    if (showProgress) progress.value = Math.min(1, s.ms / s.durationMs);

    // The state words go to a polite live region; the running clock does not, so a screen
    // reader is not read the time every second.
    let status = '';
    if (s.active && s.mode === 'replay') status = ui.playing || !isStatic ? 'Replaying' : 'Paused';
    else if (s.active && s.mode === 'live') status = s.ready ? (ui.mic ? 'Listening: talk through the job' : 'Connected; starting the microphone…') : 'Connecting to AssemblyAI…';
    else if (s.ended) status = `Session ended. Every draft stays a draft until ${ownerName()} taps.`;
    if ($('status').textContent !== status) $('status').textContent = status;
    $('elapsed').textContent = s.active && s.mode === 'replay' ? `${mmss(s.ms)} / ${mmss(s.durationMs)}` : '';

    const hints = [];
    if (live) hints.push('The server holds the AssemblyAI session; this page sends microphone audio to it and plays the agent back. Headphones help.');
    else if (replay && replay.synthetic) hints.push('This sample is scripted and labelled as such: its agent lines were not generated by AssemblyAI, and it has no recorded voice.');
    else if (replay) {
      hints.push("The agent's tool calls in this recording run again, live, through the real gate.");
      hints.push(replay.audio ? "Sound on: the agent's voice is the session's own recorded audio (at 1× speed)." : 'This replay is silent: the build has no recording of the agent\'s voice.');
    }
    if (replay || live) hints.push('Starting a session clears the board to the seeded leads.');
    if (!liveOffered) {
      hints.push(
        isStatic
          ? 'Live mic runs on the local server with your own AssemblyAI key (npm start); a static page never holds a key.'
          : 'Live mic needs ASSEMBLYAI_API_KEY in .env; restart npm start to offer it.',
      );
    }
    $('mode-hint').textContent = hints.join(' ');
    renderAai();
  }

  // What AssemblyAI does in this app, and the session it is doing it in.
  function renderAai() {
    const s = ui.session;
    const replay = replayMode();
    const synthetic = s.active || s.ended ? s.synthetic : Boolean(replay && replay.synthetic && ui.selectedMode === 'replay');
    let session = '';
    if (synthetic) session = 'This scripted sample imitates those events; Live mic and a recorded session use the real API.';
    else if (s.sessionId) session = `Session ${s.sessionId}${s.model ? ` · model ${s.model}` : ''}.`;
    const text = `AssemblyAI Voice Agent API: streaming speech-to-text with live partials, turn detection, keyterms from the price list, JSON-schema tool calls and the agent's voice, in one WebSocket session. ${session}`;
    if ($('aai').textContent !== text) $('aai').textContent = text;
  }

  // ---- agent panel -----------------------------------------------------------------------------

  function latest(kind) {
    const d = ui.state ? ui.state.drafts.filter((x) => x.kind === kind).pop() : null;
    return d ? d.id : kind === 'customer_quote' ? 'Q-1001' : 'S-2001';
  }

  const AGENT_TRIES = [
    { id: 'send', label: () => `send_quote ${latest('customer_quote')}`, call: () => ({ tool: 'send_quote', args: { draft_id: latest('customer_quote') } }) },
    { id: 'send-supplier', label: () => `send_supplier_request ${latest('supplier_request')}`, call: () => ({ tool: 'send_supplier_request', args: { draft_id: latest('supplier_request') } }) },
    { id: 'discard', label: () => `discard_draft ${latest('customer_quote')}`, call: () => ({ tool: 'discard_draft', args: { draft_id: latest('customer_quote'), reason: 'The agent wants it gone' } }) },
    {
      id: 'price',
      label: () => 'draft_quote with a smuggled unit_price',
      call: () => ({
        tool: 'draft_quote',
        args: { customer: 'Daniel Okafor', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan' }], labor_hours: 0, labor_heard: '', unit_price: 1 },
      }),
    },
    {
      id: 'nested',
      label: () => 'draft_quote with lines[0].price',
      call: () => ({
        tool: 'draft_quote',
        args: { customer: 'Daniel Okafor', lines: [{ sku: 'PNR-DP24', qty: 1, heard: 'a Panrite drain pan', price: 1 }], labor_hours: 0, labor_heard: '' },
      }),
    },
    {
      id: 'revise',
      label: () => `revise_quote ${latest('customer_quote')}: “make that forty feet” (never said)`,
      call: () => ({ tool: 'revise_quote', args: { draft_id: latest('customer_quote'), changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 40, heard: 'make that forty feet of PEX' }] } }),
    },
    { id: 'tools', label: () => "List the agent's tools (GET /api/tools)", call: null },
  ];

  function renderAgentButtons() {
    patch(
      $('agent-buttons'),
      AGENT_TRIES.map((t) => {
        const html = `<button type="button" class="btn agent" data-try="${esc(t.id)}">${esc(t.label())}</button>`;
        return { key: t.id, sig: html, html };
      }),
    );
    patch(
      $('tries'),
      ui.tries.map((t) => {
        const html =
          t.kind === 'tools'
            ? `<li class="try listed"><strong>${esc(t.title)}</strong>${esc(t.message)}</li>`
            : `<li class="try ${t.refused ? 'refused' : ''}"><strong>${esc(t.title)}: ${t.refused ? 'refused' : 'allowed'}${t.unchanged ? ' · drafts and outbox unchanged' : ''}</strong>${esc(t.message)}</li>`;
        return { key: t.key, sig: html, html };
      }),
    );
  }

  async function tryAsAgent(id) {
    const t = AGENT_TRIES.find((x) => x.id === id);
    if (!t) return;
    const key = `t${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!t.call) {
      const res = await backend.get('api/tools');
      const names = res.body.map((x) => x.name);
      const missing = ['send_quote', 'send_supplier_request', 'discard_draft'].filter((n) => !names.includes(n));
      ui.tries.unshift({ key, kind: 'tools', title: `${names.length} tools: ${names.join(', ')}`, message: ` Not listed: ${missing.join(', ')} (owner-only, never registered as a tool).` });
    } else {
      const snap = (st) => JSON.stringify([st.drafts, st.outbox]);
      const before = snap((await backend.get('api/state')).body);
      const res = await backend.post('api/invoke', { ...t.call(), actor: 'agent' });
      const after = snap((await backend.get('api/state')).body);
      const refused = res.status !== 200 || !res.body.success;
      ui.tries.unshift({ key, title: t.label(), refused, unchanged: before === after, message: ` ${refused ? res.body.error : 'The gate allowed this call.'}` });
    }
    ui.tries.length = Math.min(ui.tries.length, 8);
    refresh();
  }

  // ---- owner actions ---------------------------------------------------------------------------

  async function ownerInvoke(tool, args, done) {
    const res = await backend.post('api/invoke', { tool, args, actor: 'owner' });
    if (res.status !== 200) ui.notice = { tone: 'refused', text: res.body.error };
    else if (!res.body.success) ui.notice = { tone: 'refused', text: `Refused: ${res.body.error}` };
    else {
      ui.notice = { tone: 'ok', text: done(res.body.result) };
      return true;
    }
    scheduleRender();
    return false;
  }

  async function onCardAction(btn) {
    const id = btn.dataset.id;
    const draft = ui.state.drafts.find((d) => d.id === id);
    if (!draft) return;
    switch (btn.dataset.act) {
      case 'send':
        if (draft.kind === 'customer_quote') await ownerInvoke('send_quote', { draft_id: id }, (r) => `${r.draft.id} sent to ${r.outbox.to}. The customer's copy is below.`);
        else await ownerInvoke('send_supplier_request', { draft_id: id }, (r) => `${r.draft.id} sent to ${r.outbox.to}.`);
        break;
      case 'edit':
        ui.editing[id] = {};
        delete ui.rejecting[id];
        break;
      case 'cancel-edit':
        delete ui.editing[id];
        break;
      case 'save': {
        const values = ui.editing[id] || {};
        const changes = [];
        for (const line of draft.lines) {
          if (values[line.sku] === undefined || String(values[line.sku]).trim() === '') continue;
          const qty = Number(values[line.sku]);
          if (!Number.isInteger(qty) || qty < 0) {
            ui.notice = { tone: 'refused', text: `The quantity for ${line.name} must be a whole number (0 removes the line).` };
            scheduleRender();
            return;
          }
          if (qty === 0) changes.push({ op: 'remove', sku: line.sku });
          else if (qty !== line.qty) changes.push({ op: 'set_qty', sku: line.sku, qty });
        }
        if (changes.length === 0) {
          delete ui.editing[id];
          break;
        }
        if (await ownerInvoke('revise_quote', { draft_id: id, changes }, (r) => `${r.draft.id} revised by hand; total now ${money(r.draft.total)}.`)) delete ui.editing[id];
        break;
      }
      case 'reject':
        ui.rejecting[id] = '';
        delete ui.editing[id];
        break;
      case 'cancel-reject':
        delete ui.rejecting[id];
        break;
      case 'confirm-reject': {
        const reason = String(ui.rejecting[id] || '').trim();
        if (!reason) {
          ui.notice = { tone: 'refused', text: `Say why ${id} is rejected; the reason is logged.` };
          scheduleRender();
          const input = $(`reason-${id}`);
          if (input) input.focus();
          return;
        }
        if (await ownerInvoke('discard_draft', { draft_id: id, reason }, (r) => `${r.draft.id} rejected: “${r.draft.discardReason}”.`)) delete ui.rejecting[id];
        break;
      }
      default:
        return;
    }
    refresh();
  }

  // ---- the owner's own drafting ------------------------------------------------------------
  // The same verbs the agent has, posted as the owner, typed by hand: nothing to cite, so the
  // lines carry "entered by hand" receipts.

  function handTarget() {
    const [kind, id] = String($('hand-for').value || '').split(':');
    if (!ui.state) return null;
    if (kind === 'lead') {
      const lead = ui.state.leads.find((l) => l.id === id);
      return lead ? { kind: 'quote', name: lead.name } : null;
    }
    const supplier = ui.state.suppliers.find((s) => s.id === id);
    return supplier ? { kind: 'stock', name: supplier.name } : null;
  }

  function renderHand() {
    const s = ui.state;
    if (!s) return;
    const select = $('hand-for');
    const options = [...s.leads.map((l) => [`lead:${l.id}`, `Quote for ${l.name}`]), ...s.suppliers.map((x) => [`supplier:${x.id}`, `Stock check to ${x.name}`])];
    const sig = JSON.stringify(options);
    if (select.dataset.sig !== sig) {
      const keep = select.value;
      select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
      if (options.some(([value]) => value === keep)) select.value = keep;
      select.dataset.sig = sig;
    }
    const target = handTarget();
    const quote = !target || target.kind === 'quote';
    $('hand-labor').hidden = !quote;
    $('hand-labor-label').hidden = !quote;
    patch(
      $('hand-results'),
      ui.hand.results.map((r) => {
        const html = `<li><span>${esc(variantName(r))} · ${esc(r.sku)} · ${r.price === null ? 'no stock' : money(r.price)}</span><button type="button" class="btn" data-add="${esc(r.sku)}">Add</button></li>`;
        return { key: r.sku, sig: html, html };
      }),
    );
    patch(
      $('hand-lines'),
      ui.hand.lines.map((l) => {
        const html = `<li><span>${esc(variantName(l))}</span><span><label class="sr-only" for="hand-qty-${esc(l.sku)}">Quantity of ${esc(variantName(l))}</label><input type="number" min="1" step="1" inputmode="numeric" id="hand-qty-${esc(l.sku)}" data-hand-qty="${esc(l.sku)}" value="${esc(l.qty)}"> <button type="button" class="btn" data-drop="${esc(l.sku)}">Remove</button></span></li>`;
        return { key: l.sku, sig: html, html };
      }),
    );
    // A draft typed now would take the id the recording's next draft had.
    const blocked = replayRunning();
    $('hand-create').disabled = blocked || ui.hand.lines.length === 0;
    $('hand-create').title = blocked ? 'Wait for the replay to end: the recording drafts too.' : '';
  }

  async function handSearch() {
    const query = $('hand-search').value.trim();
    if (!query) return;
    const res = await backend.post('api/invoke', { tool: 'search_catalog', args: { query }, actor: 'owner' });
    ui.hand.results = res.status === 200 && res.body.success ? res.body.result.results : [];
    refresh();
  }

  async function handCreate() {
    const target = handTarget();
    if (!target || ui.hand.lines.length === 0 || replayRunning()) return;
    const lines = [];
    for (const l of ui.hand.lines) {
      const qty = Number(l.qty);
      if (!Number.isInteger(qty) || qty < 1) {
        ui.notice = { tone: 'refused', text: `The quantity for ${variantName(l)} must be a whole number of at least 1.` };
        scheduleRender();
        return;
      }
      lines.push({ sku: l.sku, qty });
    }
    const ok =
      target.kind === 'quote'
        ? await ownerInvoke('draft_quote', { customer: target.name, lines, labor_hours: Number($('hand-labor').value) || 0 }, (r) => `${r.draft.id} drafted by hand for ${r.draft.customer.name}, ${money(r.draft.total)}. Still a draft: only Approve & send sends it.`)
        : await ownerInvoke('draft_supplier_request', { supplier: target.name, lines }, (r) => `${r.draft.id} drafted by hand to ${r.draft.supplier.name}. Still a draft: only Approve & send sends it.`);
    if (ok) {
      ui.hand = { lines: [], results: [] };
      $('hand-search').value = '';
      $('hand-labor').value = '0';
    }
    refresh();
  }

  // ---- sessions ------------------------------------------------------------------------------

  let raf = null;
  let lastFrame = null;
  function loop(ts) {
    raf = null;
    if (!ui.playing || !isStatic) {
      lastFrame = null;
      return;
    }
    if (lastFrame !== null) backend.clock.advance(Math.min(250, ts - lastFrame) * ui.speed);
    lastFrame = ts;
    ui.session.ms = backend.clock.now() - ui.playStartedAt;
    scheduleRender();
    raf = window.requestAnimationFrame(loop);
  }
  function play() {
    ui.playing = true;
    if (raf === null) raf = window.requestAnimationFrame(loop);
  }

  function pause() {
    ui.playing = false;
    if (ui.player) ui.player.flush();
  }

  // The player is made on the click that starts a session, so the browser lets it make sound;
  // a page opened with ?autoplay=1 gets sound from the first click anywhere.
  function ensurePlayer() {
    if (!ui.player) ui.player = window.TailgateAudio.createPlayer();
    ui.player.unlock();
  }

  // The agent's voice plays live, and in a replay at 1× (static demo: while it is playing).
  function audible() {
    const s = ui.session;
    if (s.mode === 'live') return true;
    if (s.mode !== 'replay') return false;
    return isStatic ? ui.playing && ui.speed === 1 : s.speed === 1;
  }

  async function startSession(mode) {
    ui.busy = true;
    scheduleRender();
    try {
      if (navigator.userActivation ? navigator.userActivation.isActive : true) ensurePlayer();
      if (isStatic) ui.playStartedAt = backend.clock.now();
      const res = await backend.post('api/voice/start', { mode });
      if (res.status !== 200) {
        ui.notice = { tone: 'refused', text: res.body.error };
        return;
      }
      if (mode === 'live') await startMic();
      if (isStatic && mode === 'replay') play();
    } finally {
      ui.busy = false;
      scheduleRender();
    }
  }

  async function stopSession() {
    stopMic();
    ui.playing = false;
    const res = await backend.post('api/voice/stop', {});
    if (res.status !== 200 && res.status !== 409) ui.notice = { tone: 'refused', text: res.body.error };
    refreshVoice();
  }

  let audioChain = Promise.resolve();
  async function startMic() {
    try {
      ui.mic = await window.TailgateAudio.startMic({
        onFrame: (buffer) => {
          if (!ui.session.ready) return;
          audioChain = audioChain.then(() => backend.postAudio(buffer)).catch(() => {});
        },
      });
    } catch (err) {
      ui.notice = { tone: 'refused', text: `The microphone did not start (${err && err.message}). Nothing is recorded without it.` };
      await backend.post('api/voice/stop', {});
    }
    scheduleRender();
  }

  function stopMic() {
    if (ui.mic) ui.mic.stop();
    ui.mic = null;
    if (ui.player) ui.player.flush();
  }

  function onPrimary() {
    const s = ui.session;
    if (s.active && s.mode === 'replay' && isStatic) {
      if (ui.playing) pause();
      else {
        ensurePlayer();
        play();
      }
      scheduleRender();
      return;
    }
    if (s.active) {
      stopSession();
      return;
    }
    startSession(ui.selectedMode);
  }

  function resetSessionView(data) {
    ui.transcript = [];
    ui.openAgent = null;
    ui.wire = [];
    ui.log.clear();
    ui.editing = {};
    ui.rejecting = {};
    ui.notice = null;
    ui.session = {
      active: true,
      mode: data.mode,
      synthetic: Boolean(data.synthetic),
      speed: data.speed || 1,
      ready: false,
      sessionId: null,
      model: null,
      ms: 0,
      durationMs: data.durationMs || 0,
      index: 0,
      total: 0,
      ended: false,
    };
  }

  // ---- events --------------------------------------------------------------------------------

  function onEvent({ type, data }) {
    const s = ui.session;
    if (typeof data.ms === 'number' && s.active && !(isStatic && ui.playing)) s.ms = Math.max(s.ms, data.ms);
    switch (type) {
      case 'activity':
        ui.log.set(data.seq, data);
        if (data.tool === 'record_turn' && data.result && data.result.turn) {
          finalizeUser(data.args.item_id, { text: data.args.text, turnId: data.result.turn.id, spoken: Boolean(data.result.spoken_approval) });
        }
        refresh();
        break;
      case 'voice.start':
        resetSessionView(data);
        refresh();
        refreshVoice();
        break;
      case 'voice.partial':
        upsertUser(data.item_id || PENDING, { text: data.text, final: false });
        break;
      case 'voice.agentDelta':
        agentDelta(data.delta || '');
        break;
      case 'voice.agent':
        agentFinal(data.text, data.interrupted);
        break;
      case 'voice.wire': {
        const [text, tone] = wireText(data.event);
        wireRow(data.ms, data.dir, text, tone);
        const t = data.event.type;
        if (data.dir === 'in' && t === 'reply.started') ui.openAgent = null;
        if (data.dir === 'in' && t === 'session.ready' && data.event.config && data.event.config.model) s.model = data.event.config.model;
        if (data.dir === 'in' && (t === 'input.speech.started' || (t === 'reply.done' && data.event.status === 'interrupted')) && ui.player) ui.player.flush();
        break;
      }
      case 'voice.result':
        if (data.status === 'held') {
          const until = data.why === 'next-reply' ? 'the reply.done that ends this tool call' : "the agent's reply ends";
          wireRow(data.ms, 'out', `tool.result ${data.call_id} held until ${until}`, 'held');
        }
        if (data.status === 'dropped') {
          const why = data.why === 'interrupted' ? 'the reply was interrupted' : 'the session ended first';
          wireRow(data.ms, 'out', `tool.result ${data.call_id} dropped: ${why}`, 'bad');
        }
        break;
      case 'voice.waiting':
        wireRow(data.ms, 'in', `${data.name} (${data.call_id}) waits for the turn it cites to finish`, 'held');
        break;
      case 'voice.ready':
        s.ready = true;
        s.sessionId = data.session_id || null;
        break;
      case 'voice.progress':
        s.index = data.index;
        s.total = data.total;
        s.durationMs = data.durationMs || s.durationMs;
        break;
      case 'voice.audio':
        if (ui.player && audible()) ui.player.play(data.data);
        break;
      case 'voice.error':
        ui.notice = { tone: 'refused', text: `AssemblyAI session error ${data.code || ''}: ${data.message || ''}` };
        break;
      case 'voice.close':
        s.active = false;
        s.ready = false;
        s.ended = true;
        if (s.mode === 'replay') s.ms = s.durationMs;
        ui.playing = false;
        stopMic();
        refresh();
        refreshVoice();
        break;
      case 'connection.open':
        refresh();
        refreshVoice();
        break;
      default:
        break;
    }
    scheduleRender();
  }

  // ---- data ----------------------------------------------------------------------------------

  let refreshing = false;
  let refreshAgain = false;
  async function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      const [state, log] = await Promise.all([backend.get('api/state'), backend.get('api/activity')]);
      ui.state = state.body;
      // The server's log is the record; an entry streamed after this read arrives again with
      // the next refresh, which its own activity event has already asked for.
      ui.log = new Map(log.body.map((e) => [e.seq, e]));
      transcriptFromState();
    } finally {
      refreshing = false;
      scheduleRender();
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  }

  async function refreshVoice() {
    const res = await backend.get('api/voice');
    ui.voice = res.body;
    if (!ui.voice.active && ui.session.active) {
      ui.session.active = false;
      ui.session.ended = true;
    }
    if (ui.voice.active && !ui.session.active) ui.session = { ...ui.session, active: true, mode: ui.voice.mode, ready: Boolean(ui.voice.status && ui.voice.status.ready) };
    if (!modes().some((m) => m.mode === ui.selectedMode)) ui.selectedMode = modes().length ? modes()[0].mode : 'replay';
    scheduleRender();
  }

  function render() {
    renderHeader();
    renderBanner();
    renderTranscript();
    renderDrafts();
    renderHand();
    renderLog();
    renderWire();
    renderAgentButtons();
  }

  // ---- wiring --------------------------------------------------------------------------------

  $('primary').addEventListener('click', onPrimary);
  $('hero-play').addEventListener('click', () => {
    ui.selectedMode = 'replay';
    if (!ui.session.active) startSession('replay');
  });
  $('skip').addEventListener('click', () => {
    if (!isStatic) return;
    pause();
    backend.clock.runAll();
    scheduleRender();
  });
  $('speed').addEventListener('change', (e) => {
    ui.speed = Number(e.target.value) || 1;
    if (ui.player && ui.speed !== 1) ui.player.flush();
  });
  document.addEventListener('pointerdown', () => ensurePlayer(), { once: true });
  $('modes').addEventListener('change', (e) => {
    if (e.target.name === 'mode') ui.selectedMode = e.target.value;
    scheduleRender();
  });
  $('cards').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (btn) onCardAction(btn);
  });
  $('cards').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.draft && t.dataset.sku) (ui.editing[t.dataset.draft] = ui.editing[t.dataset.draft] || {})[t.dataset.sku] = t.value;
    if (t.dataset.reason) ui.rejecting[t.dataset.reason] = t.value;
  });
  $('cards').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const act = t.dataset.reason ? 'confirm-reject' : t.dataset.draft ? 'save' : null;
    if (act) onCardAction({ dataset: { act, id: t.dataset.reason || t.dataset.draft } });
  });
  $('hand-find').addEventListener('click', handSearch);
  $('hand-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handSearch();
  });
  $('hand-for').addEventListener('change', scheduleRender);
  $('hand-results').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-add]');
    if (!btn) return;
    const item = ui.hand.results.find((r) => r.sku === btn.dataset.add);
    if (item && !ui.hand.lines.some((l) => l.sku === item.sku)) ui.hand.lines.push({ sku: item.sku, name: item.name, variant: item.variant, qty: 1 });
    scheduleRender();
  });
  $('hand-lines').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-drop]');
    if (!btn) return;
    ui.hand.lines = ui.hand.lines.filter((l) => l.sku !== btn.dataset.drop);
    scheduleRender();
  });
  $('hand-lines').addEventListener('input', (e) => {
    const line = ui.hand.lines.find((l) => l.sku === e.target.dataset.handQty);
    if (line) line.qty = e.target.value;
  });
  $('hand-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handCreate();
  });
  $('agent-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-try]');
    if (btn) tryAsAgent(btn.dataset.try);
  });

  backend.on(onEvent);
  if (isStatic) $('foot-note').textContent += ' This static page replays the session tape through the same code the local server runs; the live microphone mode needs the local server and your own AssemblyAI key.';

  // The static demo's copy of the agent's recorded voice, when the build shipped one.
  async function loadAgentAudio() {
    const file = isStatic && window.TailgateStatic.audioFile;
    if (!file) return;
    try {
      const res = await fetch(file);
      if (res.ok) backend.setAgentAudio(await res.arrayBuffer());
    } catch {
      // The replay still runs, silently; the transcript carries every word.
    }
  }

  (async function boot() {
    await Promise.all([refresh(), refreshVoice(), loadAgentAudio()]);
    if (params.get('mode') === 'live' && modes().some((m) => m.mode === 'live')) ui.selectedMode = 'live';
    // ?autoplay=1 starts the replay. In the static demo, ?at=<ms> opens it paused that many
    // milliseconds into the session (counted from its session.update, like the progress bar),
    // and ?t=<ms> does the same for a tape line's own `t`, for stills of one moment.
    const tapeT = Number(params.get('t'));
    const at = isStatic && tapeT > 0 ? tapeT - backend.tapeT0 : Number(params.get('at'));
    if (isStatic && at > 0) {
      await startSession('replay');
      ui.playing = false;
      backend.clock.advance(at);
      ui.session.ms = backend.clock.now() - ui.playStartedAt;
    } else if (params.get('autoplay') === '1' && replayMode()) {
      await startSession('replay');
    }
    scheduleRender();
  })();
})();
