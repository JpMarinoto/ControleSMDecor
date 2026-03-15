import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { toast } from "sonner";
import { User } from "lucide-react";
import { motion } from "motion/react";

export function MeusDados() {
  const { user, refetch } = useAuth();
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.nome != null) setNomeExibicao(user.nome);
  }, [user?.nome]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (novaSenha && novaSenha !== confirmarSenha) {
      toast.error("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (novaSenha && !senhaAtual) {
      toast.error("Informe a senha atual para alterar a senha.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: { nome_exibicao?: string; senha_atual?: string; nova_senha?: string } = {};
      if (nomeExibicao.trim()) payload.nome_exibicao = nomeExibicao.trim();
      if (novaSenha) {
        payload.senha_atual = senhaAtual;
        payload.nova_senha = novaSenha;
      }
      await api.updateMe(payload);
      await refetch();
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      toast.success("Dados atualizados.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Meus dados</h1>
        <p className="text-muted-foreground">Altere seu nome de exibição e senha</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              Perfil
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Usuário de login: <strong>{user?.username}</strong> (não pode ser alterado)
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="nome_exibicao">Nome de exibição</Label>
                <Input
                  id="nome_exibicao"
                  type="text"
                  value={nomeExibicao}
                  onChange={(e) => setNomeExibicao(e.target.value)}
                  placeholder="Como você quer aparecer no sistema"
                />
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-medium">Alterar senha</h3>
                <p className="text-sm text-muted-foreground">Deixe em branco se não quiser mudar a senha.</p>
                <div className="space-y-2">
                  <Label htmlFor="senha_atual">Senha atual</Label>
                  <Input
                    id="senha_atual"
                    type="password"
                    autoComplete="current-password"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    placeholder="Sua senha atual"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nova_senha">Nova senha</Label>
                  <Input
                    id="nova_senha"
                    type="password"
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar_senha">Confirmar nova senha</Label>
                  <Input
                    id="confirmar_senha"
                    type="password"
                    autoComplete="new-password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>

              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar alterações"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
