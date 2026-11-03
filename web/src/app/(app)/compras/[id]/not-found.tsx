import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 404 amigável do detalhe: pedido inexistente, excluído ou de outro tenant. */
export default function PurchaseNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[1500px] flex-col items-center justify-center text-center">
      <div className="rounded border border-carbon-700 bg-carbon-900 p-4 text-titanium-muted">
        <PackageSearch className="h-10 w-10" aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-headline-lg text-headline-lg text-ice-white">
        Pedido de compra não encontrado
      </h1>
      <p className="mt-2 max-w-md font-body-md text-body-md text-titanium-muted">
        O pedido não existe, foi excluído ou pertence a outro tenant. Verifique o número informado e
        tente novamente pela lista de compras.
      </p>
      <Link href="/compras" className="mt-6">
        <Button variant="primary" size="md">
          Voltar para Compras
        </Button>
      </Link>
    </div>
  );
}
