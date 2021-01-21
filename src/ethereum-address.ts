export class EthereumAddress {
  private buffer: Buffer

  constructor(buffer: Buffer)
  constructor(address: string)
  constructor(bufferOrString: Buffer | string) {
    if (typeof bufferOrString === 'string') {
      if (bufferOrString.substring(0, 2) === '0x') {
        this.buffer = Buffer.from(bufferOrString.substring(2), 'hex')
      } else {
        this.buffer = Buffer.from(bufferOrString, 'hex')
      }
    } else {
      this.buffer = bufferOrString
    }
  }

  toString(): string {
    return '0x' + this.buffer.toString('hex')
  }

  toJSON(): string {
    return this.toString()
  }

  toBuffer(): Buffer {
    return this.buffer
  }

  equals(b: EthereumAddress): boolean {
    return this.buffer.equals(b.toBuffer())
  }
}
