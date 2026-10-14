param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Command,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]] $CommandArguments
)

$fnmCommand = Get-Command fnm.exe -ErrorAction SilentlyContinue
$fnm = if ($null -ne $fnmCommand) {
  $fnmCommand.Source
} else {
  Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Schniz.fnm_*\fnm.exe') |
    Select-Object -First 1 -ExpandProperty FullName
}

if ([string]::IsNullOrWhiteSpace($fnm)) {
  throw 'fnm.exe was not found on PATH or in the WinGet package directory.'
}

& $fnm env --use-on-cd --shell powershell |
  Out-String |
  Invoke-Expression

& $Command @CommandArguments

exit $LASTEXITCODE
