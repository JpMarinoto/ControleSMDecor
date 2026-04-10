import React, { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Building2, ArrowLeft, Plus, RefreshCw } from "lucide-react";
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

interface Movimento {
  id: number;
  data: string;
  tipo: string;
  descricao: string;
  valor: number;
}

interface ContaData {
  conta: { id: number; nome: string; saldo: number };
  movimentos: Movimento[];
}

export function ContaBancoList() {
  const [contas, setContas] = useState<{ id: number; nome: string; saldo_atual?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [nomeConta, setNomeConta] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api.getContas()
      .then((data) => setContas(Array.isArray(data) ? data : []))
      .catch(() => setContas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const handleCreateConta = async (e: FormEvent) => {
    e.preventDefault();
    const nome = nomeConta.trim();
    if (!nome) {
      toast.error("Informe o nome da conta");
      return;
    }
    const saldo = saldoInicial
      ? parseFloat(saldoInicial.replace(",", "."))
      : 0;
    if (saldoInicial && (isNaN(saldo) || saldo < 0)) {
      toast.error("Saldo inicial inválido");
      return;
    }

    try {
      setCreating(true);
      await api.createConta({ nome, saldo_atual: saldo });
      toast.success("Conta criada com sucesso");
      setNomeConta("");
      setSaldoInicial("");
      setOpenCreate(false);
      load();
    } catch {
      toast.error("Erro ao criar conta");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Contas bancárias</h1>
        <p className="text-muted-foreground">Selecione uma conta para ver movimentos e saldo</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              Contas
            </CardTitle>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="size-4 mr-1" />
                  Nova conta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar conta bancária</DialogTitle>
                  <DialogDescription>Cadastre uma nova conta para controlar o saldo no sistema.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateConta} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="nomeConta">Nome da conta</Label>
                    <Input
                      id="nomeConta"
                      value={nomeConta}
                      onChange={(e) => setNomeConta(e.target.value)}
                      placeholder="Ex: Nubank, Itaú, Caixa..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="saldoInicial">Saldo inicial (opcional)</Label>
                    <Input
                      id="saldoInicial"
                      value={saldoInicial}
                      onChange={(e) => setSaldoInicial(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpenCreate(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? "Salvando..." : "Criar conta"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <div className="space-y-2">
                {contas.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma conta cadastrada. Cadastre em Cadastro → Contas.</p>
                ) : (
                  contas.map((c) => (
                    <Link
                      key={c.id}
                      to={`/conta-banco/${c.id}`}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(Number(c.saldo_atual ?? 0))}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export function ContaBancoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ContaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMov, setOpenMov] = useState(false);
  const [openSaldo, setOpenSaldo] = useState(false);
  const [tipoMov, setTipoMov] = useState<"entrada" | "saida">("entrada");
  const [descricaoMov, setDescricaoMov] = useState("");
  const [valorMov, setValorMov] = useState("");
  const [novoSaldo, setNovoSaldo] = useState("");

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getContaMovimentos(id)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleMovimento = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const v = parseFloat(valorMov.replace(",", "."));
    if (!descricaoMov.trim() || isNaN(v) || v <= 0) {
      toast.error("Descrição e valor positivo obrigatórios.");
      return;
    }
    try {
      const res = await api.createContaMovimento(id, {
        tipo: tipoMov,
        descricao: descricaoMov.trim(),
        valor: v,
      });
      if (res.error) {
        toast.error(res.error || "Erro ao registrar");
        return;
      }
      toast.success("Movimento registrado");
      setDescricaoMov("");
      setValorMov("");
      setOpenMov(false);
      load();
    } catch {
      toast.error("Erro ao registrar movimento");
    }
  };

  const handleAtualizarSaldo = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const s = parseFloat(novoSaldo.replace(",", "."));
    if (isNaN(s)) {
      toast.error("Saldo inválido.");
      return;
    }
    try {
      await api.atualizarSaldoConta(id, s);
      toast.success("Saldo atualizado");
      setOpenSaldo(false);
      load();
    } catch {
      toast.error("Erro ao atualizar saldo");
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  if (!id) return null;
  if (loading && !data) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Conta não encontrada.</p>;

  const { conta, movimentos } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/conta-banco">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold">{conta.nome}</h1>
          <p className="text-muted-foreground">Saldo atual: {formatCurrency(conta.saldo)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Dialog open={openMov} onOpenChange={setOpenMov}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Novo movimento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo movimento</DialogTitle>
              <DialogDescription>Entrada ou saída nesta conta</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleMovimento} className="space-y-4">
              <div>
                <Label>Tipo</Label>
                <Select value={tipoMov} onValueChange={(v) => setTipoMov(v as "entrada" | "saida")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={descricaoMov} onChange={(e) => setDescricaoMov(e.target.value)} placeholder="Ex: Depósito" />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="text" value={valorMov} onChange={(e) => setValorMov(e.target.value)} placeholder="0,00" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenMov(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={openSaldo} onOpenChange={setOpenSaldo}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <RefreshCw className="size-4 mr-2" />
              Atualizar saldo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atualizar saldo</DialogTitle>
              <DialogDescription>Informe o saldo atual da conta (conferência)</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAtualizarSaldo} className="space-y-4">
              <div>
                <Label>Novo saldo (R$)</Label>
                <Input
                  type="text"
                  value={novoSaldo}
                  onChange={(e) => setNovoSaldo(e.target.value)}
                  placeholder={String(conta.saldo)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenSaldo(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Atualizar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimentos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum movimento
                  </TableCell>
                </TableRow>
              ) : (
                movimentos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">
                      {m.data ? new Date(m.data).toLocaleString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell>{m.tipo === "entrada" ? "Entrada" : "Saída"}</TableCell>
                    <TableCell>{m.descricao}</TableCell>
                    <TableCell className={`text-right ${m.tipo === "entrada" ? "text-green-600" : "text-destructive"}`}>
                      {m.tipo === "entrada" ? "+" : "-"} {formatCurrency(m.valor)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
