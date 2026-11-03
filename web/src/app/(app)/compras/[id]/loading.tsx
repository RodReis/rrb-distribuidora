export default function PurchaseDetailLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1500px] flex-col gap-space-md pb-4"
      aria-busy="true"
      aria-label="Carregando pedido de compra"
    >
      {/* Trilha e cabeçalho */}
      <div className="h-3 w-64 animate-pulse rounded bg-carbon-800" />
      <div className="flex items-start justify-between gap-4 border-b border-carbon-800 pb-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-40 animate-pulse rounded bg-carbon-800" />
          <div className="h-4 w-72 animate-pulse rounded bg-carbon-800" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-carbon-800" />
          <div className="h-9 w-24 animate-pulse rounded bg-carbon-800" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-space-md lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded border border-carbon-800 bg-carbon-900"
          />
        ))}
      </div>

      {/* Abas + conteúdo */}
      <div className="rounded border border-carbon-800 bg-carbon-900">
        <div className="flex gap-5 border-b border-carbon-800 px-space-md pt-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="mb-2 h-4 w-20 animate-pulse rounded bg-carbon-800" />
          ))}
        </div>
        <div className="flex flex-col gap-2 p-space-md">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-carbon-800/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
