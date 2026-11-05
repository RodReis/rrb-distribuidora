import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsClassifications, newsItems, newsSources, regulatoryItems } from "@/lib/db/schema";
import { permittedNewsFields, type NewsRights } from "./news";

export function requireHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("INVALID_URL");
  return url.toString();
}

export function metadataHash(input: {
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  withdrawn: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.title,
        input.canonicalUrl,
        input.publishedAt?.toISOString(),
        input.withdrawn,
      ])
    )
    .digest("hex");
}

export async function listNews(tenantId: string) {
  const latestVersions = db
    .select({
      sourceId: newsItems.sourceId,
      externalId: newsItems.externalId,
      latestVersion: sql<number>`max(${newsItems.version})`.as("latest_version"),
    })
    .from(newsItems)
    .where(eq(newsItems.tenantId, tenantId))
    .groupBy(newsItems.sourceId, newsItems.externalId)
    .as("latest_news_versions");
  const rows = await db
    .select({ item: newsItems, source: newsSources })
    .from(newsItems)
    .innerJoin(
      latestVersions,
      and(
        eq(newsItems.sourceId, latestVersions.sourceId),
        eq(newsItems.externalId, latestVersions.externalId),
        eq(newsItems.version, latestVersions.latestVersion)
      )
    )
    .innerJoin(
      newsSources,
      and(eq(newsItems.sourceId, newsSources.id), eq(newsSources.tenantId, tenantId))
    )
    .where(
      and(
        eq(newsItems.tenantId, tenantId),
        eq(newsItems.withdrawn, false),
        ne(newsSources.displayRights, "none")
      )
    )
    .orderBy(desc(newsItems.capturedAt))
    .limit(200);

  const visible = rows;
  const ids = visible.map((row) => row.item.id);
  const reviews = ids.length
    ? await db
        .select()
        .from(newsClassifications)
        .where(
          and(
            eq(newsClassifications.tenantId, tenantId),
            inArray(newsClassifications.itemId, ids),
            inArray(newsClassifications.reviewStatus, ["approved", "rejected"])
          )
        )
        .orderBy(desc(newsClassifications.createdAt))
    : [];
  const reviewByItem = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews)
    if (!reviewByItem.has(review.itemId)) reviewByItem.set(review.itemId, review);

  return visible.map(({ item, source }) => {
    const latestReview = reviewByItem.get(item.id);
    const review = latestReview?.reviewStatus === "approved" ? latestReview : null;
    const fields = permittedNewsFields({
      id: item.id,
      sourceName: source.name,
      title: item.title,
      canonicalUrl: item.canonicalUrl,
      publishedAt: item.publishedAt,
      body: item.body,
      evidence: review?.evidence ?? null,
      rights: source.displayRights as NewsRights,
    });
    if (!fields) throw new Error("NEWS_RIGHTS_DENIED");
    return {
      ...fields,
      version: item.version,
      classification: review
        ? {
            origin: "Curadoria humana",
            modelVersion: review.modelVersion,
            labels: review.labels,
            sentiment: review.sentiment,
            confidence: review.confidence,
            reviewedAt: review.reviewedAt,
          }
        : null,
    };
  });
}

export async function listSources(tenantId: string) {
  return db
    .select({ id: newsSources.id, name: newsSources.name, sourceUrl: newsSources.sourceUrl })
    .from(newsSources)
    .where(eq(newsSources.tenantId, tenantId))
    .orderBy(newsSources.name);
}

export async function addSource(input: {
  tenantId: string;
  actorId: string;
  name: string;
  sourceUrl: string;
  licenseReference: string;
  retentionPolicy: string;
}) {
  const [source] = await db
    .insert(newsSources)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      sourceUrl: requireHttpUrl(input.sourceUrl),
      licenseReference: input.licenseReference,
      retentionPolicy: input.retentionPolicy,
      displayRights: "metadata",
      approvedBy: input.actorId,
    })
    .returning({ id: newsSources.id });
  return source;
}

export async function addNews(input: {
  tenantId: string;
  actorId: string;
  sourceId: string;
  externalId: string;
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  correctionOf?: string;
  withdrawn?: boolean;
}) {
  const canonicalUrl = requireHttpUrl(input.canonicalUrl);
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ id: newsSources.id })
      .from(newsSources)
      .where(
        and(
          eq(newsSources.id, input.sourceId),
          eq(newsSources.tenantId, input.tenantId),
          eq(newsSources.displayRights, "metadata")
        )
      )
      .limit(1);
    if (!source) throw new Error("SOURCE_NOT_FOUND");
    const [previous] = await tx
      .select()
      .from(newsItems)
      .where(
        and(
          eq(newsItems.tenantId, input.tenantId),
          eq(newsItems.sourceId, input.sourceId),
          eq(newsItems.externalId, input.externalId)
        )
      )
      .orderBy(desc(newsItems.version))
      .limit(1);
    const contentHash = metadataHash({
      title: input.title,
      canonicalUrl,
      publishedAt: input.publishedAt,
      withdrawn: input.withdrawn ?? false,
    });
    if (input.withdrawn && !previous) throw new Error("CORRECTION_REQUIRED");
    if (previous?.contentHash === contentHash) return { id: previous.id, duplicate: true };
    if (previous?.id !== input.correctionOf || (!previous && input.correctionOf))
      throw new Error("CORRECTION_REQUIRED");
    const [item] = await tx
      .insert(newsItems)
      .values({
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        externalId: input.externalId,
        title: input.title,
        version: (previous?.version ?? 0) + 1,
        canonicalUrl,
        publishedAt: input.publishedAt,
        contentHash,
        rightsPolicy: "metadados",
        withdrawn: input.withdrawn ?? false,
        correctionOf: previous?.id,
        capturedBy: input.actorId,
      })
      .returning({ id: newsItems.id });
    return { id: item.id, duplicate: false };
  });
}

export async function reviewNews(input: {
  tenantId: string;
  actorId: string;
  itemId: string;
  labels: string[];
  sentiment: string | null;
  decision: "approved" | "rejected";
}) {
  const [item] = await db
    .select({ id: newsItems.id })
    .from(newsItems)
    .where(and(eq(newsItems.id, input.itemId), eq(newsItems.tenantId, input.tenantId)))
    .limit(1);
  if (!item) throw new Error("NEWS_NOT_FOUND");
  const [review] = await db
    .insert(newsClassifications)
    .values({
      tenantId: input.tenantId,
      itemId: input.itemId,
      modelVersion: "human-v1",
      promptVersion: "none",
      labels: input.labels,
      sentiment: input.sentiment,
      reviewStatus: input.decision,
      reviewedBy: input.actorId,
      reviewedAt: new Date(),
    })
    .returning({ id: newsClassifications.id });
  return review;
}

export async function listRegulatory(tenantId: string) {
  const latestVersions = db
    .select({
      authority: regulatoryItems.authority,
      actId: regulatoryItems.actId,
      latestVersion: sql<number>`max(${regulatoryItems.version})`.as("latest_version"),
    })
    .from(regulatoryItems)
    .where(eq(regulatoryItems.tenantId, tenantId))
    .groupBy(regulatoryItems.authority, regulatoryItems.actId)
    .as("latest_regulatory_versions");
  const rows = await db
    .select()
    .from(regulatoryItems)
    .innerJoin(
      latestVersions,
      and(
        eq(regulatoryItems.authority, latestVersions.authority),
        eq(regulatoryItems.actId, latestVersions.actId),
        eq(regulatoryItems.version, latestVersions.latestVersion)
      )
    )
    .where(eq(regulatoryItems.tenantId, tenantId))
    .orderBy(desc(regulatoryItems.createdAt))
    .limit(200);
  return rows.map((row) => row.regulatory_items);
}

export async function addRegulatory(input: {
  tenantId: string;
  actorId: string;
  authority: string;
  actId: string;
  jurisdiction: string;
  subject: string;
  publishedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  status: "publicado" | "alterado" | "revogado" | "indeterminado";
  primarySourceUrl: string;
  supersedesId?: string;
}) {
  const primarySourceUrl = requireHttpUrl(input.primarySourceUrl);
  if (input.effectiveUntil && input.effectiveFrom && input.effectiveUntil < input.effectiveFrom)
    throw new Error("INVALID_DATES");
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(regulatoryItems)
      .where(
        and(
          eq(regulatoryItems.tenantId, input.tenantId),
          eq(regulatoryItems.authority, input.authority),
          eq(regulatoryItems.actId, input.actId)
        )
      )
      .orderBy(desc(regulatoryItems.version))
      .limit(1);
    if (previous?.id !== input.supersedesId || (!previous && input.supersedesId))
      throw new Error("CORRECTION_REQUIRED");
    const [item] = await tx
      .insert(regulatoryItems)
      .values({
        tenantId: input.tenantId,
        authority: input.authority,
        actId: input.actId,
        version: (previous?.version ?? 0) + 1,
        jurisdiction: input.jurisdiction,
        subject: input.subject,
        publishedAt: input.publishedAt,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        status: input.status,
        primarySourceUrl,
        supersedesId: previous?.id,
        reviewedBy: input.actorId,
      })
      .returning({ id: regulatoryItems.id });
    return item;
  });
}
