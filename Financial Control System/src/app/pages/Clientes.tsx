import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { formatDateOnly } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Users, ChevronRight, Printer, Calendar, FileText } from "lucide-react";
import { motion } from "motion/react";
import { DocumentPrintPreview } from "../components/DocumentPrintPreview";

interface Cliente {
  id: number;
  nome: string;
  telefone?: string;
  cpf?: string;
  cnpj?: string;
  saldo_devedor?: number;
}

function getSemanaAtual() {
  const hoje = new Date();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - hoje.getDay() + 1);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return {
    data_inicio: seg.toISOString().split("T")[0],
    data_fim: dom.toISOString().split("T")[0],
  };
}

export function ClientesList() {
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [usarFiltro, setUsarFiltro] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);

  const load = (params?: { data_inicio?: string; data_fim?: string }) => {
    setLoading(true);
    api
      .getClientes(params)
      .then((data) => setClientes(Array.isArray(data) ? data : []))
      .catch(() => setClientes([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const aplicarFiltro = () => {
    if (usarFiltro && dataInicio && dataFim) {
      load({ data_inicio: dataInicio, data_fim: dataFim });
    } else {
      load();
    }
  };

  const fechamentoSemanal = () => {
    const { data_inicio, data_fim } = getSemanaAtual();
    setDataInicio(data_inicio);
    setDataFim(data_fim);
    setUsarFiltro(true);
    load({ data_inicio, data_fim });
  };

  const limparFiltro = () => {
    setDataInicio("");
    setDataFim("");
    setUsarFiltro(false);
    load();
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const totalAReceber = clientes.reduce((s, c) => s + Number(c.saldo_devedor ?? 0), 0);

  const imprimir = () => {
    if (!printRef.current) return;
    const colSaldo = isChefe ? "<th>Saldo devedor</th>" : "";
    const totalLinha = isChefe ? `<p class="total">Total a receber: ${formatCurrency(totalAReceber)}</p>` : "";
    const linhas = clientes.map(
      (c) =>
        `<tr><td>${c.nome}</td><td>${c.telefone || "-"}</td><td>${c.cpf || c.cnpj || "-"}</td>${isChefe ? `<td>${formatCurrency(Number(c.saldo_devedor ?? 0))}</td>` : ""}</tr>`
    );
    const html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Clientes – Fechamento</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
            th { background: #f5f5f5; }
            .total { font-weight: bold; margin-top: 12px; }
            .periodo { color: #666; margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <h1>Clientes ${isChefe ? "– Contas a receber" : ""}</h1>
          ${usarFiltro && dataInicio && dataFim ? `<p class="periodo">Período: ${new Date(dataInicio).toLocaleDateString("pt-BR")} a ${new Date(dataFim).toLocaleDateString("pt-BR")}</p>` : ""}
          <table>
            <thead><tr><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th>${colSaldo}</tr></thead>
            <tbody>${linhas.join("")}</tbody>
          </table>
          ${totalLinha}
          <p><small>Impresso em ${new Date().toLocaleString("pt-BR")}</small></p>
        </body>
      </html>
    `;
    setPrintPreview({
      html,
      titulo: "Lista de clientes",
      downloadBaseName: "lista-clientes",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Clientes</h1>
          <p className="text-muted-foreground">Lista de clientes, filtro por data e fechamento semanal</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fechamentoSemanal}>
            <Calendar className="size-4 mr-2" />
            Fechamento semanal
          </Button>
          <Button variant="outline" size="sm" onClick={imprimir} disabled={clientes.length === 0}>
            <Printer className="size-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>

      <Card ref={printRef} className="no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Lista de clientes
          </CardTitle>
          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm">Data início</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm">Data fim</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-40"
              />
            </div>
            <Button size="sm" onClick={aplicarFiltro}>
              Filtrar
            </Button>
            {(usarFiltro || dataInicio || dataFim) && (
              <Button size="sm" variant="ghost" onClick={limparFiltro}>
                Limpar filtro
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {usarFiltro && dataInicio && dataFim && (
            <p className="text-sm text-muted-foreground mb-3">
              Exibindo clientes com vendas no período: {formatDateOnly(dataInicio)} a{" "}
              {formatDateOnly(dataFim)}
            </p>
          )}
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    {isChefe && (
                      <TableHead className="text-right">Saldo devedor</TableHead>
                    )}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isChefe ? 5 : 4} className="text-center text-muted-foreground">
                        Nenhum cliente encontrado. {usarFiltro ? "Tente outro período ou limpe o filtro." : "Cadastre em Cadastro → Clientes."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    clientes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{c.telefone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{c.cpf || c.cnpj || "-"}</TableCell>
                        {isChefe && (
                          <TableCell className={`text-right font-medium ${Number(c.saldo_devedor ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {formatCurrency(Number(c.saldo_devedor ?? 0))}
                          </TableCell>
                        )}
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/clientes/${c.id}`}>
                              <ChevronRight className="size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {clientes.length > 0 && isChefe && (
                <div className="mt-4 flex justify-end border-t pt-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-5 text-muted-foreground" />
                    <span className="text-muted-foreground">Total a receber (lista atual):</span>
                    <span className={`text-xl font-bold ${totalAReceber > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(totalAReceber)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <DocumentPrintPreview
        open={printPreview != null}
        onOpenChange={(o) => {
          if (!o) setPrintPreview(null);
        }}
        html={printPreview?.html ?? ""}
        titulo={printPreview?.titulo ?? ""}
        downloadBaseName={printPreview?.downloadBaseName}
      />
    </div>
  );
}
