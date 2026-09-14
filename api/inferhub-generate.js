// api/inferhub-generate.js
// Vercel Serverless Function — menggunakan InferHub API
// API Key dibaca dari environment variable INFERHUB_API_KEY di Vercel
// JANGAN taruh API key di sini — selalu gunakan process.env

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const INFERHUB_API_KEY = process.env.INFERHUB_API_KEY;

    if (!INFERHUB_API_KEY) {
        console.error('INFERHUB_API_KEY belum di-set di environment variables Vercel.');
        return res.status(500).json({
            error: 'API Key InferHub belum dikonfigurasi. Tambahkan INFERHUB_API_KEY di Vercel Environment Variables.'
        });
    }

    const { blueprintItem, config } = req.body;

    if (!blueprintItem || !config) {
        return res.status(400).json({ error: 'Data blueprint tidak valid.' });
    }

    const prompt = buildPrompt(blueprintItem, config);

    try {
        // InferHub menggunakan format API yang kompatibel dengan OpenAI
        const response = await fetch('https://api.inferhub.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${INFERHUB_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Anda adalah pembuat soal ujian profesional untuk kurikulum Indonesia (Kurikulum Merdeka). Selalu kembalikan respons dalam format JSON yang valid.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData?.error?.message || `InferHub API error: ${response.status}`;
            console.error('InferHub error:', errMsg);
            return res.status(502).json({ error: errMsg });
        }

        const data = await response.json();
        const rawText = data?.choices?.[0]?.message?.content;

        if (!rawText) {
            return res.status(502).json({ error: 'Respons kosong dari InferHub.' });
        }

        // Parse JSON dari respons AI
        let parsed;
        try {
            const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            console.error('Gagal parse JSON dari InferHub:', rawText);
            return res.status(502).json({ error: 'Format respons AI tidak valid.' });
        }

        const finalQuestion = {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            question:      parsed.question      || '',
            options:       parsed.options       || { A: '-', B: '-', C: '-', D: '-' },
            correctAnswer: parsed.correctAnswer || 'A',
            indicator:     parsed.indicator     || '-',
            questionNumber: blueprintItem.questionNumber,
            material:       blueprintItem.material,
            bloomLevel:     blueprintItem.bloomLevel,
            difficulty:     blueprintItem.difficulty,
            locked:         false,
            editedByUser:   false,
        };

        return res.status(200).json({ question: finalQuestion });

    } catch (error) {
        console.error('Server error di inferhub-generate:', error);
        return res.status(500).json({ error: `Server Error: ${error.message}` });
    }
}

// ================================================================
// BUILD PROMPT — adaptif sesuai bentuk soal
// ================================================================
function buildPrompt(blueprintItem, config) {
    const bentuk = config.bentukSoal || 'Pilihan Ganda';

    let bentukInstruksi = '';
    let jsonSchema = '';

    if (bentuk === 'Pilihan Ganda' || bentuk === 'Campuran') {
        bentukInstruksi = `Buat soal PILIHAN GANDA dengan 4 pilihan (A, B, C, D). Satu jawaban benar. Pengecoh harus merepresentasikan kesalahan umum siswa.`;
        jsonSchema = `{ "question": "...", "options": { "A": "...", "B": "...", "C": "...", "D": "..." }, "correctAnswer": "B", "indicator": "Siswa dapat..." }`;
    } else if (bentuk === 'Essay') {
        bentukInstruksi = `Buat soal ESSAY yang menuntut siswa berpikir kritis. Sertakan panduan jawaban singkat di correctAnswer.`;
        jsonSchema = `{ "question": "...", "options": { "A": "-", "B": "-", "C": "-", "D": "-" }, "correctAnswer": "Panduan jawaban...", "indicator": "Siswa dapat..." }`;
    } else if (bentuk === 'Isian Singkat') {
        bentukInstruksi = `Buat soal ISIAN SINGKAT dengan garis kosong (_____). Jawaban hanya 1-3 kata atau angka.`;
        jsonSchema = `{ "question": "_____ adalah ...", "options": { "A": "-", "B": "-", "C": "-", "D": "-" }, "correctAnswer": "jawaban singkat", "indicator": "Siswa dapat..." }`;
    } else if (bentuk === 'Benar/Salah') {
        bentukInstruksi = `Buat soal BENAR/SALAH berupa pernyataan. Pilihan A = Benar, B = Salah.`;
        jsonSchema = `{ "question": "Pernyataan...", "options": { "A": "Benar", "B": "Salah", "C": "-", "D": "-" }, "correctAnswer": "A", "indicator": "Siswa dapat..." }`;
    } else if (bentuk === 'Menjodohkan') {
        bentukInstruksi = `Buat soal MENJODOHKAN. Kolom kiri: A-D (istilah/soal). Kolom kanan: 1-4 (definisi/jawaban, diacak). Sertakan kunci pasangan.`;
        jsonSchema = `{ "question": "Jodohkan:\nA. ...\nB. ...\nC. ...\nD. ...\nKolom kanan:\n1. ...\n2. ...\n3. ...\n4. ...", "options": { "A": "1", "B": "3", "C": "2", "D": "4" }, "correctAnswer": "A-1, B-3, C-2, D-4", "indicator": "Siswa dapat..." }`;
    }

    return `Buat SATU soal ujian untuk:
- Jenjang: ${config.jenjang} Kelas ${config.kelas}
- Mata Pelajaran: ${config.mapel}
- Materi: ${blueprintItem.material}
- Level Bloom: ${blueprintItem.bloomLevel}
- Tingkat Kesulitan: ${blueprintItem.difficulty}
- Bentuk Soal: ${bentuk}

INSTRUKSI: ${bentukInstruksi}

ATURAN: Jangan tulis "Bloom", "C1", "C3" di teks soal. Gunakan Bahasa Indonesia baku.

Kembalikan HANYA JSON (tanpa penjelasan tambahan) dengan format:
${jsonSchema}`;
}
