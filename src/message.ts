import BufferList from 'bl'
import crypto from 'crypto'
import { bufferToInt, ethereumAddressToBuffer, intToBuffer } from './util'

export interface NewMessage {
  to: string
  from: string
  poe: Buffer
  poeNonce: number
  maxGas: number
  body: Buffer
}

export type Message = NewMessage & {
  time: Date
  usedGas: number
  messageId: Buffer
}

export function expandMessage(partialMsg: NewMessage): Message {
  const msg = {
    ...partialMsg,
    time: new Date(),
    usedGas: 0,
  }

  const sha256 = crypto.createHash('sha256')
  sha256.update(msg.from)
  sha256.update(msg.to)
  sha256.update(msg.poe)
  sha256.update(intToBuffer(4, msg.poeNonce))
  sha256.update(intToBuffer(8, Math.floor(msg.time.getTime() / 1000)))
  sha256.update(intToBuffer(32, msg.maxGas))
  sha256.update(msg.body)

  return {
    ...msg,
    messageId: sha256.digest(),
  }
}

export function messageToBuffer(msg: Message): BufferList {
  let data = new BufferList()

  // The following order, key names, and sizes are taken from the spec
  data.append(ethereumAddressToBuffer(msg.to)) // To - 20 bytes
  data.append(ethereumAddressToBuffer(msg.from)) // From - 20 bytes
  data.append(msg.poe) // Proof of Entry - 32 bytes
  data.append(intToBuffer(4, msg.poeNonce)) // Proof of Entry Nonce - 4 bytes
  data.append(intToBuffer(8, Math.floor(msg.time.getTime() / 1000))) // Time - 8 bytes
  data.append(intToBuffer(32, msg.maxGas)) // Maximum Gas - 32 bytes
  data.append(intToBuffer(32, msg.usedGas)) // Used Gas - 32 bytes
  data.append(msg.messageId) // Message ID - 32 bytes
  data.append(msg.body) // Body - n bytes

  return data
}

export function bufferToMessage(buf: BufferList): Message {
  let i = 0

  const to = buf.slice(i, (i += 20)).toString('hex') // To - 20 bytes
  const from = buf.slice(i, (i += 20)).toString('hex') // From - 20 bytes
  const poe = buf.slice(i, (i += 32)) // Proof of Entry - 32 bytes
  const poeNonce = buf.readUInt32BE(i) // Proof of Entry Nonce - 4 bytes
  i += 4
  const time = new Date(bufferToInt(buf.slice(i, (i += 8))) * 1000) // Time - 8 bytes
  const maxGas = bufferToInt(buf.slice(i, (i += 32))) // Maximum Gas - 32 bytes
  const usedGas = bufferToInt(buf.slice(i, (i += 32))) // Used Gas - 32 bytes
  const messageId = buf.slice(i, (i += 32)) // Message ID - 32 bytes
  const body = buf.slice(i) // Body - n bytes

  return { to, from, poe, poeNonce, time, maxGas, usedGas, body, messageId }
}
