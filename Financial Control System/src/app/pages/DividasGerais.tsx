import React, { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { CreditCard, Pencil, Trash2, Plus } from "lucide-react";
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

interface Divida {
  id: number;
  nome: string;
  valor: number;
}

export function DividasGerais() {
  const [dividas, setDividas] = useState<Divida[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [dividaToDelete, setDividaToDelete] = useState<Divida | null>(null);

  const load = () => {
    api.getDividasGerais()
      .then((data) => setDividas(Array.isArray(data) ? data : []))
      .catch(() => setDividas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (d: Divida) => {
    setEditId(d.id);
    setNome(d.nome);
    setValor(String(d.valor));
    setOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setNome("");
    setValor("");
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(valor.replace(",", "."));
    if (!nome.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    if (isNaN(v)) {
      toast.error("Valor inválido.");
      return;
    }
    try {
      if (editId) {
        await api.updateDividaGeral(String(editId), { nome: nome.trim(), valor: v });
        toast.success("Dívida atualizada");
      } else {
        await api.createDividaGeral({ nome: nome.trim(), valor: v });
        toast.success("Dívida cadastrada");
      }
      setOpen(false);
      load();
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  const handleDeleteClick = (d: Divida) => {
    setDividaToDelete(d);
    setAlertOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!dividaToDelete) return;
    try {
      await api.deleteDividaGeral(String(dividaToDelete.id));
      toast.success("Dívida excluída");
      setAlertOpen(false);
      setDividaToDelete(null);
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
          <h1 className="text-3xl font-semibold">Dívidas gerais</h1>
          <p className="text-muted-foreground">Controle de dívidas diversas</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-2" />
          Nova dívida
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar dívida" : "Nova dívida"}</DialogTitle>
            <DialogDescription>Nome e valor da dívida</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Empréstimo" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
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
              <CreditCard className="size-5" />
              Lista de dívidas
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
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-40 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhuma dívida cadastrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    dividas.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.nome}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(d.valor)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(d)}
                            >
                              <Pencil className="size-3 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await api.updateDividaGeral(String(d.id), { valor: 0 });
                                  toast.success("Dívida marcada como paga");
                                  load();
                                } catch {
                                  toast.error("Erro ao marcar como paga");
                                }
                              }}
                            >
                              Pago
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDeleteClick(d)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
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

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dívida?</AlertDialogTitle>
            <AlertDialogDescription>
              {dividaToDelete
                ? `${dividaToDelete.nome} - ${formatCurrency(dividaToDelete.valor)}. Esta ação não pode ser desfeita.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDividaToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
