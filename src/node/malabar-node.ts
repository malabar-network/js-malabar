import BufferList from 'bl'
import { Signer } from 'ethers'
import { EventEmitter } from 'events'
import pipe from 'it-pipe'
import libp2p, { Connection, MuxedStream } from 'libp2p'
import BOOSTRAP from 'libp2p-bootstrap'
import DHT from 'libp2p-kad-dht'
import MPLEX from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import TCP from 'libp2p-tcp'
import PeerId from 'peer-id'
import { bufferToMessage, Message, messageToBuffer } from '../message'
import {
  bufferToRouteMessage,
  RouteMessage,
  routeMessageToBuffer,
} from '../route-message'
import { BootstrapNodeConfig } from './bootstrap-node'

interface Libp2pRequest {
  stream: MuxedStream
  connection: Connection
}

const PROTOCOL_MALABAR_ROUTE = '/malabar/route/0.1.0'
const PROTOCOL_MALABAR_MESSAGE = '/malabar/message/0.1.0'

export type NodeConfig = BootstrapNodeConfig & {
  bootstrapAddresses: string[]
  signer: Signer
}

interface MalabarNodeEvents {
  ready: () => void
  connection: (remoteAddress: string) => void
  messageTransport: (remotePeer: PeerId) => void
}

// From https://stackoverflow.com/a/61609010
export interface MalabarNode {
  on<U extends keyof MalabarNodeEvents>(
    event: U,
    listener: MalabarNodeEvents[U]
  ): this

  emit<U extends keyof MalabarNodeEvents>(
    event: U,
    ...args: Parameters<MalabarNodeEvents[U]>
  ): boolean
}

// Can't be named Node, because that is a type in the browser
export class MalabarNode extends EventEmitter {
  private node: libp2p
  private ready = false
  private signer: Signer
  /** Message Id --> Origin Peer Id */
  private origins: Map<string, PeerId> = new Map()

  private constructor(node: libp2p, signer: Signer) {
    super()

    this.node = node
    this.signer = signer

    node.handle(PROTOCOL_MALABAR_MESSAGE, this.messageRequestHandler.bind(this))
    node.handle(
      PROTOCOL_MALABAR_ROUTE,
      this.routeMessageRequestHandler.bind(this)
    )

    node.connectionManager.on('peer:connect', this.connectionHandler.bind(this))
  }

  // We have to construct the class using a static method
  // as a contructor can not be asycronous at the moment
  static async new(config: NodeConfig): Promise<MalabarNode> {
    const peerId = await PeerId.create()

    const node = await libp2p.create({
      modules: {
        transport: [TCP as any],
        connEncryption: [NOISE],
        streamMuxer: [MPLEX as any],
        dht: DHT,
        peerDiscovery: [BOOSTRAP],
      } as any,
      addresses: { listen: config.listenAddresses },
      peerId,
      config: {
        dht: {
          kBucketSize: 20,
          enabled: true,
          randomWalk: {
            enabled: true,
            interval: 300e3, // 300 secondss
            timeout: 10e3, // 10 seconds,
            delay: 10e3, // 10 seconds
          },
        },
        peerDiscovery: {
          bootstrap: {
            interval: 60e3, // 60 seconds
            enabled: true,
            list: config.bootstrapAddresses,
          },
        } as any,
      },
    })

    return new MalabarNode(node, config.signer)
  }

  /**
   * Starts the node
   * @returns multiaddress that the node is listening on
   */
  async start(): Promise<string> {
    await this.node.start()
    return (
      this.node.multiaddrs[0].toString() +
      '/p2p/' +
      this.node.peerId.toB58String()
    )
  }

  /**
   * Send a message
   * @param msg the message
   * @param exclude peer ids not to send message to
   */
  async sendMessage(msg: Message, exclude: PeerId[] = []) {
    const buffer = messageToBuffer(msg)

    this.getAllMalabarConnections()
      .filter(
        (connection) =>
          !exclude.some((peer) => connection.remotePeer.equals(peer))
      )
      .forEach(async (connection) => {
        if (Math.random() > 0.25) {
          return
        }

        try {
          const { stream } = await this.node.dialProtocol(
            connection.remoteAddr,
            PROTOCOL_MALABAR_MESSAGE
          )

          pipe([buffer], stream)
        } catch (e) {
          // The peer node may not support the malabar protocol
          // We can ignore the error
        }
      })
  }

  /**
   * Gets the Ethereum address of the node
   * @returns string representation of address
   */
  async getAddress(): Promise<string> {
    return await this.signer.getAddress()
  }

  /**
   * Gets the base-58 representation of the peer id
   */
  getPeerId(): string {
    return this.node.peerId.toB58String()
  }

  /**
   * Get this node's peers
   * @returns array of the base-58 encoded peer ids
   */
  getPeers(): string[] {
    return Array.from(this.node.connections.keys())
  }

  /**
   * Whether or not the node has peers other than the bootstrap node
   */
  isReady(): boolean {
    return this.ready
  }

  async sendRouteMessage(msg: RouteMessage, exclude: PeerId[] = []) {
    const data = routeMessageToBuffer(msg)

    this.getAllMalabarConnections().filter(
      (connection) =>
        !exclude.some((peer) => connection.remotePeer.equals(peer))
    )
  }

  /**
   * Get peers that support the Malabar protocol
   */
  private getAllMalabarConnections(): Connection[] {
    return Array.from(this.node.connections.entries())
      .map(([_, connections]) => connections)
      .flat()
      .filter((connection) =>
        connection.remoteAddr.protoNames().includes('p2p')
      )
  }

  private async connectionHandler(connection: Connection) {
    this.emit('connection', connection.remoteAddr.toString())

    if (!this.ready && this.node.connections.size > 0) {
      this.ready = true

      this.emit('ready')
    }
  }

  /**
   * Malabar Messages
   * Protocol: /malabar/message/x.x.x
   */

  /**
   * Handles an incoming message
   */
  private async messageRequestHandler({ stream, connection }: Libp2pRequest) {
    pipe(stream, async (source) => {
      for await (const data of source) {
        if (data instanceof BufferList) {
          this.handleMessage(bufferToMessage(data), connection)
        } else {
          const list = new BufferList()
          list.append(data as Buffer)
          this.handleMessage(bufferToMessage(list), connection)
        }
      }
    })
  }

  private async handleMessage(msg: Message, connection: Connection) {
    if (this.origins.has(msg.messageId.toString('hex'))) {
      return
    }

    this.emit('messageTransport', connection.remotePeer)

    this.origins.set(msg.messageId.toString('hex'), connection.remotePeer)
    await this.sendMessage(msg, [connection.remotePeer])
  }

  /**
   * Malabar Route Finding
   * Protocol: /malabar/route/x.x.x
   */

  /**
   * Handles an incoming message
   */
  private async routeMessageRequestHandler({
    stream,
    connection,
  }: Libp2pRequest) {
    pipe(stream, async (source) => {
      for await (const data of source) {
        if (data instanceof BufferList) {
          this.handleRouteMessage(bufferToRouteMessage(data), connection)
        } else {
          const list = new BufferList()
          list.append(data as Buffer)
          this.handleRouteMessage(bufferToRouteMessage(list), connection)
        }
      }
    })
  }

  private async handleRouteMessage(msg: RouteMessage, connection: Connection) {
    console.log('Received route message')
  }
}
