const $ = (id) => document.getElementById(id);
const endpoint = '/api/hsp-demo/approval-description';
const signatures = new Map();
let manifest;
let current;
let pending = false;

function render(message) {
  $('manifest').disabled = pending;
  $('sign').disabled = pending || !current || signatures.size === 3;
  $('download').disabled = pending || signatures.size !== 3;
  $('message').hidden = !current;
  $('message').textContent = current?.message ?? '';
  $('status').textContent = message;
}

async function describe() {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manifest),
  });
  if (!response.ok) throw new Error('Choose the latest manifest registered on the local server.');
  return response.json();
}

$('manifest').addEventListener('change', async () => {
  pending = true;
  current = null;
  signatures.clear();
  render('Checking the manifest…');
  try {
    const [file] = $('manifest').files;
    if (!file || file.size > 4000) throw new Error('Choose a manifest JSON of 4KB or less.');
    manifest = JSON.parse(await file.text());
    current = await describe();
    pending = false;
    render('Check the version, payer, payee and amount in the message, then approve.');
  } catch (error) {
    pending = false;
    render(error.message);
  }
});

$('sign').addEventListener('click', async () => {
  if (pending || !current) return;
  pending = true;
  render('Review the approval message in your wallet.');
  let status;
  try {
    const wallet = globalThis.ethereum;
    if (!wallet?.request) throw new Error('Open an EVM wallet in this browser.');
    const refreshed = await describe();
    if (refreshed.message !== current.message) throw new Error('Choose the latest manifest again.');
    const [account] = await wallet.request({ method: 'eth_requestAccounts' });
    const address = account?.toLowerCase();
    if (!current.participants.some((participant) => participant.toLowerCase() === address)) {
      throw new Error('Switch to a wallet registered for this settlement.');
    }
    if (signatures.has(address)) throw new Error('This wallet already signed. Switch to the next member’s wallet.');
    const messageHex = '0x' + Array.from(new TextEncoder().encode(current.message), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const signature = await wallet.request({ method: 'personal_sign', params: [messageHex, account] });
    if (!/^0x[0-9a-f]{130}$/i.test(signature ?? '')) throw new Error('The wallet did not return a valid approval signature.');
    if ((await describe()).message !== current.message) throw new Error('The split changed, so this signature was not saved.');
    signatures.set(address, signature);
    status = `Collected ${signatures.size} of 3 approval signatures.`;
  } catch (error) {
    status = error.code === 4001 ? 'Approval was cancelled in the wallet.' : error.message;
  } finally {
    pending = false;
    render(status);
  }
});

$('download').addEventListener('click', () => {
  if (!current || signatures.size !== 3) return;
  const blob = new Blob([JSON.stringify([...signatures.values()], null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bill-ion-qa-approvals.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
