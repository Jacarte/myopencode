import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import './App.css'

type Scope = 'agents' | 'categories'
type TargetKey = `${Scope}:${string}`

type ConfigEntry = {
  model?: string
  fallback_models?: string[]
  [key: string]: unknown
}

type OpenAgentsConfig = {
  agents?: Record<string, ConfigEntry>
  categories?: Record<string, ConfigEntry>
  [key: string]: unknown
}

type RecommendationEntry = {
  summary: string
  recommended_models: string[]
  confidence: 'low' | 'medium' | 'high'
}

type BenchmarkSnapshot = {
  generated_at: string
  quality: 'low' | 'medium' | 'high'
  source_status: {
    artificial_analysis: { ok: boolean; error: string | null }
    openrouter: { ok: boolean; error: string | null }
  }
  recommendations: {
    categories: Record<string, RecommendationEntry>
    agents: Record<string, RecommendationEntry>
  }
  model_signals: Record<
    string,
    {
      coding_index: number | null
      intelligence_index: number | null
      output_tokens_per_second: number | null
      time_to_first_token_seconds: number | null
      price_per_m_input_usd: number | null
      price_per_m_output_usd: number | null
    }
  >
}

type GraphData = {
  nodes: Array<Node<ChainNodeData>>
  edges: Edge[]
}

type TargetMeta = {
  key: TargetKey
  scope: Scope
  name: string
  description: string
}

type GraphTarget = Pick<TargetMeta, 'key' | 'scope' | 'name'>

type ChainNodeData = {
  kind: 'root' | 'model'
  title: string
  provider: string
  model: string
  providers?: string[]
  modelsForProvider?: string[]
  onProviderChange?: (nodeId: string, provider: string) => void
  onModelChange?: (nodeId: string, model: string) => void
  onRemove?: (nodeId: string) => void
}

type ExtractedChain = {
  primaryModel: string
  fallbackModels: string[]
  issues: string[]
}

const ROOT_ID = 'root'

const AGENT_DOC_SUMMARIES: Record<string, string> = {
  sisyphus:
    'Default orchestrator. Plans, delegates, and executes complex tasks through specialized subagents with aggressive parallel execution.',
  hephaestus:
    'Autonomous deep worker focused on end-to-end execution after careful research and codebase exploration.',
  oracle:
    'Read-only consultant for architecture, code review, and difficult debugging tradeoffs.',
  librarian:
    'External research specialist for docs, OSS examples, and multi-repo evidence gathering.',
  explore: 'Fast codebase exploration and contextual grep specialist.',
  'multimodal-looker': 'Visual analysis specialist for PDFs, images, and diagrams.',
  prometheus:
    'Strategic planner that builds detailed execution plans through iterative scoping.',
  metis:
    'Pre-planning consultant that finds ambiguities, hidden intent, and likely failure points.',
  momus:
    'Plan reviewer that validates clarity, verifiability, and completeness before execution.',
  atlas: 'Todo-list orchestrator that executes planned work systematically.',
  'sisyphus-junior':
    'Category-spawned executor used by task delegation, focused on the assigned category intent.',
}

const CATEGORY_DOC_SUMMARIES: Record<string, string> = {
  'visual-engineering': 'Frontend and UI/UX work: styling, layout, design, and animation.',
  ultrabrain: 'Maximum logical reasoning for architecture and high-complexity decisions.',
  deep: 'Goal-oriented autonomous problem solving for hairy tasks requiring deep understanding.',
  artistry: 'Creative and unconventional solution space for novel tasks.',
  quick: 'Fast path for trivial fixes and small focused changes.',
  'unspecified-low': 'General tasks with low effort where no specific category strongly fits.',
  'unspecified-high': 'General tasks with high effort where no specific category strongly fits.',
  writing: 'Documentation, prose, and technical writing tasks.',
  git: 'Git operations with safety and commit hygiene focus.',
}

function getDocDescription(scope: Scope, name: string): string {
  return scope === 'agents'
    ? (AGENT_DOC_SUMMARIES[name] ?? 'Custom agent defined in your local configuration.')
    : (CATEGORY_DOC_SUMMARIES[name] ?? 'Custom category defined in your local configuration.')
}

function parseProvider(modelId: string): string {
  const slashAt = modelId.indexOf('/')
  return slashAt === -1 ? 'custom' : modelId.slice(0, slashAt)
}

function buildModelIndex(models: string[]): Record<string, string[]> {
  const index: Record<string, string[]> = {}
  for (const model of models) {
    const provider = parseProvider(model)
    if (!index[provider]) {
      index[provider] = []
    }
    index[provider].push(model)
  }
  for (const provider of Object.keys(index)) {
    index[provider].sort((a, b) => a.localeCompare(b))
  }
  return index
}

function extractChain(graph: GraphData): ExtractedChain {
  const issues: string[] = []
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const root = nodesById.get(ROOT_ID)
  if (!root) {
    return {
      primaryModel: '',
      fallbackModels: [],
      issues: ['Missing root node for this target.'],
    }
  }

  const visited = new Set<string>([ROOT_ID])
  const fallbackModels: string[] = []
  let cursor = ROOT_ID

  for (;;) {
    const outgoing = graph.edges.filter((edge) => edge.source === cursor)
    if (outgoing.length === 0) {
      break
    }
    if (outgoing.length > 1) {
      issues.push('Branch detected: using the first outgoing connection in each step.')
    }

    const nextId = outgoing[0].target
    if (visited.has(nextId)) {
      issues.push('Cycle detected in fallback chain. Traversal stopped.')
      break
    }

    visited.add(nextId)
    const nextNode = nodesById.get(nextId)
    if (!nextNode) {
      issues.push(`Edge points to missing node: ${nextId}`)
      break
    }

    if (nextNode.data.kind === 'root') {
      issues.push('Fallback chain points back to root. Traversal stopped.')
      break
    }

    if (nextNode.data.model) {
      fallbackModels.push(nextNode.data.model)
    } else {
      issues.push(`A fallback node (${nextId}) has no model selected.`)
    }

    cursor = nextId
  }

  const disconnectedFallbackNodes = graph.nodes.filter(
    (node) => node.data.kind === 'model' && !visited.has(node.id),
  )
  if (disconnectedFallbackNodes.length > 0) {
    issues.push(
      `${disconnectedFallbackNodes.length} fallback block(s) are disconnected and ignored in export.`,
    )
  }

  return {
    primaryModel: root.data.model,
    fallbackModels,
    issues,
  }
}

function buildGraphForEntry(target: GraphTarget, entry: ConfigEntry): GraphData {
  const primary = entry.model ?? ''
  const rootProvider = parseProvider(primary)

  const nodes: Array<Node<ChainNodeData>> = [
    {
      id: ROOT_ID,
      type: 'chainNode',
      position: { x: 80, y: 180 },
      data: {
        kind: 'root',
        title: `${target.scope.slice(0, -1)}: ${target.name}`,
        provider: rootProvider,
        model: primary,
      },
    },
  ]

  const edges: Edge[] = []
  let previousId = ROOT_ID

  for (const [index, fallback] of (entry.fallback_models ?? []).entries()) {
    const fallbackId = `fallback-${index + 1}`
    nodes.push({
      id: fallbackId,
      type: 'chainNode',
      position: { x: 360 + index * 250, y: 180 },
      data: {
        kind: 'model',
        title: `Fallback ${index + 1}`,
        provider: parseProvider(fallback),
        model: fallback,
      },
    })
    edges.push({
      id: `edge-${previousId}-${fallbackId}`,
      source: previousId,
      target: fallbackId,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
    })
    previousId = fallbackId
  }

  return { nodes, edges }
}

function ChainNode(props: NodeProps<ChainNodeData>) {
  const { id, data } = props
  const providers = data.providers ?? []
  const modelsForProvider = data.modelsForProvider ?? []
  const isRoot = data.kind === 'root'

  return (
    <div className={`chain-node ${isRoot ? 'root' : 'fallback'}`}>
      <Handle type="target" position={Position.Left} className="node-handle" />
      <div className="node-header">
        <strong>{data.title}</strong>
        {!isRoot && data.onRemove ? (
          <button type="button" className="node-remove" onClick={() => data.onRemove?.(id)}>
            Remove
          </button>
        ) : null}
      </div>

      <label className="node-field">
        <span>Provider</span>
        <select
          value={data.provider}
          onChange={(event) => data.onProviderChange?.(id, event.target.value)}
        >
          {providers.length === 0 ? <option value="">(no providers)</option> : null}
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>

      <label className="node-field">
        <span>Model</span>
        <select value={data.model} onChange={(event) => data.onModelChange?.(id, event.target.value)}>
          {modelsForProvider.length === 0 ? <option value="">(no models)</option> : null}
          {modelsForProvider.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  )
}

function App() {
  const [models, setModels] = useState<string[]>([])
  const [config, setConfig] = useState<OpenAgentsConfig | null>(null)
  const [graphsByTarget, setGraphsByTarget] = useState<Record<TargetKey, GraphData>>({})
  const [selectedTarget, setSelectedTarget] = useState<TargetKey | null>(null)
  const [benchmarkSnapshot, setBenchmarkSnapshot] = useState<BenchmarkSnapshot | null>(null)
  const [status, setStatus] = useState('Loading config + models from local API...')
  const [loadError, setLoadError] = useState<string | null>(null)

  const modelIndex = useMemo(() => buildModelIndex(models), [models])
  const providers = useMemo(() => Object.keys(modelIndex).sort((a, b) => a.localeCompare(b)), [modelIndex])

  const targets = useMemo<TargetMeta[]>(() => {
    if (!config) {
      return []
    }

    const fromScope = (scope: Scope) =>
      Object.entries(config[scope] ?? {})
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, entry]) => ({
          scope,
          name,
          key: `${scope}:${name}` as TargetKey,
          description:
            typeof entry?.description === 'string'
              ? entry.description
              : getDocDescription(scope, name),
        }))

    return [...fromScope('agents'), ...fromScope('categories')]
  }, [config])

  const updateCurrentGraph = useCallback(
    (updater: (graph: GraphData) => GraphData) => {
      if (!selectedTarget) {
        return
      }
      setGraphsByTarget((previous) => {
        const base = previous[selectedTarget] ?? { nodes: [], edges: [] }
        return {
          ...previous,
          [selectedTarget]: updater(base),
        }
      })
    },
    [selectedTarget],
  )

  const loadModels = useCallback(async () => {
    const response = await fetch('/api/models')
    if (!response.ok) {
      throw new Error(`Models endpoint failed with status ${response.status}`)
    }
    const payload = (await response.json()) as { models?: string[] }
    const fetchedModels = payload.models ?? []
    if (fetchedModels.length === 0) {
      throw new Error('No models returned by /api/models.')
    }
    setModels(fetchedModels)
  }, [])

  const loadConfig = useCallback(async () => {
    const response = await fetch('/api/config')
    if (!response.ok) {
      throw new Error(`Config endpoint failed with status ${response.status}`)
    }

    const payload = (await response.json()) as { config?: OpenAgentsConfig }
    const fetchedConfig = payload.config
    if (!fetchedConfig) {
      throw new Error('No config returned by /api/config.')
    }

    const nextGraphs: Record<TargetKey, GraphData> = {}
    for (const scope of ['agents', 'categories'] as const) {
      for (const [name, entry] of Object.entries(fetchedConfig[scope] ?? {})) {
        const key = `${scope}:${name}` as TargetKey
        nextGraphs[key] = buildGraphForEntry({ scope, name, key }, entry)
      }
    }

    setConfig(fetchedConfig)
    setGraphsByTarget(nextGraphs)
    const keys = Object.keys(nextGraphs) as TargetKey[]
    setSelectedTarget(keys[0] ?? null)
  }, [])

  const loadBenchmarks = useCallback(async () => {
    const response = await fetch('/api/benchmarks')
    if (!response.ok) {
      throw new Error(`Benchmarks endpoint failed with status ${response.status}`)
    }

    const payload = (await response.json()) as { snapshot?: BenchmarkSnapshot }
    if (payload.snapshot) {
      setBenchmarkSnapshot(payload.snapshot)
    }
  }, [])

  const refreshBenchmarks = useCallback(async () => {
    const response = await fetch('/api/benchmarks/refresh')
    if (!response.ok) {
      throw new Error(`Benchmark refresh failed with status ${response.status}`)
    }

    const payload = (await response.json()) as { snapshot?: BenchmarkSnapshot }
    if (payload.snapshot) {
      setBenchmarkSnapshot(payload.snapshot)
      setStatus('Benchmark snapshot refreshed.')
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadModels(), loadConfig()])
        await loadBenchmarks().catch(() => {
          setStatus('Ready. Build your fallback chain visually and export JSON. Benchmarks not loaded.')
        })
        setStatus('Ready. Build your fallback chain visually and export JSON.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown loading error.'
        setLoadError(message)
        setStatus('Could not load config automatically. Check API status below.')
      }
    })()
  }, [loadBenchmarks, loadConfig, loadModels])

  const currentGraph = useMemo<GraphData>(() => {
    if (!selectedTarget) {
      return { nodes: [], edges: [] }
    }
    return graphsByTarget[selectedTarget] ?? { nodes: [], edges: [] }
  }, [graphsByTarget, selectedTarget])

  const selectedMeta = useMemo(
    () => targets.find((target) => target.key === selectedTarget) ?? null,
    [selectedTarget, targets],
  )

  const selectedRecommendation = useMemo(() => {
    if (!selectedMeta || !benchmarkSnapshot) {
      return null
    }

    const recommendationSet =
      selectedMeta.scope === 'agents'
        ? benchmarkSnapshot.recommendations.agents
        : benchmarkSnapshot.recommendations.categories

    return recommendationSet[selectedMeta.name] ?? null
  }, [benchmarkSnapshot, selectedMeta])

  const topModelSignals = useMemo(() => {
    if (!benchmarkSnapshot) {
      return []
    }

    const byCoding = Object.entries(benchmarkSnapshot.model_signals)
      .filter(([, signal]) => signal.coding_index !== null)
      .sort((a, b) => (b[1].coding_index ?? 0) - (a[1].coding_index ?? 0))
      .slice(0, 4)

    if (byCoding.length > 0) {
      return byCoding
    }

    return Object.entries(benchmarkSnapshot.model_signals)
      .filter(([, signal]) => signal.price_per_m_input_usd !== null)
      .sort((a, b) => (a[1].price_per_m_input_usd ?? Number.MAX_SAFE_INTEGER) - (b[1].price_per_m_input_usd ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 4)
  }, [benchmarkSnapshot])

  const updateNodeProvider = useCallback(
    (nodeId: string, provider: string) => {
      updateCurrentGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }
          const providerModels = modelIndex[provider] ?? []
          return {
            ...node,
            data: {
              ...node.data,
              provider,
              model: providerModels[0] ?? '',
            },
          }
        }),
      }))
    },
    [modelIndex, updateCurrentGraph],
  )

  const updateNodeModel = useCallback(
    (nodeId: string, model: string) => {
      updateCurrentGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  model,
                },
              }
            : node,
        ),
      }))
    },
    [updateCurrentGraph],
  )

  const removeNode = useCallback(
    (nodeId: string) => {
      if (nodeId === ROOT_ID) {
        return
      }
      updateCurrentGraph((graph) => {
        const incoming = graph.edges.find((edge) => edge.target === nodeId)
        const outgoing = graph.edges.find((edge) => edge.source === nodeId)
        const edgesWithoutNode = graph.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        )

        const reconnectedEdges =
          incoming && outgoing
            ? [
                ...edgesWithoutNode,
                {
                  id: `edge-${incoming.source}-${outgoing.target}`,
                  source: incoming.source,
                  target: outgoing.target,
                  markerEnd: { type: MarkerType.ArrowClosed },
                  animated: true,
                },
              ]
            : edgesWithoutNode

        return {
          nodes: graph.nodes.filter((node) => node.id !== nodeId),
          edges: reconnectedEdges,
        }
      })
    },
    [updateCurrentGraph],
  )

  const decoratedNodes = useMemo<Array<Node<ChainNodeData>>>(
    () =>
      currentGraph.nodes.map((node) => ({
        ...node,
        type: 'chainNode',
        data: {
          ...node.data,
          providers,
          modelsForProvider: modelIndex[node.data.provider] ?? [],
          onProviderChange: updateNodeProvider,
          onModelChange: updateNodeModel,
          onRemove: removeNode,
        },
      })),
    [currentGraph.nodes, modelIndex, providers, removeNode, updateNodeModel, updateNodeProvider],
  )

  const nodeTypes = useMemo(() => ({ chainNode: ChainNode }), [])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      updateCurrentGraph((graph) => ({
        ...graph,
        nodes: applyNodeChanges(changes, graph.nodes),
      }))
    },
    [updateCurrentGraph],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      updateCurrentGraph((graph) => ({
        ...graph,
        edges: applyEdgeChanges(changes, graph.edges),
      }))
    },
    [updateCurrentGraph],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.target === ROOT_ID) {
        return
      }
      updateCurrentGraph((graph) => ({
        ...graph,
        edges: addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          graph.edges,
        ),
      }))
    },
    [updateCurrentGraph],
  )

  const addFallbackNode = useCallback(() => {
    if (!selectedTarget) {
      return
    }

    const defaultProvider = providers[0] ?? 'opencode'
    const defaultModel = (modelIndex[defaultProvider] ?? [])[0] ?? ''

    updateCurrentGraph((graph) => {
      let tailNode: Node<ChainNodeData> | undefined = graph.nodes.find((node) => node.id === ROOT_ID)
      let keepSearching = true

      while (tailNode && keepSearching) {
        const tailId = tailNode.id
        const outgoing = graph.edges.filter((edge) => edge.source === tailId)
        if (outgoing.length === 0) {
          keepSearching = false
          continue
        }
        const next = graph.nodes.find((node) => node.id === outgoing[0].target)
        if (!next || next.id === ROOT_ID) {
          keepSearching = false
          continue
        }
        tailNode = next
      }

      const newId = crypto.randomUUID()
      const positionX = (tailNode?.position.x ?? 80) + 250
      const positionY = tailNode?.position.y ?? 180

      const newNode: Node<ChainNodeData> = {
        id: newId,
        type: 'chainNode',
        position: { x: positionX, y: positionY },
        data: {
          kind: 'model',
          title: `Fallback ${graph.nodes.filter((node) => node.data.kind === 'model').length + 1}`,
          provider: defaultProvider,
          model: defaultModel,
        },
      }

      const nextNodes = [...graph.nodes, newNode]

      const tailId = tailNode?.id ?? ROOT_ID
      const nextEdges = [
        ...graph.edges,
        {
          id: `edge-${tailId}-${newId}`,
          source: tailId,
          target: newId,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: true,
        },
      ]

      return {
        nodes: nextNodes,
        edges: nextEdges,
      }
    })
  }, [modelIndex, providers, selectedTarget, updateCurrentGraph])

  const chainResult = useMemo(() => extractChain(currentGraph), [currentGraph])

  const exportedConfig = useMemo(() => {
    if (!config) {
      return null
    }
    const draft = structuredClone(config)

    for (const target of targets) {
      const graph = graphsByTarget[target.key]
      if (!graph) {
        continue
      }
      const extracted = extractChain(graph)
      const entry = draft[target.scope]?.[target.name]
      if (!entry) {
        continue
      }
      entry.model = extracted.primaryModel
      entry.fallback_models = extracted.fallbackModels
    }

    return draft
  }, [config, graphsByTarget, targets])

  const fallbackOnlyExport = useMemo(() => {
    if (!config) {
      return null
    }
    const snippet: Pick<OpenAgentsConfig, 'agents' | 'categories'> = {
      agents: {},
      categories: {},
    }

    for (const target of targets) {
      const graph = graphsByTarget[target.key]
      if (!graph) {
        continue
      }
      const extracted = extractChain(graph)
      snippet[target.scope]![target.name] = {
        model: extracted.primaryModel,
        fallback_models: extracted.fallbackModels,
      }
    }

    return snippet
  }, [config, graphsByTarget, targets])

  const copyJson = useCallback(async (json: unknown, label: string) => {
    const text = JSON.stringify(json, null, 2)
    await navigator.clipboard.writeText(text)
    setStatus(`${label} copied to clipboard.`)
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">oh-my-openagents visual editor</p>
          <h1>Fallback Chain Builder</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => void loadModels()}>
            Refresh models (`opencode models --refresh`)
          </button>
          <button type="button" onClick={() => void loadConfig()}>
            Reload config (`oh-my-opencode.json`)
          </button>
          <button type="button" onClick={() => void refreshBenchmarks()}>
            Refresh benchmark snapshot
          </button>
          <button type="button" onClick={addFallbackNode} disabled={!selectedTarget}>
            Add fallback block
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel panel-left">
          <h2>Targets</h2>
          <p className="muted">Pick an agent or category to edit its fallback graph.</p>

          {selectedMeta ? (
            <div className="target-description">
              <h3>About {selectedMeta.name}</h3>
              <p className="target-description-copy">{selectedMeta.description}</p>
            </div>
          ) : null}

          <div className="benchmark-panel">
            <h3>Benchmark guidance</h3>
            {benchmarkSnapshot ? (
              <>
                <p className="benchmark-meta">
                  Updated: {new Date(benchmarkSnapshot.generated_at).toLocaleString()} | Snapshot quality:{' '}
                  <strong>{benchmarkSnapshot.quality}</strong>
                </p>
                {selectedRecommendation ? (
                  <div className="recommendation-card">
                    <p className="recommendation-summary">{selectedRecommendation.summary}</p>
                    <p className="benchmark-meta">
                      Confidence: <strong>{selectedRecommendation.confidence}</strong>
                    </p>
                    <ul>
                      {selectedRecommendation.recommended_models.map((model) => (
                        <li key={model}>
                          <code>{model}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="benchmark-meta">No benchmark hint available for this target.</p>
                )}

                {topModelSignals.length > 0 ? (
                  <div className="coding-top-list">
                    <p className="benchmark-meta">
                      {benchmarkSnapshot.quality === 'low'
                        ? 'Lowest input-price models in snapshot (quality is low):'
                        : 'Top coding-index models in snapshot:'}
                    </p>
                    <ul>
                      {topModelSignals.map(([model, signal]: [string, BenchmarkSnapshot['model_signals'][string]]) => (
                        <li key={model}>
                          <code>{model}</code>{' '}
                          {signal.coding_index !== null
                            ? `(coding: ${signal.coding_index})`
                            : signal.price_per_m_input_usd !== null
                              ? `(input: $${signal.price_per_m_input_usd.toFixed(2)}/1M)`
                              : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="benchmark-meta">
                No benchmark snapshot loaded yet. Run `npm run benchmarks:update` then click Refresh benchmark
                snapshot.
              </p>
            )}
          </div>

          <h3>Agents & categories</h3>
          <div className="target-list">
            {targets.map((target) => (
              <button
                key={target.key}
                type="button"
                className={target.key === selectedTarget ? 'active' : ''}
                onClick={() => setSelectedTarget(target.key)}
                title={target.description}
              >
                <div className="target-meta">
                  <span>{target.name}</span>
                  <small>{target.scope}</small>
                </div>
                <p className="target-summary">{target.description}</p>
              </button>
            ))}
          </div>

          <h3>Current chain</h3>
          <ul className="chain-preview">
            <li>
              <strong>Primary:</strong> <code>{chainResult.primaryModel || '(unset)'}</code>
            </li>
            <li>
              <strong>Fallbacks:</strong>{' '}
              <code>
                {chainResult.fallbackModels.length > 0
                  ? chainResult.fallbackModels.join(' -> ')
                  : '(none)'}
              </code>
            </li>
          </ul>

          {chainResult.issues.length > 0 ? (
            <div className="issues">
              <h3>Warnings</h3>
              <ul>
                {chainResult.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <section className="canvas-wrap">
          <ReactFlow
            nodes={decoratedNodes}
            edges={currentGraph.edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background gap={24} size={1.5} color="#4f6d5d" />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </section>

        <aside className="panel panel-right">
          <h2>Generated JSON</h2>
          <p className="muted">The export mirrors the `model` + `fallback_models` shape in your config.</p>
          <div className="json-actions">
            <button
              type="button"
              onClick={() => void copyJson(fallbackOnlyExport, 'Fallback snippet')}
              disabled={!fallbackOnlyExport}
            >
              Copy fallback snippet
            </button>
            <button
              type="button"
              onClick={() => void copyJson(exportedConfig, 'Merged config')}
              disabled={!exportedConfig}
            >
              Copy full merged config
            </button>
          </div>
          <pre>
            {JSON.stringify(fallbackOnlyExport ?? { error: 'No config loaded yet.' }, null, 2)}
          </pre>
        </aside>
      </main>

      <footer className="app-footer">
        <p>{status}</p>
        {loadError ? (
          <p className="error">
            API error: {loadError}. Ensure you run with `npm run dev` from
            `tools/openagents-fallback-ui`.
          </p>
        ) : null}
      </footer>
    </div>
  )
}

export default App
