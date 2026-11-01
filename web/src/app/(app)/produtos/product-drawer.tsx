"use client";

import * as React from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calculateTheoreticalWeight, getDefaultDensity } from "@/lib/metallurgy/weight";
import { saveProduct, ProductInput } from "./actions";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product?: any | null; // null = novo
}

export function ProductDrawer({ isOpen, onClose, product }: ProductDrawerProps) {
  const isEditing = !!product?.id;

  const [family, setFamily] = React.useState<any>("chapa_grossa");
  const [erpCode, setErpCode] = React.useState("");
  const [commercialDescription, setCommercialDescription] = React.useState("");
  const [fiscalDescription, setFiscalDescription] = React.useState("");
  const [norm, setNorm] = React.useState("ASTM A36");
  const [ncm, setNcm] = React.useState("72085100");
  const [unit, setUnit] = React.useState<any>("kg");
  const [status, setStatus] = React.useState<any>("ativo");

  // Dimensions
  const [thicknessMm, setThicknessMm] = React.useState<number | "">("");
  const [widthMm, setWidthMm] = React.useState<number | "">("");
  const [lengthMm, setLengthMm] = React.useState<number | "">("");
  const [diameterMm, setDiameterMm] = React.useState<number | "">("");
  const [wallMm, setWallMm] = React.useState<number | "">("");
  const [densityGCm3, setDensityGCm3] = React.useState<number>(7.85);

  // Financial
  const [replacementCostBase, setReplacementCostBase] = React.useState<number | "">(5.5);
  const [loading, setLoading] = React.useState(false);

  // Populate on open
  React.useEffect(() => {
    if (product) {
      setFamily(product.family || "chapa_grossa");
      setErpCode(product.erpCode || "");
      setCommercialDescription(product.commercialDescription || "");
      setFiscalDescription(product.fiscalDescription || "");
      setNorm(product.norm || "ASTM A36");
      setNcm(product.ncm || "72085100");
      setUnit(product.unit || "kg");
      setStatus(product.status || "ativo");
      setThicknessMm(product.thicknessMm ? parseFloat(product.thicknessMm) : "");
      setWidthMm(product.widthMm ? parseFloat(product.widthMm) : "");
      setLengthMm(product.lengthMm ? parseFloat(product.lengthMm) : "");
      setDiameterMm(product.diameterMm ? parseFloat(product.diameterMm) : "");
      setWallMm(product.wallMm ? parseFloat(product.wallMm) : "");
      setDensityGCm3(product.densityGCm3 ? parseFloat(product.densityGCm3) : 7.85);
      setReplacementCostBase(
        product.replacementCostBase ? parseFloat(product.replacementCostBase) : 5.5
      );
    } else {
      // Default reset
      setFamily("chapa_grossa");
      setErpCode("");
      setCommercialDescription("");
      setFiscalDescription("");
      setNorm("ASTM A36");
      setNcm("72085100");
      setUnit("kg");
      setStatus("ativo");
      setThicknessMm(12.7);
      setWidthMm(2400);
      setLengthMm(6000);
      setDiameterMm("");
      setWallMm("");
      setDensityGCm3(7.85);
      setReplacementCostBase(5.36);
    }
  }, [product, isOpen]);

  // Dynamic theoretical weight calculation
  const calculated = React.useMemo(() => {
    return calculateTheoreticalWeight({
      family,
      thicknessMm: typeof thicknessMm === "number" ? thicknessMm : null,
      widthMm: typeof widthMm === "number" ? widthMm : null,
      lengthMm: typeof lengthMm === "number" ? lengthMm : null,
      diameterMm: typeof diameterMm === "number" ? diameterMm : null,
      wallMm: typeof wallMm === "number" ? wallMm : null,
      densityGCm3,
      unit,
    });
  }, [family, thicknessMm, widthMm, lengthMm, diameterMm, wallMm, densityGCm3, unit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commercialDescription || !fiscalDescription || !norm || !ncm) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    if (ncm.length !== 8) {
      toast.error("O código NCM deve possuir exatamente 8 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const input: ProductInput = {
        id: product?.id,
        erpCode: erpCode || null,
        family,
        commercialDescription,
        fiscalDescription,
        norm,
        ncm,
        thicknessMm: typeof thicknessMm === "number" ? thicknessMm : null,
        widthMm: typeof widthMm === "number" ? widthMm : null,
        lengthMm: typeof lengthMm === "number" ? lengthMm : null,
        diameterMm: typeof diameterMm === "number" ? diameterMm : null,
        wallMm: typeof wallMm === "number" ? wallMm : null,
        densityGCm3,
        unit,
        replacementCostBase: typeof replacementCostBase === "number" ? replacementCostBase : 0,
        status,
      };

      const res = await saveProduct(input);
      if (res.success) {
        toast.success(
          isEditing
            ? `Produto ${product.sku} atualizado com sucesso.`
            : `Produto ${res.product.sku} cadastrado com sucesso.`
        );
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Não foi possível salvar o produto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing ? `Edição de Produto — ${product?.sku}` : "+ Cadastrar Novo Produto Metálico"
      }
      subtitle="Parâmetros técnicos, tolerâncias e cálculo automático de massa teórica"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Produto"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identificadores */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Código ERP / Usina (Opcional)
            </label>
            <Input
              value={erpCode}
              onChange={(e) => setErpCode(e.target.value)}
              placeholder="Ex: 940021-USIMINAS"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Família Metalúrgica *
            </label>
            <Select
              value={family}
              onChange={(e) => {
                const fam = e.target.value;
                setFamily(fam);
                setDensityGCm3(getDefaultDensity(fam, norm));
              }}
            >
              <option value="chapa_grossa">Chapa Grossa / Laminada</option>
              <option value="bobina">Bobina a Quente / Slitter</option>
              <option value="tubo">Tubo Mecânico / Estrutural</option>
              <option value="perfil">Perfil Estrutural (W, I, U)</option>
              <option value="barra">Barra Redonda / Trefilada</option>
            </Select>
          </div>
        </div>

        {/* Descrições */}
        <div>
          <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
            Descrição Comercial (Orçamentos & Catálogo) *
          </label>
          <Input
            value={commercialDescription}
            onChange={(e) => setCommercialDescription(e.target.value)}
            placeholder="Ex: Chapa Grossa Laminada ASTM A36 12.70mm x 2400 x 6000mm..."
            required
          />
        </div>

        <div>
          <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
            Descrição Fiscal (Padrão SEFAZ / Danfe) *
          </label>
          <Input
            value={fiscalDescription}
            onChange={(e) => setFiscalDescription(e.target.value)}
            placeholder="Ex: CHAPA DE ACO CARBONO LAMINADA A QUENTE ASTM A36"
            required
          />
        </div>

        {/* Norma e NCM */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Norma Técnica / Especificação *
            </label>
            <Input
              value={norm}
              onChange={(e) => {
                const val = e.target.value;
                setNorm(val);
                setDensityGCm3(getDefaultDensity(family, val));
              }}
              placeholder="Ex: ASTM A36 / NBR 7007"
              required
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              NCM (8 Dígitos) *
            </label>
            <Input
              value={ncm}
              maxLength={8}
              onChange={(e) => setNcm(e.target.value.replace(/\D/g, ""))}
              placeholder="72085100"
              required
              className="font-mono"
            />
          </div>
        </div>

        {/* Dimensões Condicionais por Família */}
        <div className="p-3 bg-carbon-950 rounded border border-carbon-800 space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-carbon-800">
            <span className="text-label-caps font-semibold uppercase text-titanium-light">
              Dimensões e Geometria da Peça
            </span>
            <span className="font-mono text-label-code text-carmine-signal">
              CALIBRAGEM TOLERÂNCIA MILIMÉTRICA
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(family === "chapa_grossa" || family === "bobina") && (
              <>
                <div>
                  <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                    Espessura [mm]
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={thicknessMm}
                    onChange={(e) =>
                      setThicknessMm(e.target.value ? parseFloat(e.target.value) : "")
                    }
                    placeholder="12.7"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                    Largura [mm]
                  </label>
                  <Input
                    type="number"
                    step="1"
                    value={widthMm}
                    onChange={(e) => setWidthMm(e.target.value ? parseFloat(e.target.value) : "")}
                    placeholder="2400"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                    Comprimento [mm]
                  </label>
                  <Input
                    type="number"
                    step="1"
                    value={lengthMm}
                    onChange={(e) => setLengthMm(e.target.value ? parseFloat(e.target.value) : "")}
                    placeholder="6000"
                    className="font-mono"
                  />
                </div>
              </>
            )}

            {(family === "tubo" || family === "barra") && (
              <>
                <div>
                  <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                    Diâmetro Externo [mm]
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={diameterMm}
                    onChange={(e) =>
                      setDiameterMm(e.target.value ? parseFloat(e.target.value) : "")
                    }
                    placeholder="50.8"
                    className="font-mono"
                  />
                </div>
                {family === "tubo" && (
                  <div>
                    <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                      Parede [mm]
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={wallMm}
                      onChange={(e) => setWallMm(e.target.value ? parseFloat(e.target.value) : "")}
                      placeholder="2.0"
                      className="font-mono"
                    />
                  </div>
                )}
                <div>
                  <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                    Comprimento Barra [mm]
                  </label>
                  <Input
                    type="number"
                    step="1"
                    value={lengthMm}
                    onChange={(e) => setLengthMm(e.target.value ? parseFloat(e.target.value) : "")}
                    placeholder="6000"
                    className="font-mono"
                  />
                </div>
              </>
            )}

            {family === "perfil" && (
              <div>
                <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                  Comprimento Comercial [mm]
                </label>
                <Input
                  type="number"
                  step="1"
                  value={lengthMm}
                  onChange={(e) => setLengthMm(e.target.value ? parseFloat(e.target.value) : "")}
                  placeholder="12000"
                  className="font-mono"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Densidade [g/cm³]
              </label>
              <Input
                type="number"
                step="0.01"
                value={densityGCm3}
                onChange={(e) => setDensityGCm3(parseFloat(e.target.value) || 7.85)}
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Unidade Comercial
              </label>
              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="kg">Quilograma (kg)</option>
                <option value="m">Metro Linear (m)</option>
                <option value="un">Peça / Barra (un)</option>
                <option value="t">Tonelada (t)</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Display Calculado de Peso Teórico */}
        <div className="bg-carbon-950 p-3 rounded border border-carbon-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-signal-buy" />
            <div>
              <span className="text-label-caps text-titanium-muted uppercase block">
                Massa Teórica Calculada
              </span>
              <span className="font-mono text-body-sm text-ice-white font-medium">
                {calculated.weightPerSquareMeter
                  ? `${calculated.weightPerSquareMeter} kg/m² • `
                  : calculated.weightPerMeter
                    ? `${calculated.weightPerMeter} kg/m • `
                    : ""}
                Total: {calculated.weightPerUnit} kg / unidade
              </span>
            </div>
          </div>
          <span className="font-mono text-label-code bg-signal-buy/10 text-signal-buy border border-signal-buy/30 px-2 py-1 rounded">
            PRECISÃO &lt; 0.5%
          </span>
        </div>

        {/* Preço de Reposição e Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Custo de Reposição Base (R$/kg) *
            </label>
            <Input
              type="number"
              step="0.01"
              value={replacementCostBase}
              onChange={(e) =>
                setReplacementCostBase(e.target.value ? parseFloat(e.target.value) : "")
              }
              placeholder="5.36"
              required
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Status Operacional
            </label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ativo">Ativo (Liberado Vendas/Estoque)</option>
              <option value="homologacao">Em Homologação Técnica</option>
              <option value="inativo">Inativo / Fora de Linha</option>
            </Select>
          </div>
        </div>
      </form>
    </FormDrawer>
  );
}
