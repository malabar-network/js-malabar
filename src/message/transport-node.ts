import BufferList from 'bl'
import { EthereumAddress } from '../ethereum-address'
import { bufferToInt, intToBuffer } from '../util'

export interface TransportNode {
  address: EthereumAddress
  gasUsed: number
}

export function bufferToTransportNodes(data: Buffer): TransportNode[] {
  let i = 0
  let nodes: TransportNode[] = []
  while (i < data.length) {
    const address = new EthereumAddress(data.slice(i, (i += 20))) // Address - 20 bytes
    const gasUsed = bufferToInt(data.slice(i, (i += 32))) // Gas Used - 32 bytes

    nodes.push({ address, gasUsed })
  }

  return nodes
}

export function transportNodesToBuffer(nodes: TransportNode[]): BufferList {
  let data = new BufferList()

  for (const { address, gasUsed } of nodes) {
    data.append(address.toBuffer()) // Address - 20 bytes
    data.append(intToBuffer(32, gasUsed)) // Gas Used - 32 bytes
  }

  return data
}
