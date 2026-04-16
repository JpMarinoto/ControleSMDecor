import React, { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { LayoutDashboard, Menu, UserPlus, ShoppingCart, TrendingUp, ArrowLeftRight, Wallet, FileText, ArrowDownCircle, Package, CreditCard, Receipt, Building2, Users, Truck, UserCog, LogOut, UserCircle, Tag } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { useAuth } from "../contexts/AuthContext";

/** Acima disto o header fica “compacto” (só estilo); altura da barra é fixa para não mudar o scroll máximo. */
const SCROLL_COMPACT_ENTER = 36;
const SCROLL_COMPACT_LEAVE = 10;

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [logoTryPng, setLogoTryPng] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHeaderCompact((prev) => {
        if (prev) return y > SCROLL_COMPACT_LEAVE;
        return y > SCROLL_COMPACT_ENTER;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  type NavItem = { name: string; path: string; icon: React.ComponentType<{ className?: string }> };

  // Funcionário: atalhos principais (Dashboard acessado pelo título)
  const navFuncionarioGroups: NavItem[][] = [
    [
      { name: 'Cadastro', path: '/cadastro', icon: UserPlus },
      { name: 'Nova Compra', path: '/compra', icon: ShoppingCart },
      { name: 'Nova Venda', path: '/venda', icon: TrendingUp },
      { name: 'Estoque', path: '/estoque', icon: Package },
    ],
    [{ name: 'Editar perfil', path: '/meus-dados', icon: UserCircle }],
  ];

  // Chefe: navegação agrupada em blocos mais enxutos (Dashboard acessado pelo título)
  const navChefeGroups: NavItem[][] = [
    // Operações do dia a dia
    [
      { name: 'Cadastro', path: '/cadastro', icon: UserPlus },
      { name: 'Vendas', path: '/venda', icon: TrendingUp },
      { name: 'Compras', path: '/compra', icon: ShoppingCart },
      { name: 'Estoque', path: '/estoque', icon: Package },
    ],
    // Relacionamentos
    [
      { name: 'Clientes', path: '/clientes', icon: Users },
      { name: 'Fornecedores', path: '/fornecedores', icon: Truck },
    ],
    // Dinheiro / bancos (subcategorias dentro de Finanças)
    [
      { name: 'Finanças', path: '/financas', icon: ArrowLeftRight },
    ],
    // Configurações e análises
    [
      { name: 'Precificação', path: '/precificacao', icon: Tag },
      { name: 'Logs', path: '/logs', icon: FileText },
      { name: 'Usuários', path: '/usuarios', icon: UserCog },
      { name: 'Editar perfil', path: '/meus-dados', icon: UserCircle },
    ],
  ];

  const navGroups = user?.is_chefe ? navChefeGroups : navFuncionarioGroups;
  const isFuncionario = !user?.is_chefe;
  const mainContentFullWidth =
    location.pathname === "/precificacao" || location.pathname.startsWith("/precificacao/");

  const NavLinks = ({ mobile = false, compact = false }: { mobile?: boolean; compact?: boolean }) => (
    <>
      {navGroups.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && (
            mobile ? (
              <div className="my-2 border-t border-border/60" aria-hidden />
            ) : (
              <div className="h-6 w-px bg-border shrink-0 mx-1.5" aria-hidden />
            )
          )}
          {group.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/financas'
              ? location.pathname === '/financas'
              : (location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path + '/')));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => mobile && setOpen(false)}
                className={`flex items-center rounded-md transition-colors ${
                  compact ? "gap-2 px-3 py-2 text-sm" : isFuncionario ? "gap-2.5 px-4 py-3 text-base" : "gap-2.5 px-4 py-3 text-base"
                } ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className={compact ? "size-5" : isFuncionario ? "size-5 shrink-0" : "size-5 md:size-5"} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Altura fixa: evita mudar altura do documento ao rolar (oscilação da barra no fim da página). */}
      <header
        className={`border-b bg-card text-card-foreground sticky top-0 z-10 transition-shadow duration-200 ${
          headerCompact ? "shadow-sm" : ""
        }`}
      >
        <div className="flex h-14 md:h-16 w-full items-center justify-between gap-6 md:gap-8 px-2 md:px-4">
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0 max-w-[200px] md:max-w-none">
            <div
              className={`flex shrink-0 items-center justify-center object-contain transition-all duration-200 ${
                headerCompact ? "h-7 w-7 md:h-8 md:w-8" : "h-8 w-8 md:h-9 md:w-9"
              }`}
            >
              {!logoError ? (
                <img
                  src={logoTryPng ? "/logo/logo.png" : "/logo/logo.jpg"}
                  alt="Logo SM Decor"
                  className="app-logo h-full w-full object-contain"
                  onError={() => (logoTryPng ? setLogoError(true) : setLogoTryPng(true))}
                />
              ) : (
                <span className="text-[10px] md:text-xs font-bold text-primary bg-primary/10 rounded px-1 flex items-center justify-center h-full w-full" title="Coloque logo.jpg em public/logo/">
                  SM
                </span>
              )}
            </div>
            <Link to="/" className="truncate text-foreground" onClick={() => setOpen(false)}>
              <span
                className={`font-bold truncate text-foreground transition-all duration-200 ${
                  headerCompact ? "text-xs md:text-sm" : "text-sm md:text-base"
                }`}
              >
                Controle SM Decor
              </span>
            </Link>
          </div>

          {/* Desktop: nav em uma linha, scroll horizontal só dentro do header */}
          <nav className="hidden md:flex items-center gap-1 md:gap-2 justify-start flex-1 min-w-0 overflow-x-auto whitespace-nowrap py-1 ml-2 [scrollbar-width:thin]">
            <NavLinks compact={headerCompact} />
            <div className="flex items-center gap-1 ml-auto shrink-0">
              {user && (
                <Link
                  to="/meus-dados"
                  className={`text-muted-foreground hover:text-foreground truncate max-w-[90px] transition-all duration-200 ${
                    headerCompact ? "text-[10px]" : "text-xs"
                  }`}
                  title={`${user.nome} — Meus dados`}
                >
                  {user.nome}
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => setLogoutConfirmOpen(true)}
              >
                <LogOut className="size-3.5 md:size-4" />
              </Button>
            </div>
          </nav>

          {/* Mobile Menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="flex flex-col gap-2 mt-8">
                <NavLinks mobile />
                {user && (
                  <div className="pt-4 border-t mt-4">
                    <p className="text-sm text-muted-foreground px-2">{user.nome}</p>
                    <Link
                      to="/meus-dados"
                      onClick={() => setOpen(false)}
                      className="block w-full rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      Meus dados
                    </Link>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setOpen(false);
                        setLogoutConfirmOpen(true);
                      }}
                    >
                      <LogOut className="size-4 mr-2" />
                      Sair
                    </Button>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main
        className={
          mainContentFullWidth
            ? "mx-auto w-full max-w-none px-3 sm:px-4 md:px-6 py-3 md:py-4 text-foreground [overflow-anchor:none]"
            : "container mx-auto px-2 md:px-3 py-3 md:py-4 text-foreground [overflow-anchor:none]"
        }
      >
        <Outlet />
      </main>

      {/* Confirmação ao sair */}
      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você será deslogado e precisará entrar novamente para acessar o sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async (e) => {
                e.preventDefault();
                setLogoutConfirmOpen(false);
                await logout();
                try {
                  sessionStorage.setItem("logout", "1");
                } catch {}
                await new Promise((r) => setTimeout(r, 150));
                window.location.href = "/login";
              }}
            >
              Sair
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}