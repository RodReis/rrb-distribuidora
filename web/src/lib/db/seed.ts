import { db } from "./index";
import { eq } from "drizzle-orm";
import {
  tenants,
  users,
  rolePermissions,
  products,
  suppliers,
  customers,
  warehouses,
  machines,
} from "./schema";
import * as argon2 from "argon2";

async function runSeed() {
  console.log("🌱 Starting MetalAgents seed...");

  // 1. Seed Tenant
  const [existingTenant] = await db.select().from(tenants).limit(1);
  let tenantId = existingTenant?.id;

  if (!existingTenant) {
    const [inserted] = await db
      .insert(tenants)
      .values({
        name: "GF Distribuidora de Aços & Metais",
        slug: "gf-distribuidora",
        active: true,
      })
      .returning();
    tenantId = inserted.id;
    console.log("✓ Tenant seeded:", inserted.name);
  } else {
    console.log("ℹ Tenant already exists:", existingTenant.name);
  }

  // 2. Seed Admin User & Test Users
  const isProd = process.env.SEED_MODE === "production";
  if (isProd && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error("SEED_MODE=production exige SEED_ADMIN_PASSWORD (mínimo 12 caracteres).");
  }
  if (isProd && (process.env.SEED_ADMIN_PASSWORD || "").length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD deve ter no mínimo 12 caracteres.");
  }

  const passwordHash = await argon2.hash(process.env.SEED_ADMIN_PASSWORD || "Admin@123456", {
    type: argon2.argon2id,
  });

  const allUsers = [
    {
      email: "rodrigo.reis@gfdistribuicao.com.br",
      name: "Rodrigo Reis",
      role: "admin" as const,
    },
    {
      email: "operador@gfdistribuicao.com.br",
      name: "Operador Estoque",
      role: "estoque" as const,
    },
    {
      email: "vendas@gfdistribuicao.com.br",
      name: "Carlos Vendas",
      role: "vendedor" as const,
    },
    {
      email: "compras@gfdistribuicao.com.br",
      name: "Ana Compradora",
      role: "comprador" as const,
    },
    {
      email: "diretoria@gfdistribuicao.com.br",
      name: "Diretor Geral",
      role: "diretor" as const,
    },
  ];

  const testUsers = isProd ? allUsers.filter((u) => u.role === "admin") : allUsers;

  let adminUserId = "";

  for (const u of testUsers) {
    const [existing] = await db.select().from(users).where(eq(users.email, u.email));
    if (!existing) {
      const [inserted] = await db
        .insert(users)
        .values({
          tenantId: tenantId!,
          email: u.email,
          name: u.name,
          passwordHash,
          role: u.role,
          active: true,
        })
        .returning();
      if (u.role === "admin") adminUserId = inserted.id;
      console.log(`✓ User seeded: ${u.name} (${u.role})`);
    } else {
      if (u.role === "admin") adminUserId = existing.id;
      console.log(`ℹ User already exists: ${u.email}`);
    }
  }

  // 3. Seed Role Permissions Matrix
  const modules = [
    "visao_geral",
    "inteligencia_mercado",
    "estoque_retalhos",
    "compras_rfq",
    "vendas_orcamentos",
    "producao_nesting",
    "qualidade_certificados",
    "financeiro_risco",
    "cadastros_produtos",
    "cadastros_fornecedores",
    "cadastros_clientes",
    "cadastros_depositos",
    "cadastros_maquinas",
    "usuarios_sistema",
    "auditoria",
  ] as const;

  const roles = ["admin", "diretor", "comprador", "vendedor", "estoque", "financeiro"] as const;

  console.log("Seeding role permissions matrix...");
  for (const r of roles) {
    for (const m of modules) {
      let canRead = true;
      let canWrite = false;

      if (r === "admin") {
        canWrite = true;
      } else if (r === "diretor") {
        canWrite = false; // Leitura de tudo
      } else if (r === "comprador") {
        if (m === "compras_rfq" || m === "cadastros_fornecedores" || m === "inteligencia_mercado")
          canWrite = true;
      } else if (r === "vendedor") {
        if (m === "vendas_orcamentos" || m === "cadastros_clientes") canWrite = true;
      } else if (r === "estoque") {
        if (
          m === "estoque_retalhos" ||
          m === "cadastros_produtos" ||
          m === "cadastros_depositos" ||
          m === "cadastros_maquinas"
        )
          canWrite = true;
      } else if (r === "financeiro") {
        if (m === "financeiro_risco") canWrite = true;
      }

      await db
        .insert(rolePermissions)
        .values({
          role: r,
          module: m,
          canRead,
          canWrite,
        })
        .onConflictDoUpdate({
          target: [rolePermissions.role, rolePermissions.module],
          set: { canRead, canWrite },
        });
    }
  }

  if (isProd) {
    console.log("✅ Seed de produção concluído (tenant, admin e permissões).");
    process.exit(0);
  }

  // 4. Seed Mockup Products (from reference RF-01 screen)
  const mockupProducts = [
    {
      sku: "SKU-A36-CG-127",
      erpCode: "940021-USIMINAS",
      family: "chapa_grossa" as const,
      commercialDescription:
        "Chapa Grossa Laminada ASTM A36 12.70mm (1/2'') Dimensões Padrão: 2400 x 6000 mm • Área: 14.40 m² • Borda Aparada CNC",
      fiscalDescription: "CHAPA DE ACO CARBONO LAMINADA A QUENTE ASTM A36 12,70MM",
      norm: "ASTM A36 / ABNT NBR 7007",
      ncm: "72085100",
      thicknessMm: "12.7000",
      widthMm: "2400.0000",
      lengthMm: "6000.0000",
      densityGCm3: "7.8500",
      unit: "kg" as const,
      weightPerUnit: "1435.5000",
      replacementCostBase: "5.3600",
      status: "ativo" as const,
    },
    {
      sku: "SKU-BQ-1008-300",
      erpCode: "910408-CSN",
      family: "bobina" as const,
      commercialDescription:
        "Bobina a Quente SAE 1008 3.00mm x 1500mm Slitter Bobina Master Decapada e Oleada (BQDO) • Raio Int 508mm • Peso Bobina ~12.500 kg",
      fiscalDescription: "BOBINA DE ACO LAMINADA A QUENTE SAE 1008 DECAPADA E OLEADA",
      norm: "SAE 1008 / NBR 5915",
      ncm: "72083890",
      thicknessMm: "3.0000",
      widthMm: "1500.0000",
      lengthMm: "1000.0000",
      densityGCm3: "7.8500",
      unit: "kg" as const,
      weightPerUnit: "35.3200",
      replacementCostBase: "4.7100",
      status: "ativo" as const,
    },
    {
      sku: "SKU-INX-304-200",
      erpCode: "520844-APERAM",
      family: "tubo" as const,
      commercialDescription:
        "Tubo Redondo Inox 304L OD 50.80mm (2'') Parede 2.00mm Tubulação Sanitária / Estrutural • Acabamento Polido Grão 320 • Barra 6.000 mm",
      fiscalDescription: "TUBOS DE ACO INOXIDAVEL AUSTENITICO AISI 304L COM COSTURA",
      norm: "ASTM A554 / AISI 304L",
      ncm: "73064000",
      diameterMm: "50.8000",
      wallMm: "2.0000",
      lengthMm: "6000.0000",
      densityGCm3: "7.9300",
      unit: "m" as const,
      weightPerUnit: "14.6400",
      replacementCostBase: "24.9000",
      status: "ativo" as const,
    },
    {
      sku: "SKU-ALU-5052-476",
      erpCode: "884019-CBA",
      family: "chapa_grossa" as const,
      commercialDescription:
        "Chapa Alumínio Naval 5052-H32 4.76mm (3/16'') x 1500 x 3000mm Liga Não-Ferrosa Resistente à Corrosão Marítima • Película Protetora Laser",
      fiscalDescription: "CHAPAS DE LIGAS DE ALUMINIO NAVAL SERIE 5000",
      norm: "ASTM B209 / AA 5052",
      ncm: "76061290",
      thicknessMm: "4.7600",
      widthMm: "1500.0000",
      lengthMm: "3000.0000",
      densityGCm3: "2.6800",
      unit: "kg" as const,
      weightPerUnit: "57.3800",
      replacementCostBase: "29.4000",
      status: "ativo" as const,
    },
    {
      sku: "SKU-W200-313",
      erpCode: "703212-GERDAU",
      family: "perfil" as const,
      commercialDescription:
        "Viga Perfil W 200 x 31.3 kg/m Alma 210mm ASTM A572 Gr. 50 Perfil I/H Laminado Estrutural • Comprimento Comercial 12.000 mm",
      fiscalDescription: "PERFIS DE ACO ESTRUTURAL I OU H LAMINADOS A QUENTE A572",
      norm: "ASTM A572 / NBR 5884",
      ncm: "72163300",
      lengthMm: "12000.0000",
      densityGCm3: "7.8500",
      unit: "m" as const,
      weightPerUnit: "375.6000",
      replacementCostBase: "6.8500",
      status: "ativo" as const,
    },
    {
      sku: "SKU-1045-TB-120",
      erpCode: "412098-V&M",
      family: "tubo" as const,
      commercialDescription:
        "Tubo Mecânico Sem Costura Laminado SAE 1045 Ø Ext 120mm x Parede 20mm Em Quarentena Técnica: Aguardando re-homologação de desvio dimensional de espessura",
      fiscalDescription: "TUBOS DE ACO CARBONO SEM COSTURA DE USO MECANICO",
      norm: "DIN 2391 / SAE 1045",
      ncm: "73043990",
      diameterMm: "120.0000",
      wallMm: "20.0000",
      lengthMm: "6000.0000",
      densityGCm3: "7.8500",
      unit: "m" as const,
      weightPerUnit: "295.9200",
      replacementCostBase: "9.2000",
      status: "inativo" as const,
    },
  ];

  console.log("Seeding mockup products...");
  for (const p of mockupProducts) {
    await db
      .insert(products)
      .values({
        ...p,
        tenantId: tenantId!,
        createdBy: adminUserId || null,
        updatedBy: adminUserId || null,
      })
      .onConflictDoNothing();
  }

  // 5. Seed Warehouses & Machines
  await db
    .insert(warehouses)
    .values([
      {
        tenantId: tenantId!,
        name: "Matriz — Centro de Serviços SP (Mooca)",
        address: "Rua Borges de Figueiredo, Mooca - São Paulo, SP",
        type: "matriz",
        active: true,
      },
      {
        tenantId: tenantId!,
        name: "Filial Sul — Centro de Corte & Slitter (Joinville)",
        address: "Distrito Industrial - Joinville, SC",
        type: "filial",
        active: true,
      },
      {
        tenantId: tenantId!,
        name: "Pátio Santos — Alfândega Bobinas",
        address: "Porto de Santos, SP",
        type: "patio",
        active: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(machines)
    .values([
      {
        tenantId: tenantId!,
        name: "Laser Fibra Óptica 12kW - Bodor",
        type: "laser",
        costPerHour: "450.0000",
        setupMin: 15,
        active: true,
      },
      {
        tenantId: tenantId!,
        name: "Mesa Plasma Alta Definição 260A - Hypertherm",
        type: "plasma",
        costPerHour: "320.0000",
        setupMin: 20,
        active: true,
      },
      {
        tenantId: tenantId!,
        name: "Guilhotina Hidráulica 16mm x 3000mm - Newton",
        type: "guilhotina",
        costPerHour: "180.0000",
        setupMin: 10,
        active: true,
      },
      {
        tenantId: tenantId!,
        name: "Dobradeira CNC 220t x 4000mm",
        type: "dobra",
        costPerHour: "250.0000",
        setupMin: 25,
        active: true,
      },
    ])
    .onConflictDoNothing();

  // 6. Seed Suppliers & Customers
  await db
    .insert(suppliers)
    .values([
      {
        tenantId: tenantId!,
        legalName: "Usinas Siderúrgicas de Minas Gerais S.A. - USIMINAS",
        tradeName: "Usiminas",
        cnpj: "60.872.504/0001-23",
        city: "Belo Horizonte",
        uf: "MG",
        type: "usina",
        leadTimeDays: 21,
        paymentTerms: "30/60 DDL",
        contacts: {
          email: "comercial.chapas@usiminas.com",
          phone: "(31) 3499-8000",
          contactName: "Roberto Silveira",
        },
      },
      {
        tenantId: tenantId!,
        legalName: "Companhia Siderúrgica Nacional - CSN",
        tradeName: "CSN",
        cnpj: "33.042.730/0001-04",
        city: "Volta Redonda",
        uf: "RJ",
        type: "usina",
        leadTimeDays: 28,
        paymentTerms: "45 DDL",
        contacts: {
          email: "vendas.bobinas@csn.com.br",
          phone: "(24) 3344-4000",
          contactName: "Fernanda Lemos",
        },
      },
      {
        tenantId: tenantId!,
        legalName: "Gerdau Aços Longos S.A.",
        tradeName: "Gerdau",
        cnpj: "07.358.761/0001-69",
        city: "São Paulo",
        uf: "SP",
        type: "usina",
        leadTimeDays: 14,
        paymentTerms: "30 DDL",
        contacts: {
          email: "estruturais@gerdau.com.br",
          phone: "(11) 3094-6600",
          contactName: "Marcelo Dantas",
        },
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(customers)
    .values([
      {
        tenantId: tenantId!,
        legalName: "Estruturas Metálicas Paulistas Ltda",
        tradeName: "Paulista Estruturas",
        document: "12.345.678/0001-90",
        city: "Guarulhos",
        uf: "SP",
        stateRegistration: "336.123.456.789",
        segment: "Construção Metálica e Galpões",
        contacts: {
          email: "suprimentos@paulistaestruturas.com.br",
          phone: "(11) 2440-1000",
          contactName: "Eng. Paulo Mendes",
        },
      },
      {
        tenantId: tenantId!,
        legalName: "Indústria de Caldeiraria e Tanques Santa Luzia Eireli",
        tradeName: "Caldeiraria Santa Luzia",
        document: "98.765.432/0001-10",
        city: "Campinas",
        uf: "SP",
        stateRegistration: "244.987.654.321",
        segment: "Caldeiraria Pesada e Óleo & Gás",
        contacts: {
          email: "compras@santaluziacald.com.br",
          phone: "(19) 3788-9900",
          contactName: "Juliana Andrade",
        },
      },
    ])
    .onConflictDoNothing();

  console.log("✅ Seed completed successfully!");
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
