import React from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  TrendingUp,
  ShoppingCart,
  Package as PackageIcon,
  Users,
  ArrowLeftRight,
  Wallet,
  Truck,
  DollarSign,
  Tag,
  FileText,
  UserCog,
  UserPlus,
  Banknote,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

/** Dashboard do funcionário: atalhos para Venda, Compra, Estoque e Cadastro. */
function DashboardFuncionario() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Atalhos rápidos</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
        <Link to="/venda">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <TrendingUp className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Nova Venda</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Registrar venda para cliente</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/compra">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <ShoppingCart className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Nova Compra</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Registrar compra de materiais</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/estoque">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <PackageIcon className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Estoque</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Contagem e ajustes por categoria</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/cadastro">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Users className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Cadastro</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Clientes, fornecedores e produtos</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
      </div>
    </div>
  );
}

type ChefeLink = {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  delay: number;
};

const CHEFE_LINKS_OPERACAO: ChefeLink[] = [
  { to: "/cadastro", title: "Cadastro", description: "Clientes, fornecedores e produtos", icon: UserPlus, delay: 0 },
  { to: "/venda", title: "Vendas", description: "Registar e consultar vendas", icon: TrendingUp, delay: 0.04 },
  { to: "/compra", title: "Compras", description: "Registar e consultar compras", icon: ShoppingCart, delay: 0.08 },
  { to: "/estoque", title: "Estoque", description: "Materiais, produtos e totais de inventário", icon: PackageIcon, delay: 0.12 },
];

const CHEFE_LINKS_FINANCAS: ChefeLink[] = [
  {
    to: "/financas",
    title: "Finanças",
    description: "Aba «Visão geral»: gráficos e resumo; demais abas: transações, caixa, contas, etc.",
    icon: ArrowLeftRight,
    delay: 0.16,
  },
  {
    to: "/financas/caixa",
    title: "Caixa",
    description: "Movimentos de caixa e conciliação",
    icon: Wallet,
    delay: 0.2,
  },
  {
    to: "/clientes",
    title: "Clientes",
    description: "Lista, contas a receber e saldo por cliente",
    icon: Users,
    delay: 0.24,
  },
  {
    to: "/fornecedores",
    title: "Fornecedores",
    description: "Lista, dívidas e compras por fornecedor",
    icon: Truck,
    delay: 0.28,
  },
  {
    to: "/outros-a-receber",
    title: "Outros a receber",
    description: "Valores a receber fora de clientes",
    icon: Banknote,
    delay: 0.32,
  },
  {
    to: "/conta-banco",
    title: "Contas bancárias",
    description: "Saldos e movimentos por conta",
    icon: DollarSign,
    delay: 0.36,
  },
];

const CHEFE_LINKS_ADMIN: ChefeLink[] = [
  { to: "/precificacao", title: "Precificação", description: "Shopee, TikTok e tabelas de preço", icon: Tag, delay: 0.4 },
  { to: "/logs", title: "Logs", description: "Registo de atividade do sistema", icon: FileText, delay: 0.44 },
  { to: "/usuarios", title: "Usuários", description: "Perfis Chefe e Funcionário", icon: UserCog, delay: 0.48 },
];

function ChefeLinkCard({ to, title, description, icon: Icon, delay }: ChefeLink) {
  return (
    <Link to={to}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay }}
        className="h-full"
      >
        <Card className="h-full border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <Icon className="size-5 shrink-0" />
              </span>
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
            <p className="text-xs text-primary mt-3 font-medium">Abrir →</p>
          </CardContent>
        </Card>
      </motion.div>
    </Link>
  );
}

/** Dashboard do chefe: só atalhos — valores e listas ficam nas páginas indicadas. */
function DashboardChefe() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground max-w-2xl">
          Aqui não são mostrados totais nem listas financeiras. Os dados estão nas secções abaixo — abra cada uma para
          consultar valores, gráficos e histórico.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Operação</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHEFE_LINKS_OPERACAO.map((item) => (
            <ChefeLinkCard key={item.to} {...item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Finanças e contas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHEFE_LINKS_FINANCAS.map((item) => (
            <ChefeLinkCard key={item.to} {...item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Administração</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHEFE_LINKS_ADMIN.map((item) => (
            <ChefeLinkCard key={item.to} {...item} />
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Perfil e senha: menu lateral <span className="font-medium text-foreground">Editar perfil</span> ou{" "}
        <Link to="/meus-dados" className="text-primary underline-offset-4 hover:underline">
          /meus-dados
        </Link>
        .
      </p>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  if (!user?.is_chefe) return <DashboardFuncionario />;
  return <DashboardChefe />;
}
