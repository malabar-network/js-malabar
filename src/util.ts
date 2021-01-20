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

export function ethereumAddressToBuffer(address: string) {
  if (address.substring(0, 2) === '0x') {
    return Buffer.from(address.substring(2), 'hex')
  }

  return Buffer.from(address, 'hex')
}

export function pluralize(count: number, word: string) {
  return `${word}${count === 1 ? '' : 's'}`
}

export function pluralizeWithCount(count: number, word: string) {
  return `${count} ${pluralize(count, word)}`
}
