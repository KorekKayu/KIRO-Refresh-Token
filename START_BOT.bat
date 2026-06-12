@echo off
title Kiro Auto-Register Bot — Gmail SSO
color 0B
chcp 65001 >nul

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║     KIRO AUTO-REGISTER BOT — Gmail SSO       ║
echo  ╚═══════════════════════════════════════════════╝
echo.
echo  [INFO] Pastikan accounts.txt sudah diisi!
echo  [INFO] Format: email@gmail.com:password
echo.
echo  Menekan sembarang tombol untuk mulai...
pause >nul

cd /d "%~dp0"
node index.js

echo.
echo  Bot selesai. Tekan sembarang tombol untuk keluar.
pause >nul
