import type { AvailabilitySummaryResponse } from '../../src/features/resource-insights/availability/types'
import assert from 'node:assert'
import {
  AvailabilityApiError,
  AvailabilityPluginUnavailableError,
  fetchAvailabilitySummary,
} from '../../src/features/resource-insights/availability/api'
import { buildAvailabilityFleetView, formatCoverageDays } from '../../src/features/resource-insights/availability/useAvailability30d'

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

// 2. Case D: API Plugin 404 returns AvailabilityPluginUnavailableError (unsupported)
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

// 3. Case E: API 502 / 503 returns AvailabilityApiError (error, not unsupported)
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 503,
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
        assert.strictEqual(err.status, 503)
        assert.ok(err.message.includes('暂时不可用'))
        return true
      },
    )
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 4. Case F: Network failure returns AvailabilityApiError (error)
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
        assert.ok(err instanceof AvailabilityApiError)
        assert.ok(err.message.includes('连接失败'))
        return true
      },
    )
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

// 5. Production view-model calculation: no observations stay hidden
{
  const summary: AvailabilitySummaryResponse = {
    schemaVersion: 1,
    generatedAt: '2026-09-22T12:00:00.000Z',
    windowStart: '2026-08-23T12:00:00.000Z',
    windowEnd: '2026-09-22T12:00:00.000Z',
    observerCoverage: { observableSeconds: 0, unobservedSeconds: 2592000 },
    nodes: [{
      uuid: 'n0',
      currentState: 'online',
      trackingSince: '2026-09-22T12:00:00.000Z',
      onlineSeconds: 0,
      offlineSeconds: 0,
      observableSeconds: 0,
      unobservedSeconds: 2592000,
      coverageRatio: 0,
      uptimeRatio: null,
      outageCount: 0,
    }],
  }

  const view = buildAvailabilityFleetView(
    [{ uuid: 'n0', name: 'Node 0', online: true } as any],
    summary,
  )
  assert.strictEqual(view.nodes[0]!.coverageText, '未观测')
  assert.strictEqual(view.nodes[0]!.uptimeText, '--')
  assert.strictEqual(view.fleetUptimeText, '--')
}

// 6. Production view-model calculation: sub-day observations do not show a misleading uptime percentage
{
  const seconds = 7200
  const summary: AvailabilitySummaryResponse = {
    schemaVersion: 1,
    generatedAt: '2026-09-22T12:00:00.000Z',
    windowStart: '2026-08-23T12:00:00.000Z',
    windowEnd: '2026-09-22T12:00:00.000Z',
    observerCoverage: { observableSeconds: seconds, unobservedSeconds: 0 },
    nodes: [{
      uuid: 'n1',
      currentState: 'online',
      trackingSince: '2026-09-22T10:00:00.000Z',
      onlineSeconds: seconds,
      offlineSeconds: 0,
      observableSeconds: seconds,
      unobservedSeconds: 0,
      coverageRatio: 1,
      uptimeRatio: 1,
      outageCount: 0,
    }],
  }

  const view = buildAvailabilityFleetView(
    [{ uuid: 'n1', name: 'Node 1', online: true } as any],
    summary,
  )
  assert.strictEqual(formatCoverageDays(seconds), '覆盖 <1 / 30 天')
  assert.strictEqual(view.nodes[0]!.uptimeText, '--')
  assert.strictEqual(view.fleetUptimeText, '--')
}

// 7. Production view-model calculation: mature node displays its actual uptime
{
  const seconds = 1.5 * 86400
  const summary: AvailabilitySummaryResponse = {
    schemaVersion: 1,
    generatedAt: '2026-09-22T12:00:00.000Z',
    windowStart: '2026-08-23T12:00:00.000Z',
    windowEnd: '2026-09-22T12:00:00.000Z',
    observerCoverage: { observableSeconds: seconds, unobservedSeconds: 0 },
    nodes: [{
      uuid: 'n2',
      currentState: 'online',
      trackingSince: '2026-09-21T00:00:00.000Z',
      onlineSeconds: seconds * 0.99,
      offlineSeconds: seconds * 0.01,
      observableSeconds: seconds,
      unobservedSeconds: 0,
      coverageRatio: 1,
      uptimeRatio: 0.99,
      outageCount: 1,
    }],
  }

  const view = buildAvailabilityFleetView(
    [{ uuid: 'n2', name: 'Node 2', online: true } as any],
    summary,
  )
  assert.strictEqual(view.nodes[0]!.coverageText, '覆盖 1.5 / 30 天')
  assert.strictEqual(view.nodes[0]!.uptimeText, '99.00%')
}

// 8. Fleet calculation uses production code and weights by observed seconds
{
  const day = 86400
  const summary: AvailabilitySummaryResponse = {
    schemaVersion: 1,
    generatedAt: '2026-09-22T12:00:00.000Z',
    windowStart: '2026-08-23T12:00:00.000Z',
    windowEnd: '2026-09-22T12:00:00.000Z',
    observerCoverage: { observableSeconds: day * 2, unobservedSeconds: 0 },
    nodes: [
      {
        uuid: 'n1',
        currentState: 'online',
        trackingSince: '2026-09-21T12:00:00.000Z',
        onlineSeconds: day,
        offlineSeconds: 0,
        observableSeconds: day,
        unobservedSeconds: 0,
        coverageRatio: 1,
        uptimeRatio: 1,
        outageCount: 0,
      },
      {
        uuid: 'n2',
        currentState: 'online',
        trackingSince: '2026-09-21T12:00:00.000Z',
        onlineSeconds: day * 0.8,
        offlineSeconds: day * 0.2,
        observableSeconds: day,
        unobservedSeconds: 0,
        coverageRatio: 1,
        uptimeRatio: 0.8,
        outageCount: 1,
      },
      {
        uuid: 'n3',
        currentState: 'offline',
        trackingSince: '2026-09-22T12:00:00.000Z',
        onlineSeconds: 0,
        offlineSeconds: 0,
        observableSeconds: 0,
        unobservedSeconds: day,
        coverageRatio: 0,
        uptimeRatio: null,
        outageCount: 0,
      },
    ],
  }

  const view = buildAvailabilityFleetView(
    [
      { uuid: 'n1', name: 'Node 1', online: true } as any,
      { uuid: 'n2', name: 'Node 2', online: true } as any,
      { uuid: 'n3', name: 'Node 3', online: false } as any,
    ],
    summary,
  )

  assert.strictEqual(view.coveredNodes, 2)
  assert.strictEqual(view.fleetUptimeRatio, 0.9)
  assert.strictEqual(view.fleetUptimeText, '90.00%')
}

