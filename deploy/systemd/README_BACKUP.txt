Backup automático diário (systemd timer)
========================================

Gera cópias em backups/db/db-AAAA-MM-DD_HHMMSS.sqlite3 e apaga ficheiros
com mais de 30 dias (RETENTION_DAYS no financeiro-backup.service).

Pré-requisito (recomendado, cópia segura com app a correr):

  sudo dnf install -y sqlite

Instalação na VPS (uma vez, na pasta do projeto):

  cd /home/deploy/ControleSMDecor
  git pull
  chmod +x scripts/backup_db.sh
  sudo cp deploy/systemd/financeiro-backup.service deploy/systemd/financeiro-backup.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now financeiro-backup.timer

Testar agora (sem esperar 03:00):

  sudo systemctl start financeiro-backup.service
  ls -lt backups/db/
  tail -20 backups/db/backup.log

Verificar agendamento:

  systemctl list-timers financeiro-backup.timer

Alterar horário: edite OnCalendar em financeiro-backup.timer, depois:

  sudo systemctl daemon-reload
  sudo systemctl restart financeiro-backup.timer

Desativar:

  sudo systemctl disable --now financeiro-backup.timer

Restaurar um backup: ver Backup_Banco.md na raiz do repositório.
