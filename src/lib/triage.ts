import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceAlert } from "@/lib/alerts";

// AI triage pipeline (launch_decisions #13/#17). Reads the case's photos,
// lease text, and jurisdiction law summary; asks the model for a structured
// responsibility verdict; writes it to the case; flips the status to
// ai_review_completed (which fires the alert email); records audit events.
//
// Provider is env-selected: Gemini for dev/testing (free credit), Claude in
// production (architecture.md). On failure the case stays pending_ai_review
// and a triage_failed case_event records the error — item 13's enum change
// is still deferred.

export type TriageResult = { ok: true } | { ok: false; error: string };

type Verdict = {
  responsible_party: "landlord" | "tenant" | "unclear";
  confidence: number;
  reasoning_summary: string;
  cited_sources: { type: string; reference: string; quote: string }[];
};

type Photo = { base64: string; mimeType: string };

type TokenUsage = {
  inputTokens: number;
  outputTokens: number; // includes thinking/reasoning tokens (both bill as output)
  cachedInputTokens: number;
};

type ModelCall = { verdict: Verdict; model: string; usage: TokenUsage };

// A failure that happened *after* the provider billed us (refusal, unparseable
// output). Carries the usage so the spend still gets recorded — otherwise
// those tokens vanish from the cost picture.
class UsageError extends Error {
  constructor(
    message: string,
    readonly model: string,
    readonly usage: TokenUsage,
  ) {
    super(message);
    this.name = "UsageError";
  }
}

const SYSTEM_PROMPT = `You are the triage engine for a property-maintenance system. A tenant has reported a maintenance issue with photos. Using ONLY the provided lease text, the provided law summary, and the photos, determine who is most likely responsible for the repair: the landlord or the tenant.

Rules:
- This is an informational assessment, not legal advice; never claim certainty the evidence doesn't support.
- responsible_party is "landlord", "tenant", or "unclear" (use "unclear" when the lease and law genuinely don't settle it).
- confidence is a number from 0 to 1.
- reasoning_summary is 2-5 sentences a non-lawyer can follow, referencing what the photos show.
- cited_sources quotes ONLY text that actually appears in the provided lease ("lease_clause") or law summary ("statute"). Never invent citations. If neither source supports a citation, return an empty array.`;

const VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    responsible_party: { type: "string", enum: ["landlord", "tenant", "unclear"] },
    confidence: { type: "number" },
    reasoning_summary: { type: "string" },
    cited_sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["lease_clause", "statute"] },
          reference: { type: "string" },
          quote: { type: "string" },
        },
        required: ["type", "reference", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["responsible_party", "confidence", "reasoning_summary", "cited_sources"],
  additionalProperties: false,
} as const;

function buildUserText(input: {
  address: string;
  state: string;
  description: string;
  leaseText: string;
  lawSummary: string;
  lawCitation: string;
}): string {
  return (
    `## Property\n${input.address} (state: ${input.state})\n\n` +
    `## Reported issue\n${input.description}\n\n` +
    `## Lease (extracted text)\n${input.leaseText}\n\n` +
    `## Applicable law summary\n${input.lawSummary}\n` +
    `Source: ${input.lawCitation}\n\n` +
    `The attached images are the tenant's photos of the issue. Produce the structured verdict.`
  );
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function callClaude(userText: string, photos: Photo[]): Promise<ModelCall> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — configure it or switch AI_PROVIDER to gemini.");
  }
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: VERDICT_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          ...photos.map((photo) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: photo.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: photo.base64,
            },
          })),
          { type: "text" as const, text: userText },
        ],
      },
    ],
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
  };

  if (response.stop_reason === "refusal") {
    throw new UsageError("The model declined to assess this case.", model, usage);
  }
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new UsageError("Model returned no text content.", model, usage);
  }
  return { verdict: JSON.parse(textBlock.text) as Verdict, model, usage };
}

async function callGemini(userText: string, photos: Photo[]): Promise<ModelCall> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env.local (or switch AI_PROVIDER to claude).");
  }
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...photos.map((photo) => ({
            inlineData: { mimeType: photo.mimeType, data: photo.base64 },
          })),
          { text: userText },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          responsible_party: {
            type: Type.STRING,
            enum: ["landlord", "tenant", "unclear"],
          },
          confidence: { type: Type.NUMBER },
          reasoning_summary: { type: Type.STRING },
          cited_sources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["lease_clause", "statute"] },
                reference: { type: Type.STRING },
                quote: { type: Type.STRING },
              },
              required: ["type", "reference", "quote"],
            },
          },
        },
        required: [
          "responsible_party",
          "confidence",
          "reasoning_summary",
          "cited_sources",
        ],
      },
    },
  });

  // Thinking tokens bill as output on Gemini, so fold them in rather than
  // under-reporting the cost.
  const meta = response.usageMetadata;
  const usage: TokenUsage = {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens:
      (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
    cachedInputTokens: meta?.cachedContentTokenCount ?? 0,
  };

  const text = response.text;
  if (!text) throw new UsageError("Model returned no text content.", model, usage);
  return { verdict: JSON.parse(text) as Verdict, model, usage };
}

function validateVerdict(raw: Verdict): Verdict {
  if (!["landlord", "tenant", "unclear"].includes(raw.responsible_party)) {
    throw new Error(`Model returned an invalid responsible_party: ${raw.responsible_party}`);
  }
  return {
    responsible_party: raw.responsible_party,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    reasoning_summary: String(raw.reasoning_summary ?? ""),
    cited_sources: Array.isArray(raw.cited_sources) ? raw.cited_sources : [],
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

// Cost accounting is bookkeeping, never a reason to fail a triage run — a
// failed insert is logged and swallowed.
async function recordUsage(
  caseId: string,
  provider: string,
  model: string,
  usage: TokenUsage,
  succeeded: boolean,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_usage").insert({
      case_id: caseId,
      provider,
      model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      succeeded,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[triage] failed to record ai_usage for case", caseId, error);
  }
}

export async function runTriage(caseId: string): Promise<TriageResult> {
  const admin = createAdminClient();
  try {
    const { data: kase } = await admin
      .from("cases")
      .select("id, status, description, property_id, lease_id, jurisdiction_id")
      .eq("id", caseId)
      .maybeSingle();
    if (!kase) return { ok: false, error: "Case not found." };
    if (kase.status !== "pending_ai_review") {
      return { ok: false, error: "This case has already been reviewed." };
    }

    const [{ data: property }, { data: lease }, { data: media }] =
      await Promise.all([
        admin
          .from("properties")
          .select("address_line1, address_line2, city, state")
          .eq("id", kase.property_id)
          .single(),
        admin
          .from("leases")
          .select("extracted_text")
          .eq("id", kase.lease_id)
          .single(),
        admin
          .from("case_media")
          .select("storage_path, media_type")
          .eq("case_id", caseId)
          .order("position"),
      ]);
    if (!property || !lease) {
      return { ok: false, error: "Case is missing its property or lease." };
    }

    // Jurisdiction law: the case's linked row, or state-level fallback.
    let law = { summary_text: "No law summary available for this jurisdiction.", source_citation: "none" };
    if (kase.jurisdiction_id) {
      const { data } = await admin
        .from("jurisdictions")
        .select("summary_text, source_citation")
        .eq("id", kase.jurisdiction_id)
        .maybeSingle();
      if (data) law = data;
    }

    // Download the photos from the private bucket.
    const photos: Photo[] = [];
    for (const item of (media ?? []).filter((m) => m.media_type === "photo")) {
      const { data: blob, error } = await admin.storage
        .from("case-media")
        .download(item.storage_path);
      if (error || !blob) continue; // seed rows point at phantom files
      const mimeType = blob.type?.startsWith("image/") ? blob.type : "image/jpeg";
      photos.push({
        base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
        mimeType,
      });
    }
    if (photos.length === 0) {
      return { ok: false, error: "No readable photos on this case — the AI review needs at least one." };
    }

    const userText = buildUserText({
      address: [property.address_line1, property.address_line2, property.city]
        .filter(Boolean)
        .join(", "),
      state: property.state,
      description: kase.description,
      leaseText: lease.extracted_text,
      lawSummary: law.summary_text,
      lawCitation: law.source_citation,
    });

    const provider = process.env.AI_PROVIDER ?? "gemini";
    let call: ModelCall;
    try {
      call = provider === "claude"
        ? await callClaude(userText, photos)
        : await callGemini(userText, photos);
    } catch (error) {
      // Billed but unusable (refusal, unparseable output) — record the spend
      // before rethrowing, so failed attempts still show up in the costs.
      if (error instanceof UsageError) {
        await recordUsage(caseId, provider, error.model, error.usage, false);
      }
      throw error;
    }
    const { verdict: rawVerdict, model, usage } = call;
    await recordUsage(caseId, provider, model, usage, true);
    const verdict = validateVerdict(rawVerdict);

    const { error: updateError } = await admin
      .from("cases")
      .update({
        status: "ai_review_completed",
        responsible_party: verdict.responsible_party,
        confidence: verdict.confidence,
        reasoning_summary: verdict.reasoning_summary,
        cited_sources: verdict.cited_sources,
        model_used: model,
      })
      .eq("id", caseId)
      .eq("status", "pending_ai_review"); // guard against concurrent runs
    if (updateError) throw new Error(updateError.message);

    await admin.from("case_events").insert({
      case_id: caseId,
      event_type: "verdict_generated",
      payload: {
        model,
        responsible_party: verdict.responsible_party,
        confidence: verdict.confidence,
      },
    });

    await sendMaintenanceAlert(caseId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[triage] failed for case", caseId, error);
    // Status stays pending_ai_review; the failure is auditable (item 13's
    // triage_failed enum value is still deferred).
    await admin.from("case_events").insert({
      case_id: caseId,
      event_type: "triage_failed",
      payload: { error: message },
    });
    return { ok: false, error: message };
  }
}
