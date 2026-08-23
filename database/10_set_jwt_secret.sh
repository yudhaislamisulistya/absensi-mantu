#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=jwt_secret="$APP_JWT_SECRET" <<'SQL'
SELECT format('ALTER DATABASE %I SET app.jwt_secret = %L', current_database(), :'jwt_secret') \gexec
SELECT format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Asia/Jakarta') \gexec
SQL
