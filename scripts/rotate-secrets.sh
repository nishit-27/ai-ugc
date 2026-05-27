#!/usr/bin/env bash
# Regenerate the random-bytes secrets in .env. Provider API keys (FAL,
# OpenAI, Google, R2, Late, Gemini, RapidAPI, YouTube) cannot be rotated
# from here — those must be re-issued from each provider's admin console.
#
# Rotates: AUTH_SECRET, NEXTAUTH_SECRET, CRON_SECRET
# Writes a timestamped backup of .env before changing anything.
#
# Usage: ./scripts/rotate-secrets.sh

set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

backup="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$backup"
echo "backup -> $backup"

# Generate a fresh 32-byte base64 secret per key. AUTH_SECRET and
# NEXTAUTH_SECRET are kept in sync (NextAuth v5 reads either name
# depending on context, so we set both to the same value).
auth_secret="$(openssl rand -base64 32)"
cron_secret="$(openssl rand -base64 32)"

# Portable in-place edit: write to temp then move.
tmp="$ENV_FILE.tmp"
awk -v auth="$auth_secret" -v cron="$cron_secret" '
  BEGIN { matched_auth = 0; matched_nextauth = 0; matched_cron = 0 }
  /^AUTH_SECRET=/        { print "AUTH_SECRET=" auth;     matched_auth = 1;     next }
  /^NEXTAUTH_SECRET=/    { print "NEXTAUTH_SECRET=" auth; matched_nextauth = 1; next }
  /^CRON_SECRET=/        { print "CRON_SECRET=" cron;     matched_cron = 1;     next }
                         { print }
  END {
    if (!matched_auth)     print "AUTH_SECRET=" auth
    if (!matched_nextauth) print "NEXTAUTH_SECRET=" auth
    if (!matched_cron)     print "CRON_SECRET=" cron
  }
' "$ENV_FILE" > "$tmp"
mv "$tmp" "$ENV_FILE"

echo "rotated: AUTH_SECRET, NEXTAUTH_SECRET, CRON_SECRET"
echo
echo "next steps:"
echo "  1. restart dev server (the in-memory cookie signer caches the old secret)"
echo "  2. update the same three values in your Vercel project env settings"
echo "  3. for provider API keys (FAL/OpenAI/Google/R2/Late/Gemini/RapidAPI/YouTube),"
echo "     rotate from each provider's admin console — there is no API for it"
