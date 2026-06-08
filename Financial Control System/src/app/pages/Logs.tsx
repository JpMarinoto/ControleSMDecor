import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { FileText } from "lucide-react";
import { motion } from "motion/react";
import { OrdensListPagination } from "../components/OrdensListPagination";

const LOGS_PAGE_SIZE = 50;

interface Log {
  id: number;
  data: string;
  acao: string;
  tabela: string;
  detalhes: string;
  usuario?: string | null;
}

export function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.getLogs()
      .then((data) => {
        setLogs(Array.isArray(data) ? data : []);
        setPage(1);
      })
      .catch(() => {
        setLogs([]);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const logsPagina = useMemo(() => {
    const start = (safePage - 1) * LOGS_PAGE_SIZE;
    return logs.slice(start, start + LOGS_PAGE_SIZE);
  }, [logs, safePage]);

  const getAcaoVariant = (acao: string | undefined) => {
    if (!acao) return "outline" as const;
    const a = acao.toLowerCase();
    if (a.includes("criar") || a.includes("entrada") || a.includes("pagamento (cliente)") || a.includes("entrada estoque")) {
      return "success" as const;
    }
    if (a.includes("editar") || a.includes("atualizar") || a.includes("ajuste")) {
      return "secondary" as const;
    }
    if (a.includes("excluir") || a.includes("cancelar") || a.includes("saída") || a.includes("pagamento (fornecedor)")) {
      return "destructive" as const;
    }
    return "outline" as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Logs do sistema</h1>
        <p className="text-muted-foreground">Todas as alterações feitas no sistema: quem fez e o que foi feito</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Registro de auditoria (ação, usuário e detalhes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum log encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    logsPagina.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {log.data ? new Date(log.data).toLocaleString('pt-BR') : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap max-w-[160px] truncate">
                          {log.usuario || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={getAcaoVariant(log.acao)} className="text-xs px-2 py-0.5">
                            {log.acao || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.tabela || '-'}</TableCell>
                        <TableCell className="max-w-md" title={log.detalhes || undefined}>
                          <span className="line-clamp-2">{log.detalhes || '-'}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
            {!loading && logs.length > 0 && (
              <OrdensListPagination
                className="mt-4 border-t pt-4"
                page={safePage}
                totalItems={logs.length}
                pageSize={LOGS_PAGE_SIZE}
                onPageChange={setPage}
                itemLabel="registros"
              />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
