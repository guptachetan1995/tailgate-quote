#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Offline demo: plays the scripted session through the fake Voice Agent provider, the real
// bridge and the real invoke(), then the owner's taps and the forbidden calls a judge can try
// as the agent. No key, no network. Every line printed comes from the activity log.

const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createBridge } = require('../src/voice/bridge');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { runScenario } = require('../src/voice/scenario');
const { listTools } = require('../src/tools');

const { describe, dim, bold, who } = require('./print');

async function main() {
  const store = createStore();
  const invoke = createInvoke(store);
  const provider = new FakeVoiceProvider({ sessionId: 'sess_scripted_demo' });
  const bridge = createBridge({ provider, invoke, store });

  store.subscribe((entry) => console.log(`${who(entry.actor)} ${describe(entry)}`));
  bridge.on('agent', ({ text, interrupted }) => console.log(`${who('says')} ${dim(`agent: "${text}"${interrupted ? ' (interrupted by the owner)' : ''}`)}`));
  bridge.on('result', (r) => {
    if (r.status !== 'sent') console.log(`${who('wire')} ${dim(`tool.result ${r.call_id} ${r.status}`)}`);
  });

  console.log(bold('Tailgate Quote: offline demo (scripted provider, no API key, no network)'));
  console.log(dim('Owner and customer lines are scripted; every call below goes through the real invoke().'));

  await runScenario({
    bridge,
    provider,
    invoke,
    onStep: ({ phase, title }) => console.log(`\n${bold(`== ${phase}: ${title}`)}`),
  });

  const state = store.snapshot();
  const log = store.activityLog();
  const tools = listTools().map((t) => t.name);
  console.log(`\n${bold('== result')}`);
  for (const d of state.drafts) console.log(`  ${d.id} ${d.kind.replace('_', ' ')}: ${d.status}${d.sentBy ? ` by ${d.sentBy}` : ''}${d.discardedBy ? ` by ${d.discardedBy}` : ''}`);
  console.log(`  outbox: ${state.outbox.map((o) => `${o.draftId} -> ${o.to} (by ${o.by})`).join(', ')}`);
  console.log(`  activity log: ${log.length} entries, ${log.filter((e) => e.outcome === 'refused').length} refused, ${log.filter((e) => e.outcome === 'refused_as_approval').length} spoken approval refused`);
  console.log(`  the agent's tools (GET /api/tools): ${tools.length}: ${tools.join(', ')}`);
  console.log('  send_quote, send_supplier_request and discard_draft are never registered as a tool.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
