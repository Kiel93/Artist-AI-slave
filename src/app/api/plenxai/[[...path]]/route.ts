import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = "https://plenxai.com/api/v1/developer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const p = await params;
  const pathStr = p.path ? p.path.join('/') : '';
  const apiKey = req.headers.get('X-API-Key') || '';
  
  try {
    const body = await req.json();
    const response = await fetch(`${BASE_URL}/${pathStr}`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const p = await params;
  const pathStr = p.path ? p.path.join('/') : '';
  const apiKey = req.headers.get('X-API-Key') || '';
  
  try {
    const response = await fetch(`${BASE_URL}/${pathStr}`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
