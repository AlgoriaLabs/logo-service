#!/bin/sh
# Pull-based continuous deployment. Run by logo-agent-update.timer every 2 minutes:
# pulls IMAGE:APP_TAG and recreates the app only when the image changed. CI never logs in to the server.
set -eu
cd /opt/logo-agent

before="$(docker compose images --quiet app 2>/dev/null || true)"
docker compose pull --quiet app
docker compose up -d --remove-orphans
after="$(docker compose images --quiet app 2>/dev/null || true)"

if [ "$before" != "$after" ]; then
  echo "deployed new image ${after}"
  docker image prune -f > /dev/null
fi
