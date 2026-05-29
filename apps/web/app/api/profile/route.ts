import { NextResponse } from "next/server";

import { proxyAppDataApi } from "lib/appdata-proxy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { status, body } = await proxyAppDataApi(req, "/api/profile");
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const { status, body } = await proxyAppDataApi(req, "/api/profile");
  return NextResponse.json(body, { status });
}
