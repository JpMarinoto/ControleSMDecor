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
import { SimpleConfirmDialog } from "../components/ConfirmacaoDialog";

interface Usuario {
  id: number;
  username: string;
  nome: string;
  role: string;
  is_chefe: boolean;
  is_cliente?: boolean;
  pode_precificar?: boolean;
  pode_acessar_precificacao?: boolean;
}

function labelPerfil(u: Usuario): string {
  if (u.role === "1" || u.is_chefe) return "Chefe";
  if (u.role === "3" || u.is_cliente) return "Cliente";
  if (u.pode_precificar) return "Funcionário (precificação)";
  return "Funcionário";
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
  const [podePrecificar, setPodePrecificar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [usuarioToDelete, setUsuarioToDelete] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setPodePrecificar(false);
    setOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditingId(u.id);
    setUsername(u.username);
    setPassword("");
    setNomeExibicao(u.nome || "");
    const r = u.role === "1" || u.role === "3" ? u.role : "2";
    setRole(r);
    setPodePrecificar(Boolean(u.pode_precificar) || r === "3");
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
      const pode = role === "3" ? true : role === "2" ? podePrecificar : false;
      if (editingId) {
        await api.updateUsuario(editingId, {
          nome_exibicao: nomeExibicao || undefined,
          role,
          pode_precificar: pode,
          ...(password ? { password } : {}),
        });
        toast.success("Usuário atualizado");
      } else {
        await api.createUsuario({
          username: username.trim(),
          password,
          nome_exibicao: nomeExibicao || undefined,
          role,
          pode_precificar: pode,
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

  const openDeleteConfirm = (u: Usuario) => {
    setUsuarioToDelete(u);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!usuarioToDelete) return;
    setDeleting(true);
    try {
      await api.deleteUsuario(usuarioToDelete.id);
      toast.success("Usuário desativado");
      setUsuarioToDelete(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
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
            Usuários do sistema
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Chefe, Funcionário e Cliente.
          </p>
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
                    <TableCell>{labelPerfil(u)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => openDeleteConfirm(u)}
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
              {editingId
                ? "Altere nome, perfil, permissões ou senha."
                : "Crie chefe, funcionário ou cliente."}
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
              <Select
                value={role}
                onValueChange={(v) => {
                  setRole(v);
                  if (v === "3") setPodePrecificar(true);
                  if (v === "1") setPodePrecificar(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Funcionário</SelectItem>
                  <SelectItem value="3">Cliente</SelectItem>
                  <SelectItem value="1">Chefe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "2" && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <input
                  id="pode-precificar"
                  type="checkbox"
                  className="mt-1 size-4 cursor-pointer accent-[var(--primary)]"
                  checked={podePrecificar}
                  onChange={(e) => setPodePrecificar(e.target.checked)}
                />
                <Label htmlFor="pode-precificar" className="cursor-pointer text-sm font-normal leading-snug">
                  Pode usar precificação
                </Label>
              </div>
            )}
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

      <SimpleConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setUsuarioToDelete(null);
        }}
        title="Desativar usuário?"
        description={
          usuarioToDelete
            ? `Deseja desativar o usuário "${usuarioToDelete.username}"${
                usuarioToDelete.nome ? ` (${usuarioToDelete.nome})` : ""
              }? Ele não poderá mais fazer login no sistema.`
            : "Deseja desativar este usuário?"
        }
        confirmLabel={deleting ? "Desativando..." : "Desativar"}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
