#!/usr/bin/env bash
# Mock T100 Pro camera — exercises the 7 Willfine-shaped Edge Functions end
# to end against a real Supabase project, per the acceptance test in the
# IMEI-device-backend task brief.
#
# Required env vars:
#   SUPABASE_FUNCTIONS_URL   e.g. https://<project-ref>.functions.supabase.co
#                            (or http://localhost:54321/functions/v1 for
#                            `supabase functions serve`)
#   SUPABASE_URL             e.g. https://<project-ref>.supabase.co
#   SUPABASE_ANON_KEY        anon/public API key (for the direct REST calls
#                            below, which the functions don't cover)
#   SUPABASE_USER_JWT        a real logged-in dashboard user's access token —
#                            needed to insert the take_photo `commands` row
#                            the way the dashboard's own "Take photo" button
#                            does (its RLS policy only allows `authenticated`
#                            callers). A SUPABASE_SERVICE_ROLE_KEY also works
#                            here for local testing convenience, but never
#                            commit one or use it from the browser.
#
# Usage: ./scripts/mock-camera.sh
set -euo pipefail

IMEI="869830089252035"
BAD_IMEI="000000000000000"

: "${SUPABASE_FUNCTIONS_URL:?set SUPABASE_FUNCTIONS_URL}"
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
: "${SUPABASE_USER_JWT:?set SUPABASE_USER_JWT (an access token for a logged-in dashboard user, or a service role key for local testing)}"

SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

step() { echo; echo "── $1 ──"; }
ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

step "1. device-check"
good_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/device-check" \
  -H "Content-Type: application/json" \
  -d "{\"imei\":\"$IMEI\"}")"
echo "  response: $good_resp"
echo "$good_resp" | grep -q '"ok":true' && ok "known IMEI returned OK" || fail "expected ok:true for known IMEI"

bad_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/device-check" \
  -H "Content-Type: application/json" \
  -d "{\"imei\":\"$BAD_IMEI\"}")"
echo "  response: $bad_resp"
echo "$bad_resp" | grep -q '"code":1001' && ok "unknown IMEI returned error 1001" || fail "expected code:1001 for unknown IMEI"

step "2. status"
status_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/status" \
  -H "Content-Type: application/json" \
  -d "{\"imei\":\"$IMEI\",\"battery\":100,\"signal\":3,\"temp_c\":25,\"sd_free_mb\":59495,\"lat\":37.7749,\"lng\":-122.4194}")"
echo "  response: $status_resp"
echo "$status_resp" | grep -q '"ok":true' && ok "status accepted" || fail "status call failed"

step "3. file-upload (sample JPG)"
# Smallest valid JPEG (1x1 black pixel), embedded as base64 so the script has
# no external file dependency.
SAMPLE_JPG="$SCRATCH_DIR/sample.jpg"
base64 -d > "$SAMPLE_JPG" <<'B64'
/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a
HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy
MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA
AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB
AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX
/9k=
B64
ls -la "$SAMPLE_JPG" >/dev/null

upload_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/file-upload" \
  -F "imei=$IMEI" \
  -F "source=motion" \
  -F "photo=@$SAMPLE_JPG;type=image/jpeg")"
echo "  response: $upload_resp"
echo "$upload_resp" | grep -q '"ok":true' && ok "photo uploaded" || fail "file-upload failed"

step "4. take_photo command round trip"
command_insert_started_at=$(date +%s)
command_row="$(curl -sS -X POST "$SUPABASE_URL/rest/v1/commands" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"imei\":\"$IMEI\",\"command\":\"take_photo\",\"args\":{},\"status\":\"pending\"}")"
echo "  inserted (as the dashboard would): $command_row"
COMMAND_ID="$(echo "$command_row" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
[ -n "$COMMAND_ID" ] || fail "could not parse inserted command id"
ok "take_photo command $COMMAND_ID queued"

poll_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/command" \
  -H "Content-Type: application/json" \
  -d "{\"imei\":\"$IMEI\"}")"
echo "  command poll response: $poll_resp"
echo "$poll_resp" | grep -q "\"id\":$COMMAND_ID" && ok "device polled and received command $COMMAND_ID (now 'sent')" || fail "command poll did not return the queued command"

upload2_resp="$(curl -sS -X POST "$SUPABASE_FUNCTIONS_URL/file-upload" \
  -F "imei=$IMEI" \
  -F "source=on_demand" \
  -F "command_id=$COMMAND_ID" \
  -F "photo=@$SAMPLE_JPG;type=image/jpeg")"
echo "  response: $upload2_resp"
echo "$upload2_resp" | grep -q '"ok":true' && ok "on-demand photo uploaded, command_id=$COMMAND_ID attached" || fail "on-demand file-upload failed"

final_row="$(curl -sS "$SUPABASE_URL/rest/v1/commands?id=eq.$COMMAND_ID&select=status,completed_at" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_USER_JWT")"
echo "  final command row: $final_row"
echo "$final_row" | grep -q '"status":"done"' && ok "command reached status=done" || fail "command never reached done"

step "5. tap-to-done time"
command_done_at=$(date +%s)
elapsed=$((command_done_at - command_insert_started_at))
echo "  tap-to-done: ${elapsed}s"

echo
echo "All steps passed. The dashboard's Devices page should now show IMEI $IMEI"
echo "online, with the uploaded photo and a completed take_photo command."
