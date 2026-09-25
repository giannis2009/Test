#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Δεν βρέθηκε το Node.js. Κατεβάστε την έκδοση LTS από https://nodejs.org και ξανατρέξτε αυτό το αρχείο."
  open https://nodejs.org
  read -r -p "Πατήστε Enter για έξοδο..."
  exit 1
fi
[ -d node_modules ] || npm install --omit=dev || exit 1
echo
echo "Το site ανοίγει στο http://localhost:30000   (Admin: http://localhost:30000/admin)"
echo "Κλείστε αυτό το παράθυρο για να σταματήσει."
(sleep 2 && open http://localhost:30000) &
npm start
