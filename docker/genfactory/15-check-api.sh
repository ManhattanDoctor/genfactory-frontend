#!/bin/sh
set -eu
if ! printf '%s\n' "$API_URL" | grep -Eq '^https?://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$'; then
  echo 'API_URL must be an HTTP(S) origin without a path, query or credentials.' >&2
  exit 1
fi
