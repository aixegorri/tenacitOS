#!/bin/bash
# setup-skills-sync.sh
#
# Registers an OpenClaw cron job that keeps data/configured-skills.json
# up to date by running sync-skills.mjs periodically.
#
# The job runs every 6 hours via the OpenClaw scheduler (visible in the
# TenacitOS /cron panel). You can also trigger it manually:
#
#   node scripts/sync-skills.mjs
#
# Usage:
#   bash scripts/setup-skills-sync.sh [--interval-hours N] [--agent AGENT_ID]

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
INTERVAL_HOURS=6
AGENT_ID="agent-azpi"  # agent that will run the sync task

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval-hours) INTERVAL_HOURS="$2"; shift 2 ;;
    --agent)          AGENT_ID="$2";        shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

INTERVAL_MS=$(( INTERVAL_HOURS * 3600 * 1000 ))
SYNC_CMD="node ${PROJECT_DIR}/scripts/sync-skills.mjs"

echo "Setting up TenacitOS skills-sync cron job..."
echo "  Interval : every ${INTERVAL_HOURS}h"
echo "  Agent    : ${AGENT_ID}"
echo "  Command  : ${SYNC_CMD}"
echo

# Run an initial sync right now so data/configured-skills.json is populated
echo "⚙️  Running initial sync..."
node "${PROJECT_DIR}/scripts/sync-skills.mjs"
echo

# Create the OpenClaw cron job
# The agentTurn message tells the agent exactly what to do
openclaw cron add \
  --label "TenacitOS Skills Sync" \
  --every "${INTERVAL_MS}" \
  --agent "${AGENT_ID}" \
  --message "Run the TenacitOS skills sync: execute \`${SYNC_CMD}\` and confirm it completed successfully. This keeps data/configured-skills.json up to date with installed OpenClaw skills."

echo
echo "✅ OpenClaw cron job registered — visible in TenacitOS /cron"
echo
echo "To trigger an immediate sync:"
echo "  node ${PROJECT_DIR}/scripts/sync-skills.mjs"
echo
echo "To check when the job last ran:"
echo "  openclaw cron list"
