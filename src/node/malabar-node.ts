import BufferList from 'bl'
import { Signer } from 'ethers'
import { EventEmitter } from 'events'
import pipe from 'it-pipe'
import libp2p, { Connection, MuxedStream } from 'libp2p'
import Bootstrap from 'libp2p-bootstrap'
import KadDHT from 'libp2p-kad-dht'
import Mplex from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import Tcp from 'libp2p-tcp'
import PeerId from 'peer-id'
import { EthereumAddress } from '../ethereum-address'
import {
  bufferToMessage,
  bufferToRouteAckMessage,
  bufferToRouteMessage,
  expandMessage,
  messageToBuffer,
  NewPayloadMessage,
  PayloadMessage,
  RouteAckMessage,
  routeAckMessageToBuffer,
  RouteMessage,
  routeMessageToBuffer,
} from '../message'
import { messageToRouteMessage } from '../util'
import { BaseNodeConfig } from './config'

interface Libp2pRequest {
  stream: MuxedStream
  connection: Connection
}

const PROTOCOL_MALABAR_ROUTE = '/malabar/route/0.1.0'
const PROTOCOL_MALABAR_ROUTE_ACK = '/malabar/route-ack/0.1.0'
const PROTOCOL_MALABAR_PAYLOAD = '/malabar/payload/0.1.0'
const MIN_CONNECTIONS = 5
const ALTERNATIVE_ROUTE_TIMEOUT = 5e3

export type NodeConfig = BaseNodeConfig & {
  bootstrapAddresses: string[]
  signer: Signer
}

interface MalabarNodeEvents {
  ready: () => void
  connection: (remoteAddress: string) => void
  routeMessages: (messages: RouteMessage[]) => void
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
  private routeMessageOrigins: Record<string, PeerId> = {}
  /** Message Id --> Origin Peer Id */
  private routeAckMessageOrigins: Record<string, PeerId> = {}
  /** Message Id -> Array of route messages */
  private routeMessages: Record<string, RouteMessage[]> = {}
  /** Message Id -> PayloadMessage */
  private outgoingMessages: Record<string, PayloadMessage> = {}

  private constructor(node: libp2p, signer: Signer) {
    super()

    this.node = node
    this.signer = signer

    node.handle(
      PROTOCOL_MALABAR_PAYLOAD,
      this.payloadMessageRequestHandler.bind(this)
    )
    node.handle(
      PROTOCOL_MALABAR_ROUTE,
      this.routeMessageRequestHandler.bind(this)
    )
    node.handle(
      PROTOCOL_MALABAR_ROUTE_ACK,
      this.routeAckMessageRequestHandler.bind(this)
    )

    node.connectionManager.on('peer:connect', this.connectionHandler.bind(this))
  }

  // We have to construct the class using a static method
  // as a contructor can not be asycronous at the moment
  static async new(config: NodeConfig): Promise<MalabarNode> {
    const peerId = await PeerId.create()

    const node = await libp2p.create({
      modules: {
        transport: [Tcp as any],
        connEncryption: [NOISE],
        streamMuxer: [Mplex as any],
        dht: KadDHT,
        peerDiscovery: [Bootstrap],
      } as any,
      addresses: { listen: config.listenAddresses },
      peerId,
      config: {
        dht: {
          kBucketSize: 10,
          enabled: true,
          randomWalk: {
            enabled: true,
            interval: 300e3, // 300 seconds
            timeout: 10e3, // 10 seconds,
            delay: 1e3, // 1 seconds
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
   */
  async sendMessage(newMsg: NewPayloadMessage, exclude: PeerId[] = []) {
    const msg = expandMessage(newMsg)
    const routeMsg = messageToRouteMessage(msg)
    this.sendRouteMessage(routeMsg)

    this.outgoingMessages[msg.messageId.toString('hex')] = msg
  }

  /**
   * Gets the Ethereum address of the node
   */
  async getEthereumAddress(): Promise<EthereumAddress> {
    return new EthereumAddress(await this.signer.getAddress())
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

    if (!this.ready && this.node.connections.size >= MIN_CONNECTIONS) {
      this.ready = true

      this.emit('ready')
    }
  }

  private calculateGasUsed(msg: RouteMessage): number {
    return msg.messageSize
  }

  /**
   * Payload Messages
   * Protocol: /malabar/payload/x.x.x
   */

  /**
   * Sends a route acknowledgement message to a single peer
   * @param msg message to send
   * @param peer peer id to send the message to
   */
  async sendPayloadMessage(msg: PayloadMessage, peer: PeerId) {
    const data = messageToBuffer(msg)

    try {
      const { stream } = await this.node.dialProtocol(
        peer,
        PROTOCOL_MALABAR_PAYLOAD
      )

      pipe([data], stream)
    } catch (e) {
      // The peer node may not support the malabar protocol
      // We can ignore the error
    }
  }

  /**
   * Handles an incoming message
   */
  private async payloadMessageRequestHandler({
    stream,
    connection,
  }: Libp2pRequest) {
    pipe(stream, async (source) => {
      for await (const data of source) {
        if (data instanceof BufferList) {
          this.handlePayloadMessage(bufferToMessage(data), connection)
        } else {
          const list = new BufferList()
          list.append(data as Buffer)
          this.handlePayloadMessage(bufferToMessage(list), connection)
        }
      }
    })
  }

  private async handlePayloadMessage(
    msg: PayloadMessage,
    connection: Connection
  ) {
    if (msg.to.equals(await this.getEthereumAddress())) {
      console.log(msg.body.toString('ascii'))
      return
    }

    const messageId = msg.messageId.toString('hex')

    await this.sendPayloadMessage(msg, this.routeAckMessageOrigins[messageId])
    delete this.routeAckMessageOrigins[messageId]
  }

  /**
   * Route Messages
   * Protocol: /malabar/route/x.x.x
   */

  /**
   * Sends a route message to all peers
   * @param msg route message to send
   * @param exclude peers who should not be send the message
   */
  sendRouteMessage(msg: RouteMessage, exclude: PeerId[] = []) {
    const data = routeMessageToBuffer(msg)

    this.getAllMalabarConnections()
      .filter(
        (connection) =>
          !exclude.some((peer) => connection.remotePeer.equals(peer))
      )
      .forEach(async (connection) => {
        try {
          const { stream } = await this.node.dialProtocol(
            connection.remotePeer,
            PROTOCOL_MALABAR_ROUTE
          )

          pipe([data], stream)
        } catch (e) {
          // The peer node may not support the malabar protocol
          // We can ignore the error
        }
      })
  }

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
    if (msg.to.equals(await this.getEthereumAddress())) {
      if (!this.routeMessages[msg.messageId]) {
        this.routeMessages[msg.messageId] = []
      }

      this.routeMessages[msg.messageId].push(msg)
      const originalLength = this.routeMessages[msg.messageId].length

      setTimeout(() => {
        if (this.routeMessages[msg.messageId].length !== originalLength) return

        const routeMessages = [...this.routeMessages[msg.messageId]]
        delete this.routeMessages[msg.messageId]

        this.handleRouteMessagesGroup(routeMessages)
      }, ALTERNATIVE_ROUTE_TIMEOUT)
    } else {
      if (Object.keys(this.routeMessageOrigins).includes(msg.messageId)) {
        return
      }

      const gasUsed = this.calculateGasUsed(msg)
      msg.gasUsed += gasUsed

      if (msg.gasUsed > msg.gasLimit) {
        return
      }

      msg.transportNodes.push({
        gasUsed,
        address: new EthereumAddress(await this.signer.getAddress()),
      })
    }

    this.routeMessageOrigins[msg.messageId] = connection.remotePeer

    msg.ttl--
    if (msg.ttl === 0) return

    this.sendRouteMessage(msg, [connection.remotePeer])
  }

  private async handleRouteMessagesGroup(messages: RouteMessage[]) {
    this.emit('routeMessages', messages)

    const messageId = messages[0].messageId
    const cheapestMessage = messages.sort((a, b) => a.gasUsed - b.gasUsed)[0]

    await this.sendRouteAckMessage(
      {
        messageId,
        transportNodes: cheapestMessage.transportNodes,
      },
      this.routeMessageOrigins[messageId]
    )
  }

  /**
   * Route Acknowledgement Messages
   * Protocol: /malabar/route-ack/x.x.x
   */

  /**
   * Sends a route acknowledgement message to a single peer
   * @param msg message to send
   * @param peer peer id to send the message to
   */
  async sendRouteAckMessage(msg: RouteAckMessage, peer: PeerId) {
    const data = routeAckMessageToBuffer(msg)

    try {
      const { stream } = await this.node.dialProtocol(
        peer,
        PROTOCOL_MALABAR_ROUTE_ACK
      )

      pipe([data], stream)
    } catch (e) {
      // The peer node may not support the malabar protocol
      // We can ignore the error
    }
  }

  /**
   * Handles an incoming message
   */
  private async routeAckMessageRequestHandler({
    stream,
    connection,
  }: Libp2pRequest) {
    pipe(stream, async (source) => {
      for await (const data of source) {
        if (data instanceof BufferList) {
          this.handleRouteAckMessage(bufferToRouteAckMessage(data), connection)
        } else {
          const list = new BufferList()
          list.append(data as Buffer)
          this.handleRouteAckMessage(bufferToRouteAckMessage(list), connection)
        }
      }
    })
  }

  private async handleRouteAckMessage(
    msg: RouteAckMessage,
    connection: Connection
  ) {
    if (Object.keys(this.outgoingMessages).includes(msg.messageId)) {
      this.sendPayloadMessage(
        this.outgoingMessages[msg.messageId],
        connection.remotePeer
      )

      delete this.outgoingMessages[msg.messageId]
      // TODO: obscure that this was the sender node, perhaps forward the ACK to a random peer?
      return
    }

    this.routeAckMessageOrigins[msg.messageId] = connection.remotePeer
    this.sendRouteAckMessage(msg, this.routeMessageOrigins[msg.messageId])
    delete this.routeMessageOrigins[msg.messageId]
  }
}
