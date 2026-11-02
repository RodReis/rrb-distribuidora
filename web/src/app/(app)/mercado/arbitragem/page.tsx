import { redirect } from "next/navigation";

export default function ArbitragemRedirect() {
  redirect("/mercado?tab=paridade");
}
