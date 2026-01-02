/**
 * Pro Report Studio v10.0 - 公務報表專用版
 * 主應用程式
 */

// ============================================
// ReportBuilder Class
// ============================================
class ReportBuilder {
    constructor() {
        this.state = {
            els: [],
            data: [],
            fields: [],
            fieldTypes: {},
            sel: null,
            multiSel: [],
            cfg: {
                size: 'a4',
                orient: 'landscape',
                w: 297, h: 210,
                mode: 'single',
                splitY: 150,
                offX: 0, offY: 0,
                condFormat: 'none',
                watermark: '',
                groupField: ''
            },
            bgUrl: null
        };
        this.history = [];
        this.maxHistory = 20;
        this.renderPending = false;
        this.dom = {};
        this.db = null;
        this.init();
    }

    async init() {
        this.cacheDom();
        this.initCanvas();
        this.bindEvents();
        this.renderProps();
        this.saveState();
        await this.initDB();
        this.loadTemplates();
    }

    cacheDom() {
        this.dom = {
            canvas: document.getElementById('canvas'),
            canvasWrap: document.getElementById('canvas-wrap'),
            splitLine: document.getElementById('splitLine'),
            guideX: document.getElementById('guideX'),
            guideY: document.getElementById('guideY'),
            floatBar: document.getElementById('floatBar'),
            props: document.getElementById('props'),
            fieldList: document.getElementById('field-list'),
            bgCtrl: document.getElementById('bg-ctrl'),
            printContainer: document.getElementById('print-container'),
            watermark: document.getElementById('watermark'),
            dataInfo: document.getElementById('data-info'),
            dataCount: document.getElementById('data-count'),
            groupField: document.getElementById('group-field'),
            selectionBox: document.getElementById('selectionBox'),
            fileInputs: {
                pdf: document.getElementById('f-pdf'),
                data: document.getElementById('f-data'),
                proj: document.getElementById('f-proj')
            }
        };
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.dom.canvasWrap.addEventListener('mousedown', (e) => this.handleCanvasMousedown(e));
        this.dom.canvasWrap.addEventListener('dragover', (e) => e.preventDefault());
        this.dom.canvasWrap.addEventListener('drop', (e) => this.handleCanvasDrop(e));
        this.dom.splitLine.addEventListener('mousedown', (e) => this.handleSplitDrag(e));
        this.dom.fileInputs.pdf.addEventListener('change', (e) => this.loadPdfBg(e.target));
        this.dom.fileInputs.data.addEventListener('change', (e) => this.loadDataFile(e.target));
        this.dom.fileInputs.proj.addEventListener('change', (e) => this.readProject(e.target));
        document.querySelectorAll('.tab-nav').forEach(nav => {
            nav.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-btn')) {
                    this.switchTab(e.target, e.target.dataset.tab);
                }
            });
        });
    }

    handleKeydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); this.selectAll(); return; }
        if (e.key === 'Delete' && (this.state.sel || this.state.multiSel.length)) { this.deleteElement(); return; }
        if (e.key === 'Escape') { this.state.sel = null; this.state.multiSel = []; this.render(); return; }
        if (this.state.sel && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const delta = e.shiftKey ? 10 : 1;
            const items = this.state.multiSel.length ? this.state.multiSel.map(id => this.state.els.find(x => x.id === id)) : [this.state.els.find(x => x.id === this.state.sel)];
            items.forEach(item => {
                if (!item || item.locked) return;
                if (e.key === 'ArrowLeft') item.x -= delta;
                if (e.key === 'ArrowRight') item.x += delta;
                if (e.key === 'ArrowUp') item.y -= delta;
                if (e.key === 'ArrowDown') item.y += delta;
            });
            this.render();
        }
    }

    handleCanvasMousedown(e) {
        if (e.target.id === 'canvas-wrap' || e.target.id === 'canvas') {
            if (!e.shiftKey) { this.state.sel = null; this.state.multiSel = []; }
            this.render();
        }
    }

    handleCanvasDrop(e) {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        if (type === 'field') {
            const field = e.dataTransfer.getData('f');
            const rect = this.dom.canvas.getBoundingClientRect();
            this.addElement('field', field, e.clientX - rect.left - this.state.cfg.offX, e.clientY - rect.top - this.state.cfg.offY);
        }
    }

    handleSplitDrag(e) {
        e.preventDefault();
        const startY = e.clientY, startSplit = this.state.cfg.splitY;
        const onMove = (ev) => { this.state.cfg.splitY = Math.max(0, startSplit + (ev.clientY - startY)); this.dom.splitLine.style.top = this.state.cfg.splitY + 'px'; };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ============================================
    // IndexedDB for Templates
    // ============================================
    async initDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open('ReportStudioDB', 1);
            request.onerror = () => resolve();
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('templates')) {
                    db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    async saveTemplate() {
        const name = document.getElementById('template-name').value.trim();
        if (!name) { alert('請輸入範本名稱'); return; }
        if (!this.db) { alert('範本庫初始化失敗'); return; }
        const template = { name, date: new Date().toISOString(), state: JSON.stringify(this.state) };
        const tx = this.db.transaction('templates', 'readwrite');
        tx.objectStore('templates').add(template);
        tx.oncomplete = () => { alert('範本已儲存'); this.loadTemplates(); document.getElementById('template-name').value = ''; };
    }

    async loadTemplates() {
        const list = document.getElementById('template-list');
        if (!this.db) { list.innerHTML = '<p class="hint-text">範本庫初始化失敗</p>'; return; }
        const tx = this.db.transaction('templates', 'readonly');
        const store = tx.objectStore('templates');
        const request = store.getAll();
        request.onsuccess = () => {
            const templates = request.result;
            if (!templates.length) { list.innerHTML = '<p class="hint-text">尚無儲存的範本</p>'; return; }
            list.innerHTML = templates.map(t => `
                <div class="template-item" onclick="app.loadFromTemplate(${t.id})">
                    <span class="template-item-name">${t.name}</span>
                    <span class="template-item-date">${new Date(t.date).toLocaleDateString()}</span>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();app.deleteTemplate(${t.id})">刪除</button>
                </div>
            `).join('');
        };
    }

    async loadFromTemplate(id) {
        const tx = this.db.transaction('templates', 'readonly');
        const request = tx.objectStore('templates').get(id);
        request.onsuccess = () => {
            if (request.result) {
                const saved = JSON.parse(request.result.state);
                Object.assign(this.state, saved);
                this.render(); this.renderProps(); this.renderFields();
                closeModal('modal-templates');
                alert('範本已載入');
            }
        };
    }

    async deleteTemplate(id) {
        if (!confirm('確定刪除此範本？')) return;
        const tx = this.db.transaction('templates', 'readwrite');
        tx.objectStore('templates').delete(id);
        tx.oncomplete = () => this.loadTemplates();
    }

    // ============================================
    // Canvas Management
    // ============================================
    initCanvas() { this.updateCanvasSize(); }

    updateCanvasSize() {
        const sizes = { 'a4': [210, 297], 'a5': [148, 210], 'receipt80': [80, 297] };
        let [w, h] = sizes[this.state.cfg.size] || [this.state.cfg.w, this.state.cfg.h];
        if (this.state.cfg.orient === 'landscape' && this.state.cfg.size !== 'receipt80') [w, h] = [h, w];
        this.state.cfg.w = w; this.state.cfg.h = h;
        this.dom.canvas.style.width = w + 'mm';
        this.dom.canvas.style.height = this.state.cfg.size === 'receipt80' ? 'auto' : h + 'mm';
        this.dom.canvas.style.minHeight = this.state.cfg.size === 'receipt80' ? '150mm' : '0';
    }

    // ============================================
    // History (Undo)
    // ============================================
    saveState() {
        if (this.history.length > this.maxHistory) this.history.shift();
        this.history.push(JSON.stringify({ els: this.state.els, cfg: this.state.cfg }));
    }

    undo() {
        if (this.history.length > 1) {
            this.history.pop();
            const prev = JSON.parse(this.history[this.history.length - 1]);
            this.state.els = prev.els; this.state.cfg = prev.cfg;
            this.state.sel = null; this.state.multiSel = [];
            this.render(); this.renderProps(); this.updateCanvasSize();
        }
    }

    // ============================================
    // Element Operations
    // ============================================
    addElement(type, txt, x = 20, y = 20, w = 100, h = 30, fs = 12, fw = 'normal', bg = 'transparent', br = 'none') {
        const id = Math.random().toString(36).substr(2, 9);
        const item = { id, type, txt, x, y, w, h, fs, fw, bg, br, color: '#000000', align: 'center', locked: false };
        if (type === 'field') item.field = txt;
        if (type === 'footer' && y === null) item.y = (this.state.cfg.h * 3.78) - 30;
        this.state.els.push(item);
        this.state.sel = id;
        this.render(); this.saveState();
        return item;
    }

    addTable() {
        const cols = parseInt(document.getElementById('tbl-cols').value, 10);
        const headH = parseInt(document.getElementById('tbl-hh').value, 10);
        const item = { id: Math.random().toString(), type: 'table', x: 20, y: 80, w: 0, h: 0, cols: Array(cols).fill('').map((_, i) => 'H' + (i + 1)), fields: Array(cols).fill(''), colW: Array(cols).fill(50), headH, rowH: 30 };
        this.state.els.push(item);
        this.state.cfg.mode = 'group';
        this.state.sel = item.id;
        closeModal('modal-tbl');
        this.render(); this.saveState();
    }

    duplicateElement() {
        const ids = this.state.multiSel.length ? this.state.multiSel : (this.state.sel ? [this.state.sel] : []);
        ids.forEach(id => {
            const orig = this.state.els.find(x => x.id === id);
            if (orig) {
                const clone = JSON.parse(JSON.stringify(orig));
                clone.id = Math.random().toString(36);
                clone.x += 10; clone.y += 10;
                this.state.els.push(clone);
            }
        });
        this.render(); this.saveState();
    }

    deleteElement() {
        const ids = this.state.multiSel.length ? this.state.multiSel : (this.state.sel ? [this.state.sel] : []);
        this.state.els = this.state.els.filter(x => !ids.includes(x.id) || x.locked);
        this.state.sel = null; this.state.multiSel = [];
        this.render(); this.saveState();
    }

    setZOrder(direction) {
        const id = this.state.sel;
        const idx = this.state.els.findIndex(x => x.id === id);
        if (idx < 0) return;
        const el = this.state.els.splice(idx, 1)[0];
        direction === 1 ? this.state.els.push(el) : this.state.els.unshift(el);
        this.render(); this.saveState();
    }

    toggleLock() {
        const item = this.state.els.find(x => x.id === this.state.sel);
        if (item) { item.locked = !item.locked; this.render(); }
    }

    updateElement(id, key, value) {
        const el = this.state.els.find(x => x.id === id);
        if (el) { el[key] = value; this.render(); }
    }

    updateTableColumn(id, index, value) {
        const el = this.state.els.find(x => x.id === id);
        if (el) { el.cols[index] = value; this.render(); }
    }

    alignElements(direction) {
        if (this.state.multiSel.length < 2) { alert('請先按住 Shift 選取多個元件'); return; }
        const items = this.state.multiSel.map(id => this.state.els.find(x => x.id === id)).filter(x => x && !x.locked);
        if (!items.length) return;
        let ref;
        switch (direction) {
            case 'left': ref = Math.min(...items.map(i => i.x)); items.forEach(i => i.x = ref); break;
            case 'right': ref = Math.max(...items.map(i => i.x + i.w)); items.forEach(i => i.x = ref - i.w); break;
            case 'center': ref = items.reduce((a, i) => a + i.x + i.w / 2, 0) / items.length; items.forEach(i => i.x = ref - i.w / 2); break;
            case 'top': ref = Math.min(...items.map(i => i.y)); items.forEach(i => i.y = ref); break;
            case 'bottom': ref = Math.max(...items.map(i => i.y + i.h)); items.forEach(i => i.y = ref - i.h); break;
            case 'middle': ref = items.reduce((a, i) => a + i.y + i.h / 2, 0) / items.length; items.forEach(i => i.y = ref - i.h / 2); break;
        }
        this.render(); this.saveState();
    }

    selectAll() {
        if (!this.state.els.length) return;
        this.state.multiSel = this.state.els.map(el => el.id);
        this.state.sel = this.state.els[0].id;
        this.render();
    }

    // ============================================
    // Rendering
    // ============================================
    render() {
        if (this.renderPending) return;
        this.renderPending = true;
        requestAnimationFrame(() => { this.doRender(); this.renderPending = false; });
    }

    doRender() {
        const canvas = this.dom.canvas;
        const { splitLine, guideX, guideY, watermark } = this.dom;
        canvas.innerHTML = '';
        canvas.appendChild(splitLine);
        canvas.appendChild(guideX);
        canvas.appendChild(guideY);
        canvas.appendChild(watermark);
        splitLine.style.display = this.state.cfg.mode === 'group' ? 'block' : 'none';
        splitLine.style.top = this.state.cfg.splitY + 'px';
        watermark.textContent = this.state.cfg.watermark;
        this.state.els.forEach((item, idx) => {
            if (item.type === 'table') this.renderTable(item, idx);
            else this.renderItem(item, idx);
        });
        const bar = this.dom.floatBar;
        if (this.state.sel) {
            const sel = this.state.els.find(x => x.id === this.state.sel);
            if (sel) {
                bar.style.display = 'flex';
                bar.style.top = (sel.y + this.state.cfg.offY - 50) + 'px';
                bar.style.left = (sel.x + this.state.cfg.offX) + 'px';
                const lockBtn = document.getElementById('btn-lock');
                if (lockBtn) lockBtn.innerHTML = `<span class="material-symbols-outlined">${sel.locked ? 'lock' : 'lock_open'}</span>`;
                this.renderProps(sel);
                return;
            }
        }
        bar.style.display = 'none';
        this.renderProps(null);
    }

    renderItem(item, idx) {
        const { cfg, sel, multiSel } = this.state;
        const div = document.createElement('div');
        div.className = 'canvas-element';
        if (sel === item.id) div.classList.add('selected');
        if (multiSel.includes(item.id)) div.classList.add('multi-selected');
        if (item.locked) div.classList.add('locked');
        if (item.type === 'formula') div.classList.add('formula-element');
        div.style.left = (item.x + cfg.offX) + 'px';
        div.style.top = (item.y + cfg.offY) + 'px';
        div.style.width = item.w + 'px';
        div.style.height = item.h + 'px';
        div.style.zIndex = idx + 1;
        div.style.background = item.bg;
        div.style.border = item.br;
        if (item.br === 'none' && sel === item.id) div.style.border = '1px dashed #ccc';
        div.style.color = item.color;
        div.style.fontSize = item.fs + 'px';
        div.style.fontWeight = item.fw;
        const txt = item.type === 'field' ? `[${item.txt}]` : (item.type === 'formula' ? item.txt : item.txt);
        const justifyMap = { center: 'center', right: 'flex-end', left: 'flex-start' };
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = justifyMap[item.align] || 'center';
        div.innerHTML = `<div class="canvas-element-value" style="text-align:${item.align}">${txt}</div>`;
        if (sel === item.id && !item.locked) {
            const handle = document.createElement('div');
            handle.className = 'resize-handle rh-se';
            handle.addEventListener('mousedown', (e) => { e.stopPropagation(); this.startDrag(e, item, 'resize'); });
            div.appendChild(handle);
        }
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                if (!this.state.multiSel.includes(item.id)) this.state.multiSel.push(item.id);
                else this.state.multiSel = this.state.multiSel.filter(id => id !== item.id);
            } else {
                this.state.sel = item.id;
                this.state.multiSel = [];
            }
            this.render();
            if (!item.locked) this.startDrag(e, item, 'move');
        });
        this.dom.canvas.appendChild(div);
    }

    renderTable(item, idx) {
        const { cfg, sel } = this.state;
        const totalWidth = item.colW.reduce((a, b) => a + b, 0);
        const totalHeight = item.headH + item.rowH;
        const div = document.createElement('div');
        div.className = 'canvas-element table-element ' + (sel === item.id ? 'selected' : '');
        div.style.left = (item.x + cfg.offX) + 'px';
        div.style.top = (item.y + cfg.offY) + 'px';
        div.style.width = totalWidth + 'px';
        div.style.height = totalHeight + 'px';
        div.style.zIndex = idx + 1;
        let html = '';
        if (item.headH > 0) {
            html += `<div style="display:flex;height:${item.headH}px">`;
            item.cols.forEach((col, i) => html += `<div style="width:${item.colW[i]}px;border:1px solid #000;background:#f8fafc;padding:4px;font-size:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center">${col}</div>`);
            html += '</div>';
        }
        html += `<div style="display:flex;height:${item.rowH}px">`;
        item.fields.forEach((field, i) => html += `<div class="drop-zone" data-id="${item.id}" data-idx="${i}" style="width:${item.colW[i]}px;border:1px solid #94a3b8;padding:4px;font-size:12px;background:rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center">${field ? `[${field}]` : ''}</div>`);
        html += '</div>';
        div.innerHTML = html;
        div.addEventListener('mousedown', (e) => { e.stopPropagation(); this.state.sel = item.id; this.render(); this.startDrag(e, item, 'move'); });
        div.querySelectorAll('.drop-zone').forEach(zone => {
            zone.addEventListener('dragover', (e) => e.preventDefault());
            zone.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); const field = e.dataTransfer.getData('f'); if (field) { item.fields[zone.dataset.idx] = field; this.render(); this.saveState(); } });
        });
        this.dom.canvas.appendChild(div);
    }

    startDrag(e, item, mode) {
        const startX = e.clientX, startY = e.clientY;
        const origX = item.x, origY = item.y, origW = item.w, origH = item.h;
        const { guideX, guideY } = this.dom;
        const onMove = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (mode === 'move') {
                let newX = origX + dx, newY = origY + dy, snapX = null, snapY = null;
                this.state.els.forEach(other => {
                    if (other.id === item.id) return;
                    if (Math.abs(newX - other.x) < 5) { newX = other.x; snapY = other.x; }
                    else if (Math.abs(newX - (other.x + other.w)) < 5) { newX = other.x + other.w; snapY = other.x + other.w; }
                    if (Math.abs(newY - other.y) < 5) { newY = other.y; snapX = other.y; }
                    else if (Math.abs(newY - (other.y + other.h)) < 5) { newY = other.y + other.h; snapX = other.y + other.h; }
                });
                item.x = newX; item.y = newY;
                guideX.style.display = snapX !== null ? 'block' : 'none';
                if (snapX) guideX.style.top = (snapX + this.state.cfg.offY) + 'px';
                guideY.style.display = snapY !== null ? 'block' : 'none';
                if (snapY) guideY.style.left = (snapY + this.state.cfg.offX) + 'px';
            } else {
                item.w = Math.max(2, origW + dx);
                item.h = Math.max(2, origH + dy);
            }
            this.render();
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); guideX.style.display = 'none'; guideY.style.display = 'none'; this.saveState(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ============================================
    // Properties Panel
    // ============================================
    renderProps(item = null) {
        const props = this.dom.props;
        if (!item) {
            props.innerHTML = `
                <div class="form-group"><label class="form-label">紙張</label><select class="form-control" id="prop-size"><option value="a4" ${this.state.cfg.size === 'a4' ? 'selected' : ''}>A4</option><option value="a5" ${this.state.cfg.size === 'a5' ? 'selected' : ''}>A5</option></select></div>
                <div class="form-group"><label class="form-label">方向</label><select class="form-control" id="prop-orient"><option value="landscape" ${this.state.cfg.orient === 'landscape' ? 'selected' : ''}>橫向</option><option value="portrait" ${this.state.cfg.orient === 'portrait' ? 'selected' : ''}>直向</option></select></div>
                <div class="form-group"><label class="form-label">模式</label><select class="form-control" id="prop-mode"><option value="single" ${this.state.cfg.mode === 'single' ? 'selected' : ''}>單頁</option><option value="group" ${this.state.cfg.mode === 'group' ? 'selected' : ''}>自動分頁</option></select></div>
                <div class="form-group"><label class="form-label">全域偏移</label><div class="form-row"><input class="form-control" type="number" id="prop-offX" placeholder="X" value="${this.state.cfg.offX}"><input class="form-control" type="number" id="prop-offY" placeholder="Y" value="${this.state.cfg.offY}"></div></div>`;
            props.querySelector('#prop-size').addEventListener('change', (e) => { this.state.cfg.size = e.target.value; this.updateCanvasSize(); this.saveState(); });
            props.querySelector('#prop-orient').addEventListener('change', (e) => { this.state.cfg.orient = e.target.value; this.updateCanvasSize(); this.saveState(); });
            props.querySelector('#prop-mode').addEventListener('change', (e) => { this.state.cfg.mode = e.target.value; this.render(); this.saveState(); });
            props.querySelector('#prop-offX').addEventListener('change', (e) => { this.state.cfg.offX = parseInt(e.target.value, 10); this.render(); this.saveState(); });
            props.querySelector('#prop-offY').addEventListener('change', (e) => { this.state.cfg.offY = parseInt(e.target.value, 10); this.render(); this.saveState(); });
            return;
        }
        if (item.type !== 'table') {
            props.innerHTML = `
                <div class="form-group"><label class="form-label">文字內容</label><textarea rows="2" class="form-control" id="prop-txt">${item.txt}</textarea></div>
                <div class="form-group"><label class="form-label">字體大小</label><input type="number" class="form-control" id="prop-fs" value="${item.fs}"></div>
                <div class="form-row form-group"><div style="flex:1"><label class="form-label">文字色</label><input type="color" class="form-control" id="prop-color" style="height:30px" value="${item.color}"></div><div style="flex:1"><label class="form-label">背景色</label><input type="color" class="form-control" id="prop-bg" style="height:30px" value="${item.bg === 'transparent' ? '#ffffff' : item.bg}"></div></div>
                <div class="form-group"><label class="form-label">邊框</label><select class="form-control" id="prop-br"><option value="none" ${item.br === 'none' ? 'selected' : ''}>無</option><option value="1px solid #000000" ${item.br.includes('1px') ? 'selected' : ''}>細線</option><option value="2px solid #000000" ${item.br.includes('2px') ? 'selected' : ''}>粗線</option></select></div>
                <div class="form-group"><label class="form-label">位置 (X, Y)</label><div class="form-row"><input type="number" class="form-control" id="prop-x" value="${item.x}"><input type="number" class="form-control" id="prop-y" value="${item.y}"></div></div>
                <div class="form-group"><label class="form-label">尺寸 (W, H)</label><div class="form-row"><input type="number" class="form-control" id="prop-w" value="${item.w}"><input type="number" class="form-control" id="prop-h" value="${item.h}"></div></div>`;
            props.querySelector('#prop-txt').addEventListener('input', (e) => this.updateElement(item.id, 'txt', e.target.value));
            props.querySelector('#prop-fs').addEventListener('input', (e) => this.updateElement(item.id, 'fs', parseInt(e.target.value, 10)));
            props.querySelector('#prop-color').addEventListener('input', (e) => this.updateElement(item.id, 'color', e.target.value));
            props.querySelector('#prop-bg').addEventListener('input', (e) => this.updateElement(item.id, 'bg', e.target.value));
            props.querySelector('#prop-br').addEventListener('change', (e) => this.updateElement(item.id, 'br', e.target.value));
            props.querySelector('#prop-x').addEventListener('change', (e) => this.updateElement(item.id, 'x', parseInt(e.target.value, 10)));
            props.querySelector('#prop-y').addEventListener('change', (e) => this.updateElement(item.id, 'y', parseInt(e.target.value, 10)));
            props.querySelector('#prop-w').addEventListener('change', (e) => this.updateElement(item.id, 'w', parseInt(e.target.value, 10)));
            props.querySelector('#prop-h').addEventListener('change', (e) => this.updateElement(item.id, 'h', parseInt(e.target.value, 10)));
        } else {
            let html = `<div class="form-group"><label class="form-label">表頭高 (0=隱藏)</label><input class="form-control" type="number" id="prop-headH" value="${item.headH}"></div><div class="form-label" style="margin-top:10px">欄位名稱</div>`;
            item.cols.forEach((col, i) => html += `<div style="margin-top:5px"><input class="form-control prop-col" data-idx="${i}" value="${col}"></div>`);
            props.innerHTML = html;
            props.querySelector('#prop-headH').addEventListener('change', (e) => this.updateElement(item.id, 'headH', parseInt(e.target.value, 10)));
            props.querySelectorAll('.prop-col').forEach(input => input.addEventListener('input', (e) => this.updateTableColumn(item.id, parseInt(e.target.dataset.idx, 10), e.target.value)));
        }
    }

    switchTab(btn, tabId) {
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    }

    // ============================================
    // Data Import (Excel/CSV/JSON)
    // ============================================
    async loadDataFile(input) {
        const file = input.files[0];
        if (!file) return;
        try {
            let data;
            if (file.name.endsWith('.csv')) {
                const text = await file.text();
                data = this.parseCSV(text);
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                data = XLSX.utils.sheet_to_json(sheet);
            }
            if (data && data.length) {
                this.state.data = data;
                this.state.fields = Object.keys(data[0]);
                this.detectFieldTypes();
                this.renderFields();
                this.updateDataInfo();
                alert(`已載入 ${data.length} 筆資料`);
            }
        } catch (err) {
            console.error('載入失敗:', err);
            alert('檔案解析失敗');
        }
    }

    parseCSV(text) {
        const rows = text.trim().split('\n');
        const headers = rows[0].split(',').map(s => s.trim());
        return rows.slice(1).map(row => {
            const values = row.split(',');
            return headers.reduce((obj, key, idx) => { obj[key] = values[idx]?.trim(); return obj; }, {});
        });
    }

    importJson() {
        try {
            const text = document.getElementById('json-input').value;
            const data = JSON.parse(text);
            if (!Array.isArray(data) || !data.length) { alert('請輸入有效的 JSON 陣列'); return; }
            this.state.data = data;
            this.state.fields = Object.keys(data[0]);
            this.detectFieldTypes();
            this.renderFields();
            this.updateDataInfo();
            closeModal('modal-json');
            alert(`已載入 ${data.length} 筆資料`);
        } catch (err) {
            alert('JSON 格式錯誤');
        }
    }

    detectFieldTypes() {
        this.state.fieldTypes = {};
        this.state.fields.forEach(field => {
            const values = this.state.data.map(d => d[field]).filter(v => v !== null && v !== undefined && v !== '');
            if (!values.length) { this.state.fieldTypes[field] = 'text'; return; }
            const isNumber = values.every(v => !isNaN(parseFloat(v)));
            const isDate = values.every(v => !isNaN(Date.parse(v)));
            this.state.fieldTypes[field] = isNumber ? 'number' : (isDate ? 'date' : 'text');
        });
    }

    updateDataInfo() {
        this.dom.dataInfo?.classList.remove('hidden');
        if (this.dom.dataCount) this.dom.dataCount.textContent = `${this.state.data.length} 筆資料`;
        if (this.dom.groupField) {
            this.dom.groupField.innerHTML = '<option value="">-- 選擇欄位 --</option>' + this.state.fields.map(f => `<option value="${f}">${f}</option>`).join('');
        }
    }

    clearData() {
        this.state.data = [];
        this.state.fields = [];
        this.state.fieldTypes = {};
        this.dom.dataInfo?.classList.add('hidden');
        this.dom.fieldList.innerHTML = '';
    }

    renderFields() {
        const container = this.dom.fieldList;
        container.innerHTML = '';
        this.state.fields.forEach(field => {
            const tag = document.createElement('div');
            tag.className = 'field-tag';
            if (this.state.fieldTypes[field] === 'number') tag.classList.add('field-number');
            if (this.state.fieldTypes[field] === 'date') tag.classList.add('field-date');
            tag.textContent = field;
            tag.draggable = true;
            tag.addEventListener('dragstart', (e) => { e.dataTransfer.setData('type', 'field'); e.dataTransfer.setData('f', field); });
            container.appendChild(tag);
        });
    }

    showDataPreview() {
        const content = document.getElementById('data-preview-content');
        const count = document.getElementById('preview-count');
        if (!this.state.data.length) { content.innerHTML = '<p class="hint-text">無資料</p>'; return; }
        const preview = this.state.data.slice(0, 20);
        count.textContent = `(顯示前 20 筆，共 ${this.state.data.length} 筆)`;
        content.innerHTML = `<table><thead><tr>${this.state.fields.map(f => `<th>${f}</th>`).join('')}</tr></thead><tbody>${preview.map(row => `<tr>${this.state.fields.map(f => `<td>${row[f] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        openModal('modal-data-preview');
    }

    // ============================================
    // Formula Engine
    // ============================================
    evaluateFormula(formula) {
        if (!formula.startsWith('=')) return formula;
        const expr = formula.substring(1).toUpperCase();
        const match = expr.match(/(SUM|COUNT|AVG)\(([^)]+)\)/);
        if (!match) return formula;
        const [, func, field] = match;
        const values = this.state.data.map(d => parseFloat(d[field]) || 0);
        switch (func) {
            case 'SUM': return values.reduce((a, b) => a + b, 0).toLocaleString();
            case 'COUNT': return values.length.toString();
            case 'AVG': return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '0';
            default: return formula;
        }
    }

    applyConditionalFormat(value, format) {
        if (format === 'none') return '';
        const num = parseFloat(value);
        if (isNaN(num)) return '';
        if (format === 'sign') return num > 0 ? 'value-positive' : (num < 0 ? 'value-negative' : 'value-zero');
        return '';
    }

    setCondFormat(value) { this.state.cfg.condFormat = value; }

    setWatermark() {
        this.state.cfg.watermark = document.getElementById('watermark-text').value;
        this.render();
    }

    enableGrouping() {
        const field = this.dom.groupField?.value;
        if (!field) { alert('請選擇分組欄位'); return; }
        this.state.cfg.groupField = field;
        alert(`已啟用依 "${field}" 分組`);
    }

    // ============================================
    // PDF Background
    // ============================================
    async loadPdfBg(input) {
        const file = input.files[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(buffer).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            this.state.bgUrl = canvas.toDataURL();
            this.updateBgOpacity(50);
            this.dom.bgCtrl.classList.add('show');
        } catch (error) {
            console.error('PDF 載入失敗:', error);
            alert('PDF 載入失敗');
        }
    }

    updateBgOpacity(value) {
        if (!this.state.bgUrl) return;
        const alpha = value / 100;
        const overlay = `linear-gradient(rgba(255,255,255,${alpha}),rgba(255,255,255,${alpha}))`;
        this.dom.canvas.style.backgroundImage = `${overlay}, url(${this.state.bgUrl})`;
        this.dom.canvas.style.backgroundSize = '100% 100%';
    }

    clearBg() {
        this.state.bgUrl = null;
        this.dom.canvas.style.backgroundImage = 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)';
        this.dom.canvas.style.backgroundSize = '20px 20px';
        this.dom.bgCtrl.classList.remove('show');
        this.dom.fileInputs.pdf.value = '';
    }

    // ============================================
    // Project Save/Load
    // ============================================
    saveProject() {
        const blob = new Blob([JSON.stringify({ v: '10.0', ...this.state })], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `report-${Date.now()}.prs`;
        link.click();
    }

    loadProject() { this.dom.fileInputs.proj.click(); }

    readProject(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const project = JSON.parse(e.target.result);
                this.state.els = project.els || [];
                this.state.cfg = project.cfg || this.state.cfg;
                this.state.data = project.data || [];
                this.state.fields = project.fields || [];
                this.render(); this.renderProps(); this.renderFields();
                alert('專案已載入');
            } catch (err) { alert('格式錯誤'); }
        };
        reader.readAsText(file);
    }

    // ============================================
    // Demo Templates
    // ============================================
    loadDemo(type) {
        if (!confirm('覆蓋目前內容？')) return;
        this.state.els = [];
        if (type === 'invoice') {
            this.state.cfg.mode = 'group';
            this.state.cfg.splitY = 160;
            this.addElement('text', '', 20, 110, 700, 2, 12, 'normal', 'transparent', '2px solid #000000');
            this.addElement('title', '電子發票', 250, 40, 300, 30, 24, 'bold');
            this.addElement('text', '日期: 2025-01-01', 500, 80, 200, 20);
            const table = { id: 't1', type: 'table', x: 40, y: 170, cols: ['品名', '數量', '單價', '金額'], fields: ['品名', '數量', '單價', '金額'], colW: [250, 80, 100, 100], headH: 30, rowH: 30 };
            this.state.els.push(table);
            this.state.data = [{ 品名: 'A', 數量: '1', 單價: '10', 金額: '10' }, { 品名: 'B', 數量: '2', 單價: '20', 金額: '40' }];
        } else if (type === 'label') {
            this.state.cfg.mode = 'single';
            this.addElement('text', '', 10, 10, 300, 180, 12, 'normal', 'transparent', '2px solid #000000');
            this.addElement('field', '品名', 50, 50, 200, 30, 20, 'bold');
            this.state.data = [{ 品名: '商品A' }];
        }
        this.state.fields = Object.keys(this.state.data[0] || {});
        this.renderFields(); this.render(); this.saveState();
    }

    generateGovTable() {
        if (!confirm('清空畫布並建立「收支概況彙總表」？')) return;
        this.state.els = [];
        this.state.cfg.orient = 'landscape';
        this.state.cfg.mode = 'group';
        this.state.cfg.splitY = 155;
        this.updateCanvasSize();

        // 標題
        this.addElement('title', '近10年度收支概況彙總表', 380, 25, 360, 30, 18, 'bold');
        const unitEl = this.addElement('text', '單位：新臺幣千元', 980, 50, 120, 18, 10, 'normal', 'transparent', 'none');
        unitEl.align = 'right';

        // 表頭第一列 (主標題) Y=70
        const row1Y = 70, row1H = 25, row2Y = 95, row2H = 25;
        const border = '1px solid #000000';

        // 第一列標題 (部分跨兩列)
        const headers1 = [
            { t: '年度別', x: 30, w: 55, h: 50 },
            { t: '業務總收入\n(含基金來源)', x: 85, w: 85, h: 50 },
            { t: '業務總支出\n(含基金用途)', x: 170, w: 85, h: 50 },
            { t: '年度賸餘\n(短 絀)', x: 255, w: 70, h: 50 },
            { t: '賸 餘\n繳庫數', x: 325, w: 55, h: 50 },
            { t: '購建固定資產', x: 380, w: 80, h: 50 },
            // 合併欄位
            { t: '國 庫 增 撥', x: 460, w: 160, h: row1H, merged: true },
            { t: '資    產', x: 620, w: 120, h: row1H, merged: true },
            { t: '負    債', x: 740, w: 80, h: row1H, merged: true },
            { t: '累積賸餘\n(基金餘額)', x: 820, w: 85, h: 50 }
        ];

        // 繪製第一列
        headers1.forEach(h => {
            const el = this.addElement('text', h.t, h.x, row1Y, h.w, h.h, 11, 'bold', 'transparent', border);
            el.align = 'center';
        });

        // 第二列 (合併欄位的子標題) Y=95
        const headers2 = [
            { t: '國庫增撥基金', x: 460, w: 80 },
            { t: '政府補助收入', x: 540, w: 80 },
            { t: '現    金', x: 620, w: 120 },
            { t: '長債餘額', x: 740, w: 80 }
        ];

        headers2.forEach(h => {
            const el = this.addElement('text', h.t, h.x, row2Y, h.w, row2H, 11, 'bold', 'transparent', border);
            el.align = 'center';
        });

        // 資料表格 (隱藏表頭)
        const colWidths = [55, 85, 85, 70, 55, 80, 80, 80, 120, 80, 85];
        const table = {
            id: Math.random().toString(),
            type: 'table',
            x: 30,
            y: 120, // 接在表頭下方
            w: 0, h: 0,
            cols: Array(11).fill(''),
            fields: Array(11).fill(''),
            colW: colWidths,
            headH: 0, // 隱藏內建表頭
            rowH: 28
        };
        this.state.els.push(table);

        // 底部備註
        const noteEl = this.addElement('text', '註：115年度為預算案數，114年度為追加決算數，餘為審定決算數。', 30, 450, 600, 20, 10, 'normal', 'transparent', 'none');
        noteEl.align = 'left';

        // 自動填入範例年度數據
        this.state.data = [];
        for (let i = 115; i >= 106; i--) {
            this.state.data.push({
                年度: i.toString(),
                業務總收入: '',
                業務總支出: '',
                年度賸餘: '',
                賸餘繳庫: '',
                購建固定資產: '',
                國庫增撥基金: '',
                政府補助收入: '',
                現金: '',
                長債餘額: '',
                累積賸餘: ''
            });
        }
        this.state.fields = Object.keys(this.state.data[0]);
        this.renderFields();

        this.state.sel = table.id;
        this.render();
        this.saveState();
        alert('報表結構已建立！請使用「資料/底圖」Tab 匯入 Excel/CSV 資料，並拖曳欄位至表格進行綁定。');
    }

    // ============================================
    // Print & PDF
    // ============================================
    generatePreview() {
        const pages = document.getElementById('preview-pages');
        pages.innerHTML = '';
        const pageCount = Math.max(1, Math.ceil(this.state.data.length / 10) || 1);
        for (let i = 0; i < Math.min(pageCount, 10); i++) {
            pages.innerHTML += `<div class="preview-page"><div class="preview-page-thumb">預覽縮圖</div><div class="preview-page-label">第 ${i + 1} 頁</div></div>`;
        }
        openModal('modal-preview');
    }

    printDoc() {
        const c = this.dom.printContainer;
        c.innerHTML = '';
        const style = document.createElement('style');
        style.innerHTML = `@media print{@page{margin:0}body{visibility:hidden}#print-container{visibility:visible;position:absolute;left:0;top:0}.p-pg{page-break-after:always;position:relative;height:${this.state.cfg.h}mm;width:${this.state.cfg.w}mm;overflow:hidden}.p-el{position:absolute;display:flex;align-items:center;overflow:hidden}}`;
        c.appendChild(style);
        const dt = this.state.data.length ? this.state.data : [{}];
        if (this.state.cfg.mode === 'single') {
            dt.forEach(d => {
                const pg = document.createElement('div');
                pg.className = 'p-pg';
                if (this.state.cfg.watermark) {
                    const wm = document.createElement('div');
                    wm.className = 'watermark';
                    wm.textContent = this.state.cfg.watermark;
                    pg.appendChild(wm);
                }
                this.state.els.forEach(e => pg.appendChild(this.createPrintElement(e, d)));
                c.appendChild(pg);
            });
        } else {
            let pg = document.createElement('div');
            pg.className = 'p-pg';
            this.state.els.filter(e => e.y < this.state.cfg.splitY).forEach(e => pg.appendChild(this.createPrintElement(e, dt[0])));
            let cy = this.state.cfg.splitY;
            const tbl = this.state.els.find(e => e.type === 'table');
            if (tbl) {
                if (tbl.headH > 0) { const th = this.createPrintTable(tbl, null, true); th.style.top = cy + 'px'; th.style.left = (tbl.x + this.state.cfg.offX) + 'px'; pg.appendChild(th); cy += tbl.headH; }
                dt.forEach(d => {
                    const tr = this.createPrintTable(tbl, d, false);
                    tr.style.top = cy + 'px';
                    tr.style.left = (tbl.x + this.state.cfg.offX) + 'px';
                    pg.appendChild(tr);
                    cy += tbl.rowH;
                    if (cy > (this.state.cfg.h * 3.78) - 50) {
                        c.appendChild(pg);
                        pg = document.createElement('div');
                        pg.className = 'p-pg';
                        this.state.els.filter(e => e.y < this.state.cfg.splitY).forEach(e => pg.appendChild(this.createPrintElement(e, dt[0])));
                        cy = this.state.cfg.splitY;
                        if (tbl.headH > 0) { const nth = this.createPrintTable(tbl, null, true); nth.style.top = cy + 'px'; nth.style.left = (tbl.x + this.state.cfg.offX) + 'px'; pg.appendChild(nth); cy += tbl.headH; }
                    }
                });
            }
            c.appendChild(pg);
        }
        setTimeout(() => window.print(), 500);
    }

    createPrintElement(item, data) {
        const div = document.createElement('div');
        div.className = 'p-el';
        div.style.left = (item.x + this.state.cfg.offX) + 'px';
        div.style.top = (item.y + this.state.cfg.offY) + 'px';
        div.style.width = item.w + 'px';
        div.style.height = item.h + 'px';
        div.style.fontSize = item.fs + 'px';
        div.style.fontWeight = item.fw;
        div.style.background = item.bg;
        div.style.border = item.br;
        div.style.color = item.color;
        const justifyMap = { center: 'center', right: 'flex-end', left: 'flex-start' };
        div.style.justifyContent = justifyMap[item.align] || 'center';
        let value = item.type === 'field' ? (data[item.txt] || '') : item.txt;
        if (item.type === 'formula') value = this.evaluateFormula(item.txt);
        if (item.type === 'footer' || item.type === 'header') {
            value = value.replace('{{DATE}}', new Date().toLocaleDateString());
        }
        const formatClass = this.applyConditionalFormat(value, this.state.cfg.condFormat);
        if (formatClass) div.classList.add(formatClass);
        if (item.type !== 'table') div.textContent = value;
        return div;
    }

    createPrintTable(item, data, isHeader) {
        const row = document.createElement('div');
        row.className = 'p-el';
        row.style.width = item.colW.reduce((a, b) => a + b, 0) + 'px';
        row.style.height = (isHeader ? item.headH : item.rowH) + 'px';
        item.cols.forEach((col, i) => {
            const cell = document.createElement('div');
            cell.style.width = item.colW[i] + 'px';
            cell.style.height = '100%';
            cell.style.border = '1px solid #000';
            cell.style.fontSize = '12px';
            cell.style.padding = '2px';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            const value = isHeader ? col : (data[item.fields[i]] || '');
            cell.textContent = value;
            const formatClass = this.applyConditionalFormat(value, this.state.cfg.condFormat);
            if (formatClass) cell.classList.add(formatClass);
            row.appendChild(cell);
        });
        return row;
    }

    async downloadPdf() {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: this.state.cfg.orient === 'landscape' ? 'l' : 'p', unit: 'mm', format: this.state.cfg.size });
        const canvas = this.dom.canvas;
        try {
            const canvasImg = await html2canvas(canvas, { scale: 2, useCORS: true });
            const imgData = canvasImg.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, this.state.cfg.w, this.state.cfg.h);
            pdf.save(`report-${Date.now()}.pdf`);
        } catch (err) {
            console.error('PDF 產生失敗:', err);
            alert('PDF 產生失敗');
        }
    }
}

// ============================================
// Global Instance & Functions
// ============================================
let app;
document.addEventListener('DOMContentLoaded', () => { app = new ReportBuilder(); });

function undo() { app.undo(); }
function saveProject() { app.saveProject(); }
function loadProject() { app.loadProject(); }
function printDoc() { app.printDoc(); }
function downloadPdf() { app.downloadPdf(); }
function addEl(type, txt, x, y, w, h, fs, fw, bg, br) { return app.addElement(type, txt, x, y, w, h, fs, fw, bg, br); }
function addTable() { app.addTable(); }
function dupEl() { app.duplicateElement(); }
function delEl() { app.deleteElement(); }
function zOrder(d) { app.setZOrder(d); }
function toggleLock() { app.toggleLock(); }
function genGovTable() { app.generateGovTable(); }
function loadDemo(t) { app.loadDemo(t); }
function updBgOp(v) { app.updateBgOpacity(v); }
function clrBg() { app.clearBg(); }
function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function importJson() { app.importJson(); }
function saveTemplate() { app.saveTemplate(); }
function alignElements(d) { app.alignElements(d); }
function setCondFormat(v) { app.setCondFormat(v); }
function setWatermark() { app.setWatermark(); }
function enableGrouping() { app.enableGrouping(); }
function clearData() { app.clearData(); }
function selectAll() { app.selectAll(); }

// Panel Toggle Function
function togglePanel(side) {
    const panel = document.getElementById(`${side}-panel`);
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}
