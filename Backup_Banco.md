DA VPS AO PC


ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
./scripts/backup_db.sh
ls -lt backups/db/ | head

---

BACKUP AUTOMÁTICO DIÁRIO NA VPS (instalar uma vez)

cd "/home/deploy/ControleSMDecor"
git pull
chmod +x scripts/install_backup_timer.sh scripts/backup_db.sh
./scripts/install_backup_timer.sh

# Opcional: instalar sqlite3 para cópia mais segura com o app a correr
# sudo dnf install -y sqlite

Ver timer e últimos backups:
  systemctl list-timers financeiro-backup.timer
  ls -lt backups/db/ | head
  tail -20 backups/db/backup.log

Horário padrão: 03:00 (fuso do servidor). Retenção: 30 dias.
Detalhes: deploy/systemd/README_BACKUP.txt

---

Se aparecer permission denied:

cd "/home/deploy/ControleSMDecor"
chmod +x scripts/backup_db.sh
./scripts/backup_db.sh

Caso queira pegar o mais recente

cd "/home/deploy/ControleSMDecor"
ls -1t backups/db/db-*.sqlite3 | head -1

Depois dar o comando

scp deploy@129.121.53.239:/home/deploy/ControleSMDecor/backups/db/db-2026-07-03_193957.sqlite3 "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-07-03_193957.sqlite3"


Se quiser pegar o banco do backup e colocar na localhost voce da

DA PASTA POR FORA DE BACKUP
copy /Y "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-07-03_193957.sqlite3 " db.sqlite3
python manage.py migrate --noinput


DO BACKUP DO SISTEMA
copy /Y "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor\backups\db\db-2026-07-03_193957.sqlite3" db.sqlite3
python manage.py migrate --noinput









se quiser pegar o banco local e mandar para VPS

salva na pasta de backup
cd /d "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor"
if not exist "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle" mkdir "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle"
for /f "delims=" %A in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd_HHmmss'"') do set STAMP=%A
copy /Y db.sqlite3 "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-local-%STAMP%.sqlite3"

manda para vps

scp "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\NOME_DO_BACKUP.sqlite3" deploy@129.121.53.239:/home/deploy/ControleSMDecor/db.sqlite3

















