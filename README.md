# Tailgate Quote — voice quotes for contractors

An independent entry to the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon)
on lablab.ai (September 2026). Not affiliated with or endorsed by AssemblyAI.

**Voice drafts. Hands decide.** Other apps turn a voice memo into a quote. Tailgate Quote
talks it through with you, shows a receipt for every line, and can't be talked into sending.

A trade contractor finishes a site visit and talks the job through at the tailgate of the
van. An AssemblyAI voice agent listens, asks when something is ambiguous ("half-inch or
three-quarter?"), drafts a priced, itemized quote in which every line is tied to the exact
words that produced it, and reads it back. **It can draft. It can never send.** Sending a
quote, sending a supplier request and discarding a draft are owner-only actions: each one is
**never registered as a tool**, so the model cannot call it, and a spoken "go ahead and send
it" — from the customer standing at the tailgate or from the owner — is transcribed, logged,
and refused as approval. Only a tap on screen commits.

> **Status (28 Sep 2026).** The approval gate, the evidence checks, pricing, the
> spoken-approval detector, the voice bridge, the dashboard and the static live demo run
> offline and are covered by the test suite. The live AssemblyAI provider and the Live mic
> mode are tested against scripted sockets. The page always says which tape it replays: a
> recorded AssemblyAI session is labelled with its session id and date, and the scripted
> sample in `tests/fixtures/` is labelled as scripted.

## Why voice, and why voice never commits

Talking is the fastest way to get a job out of a busy owner's head: hands are full and the
van is loud. But a voice is a poor signature. The agent cannot tell who is speaking, so
anyone in earshot can say "send it"; speech is misheard; and anything in a transcript can
reach the model. So the split is structural rather than a prompt instruction: the agent's
toolset contains only drafting and reading verbs, and the commit verbs exist only behind a
button.

## What the agent does, what only the owner does

| | Agent (AssemblyAI Voice Agent, via tool calls) | Owner (a tap on screen) |
|---|---|---|
| Search the price list | yes | yes, in **Draft by hand** (the same `search_catalog`) |
| Draft a customer quote from what was said | yes, and every line must cite words that were actually heard about that customer | yes, typed in **Draft by hand** (the same `draft_quote`; its lines say "entered by hand") |
| Ask which size or variant was meant | yes, out loud, and the answer's words are kept on the line | — |
| Revise an unsent draft ("make that thirty feet") | yes, with the words that asked for it | yes, inline |
| Draft a supplier stock and price check | yes | yes, typed in **Draft by hand** (the same `draft_supplier_request`) |
| Set a price, discount or total | never: prices come from the owner's price list, and any price field in a tool call is refused | never directly |
| **Send a quote** | **never** | yes |
| **Send a supplier request** | **never** | yes |
| **Discard a draft** | **never** | yes, with a reason |

## Every line has a receipt

Each quote line keeps the owner's exact words from the turn that produced it, and the
dashboard shows them highlighted inside that turn's transcript. A line is refused before it
reaches the draft when its words were never heard, when they don't name the item, when the
quantity said for that item isn't the one drafted (a number in the same words that belongs
to the next item doesn't count), or when the words were said about a different customer's
job. The receipts don't make speech recognition infallible — a misheard number is caught by
the owner reading the draft before tapping Send — they make that review fast.

## How it uses AssemblyAI

- **Voice Agent API**, one WebSocket session: streaming speech-to-text (Universal-3.5 Pro
  Realtime, as AssemblyAI's Voice Agent API docs name it; the app shows the model string the
  live session reports) with live partial transcripts and turn detection, the managed Voice
  Agent LLM, the agent's spoken read-back, and interruptions: when the owner talks over the
  agent, it stops and any pending result is dropped.
- **JSON-Schema client-side tool calling.** Every `tool.call` runs through one server
  function, `invoke(tool, args, actor)`, with the actor fixed to `agent`. The dashboard's
  buttons call the same function as `owner`. Arguments are validated against each tool's
  schema, with unknown fields refused at every level. Results go back as `tool.result` when
  AssemblyAI's documented rule allows: on the `reply.done` that ends an interactive call's
  reply, at once for a `hold` call (the agent is silent until it has the result), and never
  into an interrupted reply or a closed socket.
- **Keyterms** built from the price list (product names, SKUs, suppliers, customers).
  `npm run keyterms-ab` compares the same clips with and without them on the **Streaming
  Speech-to-Text v3** API and writes the result to `docs/evidence/keyterms-ab.json`.
- **The AssemblyAI wire rail** shows the real protocol events as they happen, and the
  latencies quoted anywhere are measured from a recorded session, never assumed.
- **Session artifacts**: every live run logs its `session_id`, and a recorded session is
  saved as a tape with session credentials stripped, plus the agent's voice as a sidecar. The
  static live demo replays the tape through the real approval gate, with the agent's recorded
  voice when the tape has one, and labels which tape it is.

The API key stays on the local server, which mints a single-use token per session. No page,
static or served, ever holds the key.

## Tools

Every description ends with the same clause: sending and discarding are done only by the
owner's tap on screen, are not tools, and nothing said aloud performs them.

| Tool | What it does | What it does NOT do |
|---|---|---|
| `search_catalog` | Finds price-list items by spoken name, brand, size or SKU | Add anything to a quote, contact a supplier, reveal supplier cost |
| `get_board` | Returns open drafts, open leads and the last few heard turns | Change anything |
| `draft_quote` | Drafts a priced customer quote for an existing lead, one line per item, each citing the owner's words | Send, set any price or total, book a date, or accept a line whose words were never heard or whose quantity isn't in those words |
| `revise_quote` | Edits an unsent draft and records why | Send, touch a sent quote, or change prices |
| `draft_supplier_request` | Drafts a stock and price check to one supplier | Send, order, or commit spend |
| `send_quote` | (owner-only, not a tool) sends the quote and shows the customer's copy | — |
| `send_supplier_request` | (owner-only, not a tool) sends the request | — |
| `discard_draft` | (owner-only, not a tool) discards a draft with a reason | — |

## Architecture

```mermaid
flowchart LR
  subgraph Page[public/index.html + app.js]
    UI[Approve and send, Edit, Reject<br/>actor owner]
    AP[Try it as the agent<br/>actor agent]
    MIC[Live mic<br/>public/audio.js]
  end
  subgraph Server[src/server.js, 127.0.0.1 only]
    API[src/api.js<br/>POST /api/invoke]
    SES[src/voice/sessions.js<br/>one session at a time]
    BR[src/voice/bridge.js<br/>tool.call as agent]
    INV[src/invoke.js<br/>invoke tool, args, actor]
    ST[src/store.js<br/>drafts, receipts, activity log]
  end
  V[AssemblyAI Voice Agent API<br/>src/voice/assemblyai.js]
  R[Recorded session tape<br/>src/voice/replay.js]
  UI --> API
  AP --> API
  MIC -- POST /api/audio --> SES
  API --> INV
  SES --> BR
  BR <--> V
  BR <--> R
  BR --> INV
  INV --> ST
  Server -- server-sent events --> Page
  P[Static live demo<br/>scripts/build-pages.js] -. the same api.js, invoke.js, bridge and replay, in the page .-> INV
```

- **One code path.** The agent's tool calls and the owner's taps are the same function
  with a different actor. The dashboard's buttons post `{ tool, args, actor: "owner" }` to
  `/api/invoke`; the voice bridge calls `invoke(name, arguments, "agent")` for every
  `tool.call`, with the actor fixed in code, so nothing the model puts in its arguments can
  change it.
- **The gate is structural.** Owner-only verbs are absent from the tool list sent to
  AssemblyAI and from the `/api/tools` listing; calling one as the agent is refused and
  leaves state unchanged.
- **The live demo runs the same code** on a recorded session, so the gate a judge pokes at
  is the real one.

## Run locally

Requires Node.js 22 or newer (developed on Node 26.1.0, npm 11).

```bash
npm ci                              # the pinned dependencies: Express 5.2.1; Jest 29.7.0, ESLint 8.57.1 and esbuild 0.28.2 for development
npm start                           # the dashboard on http://127.0.0.1:3000 (PORT=3187 npm start for another port)
npm run demo                        # the demo scenario in the terminal: scripted voice events through the real gate
npm test                            # the full test suite, offline, no API key needed
npm run lint:check                  # ESLint over src/, tests/, scripts/ and public/
npm run replay                      # a session tape replayed through the real gate in the terminal, with a drift check
npm run build:pages -- dist/pages   # the static live demo (below)
./verify.sh                         # every check this repository has
npm run presubmit                   # before submitting: a real recorded tape, its voice and evidence exist
```

The deck (`docs/deck/deck.html`, ten 1600 × 900 pages) and the cover image are rendered from
the real app by `npm run media -- --playwright <path to an installed playwright package>`
into `media/`: the cover is a frame of the static demo, the deck's screenshots are close-ups
of it, and its latency line comes from `docs/evidence/latency.json`. Playwright is not a
dependency here; `--final` refuses to render from the scripted sample.

**The dashboard** (`npm start`, then open http://127.0.0.1:3000). The server listens on
127.0.0.1 only. The page shows:

- the transcript, with partial transcripts in grey as words arrive and finished turns solid;
- the drafts waiting for the owner, each line with its receipt (the cited words highlighted
  inside the turn they came from), revisions as before-and-after, and the owner's buttons:
  **Approve & send**, **Edit** (quantities; prices always come from the price list) and
  **Reject** (with a reason);
- **Draft by hand**, where the owner searches the price list and drafts a quote or a
  supplier check with the same verbs the agent calls, posted as `owner`;
- the activity log, where every call through `invoke()` is labelled Agent, Owner or Heard,
  refusals included;
- a red banner when a spoken "send it" was heard and refused as approval;
- the AssemblyAI wire rail, showing the protocol events with their session times; and
- a **Try it as the agent** panel that calls the owner-only verbs, a smuggled price and an
  edit nobody said with `actor: "agent"`, and shows each refusal and that nothing changed.

The mode switch offers **Replay** (always) and **Live mic** (only when the server has an
AssemblyAI key; see below). Starting either clears the board to the seeded leads. Without a
key the server offers only the replay: `tapes/demo-session.jsonl` when that file exists,
otherwise the labelled synthetic sample. A replay plays the agent's recorded voice when the
tape has its sidecar (`tapes/raw/<name>.agent.pcm`, written by `record-session`), at 1× speed.
`npm start -- --replay <tape> --speed 4` offers only that tape at 4× speed (the agent's waits
are scaled with it, so every speed gives the same results). The page takes `?autoplay=1` to
start the replay on load and `?layout=tailgate` to show the drafts as the owner's phone
beside the board. While a replay plays, the owner's Approve & send, Edit and Reject wait
until it ends, because the recording goes on to change the drafts. Tests never read `.env`
and never touch the network.

### Talking to AssemblyAI

Create a free AssemblyAI account, copy `.env.example` to `.env` and set
`ASSEMBLYAI_API_KEY`. The key is read only on this machine, by the server and the recording
scripts, and never printed; every script that would contact AssemblyAI refuses clearly when
it is not set.

- `npm start` with the key: the dashboard's **Live mic** mode is offered. Starting it mints a
  single-use token on the server and opens a live Voice Agent session that the server holds.
  The page captures the microphone at 24 kHz and posts it to the server (`POST /api/audio`,
  raw PCM16), and plays the agent's voice as it comes back over server-sent events, so no page
  ever holds the key or a token. Headphones help; echo cancellation is on.
- Recording a session to a tape (billed to the free credits, about $0.075 a minute):

  ```bash
  npm run clips                                   # the scripted lines as 24 kHz WAVs (macOS say + ffmpeg)
  npm run record-session -- --smoke               # a cheap first run: the lines typed, not spoken
  npm run record-session                          # the take: the clips streamed as microphone audio
  npm run record-session -- --name take-2 --force # another take
  npm run replay -- tapes/demo-session.jsonl      # replay it through the gate; exits 1 on drift
  npm run latency -- tapes/demo-session.jsonl     # measured latencies into docs/evidence/
  npm run keyterms-ab                             # Streaming Speech-to-Text with and without keyterms
  ```

  `npm run clips -- --voices assemblyai` speaks the lines in AssemblyAI's own voices instead
  of macOS `say`. Every recording ends with `session.end`, is capped at 4 minutes
  (`--max-seconds`), and is scrubbed of tokens as it is written.

`./verify.sh` runs every check this repository has: required files, the MIT license, the
gate statement in this README, the submission copy's form limits, the tests and lint.

## Build the static live demo

```bash
npm run build:pages -- dist/pages     # index.html, tailgate.bundle.js, the page scripts and .nojekyll
python3 -m http.server -d dist/pages 8080 --bind 127.0.0.1   # or any static file server
```

The build bundles the real `src/api.js`, `src/invoke.js`, the store, the voice bridge, the
replay provider and the session hub into one script (`src/browser-entry.js`, esbuild), with
the session tape inside it: `tapes/demo-session.jsonl` when it exists, otherwise the labelled
synthetic sample. When the tape has an agent-voice sidecar, the build ships it as
`agent-voice.pcm` and the page plays the agent's recorded voice in time with the replay. The
page then runs the same routes the server answers, in the browser, with every request and
response round-tripped through JSON as HTTP would. The replay runs on a clock the page
advances, so it can be paused, sped up (`?speed=4`) or skipped to the end. `?at=<ms>` opens
it paused that many milliseconds into the session, counted from its `session.update` (the
same zero as the progress bar), and `?t=<ms>` does the same for a tape line's own `t`. The
header says which tape it is.

The static page holds no key and makes no network requests: AssemblyAI's token endpoints
cannot be called from a browser, and a key must never sit in a page. So it offers the replay
only; Live mic needs the local server. The build is byte-for-byte deterministic, and its hash
is in the page's `tailgate-build` meta tag.

## Who pays and why

The user is the owner-operator of a small plumbing, heating or HVAC firm who quotes jobs from
the van. Every figure below is sourced or labelled as an assumption; no customers, pilots or
revenue are claimed.

- **Market** (US Census Bureau, Statistics of US Businesses 2021, employer firms only):
  **94,383** plumbing, heating and air-conditioning contractors (NAICS 23822) have fewer than
  20 employees; **489,063** specialty trade contractors (NAICS 238) in all.
- **Price (a proposal):** **$39 a month per owner seat**, 120 voice minutes included. Voice
  costs $0.075 a minute at AssemblyAI's published Voice Agent API rate, about $0.15 for a
  2-minute quote.
- **Size:** SAM = 94,383 × $468 a year ≈ **$44.2M a year**; TAM = 489,063 × $468 ≈ **$229M a
  year**.
- **Worked ROI (assumptions):** 8 quotes a week; 25 minutes to type a quote, 5 to talk one
  through and review it. Saving 20 minutes × 8 × 52 / 12 ≈ **11.6 hours a month** of owner
  time, against $39.
- **Second channel:** the draft-only gate and per-line receipts licensed to field-service
  platforms as a per-quote API.

| Checked on each vendor's own page, 28 Sep 2026 | Price | Live spoken back-and-forth | Receipt for every line | Prices only from your list | Voice can't send |
|---|---|---|---|---|---|
| VoxTrade | Free (5 quotes a month); Pro £14.99/mo | No: voice notes and video walkthroughs | Not stated | No: local market rates | Not stated |
| Voice2Jobs | Free start; Team from $129/mo | No: one-tap capture with live transcription | Not stated | Yes: your saved price list | Not stated; "one tap sends" |
| QuoteIQ (AI Estimator) | Essentials $29.99/mo | No: a description, then typed follow-ups | No: confidence scores per line | No: local market pricing | Not stated |
| **Tailgate Quote** | **$39/mo (proposal)** | **Yes** | **Yes** | **Yes, enforced by schema** | **Yes, structurally** |

Their strengths are real: all three do invoicing, payments and many languages, and VoxTrade
and QuoteIQ cost less per seat.

## What this does not do

- It never sends a real email or text: "sent" writes to an in-app outbox addressed to
  fictional `example.com` contacts and shows the customer's copy on screen.
- It never touches money: no payments, no orders, no invoices.
- It never accepts a spoken approval, however clearly it is heard and whoever says it.
- All businesses, people, products, suppliers and customers in it are fictional, and the
  recorded demo's owner and customer lines are synthesized speech.

## License

[MIT](./LICENSE)
