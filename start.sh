#!/bin/bash
cd ~/clawd/renaiss-world
nohup node bot.js >> bot.log 2>&1 &
echo "Bot started with PID $!"