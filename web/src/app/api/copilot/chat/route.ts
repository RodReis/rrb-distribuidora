import { streamText, convertToModelMessages, isStepCount, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { createCopilotTools } from "@/lib/ai/tools";
import { extractPromptText } from "@/lib/ai/prompt-text";
import { briefingFailureResponse } from "@/lib/ai/briefing-audit";
import { COPILOT_MAX_STEPS, COPILOT_SYSTEM_PROMPT } from "@/lib/ai/copilot-config";
import { AiNotConfiguredError, resolveTenantModel } from "@/lib/ai/tenant-config";
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
  const actionId = crypto.randomUUID();

  // Modelo escolhido na combo (vale só para esta conversa) ou o padrão do tenant.
  let llm: LanguageModel;
  try {
    llm = (
      await resolveTenantModel(user.tenantId, {
        provider: typeof body.provider === "string" ? body.provider : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
      })
    ).model;
  } catch (err) {
    const message =
      err instanceof AiNotConfiguredError || err instanceof Error
        ? err.message
        : "Não foi possível resolver o modelo de IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const tools = createCopilotTools(user.tenantId);

  const toolsExecuted: {
    toolName: string;
    params: Record<string, unknown>;
    resultSummary: string;
  }[] = [];

  // Uma linha por pergunta: resposta, falha ou cancelamento (o primeiro evento que chegar grava).
  let recorded = false;
  const record = async (
    response: string,
    promptTokens: number | null = null,
    completionTokens: number | null = null
  ) => {
    if (recorded) return;
    recorded = true;
    try {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      await db.insert(agentActions).values({
        id: actionId,
        tenantId: user.tenantId,
        userId: user.id,
        agentName: "copilot_chat",
        userPrompt: extractPromptText(lastUserMsg?.content),
        toolsExecuted: toolsExecuted.length ? toolsExecuted : null,
        agentResponse: response,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
      });
    } catch (e) {
      console.error("[copilot] audit fail", e);
    }
  };

  const result = streamText({
    model: llm,
    system: COPILOT_SYSTEM_PROMPT,
    messages,
    tools,
    // Sem isso o laço para após a 1ª ferramenta e a resposta final nunca é escrita.
    stopWhen: isStepCount(COPILOT_MAX_STEPS),
    onStepFinish: ({ toolCalls, toolResults }) => {
      if (toolCalls) {
        for (const tc of toolCalls) {
          const tr = toolResults?.find((r) => r.toolCallId === tc.toolCallId);
          toolsExecuted.push({
            toolName: tc.toolName,
            params: ((tc as { input?: unknown }).input ?? {}) as Record<string, unknown>,
            resultSummary: tr
              ? JSON.stringify((tr as { output?: unknown }).output).slice(0, 500)
              : "",
          });
        }
      }
    },
    onFinish: ({ text, totalUsage }) =>
      record(text, totalUsage?.inputTokens ?? null, totalUsage?.outputTokens ?? null),
    onError: ({ error }) => record(briefingFailureResponse(error)),
    onAbort: () => record("[interrompida] o usuário cancelou a resposta."),
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => (part.type === "start" ? { actionId } : undefined),
  });
}
