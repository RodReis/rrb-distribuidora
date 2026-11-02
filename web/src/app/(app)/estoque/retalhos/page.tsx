import { redirect } from "next/navigation";

export default function EstoqueRetalhosPage() {
  redirect("/estoque?tab=retalhos");
}
