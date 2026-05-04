from django.apps import AppConfig


class FinanceiroConfig(AppConfig):
    name = 'financeiro'

    def ready(self):
        # SQLite em produção: modo WAL reduz bloqueios entre leituras (sessão) e escritas.
        # Sem isto, vários pedidos podem ficar à espera do lock e o nginx vê 504.
        from django.db.backends.signals import connection_created

        def _sqlite_pragmas(sender, connection, **kwargs):
            if connection.vendor != 'sqlite':
                return
            try:
                with connection.cursor() as cursor:
                    cursor.execute('PRAGMA journal_mode=WAL;')
                    cursor.execute('PRAGMA synchronous=NORMAL;')
                    cursor.execute('PRAGMA busy_timeout=30000;')
            except Exception:
                pass

        connection_created.connect(_sqlite_pragmas)
