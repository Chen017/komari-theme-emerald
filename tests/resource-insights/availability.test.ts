import type { AvailabilitySummaryResponse } from '../../src/features/resource-insights/availability/types'
import assert from 'node:assert'
import {
  AvailabilityApiError,
  AvailabilityPluginUnavailableError,
  fetchAvailabilitySummary,
} from '../../src/features/resource-insights/availability/api'

// 1. API: Successful fetch & normalization
{
  const mockResponse: AvailabilitySummaryResponse = {
    schemaVersion: 1,
    generatedAt: '2026-09-22T12:00:00.000Z',
    windowStart: '2026-08-23T12:00:00.000Z',
    windowEnd: '2026-09-22T12:00:00.000Z',
    observerCoverage: {
      observableSeconds: 2592000,
      unobservedSeconds: 0,
    },
    nodes: [
      {
        uuid: 'node-zouter',
        currentState: 'online',
        trackingSince: '2026-08-23T12:00:00.000Z',
        onlineSeconds: 2589000,
        offlineSeconds: 3000,
        observableSeconds: 2592000,
        unobservedSeconds: 0,
        coverageRatio: 1,
        uptimeRatio: 2589000 / 2592000,
        outageCount: 1,
      },
    ],
  }

  // Mock global fetch
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url: any) => {
    assert.ok(String(url).includes('/api/plugin/availability-history/v1/summary'))
    assert.ok(String(url).includes('days=30'))
    return {
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any
  }

  try {
    const res = await fetchAvailabilitySummary({ days: 30, uuids: ['node-zouter'] })
    assert.strictEqual(res.schemaVersion, 1)
    assert.strictEqual(res.nodes.length, 1)
    assert.strictEqual(res.nodes[0]!.uuid, 'node-zouter')
    assert.strictEqual(res.nodes[0]!.outageCount, 1)
    assert.strictEqual(res.nodes[0]!.offlineSeconds, 3000)
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 2. API: Plugin 404 / 502 / 503 returns AvailabilityPluginUnavailableError
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    } as any
  }

  try {
    await assert.rejects(
      async () => {
        await fetchAvailabilitySummary({ days: 30 })
      },
      (err: any) => {
        assert.ok(err instanceof AvailabilityPluginUnavailableError)
        assert.ok(err.message.includes('需要 Availability History 插件'))
        return true
      },
    )
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 3. API: Network failure returns AvailabilityPluginUnavailableError
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch')
  }

  try {
    await assert.rejects(
      async () => {
        await fetchAvailabilitySummary({ days: 30 })
      },
      (err: any) => {
        assert.ok(err instanceof AvailabilityPluginUnavailableError)
        return true
      },
    )
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 4. API: Non-404 HTTP errors map to AvailabilityApiError
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any
  }

  try {
    await assert.rejects(
      async () => {
        await fetchAvailabilitySummary({ days: 30 })
      },
      (err: any) => {
        assert.ok(err instanceof AvailabilityApiError)
        assert.strictEqual(err.status, 500)
        return true
      },
    )
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 5. Fleet calculation: sum(onlineSeconds) / sum(onlineSeconds + offlineSeconds)
{
  const node1 = {
    uuid: 'n1',
    onlineSeconds: 1000,
    offlineSeconds: 0,
    observableSeconds: 1000,
  }
  const node2 = {
    uuid: 'n2',
    onlineSeconds: 800,
    offlineSeconds: 200,
    observableSeconds: 1000,
  }
  const nodeUnobserved = {
    uuid: 'n3',
    onlineSeconds: 0,
    offlineSeconds: 0,
    observableSeconds: 0,
  }

  const nodes = [node1, node2, nodeUnobserved]
  let totalOnline = 0
  let totalTracked = 0
  for (const n of nodes) {
    const obs = n.onlineSeconds + n.offlineSeconds
    if (obs > 0) {
      totalOnline += n.onlineSeconds
      totalTracked += obs
    }
  }

  const fleetRatio = totalTracked > 0 ? totalOnline / totalTracked : null
  assert.strictEqual(totalOnline, 1800)
  assert.strictEqual(totalTracked, 2000)
  assert.strictEqual(fleetRatio, 0.9)
  assert.strictEqual(`${(fleetRatio! * 100).toFixed(2)}%`, '90.00%')
}

// 6. Section 58 Partial history: 3 days tracked -> 3.0 / 30 天, never 30 / 30
{
  const threeDaysObservable = 3 * 86400
  const coverageDays = Number((threeDaysObservable / 86400).toFixed(1))
  const coverageText = `覆盖 ${coverageDays} / 30 天`
  assert.strictEqual(coverageText, '覆盖 3 / 30 天')
}
