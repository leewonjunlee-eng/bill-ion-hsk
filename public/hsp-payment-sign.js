// scripts/prepare-hsp-qa-signature.mjs가 출력한 지급 서명 요청을 지갑에서 서명해 파일로 내려받는다.
// 승인 조건과의 대조는 prepare와 submit 스크립트가 서버 기록으로 한다. 여기서는 서명 종류를 제한하고 조건을 보여 준다.
const isAddress = (value) => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const NETWORKS = { 133: 'HSK Testnet', 11155111: 'Sepolia' };
const keys = (object) => Object.keys(object ?? {}).sort().join();

export function paymentRequest(request, now = Date.now()) {
  const { domain, types, primaryType, message } = request ?? {};
  if (primaryType !== 'TransferWithAuthorization' || keys(types) !== 'EIP712Domain,TransferWithAuthorization' ||
      !NETWORKS[domain?.chainId] || !isAddress(domain.verifyingContract) ||
      keys(message) !== 'from,nonce,to,validAfter,validBefore,value' ||
      !isAddress(message.from) || !isAddress(message.to) || !/^[1-9][0-9]*$/.test(message.value) ||
      !(Number(message.validBefore) * 1000 > now)) {
    throw new Error('INVALID_PAYMENT_REQUEST');
  }
  return { chainId: domain.chainId, network: NETWORKS[domain.chainId], from: message.from, typedData: { domain, types, primaryType, message } };
}

if (globalThis.document) {
  const $ = (id) => document.getElementById(id);
  let prepared;
  $('file').addEventListener('change', async () => {
    prepared = undefined;
    $('sign').disabled = true;
    $('summary').hidden = true;
    try {
      const [file] = $('file').files;
      if (!file || file.size > 20_000) throw new Error('INVALID_PAYMENT_REQUEST');
      prepared = paymentRequest(JSON.parse(await file.text()));
      const { domain, message } = prepared.typedData;
      $('summary').textContent = [
        `Network: ${prepared.network} (${prepared.chainId})`,
        `Token contract: ${domain.verifyingContract}`,
        `From wallet: ${message.from}`,
        `To wallet: ${message.to}`,
        `Amount (base units): ${message.value}`,
        `Signature expires: ${new Date(Number(message.validBefore) * 1000).toLocaleString('en-US')}`,
      ].join('\n');
      $('summary').hidden = false;
      $('sign').disabled = false;
      $('status').textContent = 'Signing authorizes this token transfer. Check the terms.';
    } catch {
      $('status').textContent = 'Choose a payment signature request JSON that has not expired.';
    }
  });
  $('sign').addEventListener('click', async () => {
    if (!prepared) return;
    const { chainId, network, from, typedData } = prepared;
    $('sign').disabled = true;
    try {
      const wallet = globalThis.ethereum;
      if (!wallet?.request) throw new Error('Open an EVM wallet in this browser.');
      const [account] = await wallet.request({ method: 'eth_requestAccounts' });
      if (account?.toLowerCase() !== from.toLowerCase()) throw new Error('Switch to the sending wallet.');
      if (BigInt(await wallet.request({ method: 'eth_chainId' })) !== BigInt(chainId)) {
        throw new Error(`Switch the wallet network to ${network} (${chainId}).`);
      }
      const signature = await wallet.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(typedData)] });
      if (!/^0x[0-9a-f]{130}$/i.test(signature ?? '')) throw new Error('The wallet did not return a valid signature.');
      // 서명은 이체 권한이므로 화면에 쓰지 않고 파일로만 넘긴다
      const url = URL.createObjectURL(new Blob([signature], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'wallet-signature.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('status').textContent = 'Downloaded wallet-signature.txt. Pass it to the submit script, then delete the file.';
    } catch (error) {
      $('status').textContent = error.code === 4001 ? 'Signing was cancelled in the wallet.' : error.message;
    }
    $('sign').disabled = false;
  });
}
