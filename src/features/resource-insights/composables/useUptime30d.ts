import type { NodeData } from '@/stores/nodes'
import type { FleetUptime30d } from '../services/uptime'
import { computed, ref, shallowRef, watch } from 'vue'
import { getSharedRpc } from '@/utils/rpc'
import { createHistoryGateway } from '../services/historyGateway'
import { calculateFleet30dUptime } from '../services/uptime'

export interface UseUptime30dOptions {
  nodes: () => readonly NodeData[]
}

export function useUptime30d(options: UseUptime30dOptions) {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const gateway = createHistoryGateway((method, params, opts) => {
    return getSharedRpc().call(method, params, opts)
  })

  const fleetUptime = shallowRef<FleetUptime30d>({
    fleetUptimeRatio: null,
    fleetUptimeText: '--',
    nodes: [],
    totalNodes: 0,
    completeNodes: 0,
    partialNodes: 0,
    unavailableNodes: 0,
  })

  async function fetchUptime() {
    const nodes = options.nodes()
    if (nodes.length === 0) {
      fleetUptime.value = {
        fleetUptimeRatio: null,
        fleetUptimeText: '--',
        nodes: [],
        totalNodes: 0,
        completeNodes: 0,
        partialNodes: 0,
        unavailableNodes: 0,
      }
      return
    }

    loading.value = true
    error.value = null

    try {
      const now = new Date()
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      const end = now.toISOString().slice(0, 19).replace('T', ' ')

      let recordsByNode = {}
      try {
        const res = await gateway.queryLegacyRecords({
          entityIds: nodes.map(n => n.uuid),
          start,
          end,
        }, nodes.map(n => n.uuid))
        recordsByNode = res.records
      }
      catch {
        // Fallback to node's existing uptime counters if historical records RPC is not enabled
      }

      fleetUptime.value = calculateFleet30dUptime(nodes, recordsByNode, now)
    }
    catch (err: any) {
      error.value = err instanceof Error ? err.message : String(err)
      fleetUptime.value = calculateFleet30dUptime(nodes, {}, new Date())
    }
    finally {
      loading.value = false
    }
  }

  watch(() => options.nodes().length, () => {
    void fetchUptime()
  }, { immediate: true })

  return {
    fleetUptime,
    loading,
    error,
    refresh: fetchUptime,
  }
}
