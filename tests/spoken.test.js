'use strict';

// A spoken "send it" is transcribed, logged and refused as approval. The detector makes the
// refusal visible; it never changes a draft's status.

const { detectSpokenApproval } = require('../src/spoken');
const { SPOKEN_REFUSAL } = require('../src/invoke');
const { withBothDrafts } = require('./helpers');
const { LINES } = require('../src/voice/scenario');

describe('detectSpokenApproval', () => {
  test.each([
    'Sounds great, go ahead and send it over!',
    'Yeah, that all looks good. Send it.',
    'go ahead',
    'Okay, go ahead.',
    'book it',
    'place the order',
    'Go ahead and send the quote to Priya.',
    'Email it to her.',
    "Great, we'll take it.",
    'Order them for Thursday.',
  ])('flags %p', (text) => {
    expect(detectSpokenApproval(text).approval).toBe(true);
  });

  test.each([
    "don't send it yet",
    'Do not send it until I check the vent.',
    'not yet',
    'can you send it?',
    'Could you book it for Thursday?',
    'Go ahead and add a drain pan.',
    LINES.U1,
    LINES.U1B,
    LINES.U2,
    LINES.U3,
    "I'll send you photos tonight.",
    'Hold off, send it tomorrow.',
  ])('does not flag %p', (text) => {
    expect(detectSpokenApproval(text).approval).toBe(false);
  });
});

describe('a spoken approval through the voice feed', () => {
  test.each([LINES.U4, 'Yeah, that all looks good. Send it.'])('%p is recorded, logged as refused, and changes no status', (text) => {
    const ctx = withBothDrafts();
    const statusesBefore = ctx.store.state.drafts.map((d) => [d.id, d.status]);
    const turn = ctx.hear(text);
    expect(turn.spokenApproval).toBe(true);
    expect(ctx.store.state.drafts.map((d) => [d.id, d.status])).toEqual(statusesBefore);
    expect(ctx.store.state.outbox).toEqual([]);
    for (const d of ctx.store.state.drafts) expect(d.spokenApprovalsRefused).toEqual([turn.id]);
    const entry = ctx.store.activityLog().at(-1);
    expect(entry).toMatchObject({ actor: 'voice', tool: 'record_turn', outcome: 'refused_as_approval', note: SPOKEN_REFUSAL });
    expect(entry.result.spoken_approval).toMatchObject({ heard: text, refused: SPOKEN_REFUSAL, drafts_unchanged: statusesBefore.map(([id]) => id) });
  });

  test('an ordinary turn is not flagged and touches no draft', () => {
    const ctx = withBothDrafts();
    const turn = ctx.hear('And a Ventora vent kit.');
    expect(turn.spokenApproval).toBe(false);
    for (const d of ctx.store.state.drafts) expect(d.spokenApprovalsRefused).toEqual([]);
    expect(ctx.store.activityLog().at(-1).outcome).toBe('ok');
  });
});

test('"no problem" is not a negation', () => {
  expect(detectSpokenApproval('No problem, send it over.').approval).toBe(true);
});
