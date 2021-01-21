import BufferList from 'bl'
import { EthereumAddress } from '../ethereum-address'
import { bufferToInt, intToBuffer } from '../util'
import {
  bufferToTransportNodes,
  TransportNode,
  transportNodesToBuffer,
} from './transport-node'

export interface RouteMessage {
  messageId: string
  to: EthereumAddress
  from: EthereumAddress
  gasLimit: number
  gasUsed: number
  messageSize: number
  ttl: number
  transportNodes: TransportNode[]
}

export function bufferToRouteMessage(data: BufferList): RouteMessage {
  let i = 0

  const messageId = data.slice(i, (i += 32)).toString('hex') // Message Id - 32 bytes
  const to = new EthereumAddress(data.slice(i, (i += 20))) // To - 20 bytes
  const from = new EthereumAddress(data.slice(i, (i += 20))) // From - 20 bytes
  const gasLimit = bufferToInt(data.slice(i, (i += 32))) // Gas Limit - 32 bytes
  const gasUsed = bufferToInt(data.slice(i, (i += 32))) // Used Gas - 32 bytes
  const messageSize = bufferToInt(data.slice(i, (i += 32))) // Message Size (bytes) - 32 bytes
  const ttl = bufferToInt(data.slice(i, (i += 2))) // TTL - 2 bytes
  const transportNodes = bufferToTransportNodes(data.slice(i)) // Transport Nodes - n bytes

  return {
    messageId,
    to,
    from,
    gasLimit,
    gasUsed,
    messageSize,
    ttl,
    transportNodes,
  }
}

export function routeMessageToBuffer(msg: RouteMessage): BufferList {
  let data = new BufferList()

  data.append(Buffer.from(msg.messageId, 'hex')) // Message ID - 32 bytes
  data.append(msg.to.toBuffer()) // To - 20 bytes
  data.append(msg.from.toBuffer()) // From - 20 bytes
  data.append(intToBuffer(32, msg.gasLimit)) // Gas Limit - 32 bytes
  data.append(intToBuffer(32, msg.gasUsed)) // Gas Used - 32 bytes
  data.append(intToBuffer(32, msg.messageSize)) // Message Size - 32 bytes
  data.append(intToBuffer(2, msg.ttl)) // TTL - 2 bytes
  data.append(transportNodesToBuffer(msg.transportNodes)) // Transport Nodes - n bytes

  return data
}
