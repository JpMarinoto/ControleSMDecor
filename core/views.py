"""
Views para servir o frontend React (Financial Control System) na raiz.
"""
import os
from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound


def react_spa(request, path=''):
    """Serve o index.html do build do React (Financial Control System) para qualquer rota (SPA)."""
    index_path = os.path.join(settings.BASE_DIR, 'Financial Control System', 'dist', 'index.html')
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            return HttpResponse(f.read(), content_type='text/html')
    return HttpResponseNotFound(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Build não encontrado</title></head><body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:1rem;">'
        '<h1>Build do React não encontrado</h1>'
        '<p>Para ver o frontend React na página inicial, abre um terminal, entra na pasta do projeto e executa:</p>'
        '<pre style="background:#f0f0f0;padding:1rem;border-radius:6px;">cd "Financial Control System"\nnpm install\nnpm run build</pre>'
        '<p>É preciso ter o <strong>Node.js</strong> instalado. Depois recarrega esta página.</p>'
        '<p><strong>Enquanto isso</strong>, podes usar o site em templates Django:</p>'
        '<p><a href="/legacy/" style="display:inline-block;background:#0d6efd;color:white;padding:0.5rem 1rem;text-decoration:none;border-radius:6px;">Abrir site em templates Django (legacy)</a></p>'
        '</body></html>',
        content_type='text/html; charset=utf-8'
    )
