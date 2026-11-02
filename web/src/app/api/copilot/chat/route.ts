import { streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { createCopilotTools } from "@/lib/ai/tools";
import { db } from "@/lib/db";
import { agentActions } from "@/lib/db/schema";

export const maxDuration = 60;

export async function POST(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json();
  const uiMessages = body.messages ?? [];
  const messages = await convertToModelMessages(uiMessages);
  const startedAt = Date.now();

  const tools = createCopilotTools(user.tenantId);

  const toolsExecuted: { toolName: string; params: Record<string, unknown>; resultSummary: string }[] = [];

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
    system: `Você é o Copiloto Executivo do MetalAgents, assistente de inteligência industrial para distribuidora de metal.
Responda sempre em PT-BR, de forma objetiva e embasada em dados reais obtidos via ferramentas.
NUNCA invente números, SKUs ou preços. Use as ferramentas disponíveis para consultar dados.
NUNCA gere SQL ou acesse dados fora das ferramentas. Se não houver ferramenta adequada, informe que não pode responder.
Quando usar uma ferramenta, explique brevemente quais filtros foram aplicados.`,
    messages,
    tools,
    onStepFinish: ({ toolCalls, toolResults }) => {
      if (toolCalls) {
        for (const tc of toolCalls) {
          const tr = toolResults?.find((r) => r.toolCallId === tc.toolCallId);
          toolsExecuted.push({
            toolName: tc.toolName,
            params: ((tc as { input?: unknown }).input ?? {}) as Record<string, unknown>,
            resultSummary: tr ? JSON.stringify((tr as { output?: unknown }).output).slice(0, 500) : "",
          });
        }
      }
    },
    onFinish: async ({ text, usage }) => {
      try {
        const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
        const prompt = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg?.content);
        await db.insert(agentActions).values({
          tenantId: user.tenantId,
          userId: user.id,
          agentName: "copilot_chat",
          userPrompt: prompt,
          toolsExecuted: toolsExecuted.length ? toolsExecuted : null,
          agentResponse: text,
          promptTokens: usage?.inputTokens ?? null,
          completionTokens: usage?.outputTokens ?? null,
          latencyMs: Date.now() - startedAt,
        });
      } catch (e) {
        console.error("[copilot] audit fail", e);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}