// app.js - UI Logic and State Management
// API Key sudah di server (Vercel). Tidak ada API key di file ini.

document.addEventListener('DOMContentLoaded', () => {

    // ===== STATE =====
    let materials = [
        { id: 1, name: 'Barisan Aritmatika', percentage: 40 },
        { id: 2, name: 'Peluang', percentage: 30 },
        { id: 3, name: 'Statistika', percentage: 30 },
    ];
    let generatedQuestions = [];
    let currentConfig = {};

    // ===== DOM REFS =====
    const jenjangSelect    = document.getElementById('jenjang');
    const kelasSelect      = document.getElementById('kelas');
    const materiContainer  = document.getElementById('materi-container');
    const addMateriBtn     = document.getElementById('add-materi-btn');
    const materiTotalSpan  = document.getElementById('materi-total');
    const bloomTotalSpan   = document.getElementById('bloom-total');
    const bloomInputs      = document.querySelectorAll('.bloom-input');
    const generateBtn      = document.getElementById('generate-btn');
    const loadingOverlay   = document.getElementById('loading-overlay');
    const progressBar      = document.getElementById('progress-bar');
    const loadingDesc      = document.getElementById('loading-desc');
    const loadingCount     = document.getElementById('loading-count');
    const configSection    = document.getElementById('config-section');
    const resultSection    = document.getElementById('result-section');
    const resultSubtitle   = document.getElementById('result-subtitle');
    const questionsContainer = document.getElementById('questions-container');
    const keyContainer     = document.getElementById('key-container');
    const kisiContainer    = document.getElementById('kisi-container');
    const backConfigBtn    = document.getElementById('back-config-btn');
    const regenerateAllBtn = document.getElementById('regenerate-all-btn');

    // Tabs
    const btnTabQuestions  = document.getElementById('btn-tab-questions');
    const btnTabKey        = document.getElementById('btn-tab-key');
    const btnTabKisi       = document.getElementById('btn-tab-kisi');
    const viewQuestions    = document.getElementById('view-questions');
    const viewKey          = document.getElementById('view-key');
    const viewKisi         = document.getElementById('view-kisi');

    // Edit Modal
    const editModal        = document.getElementById('edit-modal');
    const cancelEditBtn    = document.getElementById('cancel-edit-btn');
    const saveEditBtn      = document.getElementById('save-edit-btn');

    // ===== INIT =====
    updateKelasOptions();
    renderMateri();

    // ===== EVENT LISTENERS =====
    jenjangSelect.addEventListener('change', updateKelasOptions);
    addMateriBtn.addEventListener('click', addMateri);
    bloomInputs.forEach(inp => inp.addEventListener('input', updateBloomTotal));
    generateBtn.addEventListener('click', handleGenerate);
    backConfigBtn.addEventListener('click', () => {
        resultSection.classList.add('hidden');
        configSection.classList.remove('hidden');
    });
    regenerateAllBtn.addEventListener('click', handleRegenerateAll);
    btnTabQuestions.addEventListener('click', () => switchTab('questions'));
    btnTabKey.addEventListener('click',       () => switchTab('key'));
    btnTabKisi.addEventListener('click',      () => switchTab('kisi'));
    cancelEditBtn.addEventListener('click',   () => editModal.classList.add('hidden'));
    saveEditBtn.addEventListener('click', saveEdit);

    // ===== KELAS OPTIONS =====
    function updateKelasOptions() {
        const jenjang = jenjangSelect.value;
        kelasSelect.innerHTML = '';
        const map = { SD: [1,2,3,4,5,6], SMP: [7,8,9], SMA: [10,11,12], SMK: [10,11,12] };
        (map[jenjang] || []).forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = `Kelas ${cls}`;
            kelasSelect.appendChild(opt);
        });
    }

    // ===== MATERI =====
    function renderMateri() {
        materiContainer.innerHTML = '';
        let total = 0;
        materials.forEach(mat => {
            total += Number(mat.percentage);
            const row = document.createElement('div');
            row.className = 'materi-row';
            row.innerHTML = `
                <input type="text" placeholder="Nama Materi" value="${escapeHtml(mat.name)}"
                    onchange="window._updateMateriName(${mat.id}, this.value)">
                <div class="input-suffix">
                    <input type="number" value="${mat.percentage}" min="0" max="100"
                        onchange="window._updateMateriPct(${mat.id}, this.value)">
                    <span>%</span>
                </div>
                <button class="icon-btn danger" onclick="window._deleteMat(${mat.id})">
                    <i data-lucide="trash-2"></i>
                </button>`;
            materiContainer.appendChild(row);
        });
        lucide.createIcons();
        updateMateriBadge(total);
    }

    window._updateMateriName = (id, val) => {
        const m = materials.find(x => x.id === id);
        if (m) m.name = val;
    };
    window._updateMateriPct = (id, val) => {
        const m = materials.find(x => x.id === id);
        if (m) m.percentage = Number(val);
        const total = materials.reduce((s, x) => s + x.percentage, 0);
        updateMateriBadge(total);
    };
    window._deleteMat = (id) => {
        materials = materials.filter(x => x.id !== id);
        renderMateri();
    };

    function addMateri() {
        materials.push({ id: Date.now(), name: '', percentage: 0 });
        renderMateri();
    }

    function updateMateriBadge(total) {
        materiTotalSpan.className = total === 100 ? 'badge badge-success' : 'badge badge-warning';
        materiTotalSpan.textContent = total === 100 ? 'Total: 100% ✓' : `Total: ${total}% ⚠`;
    }

    // ===== BLOOM TOTAL =====
    function updateBloomTotal() {
        let total = 0;
        bloomInputs.forEach(inp => total += Number(inp.value));
        bloomTotalSpan.className = total === 100 ? 'badge badge-success' : 'badge badge-warning';
        bloomTotalSpan.textContent = total === 100 ? 'Total: 100% ✓' : `Total: ${total}% ⚠`;
    }

    // ===== GENERATE =====
    async function handleGenerate() {
        // Validasi materi
        const mTotal = materials.reduce((s, m) => s + m.percentage, 0);
        if (mTotal !== 100) { alert('Distribusi Materi harus tepat 100%.'); return; }

        // Validasi bloom
        let bTotal = 0;
        const bloomDist = [];
        bloomInputs.forEach(inp => {
            const val = Number(inp.value);
            bTotal += val;
            bloomDist.push({ level: inp.dataset.level, percentage: val });
        });
        if (bTotal !== 100) { alert('Distribusi Taksonomi Bloom harus tepat 100%.'); return; }

        // Validasi jumlah soal
        const totalQ = Number(document.getElementById('jumlah-soal').value);
        if (totalQ < 1 || totalQ > 35) { alert('Jumlah soal harus antara 1 dan 35.'); return; }

        currentConfig = {
            jenjang: jenjangSelect.value,
            kelas: kelasSelect.value,
            mapel: document.getElementById('mapel').value,
            materials: [...materials],
            totalQuestions: totalQ,
            difficulty: document.getElementById('difficulty').value,
            bloomDistribution: bloomDist,
        };

        // Mulai loading
        generatedQuestions = [];
        configSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        progressBar.style.width = '0%';

        try {
            loadingDesc.textContent = 'Menyusun blueprint soal...';
            const blueprint = window.AIQEngine.generateBlueprint(currentConfig);

            for (let i = 0; i < blueprint.length; i++) {
                const item = blueprint[i];
                loadingDesc.textContent = `Membuat soal ${i + 1} dari ${blueprint.length}...`;
                loadingCount.textContent = `Materi: ${item.material} | Bloom: ${item.bloomLevel} | Kesulitan: ${item.difficulty}`;
                progressBar.style.width = `${((i) / blueprint.length) * 100}%`;

                try {
                    const q = await window.AIQEngine.generateQuestionWithAI(item, currentConfig);
                    generatedQuestions.push(q);
                } catch (err) {
                    generatedQuestions.push({
                        id: 'err_' + Date.now() + i,
                        question: `⚠️ Gagal: ${err.message}`,
                        options: { A: '-', B: '-', C: '-', D: '-' },
                        correctAnswer: 'A',
                        indicator: '-',
                        ...item,
                        locked: false,
                        editedByUser: false,
                    });
                }
            }

            progressBar.style.width = '100%';
            loadingDesc.textContent = 'Menyiapkan hasil...';
            loadingCount.textContent = '';

            await sleep(600);
            loadingOverlay.classList.add('hidden');
            resultSection.classList.remove('hidden');
            resultSubtitle.textContent = `${generatedQuestions.length} soal siap untuk direview`;
            renderResults();
            switchTab('questions');

        } catch (err) {
            loadingOverlay.classList.add('hidden');
            configSection.classList.remove('hidden');
            alert('Terjadi kesalahan: ' + err.message);
        }
    }

    // ===== REGENERATE ALL (unlocked) =====
    async function handleRegenerateAll() {
        const unlocked = generatedQuestions.filter(q => !q.locked);
        if (unlocked.length === 0) { alert('Semua soal terkunci. Tidak ada yang diregenerasi.'); return; }
        if (!confirm(`${unlocked.length} soal (yang tidak dikunci) akan diregenerasi. Lanjutkan?`)) return;

        loadingOverlay.classList.remove('hidden');
        resultSection.classList.add('hidden');
        progressBar.style.width = '0%';

        for (let i = 0; i < unlocked.length; i++) {
            const q = unlocked[i];
            loadingDesc.textContent = `Regenerate soal ${i + 1} dari ${unlocked.length}...`;
            loadingCount.textContent = `Materi: ${q.material} | Bloom: ${q.bloomLevel}`;
            progressBar.style.width = `${((i) / unlocked.length) * 100}%`;

            try {
                const newQ = await window.AIQEngine.generateQuestionWithAI(
                    { questionNumber: q.questionNumber, material: q.material, bloomLevel: q.bloomLevel, difficulty: q.difficulty },
                    currentConfig
                );
                newQ.id = q.id;
                const idx = generatedQuestions.findIndex(x => x.id === q.id);
                if (idx !== -1) generatedQuestions[idx] = newQ;
            } catch (e) {
                console.error('Gagal regenerate soal', q.questionNumber, e);
            }
        }

        progressBar.style.width = '100%';
        await sleep(400);
        loadingOverlay.classList.add('hidden');
        resultSection.classList.remove('hidden');
        renderResults();
    }

    // ===== RENDER RESULTS =====
    function renderResults() {
        renderQuestions();
        renderAnswerKey();
        renderKisiKisi();
        lucide.createIcons();
    }

    function renderQuestions() {
        questionsContainer.innerHTML = '';
        generatedQuestions.forEach(q => {
            const card = document.createElement('div');
            card.className = `question-card${q.locked ? ' locked' : ''}`;
            card.id = `card-${q.id}`;
            card.innerHTML = `
                <div class="q-header">
                    <div class="q-number">Soal ${q.questionNumber} ${q.locked ? '<span class="badge badge-warning">🔒 Locked</span>' : ''}</div>
                    <div class="q-meta no-print">
                        <span class="badge badge-primary">${escapeHtml(q.material)}</span>
                        <span class="badge badge-warning">${q.bloomLevel}</span>
                        <span class="badge">${q.difficulty}</span>
                    </div>
                </div>
                <div class="q-text">${escapeHtml(q.question)}</div>
                <div class="q-options">
                    ${['A','B','C','D'].map(letter => `
                    <div class="q-option teacher-view${q.correctAnswer === letter ? ' correct' : ''}">
                        <strong>${letter}.</strong> ${escapeHtml(q.options[letter])}
                    </div>`).join('')}
                </div>
                <div class="q-indicator no-print">
                    <small class="text-muted"><strong>Indikator:</strong> ${escapeHtml(q.indicator)}</small>
                </div>
                <div class="q-actions no-print">
                    <button class="btn btn-secondary btn-small" onclick="window._editQ('${q.id}')">
                        <i data-lucide="pencil"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="window._toggleLock('${q.id}')">
                        <i data-lucide="${q.locked ? 'lock' : 'unlock'}"></i> ${q.locked ? 'Unlock' : 'Lock'}
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="window._regenQ('${q.id}')" ${q.locked ? 'disabled' : ''}>
                        <i data-lucide="refresh-cw"></i> Regenerate
                    </button>
                </div>`;
            questionsContainer.appendChild(card);
        });
    }

    function renderAnswerKey() {
        keyContainer.innerHTML = '';
        generatedQuestions.forEach(q => {
            const item = document.createElement('div');
            item.className = 'key-item';
            item.innerHTML = `<span>No ${q.questionNumber}</span><span class="key-answer">${q.correctAnswer}</span>`;
            keyContainer.appendChild(item);
        });
    }

    function renderKisiKisi() {
        kisiContainer.innerHTML = '';
        generatedQuestions.forEach(q => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${q.questionNumber}</td>
                <td>${escapeHtml(q.material)}</td>
                <td>${q.bloomLevel}</td>
                <td>${q.difficulty}</td>
                <td>${escapeHtml(q.indicator)}</td>
                <td>PG</td>`;
            kisiContainer.appendChild(tr);
        });
    }

    // ===== ACTIONS =====
    window._toggleLock = (id) => {
        const q = generatedQuestions.find(x => x.id === id);
        if (q) { q.locked = !q.locked; renderResults(); }
    };

    window._regenQ = async (id) => {
        const idx = generatedQuestions.findIndex(x => x.id === id);
        if (idx === -1 || generatedQuestions[idx].locked) return;
        const q = generatedQuestions[idx];
        const card = document.getElementById(`card-${id}`);
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
        try {
            const newQ = await window.AIQEngine.generateQuestionWithAI(
                { questionNumber: q.questionNumber, material: q.material, bloomLevel: q.bloomLevel, difficulty: q.difficulty },
                currentConfig
            );
            newQ.id = id;
            generatedQuestions[idx] = newQ;
            renderResults();
        } catch (err) {
            alert('Gagal regenerasi: ' + err.message);
            card.style.opacity = '1';
            card.style.pointerEvents = '';
        }
    };

    window._editQ = (id) => {
        const q = generatedQuestions.find(x => x.id === id);
        if (!q) return;
        document.getElementById('edit-question-id').value = id;
        document.getElementById('edit-question-text').value = q.question;
        document.getElementById('edit-opt-a').value = q.options.A;
        document.getElementById('edit-opt-b').value = q.options.B;
        document.getElementById('edit-opt-c').value = q.options.C;
        document.getElementById('edit-opt-d').value = q.options.D;
        document.getElementById('edit-correct-answer').value = q.correctAnswer;
        document.getElementById('edit-indicator').value = q.indicator;
        editModal.classList.remove('hidden');
    };

    function saveEdit() {
        const id = document.getElementById('edit-question-id').value;
        const q  = generatedQuestions.find(x => x.id === id);
        if (!q) return;
        q.question      = document.getElementById('edit-question-text').value;
        q.options.A     = document.getElementById('edit-opt-a').value;
        q.options.B     = document.getElementById('edit-opt-b').value;
        q.options.C     = document.getElementById('edit-opt-c').value;
        q.options.D     = document.getElementById('edit-opt-d').value;
        q.correctAnswer = document.getElementById('edit-correct-answer').value;
        q.indicator     = document.getElementById('edit-indicator').value;
        q.editedByUser  = true;
        editModal.classList.add('hidden');
        renderResults();
    }

    // ===== TABS =====
    function switchTab(tabName) {
        btnTabQuestions.classList.toggle('active', tabName === 'questions');
        btnTabKey.classList.toggle('active',       tabName === 'key');
        btnTabKisi.classList.toggle('active',      tabName === 'kisi');
        viewQuestions.classList.toggle('hidden',   tabName !== 'questions');
        viewKey.classList.toggle('hidden',         tabName !== 'key');
        viewKisi.classList.toggle('hidden',        tabName !== 'kisi');
        lucide.createIcons();
    }

    // ===== DOCX EXPORT (Server-side) =====
    window._exportDocx = async () => {
        if (generatedQuestions.length === 0) {
            alert('Belum ada soal yang di-generate.');
            return;
        }

        const btn = document.querySelector('button[onclick="window._exportDocx()"]');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Menyiapkan...';
        }

        try {
            const response = await fetch('/api/export-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questions: generatedQuestions,
                    config: currentConfig,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'Server error' }));
                throw new Error(err.error || 'Gagal membuat DOCX di server.');
            }

            // Ambil nama file dari header Content-Disposition
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="(.+?)"/);
            const filename = match ? match[1] : `Soal_${(currentConfig.mapel || 'AI').replace(/\s+/g, '_')}.docx`;

            const blob = await response.blob();
            const url  = window.URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Export DOCX error:', err);
            alert('Gagal mengunduh DOCX: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="file-text"></i> Unduh DOCX';
                lucide.createIcons();
            }
        }
    };

    // ===== UTILS =====
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function escapeHtml(text = '') {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
});
