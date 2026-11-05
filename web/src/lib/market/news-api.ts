import { NextResponse } from "next/server";

const conflict = new Set(["CORRECTION_REQUIRED"]);
const missing = new Set(["SOURCE_NOT_FOUND", "NEWS_NOT_FOUND"]);

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_DATE");
  return date;
}

export function newsApiError(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "INVALID_REQUEST";
  if (missing.has(code)) return NextResponse.json({ error: code }, { status: 404 });
  if ((error as { code?: string })?.code === "23505")
    return NextResponse.json({ error: "Registro já existe." }, { status: 409 });
  if (conflict.has(code)) return NextResponse.json({ error: code }, { status: 409 });
  if (["INVALID_URL", "INVALID_DATE", "INVALID_DATES"].includes(code) || error instanceof TypeError)
    return NextResponse.json({ error: code }, { status: 400 });
  return NextResponse.json({ error: "Falha ao processar registro." }, { status: 500 });
}
