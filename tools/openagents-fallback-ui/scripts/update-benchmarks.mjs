import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const SCRIPT_VERSION = '2026-03-19.1'
const ROOT = resolve(import.meta.dirname, '..')
const OUTPUT_PATH = resolve(ROOT, 'data', 'benchmark-snapshot.json')

const TRACKED_MODELS = [
  { id: 'openai/gpt-5.4', aliases: ['gpt-5.4'] },
  { id: 'openai/gpt-5.3-codex', aliases: ['gpt-5.3-codex', 'gpt 5.3 codex'] },
  { id: 'openai/gpt-5.2', aliases: ['gpt-5.2'] },
  { id: 'anthropic/claude-opus-4-6', aliases: ['claude opus 4.6', 'claude-opus-4-6'] },
  {
    id: 'anthropic/claude-sonnet-4-6',
    aliases: ['claude sonnet 4.6', 'claude-sonnet-4-6'],
  },
  { id: 'anthropic/claude-haiku-4-5', aliases: ['claude haiku 4.5', 'claude-haiku-4-5'] },
  { id: 'google/gemini-3.1-pro', aliases: ['gemini 3.1 pro', 'gemini-3.1-pro'] },
  { id: 'google/gemini-3-flash', aliases: ['gemini 3 flash', 'gemini-3-flash'] },
  {
    id: 'github-copilot/grok-code-fast-1',
    aliases: ['grok-code-fast-1', 'grok code fast'],
  },
  { id: 'minimax/minimax-m2.5', aliases: ['minimax m2.5', 'minimax-m2.5'] },
  { id: 'opencode-go/glm-5', aliases: ['glm-5', 'glm 5'] },
  { id: 'kimi/k2p5', aliases: ['kimi k2.5', 'k2p5', 'kimi-for-coding/k2p5'] },
]

const STATIC_RECOMMENDATIONS = {
  categories: {
    'visual-engineering': {
      summary: 'Prefer strong visual/multimodal models for frontend and design-heavy work.',
      recommended_models: ['google/gemini-3.1-pro', 'openai/gpt-5.4'],
      confidence: 'medium',
    },
    ultrabrain: {
      summary: 'Reserve highest reasoning models for architecture and hard tradeoffs.',
      recommended_models: ['openai/gpt-5.4', 'anthropic/claude-opus-4-6'],
      confidence: 'high',
    },
    deep: {
      summary: 'Autonomous implementation/debugging usually performs best on code-tuned models.',
      recommended_models: ['openai/gpt-5.3-codex', 'anthropic/claude-opus-4-6'],
      confidence: 'high',
    },
    artistry: {
      summary: 'Creative tasks benefit from high-variance strong-generative models.',
      recommended_models: ['google/gemini-3.1-pro', 'anthropic/claude-opus-4-6'],
      confidence: 'medium',
    },
    quick: {
      summary: 'Use fast, cheap models for low-risk short tasks.',
      recommended_models: ['anthropic/claude-haiku-4-5', 'openai/gpt-5.2'],
      confidence: 'medium',
    },
    'unspecified-low': {
      summary: 'Balanced quality/cost default for general low-effort work.',
      recommended_models: ['anthropic/claude-sonnet-4-6', 'google/gemini-3-flash'],
      confidence: 'medium',
    },
    'unspecified-high': {
      summary: 'General hard tasks should use robust frontier models.',
      recommended_models: ['anthropic/claude-opus-4-6', 'openai/gpt-5.4'],
      confidence: 'high',
    },
    writing: {
      summary: 'Technical writing can prioritize fast high-coherence models.',
      recommended_models: ['google/gemini-3-flash', 'anthropic/claude-sonnet-4-6'],
      confidence: 'medium',
    },
    git: {
      summary: 'Git operations should optimize for safety + speed, not max reasoning.',
      recommended_models: ['openai/gpt-5.2', 'anthropic/claude-haiku-4-5'],
      confidence: 'medium',
    },
  },
  agents: {
    sisyphus: {
      summary: 'Main orchestrator prefers high-consistency reasoning and delegation quality.',
      recommended_models: ['anthropic/claude-opus-4-6', 'openai/gpt-5.4'],
      confidence: 'high',
    },
    hephaestus: {
      summary: 'Deep implementation worker should prioritize coding-focused models.',
      recommended_models: ['openai/gpt-5.3-codex', 'openai/gpt-5.4'],
      confidence: 'high',
    },
    oracle: {
      summary: 'Read-only architecture consultation benefits from strongest reasoning.',
      recommended_models: ['openai/gpt-5.4', 'anthropic/claude-opus-4-6'],
      confidence: 'high',
    },
    librarian: {
      summary: 'Documentation/OSS search favors throughput and low cost.',
      recommended_models: ['google/gemini-3-flash', 'anthropic/claude-haiku-4-5'],
      confidence: 'medium',
    },
    explore: {
      summary: 'Contextual grep/search workflows prioritize speed and broad availability.',
      recommended_models: ['github-copilot/grok-code-fast-1', 'anthropic/claude-haiku-4-5'],
      confidence: 'medium',
    },
  },
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9.\- ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchesTrackedModel(candidate, tracked) {
  const normalized = normalize(candidate)
  if (normalized.includes(normalize(tracked.id))) {
    return true
  }
  return tracked.aliases.some((alias) => normalized.includes(normalize(alias)))
}

async function tryFetchJson(url, options = {}) {
  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    const data = await response.json()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown fetch error.' }
  }
}

function findAiModel(aaRows, tracked) {
  return aaRows.find((row) => {
    const fields = [row?.name, row?.slug, row?.id, row?.model_creator?.name].filter(Boolean)
    return fields.some((field) => matchesTrackedModel(String(field), tracked))
  })
}

function findOpenRouterModel(orRows, tracked) {
  return orRows.find((row) => {
    const fields = [row?.id, row?.name, row?.canonical_slug].filter(Boolean)
    return fields.some((field) => matchesTrackedModel(String(field), tracked))
  })
}

function buildSignals(aaRows, orRows) {
  const signals = {}

  for (const tracked of TRACKED_MODELS) {
    const aaMatch = findAiModel(aaRows, tracked)
    const orMatch = findOpenRouterModel(orRows, tracked)

    const aaEval = aaMatch?.evaluations ?? {}
    const aaPricing = aaMatch?.pricing ?? {}
    const orPricing = orMatch?.pricing ?? {}

    const codingIndex =
      typeof aaEval.artificial_analysis_coding_index === 'number'
        ? aaEval.artificial_analysis_coding_index
        : null
    const intelligenceIndex =
      typeof aaEval.artificial_analysis_intelligence_index === 'number'
        ? aaEval.artificial_analysis_intelligence_index
        : null
    const outputTps =
      typeof aaMatch?.median_output_tokens_per_second === 'number'
        ? aaMatch.median_output_tokens_per_second
        : null
    const ttft =
      typeof aaMatch?.median_time_to_first_token_seconds === 'number'
        ? aaMatch.median_time_to_first_token_seconds
        : null

    const inputPrice =
      typeof aaPricing.price_1m_input_tokens === 'number'
        ? aaPricing.price_1m_input_tokens
        : typeof orPricing?.prompt === 'string'
          ? Number(orPricing.prompt) * 1_000_000
          : null

    const outputPrice =
      typeof aaPricing.price_1m_output_tokens === 'number'
        ? aaPricing.price_1m_output_tokens
        : typeof orPricing?.completion === 'string'
          ? Number(orPricing.completion) * 1_000_000
          : null

    signals[tracked.id] = {
      coding_index: codingIndex,
      intelligence_index: intelligenceIndex,
      output_tokens_per_second: outputTps,
      time_to_first_token_seconds: ttft,
      price_per_m_input_usd: Number.isFinite(inputPrice) ? inputPrice : null,
      price_per_m_output_usd: Number.isFinite(outputPrice) ? outputPrice : null,
      source: {
        artificial_analysis: Boolean(aaMatch),
        openrouter: Boolean(orMatch),
      },
    }
  }

  return signals
}

function inferSnapshotQuality(signals) {
  const availableCoding = Object.values(signals).filter((signal) => signal.coding_index !== null).length
  if (availableCoding >= 6) {
    return 'high'
  }
  if (availableCoding >= 3) {
    return 'medium'
  }
  return 'low'
}

async function main() {
  const previousRaw = await readFile(OUTPUT_PATH, 'utf8').catch(() => null)
  const previous = previousRaw ? JSON.parse(previousRaw) : null

  const artificialAnalysisKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  const aaResponse = artificialAnalysisKey
    ? await tryFetchJson('https://artificialanalysis.ai/api/v2/data/llms/models', {
        headers: {
          'x-api-key': artificialAnalysisKey,
        },
      })
    : { ok: false, error: 'ARTIFICIAL_ANALYSIS_API_KEY not set' }

  const orResponse = await tryFetchJson('https://openrouter.ai/api/v1/models')

  const aaRows = aaResponse.ok ? (aaResponse.data?.data ?? []) : []
  const orRows = orResponse.ok ? (orResponse.data?.data ?? []) : []

  const signals = buildSignals(aaRows, orRows)
  const snapshot = {
    generated_at: new Date().toISOString(),
    script_version: SCRIPT_VERSION,
    quality: inferSnapshotQuality(signals),
    source_status: {
      artificial_analysis: {
        ok: aaResponse.ok,
        error: aaResponse.ok ? null : aaResponse.error,
      },
      openrouter: {
        ok: orResponse.ok,
        error: orResponse.ok ? null : orResponse.error,
      },
    },
    tracked_models: TRACKED_MODELS.map((model) => model.id),
    model_signals: signals,
    recommendations: STATIC_RECOMMENDATIONS,
    notes: [
      'Use this snapshot as routing guidance, then validate with your own eval set.',
      'Artificial Analysis metrics require API key; OpenRouter data fills pricing metadata when available.',
    ],
    previous_generated_at: previous?.generated_at ?? null,
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  const sourceState = `${snapshot.source_status.artificial_analysis.ok ? 'AA:ok' : 'AA:missing'} | ${snapshot.source_status.openrouter.ok ? 'OR:ok' : 'OR:missing'}`
  console.log(`Benchmark snapshot updated at ${OUTPUT_PATH}`)
  console.log(`Quality: ${snapshot.quality} (${sourceState})`)
}

main().catch((error) => {
  console.error('Failed to update benchmark snapshot:')
  console.error(error)
  process.exitCode = 1
})
