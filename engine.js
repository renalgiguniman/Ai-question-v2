// engine.js - Core Business Logic untuk AI Question Generator
// Semua panggilan AI melewati Vercel Serverless Function
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

        return {
            ...item,
            exact,
            count: integerPart,
            remainder
        };
    });

    let remaining = totalItems - totalAssigned;

    allocations.sort(
        (a, b) => b.remainder - a.remainder
    );

    for (let i = 0; i < remaining; i++) {
        allocations[i % allocations.length].count += 1;
    }

    return allocations;
}


/**
 * Membuat Blueprint (Material x Bloom Matrix)
 */
function generateBlueprint(config) {
    const {
        totalQuestions,
        materials,
        bloomDistribution,
        difficulty
    } = config;

    const materialQuota =
        calculateDistribution(
            totalQuestions,
            materials
        );

    const bloomQuota =
        calculateDistribution(
            totalQuestions,
            bloomDistribution
        );

    const blueprint = [];

    let qNumber = 1;

    const availableBlooms = bloomQuota
        .filter(b => b.count > 0)
        .map(b => ({
            level: b.level,
            count: b.count
        }));

    materialQuota.forEach(mat => {

        for (let i = 0; i < mat.count; i++) {

            let bloomLevel = 'C3';

            if (availableBlooms.length > 0) {

                availableBlooms.sort(
                    (a, b) => b.count - a.count
                );

                bloomLevel =
                    availableBlooms[0].level;

                availableBlooms[0].count -= 1;

                if (
                    availableBlooms[0].count === 0
                ) {
                    availableBlooms.shift();
                }
            }

            let diff = difficulty;

            if (difficulty === 'Mixed') {

                const rand = Math.random();

                if (rand < 0.3) {
                    diff = 'Easy';
                } else if (rand < 0.8) {
                    diff = 'Medium';
                } else {
                    diff = 'Hard';
                }
            }

            blueprint.push({
                questionNumber: qNumber++,
                material: mat.name,
                bloomLevel,
                difficulty: diff
            });
        }
    });

    return blueprint;
}


/**
 * Generate SATU soal via /api/inferhub-generate.
 *
 * Tetap dipertahankan karena digunakan untuk:
 * - Regenerate satu soal
 * - Edit/regenerate individual question
 */
async function generateQuestionWithAI(
    blueprintItem,
    config,
    retries = 3
) {

    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {

        try {

            const response = await fetch(
                '/api/inferhub-generate',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        blueprintItem,
                        config
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                const msg =
                    data.error ||
                    'Gagal menghubungi server AI.';

                const isRateLimit =
                    msg
                        .toLowerCase()
                        .includes('high demand')
                    ||
                    msg
                        .toLowerCase()
                        .includes('rate')
                    ||
                    msg
                        .toLowerCase()
                        .includes('quota')
                    ||
                    response.status === 429
                    ||
                    response.status === 503;

                if (
                    isRateLimit &&
                    attempt < retries
                ) {

                    const waitMs =
                        attempt * 2000;

                    console.warn(
                        `Rate limit soal ${blueprintItem.questionNumber}, ` +
                        `retry ${attempt}/${retries} ` +
                        `dalam ${waitMs}ms...`
                    );

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                waitMs
                            )
                    );

                    continue;
                }

                throw new Error(msg);
            }

            return data.question;

        } catch (err) {

            if (attempt === retries) {
                throw err;
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1500
                    )
            );
        }
    }
}


/**
 * Generate BEBERAPA soal sekaligus via /api/generate-batch.
 *
 * Contoh:
 *
 * 5 blueprint items
 *       ↓
 * 1 request
 *       ↓
 * 5 questions
 *
 * Fungsi ini belum otomatis dipakai app.js.
 * Akan kita sambungkan pada STEP berikutnya.
 */
async function generateQuestionsBatch(
    blueprintItems,
    config,
    retries = 2
) {

    if (
        !Array.isArray(blueprintItems) ||
        blueprintItems.length === 0
    ) {
        return [];
    }

    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {

        try {

            console.log(
                `Mengirim batch ${blueprintItems.length} soal...`
            );

            const response = await fetch(
                '/api/generate-batch',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        blueprintItems,
                        config
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                const msg =
                    data?.error ||
                    'Gagal menghubungi server AI batch.';

                const isRetryable =
                    response.status === 429
                    ||
                    response.status === 502
                    ||
                    response.status === 503
                    ||
                    msg
                        .toLowerCase()
                        .includes('rate')
                    ||
                    msg
                        .toLowerCase()
                        .includes('quota')
                    ||
                    msg
                        .toLowerCase()
                        .includes('high demand');

                if (
                    isRetryable &&
                    attempt < retries
                ) {

                    const waitMs =
                        attempt * 2000;

                    console.warn(
                        `Batch gagal. ` +
                        `Retry ${attempt}/${retries} ` +
                        `dalam ${waitMs}ms...`
                    );

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                waitMs
                            )
                    );

                    continue;
                }

                throw new Error(msg);
            }

            if (
                !data.questions ||
                !Array.isArray(
                    data.questions
                )
            ) {

                throw new Error(
                    'Server tidak mengembalikan daftar soal.'
                );
            }

            /*
             * Pastikan jumlah soal yang kembali
             * sesuai dengan blueprint yang dikirim.
             */
            if (
                data.questions.length !==
                blueprintItems.length
            ) {

                console.warn(
                    'Jumlah soal batch tidak sesuai.',
                    {
                        requested:
                            blueprintItems.length,

                        received:
                            data.questions.length
                    }
                );
            }

            return data.questions;

        } catch (err) {

            if (attempt === retries) {
                throw err;
            }

            const waitMs =
                attempt * 1500;

            console.warn(
                `Batch error: ${err.message}. ` +
                `Retry ${attempt}/${retries}...`
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        waitMs
                    )
            );
        }
    }

    throw new Error(
        'Gagal membuat batch soal.'
    );
}


/**
 * Expose ke app.js via window
 */
window.AIQEngine = {

    calculateDistribution,

    generateBlueprint,

    // Single question
    generateQuestionWithAI,

    // Batch questions
    generateQuestionsBatch
};
