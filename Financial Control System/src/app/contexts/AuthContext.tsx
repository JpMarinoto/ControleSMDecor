import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
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

/** Encerra a sessão automaticamente após N minutos sem atividade do usuário. */
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
/** Eventos que contam como "atividade" para reiniciar o cronômetro de inatividade. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
];

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

  /**
   * Auto-logout por inatividade: enquanto há um usuário logado, reinicia um cronômetro a cada
   * evento de atividade (mouse, teclado, toque, scroll). Se passar IDLE_TIMEOUT_MS sem atividade,
   * encerra a sessão e mostra um aviso. RequireAuth redireciona para /login automaticamente.
   */
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const limparTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const dispararLogoutPorInatividade = () => {
      limparTimer();
      toast.info("Sessão encerrada por inatividade (20 minutos sem atividade).");
      void logout();
    };

    const reiniciarTimer = () => {
      lastActivityRef.current = Date.now();
      limparTimer();
      idleTimerRef.current = window.setTimeout(dispararLogoutPorInatividade, IDLE_TIMEOUT_MS);
    };

    /** Throttle leve: ignora eventos disparados em menos de 500ms para não recriar o timer 60x/s. */
    const onActivity = () => {
      const agora = Date.now();
      if (agora - lastActivityRef.current < 500) return;
      reiniciarTimer();
    };

    reiniciarTimer();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    return () => {
      limparTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [user, logout]);

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
