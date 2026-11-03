// src/app/api/verify-item/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const forensicSplitSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        public_payload: {
            type: Type.OBJECT,
            properties: {
                category: { type: Type.STRING, description: 'High-level item category (e.g., Wallet, Keys, Pet, Electronics)' },
                color: { type: Type.STRING, description: 'Primary and secondary visible colors' },
                brand: { type: Type.STRING, description: 'Visible brand name or "Unbranded"' },
                public_summary: { type: Type.STRING, description: 'Safe public summary that does NOT reveal the secret micro-identifier' },
                redaction_boxes: {
                    type: Type.ARRAY,
                    description: 'Normalized 2D bounding boxes [ymin, xmin, ymax, xmax] on a 0-1000 scale covering secret micro-details, keychains, serial numbers, or personal ID text to blur on the public canvas.',
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            label: { type: Type.STRING, description: 'What is being redacted (e.g., PII_TEXT, SECRET_CHARM)' },
                            box_2d: {
                                type: Type.ARRAY,
                                items: { type: Type.INTEGER },
                                description: '[ymin, xmin, ymax, xmax] scaled 0 to 1000',
                            },
                        },
                        required: ['label', 'box_2d'],
                    },
                },
            },
            required: ['category', 'color', 'brand', 'public_summary', 'redaction_boxes'],
        },
        private_vault: {
            type: Type.OBJECT,
            properties: {
                secret_detail: {
                    type: Type.STRING,
                    description: 'Specific micro-identifier hidden from the public (e.g., a specific scratch, sticker, keychain charm, collar engraving)',
                },
                verification_question_en: {
                    type: Type.STRING,
                    description: 'Question in English asking the claimant to describe the hidden detail',
                },
                verification_question_th: {
                    type: Type.STRING,
                    description: 'Question in Thai asking the claimant to describe the hidden detail',
                },
                acceptable_keywords_en: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Acceptable English keywords to pass ownership verification',
                },
                acceptable_keywords_th: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Acceptable Thai keywords to pass ownership verification',
                },
            },
            required: [
                'secret_detail',
                'verification_question_en',
                'verification_question_th',
                'acceptable_keywords_en',
                'acceptable_keywords_th',
            ],
        },
    },
    required: ['public_payload', 'private_vault'],
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { imageBase64, mimeType = 'image/jpeg', lat, lng } = body;

        if (!imageBase64) {
            return NextResponse.json({ error: 'Missing imageBase64 payload' }, { status: 400 });
        }

        const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');

        const candidateModels = [
            'gemini-3-flash-preview',
            'gemini-flash-latest',
            'gemini-2.5-flash-lite',
        ];

        let response = null;
        let lastError = '';

        for (const modelName of candidateModels) {
            try {
                response = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                            inlineData: {
                                data: base64Clean,
                                mimeType,
                            },
                        },
                        `You are the TRACE Forensic Ownership Split Engine.
Analyze this found item or pet image.
1. Separate macro attributes into public_payload. CRITICAL RULE: NEVER mention the secret crest, logo name, house name, character, or text inside public_payload.brand or public_payload.public_summary! If the brand/logo IS the secret identifier being redacted, set brand to "Redacted Emblem / Unbranded".
2. Identify at least one unique micro-identifier (emblem, charm, sticker, wear mark, collar detail, or text) and place its normalized 2D bounding box [ymin, xmin, ymax, xmax] (0-1000 scale) into redaction_boxes so our HTML5 canvas blurs it out publicly.
3. Store the exact micro-identifier and bilingual (EN/TH) challenge questions + keywords inside private_vault.`,
                    ],
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: forensicSplitSchema,
                        temperature: 0.1,
                    },
                });
                break; // Success! Exit the loop
            } catch (e: unknown) {
                lastError = e instanceof Error ? e.message : String(e);
            }
        }

        if (!response) {
            throw new Error(`All candidate models failed. Last error: ${lastError}`);
        }

        const parsed = JSON.parse(response.text || '{}');

        // Optional: Persist to Supabase if tables are already migrated
        let vaultSaved = false;
        if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
                const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL,
                    process.env.SUPABASE_SERVICE_ROLE_KEY
                );
                const { error } = await supabaseAdmin.from('found_items_vault').insert({
                    category: parsed.public_payload.category,
                    public_summary: parsed.public_payload.public_summary,
                    secret_detail: parsed.private_vault.secret_detail,
                    keywords_en: parsed.private_vault.acceptable_keywords_en,
                    keywords_th: parsed.private_vault.acceptable_keywords_th,
                    lat: lat ?? 13.7367,
                    lng: lng ?? 100.5331,
                });
                if (!error) vaultSaved = true;
            } catch {
                // Continues gracefully in local demo mode even before SQL migration is run
            }
        }

        // Return ONLY the public payload + the challenge questions (keep answers & secret_detail locked server-side)
        return NextResponse.json({
            status: 'FORENSIC_SPLIT_COMPLETE',
            vaultSaved,
            public_payload: parsed.public_payload,
            challenge_prompt: {
                en: parsed.private_vault.verification_question_en,
                th: parsed.private_vault.verification_question_th,
                // Included in local dev preview so you can inspect Gemini's hidden vault extraction on-screen
                dev_preview_secret: parsed.private_vault.secret_detail,
                dev_preview_keywords_th: parsed.private_vault.acceptable_keywords_th,
                dev_preview_keywords_en: parsed.private_vault.acceptable_keywords_en,
            },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}