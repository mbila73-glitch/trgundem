import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// GET — tüm güvenilen siteleri listele
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const sites = await db.trustedSite.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ sites });
}

// POST — yeni güvenilen site ekle
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const body = await req.json();
  const { name, searchUrl } = body as { name?: string; searchUrl?: string };
  if (!name?.trim() || !searchUrl?.trim()) {
    return NextResponse.json({ error: 'İsim ve arama URL zorunlu' }, { status: 400 });
  }
  if (!searchUrl.includes('{query}')) {
    return NextResponse.json({ error: 'Arama URL\'de {query} placeholder olmalı (örn: https://site.com/ara?q={query})' }, { status: 400 });
  }
  const created = await db.trustedSite.create({
    data: { name: name.trim(), searchUrl: searchUrl.trim(), active: true },
  });
  return NextResponse.json({ ok: true, site: created }, { status: 201 });
}
