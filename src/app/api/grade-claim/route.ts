// src/app/api/grade-claim/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';

const claimGradeSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        is_verified: {
            type: Type.BOOLEAN,
            description: 'True if the claimant answer matches the hidden secret detail or acceptable keywords in either Thai or English.',
        },
        confidence_score: {
            type: Type.INTEGER,
            description: 'Confidence score from 0 to 100',
        },
        reasoning: {
            type: Type.STRING,
            description: 'Short explanation of why the claim passed or failed verification',
        },
        safe_handoff_point: {
            type: Type.STRING,
            description: 'Suggested safe CCTV handoff point near Samyan/Chula if verified',
        },
    },
    required: ['is_verified', 'confidence_score', 'reasoning', 'safe_handoff_point'],
};

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is missing in .env.local' }, { status: 500 });
        }
        const ai = new GoogleGenAI({ apiKey });

        const { claimantAnswer, secretDetail, keywordsEn, keywordsTh } = await req.json();

        if (!claimantAnswer || !secretDetail) {
            return NextResponse.json({ error: 'Missing claimantAnswer or secretDetail' }, { status: 400 });
        }

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
                    contents: `You are the TRACE Asymmetric Ownership Verification Judge.
Compare the Claimant's Answer against the Private Vault Secret.
Accept synonyms, bilingual matches (Thai or English), or partial core matches, but reject vague guesses.

- Vault Secret Detail: ${secretDetail}
- Acceptable EN Keywords: ${(keywordsEn || []).join(', ')}
- Acceptable TH Keywords: ${(keywordsTh || []).join(', ')}
- Claimant's Submitted Answer: "${claimantAnswer}"`,
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: claimGradeSchema,
                        temperature: 0.0,
                    },
                });
                break;
            } catch (e: unknown) {
                lastError = e instanceof Error ? e.message : String(e);
            }
        }

        if (!response) {
            throw new Error(`All candidate models failed: ${lastError}`);
        }

        const result = JSON.parse(response.text || '{}');
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}