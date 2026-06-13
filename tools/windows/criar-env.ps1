# Script PowerShell para criar arquivo .env
Write-Host "🔧 Criando arquivo .env..." -ForegroundColor Yellow
Write-Host ""

$envContent = @"
VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
"@

$envPath = Join-Path $PWD ".env"

# Remove arquivo antigo se existir
if (Test-Path $envPath) {
    Remove-Item $envPath -Force
    Write-Host "🗑️  Arquivo .env antigo removido" -ForegroundColor Gray
}

# Cria novo arquivo
[System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.Encoding]::UTF8)
Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
Write-Host ""

# Verifica conteúdo
Write-Host "📄 Conteúdo do arquivo:" -ForegroundColor Cyan
Write-Host "─" -NoNewline; Write-Host ("─" * 60)
Get-Content $envPath
Write-Host ("─" * 60)
Write-Host ""

# Verifica se tem as 3 variáveis
$content = Get-Content $envPath -Raw
$hasMock = $content -match "VITE_MOCK_USDC_ADDRESS=0x[0-9a-fA-F]{40}"
$hasNFT = $content -match "VITE_GIFT_CARD_NFT_ADDRESS=0x[0-9a-fA-F]{40}"
$hasMinter = $content -match "VITE_GIFT_CARD_MINTER_ADDRESS=0x[0-9a-fA-F]{40}"

if ($hasMock -and $hasNFT -and $hasMinter) {
    Write-Host "✅ Todas as variáveis estão presentes e válidas!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  PRÓXIMOS PASSOS:" -ForegroundColor Yellow
    Write-Host "   1. Pare o servidor Vite se estiver rodando (Ctrl+C)" -ForegroundColor White
    Write-Host "   2. Limpe o cache: Remove-Item -Recurse -Force node_modules\.vite" -ForegroundColor White
    Write-Host "   3. Inicie o servidor: npm run dev" -ForegroundColor White
    Write-Host "   4. Verifique as mensagens no terminal" -ForegroundColor White
    Write-Host "   5. Abra http://localhost:3000 e verifique o console (F12)" -ForegroundColor White
} else {
    Write-Host "❌ Erro: Nem todas as variáveis foram encontradas!" -ForegroundColor Red
    exit 1
}
