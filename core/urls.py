import os
from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from django.views.static import serve

from core.views import react_spa

# Pasta do build do React (Financial Control System)
FCS_DIST = os.path.join(settings.BASE_DIR, 'Financial Control System', 'dist')

urlpatterns = [
    path('admin/', admin.site.urls),
    # API REST para o frontend React
    path('api/', include('financeiro.urls_api')),
    # Site antigo (templates Django) em /legacy/ para referência
    path('legacy/', include('financeiro.urls')),
    # Frontend React na raiz: ficheiros estáticos do build
    path('assets/<path:path>', serve, {'document_root': os.path.join(FCS_DIST, 'assets')}),
    # Public do Vite (ex.: public/logo/logo.png → dist/logo/) — antes da SPA para não devolver index.html
    path('logo/<path:path>', serve, {'document_root': os.path.join(FCS_DIST, 'logo')}),
    # SPA: qualquer rota devolve index.html do Financial Control System
    path('', react_spa),
    path('<path:path>', react_spa),
]
