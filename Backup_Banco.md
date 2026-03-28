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


Depois dar esse comando **no PowerShell do PC** (mudar o nome do ficheiro se for outro):

```powershell
scp deploy@129.121.53.239:/home/deploy/ControleSMDecor/backups/db/db-2026-03-28_100757.sqlite3 "C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle\db-2026-03-28_100757.sqlite3"
```

(Há um **espaço** obrigatório entre o caminho remoto e o caminho local.)

---

## DO PC À VPS

Objetivo: copiar o `db.sqlite3` da pasta do projeto no Windows para a VPS (como cópia em `backups/db/` — mais seguro do que substituir o `db.sqlite3` em produção sem parar o serviço).

### 1. No PowerShell (na pasta do projeto ou com caminho completo)

```powershell
cd "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
scp .\db.sqlite3 "deploy@129.121.53.239:/home/deploy/ControleSMDecor/backups/db/db-local-$stamp.sqlite3"
```

- Pede password ou usa a chave SSH que já tiveres para `deploy@129.121.53.239`.
- O ficheiro fica na VPS em `backups/db/` com nome tipo `db-local-2026-03-28_143022.sqlite3`.

### 2. Se quiseres **substituir** o banco em produção na VPS

1. Para o serviço da app (ex.: Gunicorn/systemd) para não haver escrita durante a troca.
2. Faz backup do que está na VPS antes: `./scripts/backup_db.sh` (por SSH).
3. Envia o teu ficheiro por cima do `db.sqlite3`:

```powershell
scp "C:\Users\jpsma\OneDrive\Desktop\ControleSMDecor\db.sqlite3" deploy@129.121.53.239:/home/deploy/ControleSMDecor/db.sqlite3
```

4. Na VPS: `cd /home/deploy/ControleSMDecor && python manage.py migrate --noinput` (se houver migrações pendentes) e volta a iniciar o serviço.

### 3. Pasta local de cópias (opcional)

Antes do `scp`, podes guardar uma cópia no PC:

```powershell
Copy-Item ".\db.sqlite3" ".\backups\db\db-local-$stamp.sqlite3"
```

(Cria `backups\db` no projeto se ainda não existir.)