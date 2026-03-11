const models = ['gpt-5.2', 'gpt-5.2-codex', 'gpt-5.3-codex', 'gpt-5.4'];

for (const model of models) {
  const resp = await fetch('https://cf.cpass.cc/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-wA0aL90V6TnhnozGPBxBMQs5xECgTYkZ0LpJcxr1bTIucx7Y',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say hi' }],
      max_tokens: 10,
    }),
  });
  const text = await resp.text();
  const short = text.length > 120 ? text.slice(0, 120) + '...' : text;
  console.log(`${model}: ${resp.status} ${short}`);
}
