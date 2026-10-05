const status = document.getElementById('status');
async function act(action) {
  try {
    const result = await chrome.runtime.sendMessage({
      action,
      pairing: document.getElementById('pair').value,
    });
    if (!result?.ok) throw new Error(result?.error ?? 'No response');
    status.textContent = result.message ?? 'Done.';
  } catch (error) {
    status.textContent = error.message;
  }
}
for (const id of ['save', 'connect', 'pick', 'restore', 'disconnect'])
  document.getElementById(id).onclick = () => act(id);
