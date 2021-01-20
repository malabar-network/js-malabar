import BufferList from 'bl'
import { bufferToInt, ethereumAddressToBuffer, intToBuffer } from './util'

export interface TransportNode {
  address: string
  gasUsed: number
}

export interface RouteMessage {
  messageId: string
  to: string
  from: string
  gasLimit: number
  gasUsed: number
  messageSize: number
  transportNodes: TransportNode[]
}

export function bufferToRouteMessage(data: BufferList): RouteMessage {
  let i = 0

  const messageId = data.slice(i, (i += 32)).toString('hex') // Message Id - 32 bytes
  const to = data.slice(i, (i += 20)).toString('hex') // To - 20 bytes
  const from = data.slice(i, (i += 20)).toString('hex') // From - 20 bytes
  const gasLimit = bufferToInt(data.slice(i, (i += 32))) // Gas Limit - 32 bytes
  const gasUsed = bufferToInt(data.slice(i, (i += 32))) // Used Gas - 32 bytes
  const messageSize = bufferToInt(data.slice(i, (i += 32))) // Message Size (bytes) - 32 bytes

  let transportNodes: TransportNode[] = []
  while (i < data.length) {
    const address = data.slice(i, (i += 20)).toString('hex') // Address - 20 bytes
    const gasUsed = bufferToInt(data.slice(i, (i += 32))) // Gas Used - 32 bytes

    transportNodes.push({ address, gasUsed })
  }

  return {
    messageId,
    to,
    from,
    gasLimit,
    gasUsed,
    messageSize,
    transportNodes,
  }
}

export function routeMessageToBuffer(msg: RouteMessage): BufferList {
  let data = new BufferList()

  data.append(Buffer.from(msg.messageId, 'hex')) // Message ID - 32 bytes
  data.append(ethereumAddressToBuffer(msg.to)) // To - 20 bytes
  data.append(ethereumAddressToBuffer(msg.from)) // From - 20 bytes
  data.append(intToBuffer(32, msg.gasLimit)) // Gas Limit - 32 bytes
  data.append(intToBuffer(32, msg.gasUsed)) // Gas Used - 32 bytes
  data.append(intToBuffer(32, msg.messageSize)) // Message Size - 32 bytes

  for (const { address, gasUsed } of msg.transportNodes) {
    data.append(ethereumAddressToBuffer(address)) // Address - 20 bytes
    data.append(intToBuffer(32, gasUsed)) // Gas Used - 32 bytes
  }

  return data
}
