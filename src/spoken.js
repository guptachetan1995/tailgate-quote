'use strict';

// Spoken-approval detector. It never approves anything: it notices when a finished turn reads
// as consent ("go ahead and send it over") so the refusal can be shown, logged and answered.
// Who said it is unknowable from a voice channel, which is exactly why it cannot count.

const COMMIT_PATTERNS = [
  /\b(send|ship|email|e-mail|mail|text|submit|forward)\s+(it|this|that|them|the\s+(quote|estimate|request|order|price))\b/,
  /\bsend\s+(it\s+)?(over|off|out|through)\b/,
  /\bbook\s+(it|that|this|me|us|the\s+(job|install|installation|date))\b/,
  /\bplace\s+the\s+order\b/,
  /\border\s+(it|them|that|those)\b/,
  /\bi\s+approve\b|\bapproved\b|\bapprove\s+(it|this|that|the\s+quote)\b/,
  /\bgo\s+ahead\s+(and\s+(send|book|order|place|submit|ship|email)\b|with\s+(it|that|the\s+(quote|order|job))\b)/,
  /\bwe'?ll\s+take\s+it\b/,
];

// "Go ahead" on its own, give or take filler words, is consent; "go ahead and add a drain pan"
// is not.
const FILLER = /\b(yeah|yes|yep|ok|okay|sure|alright|all right|great|sounds good|sounds great|perfect|then|just|please|so)\b/g;
const BARE_GO_AHEAD = /^go\s+ahead$/;

const NEGATION = /\b(don'?t|do\s+not|not|never|no|wait|hold\s+off|hold\s+on|stop|cancel|nope|shouldn'?t|won'?t|before\s+you)\b/;
const QUESTION_START = /^(can|could|would|will|should|shall|did|do|does|are|is|have|has|may|might)\b/;

function sentences(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Returns { approval: true, phrase } when a clause reads as consent to send, book or order, and
// { approval: false } otherwise. Negated clauses and questions are not consent.
function detectSpokenApproval(text) {
  for (const sentence of sentences(text)) {
    const isQuestion = sentence.endsWith('?') || QUESTION_START.test(sentence);
    if (isQuestion) continue;
    for (const clause of sentence.replace(/[.!]+$/, '').split(/[,;:]|\s+-\s+|\s+but\s+/)) {
      const c = clause.trim();
      if (!c) continue;
      const bare = c.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
      let match = null;
      if (BARE_GO_AHEAD.test(bare)) match = 'go ahead';
      for (const re of COMMIT_PATTERNS) {
        if (match) break;
        const m = c.match(re);
        if (m) match = m[0];
      }
      if (!match) continue;
      // Negation anywhere earlier in the sentence counts: "hold off, send it tomorrow".
      const before = sentence.slice(0, sentence.indexOf(c) + c.indexOf(match)).replace(/\bno\s+(problem|worries)\b/g, '');
      if (NEGATION.test(before) || /\bnot\s+yet\b/.test(c)) continue;
      return { approval: true, phrase: clause.trim() };
    }
  }
  return { approval: false };
}

module.exports = { detectSpokenApproval };
