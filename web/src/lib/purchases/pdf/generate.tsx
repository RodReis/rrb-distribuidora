/**
 * Geração e armazenamento do PDF do Pedido de Compra — LAC-01 US-04.
 *
 * Fluxo: carrega o pedido via `getPurchaseDocumentData` (fonte única, sem query
 * duplicada), monta o modelo de apresentação, renderiza e grava no storage.
 *
 * Armazenamento:
 * - R2 quando `R2_*` estiver configurado (`uploadFile`);
 * - sem R2, grava em `.data/purchases`, que é a raiz local deste módulo. O
 *   fallback genérico de `lib/storage/r2.ts` é fixo em `.data/quotes` (M3), então
 *   aqui a gravação local é feita explicitamente para manter os documentos de
 *   compra separados. Se/quando o storage for generalizado, este bloco pode
 *   delegar para `uploadFile` sem mudar a chave.
 *
 * Idempotência: o nome do arquivo é estável por PC + versão emitida
 * (`PC-0001-v1.pdf`); reemitir sobrescreve a mesma chave em vez de acumular
 * duplicatas. O PDF é sempre regenerado a partir dos dados persistidos.
 *
 * HOMOLOGAÇÃO (LAC-12): o template carrega o aviso de que o documento não é
 * fiscal enquanto o cadastro da distribuidora não existir. Não remover.
 */

import React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { isR2Configured, uploadFile } from "@/lib/storage/r2";
import { purchaseConflict, purchaseNotFound } from "../errors";
import { getPurchaseDocumentData } from "../service";
import { PurchaseDocument, buildPurchasePdfData } from "./purchase-document";

const LOCAL_PURCHASES_DIR = path.join(process.cwd(), ".data", "purchases");
const PDF_CONTENT_TYPE = "application/pdf";

export interface GeneratedPurchasePdf {
  /** Chave lógica no storage (`purchases/<tenant>/<arquivo>.pdf`). */
  fileKey: string;
  /** Nome estável por PC/versão, usado em `Content-Disposition`. */
  fileName: string;
  /** Bytes renderizados — a rota devolve sem reler o storage. */
  buffer: Buffer;
  storage: "r2" | "local";
}

/** Nome de arquivo estável por pedido/versão: `PC-0001-v3.pdf`. */
export function purchasePdfFileName(number: number, version: number): string {
  const paddedNumber = String(number).padStart(4, "0");
  const safeVersion = Math.max(1, Math.trunc(version));
  return `PC-${paddedNumber}-v${safeVersion}.pdf`;
}

/** Impede quebra de diretório em chave/nome montados a partir de dados do pedido. */
function safeSegment(value: string, label: string): string {
  if (!value || value === "." || value === ".." || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Componente de caminho inválido (${label}).`);
  }
  return value;
}

async function storeLocalPdf(
  tenantId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ fileKey: string; storage: "local" }> {
  const tenantSegment = safeSegment(tenantId, "tenantId");
  const fileSegment = safeSegment(fileName, "fileName");
  const target = path.join(LOCAL_PURCHASES_DIR, tenantSegment, fileSegment);
  const root = path.resolve(LOCAL_PURCHASES_DIR);
  if (!path.resolve(target).startsWith(root + path.sep)) {
    throw new Error("Caminho inválido para o PDF do pedido de compra.");
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return { fileKey: `purchases/${tenantSegment}/${fileSegment}`, storage: "local" };
}

export async function generatePurchasePdf(input: {
  tenantId: string;
  id: string;
}): Promise<GeneratedPurchasePdf> {
  const data = await getPurchaseDocumentData(input.tenantId, input.id);
  if (!data) throw purchaseNotFound("Pedido de compra não encontrado.");

  // Documento só existe para PC emitido (com número). Rascunho é 409 na rota.
  if (!data.order.number) {
    throw purchaseConflict(
      "Rascunho não gera PDF. Emita o pedido de compra antes de baixar o documento."
    );
  }

  const documentData = buildPurchasePdfData(data);
  const buffer = await renderToBuffer(<PurchaseDocument data={documentData} />);
  const fileName = purchasePdfFileName(data.order.number, data.order.currentVersion);
  const storageKey = `purchases/${input.tenantId}/${fileName}`;

  if (isR2Configured()) {
    const stored = await uploadFile(storageKey, buffer, PDF_CONTENT_TYPE);
    return { fileKey: stored.key, fileName, buffer, storage: stored.storage };
  }

  const stored = await storeLocalPdf(input.tenantId, fileName, buffer);
  return { fileKey: stored.fileKey, fileName, buffer, storage: stored.storage };
}
