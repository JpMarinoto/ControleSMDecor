"""Backup do SQLite com cópia consistente (sqlite3 .backup) e rotação de ficheiros."""
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Gera backup do db.sqlite3 em backups/db/db-AAAA-MM-DD_HHMMSS.sqlite3. "
        "Por omissão remove cópias com mais de 14 dias."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--retention-days",
            type=int,
            default=14,
            help="Apagar backups mais antigos que N dias (0 = não apagar).",
        )

    def handle(self, *args, **options):
        retention = int(options["retention_days"])
        db = settings.DATABASES["default"]
        if "sqlite" not in db["ENGINE"]:
            raise CommandError("Este comando só funciona com SQLite.")

        db_path = Path(db["NAME"])
        project_dir = Path(settings.BASE_DIR)
        backup_dir = project_dir / "backups" / "db"
        backup_dir.mkdir(parents=True, exist_ok=True)

        if not db_path.is_file():
            self.stdout.write(self.style.WARNING(f"Ficheiro inexistente: {db_path} — nada a copiar."))
            return

        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
        out = backup_dir / f"db-{stamp}.sqlite3"

        sqlite3_bin = shutil.which("sqlite3")
        if sqlite3_bin:
            dest = str(out.resolve())
            backup_sql = f'.backup "{dest}"'
            try:
                subprocess.run(
                    [sqlite3_bin, str(db_path.resolve()), backup_sql],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            except subprocess.CalledProcessError as e:
                raise CommandError(
                    f"sqlite3 .backup falhou: {e.stderr or e.stdout or e}"
                ) from e
            self.stdout.write(self.style.SUCCESS(f"Backup (sqlite3): {out}"))
        else:
            shutil.copy2(db_path, out)
            self.stdout.write(
                self.style.WARNING(
                    f"Backup (cópia simples): {out}\n"
                    "Instale o CLI sqlite3 para cópia mais segura com o servidor a correr."
                )
            )

        if retention > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention)
            for p in backup_dir.glob("db-*.sqlite3"):
                try:
                    mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
                    if mtime < cutoff:
                        p.unlink()
                        self.stdout.write(f"Removido (rotação): {p.name}")
                except OSError:
                    pass

        recent = sorted(backup_dir.glob("db-*.sqlite3"), key=lambda x: x.stat().st_mtime, reverse=True)[
            :5
        ]
        self.stdout.write("Últimos backups:")
        for p in recent:
            self.stdout.write(f"  {p.name}")
