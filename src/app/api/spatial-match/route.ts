// src/app/api/spatial-match/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { nodes, radiusMeters = 50 } = await req.json();

        if (!Array.isArray(nodes) || nodes.length === 0) {
            return NextResponse.json({ matches: [] });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

        if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('paste_your')) {
            return NextResponse.json({
                matches: [],
                warning: 'Supabase credentials not configured in .env.local',
            });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const matches: Array<{
            nodeId: string;
            vaultItemId: string;
            category: string;
            public_summary: string;
            question_en: string;
            question_th: string;
            lat: number;
            lng: number;
            distance_meters: number;
        }> = [];

        // Query PostGIS ST_DWithin around each high-risk trajectory node
        for (const node of nodes) {
            const { data, error } = await supabase.rpc('find_items_within_radius', {
                search_lat: node.lat,
                search_lng: node.lng,
                radius_meters: radiusMeters,
            });

            if (!error && Array.isArray(data)) {
                for (const item of data) {
                    if (!matches.some((m) => m.vaultItemId === item.id)) {
                        matches.push({
                            nodeId: node.id,
                            vaultItemId: item.id,
                            category: item.category,
                            public_summary: item.public_summary,
                            question_en: item.question_en,
                            question_th: item.question_th,
                            lat: item.lat,
                            lng: item.lng,
                            distance_meters: Number(Number(item.distance_meters).toFixed(1)),
                        });
                    }
                }
            }
        }

        return NextResponse.json({ matches });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Spatial match error';
        return NextResponse.json({ error: message, matches: [] }, { status: 500 });
    }
}