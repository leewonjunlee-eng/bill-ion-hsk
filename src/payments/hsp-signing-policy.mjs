const domainFields = [
  ['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address'],
];
const authFields = [
  ['from', 'address'], ['to', 'address'], ['value', 'uint256'],
  ['validAfter', 'uint256'], ['validBefore', 'uint256'], ['nonce', 'bytes32'],
];
const primaryType = 'TransferWithAuthorization';
const address = /^0x[0-9a-f]{40}$/i;
const nonce = /^0x[0-9a-f]{64}$/i;
const decimal = /^(0|[1-9][0-9]{0,77})$/;
const chainHex = /^0x[0-9a-f]{1,16}$/i;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const sameAddress = (actual, expected) => matches(address, actual) && actual.toLowerCase() === expected.toLowerCase();
const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));

function insist(condition, reason) {
  if (!condition) throw new Error(reason);
}

function schemaIs(fields, expected) {
  return Array.isArray(fields) && fields.length === expected.length &&
    expected.every(([name, type], i) => exactKeys(fields[i], ['name', 'type']) &&
      fields[i].name === name && fields[i].type === type);
}

// Terms come from a server-approved snapshot and a payer-approved exact quote.
// This function checks the prepared request and returns only the typed data to display/sign.
export function validateHspSigningRequest(prepared, terms, now = Date.now()) {
  const { payer, payee, token, chainId, domainName, domainVersion, atomicAmount, paymentRequestId, validUntil } = terms;
  const deadline = Date.parse(validUntil);
  insist([133, 11155111].includes(chainId) && [payer, payee, token].every((value) => matches(address, value)) &&
    !sameAddress(payer, payee) && typeof domainName === 'string' && domainName.length > 0 &&
    typeof domainVersion === 'string' && domainVersion.length > 0 && matches(decimal, atomicAmount) &&
    BigInt(atomicAmount) > 0n && BigInt(atomicAmount) < (1n << 256n) &&
    typeof paymentRequestId === 'string' && paymentRequestId.length > 0 &&
    Number.isFinite(now) && deadline > now, 'HSP_INVALID_APPROVED_TERMS');

  const typed = prepared?.eip712;
  const domain = typed?.domain;
  const message = typed?.message;
  insist(prepared?.payment_request_id === paymentRequestId &&
    sameAddress(prepared.payer, payer) && sameAddress(prepared.pay_to, payee) &&
    prepared.token_total_raw === atomicAmount, 'HSP_QUOTE_MISMATCH');
  const quoteExpiry = Date.parse(prepared.quote_expires_at);
  insist(quoteExpiry > now && quoteExpiry <= deadline, 'HSP_QUOTE_EXPIRED_OR_OUT_OF_BOUNDS');
  insist(typed?.primaryType === primaryType && exactKeys(typed.types, ['EIP712Domain', primaryType]) &&
    schemaIs(typed.types.EIP712Domain, domainFields) && schemaIs(typed.types[primaryType], authFields), 'HSP_UNEXPECTED_SIGNING_SCHEMA');
  insist(exactKeys(domain, domainFields.map(([name]) => name)) && domain.name === domainName &&
    domain.version === domainVersion && sameAddress(domain.verifyingContract, token) &&
    (Number.isSafeInteger(domain.chainId) || matches(chainHex, domain.chainId)) &&
    BigInt(domain.chainId) === BigInt(chainId), 'HSP_SIGNING_DOMAIN_MISMATCH');
  insist(exactKeys(message, authFields.map(([name]) => name)) &&
    sameAddress(message.from, payer) && sameAddress(message.to, payee) &&
    message.value === atomicAmount && matches(nonce, message.nonce) &&
    !/^0x0{64}$/i.test(message.nonce), 'HSP_SIGNING_TERMS_MISMATCH');
  const nowSeconds = BigInt(Math.floor(now / 1000));
  insist(matches(decimal, message.validAfter) && matches(decimal, message.validBefore) &&
    BigInt(message.validAfter) < nowSeconds && BigInt(message.validBefore) > nowSeconds &&
    BigInt(message.validBefore) * 1000n <= BigInt(deadline), 'HSP_SIGNING_WINDOW_MISMATCH');

  const { accepted, payload, x402Version } = prepared.payment_payload ?? {};
  const authorization = payload?.authorization;
  insist(x402Version === 2 && accepted?.scheme === 'exact' && accepted.network === `eip155:${chainId}` &&
    accepted.amount === atomicAmount && sameAddress(accepted.asset, token) && sameAddress(accepted.payTo, payee) &&
    accepted.extra?.protocol === 'eip3009' && accepted.extra?.name === domainName && accepted.extra?.version === domainVersion &&
    payload?.signature === '' && exactKeys(authorization, authFields.map(([name]) => name)) &&
    sameAddress(authorization.from, payer) && sameAddress(authorization.to, payee) &&
    ['value', 'validAfter', 'validBefore', 'nonce'].every((key) => authorization[key] === message[key]),
  'HSP_X402_PAYLOAD_MISMATCH');

  const encodedPayload = prepared.payment_mandate_contents?.payment_response?.details?.payment_payload;
  if (encodedPayload !== undefined) {
    let decoded;
    try {
      if (typeof encodedPayload !== 'string' || encodedPayload.length > 20_000) throw new Error();
      decoded = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
    } catch {
      throw new Error('HSP_ENCODED_PAYLOAD_MISMATCH');
    }
    insist(isDeepStrictEqual(decoded, prepared.payment_payload), 'HSP_ENCODED_PAYLOAD_MISMATCH');
  }

  return {
    domain: { ...domain, chainId },
    types: Object.fromEntries(Object.entries(typed.types).map(([name, fields]) => [name, fields.map((field) => ({ ...field }))])),
    primaryType,
    message: { ...message },
  };
}
import { isDeepStrictEqual } from 'node:util';

