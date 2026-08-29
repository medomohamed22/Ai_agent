import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderSettings } from '@/lib/workspace/types';

function assertSafeProviderURL(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === '169.254.169.254';

  if (process.env.ALLOW_UNSAFE_PROVIDER_URLS !== 'true') {
    if (url.protocol !== 'https:') throw new Error('Custom provider Base URL must use HTTPS.');
    if (blocked) throw new Error('Private/local provider URLs are blocked on the hosted server.');
  }
}

export function getModel(settings: ProviderSettings) {
  if (settings.type === 'gateway') return settings.model;

  assertSafeProviderURL(settings.baseURL);

  const provider = createOpenAICompatible({
    name: settings.name || 'custom',
    baseURL: settings.baseURL.replace(/\/$/, ''),
    apiKey: settings.apiKey,
  });

  return provider.chatModel(settings.model);
}
