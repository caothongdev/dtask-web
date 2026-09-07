#!/bin/bash
# Backward-compatibility wrapper for btask-supervisor.sh -> dtask-supervisor.sh
exec "$(dirname "$0")/dtask-supervisor.sh" "$@"