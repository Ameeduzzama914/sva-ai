export async function callOpenRouter(model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return a clear, concise answer." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content || "No response";
}
