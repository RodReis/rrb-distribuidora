"use client";

import * as React from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveSupplier, SupplierInput } from "./actions";
import { toast } from "sonner";

export interface SupplierDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: any | null;
}

export function SupplierDrawer({ isOpen, onClose, supplier }: SupplierDrawerProps) {
  const isEditing = !!supplier?.id;

  const [legalName, setLegalName] = React.useState("");
  const [tradeName, setTradeName] = React.useState("");
  const [cnpj, setCnpj] = React.useState("");
  const [type, setType] = React.useState<any>("usina");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("SP");
  const [leadTimeDays, setLeadTimeDays] = React.useState<number>(14);
  const [paymentTerms, setPaymentTerms] = React.useState("30 DDL");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (supplier) {
      setLegalName(supplier.legalName || "");
      setTradeName(supplier.tradeName || "");
      setCnpj(supplier.cnpj || "");
      setType(supplier.type || "usina");
      setCity(supplier.city || "");
      setUf(supplier.uf || "SP");
      setLeadTimeDays(supplier.leadTimeDays || 14);
      setPaymentTerms(supplier.paymentTerms || "");
      setEmail(supplier.contacts?.email || "");
      setPhone(supplier.contacts?.phone || "");
      setContactName(supplier.contacts?.contactName || "");
      setNotes(supplier.notes || "");
      setActive(supplier.active ?? true);
    } else {
      setLegalName("");
      setTradeName("");
      setCnpj("");
      setType("usina");
      setCity("");
      setUf("SP");
      setLeadTimeDays(14);
      setPaymentTerms("30 DDL");
      setEmail("");
      setPhone("");
      setContactName("");
      setNotes("");
      setActive(true);
    }
  }, [supplier, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalName || !cnpj) {
      toast.error("Preencha a Razão Social e o CNPJ.");
      return;
    }

    setLoading(true);
    try {
      const input: SupplierInput = {
        id: supplier?.id,
        legalName,
        tradeName: tradeName || null,
        cnpj,
        type,
        city: city || null,
        uf: uf || null,
        leadTimeDays: Number(leadTimeDays) || 7,
        paymentTerms: paymentTerms || null,
        email: email || undefined,
        phone: phone || null,
        contactName: contactName || null,
        notes: notes || null,
        active,
      };

      const res = await saveSupplier(input);
      if (res.success) {
        toast.success(
          isEditing
            ? `Fornecedor ${res.supplier.tradeName || res.supplier.legalName} atualizado com sucesso.`
            : `Fornecedor ${res.supplier.tradeName || res.supplier.legalName} cadastrado com sucesso.`
        );
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar fornecedor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edição de Fornecedor — ${supplier.tradeName || supplier.legalName}` : "+ Cadastrar Novo Fornecedor / Usina"}
      subtitle="Parâmetros de homologação de usina, lead time de entrega e compras RF-02"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Fornecedor"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Razão Social *
            </label>
            <Input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Ex: Usinas Siderúrgicas de Minas Gerais S.A."
              required
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Nome Fantasia
            </label>
            <Input
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="Ex: USIMINAS"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              CNPJ *
            </label>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
              required
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Tipo de Parceiro *
            </label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="usina">Usina Primária / Produtora</option>
              <option value="distribuidor">Distribuidor / Centro de Serviços</option>
              <option value="trader">Trading / Importadora</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Cidade
            </label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: Belo Horizonte"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              UF
            </label>
            <Input
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              placeholder="MG"
              className="font-mono uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Lead Time Padrão (Dias) *
            </label>
            <Input
              type="number"
              min={1}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(parseInt(e.target.value) || 1)}
              required
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Condições de Pagamento Padrão
            </label>
            <Input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Ex: 30/60 DDL"
            />
          </div>
        </div>

        {/* Contato Principal */}
        <div className="p-3 bg-carbon-950 rounded border border-carbon-800 space-y-3">
          <span className="text-label-caps font-semibold uppercase text-titanium-light block">
            Dados de Contato Comercial / RFQ
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Nome do Contato
              </label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contato comercial"
              />
            </div>
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                E-mail Corporativo
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="comercial@usina.com"
              />
            </div>
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Telefone
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 0000-0000"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
            Observações Técnicas / Restrições de Laminação
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Pedido mínimo 12t por espessura..."
          />
        </div>
      </form>
    </FormDrawer>
  );
}
