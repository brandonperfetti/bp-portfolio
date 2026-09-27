#!/usr/bin/env bash
#
# dev-db-restore.sh — restore the newest nightly encrypted backup into the
# local Docker Postgres, so local dev runs against real content (#85).
#
# Pipeline:
#   aws s3api list-objects-v2 -> newest backup key for the target in the
#                                private R2 bucket `db-backup.yml` uploads to
#   aws s3 cp       -> the encrypted dump
#   openssl enc -d  -> plaintext custom-format dump (temp dir, shredded on exit)
#   psql            -> DROP + CREATE the local database
#   pg_restore      -> load it
#   psql            -> print pages / posts / payload_migrations row counts
#
# The decrypt and restore invocations are copied from the header comment of
# `.github/workflows/db-backup.yml`, which is the source of truth for both.
#
# SOURCES. `db-backup.yml` backs up two targets from one nightly run into the
# private Cloudflare R2 bucket `bp-portfolio-db-backups` (#181), one object
# each, keyed `<target>/<YYYY-MM-DD>/db-<target>-<YYYY-MM-DDTHHMMSSZ>.dump.enc`
# — so the greatest key under `<target>/` is the newest:
#   prod    (default) -> prefix prod/,    passphrase BACKUP_PASSPHRASE_PROD
#   staging           -> prefix staging/, passphrase BACKUP_PASSPHRASE
# Reading the bucket takes an R2 API token: R2_BACKUP_ACCESS_KEY_ID,
# R2_BACKUP_SECRET_ACCESS_KEY and R2_BACKUP_ENDPOINT (the same names as the
# workflow's Actions secrets). Only NAMES appear anywhere in this repo; the
# values live in `.env.local` (git-ignored) and in the password manager, and
# are handed to `aws` through its own environment variables, never argv.
#
# SAFETY. The restored database holds real content, real contact emails, and
# the users table. The plaintext dump is written to a private temp directory
# outside the repository and shredded on every exit path, and the target host
# is required to be loopback so this can never drop a remote database.
#
# Usage: bash scripts/dev-db-restore.sh [--source prod|staging] [--dry-run]
#                                       [--host H] [--port P] [--db NAME]
# See `docs/MAINTENANCE.md` § Local database from backups.

set -euo pipefail

# Distinct exit codes so each failure mode is assertable (scripts/dev-db-restore.test.ts).
readonly EX_USAGE=2        # bad flag or bad argument value
readonly EX_MISSING_CMD=3  # a required binary is not on PATH
readonly EX_R2=4           # the R2 bucket could not be listed (credentials, endpoint, network)
readonly EX_NO_PASS=5      # passphrase absent from the environment and .env.local
readonly EX_PG_CLIENT=6    # pg_restore older than the pg17 client the workflow dumps with
readonly EX_NO_DB=7        # nothing answering on the target host:port
readonly EX_BACKUP=8       # no backup object for the target, or download/decrypt failed
readonly EX_VERIFY=9       # restore finished but the result does not look like the site DB
readonly EX_NO_R2_CREDS=10 # an R2_BACKUP_* value absent from the environment and .env.local

# The backup workflow installs and dumps with a Postgres 17 client
# (.github/workflows/db-backup.yml: "Install postgresql-client-17"), and a
# custom-format dump cannot be read by an older pg_restore.
readonly REQUIRED_PG_MAJOR=17
readonly BACKUP_WORKFLOW='db-backup.yml'
# A bucket name, not a secret; db-backup.yml's R2_BACKUP_BUCKET is the source.
readonly R2_BUCKET="${R2_BACKUP_BUCKET:-bp-portfolio-db-backups}"
# Not `readonly`: bash 3.2 (still /bin/bash on macOS) does not accept a
# readonly array assignment. The whole script stays 3.2-compatible on purpose
# — no `mapfile`, no empty-array expansion under `set -u`, no GNU-only `stat`
# or `shred` assumptions — so `pnpm db:local:refresh` works without Homebrew bash.
VERIFY_TABLES=(pages posts payload_migrations)
R2_VARS=(R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY R2_BACKUP_ENDPOINT)

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname -- "$SCRIPT_DIR")"
readonly SCRIPT_DIR REPO_ROOT
# Overridable so the test suite can point the .env.local parser at a fixture
# instead of writing a real .env.local into the working tree.
readonly ENV_FILE="${BP_DB_RESTORE_ENV_FILE:-${REPO_ROOT}/.env.local}"

SOURCE='prod'
DRY_RUN=0
DB_HOST='127.0.0.1'
DB_PORT='5432'
DB_NAME='bp_portfolio_dev'
DB_USER='postgres'
WORK_DIR=''
ENC_FILE=''
DUMP_FILE=''
BACKUP_KEY=''

die() {
  local code=$1
  shift
  printf 'error: %s\n' "$*" >&2
  exit "$code"
}

note() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

usage() {
  cat <<'EOF'
Restore the newest nightly encrypted backup into the local Docker Postgres.

Usage: bash scripts/dev-db-restore.sh [options]
   or: pnpm db:local:refresh [options]        # a leading `--` is also accepted

Options:
  --source prod|staging  Which backup target to restore (default: prod).
                         prod uses BACKUP_PASSPHRASE_PROD, staging uses
                         BACKUP_PASSPHRASE — both read from .env.local.
  --dry-run              Run every preflight check (including listing the
                         bucket to find the newest backup) and print the plan,
                         then stop. Downloads nothing and touches no database.
  --host HOST            Postgres host (default: 127.0.0.1). Loopback only.
  --port PORT            Postgres port (default: 5432). Use 5433 if you
                         remapped the compose port around a system cluster.
  --db NAME              Database to drop and recreate (default: bp_portfolio_dev).
  -h, --help             Show this help.

Prerequisites: Docker running with `docker compose up -d --wait db`, the AWS
CLI and Postgres client tools >= 17 on PATH, and in .env.local the passphrase
plus R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY and
R2_BACKUP_ENDPOINT. THIS DROPS THE TARGET DATABASE.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --)
        # The conventional end-of-options separator. pnpm forwards it to the
        # script verbatim (npm strips it), so `pnpm db:local:refresh --
        # --dry-run` arrives here as a literal `--`. This script takes no
        # positional arguments, so skipping it makes both invocations work.
        shift
        ;;
      --source)
        [[ $# -ge 2 ]] || die "$EX_USAGE" '--source requires a value (prod or staging)'
        SOURCE="$2"
        shift 2
        ;;
      --source=*)
        SOURCE="${1#*=}"
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --host)
        [[ $# -ge 2 ]] || die "$EX_USAGE" '--host requires a value'
        DB_HOST="$2"
        shift 2
        ;;
      --host=*)
        DB_HOST="${1#*=}"
        shift
        ;;
      --port)
        [[ $# -ge 2 ]] || die "$EX_USAGE" '--port requires a value'
        DB_PORT="$2"
        shift 2
        ;;
      --port=*)
        DB_PORT="${1#*=}"
        shift
        ;;
      --db)
        [[ $# -ge 2 ]] || die "$EX_USAGE" '--db requires a value'
        DB_NAME="$2"
        shift 2
        ;;
      --db=*)
        DB_NAME="${1#*=}"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "$EX_USAGE" "unknown argument: $1"
        ;;
    esac
  done

  case "$SOURCE" in
    prod | staging) ;;
    *) die "$EX_USAGE" "--source must be 'prod' or 'staging' (got: '${SOURCE}')" ;;
  esac

  [[ $DB_PORT =~ ^[0-9]+$ ]] || die "$EX_USAGE" "--port must be a number (got: '${DB_PORT}')"

  # A remote host here would mean dropping somebody's real database. The local
  # container is the only legitimate target; refuse anything else outright.
  case "$DB_HOST" in
    127.0.0.1 | localhost | ::1) ;;
    *) die "$EX_USAGE" "--host must be loopback (127.0.0.1, localhost, ::1) — this script DROPS the database and must never touch a remote server (got: '${DB_HOST}')" ;;
  esac

  [[ -n $DB_NAME ]] || die "$EX_USAGE" '--db must not be empty'
}

# The passphrase variable name for the chosen target, per db-backup.yml's
# matrix (`pass_secret`). Only names are ever printed.
passphrase_var() {
  if [[ $SOURCE == 'prod' ]]; then
    printf 'BACKUP_PASSPHRASE_PROD'
  else
    printf 'BACKUP_PASSPHRASE'
  fi
}

# Key pattern for the chosen target, as db-backup.yml writes it:
# <target>/<YYYY-MM-DD>/db-<target>-<YYYY-MM-DDTHHMMSSZ>.dump.enc. Anything
# else under the prefix is ignored rather than restored.
backup_key_regex() {
  printf '^%s/[0-9]{4}-[0-9]{2}-[0-9]{2}/db-%s-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z[.]dump[.]enc$' "$SOURCE" "$SOURCE"
}

require_commands() {
  # A space-separated string, not an array: expanding an empty array under
  # `set -u` is an error on bash < 4.4.
  local missing='' cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || missing="${missing}${missing:+ }${cmd}"
  done
  if [[ -n $missing ]]; then
    die "$EX_MISSING_CMD" "required command(s) not found on PATH: ${missing}
  aws      -> AWS CLI v2 (macOS: brew install awscli); R2 speaks the S3 API
  psql, pg_restore -> Postgres client tools >= ${REQUIRED_PG_MAJOR} (macOS: brew install postgresql@17)
  docker   -> Docker Desktop, then: docker compose up -d --wait db
  openssl  -> preinstalled on macOS and most Linux distributions"
  fi
}

# `pg_restore (PostgreSQL) 17.6` -> 17. The first digit run is the major on
# every packaging variant (Homebrew appends ` (Homebrew)`, Debian appends
# ` (Ubuntu 17.6-1.pgdg…)`), and nothing before it contains a digit.
pg_client_major() {
  local version
  version="$(pg_restore --version 2>/dev/null || true)"
  [[ $version =~ ([0-9]+) ]] || return 1
  printf '%s' "${BASH_REMATCH[1]}"
}

check_pg_client() {
  local major
  if ! major="$(pg_client_major)" || [[ -z $major ]]; then
    die "$EX_PG_CLIENT" "could not parse a version out of \`pg_restore --version\`; install Postgres client tools >= ${REQUIRED_PG_MAJOR}"
  fi
  if [[ $major -lt $REQUIRED_PG_MAJOR ]]; then
    die "$EX_PG_CLIENT" "pg_restore is major ${major}, but the backups are produced by a Postgres ${REQUIRED_PG_MAJOR} client (.github/workflows/db-backup.yml installs postgresql-client-17). An older pg_restore cannot read the dump.
  macOS: brew install postgresql@17 && brew link --overwrite --force postgresql@17
  Then re-check: pg_restore --version"
  fi
  note "pg_restore major ${major} (>= ${REQUIRED_PG_MAJOR}, ok)"
}

# Read one KEY=VALUE out of .env.local WITHOUT sourcing it — the file is
# untrusted shell as far as this script is concerned.
read_env_file_value() {
  local key="$1" file="$2" line value
  [[ -f $file ]] || return 1
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1)" || return 1
  [[ -n $line ]] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ $value == '"'*'"' || $value == "'"*"'" ]]; then
    value="${value:1:${#value}-2}"
  fi
  [[ -n $value ]] || return 1
  printf '%s' "$value"
}

# Ensure the target's passphrase variable is exported. An already-exported
# value wins, so this never needs .env.local in CI or in tests.
resolve_passphrase() {
  local var value
  var="$(passphrase_var)"

  if [[ -n ${!var:-} ]]; then
    note "passphrase: ${var} (from the environment)"
    export "${var}=${!var}"
    return 0
  fi

  if value="$(read_env_file_value "$var" "$ENV_FILE")"; then
    export "${var}=${value}"
    note "passphrase: ${var} (from .env.local)"
    return 0
  fi

  die "$EX_NO_PASS" "no value for ${var}.
  The '${SOURCE}' backups are encrypted with the ${var} secret. Add the line
    ${var}=<the value from the password manager>
  to ${ENV_FILE} (git-ignored), or export it in your shell.
  Without it the backups are unreadable — see .github/workflows/db-backup.yml."
}

# Ensure the three R2_BACKUP_* values are set, from the environment or
# .env.local — the same precedence as the passphrase. Names only are printed.
resolve_r2_credentials() {
  local var value missing='' from_env=0 from_file=0
  for var in "${R2_VARS[@]}"; do
    if [[ -n ${!var:-} ]]; then
      from_env=1
    elif value="$(read_env_file_value "$var" "$ENV_FILE")"; then
      printf -v "$var" '%s' "$value"
      from_file=1
    else
      missing="${missing}${missing:+ }${var}"
    fi
  done
  if [[ -n $missing ]]; then
    die "$EX_NO_R2_CREDS" "no value for: ${missing}.
  The backups live in the private R2 bucket ${R2_BUCKET}. Add
    R2_BACKUP_ACCESS_KEY_ID=<from the password manager>
    R2_BACKUP_SECRET_ACCESS_KEY=<from the password manager>
    R2_BACKUP_ENDPOINT=<from the password manager>
  to ${ENV_FILE} (git-ignored), or export them in your shell. See .env.example."
  fi
  if [[ $from_file -eq 1 && $from_env -eq 1 ]]; then
    note "r2: ${R2_VARS[*]} (from the environment and .env.local)"
  elif [[ $from_file -eq 1 ]]; then
    note "r2: ${R2_VARS[*]} (from .env.local)"
  else
    note "r2: ${R2_VARS[*]} (from the environment)"
  fi
}

# Run the AWS CLI against R2 with ONLY the R2 credentials: a subshell so the
# AWS_* exports never leak into the rest of the script, every R2 value —
# keys AND endpoint — through the environment rather than argv (argv is
# visible to every user in `ps`; the endpoint carries the account id), and
# the developer's own ~/.aws config and profile shut out so they cannot
# redirect or re-sign the request. AWS_ENDPOINT_URL needs AWS CLI >= 2.13.
aws_r2() {
  (
    unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN \
      AWS_ENDPOINT_URL_S3 AWS_IGNORE_CONFIGURED_ENDPOINT_URLS
    export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
    export AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
    export AWS_ENDPOINT_URL="$R2_BACKUP_ENDPOINT"
    export AWS_DEFAULT_REGION=auto AWS_REGION=auto AWS_EC2_METADATA_DISABLED=true
    aws "$@"
  )
}

# Find the newest backup for the target: the greatest key under <target>/
# matching the workflow's layout. Runs at preflight, so --dry-run proves the
# credentials work and names the object it would restore.
locate_newest_backup() {
  local listing
  if ! listing="$(aws_r2 s3api list-objects-v2 --bucket "$R2_BUCKET" \
    --prefix "${SOURCE}/" --query 'Contents[].Key' --output text 2>/dev/null)"; then
    die "$EX_R2" "could not list s3://${R2_BUCKET}/${SOURCE}/ on R2.
  Check R2_BACKUP_ACCESS_KEY_ID / R2_BACKUP_SECRET_ACCESS_KEY / R2_BACKUP_ENDPOINT
  in ${ENV_FILE}: the token needs Object Read on ${R2_BUCKET}, and the endpoint
  is https://<account-id>.r2.cloudflarestorage.com."
  fi
  BACKUP_KEY="$(printf '%s\n' "$listing" | tr '\t' '\n' \
    | grep -E "$(backup_key_regex)" | sort | tail -n 1 || true)"
  [[ -n $BACKUP_KEY ]] || die "$EX_BACKUP" "no '${SOURCE}' backup in s3://${R2_BUCKET}/${SOURCE}/.
  ${BACKUP_WORKFLOW} writes one per target per run; the bucket's lifecycle rule
  deletes them after 30 days. Check the Actions tab, or dispatch a fresh run,
  then retry."
  note "newest backup: ${BACKUP_KEY}"
}

psql_local() {
  PGPASSWORD="${PGPASSWORD:-postgres}" psql \
    --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" \
    --no-password --set ON_ERROR_STOP=1 "$@"
}

check_database_up() {
  local server_version
  if ! server_version="$(psql_local --dbname postgres --tuples-only --no-align \
    --command 'SHOW server_version' 2>/dev/null)"; then
    die "$EX_NO_DB" "nothing answered as user '${DB_USER}' on ${DB_HOST}:${DB_PORT}.
  Start the dev database:  docker compose up -d --wait db
  Confirm who is listening: docker compose ps
                            psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -l
  If a system Postgres already owns ${DB_PORT}, remap the published port in
  docker-compose.yml and pass --port to this script. A system cluster on the
  remapped port has silently shadowed this container before — check, do not assume."
  fi
  note "postgres: ${DB_HOST}:${DB_PORT} answering, server_version ${server_version}"
}

print_plan() {
  local pass_var file
  pass_var="$(passphrase_var)"
  file="$(basename -- "$BACKUP_KEY")"

  cat <<EOF

Plan (source: ${SOURCE})
  1. aws s3api list-objects-v2 --bucket ${R2_BUCKET} --prefix ${SOURCE}/
       -> newest: ${BACKUP_KEY}
  2. aws s3 cp s3://${R2_BUCKET}/${BACKUP_KEY} <tmp>/
       (endpoint: AWS_ENDPOINT_URL <- R2_BACKUP_ENDPOINT, never argv)
  3. openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \\
       -in <tmp>/${file} -out <tmp>/db.dump -pass env:${pass_var}
  4. psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres \\
       -c 'DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)' \\
       -c 'CREATE DATABASE "${DB_NAME}"'
  5. pg_restore --clean --if-exists --no-owner --no-privileges \\
       -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} <tmp>/db.dump
  6. print row counts: ${VERIFY_TABLES[*]}
  7. shred the plaintext dump and remove <tmp> (runs on every exit path)

  .env.local should carry:
    DATABASE_URI=postgres://${DB_USER}:postgres@${DB_HOST}:${DB_PORT}/${DB_NAME}
EOF
}

cleanup() {
  local status=$?
  if [[ -n $WORK_DIR && -d $WORK_DIR ]]; then
    # The decrypted dump contains real content, contact emails, and the users
    # table. It must never outlive this process. `shred` is GNU-only (macOS
    # has none), so it is best-effort; the `rm -rf` below is what guarantees
    # removal on every platform.
    if command -v shred >/dev/null 2>&1; then
      find "$WORK_DIR" -type f -exec shred -u {} + 2>/dev/null || true
    fi
    rm -rf "$WORK_DIR" 2>/dev/null || true
  fi
  return "$status"
}

# Download the object locate_newest_backup chose into the private temp dir.
download_backup() {
  step "Downloading s3://${R2_BUCKET}/${BACKUP_KEY}"
  ENC_FILE="${WORK_DIR}/$(basename -- "$BACKUP_KEY")"
  aws_r2 s3 cp "s3://${R2_BUCKET}/${BACKUP_KEY}" "$ENC_FILE" \
    --only-show-errors --no-progress \
    || die "$EX_BACKUP" "download failed for s3://${R2_BUCKET}/${BACKUP_KEY}.
  It may have expired between listing and download (30-day lifecycle rule)."
  [[ -s $ENC_FILE ]] || die "$EX_BACKUP" "the downloaded backup is empty: ${BACKUP_KEY}"
  note "backup: $(basename -- "$ENC_FILE") ($(wc -c <"$ENC_FILE" | tr -d ' ') bytes)"
}

decrypt_backup() {
  local pass_var
  pass_var="$(passphrase_var)"
  DUMP_FILE="${WORK_DIR}/db.dump"

  step 'Decrypting'
  # Copied verbatim from the Restore recipe in .github/workflows/db-backup.yml
  # (matching its encrypt step: -aes-256-cbc -pbkdf2 -iter 200000 -salt).
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$ENC_FILE" -out "$DUMP_FILE" -pass "env:${pass_var}" \
    || die "$EX_BACKUP" "openssl could not decrypt the backup.
  The usual cause is the wrong passphrase: '${SOURCE}' backups are encrypted
  with ${pass_var}, and the staging and production values are deliberately different."

  # A custom-format dump starts with the literal PGDMP. Checking it turns a
  # silently-wrong passphrase into a clear message instead of a cryptic
  # pg_restore parse error.
  if [[ "$(head -c 5 "$DUMP_FILE")" != 'PGDMP' ]]; then
    die "$EX_BACKUP" "the decrypted file is not a Postgres custom-format dump (no PGDMP header).
  Check that ${pass_var} holds the '${SOURCE}' passphrase."
  fi
  note "decrypted: $(wc -c <"$DUMP_FILE" | tr -d ' ') bytes"
}

recreate_database() {
  step "Recreating ${DB_NAME} on ${DB_HOST}:${DB_PORT}"
  # WITH (FORCE) terminates leftover connections (a `pnpm dev` left running is
  # otherwise enough to block the DROP). Requires server >= 13; the compose
  # image is 16.
  psql_local --dbname postgres --quiet \
    --command "DROP DATABASE IF EXISTS \"${DB_NAME}\" WITH (FORCE)" \
    --command "CREATE DATABASE \"${DB_NAME}\""
  note "created ${DB_NAME}"
}

restore_dump() {
  local status=0
  step 'Restoring'
  # --clean --if-exists --no-owner --no-privileges: the workflow header's
  # restore recipe. --no-owner/--no-privileges matter locally because the dump
  # carries Supabase roles (anon, authenticated, supabase_admin) that do not
  # exist in this container.
  PGPASSWORD="${PGPASSWORD:-postgres}" pg_restore \
    --clean --if-exists --no-owner --no-privileges \
    --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --no-password \
    --dbname "$DB_NAME" "$DUMP_FILE" || status=$?

  if [[ $status -ne 0 ]]; then
    note ''
    note "pg_restore exited ${status} with ignored errors. Some are EXPECTED here"
    note '— the two a real production restore produces come first:'
    note '  - SET transaction_timeout: a server setting that exists on the'
    note '    Postgres 17 the dump came from but not on this Postgres 16 container'
    note '  - the supabase_vault extension and the vault.secrets COPY that'
    note '    follows it: Supabase-image-only, absent from the pgvector image'
    note '  - roles anon / authenticated / supabase_admin do not exist locally'
    note '    (the #72 RLS migration guards its role references)'
    note '  - DROP ... IF EXISTS notices against the freshly created database'
    note 'For reference, the 2026-08-30 production restore reported 4 ignored'
    note 'errors, all of the first two kinds, and was completely correct.'
    note 'The row counts below are the real check.'
  fi
}

verify_restore() {
  local table count failed=0
  step 'Row counts'
  for table in "${VERIFY_TABLES[@]}"; do
    if [[ "$(psql_local --dbname "$DB_NAME" --tuples-only --no-align \
      --command "SELECT to_regclass('public.${table}') IS NOT NULL" 2>/dev/null)" != 't' ]]; then
      printf '  %-20s MISSING\n' "$table"
      failed=1
      continue
    fi
    count="$(psql_local --dbname "$DB_NAME" --tuples-only --no-align \
      --command "SELECT count(*) FROM public.\"${table}\"")"
    printf '  %-20s %s\n' "$table" "$count"
    [[ $count -gt 0 ]] || failed=1
  done

  if [[ $failed -ne 0 ]]; then
    die "$EX_VERIFY" "the restored database is missing a core table or is empty.
  Re-run with --dry-run to check the preflights, and read the pg_restore output above."
  fi
}

main() {
  parse_args "$@"

  note "bp-portfolio local database refresh — source: ${SOURCE}"
  step 'Preflight'
  require_commands aws docker psql pg_restore openssl
  check_pg_client
  resolve_passphrase
  resolve_r2_credentials
  check_database_up
  locate_newest_backup

  if [[ $DRY_RUN -eq 1 ]]; then
    print_plan
    note ''
    note 'Dry run: nothing downloaded, nothing dropped, nothing restored.'
    exit 0
  fi

  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bp-db-restore.XXXXXXXX")"
  chmod 700 "$WORK_DIR"

  download_backup
  decrypt_backup
  recreate_database
  restore_dump
  verify_restore

  step 'Done'
  note "Point .env.local at it:"
  note "  DATABASE_URI=postgres://${DB_USER}:postgres@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  note 'Then: pnpm migrate (expect nothing to run) and pnpm dev'
}

main "$@"
