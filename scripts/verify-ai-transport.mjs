/**
 * Run with: node --experimental-transform-types --no-warnings scripts/verify-ai-transport.mjs
 * Vision + chat streaming transport against a stubbed fetch (no network, fake process-local keys):
 * SSE aggregation across chunk boundaries, trailing usage lines, provider image formats, model fallback,
 * non-stream JSON gateways, DSML suppression and streamed tool-call assembly.
 */
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = pathToFileURL(process.cwd() + '/').href
register(
  'data:text/javascript,' +
    encodeURIComponent(`
const ROOT = ${JSON.stringify(root)};
const exts = ['', '.ts', '.tsx', '/index.ts', '.js'];
export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith('@/')) spec = ROOT + 'src/' + spec.slice(2);
  else if (spec === '@payload-config') spec = ROOT + 'src/payload.config.ts';
  if (spec.startsWith('file:') || /^\\.{1,2}\\//.test(spec)) {
    let lastErr;
    for (const e of exts) {
      try { return await next(spec + e, context) } catch (err) { lastErr = err }
    }
    throw lastErr;
  }
  try { return await next(spec, context) } catch (err) {
    if (!/\\.[cm]?js$/.test(spec)) return next(spec + '.js', context);
    throw err;
  }
}`),
)

process.env.DASHSCOPE_API_KEY = 'test-key-local'
process.env.ZHIPU_API_KEY = 'test-key-local'

const sse = (lines, { trailingNewline = true } = {}) => {
  const text =
    lines.map((l) => `data: ${typeof l === 'string' ? l : JSON.stringify(l)}`).join('\n\n') +
    (trailingNewline ? '\n\n' : '')
  const bytes = new TextEncoder().encode(text)
  // split into small chunks to exercise buffering across reads
  const chunks = []
  for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7))
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(ch)
        c.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

const calls = []
let handler = null
globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null
  calls.push({
    url: String(url),
    body,
    auth: init?.headers?.Authorization || init?.headers?.authorization,
  })
  return handler(String(url), body)
}

const vision = await import('../src/plugins/ai-copilot/vision.ts')
const server = await import('../src/plugins/ai-copilot/server.ts')

const qwen = {
  id: 'm-qwen',
  name: 'Qwen-VL-Max',
  channelId: 'dashscope',
  apiModel: 'qwen-vl-max',
  enabled: true,
}
const qwen38Flash = {
  id: 'qwen3.8-flash',
  name: 'Qwen 3.8 Flash',
  channelId: 'dashscope',
  apiModel: 'qwen3.8-flash',
  enabled: true,
}
const qwen37Plus = {
  id: 'qwen3.7-plus',
  name: 'Qwen 3.7 Plus',
  channelId: 'dashscope',
  apiModel: 'qwen3.7-plus',
  enabled: true,
}
const glm = {
  id: 'm-glm',
  name: 'GLM-4V-Plus',
  channelId: 'zhipu',
  apiModel: 'glm-4v-plus',
  enabled: true,
}
let n = 0

// 1) callVision: streamed aggregation, usage line WITHOUT trailing newline
handler = () =>
  sse(
    [
      { choices: [{ delta: { content: '{"kind":' } }] },
      { choices: [{ delta: { content: '"floor-plan"}' } }] },
      { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 9, total_tokens: 1209 } },
    ],
    { trailingNewline: false },
  )
let r = await vision.callVision({
  images: ['data:image/jpeg;base64,QUJD'],
  prompt: 'classify',
  models: [qwen],
})
assert.equal(r.text, '{"kind":"floor-plan"}')
n++
assert.equal(r.usage?.prompt_tokens, 1200, 'usage from trailing line without newline')
n++
assert.equal(r.model.id, 'm-qwen')
n++
const sent = calls.at(-1).body
assert.equal(sent.stream, true)
n++
assert.equal(
  sent.messages.at(-1).content[0].image_url.url,
  'data:image/jpeg;base64,QUJD',
  'dashscope gets data URL',
)
n++
assert.ok(calls.at(-1).url.includes('dashscope'), 'dashscope endpoint')
n++

// 2) Zhipu gets bare base64
handler = () => sse([{ choices: [{ delta: { content: 'ok' } }] }])
r = await vision.callVision({ images: ['data:image/jpeg;base64,QUJD'], prompt: 'x', models: [glm] })
assert.equal(
  calls.at(-1).body.messages.at(-1).content[0].image_url.url,
  'QUJD',
  'zhipu bare base64',
)
n++

// 3) fallback: first model 500 -> second model answers
handler = (url) =>
  url.includes('dashscope')
    ? new Response('err', { status: 500 })
    : sse([{ choices: [{ delta: { content: 'from glm' } }] }])
r = await vision.callVision({
  images: ['data:image/jpeg;base64,QUJD'],
  prompt: 'x',
  models: [qwen, glm],
})
assert.equal(r?.text, 'from glm')
n++
assert.equal(r?.model.id, 'm-glm')
n++

// 4) non-stream JSON reply from a gateway ignoring stream=true
handler = () =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: 'json reply' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
r = await vision.callVision({
  images: ['data:image/jpeg;base64,QUJD'],
  prompt: 'x',
  models: [qwen],
})
assert.equal(r?.text, 'json reply')
n++

// 5) all fail -> null (no throw)
handler = () => new Response('err', { status: 503 })
r = await vision.callVision({
  images: ['data:image/jpeg;base64,QUJD'],
  prompt: 'x',
  models: [qwen, glm],
})
assert.equal(r, null)
n++

// 6) extractJson robustness
assert.deepEqual(vision.extractJson('结果如下：```json\n{"a":1,}\n```'), { a: 1 })
n++

// 7) streamTurn: reasoning + text + DSML suppression + tool_calls split across chunks + trailing usage
const deltas = []
const reasoning = []
handler = () =>
  sse(
    [
      { choices: [{ delta: { reasoning_content: '先想一想' } }] },
      { choices: [{ delta: { content: '好的，' } }] },
      { choices: [{ delta: { content: '马上处理。' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'add_floor', arguments: '{"import' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { name: '_sheet', arguments: 'Mode":"all"}' } }],
            },
          },
        ],
      },
      { choices: [], usage: { prompt_tokens: 300, completion_tokens: 40 } },
    ],
    { trailingNewline: false },
  )
let t = await server.streamTurn(qwen, [{ role: 'user', content: 'hi' }], {
  tools: [{ type: 'function', function: { name: 'add_floor_sheet', parameters: {} } }],
  onDelta: (x) => deltas.push(x),
  onReasoning: (x) => reasoning.push(x),
})
assert.equal(t.content, '好的，马上处理。')
n++
assert.equal(deltas.join(''), '好的，马上处理。')
n++
assert.equal(reasoning.join(''), '先想一想')
n++
assert.equal(t.tool_calls.length, 1)
n++
assert.equal(t.tool_calls[0].function.name, 'add_floor_sheet')
n++
assert.equal(t.tool_calls[0].function.arguments, '{"importMode":"all"}')
n++
assert.equal(t.tool_calls[0].id, 'call_1')
n++
assert.equal(t.usage?.prompt_tokens, 300, 'streamTurn usage from trailing line')
n++
assert.ok(Array.isArray(calls.at(-1).body.tools), 'tools forwarded')
n++

// 8) DSML leakage is suppressed
deltas.length = 0
handler = () =>
  sse([
    { choices: [{ delta: { content: '正文开始' } }] },
    { choices: [{ delta: { content: '<｜DSML｜function_calls>' } }] },
    { choices: [{ delta: { content: 'garbage' } }] },
  ])
t = await server.streamTurn(qwen, [{ role: 'user', content: 'hi' }])
assert.equal(t.content, '正文开始')
n++
assert.ok(!deltas.join('').includes('DSML'))
n++

// 9) qwen3.8-flash outranks qwen3.7-plus in visionScore, sends enable_thinking=false when thinking is not requested, and respects highResolution=false
assert.ok(
  vision.visionScore(qwen38Flash) > vision.visionScore(qwen37Plus),
  'qwen3.8-flash outranks qwen3.7-plus',
)
n++
handler = () => sse([{ choices: [{ delta: { content: '{"kind":"floor-plan"}' } }] }])
r = await vision.callVision({
  images: ['data:image/jpeg;base64,QUJD'],
  prompt: 'classify',
  models: [qwen38Flash],
  thinking: false,
  highResolution: false,
})
assert.equal(r?.model.id, 'qwen3.8-flash')
n++
assert.equal(
  calls.at(-1).body.enable_thinking,
  false,
  'enable_thinking disabled for fast structured vision',
)
n++
assert.equal(
  calls.at(-1).body.vl_high_resolution_images,
  undefined,
  'vl_high_resolution_images omitted when highResolution=false',
)
n++

console.log(`PASS ${n} transport assertions`)
