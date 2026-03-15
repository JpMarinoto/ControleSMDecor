import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";

/**
 * Só mostra o conteúdo se o utilizador for Chefe (role 1).
 * Funcionários (role 2) são redirecionados para o Dashboard.
 */
export function RequireChefe({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.is_chefe) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
