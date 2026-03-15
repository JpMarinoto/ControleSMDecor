import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Usuario {
  id: number;
  username: string;
  nome: string;
  role: string;
  is_chefe: boolean;
}

export function Usuarios() {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [role, setRole] = useState("2");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getUsuarios()
      .then((data: Usuario[]) => setUsuarios(Array.isArray(data) ? data : []))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Erro ao carregar usuários";
        toast.error(msg);
        setUsuarios([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const isChefe = currentUser?.is_chefe ?? false;

  const openNew = () => {
    setEditingId(null);
    setUsername("");
    setPassword("");
    setNomeExibicao("");
    setRole("2");
    setOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditingId(u.id);
    setUsername(u.username);
    setPassword("");
    setNomeExibicao(u.nome || "");
    setRole(u.role === "1" ? "1" : "2");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      toast.error("Usuário é obrigatório");
      return;
    }
    if (!editingId && (!password || password.length < 6)) {
      toast.error("Senha com no mínimo 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateUsuario(editingId, {
          nome_exibicao: nomeExibicao || undefined,
          role,
          ...(password ? { password } : {}),
        });
        toast.success("Usuário atualizado");
      } else {
        await api.createUsuario({
          username: username.trim(),
          password,
          nome_exibicao: nomeExibicao || undefined,
          role,
        });
        toast.success("Usuário criado");
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Desativar este usuário?")) return;
    try {
      await api.deleteUsuario(id);
      toast.success("Usuário desativado");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  if (!isChefe) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold">Usuários</h1>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-muted-foreground">Apenas o Chefe pode ver e gerenciar usuários.</p>
            <p className="text-sm text-muted-foreground">
              Se você é o Mestão/Chefe e está a ver esta mensagem: faça logout, entre de novo com o utilizador mestão. Se o problema continuar, na pasta do projeto execute: <code className="bg-muted px-1 rounded">python manage.py criar_mestao --username mestao --password mestao123</code> e faça login com esse utilizador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Usuários</h1>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-2" />
          Novo usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Funcionários e Chefe
          </CardTitle>
          <p className="text-sm text-muted-foreground">Só o Chefe pode criar, editar e desativar usuários.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.nome || "—"}</TableCell>
                    <TableCell>{u.is_chefe ? "Chefe" : "Funcionário"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(u.id)}
                          disabled={u.id === currentUser?.id}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Altere nome de exibição, perfil ou senha." : "Crie um funcionário ou outro chefe."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Usuário (login)</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nome.de.usuario"
                disabled={!!editingId}
              />
            </div>
            {!editingId && (
              <div className="space-y-2">
                <Label>Senha (mín. 6 caracteres)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
            {editingId && (
              <div className="space-y-2">
                <Label>Nova senha (deixe em branco para não alterar)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Nome para exibição</Label>
              <Input
                value={nomeExibicao}
                onChange={(e) => setNomeExibicao(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Funcionário</SelectItem>
                  <SelectItem value="1">Chefe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
