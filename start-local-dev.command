#!/bin/zsh

setopt PIPE_FAIL

SCRIPT_DIR="${0:A:h}"

cd "$SCRIPT_DIR"

if [[ ! -f server/.env ]]; then
  echo "Missing server/.env."
  echo "Copy server/.env.example to server/.env and update it before starting local dev."
  echo
  read '?Press Enter to close...'
  exit 1
fi

export NODE_TLS_REJECT_UNAUTHORIZED="${NODE_TLS_REJECT_UNAUTHORIZED:-0}"
export OPEN_BROWSER="${OPEN_BROWSER:-true}"

echo "Starting CW Raid Manager local dev environment..."
echo "Project root: $SCRIPT_DIR"
echo
echo "This will run: npm run dev"
echo

npm run dev

status=$?

if [[ $status -ne 0 ]]; then
  echo
  echo "Local dev exited with status $status."
  read '?Press Enter to close...'
fi
