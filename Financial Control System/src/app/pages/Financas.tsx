import React from "react";
import { Link } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ArrowLeftRight, ArrowDownCircle, CreditCard, Wallet, Building2 } from "lucide-react";
import { Transactions } from "./Transactions";
import { Saidas } from "./Saidas";
import { DividasGerais } from "./DividasGerais";
import { Caixa } from "./Caixa";
import { ContaBancoList } from "./ContaBanco";

export function Financas() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Finanças</h1>
          <p className="text-muted-foreground">
            Transações, saídas, dívidas gerais, caixa e contas bancárias em um só lugar
          </p>
        </div>
      </div>

      <Tabs defaultValue="transacoes" className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="transacoes" className="flex items-center gap-2">
            <ArrowLeftRight className="size-4" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="saidas" className="flex items-center gap-2">
            <ArrowDownCircle className="size-4" />
            Saídas
          </TabsTrigger>
          <TabsTrigger value="dividas" className="flex items-center gap-2">
            <CreditCard className="size-4" />
            Dívidas gerais
          </TabsTrigger>
          <TabsTrigger value="caixa" className="flex items-center gap-2">
            <Wallet className="size-4" />
            Caixa
          </TabsTrigger>
          <TabsTrigger value="contas" className="flex items-center gap-2">
            <Building2 className="size-4" />
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
