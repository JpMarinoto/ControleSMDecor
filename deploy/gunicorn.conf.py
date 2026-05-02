"""
Gunicorn — configuração compatível com SQLite no mesmo servidor.

CRÍTICO: com django.db.backends.sqlite3 use apenas workers=1. Vários processos
abrem o mesmo ficheiro .sqlite3 e causam locks, 500 e morte dos workers.

Concorrência: worker_class gthread + threads > 1 atende vários pedidos no mesmo
processo (Django trata uma conexão SQLite por thread).

Variáveis de ambiente (opcional):
  GUNICORN_BIND   — ex.: 127.0.0.1:8000 ou unix:/run/financeiro/g.sock
"""
import os

bind = os.environ.get('GUNICORN_BIND', '127.0.0.1:8000')

# Um único processo — obrigatório para SQLite partilhado.
workers = 1
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '4'))

timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))
graceful_timeout = int(os.environ.get('GUNICORN_GRACEFUL_TIMEOUT', '30'))

# Recicla o worker para mitigar vazamento de memória em libs C/Python.
max_requests = int(os.environ.get('GUNICORN_MAX_REQUESTS', '2000'))
max_requests_jitter = int(os.environ.get('GUNICORN_MAX_REQUESTS_JITTER', '200'))

accesslog = os.environ.get('GUNICORN_ACCESS_LOG', '-')
errorlog = os.environ.get('GUNICORN_ERROR_LOG', '-')
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'info')

# Nome estável nos logs (worker único).
proc_name = 'financeiro'

# Reduz aviso "WORKER TIMEOUT" em pedidos longos (relatórios, collectstatic em dev).
limit_request_line = 8190
