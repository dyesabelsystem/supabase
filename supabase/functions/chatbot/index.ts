import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    const question = String(body.question || "").trim().slice(0, 1500);
    if (!question) throw new Error("Question is required.");
    const apiKeys = (Deno.env.get("GEMINI_API_KEYS") || Deno.env.get("GEMINI_API_KEY") || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    if (!apiKeys.length) throw new Error("GEMINI_API_KEYS is not configured in Supabase.");
    const context = JSON.stringify(body.context || {}).slice(0, 12000);
    const history = JSON.stringify(body.history || []).slice(0, 8000);
    const prompt = [
      "You are the official DYESABEL Philippines website assistant.",
      "Answer only from the supplied website context. Be concise, factual, and do not invent details.",
      "If the context cannot answer, say that the information is unavailable and recommend contacting the organization.",
      `Website context: ${context}`,
      `Recent conversation: ${history}`,
      `Question: ${question}`,
    ].join("\n\n");
    let generated: any = null;
    let lastError = "Gemini request failed.";
    for (const [index, apiKey] of apiKeys.entries()) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
            }),
          },
        );
        const result = await response.json();
        if (response.ok) {
          generated = result;
          break;
        }

        const message = result?.error?.message || `Gemini request failed with ${response.status}.`;
        lastError = `Key ${index + 1} returned HTTP ${response.status}: ${message}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = `Key ${index + 1} could not reach Gemini: ${message}`;
      }
    }
    if (!generated) {
      throw new Error(`All ${apiKeys.length} configured Gemini API keys failed. ${lastError}`);
    }
    const answer = generated?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!answer) throw new Error("Gemini returned no answer.");
    return Response.json({ success: true, answer, source: "gemini", confidence: 0.75 }, { headers: cors });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400, headers: cors },
    );
  }
});
