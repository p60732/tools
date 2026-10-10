#!/bin/sh
# 起一個全新的假後端（隨機 port）跑全家同步測試
PORT=$((8800 + $(date +%s) % 900))
node "$(dirname "$0")/mock-server.js" $PORT > /dev/null 2>&1 &
MPID=$!
sleep 1
API="http://localhost:$PORT/" node "$(dirname "$0")/sync.e2e.js"
CODE=$?
kill $MPID
exit $CODE
