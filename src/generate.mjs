/**
 * Optional model call.
 *
 * Fantasy Pressbox works with no API key at all: it writes a prompt file you
 * paste into ChatGPT or Claude. This module is the shortcut for people who
 * would rather have the finished posts written straight to output/.
 */

const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function detectProvider(ai) {
  if (ai.provider === 'anthropic' || ai.provider === 'openai') return ai.provider;
  if (ai.anthropicKey) return 'anthropic';
  if (ai.openaiKey) return 'openai';
  return null;
}

export function describeProvider(ai) {
  const provider = detectProvider(ai);
  if (!provider) return 'none (prompt files only)';
  return `${provider} / ${ai.model || (provider === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : 'model not set')}`;
}

async function callAnthropic({ apiKey, model, system, user, maxTokens }) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const data = await response.json();
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callOpenAI({ apiKey, model, system, user, maxTokens }) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function generate({ ai, system, user, maxTokens = 8000 }) {
  const provider = detectProvider(ai);
  if (!provider) {
    throw new Error(
      'No AI provider configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env, ' +
        'or drop the --generate flag and paste the prompt file into ChatGPT or Claude instead.',
    );
  }

  if (provider === 'anthropic') {
    if (!ai.anthropicKey) throw new Error('AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is empty.');
    return {
      provider,
      model: ai.model || ANTHROPIC_DEFAULT_MODEL,
      text: await callAnthropic({
        apiKey: ai.anthropicKey,
        model: ai.model || ANTHROPIC_DEFAULT_MODEL,
        system,
        user,
        maxTokens,
      }),
    };
  }

  if (!ai.openaiKey) throw new Error('AI_PROVIDER is openai but OPENAI_API_KEY is empty.');
  if (!ai.model) {
    throw new Error('Set OPENAI_MODEL in .env (for example: gpt-4.1) so we know which model to call.');
  }
  return {
    provider,
    model: ai.model,
    text: await callOpenAI({ apiKey: ai.openaiKey, model: ai.model, system, user, maxTokens }),
  };
}
