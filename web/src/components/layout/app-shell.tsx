"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { openCopilot } from "@/lib/ai/copilot-events";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LiveTicker } from "@/components/features/market/live-ticker";
import { NotificationBell } from "@/components/features/market/notification-bell";
import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  ShoppingCart,
  Receipt,
  Factory,
  Award,
  CircleDollarSign,
  Package,
  Truck,
  Users,
  Warehouse,
  Cog,
  Shield,
  FileText,
  LogOut,
  Search,
  FileUp,
  Settings,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAVIGATION: NavGroup[] = [
  {
    group: "OP-MODULES",
    items: [
      {
        label: "Command Center",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "Inteligência & LME",
        href: "/mercado",
        icon: TrendingUp,
      },
      {
        label: "Estoque & Retalhos",
        href: "/estoque",
        icon: Boxes,
      },
      {
        label: "Compras & RFQ Auto",
        href: "/compras",
        icon: ShoppingCart,
        disabled: true,
        badge: "M2",
      },
      {
        label: "Vendas & Orçamento",
        href: "/vendas/orcamentos",
        icon: Receipt,
      },
      {
        label: "Produção & Nesting",
        href: "/producao",
        icon: Factory,
        disabled: true,
        badge: "M3",
      },
      {
        label: "Qualidade & Certificados",
        href: "/qualidade",
        icon: Award,
        disabled: true,
        badge: "M2",
      },
      {
        label: "Financeiro & Risco",
        href: "/financeiro",
        icon: CircleDollarSign,
        disabled: true,
        badge: "M1",
      },
    ],
  },
  {
    group: "CADASTROS ESTRATÉGICOS",
    items: [
      { label: "Produtos Metálicos", href: "/produtos", icon: Package },
      { label: "Fornecedores & Usinas", href: "/fornecedores", icon: Truck },
      { label: "Clientes & Indústrias", href: "/clientes", icon: Users },
      { label: "Depósitos & Armazéns", href: "/depositos", icon: Warehouse },
      { label: "Máquinas de Corte", href: "/maquinas", icon: Cog },
      { label: "Importador CSV (Catálogo)", href: "/importar", icon: FileUp },
    ],
  },
  {
    group: "CONFIGURAÇÃO",
    items: [{ label: "Configurações", href: "/configuracoes", icon: Settings }],
  },
  {
    group: "GOVERNANÇA & ADMIN",
    items: [
      { label: "Usuários & Acesso", href: "/admin/usuarios", icon: Shield },
      { label: "Trilha de Auditoria", href: "/admin/auditoria", icon: FileText },
      { label: "Governança de IA", href: "/governanca", icon: Shield },
    ],
  },
];

export interface AppShellProps {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-carbon-950 text-ice-white">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 bg-carbon-900 border-r border-carbon-800 flex flex-col justify-between select-none">
        {/* Brand Header */}
        <div>
          <div className="h-14 px-4 border-b border-carbon-800 flex items-center justify-between">
            <Link href="/produtos" className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-carmine-core rounded flex items-center justify-center font-mono font-black text-sm text-white shadow-sm">
                GF
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-sm font-semibold tracking-tight text-ice-white leading-none">
                  METALAGENTS
                </span>
                <span className="font-mono text-label-code text-titanium-dark mt-0.5 leading-none">
                  INDUSTRIAL OS v4.2
                </span>
              </div>
            </Link>
            <span className="w-2 h-2 rounded-full bg-signal-buy animate-pulse" />
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            {NAVIGATION.map((section, idx) => (
              <div key={idx} className="space-y-1">
                <span className="px-2 text-label-code font-mono text-titanium-dark uppercase tracking-wider block">
                  {section.group}
                </span>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;

                    if (item.disabled) {
                      return (
                        <div
                          key={item.href}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded text-body-sm text-titanium-dark cursor-not-allowed opacity-60"
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className="w-4 h-4 text-titanium-dark" />
                            <span>{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="font-mono text-[9px] bg-carbon-950 px-1 py-0.5 rounded text-titanium-dark border border-carbon-800">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center justify-between px-2.5 py-1.5 rounded text-body-sm transition-colors cursor-pointer",
                          isActive
                            ? "bg-carmine-core/15 text-carmine-signal border border-carmine-core/30 font-medium"
                            : "text-titanium-muted hover:text-ice-white hover:bg-carbon-800/80"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            className={cn(
                              "w-4 h-4",
                              isActive ? "text-carmine-signal" : "text-titanium-muted"
                            )}
                          />
                          <span>{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer / Connection Status */}
        <div className="p-3 border-t border-carbon-800 bg-carbon-950/60 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-label-code text-titanium-dark uppercase">
              GF CORRETORA S/A
            </span>
            <span className="font-mono text-label-code text-titanium-muted">
              CORE STATUS: <span className="text-signal-buy">ONLINE</span>
            </span>
          </div>
          <span className="font-mono text-label-code bg-carbon-800 px-1.5 py-0.5 rounded text-titanium-light border border-carbon-700">
            SP-01
          </span>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOPBAR TICKER / USER BAR */}
        <header className="h-14 shrink-0 bg-carbon-900 border-b border-carbon-800 px-4 flex items-center justify-between">
          <LiveTicker />

          {/* Quick search input */}
          <div className="relative w-64 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-titanium-dark" />
            <input
              type="text"
              readOnly
              onClick={() => openCopilot()}
              onFocus={() => openCopilot()}
              placeholder="Perguntar ao Copiloto (Ctrl+K)..."
              aria-label="Abrir o Copiloto"
              className="w-full cursor-pointer bg-carbon-950 text-body-sm pl-8 pr-3 py-1 rounded border border-carbon-800 placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
            />
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-carbon-950 px-2.5 py-1 rounded border border-carbon-800">
              <span className="w-2 h-2 rounded-full bg-carmine-core" />
              <span className="font-mono text-label-code text-titanium-light uppercase">
                USINA MATRIZ
              </span>
            </div>

            <ThemeToggle />

            <NotificationBell />

            <div className="flex items-center gap-2 pl-2 border-l border-carbon-800">
              <div className="flex flex-col text-right">
                <span className="text-body-sm font-medium text-ice-white leading-tight">
                  {user.name}
                </span>
                <span className="font-mono text-label-code text-titanium-muted capitalize leading-none mt-0.5">
                  {user.role}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Desconectar da plataforma"
                className="p-1.5 rounded hover:bg-carbon-800 text-titanium-muted hover:text-signal-risk transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-20 bg-carbon-950">{children}</main>
      </div>
    </div>
  );
}
