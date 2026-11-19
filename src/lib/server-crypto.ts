// JWT signatures are verified by the backend; browser consumers only decode expiry.
export function createVerify(): never {
  throw new Error('JWT signature verification is server-only.');
}
export function createPublicKey(): never {
  throw new Error('Public key operations are server-only.');
}
