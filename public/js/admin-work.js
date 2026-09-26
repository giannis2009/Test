/* =========================================================
   Ezro admin — Tasks board (drag & drop between columns)
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro; const A = window.Admin;
  const { h, $, $$, icon, iconEl, api, toast, fail, withBusy, sheet, field, input, textarea, select, segmented } = E;

  const COLS = [['todo', 'To do', '#8a8f9c'], ['progress', 'In progress', '#8f9bff'], ['review', 'Review', '#f0b24a'], ['done', 'Done', '#34c77b']];
  const PRI = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
  const f = { q: '', priority: '', mine: false };
  const DAY = 86400_000;

  function dueChip(t) {
    if (!t.due_at) return null;
    const d = new Date(t.due_at);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.floor((new Date(d).setHours(0, 0, 0, 0) - today) / DAY);
    let cls = ''; let label;
    if (t.status === 'done') { cls = 'done'; label = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·'); }
    else if (t.due_at < Date.now()) { cls = 'over'; label = diff === 0 ? 'Today' : `${-diff}d overdue`; }
    else if (diff === 0) { cls = 'soon'; label = 'Today'; }
    else if (diff === 1) { cls = 'soon'; label = 'Tomorrow'; }
    else if (diff < 7) { cls = 'soon'; label = d.toLocaleDateString(undefined, { weekday: 'long' }); }
    else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return h('span', { class: `due ${cls}` }, iconEl('calendar'), label);
  }

  A.pages.tasks = async () => {
    const { tasks, people } = await api('/api/admin/tasks');
    const me = A.me.email;
    const statsEl = h('div', { class: 'stats' });
    const board = h('div', { class: 'board' });
    const bodies = {};

    const visible = () => tasks.filter((t) => (!f.priority || t.priority === f.priority) && (!f.mine || t.assignee === me || (!t.assignee && t.created_by === me))
      && (!f.q || `${t.title} ${t.description} ${t.assignee || ''}`.toLowerCase().includes(f.q.toLowerCase())));

    function drawStats() {
      const open = tasks.filter((t) => t.status !== 'done');
      const soon = open.filter((t) => t.due_at && t.due_at >= Date.now() && t.due_at < Date.now() + 7 * DAY).length;
      const over = open.filter((t) => t.due_at && t.due_at < Date.now()).length;
      statsEl.replaceChildren(A.stat('Open', open.length), A.stat('Due in 7 days', soon, 'warn'), A.stat('Overdue', over, over ? 'bad' : ''), A.stat('Done', tasks.length - open.length, 'good'));
    }
    function card(t) {
      const who = t.assignee || t.created_by;
      return h('article', { class: `task p-${t.priority} ${t.status === 'done' ? 'done' : ''}`, dataset: { id: t.id }, tabindex: '0', onclick: () => edit(t), onkeydown: (e) => e.key === 'Enter' && edit(t) },
        h('div', { class: 'tp' }, h('span', {}, t.priority.toUpperCase()), h('span', { title: t.visibility === 'private' ? 'Only you and the assignee' : 'Whole team', html: icon(t.visibility === 'private' ? 'lock' : 'globe') })),
        h('h4', {}, t.title), t.description ? h('p', {}, t.description) : null,
        h('div', { class: 'tf' }, dueChip(t) || h('span'), who ? h('span', { title: who }, E.avatarEl({ email: who }, 28)) : null));
    }
    function drawBoard() {
      const list = visible();
      board.replaceChildren(...COLS.map(([id, label, color]) => {
        const items = list.filter((t) => t.status === id).sort((a, b) => a.sort - b.sort || a.id - b.id);
        const body = h('div', { class: 'col-body', dataset: { status: id } }, h('div', { class: 'col-empty', 'data-drop-end': '' }, 'Nothing here'), ...items.map(card));
        body.append(body.firstChild); // keep the empty-state last so it acts as the drop tail
        bodies[id] = body;
        return h('section', { class: 'col' }, h('div', { class: 'col-head' }, h('span', { class: 'dot', style: { background: color } }), label, h('span', { class: 'n' }, items.length),
          h('button', { class: 'btn icon sm ghost', 'aria-label': `Add task to ${label}`, html: icon('plus'), onclick: () => edit(null, id) })), body);
      }));
      drawStats();
    }

    E.dragSort({
      containers: () => Object.values(bodies), item: '.task',
      onDrop: async (el, to) => {
        const t = tasks.find((x) => x.id === Number(el.dataset.id));
        const status = to.dataset.status;
        const ids = $$('.task', to).map((x) => Number(x.dataset.id));
        const i = ids.indexOf(t.id);
        const neighbour = (j) => tasks.find((x) => x.id === ids[j]);
        const prev = neighbour(i - 1); const next = neighbour(i + 1);
        const sort = prev && next ? (prev.sort + next.sort) / 2 : prev ? prev.sort + 1 : next ? next.sort - 1 : 0;
        const moved = t.status !== status;
        Object.assign(t, { status, sort, completed_at: status === 'done' ? t.completed_at || Date.now() : null });
        drawBoard();
        try { await api(`/api/admin/tasks/${t.id}`, { method: 'PUT', body: { status, sort } }); if (moved) toast(`Moved to ${COLS.find((c) => c[0] === status)[1]}`, 'success'); }
        catch (e) { fail(e); A.refresh(); }
      },
    });

    function edit(t, status = 'todo') {
      const isNew = !t;
      t = t || { status, priority: 'medium', visibility: 'team', assignee: me };
      let pr = t.priority; let vis = t.visibility; let st = t.status;
      const title = input(t.title, { placeholder: 'What needs to happen?', autofocus: true });
      const desc = textarea(t.description, { placeholder: 'Details, links, notes…' });
      const due = input(E.toLocalInput(t.due_at), { type: 'datetime-local' });
      const who = select([['', 'Nobody'], ...people.map((p) => [p, p === me ? `${p} (me)` : p])], t.assignee || '');
      const save = h('button', { class: 'btn primary' }, isNew ? 'Add task' : 'Save');
      save.onclick = () => withBusy(save, async () => {
        const body = { title: title.value, description: desc.value, due_at: due.value || null, assignee: who.value, priority: pr, visibility: vis, status: st };
        try { await api(isNew ? '/api/admin/tasks' : `/api/admin/tasks/${t.id}`, { method: isNew ? 'POST' : 'PUT', body }); toast(isNew ? 'Task added' : 'Task saved', 'success'); s.close(); A.refresh(); } catch (e) { fail(e); }
      });
      title.onkeydown = (e) => { if (e.key === 'Enter') save.click(); };
      const foot = [];
      if (!isNew) foot.push(A.btn('Delete', 'trash', async () => { if (await E.confirmDialog('Delete this task?', t.title, { ok: 'Delete', danger: true })) { await api(`/api/admin/tasks/${t.id}`, { method: 'DELETE' }).catch(fail); s.close(); A.refresh(); } }, 'danger'));
      foot.push(h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'), save);
      const s = sheet({
        title: isNew ? 'New task' : 'Edit task', size: 'wide', foot,
        body: h('div', { class: 'form' }, field('Title', title), field('Description', desc),
          field('Status', segmented(COLS.map(([v, l]) => [v, l]), st, (v) => { st = v; }, { block: true })),
          field('Priority', segmented(PRI, pr, (v) => { pr = v; }, { block: true })),
          h('div', { class: 'row' }, field('Deadline', due), field('Assigned to', who)),
          field('Who can see it', segmented([['team', 'Whole team', 'globe'], ['private', 'Only me & assignee', 'lock']], vis, (v) => { vis = v; }, { block: true })),
          !isNew ? h('p', { class: 'muted', style: { fontSize: '12px' } }, `Created by ${t.created_by || '—'} · ${E.fmtDateTime(t.created_at)}`) : null),
      });
    }

    const search = h('div', { class: 'input-wrap grow' }, iconEl('search'), input(f.q, { placeholder: 'Search tasks or people…', oninput: E.debounce((e) => { f.q = e.target.value; drawBoard(); }, 150) }));
    const prio = select([['', 'Every priority'], ...PRI], f.priority, { onChange: (v) => { f.priority = v; drawBoard(); } });
    const mine = E.toggle(f.mine, 'Only my tasks', (on) => { f.mine = on; drawBoard(); });
    drawBoard();
    return [A.head('Tasks', `${A.site?.site?.projectName || 'Ezro'} — plan the work, set deadlines and choose who sees each task.`, A.btn('Add Task', 'plus', () => edit(null), 'primary')),
      h('div', { class: 'page' }, statsEl, h('div', { class: 'toolbar' }, search, prio, mine), board)];
  };
})();
