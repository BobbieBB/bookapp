#!/usr/bin/env bash
# Stops test stack <slot> and deletes its volumes (database, snapshots, stored files).
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
compose down -v --remove-orphans >/dev/null 2>&1 || die "could not bring slot $SLOT down"
echo "slot $SLOT down" >&2
