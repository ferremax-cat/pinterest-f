@echo off
REM Archivo: iniciar_servidor.bat (para Windows)
REM Guarde este archivo en la misma carpeta que su archivo HTML

echo Iniciando servidor web...
echo Para detener el servidor, cierre esta ventana o presione Ctrl+C
echo.
python -m http.server 8000

REM Si lo anterior no funciona, comente la línea de arriba y descomente la siguiente:
REM python -m SimpleHTTPServer 8000

echo.
echo Servidor detenido.
pause