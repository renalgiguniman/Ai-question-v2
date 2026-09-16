// api/inferhub-generate.js
// Vercel Serverless Function — InferHub API

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    const INFERHUB_API_KEY = process.env.INFERHUB_API_KEY;
    const INFERHUB_MODEL = process.env.INFERHUB_MODEL;

    if (!INFERHUB_API_KEY) {
        console.error('INFERHUB_API_KEY belum di-set di Vercel.');

        return res.status(500).json({
            error: 'API Key InferHub belum dikonfigurasi.'
        });
    }

    if (!INFERHUB_MODEL) {
        console.error('INFERHUB_MODEL belum di-set di Vercel.');

        return res.status(500).json({
            error: 'Model InferHub belum dikonfigurasi.'
        });
    }

    const { blueprintItem, config } = req.body;

    if (!blueprintItem || !config) {
        return res.status(400).json({
            error: 'Data blueprint tidak valid.'
        });
    }

    const prompt = buildPrompt(blueprintItem, config);

    try {
        console.log('Mengirim request ke InferHub...');
        console.log('Model:', INFERHUB_MODEL);

        const response = await fetch(
            'https://api.inferhub.dev/v1/chat/completions',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${INFERHUB_API_KEY}`,
                },

                body: JSON.stringify({
                    model: INFERHUB_MODEL,

                    messages: [
                        {
                            role: 'system',
                            content:
                                'Anda adalah pembuat soal ujian profesional untuk kurikulum Indonesia (Kurikulum Merdeka). Selalu kembalikan respons dalam format JSON yang valid.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],

                    temperature: 0.7,

                    response_format: {
                        type: 'json_object'
                    }
                }),
            }
        );

        const data = await response.json();

        // ============================================================
        // HANDLE ERROR DARI INFERHUB
        // ============================================================

        if (!response.ok) {
            console.error(
                'InferHub API error:',
                JSON.stringify(data, null, 2)
            );

            const errMsg =
                data?.error?.message ||
                data?.message ||
                `InferHub API error: ${response.status}`;

            return res.status(502).json({
                error: errMsg
            });
        }

        // ============================================================
        // AMBIL OUTPUT AI
        // ============================================================

        const rawText =
            data?.choices?.[0]?.message?.content;

        if (!rawText) {
            console.error(
                'Respons InferHub kosong:',
                JSON.stringify(data, null, 2)
            );

            return res.status(502).json({
                error: 'Respons kosong dari InferHub.'
            });
        }

        // ============================================================
        // PARSE JSON
        // ============================================================

        let parsed;

        try {
            const cleaned = rawText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/gi, '')
                .trim();

            parsed = JSON.parse(cleaned);

        } catch (error) {

            console.error(
                'Gagal parse JSON dari InferHub:',
                rawText
            );

            return res.status(502).json({
                error: 'Format respons AI tidak valid.'
            });
        }

        // ============================================================
        // FORMAT OUTPUT AGAR SESUAI FRONTEND
        // ============================================================

        const finalQuestion = {
            id:
                `q_${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2, 7)}`,

            question:
                parsed.question || '',

            options:
                parsed.options || {
                    A: '-',
                    B: '-',
                    C: '-',
                    D: '-'
                },

            correctAnswer:
                parsed.correctAnswer || 'A',

            indicator:
                parsed.indicator || '-',

            questionNumber:
                blueprintItem.questionNumber,

            material:
                blueprintItem.material,

            bloomLevel:
                blueprintItem.bloomLevel,

            difficulty:
                blueprintItem.difficulty,

            locked: false,

            editedByUser: false,
        };

        return res.status(200).json({
            question: finalQuestion
        });

    } catch (error) {

        console.error(
            'Server error di inferhub-generate:',
            error
        );

        return res.status(500).json({
            error: `Server Error: ${error.message}`
        });
    }
}


// ================================================================
// BUILD PROMPT
// ================================================================

function buildPrompt(blueprintItem, config) {

    const bentuk =
        config.bentukSoal ||
        'Pilihan Ganda';

    let bentukInstruksi = '';
    let jsonSchema = '';

    if (
        bentuk === 'Pilihan Ganda' ||
        bentuk === 'Campuran'
    ) {

        bentukInstruksi =
            `Buat soal PILIHAN GANDA dengan 4 pilihan (A, B, C, D). Satu jawaban benar. Pengecoh harus merepresentasikan kesalahan umum siswa.`;

        jsonSchema =
            `{ "question": "...", "options": { "A": "...", "B": "...", "C": "...", "D": "..." }, "correctAnswer": "B", "indicator": "Siswa dapat..." }`;

    } else if (bentuk === 'Essay') {

        bentukInstruksi =
            `Buat soal ESSAY yang menuntut siswa berpikir kritis. Sertakan panduan jawaban singkat di correctAnswer.`;

        jsonSchema =
            `{ "question": "...", "options": { "A": "-", "B": "-", "C": "-", "D": "-" }, "correctAnswer": "Panduan jawaban...", "indicator": "Siswa dapat..." }`;

    } else if (bentuk === 'Isian Singkat') {

        bentukInstruksi =
            `Buat soal ISIAN SINGKAT dengan garis kosong (_____). Jawaban hanya 1-3 kata atau angka.`;

        jsonSchema =
            `{ "question": "_____ adalah ...", "options": { "A": "-", "B": "-", "C": "-", "D": "-" }, "correctAnswer": "jawaban singkat", "indicator": "Siswa dapat..." }`;

    } else if (bentuk === 'Benar/Salah') {

        bentukInstruksi =
            `Buat soal BENAR/SALAH berupa pernyataan. Pilihan A = Benar, B = Salah.`;

        jsonSchema =
            `{ "question": "Pernyataan...", "options": { "A": "Benar", "B": "Salah", "C": "-", "D": "-" }, "correctAnswer": "A", "indicator": "Siswa dapat..." }`;

    } else if (bentuk === 'Menjodohkan') {

        bentukInstruksi =
            `Buat soal MENJODOHKAN. Kolom kiri: A-D (istilah/soal). Kolom kanan: 1-4 (definisi/jawaban, diacak). Sertakan kunci pasangan.`;

        jsonSchema =
            `{ "question": "Jodohkan:\\nA. ...\\nB. ...\\nC. ...\\nD. ...\\nKolom kanan:\\n1. ...\\n2. ...\\n3. ...\\n4. ...", "options": { "A": "1", "B": "3", "C": "2", "D": "4" }, "correctAnswer": "A-1, B-3, C-2, D-4", "indicator": "Siswa dapat..." }`;
    }

    return `
Buat SATU soal ujian untuk:

- Jenjang: ${config.jenjang}
- Kelas: ${config.kelas}
- Mata Pelajaran: ${config.mapel}
- Materi: ${blueprintItem.material}
- Level Bloom: ${blueprintItem.bloomLevel}
- Tingkat Kesulitan: ${blueprintItem.difficulty}
- Bentuk Soal: ${bentuk}

INSTRUKSI:

${bentukInstruksi}

ATURAN:

1. Jangan tulis "Bloom", "C1", "C3" di teks soal.
2. Gunakan Bahasa Indonesia baku.
3. Soal harus sesuai tingkat kelas dan jenjang.
4. Jangan memberikan penjelasan tambahan.
5. Output harus berupa JSON valid.
6. Jangan menggunakan markdown.
7. Jangan menggunakan \`\`\`json.
8. Pastikan semua tanda kutip JSON valid.

Kembalikan HANYA JSON dengan format:

${jsonSchema}
`;
}
