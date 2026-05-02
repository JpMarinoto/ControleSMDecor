Reinícios agendados do backend (systemd timer)
==============================================

Objetivo: o systemd corre o serviço financeiro-restart.service nos horários
definidos em financeiro-restart.timer, executando "systemctl restart financeiro".

Instalação na VPS (uma vez, como root):

  sudo cp financeiro-restart.service financeiro-restart.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now financeiro-restart.timer
  sudo systemctl list-timers financeiro-restart.timer

Para alterar horários: edite OnCalendar em financeiro-restart.timer, depois:

  sudo systemctl daemon-reload
  sudo systemctl restart financeiro-restart.timer

Para desativar:

  sudo systemctl disable --now financeiro-restart.timer

Nota: cada reinício interrompe pedidos HTTP durante alguns segundos. Se o
serviço principal já tiver Restart=always no unit financeiro.service (ver
README_FINANCEIRO.txt e deploy/gunicorn.conf.py), os reinícios agendados
passam a ser opcionais — com SQLite use sempre um único worker Gunicorn.

README_FINANCEIRO.txt descreve o unit financeiro.service e o porquê de
workers=1 com SQLite.
