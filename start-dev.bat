@echo off
title HADIR BAPPERIDA - Stitch Suite
echo ===================================================
echo   Menjalankan Proyek: absensi-STICH (Full Database)
echo ===================================================
echo 1. Memulai Server Backend Database (Port 8081)...
start "Backend Database" /B node server/index.js
echo 2. Memulai Frontend Vite (Port 3000)...
echo.
echo Server lokal dibuka di: http://localhost:3000
echo Tekan Ctrl+C untuk menghentikan server.
echo.
cd /d "%~dp0"
npm run dev
pause
