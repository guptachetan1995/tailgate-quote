#!/usr/bin/env bash
# Verification for Tailgate Quote: structural checks on the docs, then the test suite and
# lint. Kept compatible with the bash 3.2 that ships on macOS.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

fail() { echo "ERROR: $1" >&2; exit 1; }

# The public copy of this repo ships without SPEC.md, so the spec checks run only inside
# the private monorepo; a clean clone still runs every other check.
in_monorepo=false
[ -f ../../bin/publish.sh ] && [ -f ../../bin/verify.sh ] && in_monorepo=true

echo "== entry root files =="
for f in README.md LICENSE .gitignore .env.example package.json package-lock.json docs/submission.md docs/video-script.md docs/deck/deck.html; do
  [ -f "$f" ] || fail "$f is missing"
  echo "  ok: $f"
done

echo "== LICENSE is MIT =="
grep -q '^MIT License' LICENSE || fail "LICENSE is not the MIT license text"

echo "== the API key can never be committed =="
grep -qxF '.env' .gitignore || fail ".gitignore does not list .env"
grep -qxF '!.env.example' .gitignore || fail ".gitignore does not keep .env.example"
grep -qx 'ASSEMBLYAI_API_KEY=' .env.example || fail ".env.example must hold ASSEMBLYAI_API_KEY with an empty value"

echo "== the owner-only gate is stated, not just implied =="
grep -qi "never registered as a tool" README.md ||
  fail "README.md no longer states that the owner-only verbs are never registered as a tool"

echo "== submission copy fits the lablab form =="
# Prints the first fenced block under a "### <heading>" in docs/submission.md.
field() {
  awk -v h="### $1" '
    $0 == h { found = 1; next }
    found && /^```/ { if (inblock) exit; inblock = 1; next }
    inblock { print }
  ' docs/submission.md
}
chars() { printf '%s' "$1" | LC_ALL=en_US.UTF-8 wc -m | tr -d ' '; }
check_len() {
  local name="$1" min="$2" max="$3" text n
  text="$(field "$name")"
  n="$(chars "$text")"
  [ "$n" -ge "$min" ] && [ "$n" -le "$max" ] ||
    fail "$name is $n characters; the form takes $min–$max"
  echo "  ok: $name ($n characters, $min–$max)"
}
check_len "Submission Title" 5 50
printf '%s' "$(field "Submission Title")" | grep -Eq '^[A-Za-z0-9 -]+$' ||
  fail "Submission Title may only hold English letters, numbers, spaces and dashes"
check_len "Short Description" 50 255
check_len "Long Description" 600 2000

if [ "$in_monorepo" = true ]; then
  [ -f SPEC.md ] || fail "SPEC.md is missing"
  echo "  ok: SPEC.md"

  echo "== SPEC.md ends with the submission checklist =="
  last="$(grep -E '^## ' SPEC.md | tail -n 1)"
  case "$last" in
    "## "*"Submission checklist") echo "  ok: $last" ;;
    *) fail "the last section of SPEC.md is '$last', not the submission checklist" ;;
  esac

  echo "== the checklist carries every rule item (read live 28 Sep 2026) =="
  items=(
    "Project Title"
    "Short and Long Descriptions"
    "Technology and Category Tags"
    "Cover Image"
    "Video Presentation"
    "Slide Presentation"
    "GitHub Repository"
    "Application URL"
    "A maximum 5-minute video in MP4 format"
    "MP4 and PDF formats are mandatory"
    "compliant with the MIT License"
  )
  checklist="$(awk '/^## .*Submission checklist$/ { on = 1 } on' SPEC.md)"
  for item in "${items[@]}"; do
    printf '%s\n' "$checklist" | grep -qF -- "$item" ||
      fail "the submission checklist does not carry: $item"
    echo "  ok: $item"
  done
fi

echo "== no unresolved placeholders =="
published_docs=(README.md docs/submission.md docs/video-script.md)
placeholder_files=("${published_docs[@]}")
[ "$in_monorepo" = true ] && placeholder_files+=(SPEC.md)
if grep -nE 'TODO|TBD' "${placeholder_files[@]}"; then
  fail "a placeholder is still present in ${placeholder_files[*]}"
fi
# The published docs describe what exists, not what is promised: a promise that slips would
# stay in the public repo. (SPEC.md is the plan and is not published, so it may look ahead.)
if grep -niE 'once it exists|until then|lands next|not run yet|not yet against|written before the code|playable' "${published_docs[@]}"; then
  fail "a forward-looking promise or a retired claim is in ${published_docs[*]}"
fi
echo "  ok: ${published_docs[*]}"

# Checked against node_modules/.package-lock.json rather than the directory, so an
# interrupted install still triggers a clean reinstall from the committed lockfile.
[ -f node_modules/.package-lock.json ] || npm ci

echo "== tests (offline; no API key is read) =="
npm test

echo "== lint =="
npm run lint:check

echo "Tailgate Quote: all checks passed."
