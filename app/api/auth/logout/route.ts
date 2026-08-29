import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin, revokeSession } from "../../_auth";
import { getDatabase } from "../../_platform";

export async function POST(request: NextRequest) {
  enforceSameOrigin(request);
  const response = NextResponse.json({ success: true });
  await revokeSession(await getDatabase(), request, response); return response;
}
