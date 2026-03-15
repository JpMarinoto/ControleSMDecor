import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const SIMPLE_ERROR = "Usuário ou senha incorretos.";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary/5">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!username.trim() || !password) {
      toast.error("Preencha usuário e senha");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success("Entrada realizada");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : SIMPLE_ERROR;
      const showMsg = msg.includes("incorretos") || msg.includes("negado") || msg.includes("inválidos") ? msg : SIMPLE_ERROR;
      setLoginError(showMsg);
      toast.error(showMsg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary/10 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(30,58,95,0.12)_0%,transparent_50%)] pointer-events-none" />
      <Card className="w-full max-w-sm relative shadow-xl border-primary/20 overflow-hidden bg-card">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 flex items-center justify-center overflow-hidden mb-4">
              <img
                src="/logo/logo.png"
                alt="Controle S M Decor"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent && !parent.querySelector(".logo-fallback")) {
                    const fallback = document.createElement("span");
                    fallback.className = "logo-fallback text-2xl font-bold text-primary";
                    fallback.textContent = "SMD";
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Controle S M Decor</h1>
            <p className="text-sm text-muted-foreground mt-1">Entre com seu usuário e senha</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu usuário"
                className="focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="focus-visible:ring-primary"
              />
            </div>
            {loginError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive text-center">
                {loginError}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary mt-2"
              disabled={submitting}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
