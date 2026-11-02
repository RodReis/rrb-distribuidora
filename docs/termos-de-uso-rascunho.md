# Termos de Uso da Inteligência Artificial — RASCUNHO

> **Este é um rascunho para revisão do PI, não um texto definitivo.** Foi escrito para afirmar
> apenas o que o sistema faz hoje (spec M4 §§10.1–10.8). O mockup trazia afirmações que o produto
> não cumpre (RLS, ISO 27001, ledger imutável criptográfico) e **não foram incluídas**. Privacidade
> e LGPD ficam fora, por decisão de projeto (`AGENTS.md`). A revisão jurídica e a versão final são
> responsabilidade do PI.

**Versão do rascunho:** 0.1 · 02/11/2026 · lugar para a data de vigência quando aprovado

---

## 1. Objeto

Estes termos regem o uso das funções de inteligência artificial do MetalAgents: o **Copiloto**
(consultas em linguagem natural sobre estoque, mercado, retalhos, fornecedores e orçamentos) e o
**Briefing Matinal** (resumo automático diário). Eles não regem o uso do sistema como um todo, que
permanece sob o contrato entre a distribuidora e seus usuários.

## 2. O que a IA é, e o que ela não é

1. As respostas são **texto gerado por modelo de linguagem** a partir de dados consultados no
   sistema. Os números vêm de consultas fixas e verificáveis; o texto que os apresenta é gerado e
   pode variar entre execuções.
2. O Copiloto é **somente leitura**. Ele não altera preços, estoque, orçamentos nem qualquer dado.
   Não existe ferramenta de escrita e a lista de ferramentas é fixa: seis consultas e um cálculo.
3. O modelo pode **errar**: citar um número fora de contexto, redigir de forma ambígua ou omitem
   informação. O usuário deve conferir na tela de origem qualquer número que vá fundamentar uma
   decisão (a tela de origem é citada junto da resposta).

## 3. Decisões são humanas

1. Nenhuma ação é executada pela IA. Comprar, vender, aprovar margem, bloquear, liberar e
   descartar são ações que exigem clique e permissão de um usuário.
2. Recomendações do Briefing e do Command Center (repor um SKU, revisar uma proposta) são
   **sugestões**. A responsabilidade da decisão, e de seus efeitos comerciais, é de quem decide.
3. Propostas com margem abaixo da política exigem liberação explícita do diretor. A IA não libera
   e não decide alçada.

## 4. Dados e rastreabilidade

1. As consultas do Copiloto são filtradas pela empresa do usuário logado: um usuário não consulta
   dados de outra empresa.
2. Cada pergunta ao Copiloto e cada geração do Briefing fica registrada na **trilha de auditoria
   de IA**, com a pergunta, as ferramentas chamadas e seus parâmetros, a resposta, o consumo de
   tokens e a latência. Respostas com falha e canceladas também ficam registradas.
3. A trilha é visível para administradores e diretores e **não pode ser editada pela interface**.

## 5. Uso e custos

1. O uso das funções de IA gera custo de processamento de terceiros, proporcional ao número e ao
   tamanho das perguntas. O acesso pode ser acompanhado na própria trilha (tokens por interação).
2. O fornecimento do modelo depende de serviços de terceiros. Indisponibilidade do provedor não
   gera direito a indenização.
3. É vedado tentar obter, pelas perguntas ao Copiloto, dados de outra empresa, ou usar o sistema
   para finalidade ilícita.

## 6. Alterações

1. Estes termos podem ser alterados junto com atualizações do sistema. A versão em vigor é a
   publicada na tela de Governança.
2. Mudanças que reduzam garantias aqui descritas serão avisadas aos usuários antes de vigorar.

## 7. Responsabilidade

1. O sistema é uma ferramenta de apoio. Erros de dados cadastrados, de preços de reposição ou de
   consumo informado refletem-se nas respostas da IA.
2. A responsabilidade por decisões comerciais tomadas com base nas respostas é do usuário que
   decide, nos limites da lei.

## 8. Foro

Aplica-se a legislação brasileira e o foro da comarca do domicílio da distribuidora.

---

## Para o PI revisar

1. **Foro** (§8): coloque a comarca correta.
2. **Custos** (§5): quer citar o provedor (OpenAI) nominalmente?
3. **"Contrato entre a distribuidora e seus usuários"** (§1): existe? Se não, esta frase precisa
   mudar.
4. **Termo de vigência e aceito**: quero um checkbox "aceito os termos" no primeiro acesso, ou só
   publicar na tela de Governança? Isso muda a implementação.
5. Item que **não** está aqui de propósito: privacidade/LGPD. Confirme que segue fora.
6. Cláusula de indenização/limitação de responsabilidade mais forte (§7 está branda): o seu
   jurídico decide se cabe.
