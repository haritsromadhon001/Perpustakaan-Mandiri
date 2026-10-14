@echo off
title Perpustakaan Mandiri
cls
echo =======================================================
echo          MEMBUKA WEBSITE PERPUSTAKAAN MANDIRI         
echo =======================================================
echo.
echo Sedang menyiapkan server dan membuka peramban web...
echo.

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Python Launcher (py) terdeteksi. Menjalankan server lokal...
    py server.py
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Python terdeteksi. Menjalankan server lokal...
    python server.py
    goto end
)

echo Python tidak terdeteksi di PATH, membuka index.html langsung di browser...
start index.html
pause

:end
