#!/bin/sh
set -eu

: "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD}"
: "${MYSQL_DATABASE:?Set MYSQL_DATABASE}"
case "$MYSQL_DATABASE" in
  *[!a-zA-Z0-9_]*|'') echo "MYSQL_DATABASE must contain only letters, digits and underscores" >&2; exit 1 ;;
esac

if [ ! -f /var/lib/mysql/.dmmarket-initialized ]; then
  if [ -d /var/lib/mysql/mysql ]; then
    echo "Incomplete initialization or incompatible volume. Use a fresh MySQL 5.0 volume." >&2
    exit 1
  fi
  mkdir -p /var/lib/mysql
  chown mysql:mysql /var/lib/mysql
  mysql_install_db --force --user=mysql --datadir=/var/lib/mysql
  mysqld --user=mysql --skip-networking &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
  trap 'exit 1' INT TERM
  ready=0
  for attempt in $(seq 1 120); do
    if mysqladmin --socket=/tmp/mysql.sock -uroot ping --silent; then
      ready=1
      break
    fi
    kill -0 "$server_pid"
    sleep 1
  done
  [ "$ready" -eq 1 ] || { echo "MySQL initialization timed out" >&2; exit 1; }
  password=$(printf '%s' "$MYSQL_ROOT_PASSWORD" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g")
  mysql --socket=/tmp/mysql.sock -uroot <<SQL
DELETE FROM mysql.user WHERE User = '';
DELETE FROM mysql.user WHERE User = 'root' AND Host <> 'localhost';
UPDATE mysql.user SET Password = PASSWORD('$password') WHERE User = 'root';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY '$password' WITH GRANT OPTION;
DROP DATABASE IF EXISTS test;
CREATE DATABASE \`$MYSQL_DATABASE\` DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci;
FLUSH PRIVILEGES;
SQL
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  for file in /docker-entrypoint-initdb.d/*.sql; do
    [ -f "$file" ] || continue
    echo "Restoring $file"
    mysql --socket=/tmp/mysql.sock --max-allowed-packet=64M -uroot "$MYSQL_DATABASE" < "$file"
  done
  mysqladmin --socket=/tmp/mysql.sock -uroot shutdown
  wait "$server_pid"
  trap - EXIT INT TERM
  touch /var/lib/mysql/.dmmarket-initialized
  chown mysql:mysql /var/lib/mysql/.dmmarket-initialized
fi

exec mysqld --user=mysql "$@"
