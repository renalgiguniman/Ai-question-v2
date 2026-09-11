// engine.js - Core Business Logic untuk AI Question Generator
// Semua panggilan AI melewati /api/generate (Vercel Serverless Function)
// API Key TIDAK pernah ada di file ini.

/**
 * Largest Remainder Method untuk mendistribusikan soal secara deterministik.
 */
function calculateDistribution(totalItems, items) {
    if (items.length === 0) return [];

    let totalAssigned = 0;
    const allocations = items.map(item => {
        const exact = (item.percentage / 100) * totalItems;
        const integerPart = Math.floor(exact);
        const remainder = exact - integerPart;
        totalAssigned += integerPart;
        return { ...item, exact, count: integerPart, remainder };
    });

    let remaining = totalItems - totalAssigned;
    allocations.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining; i++) {
        allocations[i % allocations.length].count += 1;
    }

    return allocations;
}

/**
 * Membuat Blueprint (Material x Bloom Matrix)
 */
function generateBlueprint(config) {
    const { totalQuestions, materials, bloomDistribution, difficulty } = config;

    const materialQuota = calculateDistribution(totalQuestions, materials);
    const bloomQuota    = calculateDistribution(totalQuestions, bloomDistribution);

    const blueprint = [];
    let qNumber = 1;

    const availableBlooms = bloomQuota
        .filter(b => b.count > 0)
        .map(b => ({ level: b.level, count: b.count }));

    materialQuota.forEach(mat => {
        for (let i = 0; i < mat.count; i++) {
            let bloomLevel = 'C3';
            if (availableBlooms.length > 0) {
                availableBlooms.sort((a, b) => b.count - a.count);
                bloomLevel = availableBlooms[0].level;
                availableBlooms[0].count -= 1;
                if (availableBlooms[0].count === 0) availableBlooms.shift();
            }

            let diff = difficulty;
            if (difficulty === 'Mixed') {
                const rand = Math.random();
                if (rand < 0.3) diff = 'Easy';
                else if (rand < 0.8) diff = 'Medium';
                else diff = 'Hard';
            }

            blueprint.push({
                questionNumber: qNumber++,
                material: mat.name,
                bloomLevel,
                difficulty: diff,
            });
        }
    });

    return blueprint;
}

/**
 * Generate satu soal via /api/generate.
 * Dilengkapi retry otomatis (max 3x) jika kena rate limit / server sibuk.
 */
async function generateQuestionWithAI(blueprintItem, config, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blueprintItem, config }),
            });

            const data = await response.json();

            if (!response.ok) {
                const msg = data.error || 'Gagal menghubungi server AI.';
                // Jika rate limit atau server sibuk, tunggu dan coba lagi
                const isRateLimit = msg.toLowerCase().includes('high demand')
                    || msg.toLowerCase().includes('rate')
                    || msg.toLowerCase().includes('quota')
                    || response.status === 429
                    || response.status === 503;

                if (isRateLimit && attempt < retries) {
                    const waitMs = attempt * 2000; // 2s, 4s
                    console.warn(`Rate limit soal ${blueprintItem.questionNumber}, retry ${attempt}/${retries} dalam ${waitMs}ms...`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                throw new Error(msg);
            }

            return data.question;

        } catch (err) {
            if (attempt === retries) throw err;
            // Network error — coba lagi setelah 1.5 detik
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

// Expose ke app.js via window
window.AIQEngine = {
    calculateDistribution,
    generateBlueprint,
    generateQuestionWithAI,
};
