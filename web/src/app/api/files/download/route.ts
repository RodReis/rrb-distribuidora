import { NextResponse } from "next/server";
import { guardQuotes } from "@/lib/quotes/api-auth";
import { contentTypeForKey, readFile } from "@/lib/storage/r2";

export async function GET(req: Request) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });
  }

  // Isolamento de tenant: só permite baixar chaves do próprio tenant.
  const normalized = key.replace(/^\/+/, "");
  if (normalized.includes("..") || normalized.includes("\\")) {
    return NextResponse.json({ error: "Chave de arquivo inválida." }, { status: 400 });
  }
  if (!normalized.startsWith(`quotes/${guard.user.tenantId}/`)) {
    return NextResponse.json({ error: "Acesso negado a este arquivo." }, { status: 403 });
  }

  const body = await readFile(normalized);
  if (!body) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypeForKey(normalized),
      "Content-Disposition": `inline; filename="${normalized.split("/").pop()}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
