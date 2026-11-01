"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDrawer } from "@/components/shared/form-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { inviteUser, updateUser, resetUserPassword, toggleUserActive } from "./actions";
import { formatNumberBR } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Shield,
  UserPlus,
  KeyRound,
  UserCheck,
  UserX,
  Copy,
  Mail,
  Pencil,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  diretor: "Diretor",
  comprador: "Comprador",
  vendedor: "Vendedor",
  estoque: "Estoque",
  financeiro: "Financeiro",
};

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: any[];
  currentUserId: string;
}) {
  const [users, setUsers] = React.useState(initialUsers);
  const [search, setSearch] = React.useState("");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("vendedor");
  const [saving, setSaving] = React.useState(false);

  // Credentials dialog (invite/reset result)
  const [credDialog, setCredDialog] = React.useState<{
    open: boolean;
    title: string;
    email: string;
    password: string;
    emailSent: boolean;
  } | null>(null);

  // Confirm toggle
  const [toggleTarget, setToggleTarget] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const filtered = React.useMemo(() => {
    return users.filter(
      (u) =>
        search === "" ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  function openNew() {
    setEditing(null);
    setName("");
    setEmail("");
    setRole("vendedor");
    setDrawerOpen(true);
  }

  function openEdit(u: any) {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setDrawerOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const res = await updateUser({ id: editing.id, name, role: role as any });
        if (res.success) {
          toast.success(`Usuário ${name} atualizado com sucesso.`);
          setDrawerOpen(false);
        }
      } else {
        const res = await inviteUser({ name, email, role: role as any });
        if (res.success) {
          setDrawerOpen(false);
          setCredDialog({
            open: true,
            title: "Convite de Acesso Gerado",
            email: res.user.email,
            password: res.tempPassword,
            emailSent: res.emailSent,
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(u: any) {
    try {
      const res = await resetUserPassword(u.id);
      if (res.success) {
        setCredDialog({
          open: true,
          title: "Nova Credencial Temporária",
          email: u.email,
          password: res.tempPassword,
          emailSent: res.emailSent,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao resetar senha.");
    }
  }

  async function handleConfirmToggle() {
    if (!toggleTarget) return;
    setProcessing(true);
    try {
      const res = await toggleUserActive(toggleTarget.id);
      if (res.success) {
        toast.success(
          `Usuário ${toggleTarget.name} ${res.active ? "reativado" : "desativado"} com sucesso.`
        );
        setToggleTarget(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status.");
    } finally {
      setProcessing(false);
    }
  }

  function copyPassword(password: string) {
    navigator.clipboard.writeText(password);
    toast.success("Credencial copiada para a área de transferência.");
  }

  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Governança & Admin" },
          { label: "Usuários & Controle de Acesso" },
        ]}
      />

      <PageHeader
        title="Gestão de Usuários & Papéis de Acesso (US-08)"
        badge={
          <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-signal-buy px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> RBAC ATIVO
          </span>
        }
        actions={
          <Button variant="primary" size="sm" onClick={openNew}>
            <UserPlus className="w-3.5 h-3.5 mr-1 text-white" />
            + Convidar Usuário
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Total de Usuários
            </span>
            <Shield className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {users.length}
            </span>
            <span className="font-mono text-label-code text-signal-buy">
              {activeCount} ativos
            </span>
          </div>
        </div>
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Papéis em Operação
            </span>
            <KeyRound className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {new Set(users.map((u) => u.role)).size}
            </span>
            <span className="text-headline-sm text-titanium-muted font-semibold">de 6</span>
          </div>
        </div>
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Notificação por E-mail (Resend)
            </span>
            <Mail className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2">
            <span className="font-mono text-body-md text-titanium-light">
              {process.env.NEXT_PUBLIC_RESEND_CONFIGURED === "true"
                ? "Configurado"
                : "Fallback manual"}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-carbon-900 border border-carbon-800 p-3 rounded">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-titanium-dark" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail corporativo..."
            className="w-full bg-carbon-950 text-body-sm pl-9 pr-3 py-1.5 rounded border border-carbon-700 text-ice-white placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-carbon-900 border border-carbon-800 rounded overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-950 border-b border-carbon-800 text-label-caps font-semibold text-titanium-muted tracking-wider uppercase select-none">
                <th className="py-2.5 px-3">USUÁRIO</th>
                <th className="py-2.5 px-3 w-40">PAPEL (RBAC)</th>
                <th className="py-2.5 px-3 w-28 text-center">STATUS</th>
                <th className="py-2.5 px-3 w-44 text-right">ÚLTIMO ACESSO</th>
                <th className="py-2.5 px-3 w-24 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filtered.map((u, idx) => (
                <tr
                  key={u.id}
                  className={`transition-colors ${
                    idx % 2 === 0
                      ? "bg-carbon-900/50 hover:bg-carbon-800/40"
                      : "bg-carbon-950/40 hover:bg-carbon-800/40"
                  }`}
                >
                  <td className="py-3 px-3 align-top">
                    <div className="flex flex-col">
                      <span className="text-body-sm font-semibold text-ice-white">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="ml-2 font-mono text-label-code text-carmine-signal">
                            (você)
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-label-code text-titanium-muted">
                        {u.email}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 align-top">
                    <span className="font-mono text-label-code bg-carbon-950 px-2 py-0.5 rounded border border-carbon-800 text-titanium-light uppercase">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3 align-top text-center">
                    <StatusBadge status={u.active ? "ativo" : "inativo"} />
                  </td>
                  <td className="py-3 px-3 align-top text-right font-mono text-label-code text-titanium-muted">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString("pt-BR")
                      : "nunca acessou"}
                  </td>
                  <td className="py-3 px-3 align-top text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(u)}
                        title="Editar nome e papel"
                        className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        title="Gerar nova credencial temporária"
                        className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-signal-hold transition-colors cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setToggleTarget(u)}
                        disabled={u.id === currentUserId}
                        title={
                          u.id === currentUserId
                            ? "Não é possível desativar o próprio acesso"
                            : u.active
                            ? "Desativar usuário"
                            : "Reativar usuário"
                        }
                        className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-signal-risk transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {u.active ? (
                          <UserX className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer invite/edit */}
      <FormDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          editing
            ? `Edição de Usuário — ${editing.name}`
            : "+ Convidar Novo Usuário"
        }
        subtitle={
          editing
            ? "Alteração de nome e papel de acesso (RBAC)"
            : "O usuário recebe uma credencial temporária no primeiro acesso"
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Gerar Convite"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Nome Completo *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Rodrigo Reis"
              required
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              E-mail Corporativo *
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@gfdistribuicao.com.br"
              disabled={!!editing}
              required
              className="disabled:opacity-60"
            />
            {editing && (
              <p className="mt-1 font-mono text-label-code text-titanium-dark">
                O e-mail de acesso não pode ser alterado.
              </p>
            )}
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Papel / Perfil de Acesso *
            </label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Administrador — acesso total</option>
              <option value="diretor">Diretor — leitura de tudo</option>
              <option value="comprador">Comprador — Compras & Fornecedores</option>
              <option value="vendedor">Vendedor — Vendas & Clientes</option>
              <option value="estoque">Estoque — Produtos, Depósitos & Máquinas</option>
              <option value="financeiro">Financeiro — Financeiro & Risco</option>
            </Select>
          </div>
          <div className="p-3 bg-carbon-950 rounded border border-carbon-800">
            <p className="text-body-sm text-titanium-muted leading-tight">
              {editing
                ? "As alterações de papel entram em vigor no próximo login do usuário."
                : "Uma senha temporária será gerada. Se o Resend estiver configurado, o convite é enviado por e-mail; caso contrário, compartilhe a credencial manualmente."}
            </p>
          </div>
        </form>
      </FormDrawer>

      {/* Credentials result dialog */}
      {credDialog?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setCredDialog(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded bg-carbon-900 border border-carbon-700 p-5 shadow-2xl">
            <h3 className="text-headline-sm font-headline-sm text-ice-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-signal-hold" />
              {credDialog.title}
            </h3>
            <p className="mt-2 text-body-sm text-titanium-muted">
              Credencial temporária gerada para{" "}
              <span className="text-ice-white">{credDialog.email}</span>:
            </p>
            <div className="mt-3 flex items-center justify-between bg-carbon-950 border border-carbon-700 rounded p-3">
              <code className="font-mono text-body-md text-ice-white tracking-wider">
                {credDialog.password}
              </code>
              <button
                onClick={() => copyPassword(credDialog.password)}
                className="p-1.5 rounded hover:bg-carbon-800 text-titanium-muted hover:text-ice-white cursor-pointer"
                title="Copiar credencial"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-3 text-body-sm text-titanium-muted leading-tight">
              {credDialog.emailSent
                ? "O convite foi enviado por e-mail via Resend."
                : "O envio por e-mail (Resend) não está configurado — compartilhe a credencial manualmente de forma segura."}
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="primary" size="md" onClick={() => setCredDialog(null)}>
                Concluído
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle confirm */}
      <ConfirmDialog
        isOpen={!!toggleTarget}
        title={toggleTarget?.active ? "Desativar Usuário" : "Reativar Usuário"}
        description={`Tem certeza que deseja ${
          toggleTarget?.active ? "desativar" : "reativar"
        } o acesso de ${toggleTarget?.name}? ${
          toggleTarget?.active
            ? "As sessões ativas deixam de autenticar novas operações."
            : ""
        }`}
        confirmLabel={toggleTarget?.active ? "Desativar" : "Reativar"}
        cancelLabel="Cancelar"
        variant={toggleTarget?.active ? "danger" : "primary"}
        loading={processing}
        onCancel={() => setToggleTarget(null)}
        onConfirm={handleConfirmToggle}
      />
    </div>
  );
}
