#!/bin/sh
# Container start: check config, apply migrations, sync the catalog, serve.
set -e
node dist/cli.mjs boot
exec node server.js
