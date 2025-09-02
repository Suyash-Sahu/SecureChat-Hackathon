Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Chat Network - ngrok Tunnel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will start an ngrok tunnel to your chat server." -ForegroundColor Yellow
Write-Host ""
Write-Host "PREREQUISITES:" -ForegroundColor Green
Write-Host "1. Download ngrok from: https://ngrok.com/download" -ForegroundColor White
Write-Host "2. Extract ngrok.exe to this folder or add to PATH" -ForegroundColor White
Write-Host "3. Sign up at ngrok.com and get your authtoken" -ForegroundColor White
Write-Host "4. Run: ngrok config add-authtoken YOUR_TOKEN" -ForegroundColor White
Write-Host ""
Write-Host "Starting tunnel to http://localhost:3000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "If you see an error, make sure ngrok.exe is in this folder" -ForegroundColor Red
Write-Host "or ngrok is added to your system PATH." -ForegroundColor Red
Write-Host ""

# Try to find ngrok in current directory first
if (Test-Path ".\ngrok.exe") {
    Write-Host "Found ngrok.exe in current directory" -ForegroundColor Green
    .\ngrok.exe http 3000
} else {
    Write-Host "ngrok.exe not found in current directory, trying PATH..." -ForegroundColor Yellow
    try {
        ngrok http 3000
    } catch {
        Write-Host "Error: ngrok not found. Please download from https://ngrok.com/download" -ForegroundColor Red
        Write-Host "Press any key to exit..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}
