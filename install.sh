#!/usr/bin/env bash
# Install team skills on Linux / macOS, no git needed. Same job as install.ps1.
#
#   One skill:  curl -fsSL https://raw.githubusercontent.com/minhdv-zz/team-skills/main/install.sh | bash -s -- copymau-hoidz
#   Several:    ... | bash -s -- copymau-hoidz tb-hoidz
#   All:        ... | bash -s -- --all
#   List:       ... | bash -s -- --list
#   Other dir:  ... | bash -s -- copymau-hoidz --dest ~/.claude-api/skills
#   Codex:      ... | bash -s -- copymau-hoidz --dest "${CODEX_HOME:-$HOME/.codex}/skills"
#
# Needs: curl or wget, and unzip or python3.
set -euo pipefail

REPO="minhdv-zz/team-skills"
REF="main"
DEST="$HOME/.claude/skills"
ALL=0
LIST=0
SKILLS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --all|-a) ALL=1 ;;
    --list|-l) LIST=1 ;;
    --dest|-d) [ $# -ge 2 ] || { echo "--dest needs a folder" >&2; exit 2; }; DEST="$2"; shift ;;
    --repo) [ $# -ge 2 ] || { echo "--repo needs owner/name" >&2; exit 2; }; REPO="$2"; shift ;;
    --ref) [ $# -ge 2 ] || { echo "--ref needs a branch" >&2; exit 2; }; REF="$2"; shift ;;
    -h|--help)
      cat <<'USAGE'
Usage: install.sh [skill ...] [--all] [--list] [--dest DIR] [--repo owner/name] [--ref branch]
  curl -fsSL https://raw.githubusercontent.com/minhdv-zz/team-skills/main/install.sh | bash -s -- copymau-hoidz
  Default destination: ~/.claude/skills   (Codex: --dest "${CODEX_HOME:-$HOME/.codex}/skills")
USAGE
      exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) SKILLS+=("$1") ;;
  esac
  shift
done

case "$DEST" in "~"|"~/"*) DEST="$HOME${DEST#\~}" ;; esac

TMP="$(mktemp -d "${TMPDIR:-/tmp}/team-skills.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/$REPO/archive/refs/heads/$REF.zip"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP/repo.zip"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP/repo.zip" "$URL"
else
  echo "Need curl or wget to download." >&2; exit 1
fi

mkdir "$TMP/x"
if command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$TMP/repo.zip" -d "$TMP/x"
elif command -v python3 >/dev/null 2>&1; then
  python3 -I -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$TMP/repo.zip" "$TMP/x"
else
  echo "Need unzip or python3 to extract (Debian/Ubuntu: sudo apt install unzip)." >&2; exit 1
fi

ROOT="$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "$ROOT" ] && [ -d "$ROOT/plugins" ] || { echo "plugins/ folder not found in $REPO@$REF" >&2; exit 1; }

# plugins/<plugin>/skills/<skill>/  ->  one line per skill folder
AVAILABLE=()
while IFS= read -r d; do AVAILABLE+=("$d"); done < <(find "$ROOT/plugins" -mindepth 3 -maxdepth 3 -type d -path '*/skills/*' | sort)

if [ "$LIST" -eq 1 ] || { [ "$ALL" -eq 0 ] && [ ${#SKILLS[@]} -eq 0 ]; }; then
  echo "Available skills:"
  for d in "${AVAILABLE[@]}"; do echo "  $(basename "$d")"; done
  [ "$LIST" -eq 1 ] || echo "Pick a skill: add its name after the command, or use --all."
  exit 0
fi

PICK=()
if [ "$ALL" -eq 1 ]; then
  PICK=("${AVAILABLE[@]}")
else
  for n in "${SKILLS[@]}"; do
    found=""
    for d in "${AVAILABLE[@]}"; do
      b="$(basename "$d")"
      if [ "$b" = "$n" ] || [ "$b" = "${n//-/_}" ] || [ "${b//_/-}" = "$n" ]; then found="$d"; break; fi
    done
    [ -n "$found" ] || { echo "No skill named '$n'. Run with --list to see the list." >&2; exit 1; }
    PICK+=("$found")
  done
fi

mkdir -p "$DEST"
for d in "${PICK[@]}"; do
  name="$(basename "$d")"
  rm -rf "${DEST:?}/$name"
  cp -R "$d" "$DEST/$name"
  echo "Installed $name -> $DEST/$name"
done
echo "Done. Restart Claude Code to load the new skills."
