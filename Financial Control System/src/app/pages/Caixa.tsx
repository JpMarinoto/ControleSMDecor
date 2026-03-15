import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { formatDateOnly, getTodayLocalISO } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Wallet, UserCheck, Truck, Building2, ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
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

interface ContaItem {
  id: number;
  nome: string;
  saldo_atual?: number;
}

interface HistoricoItem {
  tipo: "recebimento" | "pagamento";
  id: number;
  id_interno: string;
  valor: number;
  data: string;
  metodo: string;
  conta_nome: string;
  nome: string;
}

export function Caixa() {
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: number; nome: string }[]>([]);
  const [contas, setContas] = useState<ContaItem[]>([]);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<"cliente" | "fornecedor">("cliente");
  const [clienteId, setClienteId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataPagamento, setDataPagamento] = useState(getTodayLocalISO());
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  const loadHistorico = () => {
    api.getCaixaHistorico(80).then((res: { items?: HistoricoItem[] }) => {
      const list = Array.isArray(res?.items) ? res.items : [];
      setHistorico(list);
    }).catch(() => setHistorico([]));
  };

  const normalizarContas = (res: any): ContaItem[] => {
    if (Array.isArray(res)) return res.map((x: any) => ({ id: x.id, nome: x.nome ?? "", saldo_atual: x.saldo_atual ?? x.saldo }));
    if (res && typeof res === "object" && Array.isArray(res.results)) return res.results.map((x: any) => ({ id: x.id, nome: x.nome ?? "", saldo_atual: x.saldo_atual ?? x.saldo }));
    if (res && typeof res === "object" && Array.isArray(res.data)) return res.data.map((x: any) => ({ id: x.id, nome: x.nome ?? "", saldo_atual: x.saldo_atual ?? x.saldo }));
    return [];
  };

  useEffect(() => {
    Promise.all([api.getClientes(), api.getFornecedores(), api.getContas()]).then(([c, f, contasRes]) => {
      setClientes(Array.isArray(c) ? c.map((x: any) => ({ id: x.id, nome: x.nome || x.nome_razao_social || "" })) : []);
      setFornecedores(Array.isArray(f) ? f.map((x: any) => ({ id: x.id, nome: x.nome || x.nome_razao_social || "" })) : []);
      setContas(normalizarContas(contasRes));
    }).catch(() => {});
    loadHistorico();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(valor.replace(",", "."));
    if (isNaN(v) || v <= 0) {
      toast.error("Informe um valor positivo.");
      return;
    }
    if (tipo === "cliente" && !clienteId) {
      toast.error("Selecione o cliente.");
      return;
    }
    if (tipo === "fornecedor" && !fornecedorId) {
      toast.error("Selecione o fornecedor.");
      return;
    }
    if (!metodo) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    try {
      const payload: { tipo: "cliente" | "fornecedor"; valor: number; metodo: string; data?: string; observacao?: string; cliente_id?: number; fornecedor_id?: number; conta_id?: number } =
        tipo === "cliente"
          ? { tipo: "cliente", valor: v, metodo, data: dataPagamento, cliente_id: parseInt(clienteId, 10) }
          : { tipo: "fornecedor", valor: v, metodo, data: dataPagamento, fornecedor_id: parseInt(fornecedorId, 10) };
      if (observacao.trim()) payload.observacao = observacao.trim();
      if (contaId) payload.conta_id = parseInt(contaId, 10);
      const res = await api.caixaPagamento(payload);
      if (res.error) {
        toast.error(res.error || "Erro ao registrar");
        return;
      }
      const msg = res.data_gravada ? `Registrado. Data gravada: ${res.data_gravada}` : "Pagamento registrado";
      toast.success(msg);
      setValor("");
      setClienteId("");
      setFornecedorId("");
      setContaId("");
      setMetodo("");
      setObservacao("");
      setDataPagamento(getTodayLocalISO());
      setOpen(false);
      loadHistorico();
    } catch {
      toast.error("Erro ao registrar pagamento");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <Link to="/financas" className="hover:underline">Finanças</Link>
          <span className="mx-2">/</span>
          <span>Caixa</span>
        </p>
        <h1 className="text-3xl font-semibold">Caixa</h1>
        <p className="text-muted-foreground">Registrar pagamento de cliente ou pagamento a fornecedor</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              Registrar pagamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (isOpen) { setDataPagamento(getTodayLocalISO()); api.getContas().then((r) => setContas(normalizarContas(r))).catch(() => {}); } }}>
                <DialogTrigger asChild>
                  <Button>Registrar pagamento (cliente ou fornecedor)</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registrar pagamento</DialogTitle>
                    <DialogDescription>
                      Pagamento recebido de cliente ou pagamento realizado a fornecedor
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>Tipo</Label>
                      <Select value={tipo} onValueChange={(v) => setTipo(v as "cliente" | "fornecedor")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cliente">
                            <span className="flex items-center gap-2">
                              <UserCheck className="size-4" /> Pagamento de cliente
                            </span>
                          </SelectItem>
                          <SelectItem value="fornecedor">
                            <span className="flex items-center gap-2">
                              <Truck className="size-4" /> Pagamento a fornecedor
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {tipo === "cliente" && (
                      <div>
                        <Label>Cliente</Label>
                        <Select value={clienteId} onValueChange={setClienteId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {clientes.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {tipo === "fornecedor" && (
                      <div>
                        <Label>Fornecedor</Label>
                        <Select value={fornecedorId} onValueChange={setFornecedorId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o fornecedor" />
                          </SelectTrigger>
                          <SelectContent>
                            {fornecedores.map((f) => (
                              <SelectItem key={f.id} value={String(f.id)}>
                                {f.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <Label>Data do pagamento</Label>
                      <Input
                        type="date"
                        value={dataPagamento}
                        onChange={(e) => setDataPagamento(e.target.value || getTodayLocalISO())}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Sugestão: hoje. Você pode alterar se quiser.</p>
                    </div>
                    <div>
                      <Label>Forma de pagamento *</Label>
                      <Select value={metodo} onValueChange={setMetodo} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a forma de pagamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pix">Pix</SelectItem>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="Cartão crédito">Cartão crédito</SelectItem>
                          <SelectItem value="Cartão débito">Cartão débito</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Observação (opcional)</Label>
                      <Input
                        type="text"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex.: ref. parcela 2, comprovante anexo..."
                        maxLength={255}
                      />
                    </div>
                    <div>
                      <Label>Conta bancária (opcional)</Label>
                      <Select value={contaId} onValueChange={setContaId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhuma (só registra o pagamento)" />
                        </SelectTrigger>
                        <SelectContent>
                          {contas.map((conta) => (
                            <SelectItem key={conta.id} value={String(conta.id)}>
                              <span className="flex items-center gap-2">
                                <Building2 className="size-4" />
                                {conta.nome}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Se escolher uma conta, o valor será lançado nela (entrada para cliente, saída para fornecedor).
                      </p>
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
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" />
            Histórico de pagamentos e recebimentos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Últimos recebimentos de clientes e pagamentos a fornecedores
          </p>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="space-y-2">
              {historico.map((item) => {
                const isRecebimento = item.tipo === "recebimento";
                const valorFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor);
                const dataFmt = item.data ? formatDateOnly(item.data) : "-";
                return (
                  <li
                    key={item.id_interno}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-sm ${
                      isRecebimento
                        ? "border-green-200 bg-green-50/80 dark:bg-green-950/20 dark:border-green-800"
                        : "border-red-200 bg-red-50/80 dark:bg-red-950/20 dark:border-red-800"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 shrink-0">
                      {isRecebimento ? (
                        <ArrowDownCircle className="size-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <ArrowUpCircle className="size-4 text-red-600 dark:text-red-400" />
                      )}
                      <span className={isRecebimento ? "text-green-700 dark:text-green-300 font-medium" : "text-red-700 dark:text-red-300 font-medium"}>
                        {valorFmt}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {isRecebimento ? `Recebido de ${item.nome}` : `Pago a ${item.nome}`}
                    </span>
                    <span className="text-muted-foreground">{dataFmt}</span>
                    {item.metodo && <span className="text-muted-foreground">{item.metodo}</span>}
                    {item.conta_nome && <span className="text-muted-foreground">Conta: {item.conta_nome}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
