import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";

/** Acesso à precificação: chefe, cliente ou funcionário com permissão. */
export function RequirePrecificacao({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.pode_acessar_precificacao) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
