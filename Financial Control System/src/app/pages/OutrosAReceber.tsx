import React, { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { formatDateOnly } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { Receipt, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

interface Outro {
  id: number;
  descricao: string;
  valor: number;
  data_prevista: string | null;
}

export function OutrosAReceber() {
  const [itens, setItens] = useState<Outro[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");

  const load = () => {
    api.getOutrosAReceber()
      .then((data) => setItens(Array.isArray(data) ? data : []))
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (o: Outro) => {
    setEditId(o.id);
    setDescricao(o.descricao);
    setValor(String(o.valor));
    setDataPrevista(o.data_prevista ? o.data_prevista.slice(0, 10) : "");
    setOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setDescricao("");
    setValor("");
    setDataPrevista("");
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao.trim()) {
      toast.error("Descrição é obrigatória.");
      return;
    }
    if (isNaN(v)) {
      toast.error("Valor inválido.");
      return;
    }
    try {
      const payload = { descricao: descricao.trim(), valor: v, data_prevista: dataPrevista || undefined };
      if (editId) {
        await api.updateOutrosAReceber(String(editId), payload);
        toast.success("Item atualizado");
      } else {
        await api.createOutrosAReceber(payload);
        toast.success("Item cadastrado");
      }
      setOpen(false);
      load();
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteOutrosAReceber(String(id));
      toast.success("Item excluído");
      load();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Outros a receber</h1>
          <p className="text-muted-foreground">Recebimentos previstos (fora vendas)</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-2" />
          Novo item
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar item" : "Novo item a receber"}</DialogTitle>
            <DialogDescription>Descrição, valor e data prevista</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Aluguel a receber" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Data prevista (opcional)</Label>
              <Input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5" />
              Itens a receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Data prevista</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum item
                      </TableCell>
                    </TableRow>
                  ) : (
                    itens.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.descricao}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(o.valor)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateOnly(o.data_prevista)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(o)}>
                              <Pencil className="size-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                                  <AlertDialogDescription>{o.descricao}. Esta ação não pode ser desfeita.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(o.id)} className="bg-destructive text-destructive-foreground">
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive">
                                  <Trash2 className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </AlertDialog>
                          </div>
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
