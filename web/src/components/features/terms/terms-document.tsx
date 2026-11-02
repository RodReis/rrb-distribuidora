import { AI_TERMS_SECTIONS, AI_TERMS_VERSION } from "@/lib/terms/ai-terms";

/** O texto vigente dos termos, como aparece no aceite e na aba da governança. */
export function TermsDocument() {
  return (
    <div className="space-y-4">
      <p className="font-mono text-label-code uppercase tracking-wide text-titanium-muted">
        Versão {AI_TERMS_VERSION} · MetalAgents
      </p>
      {AI_TERMS_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h3 className="text-body-lg font-bold text-ice-white">{section.title}</h3>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="text-body-sm leading-relaxed text-titanium-light">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
