#!/bin/bash
# Ezro - local setup and start (macOS). Double-click this file.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Opening the download page - install the LTS version, then run this file again."
  open "https://nodejs.org/en/download"
  read -p "Press Enter to close"; exit 1
fi
echo "Node.js $(node -v) found."
[ -d node_modules ] || npm install || { read -p "npm install failed. Press Enter"; exit 1; }
if [ ! -f .env ]; then
  read -p "Your Google email (becomes the admin): " ADMIN
  printf "PORT=3000\nPUBLIC_URL=http://localhost:3000\nDEV_LOGIN=1\nADMIN_EMAILS=%s\n# Fill these in later - see .env.example\nGOOGLE_CLIENT_ID=\nPAYPAL_ENV=sandbox\nPAYPAL_CLIENT_ID=\nPAYPAL_CLIENT_SECRET=\n" "$ADMIN" > .env
fi
(sleep 2; open http://localhost:3000) &
npm start
