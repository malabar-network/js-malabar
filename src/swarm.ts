import Bottleneck from 'bottleneck'
import { Wallet } from 'ethers'
import { EventEmitter } from 'events'
import { expandMessage, NewPayloadMessage, PayloadMessage } from './message'
import { BootstrapNode, MalabarNode } from './node/index'
import { solveProofOfEntry } from './proof-of-entry'
import { pluralizeWithCount } from './util'

interface CreateNodesOptions {
  count: number
  concurrent?: number
  logInterval?: number
}

export interface NetworkInfoNode {
  id: string
  label: string
}

export interface NetworkInfoLink {
  source: string
  target: string
}

export interface NetworkInfo {
  nodes: NetworkInfoNode[]
  links: NetworkInfoLink[]
}

interface SwarmEvents {
  ready: () => void
}

// From https://stackoverflow.com/a/61609010
export interface Swarm {
  on<U extends keyof SwarmEvents>(event: U, listener: SwarmEvents[U]): this

  emit<U extends keyof SwarmEvents>(
    event: U,
    ...args: Parameters<SwarmEvents[U]>
  ): boolean
}

export class Swarm extends EventEmitter {
  private bootstrapNode: BootstrapNode
  private bootstrapAddress: string
  private nodes: MalabarNode[] = []
  private readyCount = 0

  private constructor(bootstrapNode: BootstrapNode, bootstrapAddress: string) {
    super()
    this.bootstrapNode = bootstrapNode
    this.bootstrapAddress = bootstrapAddress
  }

  static async new(): Promise<Swarm> {
    const node = await BootstrapNode.new({
      listenAddresses: ['/ip4/127.0.0.1/tcp/102030'],
    })

    return new Swarm(node, await node.start())
  }

  async createNodes({
    count,
    concurrent = 20,
    logInterval = 25,
  }: CreateNodesOptions) {
    const limiter = new Bottleneck({ maxConcurrent: concurrent })

    const msg = `Creating ${pluralizeWithCount(count, 'node')}`
    console.log(msg)

    this.nodes = await Promise.all(
      new Array(count).fill(0).map((_, index) =>
        limiter.schedule(async () => {
          const node = await MalabarNode.new({
            bootstrapAddresses: [this.bootstrapAddress],
            listenAddresses: ['/ip4/0.0.0.0/tcp/0'],
            signer: Wallet.createRandom(),
          })

          if (index % logInterval === 0 && index !== 0) {
            console.log(`${msg} (${((index / count) * 100).toFixed(0)}%)`)
          }

          return node
        })
      )
    )

    // Register ready event handler
    this.nodes.forEach((node) => {
      node.on('ready', this.handleReady.bind(this))
      node.on('message', this.handleMessage.bind(this))
    })

    console.log(`Created ${pluralizeWithCount(count, 'node')}`)
  }

  async startNodes({ concurrent = 20, logInterval = 5 } = {}) {
    const limiter = new Bottleneck({ maxConcurrent: concurrent })

    const msg = `Starting ${pluralizeWithCount(this.nodes.length, 'node')}`
    console.log(msg)

    await Promise.all(
      this.nodes.map((node, index) =>
        limiter.schedule(async () => {
          await node.start()

          if (index % logInterval === 0 && index !== 0) {
            console.log(
              `${msg} (${((index / this.nodes.length) * 100).toFixed(0)}%)`
            )
          }
        })
      )
    )

    console.log(`Started ${pluralizeWithCount(this.nodes.length, 'node')}`)
  }

  getNetworkInfo(): NetworkInfo {
    const nodes = this.getNetworkInfoNodes()

    let links: NetworkInfoLink[] = []
    this.nodes.forEach((node) => {
      const peers = node.getPeers()
      peers.forEach((peer) => {
        links.push({ source: node.getPeerId(), target: peer })
      })
    })

    return { nodes, links }
  }

  async sendMessage(data: Buffer) {
    const a = this.nodes[0]
    const b = this.nodes[this.nodes.length - 1]

    const { poe, nonce: poeNonce } = solveProofOfEntry(
      await a.getEthereumAddress()
    )

    const newMsg: NewPayloadMessage = {
      to: await b.getEthereumAddress(),
      from: await a.getEthereumAddress(),
      body: data,
      maxGas: 1e9,
      poe,
      poeNonce,
    }

    const msg = expandMessage(newMsg)

    a.sendMessage(msg)
  }

  private getNetworkInfoNodes(): NetworkInfoNode[] {
    const regularNodes = this.nodes.map((node, index) => ({
      id: node.getPeerId(),
      label: `Node ${index}`,
    }))

    return [
      ...regularNodes,
      { id: this.bootstrapNode.getPeerId(), label: 'Bootstrap Node' },
    ]
  }

  private handleReady() {
    this.readyCount++

    if (this.readyCount % 10 === 0) {
      console.log(
        `${((this.readyCount / this.nodes.length) * 100).toFixed(
          0
        )}% of nodes ready`
      )
    }

    if (this.readyCount < this.nodes.length) return

    this.emit('ready')
  }

  private handleMessage(msg: PayloadMessage) {
    console.log(msg.body.toString('ascii'))
  }
}
