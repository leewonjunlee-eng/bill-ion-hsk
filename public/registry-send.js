// 증빙 레지스트리의 배포·기록 트랜잭션을 지갑으로 보낸다. 입력은 scripts/prepare-evidence-*.mjs의 출력 파일뿐이다.
// 개인키를 다루지 않는다. 서명과 전송 승인은 지갑에서 한다.
const isAddress = (value) => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const NETWORKS = { 133: 'HSK Testnet', 177: 'HSK Mainnet' };

export function walletTransaction(file) {
  const unsigned = file?.unsignedTransaction ?? {};
  const { to, data, value } = unsigned;
  const from = unsigned.from ?? file?.writer;
  if (!NETWORKS[file?.chainId] || !isAddress(from) || value !== '0x0' ||
      typeof data !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(data) ||
      (to !== undefined && !isAddress(to)) ||
      Object.keys(unsigned).some((key) => !['from', 'to', 'data', 'value'].includes(key))) {
    throw new Error('INVALID_TRANSACTION_FILE');
  }
  return { chainId: file.chainId, from, tx: { ...(to ? { to } : {}), data, value } };
}

if (globalThis.document) {
  const $ = (id) => document.getElementById(id);
  let prepared;
  $('file').addEventListener('change', async () => {
    prepared = undefined;
    $('send').disabled = true;
    $('summary').hidden = true;
    try {
      const [file] = $('file').files;
      if (!file || file.size > 100_000) throw new Error('INVALID_TRANSACTION_FILE');
      prepared = walletTransaction(JSON.parse(await file.text()));
      $('summary').textContent = [
        `Network: ${NETWORKS[prepared.chainId]} (${prepared.chainId})`,
        `From wallet: ${prepared.from}`,
        prepared.tx.to ? `Target contract: ${prepared.tx.to}` : 'Action: deploy a new contract',
        'Value: 0 (the wallet shows the gas fee)',
        `Data length: ${(prepared.tx.data.length - 2) / 2} bytes`,
      ].join('\n');
      $('summary').hidden = false;
      $('send').disabled = false;
      $('status').textContent = 'Check the details, then send with your wallet.';
    } catch {
      $('status').textContent = 'Choose a JSON file printed by a prepare script.';
    }
  });
  $('send').addEventListener('click', async () => {
    if (!prepared) return;
    const { from, chainId, tx } = prepared;
    $('send').disabled = true;
    let requested = false;
    try {
      const wallet = globalThis.ethereum;
      if (!wallet?.request) throw new Error('Open an EVM wallet in this browser.');
      const [account] = await wallet.request({ method: 'eth_requestAccounts' });
      if (account?.toLowerCase() !== from.toLowerCase()) throw new Error('Switch to the wallet named in the file.');
      if (BigInt(await wallet.request({ method: 'eth_chainId' })) !== BigInt(chainId)) {
        throw new Error(`Switch the wallet network to ${NETWORKS[chainId]} (${chainId}).`);
      }
      requested = true;
      const hash = await wallet.request({ method: 'eth_sendTransaction', params: [{ from: account, ...tx }] });
      // 같은 파일을 두 번 보내지 않도록 접수 후에는 버튼을 다시 열지 않는다
      $('status').textContent = `Submitted. Check the result in the explorer. Transaction hash: ${hash}`;
    } catch (error) {
      $('status').textContent = error.code === 4001 ? 'Sending was cancelled in the wallet.'
        : requested ? `${error.message} Check your wallet activity before sending again.` : error.message;
      $('send').disabled = false;
    }
  });
}
