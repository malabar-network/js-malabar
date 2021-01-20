import crypto from 'crypto'
import { ethereumAddressToBuffer } from './util'

const CURRENT_DIFFICULTY = 1

/**
 * Calculates a proof of entry for a given address
 * @param address the Ethereum address
 * @param difficulty number of leading zero-bytes needed
 * @returns 256 bit long buffer
 */
export function solveProofOfEntry(
  address: string
): { poe: Buffer; nonce: number } {
  const addressBuffer = ethereumAddressToBuffer(address)

  for (let nonce = 0; ; nonce++) {
    const poe = hashProofOfEntry(nonce, addressBuffer)
    if (verifyProofOfEntryDifficulty(poe)) {
      return { poe, nonce }
    }
  }
}

/**
 * Verifies a given proof of entry against an Ethereum address
 * @param poe 256 bit proof of entry buffer
 * @param address Ethereum address
 * @param nonce
 */
export function verifyProofOfEntry(
  poe: Buffer,
  address: string,
  nonce: number
): boolean {
  const addressBuffer = ethereumAddressToBuffer(address)
  const poeCheck = hashProofOfEntry(nonce, addressBuffer)

  return poeCheck.equals(poe) && verifyProofOfEntryDifficulty(poe)
}

function verifyProofOfEntryDifficulty(poe: Buffer): boolean {
  let zeroes = 0
  for (const byte of poe) {
    if (byte !== 0) {
      break
    }

    zeroes++
  }

  return zeroes >= CURRENT_DIFFICULTY
}

function hashProofOfEntry(nonce: number, addressBuffer: Buffer): Buffer {
  return crypto
    .createHash('sha256')
    .update(bufferFromNonce(nonce))
    .update(addressBuffer)
    .digest()
}

function bufferFromNonce(nonce: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeDoubleBE(nonce)

  return buffer
}
