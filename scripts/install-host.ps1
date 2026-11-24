param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$hostScript = Join-Path $repoRoot 'apps\host\native-host.cjs'
$nodeCommand = Get-Command node -ErrorAction Stop
$installDir = Join-Path $env:LOCALAPPDATA 'Exo'
$manifestPath = Join-Path $installDir 'native-host.json'
$launcherPath = Join-Path $installDir 'exo-host.cmd'
$configPath = Join-Path $env:USERPROFILE '.exo\config.json'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.exo.host'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configPath) | Out-Null
if (-not (Test-Path -LiteralPath $configPath)) {
  [System.IO.File]::WriteAllText($configPath, '{"version":1,"repositories":[]}', [System.Text.UTF8Encoding]::new($false))
}
$nodePath = $nodeCommand.Source
$launcher = "@echo off`r`n`"$nodePath`" `"$hostScript`"`r`n"
Set-Content -LiteralPath $launcherPath -Encoding ascii -Value $launcher
$manifest = @{
  name = 'com.exo.host'
  description = 'Exo local workspace host'
  path = $launcherPath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Output "Exo host installed for Chrome extension $ExtensionId."
Write-Output 'Add a repository with: pnpm repo add <path-to-git-repository>'
