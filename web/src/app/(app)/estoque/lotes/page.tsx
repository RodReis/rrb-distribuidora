import { redirect } from "next/navigation";

export default function EstoqueLotesPage() {
  redirect("/estoque?tab=lotes");
}
