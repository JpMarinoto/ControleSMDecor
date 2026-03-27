DA VPS AO PC

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


Depois dar esse comando(MUDAR O NOME DO ARQUIVO)
scp deploy@129.121.53.239:/home/deploy/ControleSMDecor/backups/db/db-2026-03-26_130908.sqlite3"C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-03-26_130908.sqlite3"


DO PC A VPS