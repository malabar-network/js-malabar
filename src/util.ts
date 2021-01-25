import { PayloadMessage, RouteMessage } from './message'

function splitu256(num: bigint): bigint[] {
  const high = num >> BigInt(128)
  const low = num - (high << BigInt(128))

  const a = high >> BigInt(64)
  const b = high - (a << BigInt(64))
  const c = low >> BigInt(64)
  const d = low - (c << BigInt(64))

  return [a, b, c, d]
}

export function intToBuffer(size: number, int: number | bigint): Buffer {
  let buf = Buffer.alloc(size)

  if (size === 1) {
    buf.writeUInt8(Number(int))
  } else if (size === 2) {
    buf.writeUInt16BE(Number(int))
  } else if (size === 4) {
    buf.writeUInt32BE(Number(int))
  } else if (size === 8) {
    buf.writeBigInt64BE(BigInt(int))
  } else if (size === 32) {
    const [a, b, c, d] = splitu256(BigInt(int))
    buf.writeBigInt64BE(a, 0)
    buf.writeBigInt64BE(b, 8)
    buf.writeBigInt64BE(c, 16)
    buf.writeBigInt64BE(d, 24)
  } else {
    throw new Error('Unexpected size')
  }

  return buf
}

export function bufferToInt(buf: Buffer): number {
  return parseInt(buf.toString('hex'), 16)
}

export function pluralize(count: number, word: string) {
  return `${word}${count === 1 ? '' : 's'}`
}

export function pluralizeWithCount(count: number, word: string) {
  return `${count} ${pluralize(count, word)}`
}

interface FindAsyncPredicate<T> {
  (val: T): Promise<boolean>
}

export async function findAsync<T>(arr: T[], predicate: FindAsyncPredicate<T>) {
  const index = (await Promise.all(arr.map(predicate))).findIndex(Boolean)
  return arr[index]
}

export function messageToRouteMessage(msg: PayloadMessage): RouteMessage {
  return {
    messageId: msg.messageId,
    to: msg.to,
    from: msg.from,
    gasLimit: msg.maxGas,
    gasUsed: 0,
    messageSize: 1000, // TODO: proper message size
    ttl: 10, // TODO: configurable TTL
    transportNodes: [],
  }
}
