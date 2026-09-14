// api/generate.js - Vercel Serverless Function

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error("API Key kosong!");
        return res.status(500).json({ 
            error: 'API Key belum disetting di Vercel.' 
        });
    }

    const { blueprintItem, config } = req.body;

    if (!blueprintItem || !config) {
        return res.status(400).json({ error: 'Data blueprint tidak valid.' });
    }

    const prompt = buildPrompt(blueprintItem, config);

    async function callGeminiAPI(modelName) {
        const generationConfig = { temperature: 0.7 };
        
        // Hanya tambahkan json mode untuk Gemini 1.5 dan ke atas
        if (modelName.includes('1.5') || modelName.includes('3.6')) {
            generationConfig.responseMimeType = "application/json";
        }

        return await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: generationConfig
                })
            }
        );
    }

    try {
        let geminiResponse = await callGeminiAPI('gemini-3.6-flash');
        let data = await geminiResponse.json();

        // Fallback to gemini-3.6-pro if flash is not found or has issues
        if (!geminiResponse.ok && data?.error?.message?.includes('not found')) {
            console.warn("Model gemini-3.6-flash tidak ditemukan, mencoba gemini-3.6-pro...");
            geminiResponse = await callGeminiAPI('gemini-3.6-pro');
            data = await geminiResponse.json();
        }

        if (!geminiResponse.ok) {
            console.error("🔥 Error dari Gemini:", JSON.stringify(data, null, 2));
            const errMsg = data?.error?.message || 'Gemini API error.';
            return res.status(502).json({ error: `Gemini Error: ${errMsg}` });
        }

        let textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            console.error("🔥 Output Gemini kosong:", JSON.stringify(data, null, 2));
            return res.status(502).json({ error: 'AI mengembalikan teks kosong.' });
        }

        // Bersihkan formatting markdown jika ada (terutama jika dari gemini-pro)
        textResponse = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(textResponse);
        } catch (e) {
            console.error("🔥 JSON tidak valid dari Gemini:", textResponse);
            return res.status(502).json({ error: 'Format JSON dari AI tidak valid.' });
        }

        const finalQuestion = {
            id: 'q_' + Date.now() + Math.random().toString(36).substr(2, 5),
            question: parsed.question || "Soal tidak tersedia",
            options: {
                A: parsed.options?.A || '',
                B: parsed.options?.B || '',
                C: parsed.options?.C || '',
                D: parsed.options?.D || '',
            },
            correctAnswer: parsed.correctAnswer || 'A',
            indicator: parsed.indicator || '-',
            questionNumber: blueprintItem.questionNumber,
            material: blueprintItem.material,
            bloomLevel: blueprintItem.bloomLevel,
            difficulty: blueprintItem.difficulty,
            locked: false,
            editedByUser: false,
        };

        return res.status(200).json({ question: finalQuestion });

    } catch (error) {
        console.error('🔥 Server error:', error);
        return res.status(500).json({ 
            error: `Server Error: ${error.message}`
        });
    }
}

function buildPrompt(blueprintItem, config) {
    const bentuk = config.bentukSoal || 'Pilihan Ganda';
    const isPG = bentuk === 'Pilihan Ganda' || bentuk === 'Benar/Salah';
    const isCampuran = bentuk === 'Campuran';

    let bentukInstruksi = '';
    let jsonSchema = '';

    if (bentuk === 'Pilihan Ganda' || isCampuran) {
        bentukInstruksi = `Buat soal PILIHAN GANDA dengan 4 pilihan (A, B, C, D). Satu jawaban benar. Pengecoh harus merepresentasikan kesalahan umum siswa.`;
        jsonSchema = `{
  "question": "teks soal lengkap...",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correctAnswer": "B",
  "indicator": "Siswa dapat..."
}`;
    } else if (bentuk === 'Essay') {
        bentukInstruksi = `Buat soal ESSAY yang menuntut siswa berpikir kritis dan menjawab secara tertulis. Sertakan panduan jawaban singkat.`;
        jsonSchema = `{
  "question": "teks soal essay...",
  "options": { "A": "-", "B": "-", "C": "-", "D": "-" },
  "correctAnswer": "Panduan: jawaban yang diharapkan...",
  "indicator": "Siswa dapat..."
}`;
    } else if (bentuk === 'Isian Singkat') {
        bentukInstruksi = `Buat soal ISIAN SINGKAT yang jawabannya hanya 1–3 kata atau angka. Format: "_____ adalah ...".`;
        jsonSchema = `{
  "question": "teks soal isian (dengan garis kosong _____) ...",
  "options": { "A": "-", "B": "-", "C": "-", "D": "-" },
  "correctAnswer": "jawaban singkat yang tepat",
  "indicator": "Siswa dapat..."
}`;
    } else if (bentuk === 'Benar/Salah') {
        bentukInstruksi = `Buat soal BENAR/SALAH berupa pernyataan yang harus dinilai benar atau salah oleh siswa. Pilihan hanya A (Benar) dan B (Salah).`;
        jsonSchema = `{
  "question": "pernyataan yang harus dinilai benar/salah...",
  "options": { "A": "Benar", "B": "Salah", "C": "-", "D": "-" },
  "correctAnswer": "A",
  "indicator": "Siswa dapat..."
}`;
    } else if (bentuk === 'Menjodohkan') {
        bentukInstruksi = `Buat soal MENJODOHKAN. Kolom kiri berisi istilah/soal (A–D), kolom kanan berisi definisi/jawaban yang diacak (1–4). Sertakan pasangan jawaban yang benar.`;
        jsonSchema = `{
  "question": "Jodohkan kolom kiri dengan kolom kanan:\\nKolom Kiri:\\nA. ...\\nB. ...\\nC. ...\\nD. ...\\nKolom Kanan:\\n1. ...\\n2. ...\\n3. ...\\n4. ...",
  "options": { "A": "1", "B": "3", "C": "2", "D": "4" },
  "correctAnswer": "A-1, B-3, C-2, D-4",
  "indicator": "Siswa dapat..."
}`;
    }

    return `Anda adalah pembuat soal ujian profesional untuk kurikulum Indonesia (Kurikulum Merdeka).
Buat SATU soal berdasarkan spesifikasi berikut:

- Jenjang: ${config.jenjang} Kelas ${config.kelas}
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

OUTPUT harus berupa JSON murni (tanpa teks tambahan) persis seperti ini:
${jsonSchema}`;
}
