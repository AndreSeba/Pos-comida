<#
  Levanta TODO el sistema en un solo computador del local, para trabajar SIN INTERNET: la caja, los meseros y los celulares de los clientes
  (pedir desde la mesa con QR) se conectan por la wifi del local a este computador. No usa servicios en internet.

  Uso (desde la carpeta del proyecto):
      powershell -ExecutionPolicy Bypass -File scripts\servidor-local.ps1 -Demo           # con la tienda de muestra
      powershell -ExecutionPolicy Bypass -File scripts\servidor-local.ps1 -Reconstruir    # vuelve a compilar la aplicación

  Qué hace:
    1. arranca el PostgreSQL portátil (si no está andando),
    2. compila la aplicación (pnpm build) si falta y la copia a la API (carpeta wwwroot): un solo programa entrega la app y atiende los pedidos,
    3. arranca la API escuchando en TODA la red del local (puerto 5080) y te dice qué dirección poner en los QR.

  Lo que NO hace (te lo dice al final): abrir el puerto en el Firewall de Windows. Ese cambio lo haces tú, una sola vez, como administrador.
#>
param([switch]$Demo, [switch]$Reconstruir, [int]$Puerto = 5080)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$pg = Join-Path $raiz '.tools\postgres\pgsql\bin'
$datos = Join-Path $raiz '.tools\pgdata'
$web = Join-Path $raiz 'web'
$apiDir = Join-Path $raiz 'api\src\PosComida.Api'
$wwwroot = Join-Path $apiDir 'wwwroot'
$env:PGPASSWORD = 'pos_dev_password'

function Esperar($nombre, $prueba, $intentos = 60) {
    for ($i = 0; $i -lt $intentos; $i++) {
        try { if (& $prueba) { return } } catch { }
        Start-Sleep 2
    }
    throw "$nombre no arrancó a tiempo."
}

# 1) base de datos
if (-not (Test-Path "$pg\pg_ctl.exe")) { throw "No encuentro PostgreSQL portátil en $pg. Mira el README (sección 'Sin Docker')." }
$ya = $false
try { & "$pg\pg_isready.exe" -h localhost -p 5433 | Out-Null; $ya = ($LASTEXITCODE -eq 0) } catch { }
if (-not $ya) {
    Write-Output 'Arrancando PostgreSQL...'
    Start-Process -FilePath "$pg\pg_ctl.exe" -ArgumentList '-D', $datos, '-o', '"-p 5433"', 'start' -WindowStyle Hidden
    Esperar 'PostgreSQL' { & "$pg\pg_isready.exe" -h localhost -p 5433 | Out-Null; $LASTEXITCODE -eq 0 }
}
$hay = (& "$pg\psql.exe" -h localhost -p 5433 -U pos -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='poscomida'")
if (-not $hay) { & "$pg\psql.exe" -h localhost -p 5433 -U pos -d postgres -c 'CREATE DATABASE poscomida' | Out-Null }
$cargarDemo = $Demo -and -not $hay

# 2) la aplicación, compilada, dentro de la API
# se vuelve a compilar si falta, si lo pides, o si el código cambió después de la última compilación
$indice = Join-Path $wwwroot 'index.html'
$desactualizada = (Test-Path $indice) -and ((Get-ChildItem (Join-Path $web 'src') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime -gt (Get-Item $indice).LastWriteTime)
if ($Reconstruir -or $desactualizada -or -not (Test-Path $indice)) {
    Write-Output 'Compilando la aplicación (una vez; tarda un minuto)...'
    Push-Location $web
    try {
        pnpm install --frozen-lockfile
        pnpm run build
    } finally { Pop-Location }
    if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
    Copy-Item (Join-Path $web 'dist') $wwwroot -Recurse
    Get-CimInstance Win32_Process -Filter "Name='PosComida.Api.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep 2
}

# 3) la API, escuchando en toda la red del local
$api = $null
try { $api = Invoke-RestMethod "http://127.0.0.1:$Puerto/api/auth/usuarios" -TimeoutSec 2 } catch { }
if (-not $api) {
    Write-Output 'Arrancando el sistema...'
    $env:Seed__Ejemplo = 'false'
    if ($Demo) { $env:ASPNETCORE_ENVIRONMENT = 'Development' }
    elseif (-not $env:ASPNETCORE_ENVIRONMENT) { $env:ASPNETCORE_ENVIRONMENT = 'Production' }
    Start-Process -FilePath dotnet -ArgumentList 'run', '--no-launch-profile', '--urls', "http://0.0.0.0:$Puerto" `
        -WorkingDirectory $apiDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $env:TEMP 'pos-api.log') -RedirectStandardError (Join-Path $env:TEMP 'pos-api.err')
    Esperar 'El sistema' { Invoke-RestMethod "http://127.0.0.1:$Puerto/api/auth/usuarios" -TimeoutSec 2 | Out-Null; $true }
}
if ($cargarDemo) {
    Write-Output 'Cargando la tienda de muestra (tarda un minuto)...'
    $env:PYTHONIOENCODING = 'utf-8'
    python -I (Join-Path $raiz 'scripts\demo.py') "http://127.0.0.1:$Puerto" --psql "$pg\psql.exe"
}

# 4) direcciones para usar desde otros dispositivos
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback|VirtualBox|VMware' } |
    Select-Object -ExpandProperty IPAddress
Write-Output ''
Write-Output 'Listo. El sistema funciona sin internet.'
Write-Output "En este computador:   http://localhost:$Puerto"
foreach ($ip in $ips) { Write-Output "Para los demás equipos y celulares de la wifi del local:   http://${ip}:$Puerto" }
Write-Output ''
Write-Output 'Pasos que faltan (una sola vez):'
Write-Output "  1) Abre el administrador desde la dirección de la red (la de arriba), entra a Mesas y pon esa dirección en «Dirección que abrirán los celulares»; luego imprime los QR."
Write-Output "  2) Que Windows deje entrar a los celulares. Ejecuta esto en PowerShell COMO ADMINISTRADOR:"
Write-Output "       New-NetFirewallRule -DisplayName 'POS local' -Direction Inbound -Protocol TCP -LocalPort $Puerto -Action Allow -Profile Private"
Write-Output '  3) Dale al computador una IP fija en el router (reserva DHCP), para que la dirección de los QR no cambie.'
Write-Output '  4) En los celulares: si Android dice «la wifi no tiene internet», elige MANTENER la conexión; si no, usará los datos móviles y no llegará al local.'
Write-Output 'Para apagar todo:  scripts\demo-detener.ps1'
