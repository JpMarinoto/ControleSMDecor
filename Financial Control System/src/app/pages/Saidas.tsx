import React, { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { formatDateOnly } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowDownCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

interface Saida {
  id: number;
  data: string;
  descricao: string;
  valor: number;
}

export function Saidas() {
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");

  const load = () => {
    api.getSaidas()
      .then((data) => setSaidas(Array.isArray(data) ? data : []))
      .catch(() => setSaidas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao.trim() || isNaN(v) || v <= 0) {
      toast.error("Preencha descrição e valor positivo.");
      return;
    }
    try {
      const res = await api.createSaida({ descricao: descricao.trim(), valor: v });
      if (res.error) {
        toast.error(res.error || "Erro ao registrar saída");
        return;
      }
      toast.success("Saída registrada");
      setDescricao("");
      setValor("");
      setOpen(false);
      load();
    } catch {
      toast.error("Erro ao registrar saída");
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Saídas (Movimentações)</h1>
          <p className="text-muted-foreground">Registro de saídas de caixa</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Nova saída
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova saída</DialogTitle>
              <DialogDescription>Registre uma saída de caixa</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Descrição</Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Despesa geral"
                />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input
                  type="text"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownCircle className="size-5" />
              Lista de saídas
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
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saidas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhuma saída registrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    saidas.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">
                          {formatDateOnly(s.data)}
                        </TableCell>
                        <TableCell>{s.descricao}</TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {formatCurrency(s.valor)}
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
