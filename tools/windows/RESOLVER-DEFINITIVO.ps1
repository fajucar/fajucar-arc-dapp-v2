# Script DEFINITIVO para criar arquivo .env
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CRIAR ARQUIVO .env DEFINITIVO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$envFile = Join-Path $PWD ".env"

# Remove arquivo antigo
if (Test-Path $envFile) {
    Remove-Item $envFile -Force
    Write-Host "🗑️  Arquivo .env antigo removido" -ForegroundColor Gray
}

# Cria conteúdo
$line1 = "VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0"
$line2 = "VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823"
$line3 = "VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF"

# Escreve linha por linha
$line1 | Out-File -FilePath $envFile -Encoding utf8 -NoNewline
"`r`n" | Out-File -FilePath $envFile -Encoding utf8 -Append -NoNewline
$line2 | Out-File -FilePath $envFile -Encoding utf8 -Append -NoNewline
"`r`n" | Out-File -FilePath $envFile -Encoding utf8 -Append -NoNewline
$line3 | Out-File -FilePath $envFile -Encoding utf8 -Append -NoNewline
"`r`n" | Out-File -FilePath $envFile -Encoding utf8 -Append -NoNewline

Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
Write-Host ""

# Verifica
Write-Host "📄 Verificando conteúdo:" -ForegroundColor Cyan
Write-Host "─" -NoNewline; Write-Host ("─" * 60)

$content = Get-Content $envFile
Write-Host "Total de linhas: $($content.Count)" -ForegroundColor Yellow

foreach ($line in $content) {
    if ($line.Trim() -ne "") {
        Write-Host "  $line" -ForegroundColor White
    }
}

Write-Host ("─" * 60)
Write-Host ""

# Verifica se tem as 3 variáveis
$fullContent = Get-Content $envFile -Raw
$hasMock = $fullContent -match "VITE_MOCK_USDC_ADDRESS=0x[0-9a-fA-F]{40}"
$hasNFT = $fullContent -match "VITE_GIFT_CARD_NFT_ADDRESS=0x[0-9a-fA-F]{40}"
$hasMinter = $fullContent -match "VITE_GIFT_CARD_MINTER_ADDRESS=0x[0-9a-fA-F]{40}"

if ($hasMock -and $hasNFT -and $hasMinter) {
    Write-Host "✅ TODAS AS VARIÁVEIS ESTÃO CORRETAS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
    Write-Host "   1. Execute: npm run test:env" -ForegroundColor White
    Write-Host "   2. Se passar, execute: npm run dev" -ForegroundColor White
    Write-Host "   3. Verifique as mensagens no terminal" -ForegroundColor White
} else {
    Write-Host "❌ ERRO: Nem todas as variáveis foram encontradas!" -ForegroundColor Red
    Write-Host "   Mock: $hasMock" -ForegroundColor Gray
    Write-Host "   NFT: $hasNFT" -ForegroundColor Gray
    Write-Host "   Minter: $hasMinter" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
