import { Publisher } from 'zeromq'
import { EventEmitter } from 'events'
import os from 'os'
import {
  getZmqSocketPath,
  ensureZmqSocketDirectory,
  type ZmqSocketOptions,
} from './zmq-socket.js'
import type { TmuxEventWithOptionalData } from './events.js'

export type { TmuxEventWithOptionalData } from './events.js'

export interface EventSource {
  script: string
  sessionId?: string
  sessionName?: string
  socketPath?: string
  pid: number
  hostname: string
}

export class ZmqEventPublisher {
  private publisher: Publisher | null = null
  private isConnected = false
  private eventQueue: TmuxEventWithOptionalData[] = []
  private socketPath: string

  constructor(socketOptions: ZmqSocketOptions = {}) {
    this.socketPath = getZmqSocketPath(socketOptions)
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return
    }

    try {
      await ensureZmqSocketDirectory()

      this.publisher = new Publisher()
      this.publisher.linger = 1000
      await this.publisher.connect(this.socketPath)

      await new Promise(resolve => setTimeout(resolve, 100))

      this.isConnected = true

      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()
        if (event) {
          await this.publishEvent(event)
        }
      }
    } catch (error) {
      console.error('[ZMQ] Failed to connect publisher:', error)
      throw error
    }
  }

  async publishEvent(event: TmuxEventWithOptionalData): Promise<void> {
    if (!this.isConnected || !this.publisher) {
      this.eventQueue.push(event)
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('[ZMQ] Failed to connect during publish:', error)
        })
      }
      return
    }

    try {
      const message = JSON.stringify(event)
      await this.publisher.send(message)
    } catch (error) {
      console.error('[ZMQ] Failed to publish event:', error)
      this.eventQueue.push(event)
    }
  }

  async disconnect(): Promise<void> {
    if (this.publisher) {
      try {
        await this.publisher.close()
      } catch (error) {
        console.error('[ZMQ] Error during disconnect:', error)
      }
      this.publisher = null
      this.isConnected = false
    }
  }
}

const publisherInstances = new Map<string, ZmqEventPublisher>()

export function getZmqPublisher(
  socketOptions: ZmqSocketOptions = {},
): ZmqEventPublisher {
  const socketPath = getZmqSocketPath(socketOptions)

  let publisher = publisherInstances.get(socketPath)
  if (!publisher) {
    publisher = new ZmqEventPublisher(socketOptions)
    publisherInstances.set(socketPath, publisher)
  }

  return publisher
}

export async function shutdownZmqPublisher(): Promise<void> {
  for (const publisher of publisherInstances.values()) {
    await publisher.disconnect()
  }
  publisherInstances.clear()
}

export interface ZmqPublishingOptions extends ZmqSocketOptions {
  zmq?: boolean
  source?: Partial<EventSource>
}

export async function enableZmqPublishing(
  emitter: EventEmitter,
  options: ZmqPublishingOptions = {},
): Promise<void> {
  if (options.zmq === false) {
    return
  }

  const publisher = getZmqPublisher({
    socketName: options.socketName,
    socketPath: options.socketPath,
  })

  try {
    await publisher.connect()
  } catch (error) {
    console.error('[ZMQ] Failed to initialize publisher:', error)
  }

  const source: EventSource = {
    script: options.source?.script || 'unknown',
    sessionId: options.source?.sessionId,
    sessionName: options.source?.sessionName,
    socketPath: options.source?.socketPath,
    pid: process.pid,
    hostname: os.hostname(),
  }

  emitter.on('event', async (event: TmuxEventWithOptionalData) => {
    try {
      const eventWithSource: TmuxEventWithOptionalData = {
        ...event,
        source,
      }
      await publisher.publishEvent(eventWithSource)
    } catch (error) {
      console.error('[ZMQ] Failed to publish event:', error)
    }
  })

  const cleanupHandler = async () => {
    await shutdownZmqPublisher()
  }

  process.once('SIGINT', cleanupHandler)
  process.once('SIGTERM', cleanupHandler)
  process.once('exit', cleanupHandler)
}
