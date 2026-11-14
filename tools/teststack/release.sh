#!/usr/bin/env bash
# Frees the lease on test-stack <slot> taken by lease.sh. The stack keeps running for the next lease.
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
drop_lease "$LEASE_DIR/slot-$SLOT"
