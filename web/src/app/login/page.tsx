"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Zap } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/produtos";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        rememberMe: rememberMe ? "true" : "false",
        redirect: false,
      });

      if (res?.error) {
        toast.error("Credenciais inválidas. Verifique seu e-mail e senha corporativa.");
        setLoading(false);
        return;
      }

      toast.success("Autenticação realizada com sucesso!");
      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Falha ao comunicar com o servidor de autenticação.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-carbon-950 relative overflow-hidden">
      {/* Background radial halos */}
      <div className="absolute -top-24 w-80 h-80 rounded-full bg-carmine-deep/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 w-96 h-96 rounded-full bg-carbon-700/25 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md flex flex-col gap-4 relative z-10">
        {/* Gateway telemetry bar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-signal-buy animate-pulse" />
            <span className="font-mono text-label-code text-titanium-muted uppercase tracking-wider">
              GATEWAY // SECURE-NODE-04
            </span>
          </div>
          <span className="font-mono text-label-code text-titanium-dark">BUILD 2.8.4_PROD</span>
        </div>

        {/* Main Card */}
        <div className="bg-carbon-900 border border-carbon-800 rounded-md p-6 sm:p-8 shadow-2xl flex flex-col gap-5">
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded bg-carbon-950 border border-carbon-700 flex items-center justify-center p-2 shadow-inner">
              <span className="font-black text-2xl tracking-tighter text-carmine-signal font-mono">
                GF
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <span className="text-headline-lg font-headline-lg text-ice-white tracking-tight">
                  MetalAgents
                </span>
                <span className="bg-carbon-800 text-titanium-light font-mono text-label-code px-1.5 py-0.5 rounded border border-carbon-700">
                  ENTERPRISE
                </span>
              </div>
              <span className="text-body-sm font-body-sm text-titanium-muted mt-0.5">
                GF Industrial Analytics Terminal
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* E-mail */}
            <div className="flex flex-col gap-1">
              <label className="text-label-caps font-semibold text-titanium-light uppercase tracking-wider flex items-center justify-between">
                <span>E-mail Corporativo</span>
                <span className="font-mono text-label-code text-titanium-dark lowercase">
                  ldap://auth
                </span>
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-titanium-dark" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@gfdistribuicao.com.br"
                  required
                  className="w-full bg-carbon-950 text-ice-white placeholder-titanium-dark text-body-md pl-9 pr-3 py-2 rounded border border-carbon-700 focus:outline-none focus:ring-1 focus:ring-carmine-core focus:border-carmine-core transition-colors"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-label-caps font-semibold text-titanium-light uppercase tracking-wider">
                  Senha Operacional
                </label>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Contate o administrador para redefinir sua credencial.");
                  }}
                  className="text-body-sm text-carmine-signal hover:underline"
                >
                  Esqueci a credencial
                </a>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-titanium-dark" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-carbon-950 text-ice-white placeholder-titanium-dark text-body-md pl-9 pr-10 py-2 rounded border border-carbon-700 focus:outline-none focus:ring-1 focus:ring-carmine-core focus:border-carmine-core transition-colors"
                />
                <button
                  type="button"
                  aria-label="Alternar visualização da senha"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 p-1 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checkbox Manter Sessão */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-carbon-950 border-carbon-700 accent-carmine-core cursor-pointer"
                />
                <span className="text-body-sm text-titanium-muted group-hover:text-titanium-light transition-colors">
                  Manter sessão ativa neste terminal
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-carmine-core hover:bg-carmine-signal active:bg-carmine-deep text-ice-white py-2.5 px-4 rounded font-semibold text-headline-sm flex items-center justify-center gap-2 shadow-md transition-all mt-1 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? "Autenticando..." : "Entrar na Plataforma"}</span>
              <Zap className="w-4 h-4 fill-white" />
            </button>
          </form>
        </div>

        {/* Telemetria Card */}
        <div className="bg-carbon-900 border border-carbon-800 rounded-md p-3.5 shadow-md flex flex-col gap-2">
          <div className="flex items-center justify-between text-titanium-muted pb-1 border-b border-carbon-800/80">
            <span className="text-label-caps font-semibold uppercase tracking-wider flex items-center gap-1.5 text-titanium-light">
              <span className="w-2 h-2 rounded-full bg-carmine-signal" /> Telemetria de Conexão
            </span>
            <span className="font-mono text-label-code text-signal-buy flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> OPERACIONAL
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-carbon-950 p-2 rounded border border-carbon-800 font-mono text-label-code">
            <div className="flex flex-col">
              <span className="text-titanium-dark">LME FEED</span>
              <span className="text-ice-white font-medium">24ms // SYNC</span>
            </div>
            <div className="flex flex-col">
              <span className="text-titanium-dark">BCB PTAX</span>
              <span className="text-signal-buy font-medium">CONECTADO</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-titanium-dark">MOTOR IA</span>
              <span className="text-ice-white font-medium">ONLINE</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 px-1">
            <ShieldCheck className="w-4 h-4 text-titanium-muted shrink-0" />
            <p className="text-body-sm text-titanium-muted leading-tight">
              TLS 1.3 • Auditoria Contínua • ISO 27001 • Em conformidade com a LGPD
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="font-mono text-label-code text-titanium-dark">
            GF INDUSTRIAL ANALYTICS © 2026 • PROPRIETARY METALLURGICAL TERMINAL
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-carbon-950" />}>
      <LoginForm />
    </React.Suspense>
  );
}
