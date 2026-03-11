import path from 'node:path';
import { loadConfig } from '../core/config';

const config = loadConfig(path.resolve(import.meta.dirname, '../../../../../..'));

const baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
const pathname = new URL(baseUrl).pathname;
const hasFullPath = /\/v\d+\/.+/.test(pathname);
const hasVersionOnly = /\/v\d+$/.test(pathname);

let finalUrl: string;
if (hasFullPath) finalUrl = baseUrl;
else if (hasVersionOnly) finalUrl = `${baseUrl}/chat/completions`;
else finalUrl = `${baseUrl}/v1/chat/completions`;

const requestHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${config.apiKey}`,
};

const requestBody = {
  model: config.model,
  messages: [{ role: 'user', content: 'Say hello' }],
  max_tokens: 10,
  stream: false,
};

// Also test with stream=true
const streamBody = {
  ...requestBody,
  stream: true,
};

console.log('\n========== REQUEST ==========');
console.log('URL:', finalUrl);
console.log('Method: POST');
console.log(
  'Headers:',
  JSON.stringify(
    {
      ...requestHeaders,
      Authorization: `Bearer ***${config.apiKey?.slice(-4)}`,
    },
    null,
    2,
  ),
);
console.log('Body:', JSON.stringify(requestBody, null, 2));

const resp = await fetch(finalUrl, {
  method: 'POST',
  headers: requestHeaders,
  body: JSON.stringify(requestBody),
});

console.log('\n========== RESPONSE ==========');
console.log('Status:', resp.status, resp.statusText);
console.log('Headers:', JSON.stringify(Object.fromEntries(resp.headers.entries()), null, 2));
const text = await resp.text();
try {
  console.log('Body:', JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log('Body (raw):', text.slice(0, 1000));
}

// Test 2: stream mode
console.log('\n========== REQUEST (stream) ==========');
console.log('Body:', JSON.stringify(streamBody, null, 2));

const resp2 = await fetch(finalUrl, {
  method: 'POST',
  headers: requestHeaders,
  body: JSON.stringify(streamBody),
});

console.log('\n========== RESPONSE (stream) ==========');
console.log('Status:', resp2.status, resp2.statusText);
const text2 = await resp2.text();
console.log('Body (first 500):', text2.slice(0, 500));
