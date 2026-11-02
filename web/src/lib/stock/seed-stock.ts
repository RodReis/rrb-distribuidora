import "dotenv/config";
import { db } from "@/lib/db";
import {
  tenants,
  users,
  products,
  warehouses,
  suppliers,
  stockLots,
  stockMovements,
  stockRemnants,
  stockPredictiveMetrics,
  stockCycleCounts,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { recalculatePredictiveMetricsForTenant } from "./predictive-engine";

export async function seedStockData() {
  console.log("🌱 Invocando seed de Estoque & Retalhos (MVP-02)...");

  // 1. Fetch default tenant and admin user
  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) throw new Error("Tenant não encontrado. Execute db:seed primeiro.");

  const [adminUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.role, "admin")))
    .limit(1);
  const userId = adminUser?.id || (await db.select().from(users).limit(1))[0].id;

  // 2. Fetch or create central warehouse
  let [warehouse] = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.tenantId, tenant.id))
    .limit(1);

  if (!warehouse) {
    const [w] = await db
      .insert(warehouses)
      .values({
        tenantId: tenant.id,
        name: "Galpão Central - Box B",
        type: "matriz",
        address: "Av. Industrial 1000 - Armazém A",
      })
      .returning();
    warehouse = w;
  }

  // 3. Fetch or ensure products and suppliers matching the mockup
  // Gerdau supplier
  let [gerdau] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenant.id), eq(suppliers.cnpj, "33611500000119")))
    .limit(1);

  if (!gerdau) {
    const [s] = await db
      .insert(suppliers)
      .values({
        tenantId: tenant.id,
        legalName: "Gerdau Aços Longos S.A.",
        tradeName: "Gerdau Ouro Branco",
        cnpj: "33611500000119",
        leadTimeDays: 14,
        type: "usina",
      })
      .returning();
    gerdau = s;
  }

  // CSN supplier
  let [csn] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenant.id), eq(suppliers.cnpj, "33042730000104")))
    .limit(1);

  if (!csn) {
    const [s] = await db
      .insert(suppliers)
      .values({
        tenantId: tenant.id,
        legalName: "Companhia Siderúrgica Nacional",
        tradeName: "CSN Volta Redonda",
        cnpj: "33042730000104",
        leadTimeDays: 12,
        type: "usina",
      })
      .returning();
    csn = s;
  }

  // Usiminas supplier
  let [usiminas] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenant.id), eq(suppliers.cnpj, "60872504000120")))
    .limit(1);

  if (!usiminas) {
    const [s] = await db
      .insert(suppliers)
      .values({
        tenantId: tenant.id,
        legalName: "Usinas Siderúrgicas de Minas Gerais S.A.",
        tradeName: "Usiminas Ipatinga",
        cnpj: "60872504000120",
        leadTimeDays: 18,
        type: "usina",
      })
      .returning();
    usiminas = s;
  }

  // Aperam supplier
  let [aperam] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenant.id), eq(suppliers.cnpj, "22510255000101")))
    .limit(1);

  if (!aperam) {
    const [s] = await db
      .insert(suppliers)
      .values({
        tenantId: tenant.id,
        legalName: "Aperam South America",
        tradeName: "Aperam Timóteo",
        cnpj: "22510255000101",
        leadTimeDays: 15,
        type: "usina",
      })
      .returning();
    aperam = s;
  }

  // Fetch or upsert mock products matching the table in code.html
  // Product 1: Chapa Grossa A36 1/2" (12.70mm)
  let [prodA36] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenant.id), eq(products.sku, "CG-A36-1270")))
    .limit(1);

  if (!prodA36) {
    const [p] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        sku: "CG-A36-1270",
        erpCode: "GERDAU-A36-1270",
        family: "chapa_grossa",
        commercialDescription: 'Chapa Grossa A36 1/2" (12.70mm) Gerdau Ouro Branco',
        fiscalDescription: "CHAPA GROSSA DE ACO CARBONO ASTM A36 12.70MM",
        norm: "ASTM A36",
        ncm: "72085100",
        thicknessMm: "12.7000",
        widthMm: "2400.0000",
        lengthMm: "6000.0000",
        densityGCm3: "7.8500",
        unit: "t",
        weightPerUnit: "1.4355",
        replacementCostBase: "5.4200", // R$/kg (o lote abaixo é R$ 5.420 por t)
        status: "ativo",
      })
      .returning();
    prodA36 = p;
  }

  // Product 2: Bobina a Quente SAE 1008 2.00mm
  let [prodBQ] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenant.id), eq(products.sku, "BQ-1008-200")))
    .limit(1);

  if (!prodBQ) {
    const [p] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        sku: "BQ-1008-200",
        erpCode: "CSN-BQ-1008-200",
        family: "bobina",
        commercialDescription: "Bobina a Quente SAE 1008 2.00mm CSN Volta Redonda",
        fiscalDescription: "BOBINA DE ACO LAMINADA A QUENTE SAE 1008",
        norm: "SAE 1008",
        ncm: "72083890",
        thicknessMm: "2.0000",
        widthMm: "1500.0000",
        lengthMm: "1000.0000",
        densityGCm3: "7.8500",
        unit: "t",
        weightPerUnit: "1.0000",
        replacementCostBase: "4.7100", // R$/kg (o lote abaixo é R$ 4.710 por t)
        status: "ativo",
      })
      .returning();
    prodBQ = p;
  }

  // Product 3: Chapa Fina a Frio 1.20mm (FF)
  let [prodFF] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenant.id), eq(products.sku, "CF-1006-120")))
    .limit(1);

  if (!prodFF) {
    const [p] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        sku: "CF-1006-120",
        erpCode: "USIMINAS-FF-120",
        family: "chapa_grossa",
        commercialDescription: "Chapa Fina a Frio 1.20mm (FF) Usiminas Ipatinga",
        fiscalDescription: "CHAPA DE ACO LAMINADA A FRIO SAE 1006 1.20MM",
        norm: "SAE 1006 / NBR 5915",
        ncm: "72091700",
        thicknessMm: "1.2000",
        widthMm: "1200.0000",
        lengthMm: "3000.0000",
        densityGCm3: "7.8500",
        unit: "t",
        weightPerUnit: "0.0339",
        replacementCostBase: "6.1000", // R$/kg (o lote abaixo é R$ 6.100 por t)
        status: "ativo",
      })
      .returning();
    prodFF = p;
  }

  // Product 4: Tubo Redondo Inox 304 2" x 2.00mm
  let [prodInox] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenant.id), eq(products.sku, "TB-304-200")))
    .limit(1);

  if (!prodInox) {
    const [p] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        sku: "TB-304-200",
        erpCode: "APERAM-TB-304",
        family: "tubo",
        commercialDescription: 'Tubo Redondo Inox 304 2" x 2.00mm Aperam Timóteo',
        fiscalDescription: "TUBOS DE ACO INOXIDAVEL AUSTENITICO AISI 304",
        norm: "ASTM A554",
        ncm: "73064000",
        diameterMm: "50.8000",
        wallMm: "2.0000",
        lengthMm: "6000.0000",
        densityGCm3: "7.9300",
        unit: "un",
        weightPerUnit: "14.6400",
        replacementCostBase: "25.9563", // R$/kg = R$ 380 por barra ÷ 14,64 kg
        status: "ativo",
      })
      .returning();
    prodInox = p;
  }

  // 4. Seed Stock Lots matching mockup positions
  const seedLots = [
    {
      productId: prodA36.id,
      lotNumber: "LT-GD-8910",
      heatNumber: "C-99412B",
      supplierId: gerdau.id,
      quantityInitial: "45.0000",
      quantityCurrent: "18.5000", // 18.5 t
      unitCost: "5420.0000",
      locationAddress: "Galpão Central - Box B-04",
    },
    {
      productId: prodBQ.id,
      lotNumber: "LT-CSN-4412",
      heatNumber: "CSN-7781A",
      supplierId: csn.id,
      quantityInitial: "60.0000",
      quantityCurrent: "42.0000", // 42.0 t
      unitCost: "4710.0000",
      locationAddress: "Pátio Slitter - Box 02",
    },
    {
      productId: prodFF.id,
      lotNumber: "LT-USI-2291",
      heatNumber: "USI-4410",
      supplierId: usiminas.id,
      quantityInitial: "25.0000",
      quantityCurrent: "8.2000", // 8.2 t
      unitCost: "6100.0000",
      locationAddress: "Rua A - Prateleira P-04",
    },
    {
      productId: prodInox.id,
      lotNumber: "LT-AP-1088",
      heatNumber: "INX-5510",
      supplierId: aperam.id,
      quantityInitial: "200.0000",
      quantityCurrent: "120.0000", // 120 barras
      unitCost: "380.0000",
      locationAddress: "Rua C - Prateleira 02",
    },
  ];

  const createdLots: any[] = [];
  for (const sl of seedLots) {
    const [existing] = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenant.id), eq(stockLots.lotNumber, sl.lotNumber)))
      .limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(stockLots)
        .values({
          tenantId: tenant.id,
          productId: sl.productId,
          warehouseId: warehouse.id,
          lotNumber: sl.lotNumber,
          heatNumber: sl.heatNumber,
          supplierId: sl.supplierId,
          quantityInitial: sl.quantityInitial,
          quantityCurrent: sl.quantityCurrent,
          unitCost: sl.unitCost,
          locationAddress: sl.locationAddress,
          status: "ativo",
        })
        .returning();
      createdLots.push(inserted);

      // Add movement history
      await db.insert(stockMovements).values({
        tenantId: tenant.id,
        productId: sl.productId,
        lotId: inserted.id,
        warehouseId: warehouse.id,
        movementType: "ENTRADA_COMPRA",
        quantity: sl.quantityInitial,
        unitCost: sl.unitCost,
        totalCost: String(Number(sl.quantityInitial) * Number(sl.unitCost)),
        referenceDocument: `NF-e Usina ${sl.lotNumber}`,
        createdBy: userId,
      });

      // Add consumption movement
      const consumedQty = Number(sl.quantityInitial) - Number(sl.quantityCurrent);
      if (consumedQty > 0) {
        await db.insert(stockMovements).values({
          tenantId: tenant.id,
          productId: sl.productId,
          lotId: inserted.id,
          warehouseId: warehouse.id,
          movementType: "CORTE_CONSUMO",
          quantity: String(-consumedQty),
          unitCost: sl.unitCost,
          totalCost: String(consumedQty * Number(sl.unitCost)),
          referenceDocument: "OP #7890 (Plasma 01)",
          createdBy: userId,
        });
      }
    } else {
      createdLots.push(existing);
    }
  }

  // 5. Seed Cataloged Remnants (Mockup 1:1)
  const seedRemnants = [
    {
      code: "RET-8941",
      productId: prodA36.id,
      thicknessMm: "12.70",
      widthMm: "1250.00",
      lengthMm: "2400.00",
      diameterMm: null,
      weightKg: "298.500",
      locationAddress: "Galpão Central - Box B-04",
      status: "reservado", // Alocado em OP
      notes: "Origem: OP #7890 (Plasma 01). Alocado p/ OP #8102 (Eco: R$ 1.840)",
    },
    {
      code: "RET-8942",
      productId: prodInox.id,
      thicknessMm: "3.00",
      widthMm: "850.00",
      lengthMm: "1600.00",
      diameterMm: null,
      weightKg: "32.400",
      locationAddress: "Rua A - Prateleira P-04",
      status: "disponivel",
      notes: "Origem: OP #7741 (Laser Fibra). Inox 304L Escovado (#11)",
    },
    {
      code: "RET-8943",
      productId: prodA36.id,
      thicknessMm: "4.75",
      widthMm: "600.00",
      lengthMm: "3000.00",
      diameterMm: null,
      weightKg: "23.100",
      locationAddress: "Rua C - Prateleira 02",
      status: "disponivel",
      notes: "Origem: OP #8012 (Guilhotina CNC). Apto p/ dobra caldeiraria",
    },
    {
      code: "RET-8944",
      productId: prodBQ.id,
      thicknessMm: "1.50",
      widthMm: "450.00",
      lengthMm: "1200.00",
      diameterMm: null,
      weightKg: "79.500",
      locationAddress: "Pátio Slitter - Box 01",
      status: "disponivel",
      notes: "Ponta de Bobina Galvanizada Z275 (Slitter)",
    },
  ];

  for (const rem of seedRemnants) {
    const [existing] = await db
      .select()
      .from(stockRemnants)
      .where(and(eq(stockRemnants.tenantId, tenant.id), eq(stockRemnants.code, rem.code)))
      .limit(1);

    if (!existing) {
      await db.insert(stockRemnants).values({
        tenantId: tenant.id,
        code: rem.code,
        productId: rem.productId,
        warehouseId: warehouse.id,
        thicknessMm: rem.thicknessMm,
        widthMm: rem.widthMm,
        lengthMm: rem.lengthMm,
        diameterMm: rem.diameterMm,
        weightKg: rem.weightKg,
        locationAddress: rem.locationAddress,
        status: rem.status,
        notes: rem.notes,
      });
    }
  }

  // 6. Seed initial Predictive Metrics for exact mockup values
  // A36: 18.5t, 2.2t/dia, 8 dias cob, 14d LT, RUPTURA IMINENTE
  await db
    .insert(stockPredictiveMetrics)
    .values({
      productId: prodA36.id,
      tenantId: tenant.id,
      currentStockQty: "18.5000",
      avgDailyConsumption30d: "2.2000",
      leadTimeDays: 14,
      coverageDays: "8.0",
      safetyStockQty: "15.0000",
      reorderPointQty: "45.8000",
      predictiveStatus: "CRITICAL_RUPTURE",
      suggestedPurchaseQty: "45.0000",
      suggestedPurchaseDate: new Date(),
      curveAbc: "A",
      curveXyz: "X",
    })
    .onConflictDoUpdate({
      target: stockPredictiveMetrics.productId,
      set: {
        currentStockQty: "18.5000",
        avgDailyConsumption30d: "2.2000",
        leadTimeDays: 14,
        coverageDays: "8.0",
        predictiveStatus: "CRITICAL_RUPTURE",
        suggestedPurchaseQty: "45.0000",
      },
    });

  // BQ: 42.0t, 3.8t/dia, 11 dias cob, 12d LT, PONTO DE PEDIDO
  await db
    .insert(stockPredictiveMetrics)
    .values({
      productId: prodBQ.id,
      tenantId: tenant.id,
      currentStockQty: "42.0000",
      avgDailyConsumption30d: "3.8000",
      leadTimeDays: 12,
      coverageDays: "11.0",
      safetyStockQty: "20.0000",
      reorderPointQty: "65.6000",
      predictiveStatus: "WARNING",
      suggestedPurchaseQty: "60.0000",
      suggestedPurchaseDate: new Date(Date.now() + 86400000),
      curveAbc: "A",
      curveXyz: "Y",
    })
    .onConflictDoUpdate({
      target: stockPredictiveMetrics.productId,
      set: {
        currentStockQty: "42.0000",
        avgDailyConsumption30d: "3.8000",
        leadTimeDays: 12,
        coverageDays: "11.0",
        predictiveStatus: "WARNING",
        suggestedPurchaseQty: "60.0000",
      },
    });

  // FF: 8.2t, 1.4t/dia, 6 dias cob, 18d LT, ALERTA CRITICO
  await db
    .insert(stockPredictiveMetrics)
    .values({
      productId: prodFF.id,
      tenantId: tenant.id,
      currentStockQty: "8.2000",
      avgDailyConsumption30d: "1.4000",
      leadTimeDays: 18,
      coverageDays: "6.0",
      safetyStockQty: "10.0000",
      reorderPointQty: "35.2000",
      predictiveStatus: "CRITICAL_RUPTURE",
      suggestedPurchaseQty: "30.0000",
      suggestedPurchaseDate: new Date(),
      curveAbc: "B",
      curveXyz: "Z",
    })
    .onConflictDoUpdate({
      target: stockPredictiveMetrics.productId,
      set: {
        currentStockQty: "8.2000",
        avgDailyConsumption30d: "1.4000",
        leadTimeDays: 18,
        coverageDays: "6.0",
        predictiveStatus: "CRITICAL_RUPTURE",
        suggestedPurchaseQty: "30.0000",
      },
    });

  // Inox: 120 barras, 4.3 bar/dia, 28 dias cob, 15d LT, COBERTURA SEGURA
  await db
    .insert(stockPredictiveMetrics)
    .values({
      productId: prodInox.id,
      tenantId: tenant.id,
      currentStockQty: "120.0000",
      avgDailyConsumption30d: "4.3000",
      leadTimeDays: 15,
      coverageDays: "28.0",
      safetyStockQty: "30.0000",
      reorderPointQty: "94.5000",
      predictiveStatus: "HEALTHY",
      suggestedPurchaseQty: "0",
      suggestedPurchaseDate: null,
      curveAbc: "B",
      curveXyz: "X",
    })
    .onConflictDoUpdate({
      target: stockPredictiveMetrics.productId,
      set: {
        currentStockQty: "120.0000",
        avgDailyConsumption30d: "4.3000",
        leadTimeDays: 15,
        coverageDays: "28.0",
        predictiveStatus: "HEALTHY",
      },
    });

  // 7. Seed sample cycle count record (to provide high accuracy metric)
  const [existingCount] = await db
    .select()
    .from(stockCycleCounts)
    .where(eq(stockCycleCounts.tenantId, tenant.id))
    .limit(1);

  if (!existingCount && createdLots.length > 0) {
    await db.insert(stockCycleCounts).values({
      tenantId: tenant.id,
      productId: prodInox.id,
      lotId: createdLots[3]?.id || createdLots[0].id,
      warehouseId: warehouse.id,
      systemQty: "120.0000",
      countedQty: "120.0000",
      differenceQty: "0.0000",
      adjusted: false,
      justification: "Conferência cega rotineira - Acuracidade 100%",
      countedBy: userId,
      status: "conferido",
    });
  }

  console.log("✅ Seed de Estoque & Retalhos concluído com sucesso!");
}

if (process.argv[1]?.includes("seed-stock")) {
  seedStockData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Falha no seed de estoque:", err);
      process.exit(1);
    });
}
