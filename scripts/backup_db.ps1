# Backup do SQLite no Windows (mesma pasta backups/db que o .sh na VPS).
# Uso manual: .\scripts\backup_db.ps1
# Agendar: Agendador de Tarefas -> Nova tarefa -> Executar: powershell -ExecutionPolicy Bypass -File "C:\caminho\financeiro\scripts\backup_db.ps1"
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Resolve-Path (Join-Path $ScriptDir "..")
$DbFile = Join-Path $ProjectDir "db.sqlite3"
$BackupDir = Join-Path $ProjectDir "backups\db"
$RetentionDays = if ($env:RETENTION_DAYS) { [int]$env:RETENTION_DAYS } else { 14 }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

if (-not (Test-Path $DbFile)) {
    Write-Host "Aviso: $DbFile nao existe — nada a copiar."
    exit 0
}

$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$Out = Join-Path $BackupDir "db-$Stamp.sqlite3"

$Sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue
if ($Sqlite3) {
    $BackupCmd = '.backup "' + $Out + '"'
    & sqlite3 $DbFile $BackupCmd
    Write-Host "Backup (sqlite3): $Out"
}
else {
    Copy-Item -Path $DbFile -Destination $Out
    Write-Host "Backup (Copy-Item): $Out — instale sqlite3 CLI para copia mais segura com app a correr."
}

if ($RetentionDays -gt 0) {
    $Cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter "db-*.sqlite3" -File | ForEach-Object {
        if ($_.LastWriteTime -lt $Cutoff) {
            Remove-Item $_.FullName -Force
            Write-Host "Removido (rotacao): $($_.Name)"
        }
    }
}

Write-Host "Ultimos backups:"
Get-ChildItem -Path $BackupDir -Filter "db-*.sqlite3" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.Name)" }
