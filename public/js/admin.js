(() => {
  // Confirmation for destructive actions
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  const form = document.querySelector('[data-car-form]');
  if (!form) return;

  // Existing images: drag to reorder, mark for deletion
  const grid = form.querySelector('[data-image-grid]');
  const orderInput = form.querySelector('[data-image-order]');
  const syncOrder = () => {
    orderInput.value = [...grid.querySelectorAll('[data-image-id]')].map((el) => el.dataset.imageId).join(',');
  };
  syncOrder();

  let dragged = null;
  grid.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.image-item');
    dragged?.classList.add('dragging');
  });
  grid.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
    syncOrder();
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
  const input = form.querySelector('[data-image-input]');
  const previews = form.querySelector('[data-new-previews]');
  const zone = form.querySelector('[data-dropzone]');
  const label = zone.querySelector('span');
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
    label.textContent = input.files.length ? `${input.files.length} νέες φωτογραφίες επιλέχθηκαν — θα ανέβουν με την αποθήκευση` : labelText;
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
  });

  // Warn about leaving with unsaved changes
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', () => { dirty = false; });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
})();
