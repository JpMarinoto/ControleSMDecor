import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";

/** Bloqueia perfil Cliente (role 3) — redireciona para precificação. */
export function BlockCliente({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.is_cliente) {
    return <Navigate to="/precificacao" replace />;
  }

  return <>{children}</>;
}
