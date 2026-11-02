import { NextResponse } from "next/server";
import { guardStock } from "@/lib/stock/api-auth";
import {
  getDailyCycleCountCandidates,
  submitCycleCount,
  getCycleInventoryAccuracy,
} from "@/lib/stock/cycle-count";

export async function GET(req: Request) {
  try {
    const guard = await guardStock("read");
    if (guard.error) return guard.error;
    const user = guard.user;
    const candidates = await getDailyCycleCountCandidates(user.tenantId);
    const accuracy = await getCycleInventoryAccuracy(user.tenantId);

    return NextResponse.json({
      success: true,
      candidates,
      accuracy,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await guardStock("write");
    if (guard.error) return guard.error;
    const user = guard.user;

    const body = await req.json();

    const record = await submitCycleCount({
      tenantId: user.tenantId,
      lotId: body.lotId,
      countedQty: Number(body.countedQty),
      systemQty: Number(body.systemQty),
      justification: body.justification,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
