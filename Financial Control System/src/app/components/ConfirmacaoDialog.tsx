import { useEffect, useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { api } from "../lib/api";

type SimpleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

/** Confirmação simples (OK / Cancelar), para alterações em venda e compra. */
export function SimpleConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
}: SimpleProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type SenhaProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onVerified: () => Promise<void>;
};

/** Confirmação com verificação da senha do usuário logado (ex.: excluir venda). */
export function ConfirmacaoComSenhaDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar com senha",
  onVerified,
}: SenhaProps) {
  const fieldId = useId();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setLoading(false);
    }
  }, [open]);

  const submit = async () => {
    if (!password.trim()) {
      toast.error("Digite sua senha");
      return;
    }
    setLoading(true);
    try {
      await api.authVerifyPassword(password);
      await onVerified();
      onOpenChange(false);
      setPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Senha incorreta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{description}</p>
              <p className="text-xs leading-relaxed">
                Digite apenas a <strong className="text-foreground font-medium">senha da conta com que está ligado</strong>{" "}
                (a mesma do login). O nome de utilizador não é pedido e não deve aparecer noutro campo.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="space-y-2 py-2"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) void submit();
          }}
        >
          <Label htmlFor={fieldId}>Senha</Label>
          <Input
            id={fieldId}
            name={`verif-${fieldId.replace(/[^a-zA-Z0-9]/g, "")}`}
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <Button type="button" disabled={loading || !password.trim()} onClick={() => void submit()}>
            {loading ? "Verificando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
