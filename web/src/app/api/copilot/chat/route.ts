import { streamText, convertToModelMessages, isStepCount } from "ai";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { createCopilotTools } from "@/lib/ai/tools";
import { extractPromptText } from "@/lib/ai/prompt-text";
import { COPILOT_MAX_STEPS, COPILOT_SYSTEM_PROMPT, copilotModel } from "@/lib/ai/copilot-config";
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

  const tools = createCopilotTools(user.tenantId);

  const toolsExecuted: { toolName: string; params: Record<string, unknown>; resultSummary: string }[] = [];

  const result = streamText({
    model: copilotModel(),
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
            resultSummary: tr ? JSON.stringify((tr as { output?: unknown }).output).slice(0, 500) : "",
          });
        }
      }
    },
    onFinish: async ({ text, totalUsage }) => {
      try {
        const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
        const prompt = extractPromptText(lastUserMsg?.content);
        await db.insert(agentActions).values({
          id: actionId,
          tenantId: user.tenantId,
          userId: user.id,
          agentName: "copilot_chat",
          userPrompt: prompt,
          toolsExecuted: toolsExecuted.length ? toolsExecuted : null,
          agentResponse: text,
          promptTokens: totalUsage?.inputTokens ?? null,
          completionTokens: totalUsage?.outputTokens ?? null,
          latencyMs: Date.now() - startedAt,
        });
      } catch (e) {
        console.error("[copilot] audit fail", e);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => (part.type === "start" ? { actionId } : undefined),
  });
}
