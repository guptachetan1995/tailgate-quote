'use strict';

// Terminal output shared by the demo, replay and recording scripts: one line per activity-log
// entry, colored by outcome (refused in red, drafted/sent in green).

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\u001b[${code}m${s}\u001b[0m` : s);
const red = paint('31');
const green = paint('32');
const dim = paint('2');
const bold = paint('1');

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const who = (actor) => `[${String(actor).padEnd(5)}]`;

function describe(entry) {
  const { tool, args, result, error, outcome } = entry;
  if (outcome === 'refused') return red(`${tool} refused: ${error}`);
  if (outcome === 'error') return red(`${tool} failed: ${error}`);
  switch (tool) {
    case 'record_turn': {
      const line = `${result.turn.id} heard "${result.turn.text}"`;
      if (!result.spoken_approval) return line;
      const unchanged = result.spoken_approval.drafts_unchanged.join(', ') || 'no open drafts';
      return `${line}\n          ${red(`${result.spoken_approval.refused}`)} ${dim(`(${unchanged} unchanged)`)}`;
    }
    case 'search_catalog':
      return `search_catalog "${args.query}": ${result.results.map((r) => `${r.sku}${r.variant ? ` ${r.variant}` : ''} ${money(r.price)}`).join(', ') || 'no match'}`;
    case 'get_board':
      return `get_board: ${result.drafts.length} open draft(s)`;
    case 'draft_quote':
    case 'revise_quote': {
      const d = result.draft;
      const verb = tool === 'draft_quote' ? 'drafted' : 'revised';
      const lines = d.lines.map((l) => {
        const receipt = l.heard ? `heard "${l.heard}"${l.detailHeard ? ` + "${l.detailHeard}"` : ''} (${l.turnId}${l.detailTurnId ? `, ${l.detailTurnId}` : ''})` : 'entered by hand';
        return `          ${l.sku.padEnd(10)} x ${String(l.qty).padStart(2)}  ${money(l.lineTotal).padStart(10)}  ${dim(receipt)}`;
      });
      if (d.labor) lines.push(`          ${'labor'.padEnd(10)} ${String(d.labor.hours).padStart(3)} h ${money(d.labor.amount).padStart(10)}  ${dim(`heard "${d.labor.heard}" (${d.labor.turnId})`)}`);
      const revs = (result.revisions || []).map((r) => `          ${dim(`revision: ${r.op} ${r.sku} ${r.from} -> ${r.to}, asked by "${r.heard}"`)}`);
      const refused = result.refused.map((r) => `          ${red(`line refused: ${r.reason}`)}`);
      return [green(`${verb} ${d.id} for ${d.customer.name}, total ${money(d.total)} (status: ${d.status})`), ...lines, ...revs, ...refused].join('\n');
    }
    case 'draft_supplier_request': {
      const d = result.draft;
      const lines = d.lines.map((l) => `          ${l.sku.padEnd(10)} x ${String(l.qty).padStart(2)}  ${dim(`heard "${l.heard}" (${l.turnId})`)}`);
      return [green(`drafted ${d.id} to ${d.supplier.name}, needed by "${d.neededBy}" (status: ${d.status})`), ...lines].join('\n');
    }
    case 'send_quote':
      return green(`sent ${result.draft.id} to ${result.outbox.to}, total ${money(result.draft.total)}; the customer's copy is rendered`);
    case 'send_supplier_request':
      return green(`sent ${result.draft.id} to ${result.outbox.to}`);
    case 'discard_draft':
      return green(`discarded ${result.draft.id} ("${result.draft.discardReason}")`);
    default:
      return tool;
  }
}

module.exports = { describe, red, green, dim, bold, money, who };
