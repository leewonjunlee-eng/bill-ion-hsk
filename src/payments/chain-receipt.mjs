const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const AUTHORIZATION_USED = '0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5';
const address = /^0x[\da-f]{40}$/i;
const hash = /^0x[\da-f]{64}$/i;
const quantity = /^0x(?:0|[1-9a-f][\da-f]*)$/i;
const matchesHex = (pattern, value) => typeof value === 'string' && pattern.test(value);
const equal = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}

export function createChainRpc(url, fetchImpl = fetch) {
  let id = 0;
  return async (method, params = []) => {
    const requestId = ++id;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    requireEvidence(response.ok, 'RPC_HTTP_ERROR');
    const result = await response.json();
    requireEvidence(result?.jsonrpc === '2.0' && result.id === requestId &&
      !result.error && Object.hasOwn(result, 'result'), 'RPC_RESPONSE_ERROR');
    return result.result;
  };
}

// The caller supplies the transaction hash obtained from its provider order lookup.
// This checks the chain transfer. Provider order attribution is a separate check.
export async function verifyChainTransfer(rpc, expected) {
  const { chainId, transactionHash, token, payer, payee, amount, minConfirmations, earliestBlock, authorizationNonce } = expected;
  requireEvidence(Number.isSafeInteger(chainId) && chainId > 0 &&
    matchesHex(hash, transactionHash) && [token, payer, payee].every((value) => matchesHex(address, value)) &&
    !equal(payer, payee) && typeof amount === 'string' && /^[1-9]\d{0,77}$/.test(amount) &&
    BigInt(amount) < (1n << 256n) && Number.isSafeInteger(minConfirmations) && minConfirmations > 0 &&
    typeof earliestBlock === 'string' && /^(0|[1-9]\d{0,19})$/.test(earliestBlock) &&
    (authorizationNonce === undefined || matchesHex(hash, authorizationNonce)), 'INVALID_TRANSFER_EXPECTATION');
  const network = await rpc('eth_chainId');
  requireEvidence(matchesHex(quantity, network) && BigInt(network) === BigInt(chainId), 'CHAIN_MISMATCH');
  const receipt = await rpc('eth_getTransactionReceipt', [transactionHash]);
  requireEvidence(receipt && equal(receipt.transactionHash, transactionHash) && receipt.status === '0x1' &&
    matchesHex(quantity, receipt.blockNumber) && matchesHex(hash, receipt.blockHash) && Array.isArray(receipt.logs), 'RECEIPT_UNAVAILABLE_OR_FAILED');
  const blockNumber = BigInt(receipt.blockNumber);
  requireEvidence(blockNumber >= BigInt(earliestBlock), 'TRANSFER_PRECEDES_ORDER');

  const [head, block] = await Promise.all([
    rpc('eth_blockNumber'),
    rpc('eth_getBlockByNumber', [receipt.blockNumber, false]),
  ]);
  requireEvidence(matchesHex(quantity, head) && BigInt(head) - blockNumber + 1n >= BigInt(minConfirmations), 'INSUFFICIENT_CONFIRMATIONS');
  requireEvidence(block && equal(block.hash, receipt.blockHash) && equal(block.number, receipt.blockNumber), 'BLOCK_NOT_CANONICAL');

  const topicFor = (value) => '0x' + value.slice(2).toLowerCase().padStart(64, '0');
  const matches = receipt.logs.filter((log) => log && equal(log.address, token) &&
    Array.isArray(log.topics) && log.topics.length === 3 && equal(log.topics[0], TRANSFER) &&
    equal(log.topics[1], topicFor(payer)) && equal(log.topics[2], topicFor(payee)) &&
    matchesHex(hash, log.data) && BigInt(log.data) === BigInt(amount));
  requireEvidence(matches.length === 1, 'TRANSFER_MISSING_OR_AMBIGUOUS');
  const [log] = matches;
  const inReceipt = (entry) => !entry.removed && matchesHex(quantity, entry.logIndex) &&
    equal(entry.transactionHash, transactionHash) && equal(entry.blockHash, receipt.blockHash) &&
    equal(entry.blockNumber, receipt.blockNumber);
  requireEvidence(inReceipt(log), 'TRANSFER_LOG_MISMATCH');
  if (authorizationNonce !== undefined) {
    const authorizations = receipt.logs.filter((entry) => entry && equal(entry.address, token) &&
      Array.isArray(entry.topics) && entry.topics.length === 3 && equal(entry.topics[0], AUTHORIZATION_USED) &&
      equal(entry.topics[1], topicFor(payer)) && equal(entry.topics[2], authorizationNonce) && entry.data === '0x');
    requireEvidence(authorizations.length === 1 && inReceipt(authorizations[0]), 'AUTHORIZATION_LOG_MISMATCH');
  }
  return {
    chainId, transactionHash: transactionHash.toLowerCase(),
    blockNumber: blockNumber.toString(), blockHash: receipt.blockHash.toLowerCase(),
    logIndex: BigInt(log.logIndex).toString(),
    confirmations: (BigInt(head) - blockNumber + 1n).toString(),
  };
}
