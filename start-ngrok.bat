@echo off
echo ========================================
echo    Chat Network - ngrok Tunnel
echo ========================================
echo.
echo This will start an ngrok tunnel to your chat server.
echo.
echo PREREQUISITES:
echo 1. Download ngrok from: https://ngrok.com/download
echo 2. Extract ngrok.exe to this folder or add to PATH
echo 3. Sign up at ngrok.com and get your authtoken
echo 4. Run: ngrok config add-authtoken YOUR_TOKEN
echo.
echo Starting tunnel to http://localhost:3000...
echo.
echo If you see an error, make sure ngrok.exe is in this folder
echo or ngrok is added to your system PATH.
echo.
pause
ngrok http 3000
pause
