import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export interface User {
  id: number;
  username: string;
  nome: string;
  role: string;
  is_chefe: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem("logout") === "1") {
        sessionStorage.removeItem("logout");
        setUser(null);
        try {
          await api.authLogout();
        } catch {
          // Garante limpeza no servidor mesmo após redirecionar; o token já é limpo pelo api.authLogout
        }
        setLoading(false);
        return;
      }
      const data = await api.authMe();
      setUser(data && typeof data === "object" && "id" in data ? data : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.authLogin(username, password);
    const userPayload =
      data && typeof data === "object" && "id" in data
        ? { id: data.id, username: data.username, nome: data.nome, role: data.role, is_chefe: data.is_chefe }
        : data;
    setUser(userPayload as User | null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.authLogout();
    } catch {
      // Mesmo se o servidor falhar (rede, etc.), encerramos a sessão no front
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
