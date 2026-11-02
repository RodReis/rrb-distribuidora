/**
 * Termos de Uso da IA — versão vigente e texto exibido no sistema.
 *
 * Fonte do texto: docs/termos-de-uso-ia.md (versão 1.0, aprovada pelo PI em 02/11/2026).
 * Mudar o texto significa subir a versão: o novo número exige novo aceite de todos os usuários.
 */
export const AI_TERMS_VERSION = "1.0";

export interface AiTermsSection {
  title: string;
  paragraphs: string[];
}

export const AI_TERMS_SECTIONS: AiTermsSection[] = [
  {
    title: "1. Objeto",
    paragraphs: [
      "Estes termos regem o uso das funções de inteligência artificial do MetalAgents: o Copiloto (consultas em linguagem natural sobre estoque, mercado, retalhos, fornecedores e orçamentos) e o Briefing Matinal (resumo automático diário). Eles não regem o uso do sistema como um todo, que permanece sob o contrato entre a distribuidora e seus usuários.",
    ],
  },
  {
    title: "2. O que a IA é, e o que ela não é",
    paragraphs: [
      "As respostas são texto gerado pela utilização de IA no sistema, a partir de dados consultados nele próprio. Os números vêm de consultas fixas e verificáveis; o texto que os apresenta é gerado e pode variar entre execuções.",
      "O Copiloto é somente leitura. Ele não altera preços, estoque, orçamentos nem qualquer dado. Não existe ferramenta de escrita e a lista de ferramentas é fixa: seis consultas e um cálculo.",
      "A IA pode errar: citar um número fora de contexto, redigir de forma ambígua ou omitir informação. O usuário deve conferir na tela de origem qualquer número que vá fundamentar uma decisão (a tela de origem é citada junto da resposta).",
    ],
  },
  {
    title: "3. Decisões são humanas",
    paragraphs: [
      "Nenhuma ação é executada pela IA. Comprar, vender, aprovar margem, bloquear, liberar e descartar são ações que exigem clique e permissão de um usuário.",
      "Recomendações do Briefing e do Command Center (repor um SKU, revisar uma proposta) são sugestões. A responsabilidade da decisão, e de seus efeitos comerciais, é de quem decide.",
      "Propostas com margem abaixo da política exigem liberação explícita do diretor. A IA não libera e não decide alçada.",
    ],
  },
  {
    title: "4. Dados e rastreabilidade",
    paragraphs: [
      "As consultas do Copiloto são filtradas pela empresa do usuário logado: um usuário não consulta dados de outra empresa.",
      "Cada pergunta ao Copiloto e cada geração do Briefing fica registrada na trilha de auditoria de IA, com a pergunta, as ferramentas chamadas e seus parâmetros, a resposta, o consumo computacional e a latência. Respostas com falha e canceladas também ficam registradas.",
      "A trilha é visível para administradores e diretores e não pode ser editada pela interface.",
    ],
  },
  {
    title: "5. Uso e custos",
    paragraphs: [
      "O uso das funções de IA gera custo de processamento, proporcional ao número e ao tamanho das perguntas. O acesso pode ser acompanhado na própria trilha.",
      "A utilização de IA depende de serviços de terceiros. Indisponibilidade do provedor não gera direito a indenização.",
      "É vedado tentar obter, pelas perguntas ao Copiloto, dados de outra empresa, ou usar o sistema para finalidade ilícita.",
    ],
  },
  {
    title: "6. Alterações",
    paragraphs: [
      "Estes termos podem ser alterados junto com atualizações do sistema. A versão em vigor é a publicada na tela de Governança. Alterações passam a exigir novo aceite quando mudarem garantias aqui descritas.",
      "Mudanças que reduzam garantias aqui descritas serão avisadas aos usuários antes de vigorar.",
    ],
  },
  {
    title: "7. Responsabilidade",
    paragraphs: [
      "O sistema é uma ferramenta de apoio. Erros de dados cadastrados, de preços de reposição ou de consumo informado refletem-se nas respostas da IA.",
      "A responsabilidade por decisões comerciais tomadas com base nas respostas é do usuário que decide, nos limites da lei.",
    ],
  },
  {
    title: "8. Foro",
    paragraphs: [
      "Aplica-se a legislação brasileira. Fica eleito o foro da comarca de São Paulo — SP para dirimir quaisquer dúvidas decorrentes destes termos.",
    ],
  },
];

/**
 * Se o aceite mais recente do usuário não cobre a versão vigente, é preciso aceitar de novo.
 */
export function needsAiTermsAcceptance(
  latestAcceptedVersion: string | null | undefined,
  currentVersion: string = AI_TERMS_VERSION
): boolean {
  return latestAcceptedVersion !== currentVersion;
}
