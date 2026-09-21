import type { NodeData } from '../../src/stores/nodes.ts'
import type { ExchangeRates } from '../../src/utils/financeHelper.ts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  billingCycleToMonths,
  buildRenewalTimeline,
  calculateCostRenewalSummary,
  convertCurrencyToCny,
  filterRenewalNodes,
  normalizeNodeCost,
} from '../../src/features/cost-renewal/calculations'
import { DEFAULT_EXCHANGE_RATES } from '../../src/utils/financeHelper'

describe('cost-renewal calculations', () => {
  const mockRates: ExchangeRates = {
    ...DEFAULT_EXCHANGE_RATES,
    CNY: 1,
    USD: 0.14, // 1 CNY = 0.14 USD, so 1 USD = 1/0.14 CNY (~7.14)
    EUR: 0.13,
    JPY: 20,
  }

  describe('billingCycleToMonths', () => {
    it('correctly maps standard billing cycles to months', () => {
      assert.equal(billingCycleToMonths(30), 1)
      assert.equal(billingCycleToMonths(31), 1)
      assert.equal(billingCycleToMonths(90), 3)
      assert.equal(billingCycleToMonths(180), 6)
      assert.equal(billingCycleToMonths(365), 12)
      assert.equal(billingCycleToMonths(730), 24)
      assert.equal(billingCycleToMonths(1095), 36)
      assert.equal(billingCycleToMonths(1825), 60)
    })

    it('handles custom days > 0 as days / 30', () => {
      assert.equal(billingCycleToMonths(60), 2)
      assert.equal(billingCycleToMonths(15), 0.5)
    })

    it('returns null for invalid, negative or zero cycles', () => {
      assert.equal(billingCycleToMonths(0), null)
      assert.equal(billingCycleToMonths(-1), null)
      assert.equal(billingCycleToMonths(null), null)
      assert.equal(billingCycleToMonths(undefined), null)
    })
  })

  describe('convertCurrencyToCny', () => {
    it('returns original amount for CNY', () => {
      assert.equal(convertCurrencyToCny(100, 'CNY', mockRates), 100)
    })

    it('converts foreign currencies to CNY using exchange rates', () => {
      assert.ok(Math.abs((convertCurrencyToCny(14, 'USD', mockRates) ?? 0) - 100) < 1e-6)
      assert.ok(Math.abs((convertCurrencyToCny(200, 'JPY', mockRates) ?? 0) - 10) < 1e-6)
    })

    it('handles 0 and free', () => {
      assert.equal(convertCurrencyToCny(0, 'USD', mockRates), 0)
    })

    it('returns null for invalid amounts or unknown currencies', () => {
      assert.equal(convertCurrencyToCny(-5, 'USD', mockRates), null)
      assert.equal(convertCurrencyToCny(null, 'USD', mockRates), null)
    })
  })

  describe('normalizeNodeCost', () => {
    it('normalizes a standard priced monthly node', () => {
      const node = {
        uuid: 'n1',
        name: 'Node 1',
        price: 14,
        currency: 'USD',
        billing_cycle: 30,
        expired_at: '2026-10-01 00:00:00',
        auto_renewal: true,
      } as NodeData

      const res = normalizeNodeCost(node, mockRates)
      assert.equal(res.uuid, 'n1')
      assert.equal(res.originalAmount, 14)
      assert.equal(res.originalCurrency, 'USD')
      assert.equal(res.billingMonths, 1)
      assert.ok(Math.abs((res.renewalAmountCny ?? 0) - 100) < 1e-6)
      assert.ok(Math.abs((res.monthlyCny ?? 0) - 100) < 1e-6)
      assert.ok(Math.abs((res.annualizedCny ?? 0) - 1200) < 1e-6)
      assert.equal(res.autoRenewal, true)
      assert.equal(res.isFree, false)
    })

    it('normalizes an annual node correctly', () => {
      const node = {
        uuid: 'n2',
        name: 'Node 2',
        price: 1200,
        currency: 'CNY',
        billing_cycle: 365,
        expired_at: '2027-01-01',
      } as NodeData

      const res = normalizeNodeCost(node, mockRates)
      assert.equal(res.billingMonths, 12)
      assert.equal(res.renewalAmountCny, 1200)
      assert.equal(res.monthlyCny, 100)
      assert.equal(res.annualizedCny, 1200)
    })

    it('identifies free nodes via tag or price 0 / -1', () => {
      const freeTagNode = {
        uuid: 'free1',
        name: 'Free 1',
        price: 99,
        tags: '白嫖中;测试',
      } as NodeData

      const freeZeroNode = {
        uuid: 'free2',
        name: 'Free 2',
        price: 0,
      } as NodeData

      assert.equal(normalizeNodeCost(freeTagNode, mockRates).isFree, true)
      assert.equal(normalizeNodeCost(freeTagNode, mockRates).monthlyCny, 0)
      assert.equal(normalizeNodeCost(freeZeroNode, mockRates).isFree, true)
      assert.equal(normalizeNodeCost(freeZeroNode, mockRates).monthlyCny, 0)
    })

    it('handles missing price and missing expiry gracefully', () => {
      const noPriceNode = {
        uuid: 'noprice',
        name: 'No Price',
      } as NodeData

      const res = normalizeNodeCost(noPriceNode, mockRates)
      assert.equal(res.monthlyCny, null)
      assert.equal(res.annualizedCny, null)
      assert.equal(res.renewalAmountCny, null)
      assert.equal(res.expiryAt, null)
      assert.equal(res.daysUntilExpiry, null)
      assert.equal(res.expireStatus, 'no_expiry')
    })
  })

  describe('calculateCostRenewalSummary', () => {
    it('aggregates monthly equivalent and upcoming renewal amounts', () => {
      const future10d = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
      const future40d = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString()

      const nodes: NodeData[] = [
        {
          uuid: 'n1',
          name: 'Node 1',
          price: 14,
          currency: 'USD',
          billing_cycle: 30,
          expired_at: future10d,
        } as NodeData,
        {
          uuid: 'n2',
          name: 'Node 2',
          price: 1200,
          currency: 'CNY',
          billing_cycle: 365,
          expired_at: future40d,
        } as NodeData,
        {
          uuid: 'n3',
          name: 'Node 3',
          price: 0,
        } as NodeData,
      ]

      const summary = calculateCostRenewalSummary(nodes, mockRates, 'network', '2026-09-21', 30)

      assert.ok(Math.abs(summary.monthlyCny - 200) < 1e-6)
      assert.ok(Math.abs(summary.annualBudgetCny - 2400) < 1e-6)
      assert.equal(summary.pricedNodeCount, 2)
      assert.equal(summary.totalNodeCount, 3)

      assert.equal(summary.upcomingRenewalCount, 1)
      assert.ok(Math.abs(summary.upcomingRenewalCny - 100) < 1e-6)
    })
  })

  describe('filterRenewalNodes & buildRenewalTimeline', () => {
    const nodes = [
      {
        uuid: 'exp',
        name: 'Expired Node',
        daysUntilExpiry: -5,
        expireStatus: 'expired' as const,
        expiryAt: '2026-09-10',
        renewalAmountCny: 50,
      },
      {
        uuid: 'soon',
        name: 'Soon Node',
        daysUntilExpiry: 3,
        expireStatus: 'critical' as const,
        expiryAt: '2026-09-24',
        renewalAmountCny: 100,
      },
      {
        uuid: 'later',
        name: 'Later Node',
        daysUntilExpiry: 45,
        expireStatus: 'normal' as const,
        expiryAt: '2026-11-05',
        renewalAmountCny: 200,
      },
      {
        uuid: 'noexp',
        name: 'No Expiry Node',
        daysUntilExpiry: null,
        expireStatus: 'no_expiry' as const,
        expiryAt: null,
        renewalAmountCny: null,
      },
    ] as any

    it('filters correctly by filter option', () => {
      assert.equal(filterRenewalNodes(nodes, '7d').length, 1)
      assert.equal(filterRenewalNodes(nodes, '7d')[0].uuid, 'soon')

      assert.equal(filterRenewalNodes(nodes, '30d').length, 1)
      assert.equal(filterRenewalNodes(nodes, '90d').length, 2)
      assert.equal(filterRenewalNodes(nodes, 'expired').length, 1)
      assert.equal(filterRenewalNodes(nodes, 'no_expiry').length, 1)
      assert.equal(filterRenewalNodes(nodes, 'all').length, 4)
    })

    it('sorts timeline with expired first, then ascending by days', () => {
      const timeline = buildRenewalTimeline(nodes, 'all')
      assert.equal(timeline[0].uuid, 'exp')
      assert.equal(timeline[1].uuid, 'soon')
      assert.equal(timeline[2].uuid, 'later')
      assert.equal(timeline[3].uuid, 'noexp')
    })
  })
})
