import Bottleneck from 'bottleneck'
import { Wallet } from 'ethers'
import { EventEmitter } from 'events'
import { NewPayloadMessage } from './message'
import { BootstrapNode, MalabarNode } from './node/index'
import { solveProofOfEntry } from './proof-of-entry'
import { findAsync, pluralizeWithCount } from './util'

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
    this.nodes.forEach((node) => node.on('ready', this.handleReady.bind(this)))

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

  async traceRoute(): Promise<NetworkInfo> {
    const nodes = this.getNetworkInfoNodes()

    const a = this.nodes[0]
    const b = this.nodes[this.nodes.length - 1]

    const [aAddress, bAddress] = await Promise.all([
      a.getEthereumAddress(),
      b.getEthereumAddress(),
    ])

    return new Promise((resolve, reject) => {
      b.on('routeMessages', async (messages) => {
        let links: NetworkInfoLink[] = []

        // Beware, this is far from efficient
        for (const msg of messages) {
          await Promise.all(
            msg.transportNodes.map(async (node, index) => {
              const malabarNode = await findAsync(this.nodes, async (n) =>
                (await n.getEthereumAddress()).equals(node.address)
              )

              if (index === 0) {
                return links.push({
                  source: a.getPeerId(),
                  target: malabarNode.getPeerId(),
                })
              }

              const prevMalabarNode = await findAsync(this.nodes, async (n) =>
                (await n.getEthereumAddress()).equals(
                  msg.transportNodes[index - 1].address
                )
              )

              if (index === msg.transportNodes.length - 1) {
                links.push({
                  source: malabarNode.getPeerId(),
                  target: b.getPeerId(),
                })
              }

              links.push({
                source: prevMalabarNode.getPeerId(),
                target: malabarNode.getPeerId(),
              })
            })
          )
        }

        resolve({ nodes, links })
      })

      a.sendRouteMessage({
        from: aAddress,
        to: bAddress,
        gasLimit: 1e9,
        gasUsed: 0,
        messageId:
          '10c8eee0c9dbe5747ef3eed7bfd61de35bf4c6dd16c8df2986737881f762af40',
        messageSize: 1024,
        ttl: 10,
        transportNodes: [],
      })
    })
  }

  async sendMessage() {
    const a = this.nodes[0]
    const b = this.nodes[this.nodes.length - 1]

    const { poe, nonce: poeNonce } = solveProofOfEntry(
      await a.getEthereumAddress()
    )

    const msg: NewPayloadMessage = {
      to: await b.getEthereumAddress(),
      from: await a.getEthereumAddress(),
      body: Buffer.from('Hello world! '.repeat(10000), 'ascii'),
      maxGas: 1e9,
      poe,
      poeNonce,
    }

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
}
