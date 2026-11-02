import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { CopilotDrawer } from "@/components/copilot/copilot-drawer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MetalAgents | Industrial Intelligence OS",
  description: "Terminal de Operação e Inteligência Metalúrgica",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} bg-carbon-950 text-ice-white font-sans min-h-screen antialiased selection:bg-carmine-core selection:text-white`}
      >
        {children}
        <CopilotDrawer />
        <Toaster />
      </body>
    </html>
  );
}
