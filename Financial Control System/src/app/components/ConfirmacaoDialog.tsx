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
import { Textarea } from "./ui/textarea";
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
  /** Quando true, exige campo motivo (mín. 3 caracteres) além da senha. */
  requireMotivo?: boolean;
  onVerified: (ctx: { motivo: string }) => Promise<void>;
};

/** Confirmação com verificação da senha do usuário logado (ex.: excluir venda). */
export function ConfirmacaoComSenhaDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar com senha",
  requireMotivo = false,
  onVerified,
}: SenhaProps) {
  const fieldId = useId();
  const motivoId = useId();
  const [password, setPassword] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setMotivo("");
      setLoading(false);
    }
  }, [open]);

  const submit = async () => {
    if (!password.trim()) {
      toast.error("Digite sua senha");
      return;
    }
    if (requireMotivo) {
      const m = motivo.trim();
      if (m.length < 3) {
        toast.error("Informe o motivo da exclusão (mínimo 3 caracteres)");
        return;
      }
    }
    setLoading(true);
    try {
      await api.authVerifyPassword(password);
      await onVerified({ motivo: requireMotivo ? motivo.trim() : "" });
      onOpenChange(false);
      setPassword("");
      setMotivo("");
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
          {requireMotivo ? (
            <div className="space-y-2">
              <Label htmlFor={motivoId}>Motivo da exclusão</Label>
              <Textarea
                id={motivoId}
                name={`motivo-${motivoId.replace(/[^a-zA-Z0-9]/g, "")}`}
                placeholder="Descreva o motivo (obrigatório)"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="min-h-[4.5rem] resize-y"
              />
            </div>
          ) : null}
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
          <Button
            type="button"
            disabled={
              loading ||
              !password.trim() ||
              (requireMotivo && motivo.trim().length < 3)
            }
            onClick={() => void submit()}
          >
            {loading ? "Verificando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
