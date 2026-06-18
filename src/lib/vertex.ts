import { VertexAI } from "@google-cloud/vertexai";

/**
 * Thin Gemini-on-Vertex wrapper, mirroring the ETA backend.
 * - reasoning  -> GEMINI_REASONING_MODEL (default gemini-2.5-pro)   [interviewer, composer]
 * - utility    -> GEMINI_UTILITY_MODEL   (default gemini-2.5-flash) [stylist, faithfulness judge]
 *
 * Auth: service-account JSON provided base64-encoded in GCP_SA_KEY_BASE64.
 */

type Tier = "reasoning" | "utility";

function credentials() {
  const b64 = process.env.GCP_SA_KEY_BASE64;
  if (!b64) return undefined;
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

let _client: VertexAI | null = null;
function client(): VertexAI {
  if (_client) return _client;
  _client = new VertexAI({
    project: process.env.GCP_PROJECT_ID ?? "clinical-infra",
    location: process.env.GCP_LOCATION ?? "asia-northeast1",
    googleAuthOptions: { credentials: credentials() },
  });
  return _client;
}

function modelFor(tier: Tier): string {
  return tier === "reasoning"
    ? process.env.GEMINI_REASONING_MODEL ?? "gemini-2.5-pro"
    : process.env.GEMINI_UTILITY_MODEL ?? "gemini-2.5-flash";
}

export interface ChatOpts {
  tier?: Tier;
  system?: string;
  temperature?: number;
  json?: boolean;
  maxOutputTokens?: number;
}

/** Single-shot generate. Returns the model's text. */
export async function gemini(prompt: string, opts: ChatOpts = {}): Promise<string> {
  const tier = opts.tier ?? "reasoning";
  const model = client().getGenerativeModel({
    model: modelFor(tier),
    systemInstruction: opts.system,
    generationConfig: {
      temperature: opts.temperature ?? (tier === "reasoning" ? 0.2 : 0.4),
      responseMimeType: opts.json ? "application/json" : "text/plain",
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    },
  });

  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const txt =
    res.response?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return txt.trim();
}

export function geminiEnabled(): boolean {
  return process.env.GEMINI_ALL === "1" && !!process.env.GCP_SA_KEY_BASE64;
}
