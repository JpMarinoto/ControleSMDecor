Serviço financeiro (Gunicorn) — estabilidade com SQLite
========================================================

Problema frequente: vários workers Gunicorn + um único ficheiro SQLite levam a
"database is locked", erros 500 e workers a morrerem.

Solução no repositório:
  deploy/gunicorn.conf.py     → workers=1, worker gthread, threads=4, max_requests
  deploy/systemd/financeiro.service → Restart=always, ExecStart com esse config

Na VPS (uma vez, ou após git pull se alterou o unit):

  cd /home/deploy/ControleSMDecor
  git pull
  sudo cp deploy/systemd/financeiro.service /etc/systemd/system/financeiro.service

Edite o ficheiro copiado se User/WorkingDirectory/ExecStart não coincidirem com
a sua instalação. Confirme que GUNICORN_BIND (127.0.0.1:8000 por defeito) é o
mesmo endereço que o nginx usa em proxy_pass.

  sudo systemctl daemon-reload
  sudo systemctl restart financeiro
  sudo systemctl status financeiro --no-pager

Se antes usava um comando "gunicorn" à mão com --workers 3 ou default
((2*CPU)+1), esse era muito provavelmente o motivo das quedas.

Timer financeiro-restart.timer (reinícios às 08/14/20h)
-------------------------------------------------------
Serve só como manutenção preventiva; não corrige locks. Depois de aplicar
gunicorn.conf.py, pode desativar se não quiser interrupções:

  sudo systemctl disable --now financeiro-restart.timer

Ou reduza OnCalendar em financeiro-restart.timer (ex.: uma vez por semana).

Variáveis opcionais no .env ou no [Service] Environment=
--------------------------------------------------------
  GUNICORN_BIND=127.0.0.1:8000
  GUNICORN_THREADS=4
  SQLITE_TIMEOUT_SECONDS=30
