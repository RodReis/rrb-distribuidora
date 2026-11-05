import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MetalAgents Produção",
    short_name: "Produção",
    description: "Apontamento de produção e consumo rastreável.",
    start_url: "/producao",
    display: "standalone",
    background_color: "#090b0e",
    theme_color: "#090b0e",
    icons: [{ src: "/production-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
