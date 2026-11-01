const { ItemView, MarkdownRenderer, Modal, Notice, Plugin, setIcon } = require('obsidian');

const VIEW_TYPE = 'flow-board-view';
const BOARD_PATH = 'plans/board.md';
const TASK_ROOT = 'plans/tasks/';
const LANE_STATUS = {
  '💡 Backlog': 'backlog',
  '📋 Ready': 'ready',
  '🤖 Agent 进行中': 'running',
  '👀 待我审': 'review',
  '✅ Done（本周）': 'done',
};

function cleanInline(value) {
  return value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path, alias) => alias || path)
    .replace(/\*\*/g, '').trim();
}

function parseBoard(source) {
  const lanes = [];
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      const name = heading[1].trim();
      current = Object.hasOwn(LANE_STATUS, name) ? { name, status: LANE_STATUS[name], cards: [] } : null;
      if (current) lanes.push(current);
      continue;
    }
    if (!current || !/^- \[[ x]\] /.test(line)) continue;
    const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(line);
    const title = link ? (link[2] || link[1]) : cleanInline(line.replace(/^- \[[ x]\] /, ''));
    const priority = /\[p([0-3])\]/i.exec(line)?.[1] ?? null;
    const afterLink = link ? line.slice(line.indexOf(link[0]) + link[0].length) : '';
    const summary = cleanInline(afterLink.split('｜')[0].replace(/^[\s·（）]+|[\s·（）]+$/g, ''));
    const okr = /OKR\s+([\d.]+)/i.exec(line)?.[1] ?? null;
    current.cards.push({
      title,
      basename: link ? link[1].split('/').pop() : null,
      priority,
      needsDecision: /❓/.test(link ? line.slice(0, line.indexOf(link[0])) : line),
      summary,
      okr,
    });
  }
  return lanes;
}

function extractPrs(source) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] || '';
  const prField = /^pr:\s*(.+)$/m.exec(frontmatter)?.[1] || '';
  const section = source.split(/^## 关联 PR\s*$/m)[1]?.split(/^## /m)[0] || '';
  const urls = [];
  const seen = new Set();
  for (const text of [prField, section]) {
    for (const match of text.matchAll(/https:\/\/github\.com\/([^\s/)]+)\/([^\s/)]+)\/pull\/(\d+)/g)) {
      const url = match[0];
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push({ url, repo: match[2], number: match[3] });
    }
  }
  return urls;
}

function extractReports(source) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] || '';
  const reports = [];
  const seen = new Set();
  const add = value => {
    const path = value.trim().replace(/^['"]|['"]$/g, '');
    if (!path.startsWith('reports/') || !path.endsWith('.md') || seen.has(path)) return;
    seen.add(path);
    reports.push({ path, name: path.split('/').pop().replace(/\.md$/, '') });
  };
  const design = /^design:\s*(.+)$/m.exec(frontmatter)?.[1];
  if (design) add(design);
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex(line => /^reports:\s*(?:\[\])?\s*$/.test(line));
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      const entry = /^\s+-\s+(.+)$/.exec(line);
      if (entry) add(entry[1]);
      else if (line.trim()) break;
    }
  }
  return reports;
}

function taskBasename(date, title) {
  const slug = title.trim().toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 28).replace(/-$/g, '') || 'task';
  return `${date}-${slug}`;
}

function boardRow(basename, title, priority, kind) {
  const row = `- [ ] [p${priority}] ${kind === 'think' ? '💭' : '⚙️'} [[${basename}|${title}]] · 刚立卡，未开工`;
  if (row.length > 120) throw new Error('看板行超过 120 字，请缩短标题');
  return row;
}

function insertBacklogRow(source, row) {
  const heading = /(^## 💡 Backlog[ \t]*\r?\n)(?:\r?\n)*/m;
  if (!heading.test(source)) throw new Error('看板中找不到 Backlog 列');
  if (source.includes(row)) throw new Error('看板中已存在这张卡');
  return source.replace(heading, (_, prefix) => `${prefix}\n${row}\n`);
}

function moveBoardRow(source, basename, destination, beforeBasename = null) {
  if (beforeBasename === basename) return source;
  const lines = source.split('\n');
  const findRows = () => {
    const rows = [];
    const headings = new Map();
    let status = null;
    lines.forEach((line, index) => {
      const heading = /^## (.+)\r?$/.exec(line);
      if (heading) {
        status = LANE_STATUS[heading[1].trim()] || null;
        if (status) headings.set(status, index);
      } else if (status && /^- \[[ x]\] /.test(line)) {
        const link = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(line);
        if (link) rows.push({ basename: link[1].split('/').pop(), status, index });
      }
    });
    return { rows, headings };
  };
  let { rows } = findRows();
  const sourceRows = rows.filter(row => row.basename === basename);
  if (!sourceRows.length) throw new Error(`看板中找不到任务卡：${basename}`);
  if (sourceRows.length > 1) throw new Error(`看板中存在重复任务卡：${basename}`);
  const [row] = lines.splice(sourceRows[0].index, 1);
  const found = findRows();
  rows = found.rows;
  const headings = found.headings;
  if (!headings.has(destination)) throw new Error(`看板中找不到目标列：${destination}`);
  let insertAt;
  if (beforeBasename && beforeBasename !== basename) {
    const matches = rows.filter(item => item.basename === beforeBasename && item.status === destination);
    if (matches.length !== 1) throw new Error(`目标列中找不到插入位置：${beforeBasename}`);
    insertAt = matches[0].index;
  } else {
    const laneRows = rows.filter(item => item.status === destination);
    insertAt = laneRows.length ? laneRows.at(-1).index + 1 : headings.get(destination) + 1;
    if (!laneRows.length) while (lines[insertAt]?.trim() === '') insertAt++;
  }
  lines.splice(insertAt, 0, row);
  return lines.join('\n');
}

function taskSource({ title, repo, kind, goal, criteria, date }) {
  const items = criteria.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .map(line => `- [ ] ${line.replace(/^- (?:\[[ x]\] )?/, '')}`).join('\n');
  return `---\ntype: ${kind}\nrepo: ${repo ? JSON.stringify(repo) : ''}\nstatus: backlog\nparent:\nblocked_by:\nbranch:\npr:\ncreated: ${date}\nstage:\ndesign:\nreports: []\n---\n\n# ${title}\n\n## 现状\n刚立卡，未开工\n\n## 背景\n\n## 目标\n${goal.trim()}\n\n## 验收标准\n${items}\n\n## 执行记录\n\n### ${date} · 手动立卡\n- 从工作看板创建。\n`;
}

class NewCardModal extends Modal {
  constructor(app, onCreate) {
    super(app);
    this.onCreate = onCreate;
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('flow-board-create-modal');
    this.contentEl.createEl('h2', { text: '新建任务卡' });
    this.contentEl.createDiv({ cls: 'flow-board-form-hint', text: '创建到 Backlog，同时生成任务笔记。' });
    const form = this.contentEl.createEl('form');
    const field = (label, tag, attributes = {}) => {
      const wrapper = form.createEl('label', { cls: 'flow-board-form-field' });
      wrapper.createSpan({ text: label });
      return wrapper.createEl(tag, { attr: attributes });
    };
    const title = field('标题', 'input', { type: 'text', maxlength: '40', placeholder: '任务要完成什么？', required: 'true' });
    const repo = field('仓库（可选）', 'input', { type: 'text', placeholder: '例如 duty/fc-foundation-app' });
    const options = form.createDiv({ cls: 'flow-board-form-options' });
    const selectField = (label, values) => {
      const wrapper = options.createEl('label', { cls: 'flow-board-form-field' });
      wrapper.createSpan({ text: label });
      const select = wrapper.createEl('select');
      for (const [value, text] of values) select.createEl('option', { text, attr: { value } });
      return select;
    };
    const kind = selectField('类型', [['exec', '执行 ⚙️'], ['think', '思考 💭']]);
    const priority = selectField('优先级', [['2', 'P2'], ['0', 'P0'], ['1', 'P1'], ['3', 'P3']]);
    const goal = field('目标', 'textarea', { rows: '2', placeholder: '完成后应达到什么结果？', required: 'true' });
    const criteria = field('验收标准', 'textarea', { rows: '3', placeholder: '每行一项可检查的结果', required: 'true' });
    const actions = form.createDiv({ cls: 'flow-board-form-actions' });
    const cancel = actions.createEl('button', { text: '取消', attr: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'mod-cta', text: '创建卡片', attr: { type: 'submit' } });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = {
        title: title.value.trim(), repo: repo.value.trim(), kind: kind.value,
        priority: priority.value, goal: goal.value.trim(), criteria: criteria.value.trim(),
      };
      if (!data.title || !data.goal || !data.criteria) return;
      if (/[\[\]|\r\n]/.test(data.title)) {
        new Notice('标题不能包含方括号、竖线或换行');
        return;
      }
      submit.disabled = true;
      try {
        await this.onCreate(data);
        this.close();
      } catch (error) {
        new Notice(`创建失败：${error.message}`);
        submit.disabled = false;
      }
    });
    title.focus();
  }

  onClose() { this.contentEl.empty(); }
}

class ReportPickerModal extends Modal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('flow-board-report-modal');
    this.contentEl.createEl('h2', { text: '关联报告' });
    const input = this.contentEl.createEl('input', { attr: { type: 'search', placeholder: '搜索报告文件名…', 'aria-label': '搜索报告' } });
    const list = this.contentEl.createDiv({ cls: 'flow-board-report-results' });
    const files = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith('reports/'))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
    const render = () => {
      list.empty();
      const query = input.value.trim().toLowerCase();
      const matches = files.filter(file => file.path.toLowerCase().includes(query)).slice(0, 30);
      for (const file of matches) {
        const button = list.createEl('button', { cls: 'flow-board-report-result', text: file.path, attr: { type: 'button' } });
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await this.onChoose(file);
            this.close();
          } catch (error) {
            new Notice(`关联失败：${error.message}`);
            button.disabled = false;
          }
        });
      }
      if (!matches.length) list.createDiv({ cls: 'flow-board-no-cards', text: '没有找到报告' });
    };
    input.addEventListener('input', render);
    render();
    input.focus();
  }

  onClose() { this.contentEl.empty(); }
}

class FlowBoardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selected = null;
    this.selectedReport = null;
    this.query = '';
    this.loadVersion = 0;
    this.detailWidth = plugin.detailWidth;
    this.draggingDetail = null;
    this.draggedCard = null;
    this.movingCard = false;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '工作看板'; }
  getIcon() { return 'layout-dashboard'; }

  async onOpen() {
    this.registerDomEvent(document, 'pointermove', event => {
      if (!this.draggingDetail) return;
      const width = this.draggingDetail.width + this.draggingDetail.x - event.clientX;
      this.setDetailWidth(width);
    });
    const finishDrag = () => {
      if (!this.draggingDetail) return;
      this.draggingDetail = null;
      this.plugin.detailWidth = this.detailWidth;
      this.plugin.saveData({ detailWidth: this.detailWidth });
    };
    this.registerDomEvent(document, 'pointerup', finishDrag);
    this.registerDomEvent(document, 'pointercancel', finishDrag);
    await this.refresh();
  }

  setDetailWidth(width) {
    const available = this.bodyEl?.clientWidth || 900;
    const max = Math.max(360, Math.min(900, available < 900 ? available : available - 260));
    this.detailWidth = Math.max(360, Math.min(max, width));
    this.detailEl?.style.setProperty('--flow-detail-width', `${this.detailWidth}px`);
  }

  async refresh() {
    const version = ++this.loadVersion;
    const board = this.app.vault.getAbstractFileByPath(BOARD_PATH);
    if (!board) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: 'flow-board-empty', text: `找不到 ${BOARD_PATH}` });
      return;
    }
    const lanes = parseBoard(await this.app.vault.cachedRead(board));
    const cards = lanes.flatMap(lane => lane.cards);
    const basenames = [...new Set(cards.map(card => card.basename).filter(Boolean))];
    const details = new Map();
    await Promise.all(basenames.map(async basename => {
      const file = this.resolveTask(basename);
      if (!file) return;
      const source = await this.app.vault.cachedRead(file);
      details.set(basename, { file, source, prs: extractPrs(source), reports: extractReports(source) });
    }));
    if (version !== this.loadVersion) return;
    this.lanes = lanes;
    this.details = details;
    this.render();
  }

  resolveTask(basename) {
    const direct = this.app.vault.getAbstractFileByPath(`${TASK_ROOT}${basename}.md`);
    if (direct) return direct;
    return this.app.metadataCache.getFirstLinkpathDest(basename, BOARD_PATH);
  }

  openReport(report, sourcePath, cardBasename = this.selected) {
    const file = this.app.vault.getAbstractFileByPath(report.path)
      || this.app.metadataCache.getFirstLinkpathDest(report.path.replace(/\.md$/, ''), sourcePath)
      || this.app.vault.getMarkdownFiles().find(candidate => candidate.basename === report.name && candidate.path.startsWith('reports/'));
    if (!file) {
      new Notice(`找不到报告：${report.path}`);
      return;
    }
    this.selected = cardBasename;
    this.selectedReport = file;
    this.renderLanes();
    this.renderDetail();
  }

  async linkReport(taskFile, reportFile) {
    await this.app.fileManager.processFrontMatter(taskFile, frontmatter => {
      const current = Array.isArray(frontmatter.reports) ? frontmatter.reports : frontmatter.reports ? [frontmatter.reports] : [];
      if (!current.includes(reportFile.path)) frontmatter.reports = [...current, reportFile.path];
    });
    await this.refresh();
    new Notice('报告已关联到任务卡');
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('flow-board-root');
    const header = root.createDiv({ cls: 'flow-board-header' });
    const heading = header.createDiv({ cls: 'flow-board-heading' });
    heading.createEl('h1', { text: '工作看板' });
    const toolbar = root.createDiv({ cls: 'flow-board-toolbar' });
    const tab = toolbar.createDiv({ cls: 'flow-board-view-tab' });
    const tabIcon = tab.createSpan({ cls: 'flow-board-view-icon' });
    setIcon(tabIcon, 'columns-3');
    tab.createSpan({ text: '看板视图' });
    const headerActions = toolbar.createDiv({ cls: 'flow-board-header-actions' });
    const search = headerActions.createEl('input', { cls: 'flow-board-search', attr: { type: 'search', placeholder: '搜索任务或 PR…', 'aria-label': '搜索任务或 PR' } });
    search.value = this.query;
    search.addEventListener('input', () => { this.query = search.value; this.renderLanes(); });
    const createButton = headerActions.createEl('button', { cls: 'flow-board-create', text: '＋ 新建卡片' });
    createButton.addEventListener('click', () => new NewCardModal(this.app, data => this.createCard(data)).open());
    const sourceButton = headerActions.createEl('button', { cls: 'flow-board-source', text: '原看板' });
    sourceButton.addEventListener('click', () => this.plugin.openOriginalBoard());

    const active = this.lanes.find(lane => lane.status === 'running')?.cards.length || 0;
    const review = this.lanes.find(lane => lane.status === 'review')?.cards.length || 0;
    const ready = this.lanes.find(lane => lane.status === 'ready')?.cards.length || 0;
    const stats = toolbar.createDiv({ cls: 'flow-board-stats' });
    this.stat(stats, '进行中', active, 'running');
    this.stat(stats, '待我审', review, 'review');
    this.stat(stats, '就绪', ready, 'ready');

    const body = root.createDiv({ cls: 'flow-board-body' });
    this.bodyEl = body;
    this.boardEl = body.createDiv({ cls: 'flow-board-lanes' });
    this.detailEl = body.createDiv({ cls: 'flow-board-detail' });
    this.setDetailWidth(this.detailWidth);
    this.renderLanes();
    this.renderDetail();
  }

  stat(parent, label, count, kind) {
    const el = parent.createDiv({ cls: `flow-board-stat flow-board-stat-${kind}` });
    el.createDiv({ cls: 'flow-board-stat-value', text: String(count) });
    el.createDiv({ cls: 'flow-board-stat-label', text: label });
  }

  async createCard(data) {
    const board = this.app.vault.getAbstractFileByPath(BOARD_PATH);
    if (!board) throw new Error(`找不到 ${BOARD_PATH}`);
    const date = new Date().toLocaleDateString('sv-SE');
    const base = taskBasename(date, data.title);
    let basename = base;
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(`${TASK_ROOT}${basename}.md`)) basename = `${base}-${suffix++}`;
    const row = boardRow(basename, data.title, data.priority, data.kind);
    const source = taskSource({ ...data, date });
    const file = await this.app.vault.create(`${TASK_ROOT}${basename}.md`, source);
    try {
      await this.app.vault.process(board, current => insertBacklogRow(current, row));
    } catch (error) {
      try {
        await this.app.vault.trash(file, false);
      } catch {
        throw new Error(`${error.message}；任务笔记已生成在 ${file.path}，请手动检查`);
      }
      throw error;
    }
    this.selected = basename;
    this.query = '';
    await this.refresh();
    new Notice('任务卡已创建到 Backlog');
  }

  async moveCard(card, destination, beforeBasename) {
    if (this.movingCard || !card.basename) return;
    const sourceLane = this.lanes.find(lane => lane.cards.includes(card));
    if (!sourceLane) return;
    const board = this.app.vault.getAbstractFileByPath(BOARD_PATH);
    const detail = this.details.get(card.basename);
    if (!board || (sourceLane.status !== destination && !detail)) {
      new Notice('找不到看板或任务笔记，无法移动卡片');
      return;
    }
    this.movingCard = true;
    let previous;
    let moved;
    try {
      await this.app.vault.process(board, current => {
        previous = current;
        moved = moveBoardRow(current, card.basename, destination, beforeBasename);
        return moved;
      });
      if (sourceLane.status !== destination) {
        await this.app.fileManager.processFrontMatter(detail.file, frontmatter => {
          frontmatter.status = destination;
        });
      }
      await this.refresh();
    } catch (error) {
      if (moved && moved !== previous) {
        try {
          await this.app.vault.process(board, current => current === moved ? previous : current);
        } catch (rollbackError) {
          new Notice(`移动失败，回退看板也失败：${rollbackError.message}`);
        }
      }
      new Notice(`移动卡片失败：${error.message}`);
      await this.refresh();
    } finally {
      this.movingCard = false;
    }
  }

  clearDropTarget() {
    this.boardEl?.querySelectorAll('.is-drag-over, .drop-before, .drop-after')
      .forEach(element => element.removeClass('is-drag-over', 'drop-before', 'drop-after'));
  }

  renderLanes() {
    if (!this.boardEl) return;
    this.boardEl.empty();
    const query = this.query.trim().toLowerCase();
    for (const lane of this.lanes) {
      const matches = lane.cards.filter(card => {
        if (!query) return true;
        const detail = this.details.get(card.basename);
        const prs = detail?.prs || [];
        const reports = detail?.reports || [];
        return `${card.title} ${card.summary} ${card.okr || ''} ${prs.map(pr => `${pr.repo} #${pr.number}`).join(' ')} ${reports.map(report => report.name).join(' ')}`.toLowerCase().includes(query);
      });
      const column = this.boardEl.createDiv({ cls: `flow-board-lane flow-board-lane-${lane.status}` });
      column.addEventListener('dragover', event => {
        if (!this.draggedCard || this.movingCard) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this.clearDropTarget();
        column.addClass('is-drag-over');
        const target = event.target.closest('.flow-board-card[data-basename]');
        if (target && column.contains(target)) {
          target.addClass(event.clientY < target.getBoundingClientRect().top + target.clientHeight / 2 ? 'drop-before' : 'drop-after');
        }
      });
      column.addEventListener('drop', event => {
        if (!this.draggedCard) return;
        event.preventDefault();
        const target = event.target.closest('.flow-board-card[data-basename]');
        let before = null;
        if (target && column.contains(target)) {
          before = event.clientY < target.getBoundingClientRect().top + target.clientHeight / 2
            ? target.dataset.basename
            : target.nextElementSibling?.dataset.basename || null;
        }
        const card = this.draggedCard;
        this.draggedCard = null;
        this.clearDropTarget();
        this.moveCard(card, lane.status, before);
      });
      const title = column.createDiv({ cls: 'flow-board-lane-heading' });
      title.createEl('h2', { text: lane.name.replace(/^\S+\s*/, '') });
      title.createSpan({ cls: 'flow-board-lane-count', text: String(query ? matches.length : lane.cards.length) });
      const list = column.createDiv({ cls: 'flow-board-card-list' });
      for (const card of matches) this.renderCard(list, card);
      if (!matches.length) list.createDiv({ cls: 'flow-board-no-cards', text: query ? '没有匹配的任务' : '暂无任务' });
    }
  }

  renderCard(parent, card) {
    const isSelected = this.selected === card.basename && !!card.basename;
    const el = parent.createDiv({ cls: `flow-board-card${isSelected ? ' is-selected' : ''}`, attr: { role: 'button', tabindex: '0', 'aria-label': `查看 ${card.title}`, draggable: card.basename ? 'true' : 'false', 'data-basename': card.basename || '' } });
    el.addEventListener('dragstart', event => {
      if (!card.basename || this.movingCard || event.target.closest('a, button')) {
        event.preventDefault();
        return;
      }
      this.draggedCard = card;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.basename);
    });
    el.addEventListener('dragend', () => {
      this.draggedCard = null;
      this.clearDropTarget();
    });
    el.createDiv({ cls: 'flow-board-card-title', text: card.title });
    if (card.summary) el.createDiv({ cls: 'flow-board-card-summary', text: card.summary });
    const top = el.createDiv({ cls: 'flow-board-card-top' });
    if (card.priority !== null) top.createSpan({ cls: `flow-board-priority flow-board-priority-${card.priority}`, text: `P${card.priority}` });
    if (card.needsDecision) top.createSpan({ cls: 'flow-board-decision', text: '待决策' });
    if (card.okr) top.createSpan({ cls: 'flow-board-okr', text: `OKR ${card.okr}` });
    const prs = this.details.get(card.basename)?.prs || [];
    if (prs.length) {
      const row = el.createDiv({ cls: 'flow-board-card-prs' });
      for (const pr of prs.slice(0, 3)) {
        const link = row.createEl('a', { cls: 'flow-board-pr', text: `${pr.repo} #${pr.number}`, href: pr.url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
        link.addEventListener('click', event => event.stopPropagation());
      }
      if (prs.length > 3) row.createSpan({ cls: 'flow-board-pr-more', text: `+${prs.length - 3}` });
    }
    const reports = this.details.get(card.basename)?.reports || [];
    if (reports.length) {
      const row = el.createDiv({ cls: 'flow-board-card-reports' });
      for (const report of reports.slice(0, 2)) {
        const link = row.createEl('button', { cls: 'flow-board-report', text: `📄 ${report.name}`, attr: { type: 'button', title: report.path } });
        link.addEventListener('click', event => { event.stopPropagation(); this.openReport(report, this.details.get(card.basename).file.path, card.basename); });
      }
      if (reports.length > 2) row.createSpan({ cls: 'flow-board-report-more', text: `+${reports.length - 2}` });
    }
    if (!card.basename) el.addClass('is-unlinked');
    const select = () => {
      if (!card.basename) return;
      const close = this.selected === card.basename && !this.selectedReport;
      this.selected = close ? null : card.basename;
      this.selectedReport = null;
      this.renderLanes();
      this.renderDetail();
    };
    el.addEventListener('click', select);
    el.addEventListener('keydown', event => {
      if (event.target !== el) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select();
    });
  }

  async renderDetail() {
    const panel = this.detailEl;
    if (!panel) return;
    panel.empty();
    panel.toggleClass('is-open', !!this.selected);
    if (!this.selected) return;
    const handle = panel.createDiv({ cls: 'flow-board-detail-handle', attr: { role: 'separator', tabindex: '0', 'aria-label': '拖动调整详情宽度', 'aria-orientation': 'vertical' } });
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.draggingDetail = { x: event.clientX, width: this.detailWidth };
    });
    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      this.setDetailWidth(this.detailWidth + (event.key === 'ArrowLeft' ? 30 : -30));
      this.plugin.detailWidth = this.detailWidth;
      this.plugin.saveData({ detailWidth: this.detailWidth });
    });
    const detail = this.details.get(this.selected);
    const card = this.lanes.flatMap(lane => lane.cards).find(item => item.basename === this.selected);
    const reportFile = this.selectedReport;
    const controls = panel.createDiv({ cls: 'flow-board-detail-controls' });
    const navigation = controls.createDiv({ cls: 'flow-board-detail-navigation' });
    if (reportFile) {
      const back = navigation.createEl('button', { cls: 'flow-board-back', text: '← 返回任务卡', attr: { type: 'button' } });
      back.addEventListener('click', () => { this.selectedReport = null; this.renderDetail(); });
    } else {
      navigation.createSpan({ text: '任务详情' });
    }
    const controlActions = controls.createDiv({ cls: 'flow-board-detail-control-actions' });
    if (reportFile) {
      const maximize = controlActions.createEl('button', { cls: 'flow-board-maximize', attr: { 'aria-label': '最大化打开报告', title: '在完整标签页打开报告', type: 'button' } });
      setIcon(maximize, 'maximize-2');
      maximize.addEventListener('click', async () => {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(reportFile);
        await this.app.workspace.revealLeaf(leaf);
      });
    }
    const close = controlActions.createEl('button', { cls: 'flow-board-close', attr: { 'aria-label': '关闭详情', type: 'button' } });
    setIcon(close, 'x');
    close.addEventListener('click', () => { this.selected = null; this.selectedReport = null; this.renderLanes(); this.renderDetail(); });
    const scroll = panel.createDiv({ cls: 'flow-board-detail-scroll' });
    if (reportFile) {
      const source = await this.app.vault.cachedRead(reportFile);
      if (this.selectedReport !== reportFile) return;
      const title = /^# (.+)$/m.exec(source)?.[1]?.trim() || reportFile.basename;
      scroll.createEl('h2', { cls: 'flow-board-detail-title', text: title });
      const markdown = scroll.createDiv({ cls: 'flow-board-markdown markdown-rendered' });
      await MarkdownRenderer.render(this.app, source, markdown, reportFile.path, this);
      return;
    }
    if (!detail) {
      scroll.createDiv({ cls: 'flow-board-detail-missing', text: `找不到任务卡：${this.selected}` });
      return;
    }
    scroll.createEl('h2', { cls: 'flow-board-detail-title', text: card?.title || this.selected });
    const actions = scroll.createDiv({ cls: 'flow-board-detail-actions' });
    const edit = actions.createEl('button', { text: '在旁边打开原笔记' });
    edit.addEventListener('click', async () => {
      const leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.openFile(detail.file);
      this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
    });
    const addReport = actions.createEl('button', { text: '＋ 关联报告' });
    addReport.addEventListener('click', () => new ReportPickerModal(this.app, file => this.linkReport(detail.file, file)).open());
    if (detail.prs.length) {
      const prs = scroll.createDiv({ cls: 'flow-board-detail-prs' });
      prs.createDiv({ cls: 'flow-board-detail-label', text: `关联 PR · ${detail.prs.length}` });
      for (const pr of detail.prs) prs.createEl('a', { text: `${pr.repo} #${pr.number} ↗`, href: pr.url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    }
    if (detail.reports.length) {
      const reports = scroll.createDiv({ cls: 'flow-board-detail-reports' });
      reports.createDiv({ cls: 'flow-board-detail-label', text: `关联报告 · ${detail.reports.length}` });
      for (const report of detail.reports) {
        const link = reports.createEl('button', { text: `${report.name} ↗`, attr: { type: 'button', title: report.path } });
        link.addEventListener('click', () => this.openReport(report, detail.file.path));
      }
    }
    const markdown = scroll.createDiv({ cls: 'flow-board-markdown markdown-rendered' });
    await MarkdownRenderer.render(this.app, detail.source, markdown, detail.file.path, this);
    markdown.addEventListener('click', event => {
      const link = event.target.closest('a.internal-link');
      if (!link) return;
      event.preventDefault();
      const destination = this.app.metadataCache.getFirstLinkpathDest(link.getAttribute('data-href') || link.textContent, detail.file.path);
      if (destination?.path.startsWith('reports/')) this.openReport({ path: destination.path, name: destination.basename }, detail.file.path);
      else if (destination) this.app.workspace.getLeaf('split', 'vertical').openFile(destination);
    });
  }
}

module.exports = class FlowBoardPlugin extends Plugin {
  async onload() {
    const data = await this.loadData();
    this.detailWidth = Number.isFinite(data?.detailWidth) ? data.detailWidth : 560;
    this.registerView(VIEW_TYPE, leaf => new FlowBoardView(leaf, this));
    this.addRibbonIcon('layout-dashboard', '打开工作看板', () => this.activate());
    this.addCommand({ id: 'open-flow-board', name: '打开工作看板', callback: () => this.activate() });
    this.openingOriginalBoard = false;
    this.registerEvent(this.app.workspace.on('file-open', file => {
      this.markReportLeaf(this.app.workspace.activeLeaf, file?.path);
      this.openBoardFile(file);
    }));
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.iterateAllLeaves(leaf => this.markReportLeaf(leaf));
      this.openBoardFile(this.app.workspace.getActiveFile());
    });
    const refresh = (file, oldPath) => {
      if (file.path === BOARD_PATH || file.path.startsWith(TASK_ROOT) || oldPath === BOARD_PATH || oldPath?.startsWith(TASK_ROOT)) {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view.refresh();
      }
    };
    this.registerEvent(this.app.vault.on('modify', refresh));
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
  }

  async activate() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  markReportLeaf(leaf, path = leaf?.getViewState()?.state?.file) {
    leaf?.view?.containerEl?.classList.toggle('flow-board-report-note', Boolean(path?.startsWith('reports/')));
  }

  async openBoardFile(file) {
    if (file?.path !== BOARD_PATH || this.openingOriginalBoard) return;
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf || leaf.view?.getViewType() === VIEW_TYPE) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
  }

  async openOriginalBoard() {
    const board = this.app.vault.getAbstractFileByPath(BOARD_PATH);
    if (!board) return;
    this.openingOriginalBoard = true;
    try {
      await this.app.workspace.getLeaf('split', 'vertical').openFile(board);
    } finally {
      this.openingOriginalBoard = false;
    }
  }
};

module.exports.parseBoard = parseBoard;
module.exports.extractPrs = extractPrs;
module.exports.extractReports = extractReports;
module.exports.taskBasename = taskBasename;
module.exports.boardRow = boardRow;
module.exports.insertBacklogRow = insertBacklogRow;
module.exports.moveBoardRow = moveBoardRow;
module.exports.taskSource = taskSource;
