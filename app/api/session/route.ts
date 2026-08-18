import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { identityError, resolveIdentity } from "../_identity";
import { errorMessage } from "../_shared";

export async function GET(request: NextRequest) {
  try {
    const identity = await resolveIdentity(request, await getDatabase());
    return NextResponse.json(identity, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

