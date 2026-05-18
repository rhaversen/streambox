import type { BridgeMessage } from '@streambox/shared-types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000/ws'

type MessageHandler = (msg: BridgeMessage) => void

class Bridge {
  private ws?: WebSocket
  private handlers = new Set<MessageHandler>()
  private reconnectTimeout?: ReturnType<typeof setTimeout>
  private queue: BridgeMessage[] = []

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      for (const msg of this.queue) this.ws!.send(JSON.stringify(msg))
      this.queue = []
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as BridgeMessage
        for (const h of this.handlers) h(msg)
      } catch {
        // ignore
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimeout = setTimeout(() => this.connect(), 2_000)
    }
  }

  send(msg: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      this.queue.push(msg)
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}

export const bridge = new Bridge()
bridge.connect()
