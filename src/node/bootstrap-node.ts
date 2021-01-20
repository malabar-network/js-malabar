import libp2p from 'libp2p'
import DHT from 'libp2p-kad-dht'
import MPLEX from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import TCP from 'libp2p-tcp'
import PeerId from 'peer-id'

export interface BootstrapNodeConfig {
  listenAddresses: string[]
}

export class BootstrapNode {
  private node: libp2p

  private constructor(node: libp2p) {
    this.node = node
  }

  // We have to construct the class using a static method
  // as a contructor can not be asycronous at the moment
  static async new(config: BootstrapNodeConfig): Promise<BootstrapNode> {
    const peerId = await PeerId.create()

    const node = await libp2p.create({
      modules: {
        transport: [TCP as any],
        connEncryption: [NOISE],
        streamMuxer: [MPLEX as any],
        dht: DHT,
      } as any,
      addresses: { listen: config.listenAddresses },
      peerId,
      config: {
        dht: {
          kBucketSize: 20,
          enabled: true,
          randomWalk: {
            enabled: true,
            interval: 300e3, // 300 seconds
            timeout: 10e3, // 10 seconds
          },
        },
      },
    })

    return new BootstrapNode(node)
  }

  /**
   * Starts the bootstrap node
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
   * Gets the base-58 representation of the peer id
   */
  getPeerId(): string {
    return this.node.peerId.toB58String()
  }
}
