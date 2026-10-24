@echo off
REM Rutina diaria de datos: corre todos los pasos y muestra un resumen
REM (scripts\rutina_diaria.py). Para escribir aunque baje mucho la cantidad
REM de registros: rutina-diaria.bat --forzar
chcp 65001 >nul
cd /d "%~dp0"
python scripts\rutina_diaria.py %*
echo.
pause
