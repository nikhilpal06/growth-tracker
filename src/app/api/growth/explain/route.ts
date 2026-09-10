import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getChild, listMeasurements } from "@/lib/growth-db";
import { AI_MODEL, SYSTEM_PROMPT, aiEnabled, growthFacts } from "@/lib/growth-insight";
import { jsonBody } from "../_shared";

export const maxDuration = 120;

/** Body: { child_id, question? }. Streams a plain-text Markdown explanation. */
export async function POST(req: Request) {
  if (!aiEnabled()) return NextResponse.json({ error: "Set the ANTHROPIC_API_KEY variable to enable explanations." }, { status: 400 });
  const body = await jsonBody(req);
  const child = Number.isInteger(Number(body.child_id)) ? getChild(Number(body.child_id)) : undefined;
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

  const facts = growthFacts(child, listMeasurements());
  const ask = question
    ? `Here is ${child.name}'s growth record.\n\n${facts}\n\nThe parent asks: "${question}"\n\nAnswer the question using the record, then briefly note anything else in the record that matters.`
    : `Here is ${child.name}'s growth record.\n\n${facts}\n\nExplain what these numbers mean for ${child.name}, with the emphasis on the most recent measurements and the trend.`;

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Server-side refusal fallback: if the primary model declines, the API re-runs the request on Opus 4.8.
        const s = client.beta.messages.stream({
          model: AI_MODEL,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          output_config: { effort: "medium" },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: ask }],
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") controller.enqueue(encoder.encode(event.delta.text));
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n[AI error] The model declined to answer this request."));
      } catch (e) {
        const msg = e instanceof Anthropic.AuthenticationError ? "The ANTHROPIC_API_KEY is not valid."
          : e instanceof Anthropic.RateLimitError ? "Rate limited by the API. Try again in a minute."
          : e instanceof Anthropic.APIError ? `API error ${e.status}: ${e.message}`
          : e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`\n\n[AI error] ${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
