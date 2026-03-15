import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Dashboard } from "./pages/Dashboard";
import { Cadastro } from "./pages/Cadastro";
import { Compra } from "./pages/Compra";
import { Venda } from "./pages/Venda";
import { Layout } from "./components/Layout";
import { Logs } from "./pages/Logs";
import { Estoque } from "./pages/Estoque";
import { Financas } from "./pages/Financas";
import { OutrosAReceber } from "./pages/OutrosAReceber";
import { Caixa } from "./pages/Caixa";
import { ContaBancoList, ContaBancoDetalhe } from "./pages/ContaBanco";
import { ClientesList } from "./pages/Clientes";
import { ClienteDetalhe } from "./pages/ClienteDetalhe";
import { FornecedoresList } from "./pages/Fornecedores";
import { FornecedorDetalhe } from "./pages/FornecedorDetalhe";
import { Login } from "./pages/Login";
import { Usuarios } from "./pages/Usuarios";
import { MeusDados } from "./pages/MeusDados";
import { Precificacao } from "./pages/Precificacao";
import { RequireAuth } from "./components/RequireAuth";
import { RequireChefe } from "./components/RequireChefe";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, Component: Dashboard },
      { path: "cadastro", Component: Cadastro },
      { path: "compra", Component: Compra },
      { path: "venda", Component: Venda },
      { path: "estoque", Component: Estoque },
      { path: "caixa", element: <Navigate to="/financas/caixa" replace /> },
      { path: "financas", element: <RequireChefe><Financas /></RequireChefe> },
      { path: "financas/caixa", element: <RequireChefe><Caixa /></RequireChefe> },
      { path: "clientes", element: <RequireChefe><ClientesList /></RequireChefe> },
      { path: "clientes/:id", element: <RequireChefe><ClienteDetalhe /></RequireChefe> },
      { path: "fornecedores", element: <RequireChefe><FornecedoresList /></RequireChefe> },
      { path: "fornecedores/:id", element: <RequireChefe><FornecedorDetalhe /></RequireChefe> },
      { path: "meus-dados", Component: MeusDados },
      // Rotas só para Chefe: finanças (transações + saídas + dívidas gerais), caixa, contas, logs, usuários
      { path: "transacoes", element: <Navigate to="/financas" replace /> },
      { path: "saidas", element: <Navigate to="/financas" replace /> },
      { path: "dividas-gerais", element: <Navigate to="/financas" replace /> },
      { path: "logs", element: <RequireChefe><Logs /></RequireChefe> },
      { path: "outros-a-receber", element: <RequireChefe><OutrosAReceber /></RequireChefe> },
      { path: "precificacao", element: <RequireChefe><Precificacao /></RequireChefe> },
      { path: "conta-banco", element: <RequireChefe><ContaBancoList /></RequireChefe> },
      { path: "conta-banco/:id", element: <RequireChefe><ContaBancoDetalhe /></RequireChefe> },
      { path: "usuarios", element: <RequireChefe><Usuarios /></RequireChefe> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);