# Tailgate Quote — demo video script

The script for the lablab video presentation: runtime budget, recording setup, the shot
table with verbatim narration, and what the video deliberately leaves out.

**Status: rendered.** The submission video was rendered on 28 Sep 2026 from the recorded
session `sess_e438576f0b474a60a34bb08892006b2c`: 4:32 (272 s), 1920 × 1080 at 25 fps, H.264
and AAC. The session-audio beats run at that session's real timings (they came to 7a 6.7 s,
7b 6.4 s, 7c 16.8 s with the size question inside it, 8 1.6 s, 10 24.9 s, 11 13.6 s, 12
10.0 s), and the number in beat 16 is the measured median from `docs/evidence/latency.json`,
1.5 s. The drafted durations in the table below are the plan they replaced.

## Runtime budget

- **Cap:** 5:00 (300 s), from the lablab guidelines ("A maximum 5-minute video in MP4
  format"). The Presentation rubric scores a video shorter than 3:00 lower, so 180 s is
  the floor.
- **Target:** 4:35 = **275 s** across 23 table rows.
- **Headroom:** 300 − 275 = **25 s** under the cap; 275 − 180 = **95 s** above the floor.
- **Split:** a 5-second teaser (beat 0), the introduction and the PDF deck 98 s (beats 1–6),
  the working product 147 s (beats 7a–15c), the protocol and a measured latency 11 s (beat
  16), the end card 14 s (beat 17). This is the order lablab's guidelines ask for: "Begin with
  an introduction, discuss your PDF presentation, then showcase your project's
  functionalities." The teaser stays under 5 seconds so the introduction still opens the
  video.
- **Narration pace:** one high-quality installed macOS `say` voice for every narrated beat.
  That voice ignores `say -r`, so each sentence is synthesized on its own, slowed to 0.8×
  (pitch kept), and placed on the still it talks about, with the beat's spare time spread
  between sentences. Every narrated beat stays at or below 2.0 words per second of the time
  it is narrated, so no line clips and the pace never sounds rushed.

## Recording setup

The product beats come from a **real recorded AssemblyAI Voice Agent session** (the same
tape the live demo replays), never from a mock-up. Planned commands, confirmed in the dry
run:

```bash
npm ci
npm run clips -- --voices assemblyai  # the scripted lines in AssemblyAI voices + site noise, 24 kHz
npm run record-session                # live Voice Agent API run → tapes/demo-session.jsonl
PORT=3187 npm start -- --replay tapes/demo-session.jsonl
```

Use a port nothing else is using (`lsof -i :3187` first) and a fresh server per render; the
store is in memory and its clock starts at the tape's recording time, so every render shows
the same timestamps. Seeded state at 0:00 of the product beats: three open leads (Priya
Shah, 41 Linden Avenue, among them), no drafts, an empty activity log, the transcript lane
empty. Beats 0, 12 and 14 use `?layout=tailgate` (the board beside a 390 px phone column
with the drafts and the Approve & send button).

Rendering is a frame-exact still-and-hold slideshow laid out at 1600 × 900 and captured at
1920 × 1080, 25 fps. For **beats 7a–12
there is one still per tape event** (every `transcript.user.delta`, `tool.call`, card change
and wire-rail row), captured on the static build with `?t=<that event's tape t>` and held from
that event's recorded offset to the next, with every hold quantized to a whole number of
frames up front. So the partial transcript grows, the cards
appear and the rail ticks in time with the real audio. A small corner label is burned into
every session beat: "Recorded live AssemblyAI session · sess_… · 28 Sep 2026 · owner and
customer lines are synthesized speech".

**Beats marked "session audio" carry the recorded session's own sound** (the scripted clips
and the agent's real AssemblyAI voice, rebuilt from the tape's offsets) instead of narration;
the rest carry narration.

**Voices.** Three distinct voices, each labelled: the owner, Dave, is AssemblyAI voice
`george` with site noise; the customer, Priya, is AssemblyAI voice `jane` with site noise;
the agent is the live session's own voice, a third ID; the narrator is the one `say` voice.
A line whose AssemblyAI rendering does not match its text word for word falls back to macOS
`say` (Reed for the owner, Samantha for the customer), and the clip manifest records which
voice each line used. The owner is not asked to record anything.

## Shot table

| # | Time | Visual | Action | Narration (verbatim) |
|---|---|---|---|---|
| 0 | 0:00–0:05 (5 s) | Teaser: `?layout=tailgate` still from beat 12; red banner "Heard. Not accepted." | none | *(session audio: Priya, "Sounds great, go ahead and send it over!")* |
| 1 | 0:05–0:20 (15 s) | Deck slide 1: "Tailgate Quote — a voice agent that drafts every quote and can't be talked into sending one." | none | Say the job at the van. Before the tailgate's shut, a priced quote is on your phone, every line backed by your own words. Only your thumb sends it. |
| 2 | 0:20–0:34 (14 s) | Deck slide 2: the problem | none | Dave runs a four-person plumbing firm. Each visit ends at the van, the job in his head. The quote waits until evening; the customer waits for a price. |
| 3 | 0:34–0:52 (18 s) | Deck slide 3: the solution, Talk · Draft · Decide | none | Talking is the fastest way to get a job out of your head. But a voice is a poor signature: anyone nearby can say send it. So Tailgate Quote splits the work. Voice drafts. Hands decide. |
| 4 | 0:52–1:05 (13 s) | Deck slide 4: how it works (one AssemblyAI session, one `invoke` function) | none | It's one AssemblyAI Voice Agent session: streaming speech-to-text, turn detection, keyterms from the price list, tool calls and the agent's voice. |
| 5 | 1:05–1:27 (22 s) | Deck slides 6 and 7: market in dollars, revenue and the worked ROI | two stills, cut where the price is first said | About ninety-four thousand US plumbing and heating contractors have fewer than twenty staff. At thirty-nine dollars a month, voice costs about fifteen cents a quote. If it saves twenty minutes on eight quotes a week, that's over eleven hours a month back. |
| 6 | 1:27–1:43 (16 s) | Deck slide 8: the competitor table | none | Voice-to-quote apps exist: VoxTrade, Voice2Jobs, QuoteIQ. They turn a memo into a quote. Tailgate talks back, shows a receipt for every line, and can't be talked into sending. |
| 7a | 1:43–1:51 (8 s) | App: agent greeting in the transcript lane | tape events | *(session audio: "Tailgate's open, Dave. Tell me about the job.")* |
| 7b | 1:51–2:00 (9 s) | App: U1, the partial transcript growing | tape events | *(session audio: U1, first half)* |
| 7c | 2:00–2:08 (8 s) | App: U1 closed, full formatted transcript; `search_catalog` in the rail | tape events | *(session audio: U1, second half)* |
| 7d | 2:08–2:16 (8 s) | App: the agent's question and the answer turn | tape events | *(session audio: the agent asks half-inch or three-quarter; Dave: "Three-quarter.")* |
| 8 | 2:16–2:32 (16 s) | App: `draft_quote` in the rail and the log; quote card Q-1001 appears, receipts on every line | tape events | *(session audio: the draft lands; the agent's read-back of it opens beat 10, where Dave talks over it)* |
| 9 | 2:32–2:45 (13 s) | App: close-up of the quote card; the valve line's receipt, Dave's words highlighted inside his turn | none | Every line has a receipt: the owner's own words, highlighted where he said them. Prices come from Dave's price list. The model can't type one. |
| 10 | 2:45–2:59 (14 s) | App: Dave talks over the read-back; rail shows `reply.done` *interrupted*; revision diff (PEX 20 → 30 ft, drain pan added); overlay "Interrupted mid-sentence · AssemblyAI turn detection" | tape events | *(session audio: U2 cutting into the read-back, and the agent's confirmation)* |
| 11 | 2:59–3:09 (10 s) | App: U3; supplier request card to Northgate | tape events | *(session audio: U3 and the agent's confirmation)* |
| 12 | 3:09–3:19 (10 s) | App, `?layout=tailgate`: U4 from Priya; banner "Heard: 'Sounds great, go ahead and send it over!' Not accepted. Only Dave's tap sends." | tape events | *(session audio: U4 and the agent's answer, in context)* |
| 13 | 3:19–3:32 (13 s) | App: activity log row `record_turn … refused as approval` in red; then the spoken-approval tests' real output beside it (the customer's line and an owner-style "Send it." both refused) | outline the row | Those words were heard and logged, not accepted. Even Dave's own spoken yes gets the same answer. A voice anyone can fake is not a signature. |
| 14 | 3:32–3:46 (14 s) | App, `?layout=tailgate`: Dave taps **Approve & send** on Q-1001 in the phone column; status `sent`; the customer's copy, then the owner's row in the activity log | tap Approve & send; a still per clause | Dave taps Approve and send, and this is the customer's copy. The log shows who did what: what was heard, what the agent drafted, what Dave sent. |
| 15a | 3:46–3:58 (12 s) | App: "Try it as the agent" panel, three refusals: `send_quote`, a smuggled `unit_price`, `revise_quote` on the sent quote | the panel, then one still per refusal, each cut where it is said | Try it yourself as the agent. Send: refused. Slip in a price: refused. Edit a sent quote: refused. Nothing changes. |
| 15b | 3:58–4:03 (5 s) | App: Dave rejects the supplier request (`discard_draft`), reason "Calling Northgate myself" | tap Reject | Reject is a tap too, with a reason. |
| 15c | 4:03–4:10 (7 s) | Terminal: the gate tests passing, each owner-only verb named in the test it fails as the agent | progressive reveal | The model's tool list has no send verb, and the tests prove it. |
| 16 | 4:10–4:21 (11 s) | App: the AssemblyAI wire rail, then the session's measured latency beside it | two stills | Every protocol event is on the wire rail. The draft was on screen *(the measured number from `docs/evidence/latency.json`)* seconds after Dave stopped talking. |
| 17 | 4:21–4:35 (14 s) | Deck slides 9 and 10 (go-to-market, next), then the end card: live demo URL, repository URL, "Voice drafts. Hands decide." | three stills | Next: five contractor pilots, supplier replies by voice, and a check on spoken numbers. Try the live demo. Voice drafts, hands decide. |

**Total: 275 s (4:35).**

Narration density, words ÷ narrated seconds: beat 1 29 ÷ 15 = 1.93; beat 2 28 ÷ 14 = 2.00;
beat 3 36 ÷ 18 = 2.00; beat 4 21 ÷ 13 = 1.62; beat 5 42 ÷ 22 = 1.91; beat 6 28 ÷ 16 = 1.75;
beat 9 25 ÷ 13 = 1.92; beat 13 26 ÷ 13 = 2.00; beat 14 25 ÷ 14 = 1.79; beat 15a 20 ÷ 12 =
1.67; beat 15b 8 ÷ 5 = 1.60; beat 15c 13 ÷ 7 = 1.86; beat 16 at most 21 ÷ 11 = 1.91 with the
number spoken; beat 17 22 ÷ 14 = 1.57.

The scripted lines, verbatim as synthesized:

- U1 (Dave): "New job for Priya Shah at 41 Linden Avenue. Swap her old tank for an Aquilon
  TX-199 tankless, two Brasswick ball valves, and twenty feet of Flexline PEX. Call it six
  hours labor."
- U1b (Dave, fed only if the agent asks about the valve size): "Three-quarter."
- U2 (Dave, started about 1.5 s into the agent's read-back): "Actually, make that thirty feet
  of PEX, and add a Panrite drain pan."
- U3 (Dave): "And check Northgate has the TX-199 in stock for Thursday."
- U4 (Priya, the customer, at the tailgate): "Sounds great, go ahead and send it over!"

## Dry-run findings

The dry run is made on the recorded session tape. It records here, before the final render,
the real durations of the session-audio beats, whether the take shows the clarifying
question and the barge-in, and any narration overrun warnings.

## Beats that need the owner present

None. Every voice in the video is synthesized or the live agent's, and labelled as such.

## Timing contingency

- If the session-audio beats (0, 7a–12) run longer than drafted, trim narrated beats first,
  in this order: 2 (to 12 s, dropping "the job in his head"), 16 (to 8 s, dropping the first
  sentence), 5 (to 18 s, dropping the ROI sentence, which stays on the slide). Never exceed
  290 s in total.
- If they run shorter, hold the stills longer rather than adding narration.
- If the take has no clarifying question, beat 7d is dropped and its 8 s go to beat 8. If it
  has no barge-in, beat 10 loses its overlay and the word "interrupted" everywhere.
- If the supplier beat (11) is cut from the build, fold its 10 s into beat 9 and change beat
  15b to discard a second quote draft instead.
- The keyterms comparison appears only if `docs/evidence/keyterms-ab.json` shows a
  difference; then beat 16 shows it beside the wire rail, and the narration names what
  changed.

## What the video does not show

- A real email or text being sent: "sent" is an in-app outbox with fictional contacts.
- The owner's own voice: the owner and customer lines are synthesized speech clips with
  added site noise, fed as audio into a live AssemblyAI session, and the corner label says
  so.
- Prices being negotiated, tax, invoicing or payment: none of that exists in the product.

## Dry-run verification

Before the file is sent:

- `ffprobe` duration equals the sum of the shot durations (275 s) and is under 300 s.
- Every narrated beat's speech fits its duration (no clipped words).
- The session-audio beats are the tape's real audio, in the tape's order, and the stills in
  beats 7a–12 change at the tape's event offsets.
- Every number spoken or shown (latency, market, prices) matches its source file or slide.
- Every URL on the end card returns 200 logged out.
- The file is MP4 (H.264/AAC) and under 300 MB.
