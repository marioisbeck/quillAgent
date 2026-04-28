import crypto from 'node:crypto';

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return [
    'scrypt',
    SCRYPT_COST.toString(10),
    SCRYPT_BLOCK_SIZE.toString(10),
    SCRYPT_PARALLELIZATION.toString(10),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
};

export const verifyPassword = (password: string, encoded: string): boolean => {
  const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] =
    encoded.split('$');

  if (
    algorithm !== 'scrypt' ||
    !rawCost ||
    !rawBlockSize ||
    !rawParallelization ||
    !rawSalt ||
    !rawHash
  ) {
    return false;
  }

  const cost = Number.parseInt(rawCost, 10);
  const blockSize = Number.parseInt(rawBlockSize, 10);
  const parallelization = Number.parseInt(rawParallelization, 10);
  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(blockSize) ||
    !Number.isFinite(parallelization)
  ) {
    return false;
  }

  const salt = Buffer.from(rawSalt, 'base64url');
  const expected = Buffer.from(rawHash, 'base64url');
  const derived = crypto.scryptSync(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });

  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  );
};
