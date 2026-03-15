import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { UserCheck, ChevronRight, Plus } from "lucide-react";
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
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

interface Funcionario {
  id: number;
  nome: string;
  salario: number;
  observacao?: string;
  total_horas_extras?: number;
  total_pago?: number;
  saldo_devedor?: number;
  ativo?: boolean;
}

export function FuncionariosList() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNovo, setOpenNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salarioNovo, setSalarioNovo] = useState("");
  const [observacaoNova, setObservacaoNova] = useState("");

  const load = () => {
    api.getFuncionarios()
      .then((data) => setFuncionarios(Array.isArray(data) ? data : []))
      .catch(() => setFuncionarios([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = nomeNovo.trim();
    if (!nome) {
      toast.error("Nome é obrigatório.");
      return;
    }
    const salario = parseFloat(String(salarioNovo).replace(",", "."));
    if (isNaN(salario) || salario < 0) {
      toast.error("Salário inválido.");
      return;
    }
    try {
      await api.createFuncionario({
        nome,
        salario: isNaN(salario) ? undefined : salario,
        observacao: observacaoNova.trim() || undefined,
      });
      toast.success("Funcionário cadastrado.");
      setNomeNovo("");
      setSalarioNovo("");
      setObservacaoNova("");
      setOpenNovo(false);
      load();
    } catch {
      toast.error("Erro ao cadastrar funcionário.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Funcionários</h1>
          <p className="text-muted-foreground">Cadastre funcionários, salário, horas extras e pagamentos</p>
        </div>
        <Dialog open={openNovo} onOpenChange={setOpenNovo}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Novo funcionário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar funcionário</DialogTitle>
              <DialogDescription>Nome e salário base. Horas extras e pagamentos você adiciona na ficha do funcionário.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCriar} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome completo" required />
              </div>
              <div>
                <Label>Salário (R$)</Label>
                <Input
                  type="text"
                  value={salarioNovo}
                  onChange={(e) => setSalarioNovo(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Observação (opcional)</Label>
                <Input
                  value={observacaoNova}
                  onChange={(e) => setObservacaoNova(e.target.value)}
                  placeholder="Ex.: função, período..."
                  maxLength={500}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenNovo(false)}>Cancelar</Button>
                <Button type="submit">Cadastrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="size-5" />
              Funcionários
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
                    <TableHead className="text-right">Salário</TableHead>
                    <TableHead className="text-right">Horas extras</TableHead>
                    <TableHead className="text-right">Total pago</TableHead>
                    <TableHead className="text-right">Saldo a pagar</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funcionarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum funcionário. Cadastre um novo acima.
                      </TableCell>
                    </TableRow>
                  ) : (
                    funcionarios.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.nome}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(Number(f.salario ?? 0))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(Number(f.total_horas_extras ?? 0))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(Number(f.total_pago ?? 0))}</TableCell>
                        <TableCell className={`text-right font-medium ${Number(f.saldo_devedor ?? 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {formatCurrency(Number(f.saldo_devedor ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/funcionarios/${f.id}`}>
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
