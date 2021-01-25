import BufferList from 'bl'
import crypto from 'crypto'
import { EthereumAddress } from '../ethereum-address'
import { bufferToInt, intToBuffer } from '../util'

export interface NewPayloadMessage {
  to: EthereumAddress
  from: EthereumAddress
  poe: Buffer
  poeNonce: number
  maxGas: number
  body: Buffer
}

export type PayloadMessage = NewPayloadMessage & {
  time: Date
  usedGas: number
  messageId: string
}

export function expandMessage(partialMsg: NewPayloadMessage): PayloadMessage {
  const msg = {
    ...partialMsg,
    time: new Date(),
    usedGas: 0,
  }

  const sha256 = crypto.createHash('sha256')
  sha256.update(msg.from.toBuffer())
  sha256.update(msg.to.toBuffer())
  sha256.update(msg.poe)
  sha256.update(intToBuffer(4, msg.poeNonce))
  sha256.update(intToBuffer(8, Math.floor(msg.time.getTime() / 1000)))
  sha256.update(intToBuffer(32, msg.maxGas))
  sha256.update(msg.body)

  return {
    ...msg,
    messageId: sha256.digest().toString('hex'),
  }
}

export function messageToBuffer(msg: PayloadMessage): BufferList {
  let data = new BufferList()

  // The following order, key names, and sizes are taken from the spec
  data.append(msg.to.toBuffer()) // To - 20 bytes
  data.append(msg.from.toBuffer()) // From - 20 bytes
  data.append(msg.poe) // Proof of Entry - 32 bytes
  data.append(intToBuffer(4, msg.poeNonce)) // Proof of Entry Nonce - 4 bytes
  data.append(intToBuffer(8, Math.floor(msg.time.getTime() / 1000))) // Time - 8 bytes
  data.append(intToBuffer(32, msg.maxGas)) // Maximum Gas - 32 bytes
  data.append(intToBuffer(32, msg.usedGas)) // Used Gas - 32 bytes
  data.append(Buffer.from(msg.messageId, 'hex')) // Message ID - 32 bytes
  data.append(msg.body) // Body - n bytes

  return data
}

export function bufferToMessage(buf: BufferList): PayloadMessage {
  let i = 0

  const to = new EthereumAddress(buf.slice(i, (i += 20))) // To - 20 bytes
  const from = new EthereumAddress(buf.slice(i, (i += 20))) // From - 20 bytes
  const poe = buf.slice(i, (i += 32)) // Proof of Entry - 32 bytes
  const poeNonce = buf.readUInt32BE(i) // Proof of Entry Nonce - 4 bytes
  i += 4
  const time = new Date(bufferToInt(buf.slice(i, (i += 8))) * 1000) // Time - 8 bytes
  const maxGas = bufferToInt(buf.slice(i, (i += 32))) // Maximum Gas - 32 bytes
  const usedGas = bufferToInt(buf.slice(i, (i += 32))) // Used Gas - 32 bytes
  const messageId = buf.slice(i, (i += 32)).toString('hex') // Message ID - 32 bytes
  const body = buf.slice(i) // Body - n bytes

  return { to, from, poe, poeNonce, time, maxGas, usedGas, body, messageId }
}
