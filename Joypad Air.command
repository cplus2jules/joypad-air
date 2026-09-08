#!/bin/bash
# Double-click in Finder. Terminal owns the bridge's Accessibility permission.
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

# Finder's environment may not include the user's nvm Node installation.
if ! command -v node >/dev/null 2>&1; then
  JOYPAD_NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$JOYPAD_NVM_DIR/nvm.sh" ]; then
    . "$JOYPAD_NVM_DIR/nvm.sh" --no-use
    nvm use --silent default >/dev/null 2>&1
  fi
fi

printf '\nJoypad Air — play on this Mac\n\n'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo 'Node.js 18 or newer is required. Install Node, then open this launcher again.'
  result=1
else
  node tools/start-pairing.mjs --launch "$@"
  result=$?
fi

if [ "$result" -ne 0 ] && [ -t 0 ]; then
  printf '\nPress Return to close this window. '
  read -r
fi
exit "$result"
