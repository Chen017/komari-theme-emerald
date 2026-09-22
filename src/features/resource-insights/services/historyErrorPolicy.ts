import { RpcError } from '../../../utils/rpc'

export type HistoryFailureKind = 'timeout' | 'rpc-error' | 'unsupported' | 'aborted' | 'unknown'

export function isRetryableHistoryFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError')
    return false

  if (error instanceof RpcError) {
    // Retry on server temporary internal error or timeout
    return error.code === -32603 || error.code === -32000
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch')
  }

  return false
}

export function classifyHistoryFailure(error: unknown): HistoryFailureKind {
  if (error instanceof DOMException && error.name === 'AbortError')
    return 'aborted'

  if (error instanceof RpcError) {
    if (error.code === -32601)
      return 'unsupported'
    if (error.code === -32602)
      return 'rpc-error'
    return 'rpc-error'
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout'))
      return 'timeout'
    if (msg.includes('unsupported') || msg.includes('not supported'))
      return 'unsupported'
  }

  return 'unknown'
}
