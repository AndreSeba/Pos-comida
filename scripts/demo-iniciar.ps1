<#
  Levanta la tienda de muestra "Flama Smash" para mostrarla a un cliente.
  Uso (desde la carpeta del proyecto):   powershell -ExecutionPolicy Bypass -File scripts\demo-iniciar.ps1
  Opciones:  -Recargar   borra la base y vuelve a cargar los datos de muestra (deja todo como el primer día)
  Al terminar abre la app en http://localhost:5273  (usuario Admin, PIN 1234).
#>
param([switch]$Recargar)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$pg = Join-Path $raiz '.tools\postgres\pgsql\bin'
$datos = Join-Path $raiz '.tools\pgdata'
$env:PGPASSWORD = 'pos_dev_password'

if (-not (Test-Path "$pg\pg_ctl.exe")) { throw "No encuentro PostgreSQL portátil en $pg. Mira el README (sección 'Sin Docker')." }

function Esperar($nombre, $prueba, $intentos = 60) {
    for ($i = 0; $i -lt $intentos; $i++) {
        try { if (& $prueba) { return } } catch { }
        Start-Sleep 2
    }
    throw "$nombre no arrancó a tiempo."
}

# 1) base de datos
$ya = $false
try { & "$pg\pg_isready.exe" -h localhost -p 5433 | Out-Null; $ya = ($LASTEXITCODE -eq 0) } catch { }
if (-not $ya) {
    Write-Output 'Arrancando PostgreSQL...'
    Start-Process -FilePath "$pg\pg_ctl.exe" -ArgumentList '-D', $datos, '-o', '"-p 5433"', 'start' -WindowStyle Hidden
    Esperar 'PostgreSQL' { & "$pg\pg_isready.exe" -h localhost -p 5433 | Out-Null; $LASTEXITCODE -eq 0 }
}

# 2) ¿hay que cargar los datos de muestra?
$hay = (& "$pg\psql.exe" -h localhost -p 5433 -U pos -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='poscomida'")
$cargar = $Recargar -or -not $hay
if ($Recargar) {
    Get-CimInstance Win32_Process -Filter "Name='PosComida.Api.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep 2
    & "$pg\psql.exe" -h localhost -p 5433 -U pos -d postgres -c 'DROP DATABASE IF EXISTS poscomida WITH (FORCE)' | Out-Null
}
if (-not $hay -or $Recargar) { & "$pg\psql.exe" -h localhost -p 5433 -U pos -d postgres -c 'CREATE DATABASE poscomida' | Out-Null }

# 3) API (sin los datos de ejemplo genéricos: la demo trae los suyos)
$api = $null
try { $api = Invoke-RestMethod http://localhost:5080/api/auth/usuarios -TimeoutSec 2 } catch { }
if (-not $api) {
    Write-Output 'Arrancando la API...'
    $env:Seed__Ejemplo = 'false'
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    Start-Process -FilePath dotnet -ArgumentList 'run', '--no-launch-profile', '--urls', 'http://localhost:5080' `
        -WorkingDirectory (Join-Path $raiz 'api\src\PosComida.Api') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $env:TEMP 'pos-api.log') -RedirectStandardError (Join-Path $env:TEMP 'pos-api.err')
    Esperar 'La API' { Invoke-RestMethod http://localhost:5080/api/auth/usuarios -TimeoutSec 2 | Out-Null; $true }
}

# 4) datos de muestra (solo si la base está vacía)
if ($cargar) {
    Write-Output 'Cargando la tienda de muestra (tarda un minuto)...'
    $env:PYTHONIOENCODING = 'utf-8'
    python -I (Join-Path $raiz 'scripts\demo.py') --psql "$pg\psql.exe"
}

# 5) frontend
$web = $null
try { $web = Invoke-WebRequest http://localhost:5273 -UseBasicParsing -TimeoutSec 2 } catch { }
if (-not $web) {
    Write-Output 'Arrancando la aplicación...'
    Start-Process -FilePath pnpm -ArgumentList 'dev' -WorkingDirectory (Join-Path $raiz 'web') -WindowStyle Hidden
    Esperar 'La aplicación' { Invoke-WebRequest http://localhost:5273 -UseBasicParsing -TimeoutSec 2 | Out-Null; $true }
}

Write-Output ''
Write-Output 'Lista:  http://localhost:5273   (Admin 1234 · Caja 1 1111 · María 2222 · Carlos 3333)'
Write-Output 'Carta:  http://localhost:5273/carta'
Start-Process 'http://localhost:5273'
