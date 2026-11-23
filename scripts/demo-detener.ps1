<#
  Apaga la tienda de muestra: aplicación (puerto 5273), API (5080) y el PostgreSQL portátil (5433).
  Uso:   powershell -ExecutionPolicy Bypass -File scripts\demo-detener.ps1
  Los datos se conservan; la próxima vez demo-iniciar.ps1 los encuentra tal cual.
#>
$raiz = Split-Path -Parent $PSScriptRoot
$pg = Join-Path $raiz '.tools\postgres\pgsql\bin'

# solo se detiene lo que levantó este proyecto (puerto 5273 de vite y la API de PosComida)
foreach ($c in Get-NetTCPConnection -LocalPort 5273 -State Listen -ErrorAction SilentlyContinue) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    if ($p -and $p.CommandLine -match 'pos-comida') { Stop-Process -Id $p.ProcessId -Force; Write-Output 'Aplicación detenida' }
    elseif ($p) { Write-Output "El puerto 5273 lo usa otro programa ($($p.Name)); no lo toco." }
}
Get-CimInstance Win32_Process -Filter "Name='PosComida.Api.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output 'API detenida' }

if (Test-Path "$pg\pg_ctl.exe") {
    & "$pg\pg_ctl.exe" -D (Join-Path $raiz '.tools\pgdata') stop -m fast 2>$null | Out-Null
    Write-Output 'PostgreSQL detenido'
}
