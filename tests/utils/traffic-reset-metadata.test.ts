import assert from 'node:assert'
import type { NodeData } from '../../src/stores/nodes'
import { getNodeTagDisplay } from '../../src/utils/nodeHelpers'
import { formatTrafficResetDisplay, isValidTimeZone, parseTrafficResetMetadata } from '../../src/utils/trafficResetMetadata'

// 1. Parser tests
{
  // Basic TRD with default fallback timezone
  const res1 = parseTrafficResetMetadata('<TRD:27>')
  assert.strictEqual(res1.resetDay, 27)
  assert.strictEqual(res1.resetTimezone, 'Asia/Shanghai')
  assert.strictEqual(res1.isFallbackTimezone, true)
  assert.strictEqual(res1.hasExplicitTimezone, false)

  // TRD with explicit timezone
  const res2 = parseTrafficResetMetadata('<TRD:27> <TRTZ:America/New_York>')
  assert.strictEqual(res2.resetDay, 27)
  assert.strictEqual(res2.resetTimezone, 'America/New_York')
  assert.strictEqual(res2.isFallbackTimezone, false)
  assert.strictEqual(res2.hasExplicitTimezone, true)

  // Compact spacing
  const res3 = parseTrafficResetMetadata('<TRD:1><TRTZ:Asia/Singapore>')
  assert.strictEqual(res3.resetDay, 1)
  assert.strictEqual(res3.resetTimezone, 'Asia/Singapore')
  assert.strictEqual(res3.isFallbackTimezone, false)
  assert.strictEqual(res3.hasExplicitTimezone, true)

  // Maximum valid day (31)
  const res4 = parseTrafficResetMetadata('<TRD:31>')
  assert.strictEqual(res4.resetDay, 31)

  // Out-of-bounds days
  const resZero = parseTrafficResetMetadata('<TRD:0>')
  assert.strictEqual(resZero.resetDay, null)

  const resOver = parseTrafficResetMetadata('<TRD:32>')
  assert.strictEqual(resOver.resetDay, null)

  // Invalid timezone
  const resInvalidTz = parseTrafficResetMetadata('<TRD:15> <TRTZ:Moon/Base>')
  assert.strictEqual(resInvalidTz.resetDay, 15)
  assert.strictEqual(resInvalidTz.resetTimezone, 'Asia/Shanghai')
  assert.strictEqual(resInvalidTz.isFallbackTimezone, true)
  assert.strictEqual(resInvalidTz.hasExplicitTimezone, false)

  // isValidTimeZone helper
  assert.strictEqual(isValidTimeZone('America/New_York'), true)
  assert.strictEqual(isValidTimeZone('Asia/Shanghai'), true)
  assert.strictEqual(isValidTimeZone('UTC'), true)
  assert.strictEqual(isValidTimeZone('Moon/Base'), false)
  assert.strictEqual(isValidTimeZone(''), false)
}

// 2. Formatter tests
{
  const metaExplicit = parseTrafficResetMetadata('<TRD:27> <TRTZ:America/New_York>')
  assert.strictEqual(
    formatTrafficResetDisplay(metaExplicit, 'zh-CN'),
    '流量重置日：27 · 重置时区：America/New_York',
  )
  assert.strictEqual(
    formatTrafficResetDisplay(metaExplicit, 'en-US'),
    'Traffic reset: Day 27 · Timezone: America/New_York',
  )

  const metaFallback = parseTrafficResetMetadata('<TRD:18>')
  assert.strictEqual(
    formatTrafficResetDisplay(metaFallback, 'zh-CN'),
    '流量重置日：18 · 重置时区：Asia/Shanghai（默认）',
  )
  assert.strictEqual(
    formatTrafficResetDisplay(metaFallback, 'en-US'),
    'Traffic reset: Day 18 · Timezone: Asia/Shanghai (default)',
  )

  const metaInvalid = parseTrafficResetMetadata('no tags')
  assert.strictEqual(formatTrafficResetDisplay(metaInvalid, 'zh-CN'), null)
}

// 3. Node tag display & filtering tests
{
  function makeMockNode(tags: string): NodeData {
    return {
      uuid: 'test-uuid-1',
      name: 'Test Node',
      tags,
      online: true,
      load: 0,
      load5: 0,
      load15: 0,
    } as unknown as NodeData
  }

  // Semicolon separated with mixed custom tags
  const node1 = makeMockNode('Premium;<TRD:27> <TRTZ:America/New_York>;白嫖中')
  const display1 = getNodeTagDisplay(node1, 'zh-CN')
  assert.deepStrictEqual(display1.customTags, ['Premium', '白嫖中'])
  assert.strictEqual(display1.trafficResetTag, '流量重置日：27 · 重置时区：America/New_York')
  assert.strictEqual(display1.trafficResetTooltip, null)

  // Single TRD with fallback
  const node2 = makeMockNode('HK-BGP;<TRD:18>')
  const display2 = getNodeTagDisplay(node2, 'zh-CN')
  assert.deepStrictEqual(display2.customTags, ['HK-BGP'])
  assert.strictEqual(display2.trafficResetTag, '流量重置日：18 · 重置时区：Asia/Shanghai（默认）')
  assert.ok(display2.trafficResetTooltip?.includes('Asia/Shanghai'))

  // Incomplete metadata: TRTZ without TRD must not be silently consumed
  const node3 = makeMockNode('<TRTZ:America/New_York>')
  const display3 = getNodeTagDisplay(node3, 'zh-CN')
  assert.strictEqual(display3.trafficResetTag, null)
  assert.deepStrictEqual(display3.customTags, ['<TRTZ:America/New_York>'])

  // Preservation of multiple other custom tags
  const node4 = makeMockNode('Premium;HongKong;白嫖中;<TRD:22>')
  const display4 = getNodeTagDisplay(node4, 'zh-CN')
  assert.deepStrictEqual(display4.customTags, ['Premium', 'HongKong', '白嫖中'])
  assert.strictEqual(display4.trafficResetTag, '流量重置日：22 · 重置时区：Asia/Shanghai（默认）')
}
