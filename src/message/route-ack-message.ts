import BufferList from 'bl'
import {
  bufferToTransportNodes,
  TransportNode,
  transportNodesToBuffer,
} from './transport-node'

export interface RouteAckMessage {
  messageId: string
  transportNodes: TransportNode[]
}

export function bufferToRouteAckMessage(data: BufferList): RouteAckMessage {
  let i = 0

  const messageId = data.slice(i, (i += 32)).toString('hex') // Message Id - 32 bytes
  const transportNodes = bufferToTransportNodes(data.slice(i)) // Transport Nodes - n bytes

  return {
    messageId,
    transportNodes,
  }
}

export function routeAckMessageToBuffer(msg: RouteAckMessage): BufferList {
  let data = new BufferList()

  data.append(Buffer.from(msg.messageId, 'hex')) // Message ID - 32 bytes
  data.append(transportNodesToBuffer(msg.transportNodes)) // Transport Nodes - n bytes

  return data
}
