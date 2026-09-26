// api/generate-batch.js
// Vercel Serverless Function — InferHub Batch Generator

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    const INFERHUB_API_KEY = process.env.INFERHUB_API_KEY;
    const INFERHUB_MODEL = process.env.INFERHUB_MODEL;

    if (!INFERHUB_API_KEY) {
        return res.status(500).json({
            error: 'INFERHUB_API_KEY belum dikonfigurasi.'
        });
    }

    if (!INFERHUB_MODEL) {
        return res.status(500).json({
            error: 'INFERHUB_MODEL belum dikonfigurasi.'
        });
    }

    const { blueprintItems, config } = req.body;

    if (
        !Array.isArray(blueprintItems) ||
        blueprintItems.length === 0 ||
        !config
    ) {
        return res.status(400).json({
            error: 'Data blueprint tidak valid.'
        });
    }

    const prompt = buildBatchPrompt(blueprintItems, config);

    try {
        console.log(
            `Mengirim ${blueprintItems.length} soal ke InferHub...`
        );
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
                                'Anda adalah pembuat soal ujian profesional untuk kurikulum Indonesia. Selalu kembalikan respons dalam JSON valid. Jika ada rumus/persamaan/notasi eksak, WAJIB bungkus dengan delimiter LaTeX \\( ... \\) atau \\[ ... \\]. Jangan pernah menulis bentuk seperti x^2 atau a/b sebagai teks polos ketika itu bagian dari rumus.'
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
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error(
                'InferHub batch error:',
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

        let parsed;

        try {
            const cleaned = rawText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/gi, '')
                .trim();

            parsed = JSON.parse(cleaned);

        } catch (error) {
            console.error(
                'Gagal parse JSON batch:',
                rawText
            );

            return res.status(502).json({
                error: 'Format respons AI tidak valid.'
            });
        }

        if (
            !parsed ||
            !Array.isArray(parsed.questions)
        ) {
            console.error(
                'Output batch tidak memiliki questions array:',
                parsed
            );

            return res.status(502).json({
                error: 'AI tidak mengembalikan daftar soal yang valid.'
            });
        }

        const finalQuestions = blueprintItems.map(
            (item, index) => {

                const generated =
                    parsed.questions[index] || {};

                return {
                    id:
                        `q_${Date.now()}_${Math.random()
                            .toString(36)
                            .slice(2, 7)}_${index}`,

                    question:
                        generated.question || '',

                    options:
                        generated.options || {
                            A: '-',
                            B: '-',
                            C: '-',
                            D: '-'
                        },

                    correctAnswer:
                        generated.correctAnswer || 'A',

                    indicator:
                        generated.indicator || '-',

                    questionNumber:
                        item.questionNumber,

                    material:
                        item.material,

                    bloomLevel:
                        item.bloomLevel,

                    difficulty:
                        item.difficulty,

                    locked: false,
                    editedByUser: false
                };
            }
        );

        return res.status(200).json({
            questions: finalQuestions
        });

    } catch (error) {

        console.error(
            'Server error di generate-batch:',
            error
        );

        return res.status(500).json({
            error:
                `Server Error: ${error.message}`
        });
    }
}


function buildBatchPrompt(
    blueprintItems,
    config
) {

    const bentuk =
        config.bentukSoal ||
        'Pilihan Ganda';

    let bentukInstruksi = '';

    if (
        bentuk === 'Pilihan Ganda' ||
        bentuk === 'Campuran'
    ) {

        bentukInstruksi = `
Buat soal PILIHAN GANDA.

Setiap soal memiliki:
- 4 pilihan: A, B, C, D
- tepat satu jawaban benar
- pengecoh harus masuk akal
- pengecoh sebaiknya merepresentasikan kesalahan umum siswa
`;
    }

    else if (bentuk === 'Essay') {

        bentukInstruksi = `
Buat soal ESSAY yang menuntut siswa berpikir.
correctAnswer berisi panduan jawaban singkat.
`;
    }

    else if (bentuk === 'Isian Singkat') {

        bentukInstruksi = `
Buat soal ISIAN SINGKAT.
Jawaban berupa 1–3 kata atau angka.
Gunakan _____ jika diperlukan.
`;
    }

    else if (bentuk === 'Benar/Salah') {

        bentukInstruksi = `
Buat soal BENAR/SALAH.

Gunakan:
A = Benar
B = Salah
`;
    }

    else if (bentuk === 'Menjodohkan') {

        bentukInstruksi = `
Buat soal MENJODOHKAN.

Kolom kiri:
A, B, C, D

Kolom kanan:
1, 2, 3, 4

Acak pasangan.
correctAnswer berisi pasangan yang benar.
`;
    }

    const itemsText = blueprintItems
        .map((item, index) => `
SOAL ${index + 1}
- Nomor: ${item.questionNumber}
- Materi: ${item.material}
- Level: ${item.bloomLevel}
- Kesulitan: ${item.difficulty}
`)
        .join('\n');


    return `
Anda adalah pembuat soal ujian profesional
untuk kurikulum Indonesia.

Buat SEMUA soal berikut dalam SATU respons.

KONTEKS:
- Jenjang: ${config.jenjang}
- Kelas: ${config.kelas}
- Mata Pelajaran: ${config.mapel}
- Bentuk Soal: ${bentuk}

${bentukInstruksi}

DAFTAR SOAL:
${itemsText}

ATURAN WAJIB:

1. Setiap soal harus sesuai dengan materi yang diberikan.
2. Sesuaikan tingkat soal dengan kelas.
3. Sesuaikan soal dengan level kognitif yang diminta.
4. Jangan menulis "Bloom", "C1", "C2", "C3", "C4", "C5", atau "C6" di teks soal.
5. Gunakan Bahasa Indonesia yang baku dan natural.
6. Jangan membuat soal yang ambigu.
7. Jangan memberikan penjelasan tambahan.
8. Jangan menggunakan Markdown.
9. Jangan menggunakan code fence.
10. Jumlah soal HARUS tepat ${blueprintItems.length}.
11. Urutan soal HARUS sama dengan urutan daftar.
12. Jangan menghilangkan soal.
13. Output HARUS berupa JSON valid.

ATURAN RUMUS / EQUATION:

14. Jika konten TIDAK membutuhkan rumus atau notasi khusus, gunakan teks biasa.
15. Jika konten membutuhkan rumus, persamaan, pecahan, akar, pangkat, indeks, simbol matematika/fisika/kimia/statistika, gunakan LaTeX.
16. Rumus inline harus dibungkus dengan \\( ... \\), sedangkan rumus satu baris/display harus dibungkus dengan \\[ ... \\].
17. Karena output HARUS JSON valid, setiap backslash LaTeX WAJIB di-escape dua kali di JSON.
    Contoh JSON valid:
    "question": "Hitung \\\\(\\\\frac{3}{4}+\\\\frac{1}{2}\\\\)."
18. Jangan gunakan delimiter $...$ atau $...$.
19. Jangan menambahkan equation jika tidak diperlukan.
20. OUTPUT DIANGGAP SALAH jika terdapat simbol matematika seperti ^, =, √, ±, ≤, ≥, pecahan a/b, atau ekspresi aljabar yang berada di luar delimiter LaTeX.
21. Contoh WAJIB:
    Teks salah: Persamaan kuadrat x^2 - (m+2)x + m = 0 memiliki akar...
    Teks benar (di JSON): Persamaan kuadrat \\(x^2 - (m+2)x + m = 0\\) memiliki akar...

FORMAT OUTPUT:

{
  "questions": [
    {
      "question": "...",
      "options": {
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
      },
      "correctAnswer": "B",
      "indicator": "Siswa dapat..."
    }
  ]
}

Pastikan array "questions" memiliki tepat
${blueprintItems.length} objek.
`;
}
