DA VPS AO PC


ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
./scripts/backup_db.sh
ls -lt backups/db/ | head

Se aparecer permission denied:

cd "/home/deploy/ControleSMDecor"
chmod +x scripts/backup_db.sh
./scripts/backup_db.sh

Caso queira pegar o mais recente

cd "/home/deploy/ControleSMDecor"
ls -1t backups/db/db-*.sqlite3 | head -1

Depois dar o comando

scp deploy@129.121.53.239:/home/deploy/ControleSMDecor/backups/db/db-2026-04-12_223849.sqlite3 "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-04-12_223849.sqlite3"


Sequiser pegar o banco do backup e colocar na localhost voce da


DO BACKUP DO SISTEMA
copy /Y "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor\backups\db\NOMEDOBANCO" db.sqlite3
python manage.py migrate --noinput


DA PASTA POR FORA DE BACKUP
copy /Y "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-04-08_193912.sqlite3" db.sqlite3
python manage.py migrate --noinput







se quiser pegar o banco local e mandar para VPS

salva na pasta de backup
cd /d "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor"
if not exist "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle" mkdir "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle"
for /f "delims=" %A in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd_HHmmss'"') do set STAMP=%A
copy /Y db.sqlite3 "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-local-%STAMP%.sqlite3"

manda para vps

scp "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\NOME_DO_BACKUP.sqlite3" deploy@129.121.53.239:/home/deploy/ControleSMDecor/db.sqlite3

















