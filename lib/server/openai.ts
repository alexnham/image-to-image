import { reserve } from "./budget";
import { UserError } from "../errors";
export const IMAGE_MODEL = "gpt-image-2.5-sunburst-2026-09-08";
export const PLANNER_MODEL = "gpt-5.4-mini-2026-03-17";
export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
};
export function usageMicros(usage: Usage | undefined, image: boolean) {
  if (
    !usage ||
    usage.input_tokens === undefined ||
    usage.output_tokens === undefined
  )
    return undefined;
  if (!image) return usage.input_tokens * 0.75 + usage.output_tokens * 4.5;
  const imageTokens = usage.input_tokens_details?.image_tokens;
  const textTokens = usage.input_tokens_details?.text_tokens;
  if (imageTokens === undefined || textTokens === undefined) return undefined;
  return imageTokens * 8 + textTokens * 5 + usage.output_tokens * 30;
}
export async function openai(
  path: string,
  body: FormData | object,
  image = false,
): Promise<Record<string, unknown>> {
  if (!process.env.OPENAI_API_KEY)
    throw new UserError("AI editing isn't configured yet.", 503);
  const settle = await reserve(
    image ? "image-edit" : "vision-planner",
    image ? 2_000_000 : 100_000,
  );
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(image ? 180000 : 45000),
    });
  } catch {
    throw new UserError(
      "The AI service timed out. Nothing was changed; please try again.",
      504,
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Definite rejections before inference do not incur image generation charges.
    if ([400, 401, 403, 404, 429].includes(response.status)) await settle(0);
    const message =
      response.status === 429
        ? "The AI service is at capacity or out of credits. Try again later."
        : response.status === 401 || response.status === 403
          ? "The AI service needs operator attention. Manual edits still work."
          : "The AI service couldn't complete that edit. Try a different description.";
    throw new UserError(message, response.status === 429 ? 503 : 502);
  }
  await settle(usageMicros(payload.usage, image));
  return payload;
}
export async function vision(
  prompt: string,
  image: Buffer,
  schema: object,
  name: string,
) {
  const result = await openai("responses", {
    model: PLANNER_MODEL,
    store: false,
    max_output_tokens: 2200,
    reasoning: { effort: "none" },
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${image.toString("base64")}`,
            detail: "low",
          },
        ],
      },
    ],
    text: { format: { type: "json_schema", name, strict: true, schema } },
  });
  const output = result.output as
    | { content?: { type: string; text?: string }[] }[]
    | undefined;
  const text = output
    ?.flatMap((x) => x.content ?? [])
    .find((x) => x.type === "output_text")?.text;
  if (!text)
    throw new UserError(
      "Couldn't understand that edit. Please try rephrasing it.",
    );
  try {
    return JSON.parse(text);
  } catch {
    throw new UserError(
      "Couldn't understand that edit. Please try rephrasing it.",
    );
  }
}
