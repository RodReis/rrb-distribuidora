import { BrainCircuit, Eye, Fingerprint, LockKeyhole, ScrollText, Wrench } from "lucide-react";
import { createCopilotTools } from "@/lib/ai/tools";

function Article({
  index,
  tag,
  title,
  children,
}: {
  index: string;
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-carbon-800 bg-carbon-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-carmine-core" />
          <span className="font-mono text-label-code uppercase text-titanium-muted">{index}</span>
        </div>
        <span className="rounded bg-carbon-800 px-2 py-0.5 font-mono text-label-code font-semibold uppercase text-titanium-light">
          {tag}
        </span>
      </div>
      <h2 className="text-headline-sm font-semibold tracking-tight text-ice-white">{title}</h2>
      {children}
    </section>
  );
}

const STEPS = [
  {
    step: "Etapa 01",
    icon: BrainCircuit,
    iconClass: "text-tertiary",
    title: "Inferência & sugestão",
    text: "O Copiloto e o briefing consultam estoque, mercado e propostas e sugerem ações. Eles não gravam nada.",
  },
  {
    step: "Etapa 02 · bloqueio",
    icon: LockKeyhole,
    iconClass: "text-signal-hold",
    title: "Trava sistêmica",
    text: "Proposta abaixo da margem mínima ou do custo de reposição fica “Bloqueada por margem” e não pode ser enviada.",
  },
  {
    step: "Etapa 03",
    icon: Fingerprint,
    iconClass: "text-signal-buy",
    title: "Chancela humana",
    text: "Diretor ou admin libera a margem na tela da proposta. Preço abaixo do custo de reposição nunca é liberado.",
  },
] as const;

export function PoliciesTab() {
  const tools = Object.entries(createCopilotTools("")).map(([name, def]) => ({
    name,
    description: (def as { description?: string }).description ?? "",
  }));

  return (
    <div className="space-y-3">
      <Article index="Artigo 1" tag="Natureza dos sinais" title="Apoio à decisão, não recomendação financeira">
        <p className="text-body-md leading-relaxed text-titanium-light">
          Sinais de mercado, alertas, o briefing matinal e as respostas do Copiloto são{" "}
          <strong className="text-ice-white">apoio à decisão</strong>. Não constituem recomendação
          financeira. <strong className="text-ice-white">A decisão final é sempre humana.</strong>
        </p>
        <div className="flex items-start gap-2 rounded bg-carbon-950 p-3 text-body-sm text-titanium-light">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-signal-hold" />
          <span>
            Preços, pesos, margens e coberturas são calculados por código determinístico. O modelo
            de linguagem só interpreta a pergunta e explica o resultado.
          </span>
        </div>
      </Article>

      <Article index="Artigo 2" tag="Human-in-the-loop" title="Protocolo de confirmação obrigatória">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STEPS.map(({ step, icon: Icon, iconClass, title, text }) => (
            <div key={step} className="space-y-1 rounded bg-carbon-950 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-code uppercase text-titanium-steel">{step}</span>
                <Icon className={`h-4 w-4 ${iconClass}`} />
              </div>
              <span className="block text-body-md font-semibold text-ice-white">{title}</span>
              <p className="text-body-sm text-titanium-muted">{text}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1 rounded bg-carbon-950/60 p-3 text-body-sm text-titanium-light">
          <strong className="block text-ice-white">Vedação de automação irrestrita</strong>
          <p>
            Nenhuma compra, preço ou crédito é executado por agente. O sistema não emite pedidos de
            compra, e o Copiloto é somente leitura.
          </p>
        </div>
      </Article>

      <Article index="Artigo 3" tag="Ferramentas auditadas" title="O que o Copiloto pode consultar">
        <p className="text-body-md leading-relaxed text-titanium-light">
          Não há SQL livre. O modelo só chama as funções abaixo, com parâmetros validados, e as
          consultas de estoque, orçamentos e retalhos usam sempre a empresa da sessão. Os dados de
          mercado são compartilhados.
        </p>
        <ul className="divide-y divide-carbon-800 rounded border border-carbon-800">
          {tools.map((tool) => (
            <li key={tool.name} className="flex flex-col gap-1 bg-carbon-950/50 p-3 md:flex-row md:items-start md:gap-4">
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-label-code font-semibold text-tertiary md:w-72">
                <Wrench className="h-3.5 w-3.5" />
                {tool.name}
              </span>
              <span className="text-body-sm text-titanium-light">{tool.description}</span>
            </li>
          ))}
        </ul>
      </Article>

      <Article index="Artigo 4" tag="Escopo atual" title="Limites desta versão">
        <ul className="space-y-1.5 text-body-md text-titanium-light">
          {[
            "O Copiloto responde apenas com dados já carregados no sistema. Sem dado, ele deve avisar em vez de estimar.",
            "Cada interação fica registrada na trilha: usuário, pergunta, ferramentas e parâmetros, resposta, tokens e latência.",
            "Compras, produção, financeiro e qualidade ainda não têm módulo. Por isso aparecem como “sem dados” no Command Center.",
            "O cálculo de corte estima peso e perda teórica. O nesting 2D completo faz parte das próximas fases.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-titanium-steel" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Article>
    </div>
  );
}
