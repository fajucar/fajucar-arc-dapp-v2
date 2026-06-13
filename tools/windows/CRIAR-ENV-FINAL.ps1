# Script FINAL para criar arquivo .env - EXECUTE ESTE ARQUIVO
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CRIANDO ARQUIVO .env" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$envPath = Join-Path $PWD ".env"

# Remove arquivo antigo
if (Test-Path $envPath) {
    Remove-Item $envPath -Force
    Write-Host "Arquivo antigo removido" -ForegroundColor Gray
}

# Cria arquivo usando metodo que funciona
$content = @"
VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
"@

# Escreve usando .NET diretamente
[System.IO.File]::WriteAllText($envPath, $content, [System.Text.Encoding]::UTF8)

Write-Host "Arquivo .env criado!" -ForegroundColor Green
Write-Host ""

# Verifica
Write-Host "Conteudo do arquivo:" -ForegroundColor Cyan
Write-Host ("-" * 60)

if (Test-Path $envPath) {
    $fileContent = Get-Content $envPath
    $lineCount = ($fileContent | Where-Object { $_.Trim() -ne "" }).Count
    
    Write-Host "Total de linhas: $lineCount" -ForegroundColor Yellow
    
    foreach ($line in $fileContent) {
        if ($line.Trim() -ne "") {
            Write-Host "  $line" -ForegroundColor White
        }
    }
    
    Write-Host ("-" * 60)
    Write-Host ""
    
    if ($lineCount -eq 3) {
        Write-Host "Arquivo criado corretamente com 3 variaveis!" -ForegroundColor Green
        Write-Host ""
        Write-Host "PROXIMOS PASSOS:" -ForegroundColor Yellow
        Write-Host "   1. Execute: npm run test:env" -ForegroundColor White
        Write-Host "   2. Deve mostrar: TODOS OS TESTES PASSARAM!" -ForegroundColor White
        Write-Host "   3. Execute: npm run dev" -ForegroundColor White
        Write-Host "   4. Verifique as mensagens no terminal" -ForegroundColor White
    } else {
        Write-Host "ERRO: Arquivo tem $lineCount linhas (esperado: 3)" -ForegroundColor Red
    }
} else {
    Write-Host "ERRO: Arquivo nao foi criado!" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
