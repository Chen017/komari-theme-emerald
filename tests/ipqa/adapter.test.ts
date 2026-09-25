import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getRiskColor, getRiskLabel } from '../../src/features/ipqa/formatters'
import { findProtocolOverviewService } from '../../src/features/ipqa/overviewSelectors'
import type {
  IpqaDailyPairedReport,
  IpqaFleetOverview,
  IpqaNormalizedReport,
  RiskCategory,
} from '../../src/features/ipqa/types'

describe('IPQA adapters & domain model tests', () => {
  // 1. Unknown score provider
  it('preserves unknown score providers without dropping fields', () => {
    const report: IpqaNormalizedReport = {
      schemaVersion: 1,
      ipVersion: 'IPv4',
      archiveId: '2026-09-21_040000',
      date: '2026-09-21',
      timestamp: '2026-09-21T04:00:00Z',
      info: { ip: '1.2.3.4' },
      scores: {
        IP2Location: 'Low',
        Scamalytics: 15,
        CustomFutureScoreEngine: 92,
      },
      type: { usage: {}, company: {} },
      factors: {},
      media: {},
      mail: {},
      extra: { futureField: 'preserved' },
    }

    assert.equal(report.scores.CustomFutureScoreEngine, 92)
    assert.equal(report.extra.futureField, 'preserved')
  })

  // 2. Unknown factor
  it('handles unknown factors and dynamic provider factor trees', () => {
    const report: IpqaNormalizedReport = {
      schemaVersion: 1,
      ipVersion: 'IPv4',
      archiveId: '2026-09-21_040000',
      date: '2026-09-21',
      timestamp: '2026-09-21T04:00:00Z',
      info: { ip: '1.2.3.4' },
      scores: {},
      type: { usage: {}, company: {} },
      factors: {
        KnownEngine: { Proxy: true, VPN: false },
        FutureFactorEngine: { QuantumExitNode: true, SatelliteRelay: 'Detected' },
      },
      media: {},
      mail: {},
      extra: {},
    }

    assert.equal(report.factors.FutureFactorEngine?.QuantumExitNode, true)
    assert.equal(report.factors.FutureFactorEngine?.SatelliteRelay, 'Detected')
  })

  // 3. Unknown media service
  it('handles unknown media and AI services dynamically', () => {
    const report: IpqaNormalizedReport = {
      schemaVersion: 1,
      ipVersion: 'IPv4',
      archiveId: '2026-09-21_040000',
      date: '2026-09-21',
      timestamp: '2026-09-21T04:00:00Z',
      info: { ip: '1.2.3.4' },
      scores: {},
      type: { usage: {}, company: {} },
      factors: {},
      media: {
        Netflix: { status: 'Yes', region: 'US' },
        FutureStreamingService: { status: 'Yes', region: 'SG', customBitrate: '4k' },
      },
      mail: {},
      extra: {},
    }

    assert.equal(report.media.FutureStreamingService?.status, 'Yes')
    assert.equal(report.media.FutureStreamingService?.region, 'SG')
    assert.equal(report.media.FutureStreamingService?.customBitrate, '4k')
  })

  // 4. IPv4 only
  it('correctly models an IPv4-only node daily report', () => {
    const paired: IpqaDailyPairedReport = {
      schemaVersion: 1,
      nodeUuid: 'v4-only-node',
      date: '2026-09-21',
      updatedAt: '2026-09-21T07:00:00Z',
      v4: {
        schemaVersion: 1,
        ipVersion: 'IPv4',
        archiveId: '2026-09-21_040000',
        date: '2026-09-21',
        timestamp: '2026-09-21T04:00:00Z',
        info: { ip: '1.2.3.4', country: 'US' },
        scores: { IPQS: 10 },
        type: { usage: {}, company: {} },
        factors: {},
        media: {},
        mail: {},
        extra: {},
      },
      v6: null,
      summary: {
        hasV4: true,
        hasV6: false,
        highestRiskCategory: 'Low',
        highestRiskSource: 'IPQS',
        mediaSummary: {},
        aiSummary: {},
      },
    }

    assert.equal(paired.summary.hasV4, true)
    assert.equal(paired.summary.hasV6, false)
    assert.notEqual(paired.v4, null)
    assert.equal(paired.v6, null)
  })

  // 5. IPv6 only
  it('correctly models an IPv6-only node daily report', () => {
    const paired: IpqaDailyPairedReport = {
      schemaVersion: 1,
      nodeUuid: 'v6-only-node',
      date: '2026-09-21',
      updatedAt: '2026-09-21T07:00:00Z',
      v4: null,
      v6: {
        schemaVersion: 1,
        ipVersion: 'IPv6',
        archiveId: '2026-09-21_040030',
        date: '2026-09-21',
        timestamp: '2026-09-21T04:00:30Z',
        info: { ip: '2001:db8::1', country: 'JP' },
        scores: { Scamalytics: 5 },
        type: { usage: {}, company: {} },
        factors: {},
        media: {},
        mail: {},
        extra: {},
      },
      summary: {
        hasV4: false,
        hasV6: true,
        highestRiskCategory: 'Low',
        highestRiskSource: 'Scamalytics',
        mediaSummary: {},
        aiSummary: {},
      },
    }

    assert.equal(paired.summary.hasV4, false)
    assert.equal(paired.summary.hasV6, true)
    assert.equal(paired.v4, null)
    assert.notEqual(paired.v6, null)
  })

  // 6. Both IPv4 and IPv6
  it('correctly models dual-stack IPv4 + IPv6 node daily report', () => {
    const paired: IpqaDailyPairedReport = {
      schemaVersion: 1,
      nodeUuid: 'dual-stack-node',
      date: '2026-09-21',
      updatedAt: '2026-09-21T07:00:00Z',
      v4: {
        schemaVersion: 1,
        ipVersion: 'IPv4',
        archiveId: '2026-09-21_040000',
        date: '2026-09-21',
        timestamp: '2026-09-21T04:00:00Z',
        info: { ip: '1.2.3.4' },
        scores: {},
        type: { usage: {}, company: {} },
        factors: {},
        media: {},
        mail: {},
        extra: {},
      },
      v6: {
        schemaVersion: 1,
        ipVersion: 'IPv6',
        archiveId: '2026-09-21_040030',
        date: '2026-09-21',
        timestamp: '2026-09-21T04:00:30Z',
        info: { ip: '2001:db8::1' },
        scores: {},
        type: { usage: {}, company: {} },
        factors: {},
        media: {},
        mail: {},
        extra: {},
      },
      summary: {
        hasV4: true,
        hasV6: true,
        highestRiskCategory: 'Low',
        highestRiskSource: 'None',
        mediaSummary: {},
        aiSummary: {},
      },
    }

    assert.equal(paired.summary.hasV4, true)
    assert.equal(paired.summary.hasV6, true)
    assert.notEqual(paired.v4, null)
    assert.notEqual(paired.v6, null)
  })

  // 7. No archive / node not installed
  it('models neutral states for nodes without IPQA archives', () => {
    const overview: IpqaFleetOverview = {
      schema_version: 1,
      updated_at: '2026-09-21T07:00:00Z',
      total_nodes: 3,
      ipqa_nodes: 1,
      nodes_with_risk: 0,
      nodes_with_changes_today: 0,
      latest_archive_date: '2026-09-21',
      nodes: [
        {
          uuid: 'node-not-installed',
          name: 'Uninstalled Node',
          status: 'not_installed',
          latest_date: null,
          has_ipv4: false,
          has_ipv6: false,
          highest_risk: { category: 'Unknown', source: 'None' },
          media_summary: {},
          ai_summary: {},
          changes_today: 0,
        },
        {
          uuid: 'node-no-archive',
          name: 'Fresh Node',
          status: 'no_archive',
          latest_date: null,
          has_ipv4: false,
          has_ipv6: false,
          highest_risk: { category: 'Unknown', source: 'None' },
          media_summary: {},
          ai_summary: {},
          changes_today: 0,
        },
      ],
    }

    assert.equal(overview.nodes[0]!.status, 'not_installed')
    assert.equal(overview.nodes[0]!.latest_date, null)
    assert.equal(overview.nodes[1]!.status, 'no_archive')
    assert.equal(overview.nodes[1]!.latest_date, null)
  })

  // 8. Risk category formatters
  it('correctly maps risk labels and CSS color classes', () => {
    const categories: RiskCategory[] = ['Critical', 'High', 'Medium', 'Low', 'Unknown']
    const expectedLabels = ['极高风险', '高风险', '中风险', '低风险', '未评估']

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i]!
      const label = getRiskLabel(cat)
      assert.equal(label, expectedLabels[i])

      const color = getRiskColor(cat)
      assert.ok(color.bg.length > 0)
      assert.ok(color.text.length > 0)
      assert.ok(color.border.length > 0)
      assert.ok(color.dot.length > 0)
    }
  })

  // 9. Comprehensive evaluateProviderScore tests
  it('correctly evaluates provider scores with canonical IPQA categories and null display', () => {
    const { evaluateProviderScore } = require('../../src/features/ipqa/formatters')

    // null display
    assert.equal(evaluateProviderScore('IPQS', null).text, 'null')
    assert.equal(evaluateProviderScore('IPQS', null).tagLabel, '无数据')
    assert.equal(evaluateProviderScore('IPQS', null).category, 'Unknown')
    assert.equal(evaluateProviderScore('DBIP', null).text, 'null')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 'null').text, 'null')

    // DataWave regression: ipapi 18.16% -> 极高风险 (Critical), never 良好
    const ipapiCritical = evaluateProviderScore('ipapi', '18.16%')
    assert.equal(ipapiCritical.text, '18.16%')
    assert.equal(ipapiCritical.tagLabel, '极高风险')
    assert.equal(ipapiCritical.category, 'Critical')

    // ipapi 2.73% -> 较高风险 (Medium)
    const ipapiMedium = evaluateProviderScore('ipapi', '2.73%')
    assert.equal(ipapiMedium.text, '2.73%')
    assert.equal(ipapiMedium.tagLabel, '较高风险')
    assert.equal(ipapiMedium.category, 'Medium')

    // IP2Location: 3 -> 低风险 (Low)
    const ip2loc = evaluateProviderScore('IP2LOCATION', 3)
    assert.equal(ip2loc.text, '3')
    assert.equal(ip2loc.tagLabel, '低风险')
    assert.equal(ip2loc.category, 'Low')

    // Scamalytics: 0 -> 低风险, 15 -> 低风险, 35 -> 中风险, 80 -> 高风险, 95 -> 极高风险
    assert.equal(evaluateProviderScore('SCAMALYTICS', 0).tagLabel, '低风险')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 15).tagLabel, '低风险')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 35).tagLabel, '中风险')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 80).tagLabel, '高风险')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 95).tagLabel, '极高风险')
    assert.equal(evaluateProviderScore('SCAMALYTICS', 95).category, 'Critical')

    // AbuseIPDB: 0% -> 低风险, 5% -> 低风险, 25% -> 高风险, 80% -> 建议封禁 (Critical)
    assert.equal(evaluateProviderScore('AbuseIPDB', '0%').tagLabel, '低风险')
    assert.equal(evaluateProviderScore('AbuseIPDB', '5%').tagLabel, '低风险')
    assert.equal(evaluateProviderScore('AbuseIPDB', '25%').tagLabel, '高风险')
    assert.equal(evaluateProviderScore('AbuseIPDB', '80%').tagLabel, '建议封禁')
    assert.equal(evaluateProviderScore('AbuseIPDB', '80%').category, 'Critical')

    // IPQS: 0 -> 低风险, 80 -> 可疑IP, 86 -> 存在风险, 95 -> 高风险 (Critical)
    assert.equal(evaluateProviderScore('IPQS', 0).tagLabel, '低风险')
    assert.equal(evaluateProviderScore('IPQS', 80).tagLabel, '可疑IP')
    assert.equal(evaluateProviderScore('IPQS', 86).tagLabel, '存在风险')
    assert.equal(evaluateProviderScore('IPQS', 95).tagLabel, '高风险')
    assert.equal(evaluateProviderScore('IPQS', 95).category, 'Critical')

    // DB-IP: Clean/Low -> 低风险, Medium -> 中风险, High -> 高风险
    assert.equal(evaluateProviderScore('DBIP', 'Low').tagLabel, '低风险')
    assert.equal(evaluateProviderScore('DBIP', 'Medium').tagLabel, '中风险')
    assert.equal(evaluateProviderScore('DBIP', 'High').tagLabel, '高风险')

    // With structured classifiedScore from backend
    const customClassified = {
      provider: 'ipapi',
      rawValue: '18.16%',
      numericValue: 18.16,
      unit: 'percent' as const,
      available: true,
      categoryKey: 'Critical' as const,
      categoryLabel: '极高风险',
      rank: 4,
      alertSeverity: 'CRITICAL' as const,
    }
    const evaluatedCustom = evaluateProviderScore('ipapi', '18.16%', customClassified)
    assert.equal(evaluatedCustom.text, '18.16%')
    assert.equal(evaluatedCustom.tagLabel, '极高风险')
    assert.equal(evaluatedCustom.category, 'Critical')
  })
})

describe('IPQA protocol-specific overview selectors', () => {
  it('does not leak IPv6 or aggregate media data into an IPv4 view', () => {
    const node = {
      uuid: 'dual',
      name: 'Dual Stack',
      status: 'pending_today',
      latest_date: '2026-09-25',
      has_ipv4: true,
      has_ipv6: true,
      highest_risk: { category: 'Low', source: 'IPQS' },
      media_summary: { Netflix: { unlocked: true, region: 'US' } },
      ai_summary: { ChatGPT: { unlocked: true, region: 'US' } },
      changes_today: 0,
      v4: {
        scores: {},
        media: {},
        ai: {},
      },
      v6: {
        scores: {},
        media: { Netflix: { unlocked: true, region: 'US' } },
        ai: { ChatGPT: { unlocked: true, region: 'US' } },
      },
    } as any

    const v4Netflix = findProtocolOverviewService(node, 'v4', ['Netflix'], 'media')
    const v6Netflix = findProtocolOverviewService(node, 'v6', ['Netflix'], 'media')
    const v4ChatGpt = findProtocolOverviewService(node, 'v4', ['ChatGPT'], 'ai')

    assert.equal(v4Netflix.available, false)
    assert.equal(v6Netflix.available, true)
    assert.equal(v6Netflix.unlocked, true)
    assert.equal(v4ChatGpt.available, false)
  })
})
