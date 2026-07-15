import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const GEMINI_MODEL = "gemini-3.5-flash";

type DiagnosticCode =
  | "CB-000"
  | "CB-301"
  | "CB-302"
  | "CB-303"
  | "CB-304"
  | "CB-305"
  | "CB-306"
  | "CB-399";

const getGeminiApiKeys = () => {
  return (Deno.env.get("GEMINI_API_KEYS") || Deno.env.get("GEMINI_API_KEY") || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
};

const classifyGeminiStatus = (status: number): DiagnosticCode => {
  if (status === 401 || status === 403) return "CB-302";
  if (status === 404) return "CB-306";
  if (status === 429) return "CB-303";
  if (status >= 500) return "CB-304";
  return "CB-399";
};

const runDiagnostics = async () => {
  const startedAt = Date.now();
  const apiKeys = getGeminiApiKeys();
  const base = {
    checkedAt: new Date().toISOString(),
    checks: [
      { name: "Supabase Edge Function", status: "ok", message: "The chatbot function is reachable." },
    ],
  };

  if (!apiKeys.length) {
    return {
      ...base,
      ok: false,
      code: "CB-301" as DiagnosticCode,
      message: "GEMINI_API_KEYS is not configured in the chatbot Edge Function.",
      latencyMs: Date.now() - startedAt,
      checks: [
        ...base.checks,
        { name: "Gemini configuration", status: "error", message: "No Gemini API key is configured." },
      ],
    };
  }

  let lastCode: DiagnosticCode = "CB-399";
  let lastMessage = "The Gemini connection test failed.";

  for (const apiKey of apiKeys) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with only the word OK." }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8 },
          }),
        },
      );
      const result = await response.json().catch(() => null);

      if (response.ok) {
        const answer = result?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text || "")
          .join("")
          .trim();
        if (!answer) {
          lastCode = "CB-305";
          lastMessage = "Gemini was reachable but returned an empty response.";
          continue;
        }

        return {
          ...base,
          ok: true,
          code: "CB-000" as DiagnosticCode,
          message: "Chatbot connection is healthy from the website through Supabase to Gemini.",
          latencyMs: Date.now() - startedAt,
          checks: [
            ...base.checks,
            { name: "Gemini configuration", status: "ok", message: `${apiKeys.length} API key(s) configured.` },
            { name: "Gemini provider", status: "ok", message: `${GEMINI_MODEL} returned a valid response.` },
          ],
        };
      }

      lastCode = classifyGeminiStatus(response.status);
      const providerMessage = String(result?.error?.message || `HTTP ${response.status}`).slice(0, 300);
      lastMessage = `Gemini returned HTTP ${response.status}: ${providerMessage}`;
    } catch (error) {
      lastCode = "CB-304";
      lastMessage = `The Edge Function could not reach Gemini: ${error instanceof Error ? error.message : String(error)}`.slice(0, 350);
    }
  }

  return {
    ...base,
    ok: false,
    code: lastCode,
    message: lastMessage,
    latencyMs: Date.now() - startedAt,
    checks: [
      ...base.checks,
      { name: "Gemini configuration", status: "ok", message: `${apiKeys.length} API key(s) configured.` },
      { name: "Gemini provider", status: "error", message: lastMessage },
    ],
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    if (body.action === "chatbotDiagnostics") {
      const diagnostics = await runDiagnostics();
      return Response.json({ success: true, diagnostics }, { headers: cors });
    }
    const question = String(body.question || "").trim().slice(0, 1500);
    if (!question) throw new Error("Question is required.");
    const apiKeys = getGeminiApiKeys();
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
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
