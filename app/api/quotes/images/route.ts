import { NextRequest, NextResponse } from "next/server"
import { getCurrentAccountContext } from "@/lib/account-context"
import { pointMapApiErrorResponse } from "@/lib/point-map-api"
import { refreshQuoteImages } from "@/lib/quote-image-refresh"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json({ data: await refreshQuoteImages(await getCurrentAccountContext(request), {
      projectId: String(body.projectId ?? ""), quoteId: String(body.quoteId ?? ""), expectedUpdatedAt: String(body.expectedUpdatedAt ?? ""),
    }) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return pointMapApiErrorResponse(error) }
}
