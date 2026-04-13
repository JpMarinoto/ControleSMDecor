import React from "react";
import { Link } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ArrowLeftRight, ArrowDownCircle, CreditCard, Wallet, Building2, PiggyBank } from "lucide-react";
import { Transactions } from "./Transactions";
import { Saidas } from "./Saidas";
import { DividasGerais } from "./DividasGerais";
import { Caixa } from "./Caixa";
import { ContaBancoList } from "./ContaBanco";
import { FinancasLucros } from "./FinancasLucros";

export function Financas() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Finanças</h1>
          <p className="text-muted-foreground">
            Transações, saídas, dívidas, lucros, caixa e contas bancárias em um só lugar
          </p>
        </div>
      </div>

      <Tabs defaultValue="transacoes" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto p-1 justify-start sm:justify-center max-w-5xl">
          <TabsTrigger value="transacoes" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <ArrowLeftRight className="size-4 shrink-0" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="saidas" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <ArrowDownCircle className="size-4 shrink-0" />
            Saídas
          </TabsTrigger>
          <TabsTrigger value="dividas" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <CreditCard className="size-4 shrink-0" />
            Dívidas gerais
          </TabsTrigger>
          <TabsTrigger value="lucros" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <PiggyBank className="size-4 shrink-0" />
            Lucros
          </TabsTrigger>
          <TabsTrigger value="caixa" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <Wallet className="size-4 shrink-0" />
            Caixa
          </TabsTrigger>
          <TabsTrigger value="contas" className="flex items-center gap-1.5 shrink-0 px-2.5 text-xs sm:text-sm">
            <Building2 className="size-4 shrink-0" />
            Contas banco
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transacoes" className="mt-6">
          <Transactions />
        </TabsContent>
        <TabsContent value="saidas" className="mt-6">
          <Saidas />
        </TabsContent>
        <TabsContent value="dividas" className="mt-6">
          <DividasGerais />
        </TabsContent>
        <TabsContent value="lucros" className="mt-6">
          <FinancasLucros />
        </TabsContent>
        <TabsContent value="caixa" className="mt-6">
          <Caixa />
        </TabsContent>
        <TabsContent value="contas" className="mt-6">
          <ContaBancoList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
