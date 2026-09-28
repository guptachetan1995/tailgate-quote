# Tailgate Quote — lablab submission draft

First-draft copy for the lablab.ai submission form of the AssemblyAI Voice Agent Hackathon,
laid out in the form's own three pages. Each field notes the form's limit; the title, short
description and long description are checked against those limits by `verify.sh`. Links to
the repository and live demo go live when they are published and are re-checked logged out
before submitting.

- Event: <https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon>
- Closes: 30 Sep 2026, 15:00 UTC (20:30 IST, 08:00 PT)

## Page 1 — Basic Information

### Submission Title

5–50 characters; English letters, numbers, spaces and dashes only (no colons, apostrophes,
ampersands or emoji).

```
Tailgate Quote - Voice Quotes for Contractors
```

### Short Description

50–255 characters.

```
Voice drafts, hands decide. Talk a job through at the van: an AssemblyAI voice agent asks what it needs, drafts a priced quote with a receipt for every line, and can't be talked into sending it. Only your tap sends.
```

### Long Description

600–2000 characters, at least 100 words: the problem, the solution, the target audience and
what is unique.

```
Small trade contractors quote jobs from memory. The site visit ends at the van with the whole job in the owner's head, the quote waits until evening, and details slip between the driveway and the keyboard.

Tailgate Quote lets the owner say the job once, at the tailgate. An AssemblyAI Voice Agent listens with streaming speech-to-text, live partial transcripts, turn detection and keyterms built from the owner's own price list. It talks back: it asks when an item is ambiguous ("What size Brasswick ball valves do you need?"), reads the draft back, and stops when the owner talks over it. Through JSON-Schema tool calls it searches the price list, drafts an itemized quote, revises it on a correction and drafts a supplier stock check.

Unlike voice-memo quoting apps, it is a live conversation that proves every line; unlike agents that act on a spoken "yes", it cannot be talked into sending. Every line has a receipt, the owner's exact words highlighted where he said them, and a line is refused if its words were never heard, carry another quantity or were about another customer. The model never sets a price: prices come from the price list, and any price field in a tool call is refused. And voice never commits. Sending a quote, sending a supplier request and discarding a draft are owner-only actions that are never registered as tools. When the customer at the tailgate says "go ahead and send it over", the agent answers that only the owner's tap sends, and the log records the words as heard, not accepted.

Every tool call and every button goes through one function with an actor, so the agent and the owner share one surface. The live demo replays a real recorded AssemblyAI session through that same gate, with a panel where you can try the forbidden actions as the agent and watch them fail.

Built for owner-operators of plumbing, heating and HVAC firms with fewer than 20 staff: about 94,000 US firms (US Census, SUSB 2021), a $44M-a-year market at a proposed $39 a month.
```

### Categories

Required multiselect. Filled 28 Sep 2026 from lablab's own list (it has no "Voice AI",
"AI Agents" or "Small Business"): Voice Assistant, Productivity, Business, Web Application,
ProjectFromScratch (the repository was created inside the build window).

### Event Tracks

This event has no tracks configured; leave blank.

### Technologies Used

Required multiselect from lablab's technology list. The list has no AssemblyAI entry (nor
Node.js, JavaScript or GitHub Pages), checked 28 Sep 2026 across all 210 options, so the
form carries the two that are true: rest api (the app's own HTTP API and AssemblyAI's REST
endpoints) and Claude Code (what the project was built with). AssemblyAI is named in both
descriptions, the deck and the video instead.

## Page 2 — Media

### Cover Image

PNG or JPG, 16:9 (1600 × 900), at most 5 MB. A real frame of the app, not a mock-up: the
tailgate layout, with the phone column holding the drafted quote (a receipt on every line)
and the "Heard. Not accepted." banner under the customer's spoken "send it over", the board
beside it, the product name and the line "Voice drafts. Hands decide."

### Video Presentation

MP4 (H.264 video, AAC audio), 1920 × 1080, 25 fps, at most 300 MB, at most 5 minutes. The
form takes a file upload; there is no video-link field. The render is 4:32 (42 MB). Structure, in
the lablab guidelines' order after a 5-second teaser: the introduction, the PDF deck's key
slides, then the working product, using the real recorded AssemblyAI session (including the
agent's own voice) for the demo beats. The beat-by-beat script is in
[video-script.md](video-script.md).

### Slide Presentation

PDF, at most 20 MB. Presentation Platform: PDF. Ten pages, two or three sentences each:

1. Tailgate Quote: a voice agent that drafts every quote and can't be talked into sending one
2. The problem: the job is in the owner's head at the van; the quote waits until evening
3. The solution: say the job once, answer the agent's one question, find a correct draft;
   voice drafts, hands decide, because a voice anyone can fake is not a signature
4. How it works: one AssemblyAI Voice Agent session (speech-to-text, turn detection,
   keyterms, tool calling, voice), one `invoke` function for agent and owner alike, and the
   latencies measured on the recorded session
5. What it looks like: the receipts on every line, the refused spoken send, the customer's
   copy of the sent quote
6. Market: 94,383 US plumbing, heating and air-conditioning firms under 20 staff and 489,063
   specialty-trade firms in all (US Census, SUSB 2021); SAM about $44.2M a year and TAM about
   $229M a year at $39 a month
7. Revenue and a worked ROI: $39 a month per owner seat with 120 voice minutes; voice costs
   $0.075 a minute, about $0.15 a quote; if it saves 20 minutes on 8 quotes a week, that is
   about 11.6 hours a month of owner time (every input labelled as an assumption); a
   per-quote API licensing the gate to field-service platforms as a second channel
8. Competition: VoxTrade, Voice2Jobs and QuoteIQ compared on price, live back-and-forth,
   per-line receipts, where prices come from, whether voice can send, and supplier checks,
   each cell checked on the competitor's own page with the date shown; their strengths
   stated as well
9. Go-to-market and validation: supply-house counters and contractor associations; five
   pilots measured on "quote sent the same day as the visit"
10. Next: supplier replies read back by voice, a confidence check on spoken numbers, the
    links to the live demo and the code

## Page 3 — Application

### GitHub Repository

Must match `https://github.com/...` and be public.

```
https://github.com/guptachetan1995/tailgate-quote
```

### Demo Application Platform

`OTHER` (GitHub Pages; the form's options are Streamlit, Replit, Vercel, native.builder,
Other). `VERCEL` instead if the demo moves to a hosted talk mode before submission.

### Demo Application URL

```
https://guptachetan1995.github.io/tailgate-quote/
```

The page opens ready to replay a real recorded AssemblyAI session behind one large Play
button, with the agent's recorded voice, running through the real approval gate, with every
owner control and a "Try it as the agent" panel live. It holds no API key.

### Additional Information

Optional, at most 2000 characters.

```
Talk to it: clone the repo, run npm ci, put a free AssemblyAI key in .env, then npm start, open http://127.0.0.1:3000, choose Live mic and press Start talking (headphones recommended). Without a key the same app runs on a scripted provider, and npm test runs the whole suite offline.

The static demo cannot open a voice session itself, by design: AssemblyAI's token endpoints are server-side only and a public page must never hold a key. It replays a real session instead, through the real code, so the refusals a judge sees are the production ones. In that recording the owner's and customer's lines are synthesized speech clips with added site noise, fed as audio into a live AssemblyAI session; the agent's voice and every tool call are the session's own.

How it scales: the approval gate is a property of one function, not of the model, so the same pattern holds for any drafting verb a trade business adds (change orders, schedule proposals, supplier orders), and it can be licensed to field-service platforms as a per-quote API. The per-seat cost is dominated by voice minutes at a published per-minute rate, which keeps pricing predictable.
```

## Judging criteria — where to look

| Criterion | Evidence |
|---|---|
| Application of Technology | Voice Agent API session with tool calling, a clarifying question, interruptions, keyterms and live partials; the wire rail and the measured latencies; the keyterms comparison on Streaming Speech-to-Text; the recorded session behind the live demo; local talk mode; the test suite for the tool-result timing and the gate |
| Presentation | The 4:32 video in the guidelines' order (introduction, deck, product), the ten-page deck, the README's architecture diagram, business case and tools table |
| Business Value | A named user and job, Census-based market sizing in dollars, a price set against named competitors, a worked ROI with labelled assumptions, a second channel and a pilot plan |
| Originality | Unlike voice-memo quoting apps: a live conversation, a receipt for every line in the owner's own words, no model-set prices, and an agent that cannot be talked into sending, with a panel where judges can try to break the gate |

## What this entry does not claim

- It does not send real emails or texts, take payments, or place orders.
- It does not claim customers, pilots or revenue: the market figures are public counts, the
  pricing is a proposal and the ROI inputs are labelled assumptions.
- The static demo is a replay of a recorded session, and says so on the page; the recorded
  owner and customer lines are synthesized speech.
- Competitor details are as published on their own pages on the date the deck states.
- Latencies are measured on the recorded session, not promised for every session.

## Submission checklist

- [ ] Project Title
- [ ] Short and Long Descriptions
- [ ] Technology and Category Tags
- [ ] Cover Image
- [ ] Video Presentation
- [ ] Slide Presentation
- [ ] GitHub Repository
- [ ] Application URL
