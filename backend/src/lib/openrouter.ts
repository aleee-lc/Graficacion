import { z } from 'zod';
import { env } from '../config/env';

type OpenRouterMessage = {
  role: 'system' | 'user';
  content: string;
};

const extractStringContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (
          item &&
          typeof item === 'object' &&
          'type' in item &&
          (item as { type?: unknown }).type === 'text' &&
          'text' in item
        ) {
          const textValue = (item as { text?: unknown }).text;
          return typeof textValue === 'string' ? textValue : '';
        }
        return '';
      })
      .join('\n');
  }
  return '';
};

const extractJsonPayload = (rawContent: string): string => {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  throw new Error('OpenRouter response did not contain valid JSON payload');
};

export const ensureOpenRouterEnabled = () => {
  if (!env.OPENROUTER_API_KEY) {
    return {
      ok: false as const,
      message: 'OPENROUTER_API_KEY is not configured'
    };
  }

  return {
    ok: true as const
  };
};

export const requestOpenRouterStructured = async <T>({
  messages,
  schema,
  temperature = 0.2
}: {
  messages: OpenRouterMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
}) => {
  const enabled = ensureOpenRouterEnabled();
  if (!enabled.ok) {
    throw new Error(enabled.message);
  }

  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages
    })
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    model?: string;
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  if (!response.ok) {
    const message = payload.error?.message ?? `OpenRouter request failed with status ${response.status}`;
    throw new Error(message);
  }

  const rawContent = extractStringContent(payload.choices?.[0]?.message?.content);
  if (!rawContent) {
    throw new Error('OpenRouter returned empty content');
  }

  const jsonPayload = extractJsonPayload(rawContent);
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonPayload);
  } catch {
    throw new Error('OpenRouter returned malformed JSON content');
  }

  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error('OpenRouter response failed schema validation');
  }

  return {
    data: parsed.data,
    model: payload.model ?? env.OPENROUTER_MODEL,
    rawContent
  };
};

