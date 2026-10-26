#!/bin/sh
set -eu
: "${DMMARKET_DEV_CONTAINER:?Inicia el backend con bun run dev}"
case "${1:-}" in
  --defaults-file=*|--no-defaults) shift ;;
esac
exec docker exec --env MYSQL_PWD=root "$DMMARKET_DEV_CONTAINER" mysqldump --no-defaults --host=127.0.0.1 --port=3306 --user=root "$@"
