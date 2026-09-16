// api/generate.js - Vercel Serverless Function

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    // ================================
    // INFERHUB CONFIG
    // ================================
    const INFERHUB_API_KEY = process.env.INFERHUB_API_KEY;
    const INFERHUB_MODEL = process.env.INFERHUB_MODEL;

    if (!INFERHUB_API_KEY) {
        console.error("InferHub API Key kosong!");

        return res.status(500).json({
            error: 'InferHub API Key belum disetting di Vercel.'
        });
    }

    if (!INFERHUB_MODEL) {
        console.error("InferHub Model kosong!");

        return res.status(500).json({
            error: 'InferHub Model belum disetting di Vercel.'
        });
    }

    // ================================
    // AMBIL DATA DARI FRONTEND
    // ================================
    const { blueprintItem, config } = req.body;

    if (!blueprintItem || !config) {
        return res.status(400).json({
            error: 'Data blueprint tidak valid.'
        });
    }

    // ================================
    // BUAT PROMPT
    // ================================
    const prompt = buildPrompt(blueprintItem, config);

    try {

        // ================================
        // CALL INFERHUB API
        // ================================
        const inferhubResponse = await fetch(
            'https://api.inferhub.dev/v1/chat/completions',
            {
                method: 'POST',

                headers: {
                    'Authorization': `Bearer ${INFERHUB_API_KEY}`,
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    model: INFERHUB_MODEL,

                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],

                    temperature: 0.7
                })
            }
        );

        // ================================
        // PARSE RESPONSE INFERHUB
        // ================================
        const data = await inferhubResponse.json();

        if (!inferhubResponse.ok) {
            console.error(
                "🔥 Error dari InferHub:",
                JSON.stringify(data, null, 2)
            );

            const errMsg =
                data?.error?.message ||
                data?.message ||
                'InferHub API error.';

            return res.status(502).json({
                error: `InferHub Error: ${errMsg}`
            });
        }

        // ================================
        // AMBIL TEXT DARI RESPONSE
        // ================================
        let textResponse =
            data?.choices?.[0]?.message?.content;

        if (!textResponse) {
            console.error(
                "🔥 Output InferHub kosong:",
                JSON.stringify(data, null, 2)
            );

            return res.status(502).json({
                error: 'AI mengembalikan teks kosong.'
            });
        }

        // ================================
        // BERSIHKAN MARKDOWN JSON
        // ================================
        textResponse = textResponse
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        // ================================
        // PARSE JSON DARI AI
        // ================================
        let parsed;

        try {
            parsed = JSON.parse(textResponse);
        } catch (e) {
            console.error(
                "🔥 JSON tidak valid dari InferHub:",
                textResponse
            );

            return res.status(502).json({
                error: 'Format JSON dari AI tidak valid.'
            });
        }

        // ================================
        // FORMAT FINAL QUESTION
        // ================================
        const finalQuestion = {
            id:
                'q_' +
                Date.now() +
                Math.random()
                    .toString(36)
                    .substr(2, 5),

            question:
                parsed.question ||
                "Soal tidak tersedia",

            options: {
                A: parsed.options?.A || '',
                B: parsed.options?.B || '',
                C: parsed.options?.C || '',
                D: parsed.options?.D || '',
            },

            correctAnswer:
                parsed.correctAnswer ||
                'A',

            indicator:
                parsed.indicator ||
                '-',

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

        // ================================
        // KIRIM KE FRONTEND
        // ================================
        return res.status(200).json({
            question: finalQuestion
        });

    } catch (error) {

        console.error(
            '🔥 Server error:',
            error
        );

        return res.status(500).json({
            error: `Server Error: ${error.message}`
        });
    }
}


// ============================================================
// BUILD PROMPT
// ============================================================

function buildPrompt(blueprintItem, config) {

    const bentuk =
        config.bentukSoal ||
        'Pilihan Ganda';

    const isPG =
        bentuk === 'Pilihan Ganda' ||
        bentuk === 'Benar/Salah';

    const isCampuran =
        bentuk === 'Campuran';

    let bentukInstruksi = '';
    let jsonSchema = '';

    // ================================
    // PILIHAN GANDA
    // ================================
    if (
        bentuk === 'Pilihan Ganda' ||
        isCampuran
    ) {

        bentukInstruksi = `
Buat soal PILIHAN GANDA dengan 4 pilihan (A, B, C, D).
Satu jawaban benar.
Pengecoh harus merepresentasikan kesalahan umum siswa.
`;

        jsonSchema = `{
  "question": "teks soal lengkap...",
  "options": {
    "A": "...",
    "B": "...",
    "C": "...",
    "D": "..."
  },
  "correctAnswer": "B",
  "indicator": "Siswa dapat..."
}`;

    }

    // ================================
    // ESSAY
    // ================================
    else if (bentuk === 'Essay') {

        bentukInstruksi = `
Buat soal ESSAY yang menuntut siswa berpikir kritis
dan menjawab secara tertulis.
Sertakan panduan jawaban singkat.
`;

        jsonSchema = `{
  "question": "teks soal essay...",
  "options": {
    "A": "-",
    "B": "-",
    "C": "-",
    "D": "-"
  },
  "correctAnswer": "Panduan: jawaban yang diharapkan...",
  "indicator": "Siswa dapat..."
}`;

    }

    // ================================
    // ISIAN SINGKAT
    // ================================
    else if (bentuk === 'Isian Singkat') {

        bentukInstruksi = `
Buat soal ISIAN SINGKAT yang jawabannya hanya
1–3 kata atau angka.

Format:
"_____ adalah ...".
`;

        jsonSchema = `{
  "question": "teks soal isian (dengan garis kosong _____) ...",
  "options": {
    "A": "-",
    "B": "-",
    "C": "-",
    "D": "-"
  },
  "correctAnswer": "jawaban singkat yang tepat",
  "indicator": "Siswa dapat..."
}`;

    }

    // ================================
    // BENAR / SALAH
    // ================================
    else if (bentuk === 'Benar/Salah') {

        bentukInstruksi = `
Buat soal BENAR/SALAH berupa pernyataan
yang harus dinilai benar atau salah oleh siswa.

Pilihan hanya:
A (Benar)
B (Salah)
`;

        jsonSchema = `{
  "question": "pernyataan yang harus dinilai benar/salah...",
  "options": {
    "A": "Benar",
    "B": "Salah",
    "C": "-",
    "D": "-"
  },
  "correctAnswer": "A",
  "indicator": "Siswa dapat..."
}`;

    }

    // ================================
    // MENJODOHKAN
    // ================================
    else if (bentuk === 'Menjodohkan') {

        bentukInstruksi = `
Buat soal MENJODOHKAN.

Kolom kiri berisi istilah/soal (A–D).
Kolom kanan berisi definisi/jawaban yang diacak (1–4).

Sertakan pasangan jawaban yang benar.
`;

        jsonSchema = `{
  "question": "Jodohkan kolom kiri dengan kolom kanan:\\nKolom Kiri:\\nA. ...\\nB. ...\\nC. ...\\nD. ...\\nKolom Kanan:\\n1. ...\\n2. ...\\n3. ...\\n4. ...",
  "options": {
    "A": "1",
    "B": "3",
    "C": "2",
    "D": "4"
  },
  "correctAnswer": "A-1, B-3, C-2, D-4",
  "indicator": "Siswa dapat..."
}`;

    }

    // ================================
    // FINAL PROMPT
    // ================================
    return `
Anda adalah pembuat soal ujian profesional
untuk kurikulum Indonesia (Kurikulum Merdeka).

Buat SATU soal berdasarkan spesifikasi berikut:

- Jenjang: ${config.jenjang}
- Kelas: ${config.kelas}
- Mata Pelajaran: ${config.mapel}
- Materi: ${blueprintItem.material}
- Level Bloom: ${blueprintItem.bloomLevel}
- Tingkat Kesulitan: ${blueprintItem.difficulty}
- Bentuk Soal: ${bentuk}

INSTRUKSI BENTUK SOAL:

${bentukInstruksi}

ATURAN WAJIB:

1. Jangan tulis kata "Bloom", "C1", "C3", atau sejenisnya di teks soal.
2. Gunakan Bahasa Indonesia yang baku dan jelas.
3. Soal harus sesuai tingkat kelas dan jenjang.
4. Jangan memberikan penjelasan di luar JSON.
5. Output harus berupa JSON valid.
6. Jangan menggunakan markdown.
7. Jangan menggunakan \`\`\`json.
8. Pastikan semua tanda kutip JSON valid.

OUTPUT harus berupa JSON murni
persis seperti ini:

${jsonSchema}
`;
}
