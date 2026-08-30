#!/usr/bin/env bash
#
# dev-db-restore.sh — restore the newest nightly encrypted backup into the
# local Docker Postgres, so local dev runs against real content (#85).
#
# Pipeline:
#   gh run list  -> newest successful `db-backup.yml` run
#   gh run download -> the encrypted artifact for the chosen target
#   openssl enc -d  -> plaintext custom-format dump (temp dir, shredded on exit)
#   psql            -> DROP + CREATE the local database
#   pg_restore      -> load it
#   psql            -> print pages / posts / payload_migrations row counts
#
# The decrypt and restore invocations are copied from the header comment of
# `.github/workflows/db-backup.yml`, which is the source of truth for both.
#
# SOURCES. `db-backup.yml` backs up two targets from one nightly run and
# uploads one artifact each, named `db-<target>-YYYY-MM-DD.dump.enc`:
#   prod    (default) -> artifact db-prod-*.dump.enc,    passphrase BACKUP_PASSPHRASE_PROD
#   staging           -> artifact db-staging-*.dump.enc, passphrase BACKUP_PASSPHRASE
# Only the passphrase NAMES appear anywhere in this repo; the values live in
# `.env.local` (git-ignored) and in the password manager.
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
readonly EX_GH_AUTH=4      # gh is installed but not authenticated
readonly EX_NO_PASS=5      # passphrase absent from the environment and .env.local
readonly EX_PG_CLIENT=6    # pg_restore older than the pg17 client the workflow dumps with
readonly EX_NO_DB=7        # nothing answering on the target host:port
readonly EX_ARTIFACT=8     # no successful run, or no/ambiguous artifact in it
readonly EX_VERIFY=9       # restore finished but the result does not look like the site DB

# The backup workflow installs and dumps with a Postgres 17 client
# (.github/workflows/db-backup.yml: "Install postgresql-client-17"), and a
# custom-format dump cannot be read by an older pg_restore.
readonly REQUIRED_PG_MAJOR=17
readonly BACKUP_WORKFLOW='db-backup.yml'
# Not `readonly`: bash 3.2 (still /bin/bash on macOS) does not accept a
# readonly array assignment. The whole script stays 3.2-compatible on purpose
# — no `mapfile`, no empty-array expansion under `set -u`, no GNU-only `stat`
# or `shred` assumptions — so `pnpm db:local:refresh` works without Homebrew bash.
VERIFY_TABLES=(pages posts payload_migrations)

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
  --dry-run              Run every preflight check and print the plan, then
                         stop. Downloads nothing and touches no database.
  --host HOST            Postgres host (default: 127.0.0.1). Loopback only.
  --port PORT            Postgres port (default: 5432). Use 5433 if you
                         remapped the compose port around a system cluster.
  --db NAME              Database to drop and recreate (default: bp_portfolio_dev).
  -h, --help             Show this help.

Prerequisites: Docker running with `docker compose up -d --wait db`, an
authenticated `gh`, Postgres client tools >= 17 on PATH, and the passphrase in
.env.local. THIS DROPS THE TARGET DATABASE.
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

# Artifact name pattern for the chosen target. db-backup.yml names each
# artifact after the file it uploads: db-<target>-YYYY-MM-DD.dump.enc.
artifact_pattern() {
  printf 'db-%s-*.dump.enc' "$SOURCE"
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
  gh       -> https://cli.github.com  (then: gh auth login)
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

check_gh_auth() {
  if ! gh auth status >/dev/null 2>&1; then
    die "$EX_GH_AUTH" "gh is not authenticated. Run: gh auth login
  The nightly backups are private Actions artifacts; downloading one needs a
  token with access to brandonperfetti/bp-portfolio."
  fi
  note 'gh: authenticated'
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

newest_successful_run() {
  gh run list --workflow "$BACKUP_WORKFLOW" --status success --limit 1 \
    --json databaseId,createdAt,displayTitle \
    --jq '.[0] | select(.databaseId) | "\(.databaseId)\t\(.createdAt)"'
}

print_plan() {
  local pass_var artifact
  pass_var="$(passphrase_var)"
  artifact="$(artifact_pattern)"

  cat <<EOF

Plan (source: ${SOURCE})
  1. gh run list --workflow ${BACKUP_WORKFLOW} --status success --limit 1
  2. gh run download <run-id> --dir <tmp> --pattern '${artifact}'
  3. openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \\
       -in <tmp>/${artifact} -out <tmp>/db.dump -pass env:${pass_var}
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

download_artifact() {
  local run_line run_id run_created found found_count
  step "Locating the newest successful ${BACKUP_WORKFLOW} run"
  run_line="$(newest_successful_run 2>/dev/null || true)"
  [[ -n $run_line ]] || die "$EX_ARTIFACT" "no successful ${BACKUP_WORKFLOW} run found.
  The workflow runs both targets in one matrix with fail-fast disabled, so a run
  where EITHER target failed is reported as a failure and skipped here. Check
  the Actions tab, or dispatch a fresh run, then retry.
  Artifacts also expire after 14 days (retention-days: 14)."
  run_id="${run_line%%$'\t'*}"
  run_created="${run_line#*$'\t'}"
  note "run ${run_id} (${run_created})"

  step "Downloading the '${SOURCE}' artifact"
  gh run download "$run_id" --dir "$WORK_DIR" --pattern "$(artifact_pattern)" \
    || die "$EX_ARTIFACT" "gh run download failed for run ${run_id}, pattern '$(artifact_pattern)'.
  Run ${run_id} may predate the '${SOURCE}' target, or its artifact may have expired."

  # gh nests each artifact in a directory named after it, so find rather than
  # assume a layout. Newline-delimited text rather than `mapfile`, which is
  # bash 4 only.
  found="$(find "$WORK_DIR" -type f -name '*.dump.enc' | sort)"
  found_count="$(printf '%s\n' "$found" | grep -c . || true)"
  [[ $found_count -ne 0 ]] || die "$EX_ARTIFACT" "no *.dump.enc file in the downloaded artifact for '${SOURCE}'"
  [[ $found_count -eq 1 ]] || die "$EX_ARTIFACT" "expected exactly one *.dump.enc for '${SOURCE}', found ${found_count}:
${found}"

  ENC_FILE="$(printf '%s\n' "$found" | head -n 1)"
  note "artifact: $(basename -- "$ENC_FILE") ($(wc -c <"$ENC_FILE" | tr -d ' ') bytes)"
}

decrypt_artifact() {
  local pass_var
  pass_var="$(passphrase_var)"
  DUMP_FILE="${WORK_DIR}/db.dump"

  step 'Decrypting'
  # Copied verbatim from the Restore recipe in .github/workflows/db-backup.yml
  # (matching its encrypt step: -aes-256-cbc -pbkdf2 -iter 200000 -salt).
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$ENC_FILE" -out "$DUMP_FILE" -pass "env:${pass_var}" \
    || die "$EX_ARTIFACT" "openssl could not decrypt the artifact.
  The usual cause is the wrong passphrase: '${SOURCE}' artifacts are encrypted
  with ${pass_var}, and the staging and production values are deliberately different."

  # A custom-format dump starts with the literal PGDMP. Checking it turns a
  # silently-wrong passphrase into a clear message instead of a cryptic
  # pg_restore parse error.
  if [[ "$(head -c 5 "$DUMP_FILE")" != 'PGDMP' ]]; then
    die "$EX_ARTIFACT" "the decrypted file is not a Postgres custom-format dump (no PGDMP header).
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
  require_commands gh docker psql pg_restore openssl
  check_pg_client
  resolve_passphrase
  check_gh_auth
  check_database_up

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

  download_artifact
  decrypt_artifact
  recreate_database
  restore_dump
  verify_restore

  step 'Done'
  note "Point .env.local at it:"
  note "  DATABASE_URI=postgres://${DB_USER}:postgres@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  note 'Then: pnpm migrate (expect nothing to run) and pnpm dev'
}

main "$@"
