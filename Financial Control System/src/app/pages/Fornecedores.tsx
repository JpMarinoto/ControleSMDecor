import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Truck, ChevronRight, Ban } from "lucide-react";
import { motion } from "motion/react";

interface Fornecedor {
  id: number;
  nome: string;
  telefone?: string;
  saldo_devedor?: number;
  ativo?: boolean;
}

export function FornecedoresList() {
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFornecedores()
      .then((data) => setFornecedores(Array.isArray(data) ? data : []))
      .catch(() => setFornecedores([]))
      .finally(() => setLoading(false));
  }, []);

  const fmt = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    []
  );

  const totais = useMemo(() => {
    const soma = fornecedores.reduce((s, f) => s + Math.max(0, Number(f.saldo_devedor ?? 0)), 0);
    return { soma };
  }, [fornecedores]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Fornecedores</h1>
        <p className="text-muted-foreground">Lista de fornecedores — clique para ver detalhes e pagar</p>
      </div>

      {isChefe && !loading && fornecedores.length > 0 && (
        <div className="max-w-xl rounded-md border border-border/50 bg-muted/25 px-3 py-2.5 shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-normal text-muted-foreground">
              Total em aberto com fornecedores
            </span>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {fmt.format(totais.soma)}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground/80 mt-1.5">
            Soma da coluna «Valor que devo» (todos os fornecedores).
          </p>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5" />
              Fornecedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    {isChefe && <TableHead className="text-right">Valor que devo</TableHead>}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fornecedores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isChefe ? 4 : 3} className="text-center text-muted-foreground">
                        Nenhum fornecedor. Cadastre em Cadastro → Fornecedores.
                      </TableCell>
                    </TableRow>
                  ) : (
                    fornecedores.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className={f.ativo === false ? "line-through text-muted-foreground" : ""}>{f.nome}</span>
                            {f.ativo === false && (
                              <Badge variant="outline" className="text-xs flex items-center gap-1">
                                <Ban className="size-3 text-red-500" />
                                Inativo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f.telefone || "-"}</TableCell>
                        {isChefe && (
                          <TableCell className={`text-right font-medium ${Number(f.saldo_devedor ?? 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(f.saldo_devedor ?? 0))}
                          </TableCell>
                        )}
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/fornecedores/${f.id}`}>
                              <ChevronRight className="size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
