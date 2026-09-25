// Boost Cars – λειτουργίες Admin Panel (μενού, επιβεβαιώσεις, φωτογραφίες, μη αποθηκευμένες αλλαγές)
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  // Mobile sidebar
  $$('[data-admin-menu]').forEach((b) => b.addEventListener('click', () => document.body.classList.toggle('admin-open')));

  // Auto-submit selects (status, sorting)
  $$('select[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  // Confirmation for destructive actions
  $$('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // Status select colour follows the chosen value
  $$('.status-select').forEach((s) => s.addEventListener('change', () => {
    s.className = s.className.replace(/status-\w+/g, '').trim();
    s.classList.add('status-select', `status-${s.value}`);
  }));

  const form = $('[data-car-form]');
  if (!form) return;

  // Warn about leaving with unsaved changes
  const unsaved = $('[data-unsaved]', form);
  let dirty = false;
  const markDirty = () => { dirty = true; if (unsaved) unsaved.hidden = false; };
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  form.addEventListener('submit', () => {
    dirty = false;
    $$('button[type=submit], button:not([type])', form).forEach((b) => { setTimeout(() => { b.disabled = true; }, 0); });
    const main = $('.publish-actions .btn-brand', form);
    if (main) main.textContent = 'Αποθήκευση…';
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  // Equipment counter
  const featCount = $('[data-feature-count]', form);
  const updateFeat = () => { if (featCount) featCount.textContent = `${$$('input[name=features]:checked', form).length} επιλεγμένα`; };
  form.addEventListener('change', (e) => { if (e.target.name === 'features') updateFeat(); });
  updateFeat();

  // Existing photos: drag to reorder, mark for deletion
  const grid = $('[data-image-grid]', form);
  const orderInput = $('[data-image-order]', form);
  if (!grid) return;
  const syncOrder = () => {
    orderInput.value = $$('[data-image-id]', grid).map((el) => el.dataset.imageId).join(',');
  };
  syncOrder();

  let dragged = null;
  grid.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.image-item');
    dragged?.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  grid.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
    syncOrder();
    markDirty();
  });
  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('.image-item');
    if (!dragged || !over || over === dragged) return;
    const rect = over.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    over.parentNode.insertBefore(dragged, after ? over.nextSibling : over);
  });
  grid.addEventListener('change', (e) => {
    if (e.target.name === 'delete_images') e.target.closest('.image-item').classList.toggle('marked', e.target.checked);
  });

  // New uploads: previews and drag-and-drop onto the drop zone
  const input = $('[data-image-input]', form);
  const previews = $('[data-new-previews]', form);
  const zone = $('[data-dropzone]', form);
  const label = $('[data-dz-label]', zone);
  const labelText = label.textContent;

  const renderPreviews = () => {
    previews.innerHTML = '';
    for (const file of input.files) {
      const item = document.createElement('div');
      item.className = 'image-item';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      item.append(img);
      previews.append(item);
    }
    label.textContent = input.files.length
      ? `${input.files.length} νέες φωτογραφίες: θα ανέβουν με την αποθήκευση`
      : labelText;
  };
  input.addEventListener('change', renderPreviews);

  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('over')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = new DataTransfer();
    [...input.files, ...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')).forEach((f) => dt.items.add(f));
    input.files = dt.files;
    renderPreviews();
    markDirty();
  });
})();
