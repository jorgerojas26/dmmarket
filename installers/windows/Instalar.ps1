param([switch]$Elevated)
$ErrorActionPreference = 'Stop'
try {
  Set-Location -LiteralPath $PSScriptRoot
  $binary = Join-Path $PSScriptRoot 'dmmarket-app.exe'
  $expected = (Get-Content -LiteralPath ($binary + '.sha256') -Raw).Trim().ToLower()
  $actual = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLower()
  if ($expected -notmatch '^[0-9a-f]{64}$' -or $expected -ne $actual) {
    throw 'La verificacion del ejecutable fallo. Descarga el paquete nuevamente.'
  }
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) {
    Write-Host 'DMMarket necesita permisos de administrador para configurar el arranque automatico.'
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Elevated')
    $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -Wait -PassThru
    exit $process.ExitCode
  }
  Write-Host 'DMMarket - Instalacion guiada. Mantiene esta ventana abierta mientras usas el navegador.'
  & $binary --setup
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo abrir el asistente. Revisa el mensaje anterior.' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($Elevated) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
  exit 1
}
