param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('set', 'get', 'clear')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE '.exo'
$path = Join-Path $root 'openrouter.credential'
Add-Type -AssemblyName System.Security

if ($Action -eq 'clear') {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  exit 0
}

if ($Action -eq 'set') {
  $plain = [Console]::In.ReadToEnd().Trim()
  if (-not $plain.StartsWith('sk-or-') -or $plain.Length -gt 500) { throw 'OpenRouter key format is invalid.' }
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $entropy = [System.Text.Encoding]::UTF8.GetBytes('Exo.OpenRouter.Credential.v1')
  $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
  $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  [System.IO.File]::WriteAllText($path, [Convert]::ToBase64String($protectedBytes), [System.Text.UTF8Encoding]::new($false))
  [Array]::Clear($plainBytes, 0, $plainBytes.Length)
  $plain = $null
  exit 0
}

if (-not (Test-Path -LiteralPath $path)) { throw 'No OpenRouter API key is configured.' }
$entropy = [System.Text.Encoding]::UTF8.GetBytes('Exo.OpenRouter.Credential.v1')
$protectedBytes = [Convert]::FromBase64String([System.IO.File]::ReadAllText($path).Trim())
$plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
try { [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plainBytes)) }
finally { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
