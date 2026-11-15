#!/usr/bin/env bash
# docker compose for test stack <slot>, with the env the compose file needs (SLOT and the API keys):
#   tools/teststack/compose.sh <slot> logs auth
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
shift
compose "$@"
