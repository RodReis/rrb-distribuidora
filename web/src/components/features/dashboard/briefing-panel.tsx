"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, Briefcase, ChevronUp, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "@/components/shared/inline-markdown";
import type { BriefingSection, BriefingSectionKey } from "@/lib/dashboard/insights";
import { LevelBadge } from "./level";

export interface BriefingPanelProps {
  briefing: {
    briefingDate: string;
    createdAt: string;
    sentViaEmailAt: string | null;
    criticalRupturesCount: number;
    pendingQuotesCount: number;
    summaryText: string;
  } | null;
  sections: BriefingSection[];
  isToday: boolean;
}

const CARD: Record<
  BriefingSectionKey,
  { icon: React.ElementType; tag: string; tagClass: string; heading: string }
> = {
  attention: {
    icon: AlertTriangle,
    tag: "Atenção imediata",
    tagClass: "bg-carmine-core/20 text-carmine-signal",
    heading: "Rupturas & atrasos",
  },
  market: {
    icon: TrendingUp,
    tag: "Mercado",
    tagClass: "bg-signal-buy/15 text-signal-buy",
    heading: "Oportunidades de compra & mercado",
  },
  quotes: {
    icon: Briefcase,
    tag: "Propostas",
    tagClass: "bg-signal-hold/20 text-signal-hold",
    heading: "Propostas comerciais estratégicas",
  },
};

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const brDate = (isoDate: string) => isoDate.split("-").reverse().join("/");

function BriefingText({ text, clamp }: { text: string; clamp: boolean }) {
  return (
    <div
      className={cn(
        "space-y-1 whitespace-pre-wrap text-body-sm leading-relaxed text-titanium-light",
        clamp && "line-clamp-6"
      )}
    >
      <InlineMarkdown text={text} />
    </div>
  );
}

export function BriefingPanel({ briefing, sections, isToday }: BriefingPanelProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-carbon-800 bg-carbon-900">
      <div className="flex flex-col justify-between gap-2 bg-carbon-950/60 p-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-carmine-core text-ice-white">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-headline-sm font-semibold leading-tight text-ice-white">
              Briefing Executivo Diário — 07:00h
            </h2>
            <p className="text-body-sm text-titanium-muted">
              Resumo gerado a partir de estoque, mercado e propostas. Não substitui a decisão
              humana.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {briefing && (
            <LevelBadge level={briefing.sentViaEmailAt ? "ok" : "attention"}>
              {briefing.sentViaEmailAt
                ? `E-mail enviado às ${hhmm(briefing.sentViaEmailAt)} BRT`
                : "E-mail não enviado"}
            </LevelBadge>
          )}
          {briefing && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-carbon-700 bg-carbon-800 px-3 text-label-caps font-semibold uppercase tracking-wider text-ice-white transition-colors hover:bg-carbon-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {expanded ? "Recolher resumo" : "Ler resumo completo"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {!briefing && (
          <div className="rounded border border-dashed border-carbon-700 bg-carbon-950/50 p-6 text-center">
            <p className="text-body-md font-medium text-ice-white">Nenhum briefing gerado ainda</p>
            <p className="mx-auto mt-1 max-w-md text-body-sm text-titanium-muted">
              O worker gera o briefing todos os dias às 06:55 (BRT). Ele depende do deploy do
              serviço de jobs e da chave do modelo configurada.
            </p>
          </div>
        )}

        {briefing && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label-code text-titanium-muted">
              <span>
                Briefing de <span className="text-ice-white">{brDate(briefing.briefingDate)}</span>{" "}
                · gerado às {hhmm(briefing.createdAt)} BRT
              </span>
              <span>
                Rupturas críticas:{" "}
                <span className="text-ice-white">{briefing.criticalRupturesCount}</span>
              </span>
              <span>
                Propostas pendentes:{" "}
                <span className="text-ice-white">{briefing.pendingQuotesCount}</span>
              </span>
              {!isToday && <LevelBadge level="attention">Hoje ainda não gerado</LevelBadge>}
            </div>

            {sections.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {sections.map((section) => {
                  const card = CARD[section.key];
                  const Icon = card.icon;
                  return (
                    <article
                      key={section.key}
                      className="flex flex-col gap-2 rounded bg-carbon-800/90 p-3 transition-colors hover:bg-carbon-800"
                    >
                      <span
                        className={cn(
                          "inline-flex w-fit items-center gap-1 rounded px-2 py-0.5 font-mono text-label-code font-bold uppercase",
                          card.tagClass
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {card.tag}
                      </span>
                      <h3 className="text-body-lg font-semibold text-ice-white">{card.heading}</h3>
                      <BriefingText text={section.body} clamp={!expanded} />
                    </article>
                  );
                })}
              </div>
            ) : (
              <article className="rounded bg-carbon-800/90 p-3">
                <BriefingText text={briefing.summaryText} clamp={!expanded} />
              </article>
            )}
          </>
        )}
      </div>
    </section>
  );
}
