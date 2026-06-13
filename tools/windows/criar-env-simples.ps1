# Script simples para criar arquivo .env
$envPath = Join-Path $PWD ".env"

Write-Host "Criando arquivo .env..." -ForegroundColor Yellow

# Remove arquivo antigo
if (Test-Path $envPath) {
    Remove-Item $envPath -Force
}

# Cria conteudo
$content = "VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0`r`nVITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823`r`nVITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF`r`n"

# Escreve arquivo
[System.IO.File]::WriteAllText($envPath, $content, [System.Text.Encoding]::UTF8)

Write-Host "Arquivo criado!" -ForegroundColor Green
Write-Host ""
Write-Host "Conteudo:" -ForegroundColor Cyan
Get-Content $envPath

$lines = (Get-Content $envPath | Where-Object { $_.Trim() -ne "" }).Count
Write-Host ""
Write-Host "Total de linhas: $lines" -ForegroundColor Yellow

if ($lines -eq 3) {
    Write-Host "SUCESSO! Arquivo criado corretamente." -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Yellow
    Write-Host "  1. npm run test:env" -ForegroundColor White
    Write-Host "  2. npm run dev" -ForegroundColor White
} else {
    Write-Host "ERRO: Arquivo tem $lines linhas (esperado: 3)" -ForegroundColor Red
}
