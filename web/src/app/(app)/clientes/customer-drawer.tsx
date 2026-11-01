"use client";

import * as React from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCustomer, CustomerInput } from "./actions";
import { toast } from "sonner";

export interface CustomerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: any | null;
}

export function CustomerDrawer({ isOpen, onClose, customer }: CustomerDrawerProps) {
  const isEditing = !!customer?.id;

  const [legalName, setLegalName] = React.useState("");
  const [tradeName, setTradeName] = React.useState("");
  const [document, setDocument] = React.useState("");
  const [stateRegistration, setStateRegistration] = React.useState("");
  const [segment, setSegment] = React.useState("");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("SP");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (customer) {
      setLegalName(customer.legalName || "");
      setTradeName(customer.tradeName || "");
      setDocument(customer.document || "");
      setStateRegistration(customer.stateRegistration || "");
      setSegment(customer.segment || "");
      setCity(customer.city || "");
      setUf(customer.uf || "SP");
      setEmail(customer.contacts?.email || "");
      setPhone(customer.contacts?.phone || "");
      setContactName(customer.contacts?.contactName || "");
      setNotes(customer.notes || "");
      setActive(customer.active ?? true);
    } else {
      setLegalName("");
      setTradeName("");
      setDocument("");
      setStateRegistration("");
      setSegment("Construção & Serralheria Industrial");
      setCity("");
      setUf("SP");
      setEmail("");
      setPhone("");
      setContactName("");
      setNotes("");
      setActive(true);
    }
  }, [customer, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalName || !document) {
      toast.error("Preencha a Razão Social e o CNPJ/CPF.");
      return;
    }

    setLoading(true);
    try {
      const input: CustomerInput = {
        id: customer?.id,
        legalName,
        tradeName: tradeName || null,
        document,
        city: city || null,
        uf: uf || null,
        stateRegistration: stateRegistration || null,
        segment: segment || null,
        email: email || undefined,
        phone: phone || null,
        contactName: contactName || null,
        notes: notes || null,
        active,
      };

      const res = await saveCustomer(input);
      if (res.success) {
        toast.success(
          isEditing
            ? `Cliente ${res.customer.tradeName || res.customer.legalName} atualizado com sucesso.`
            : `Cliente ${res.customer.tradeName || res.customer.legalName} cadastrado com sucesso.`
        );
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar cliente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? `Edição de Cliente — ${customer.tradeName || customer.legalName}`
          : "+ Cadastrar Novo Cliente / Indústria"
      }
      subtitle="Dados de faturamento, contato de suprimentos e orçamento RF-03"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Cliente"}
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
              placeholder="Ex: Indústria Mecânica Alfa Ltda"
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
              placeholder="Ex: Alfa Mecânica"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              CNPJ ou CPF *
            </label>
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="00.000.000/0000-00"
              required
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Inscrição Estadual (IE)
            </label>
            <Input
              value={stateRegistration}
              onChange={(e) => setStateRegistration(e.target.value)}
              placeholder="000.000.000.000"
              className="font-mono"
            />
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
              placeholder="Ex: Campinas"
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
              placeholder="SP"
              className="font-mono uppercase"
            />
          </div>
        </div>

        <div>
          <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
            Segmento de Atuação
          </label>
          <Input
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="Ex: Caldeiraria Pesada, Construção Metálica, Autopeças..."
          />
        </div>

        {/* Contato Suprimentos */}
        <div className="p-3 bg-carbon-950 rounded border border-carbon-800 space-y-3">
          <span className="text-label-caps font-semibold uppercase text-titanium-light block">
            Contato do Comprador / Suprimentos
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Nome
              </label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nome do comprador"
              />
            </div>
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                E-mail
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="compras@cliente.com.br"
              />
            </div>
            <div>
              <label className="text-label-caps text-titanium-muted uppercase block mb-1">
                Telefone / WhatsApp
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
            Observações Comerciais
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Horário de recebimento até 16h..."
          />
        </div>
      </form>
    </FormDrawer>
  );
}
