// In-page options avoid native select popups that some embedded browsers suppress.
export function createStatePicker(states, labels) {
  const root = document.createElement('details');
  root.className = 'state-picker';
  const title = document.createElement('summary');
  title.setAttribute('aria-label', 'Estado del vehículo');
  const input = document.createElement('input');
  input.type = 'hidden'; input.name = 'estadoInventario';
  const options = document.createElement('div'); options.className = 'state-options';
  options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Elegir estado');
  function set(value) {
    input.value = value;
    title.textContent = labels[value] || 'Elegir estado';
    for (const button of options.children) button.setAttribute('aria-pressed', String(button.dataset.value === value));
    root.open = false;
  }
  for (const value of states) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = labels[value]; button.dataset.value = value;
    button.onclick = () => {
      if (root.closest('fieldset')?.disabled) return;
      set(value); input.dispatchEvent(new Event('change', { bubbles: true })); title.focus();
    };
    options.append(button);
  }
  title.onclick = event => { if (root.closest('fieldset')?.disabled) event.preventDefault(); };
  root.onkeydown = event => { if (event.key === 'Escape') { root.open = false; title.focus(); } };
  root.append(title, input, options);
  return { element: root, set };
}
