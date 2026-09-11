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
    return `Anda adalah pembuat soal ujian pilihan ganda profesional untuk kurikulum Indonesia.
Buat SATU soal pilihan ganda berdasarkan spesifikasi berikut:

- Jenjang: ${config.jenjang} Kelas ${config.kelas}
- Mata Pelajaran: ${config.mapel}
- Materi: ${blueprintItem.material}
- Level Bloom: ${blueprintItem.bloomLevel}
- Tingkat Kesulitan: ${blueprintItem.difficulty}

ATURAN WAJIB:
1. Buat 4 pilihan (A, B, C, D) dengan SATU jawaban yang benar.
2. Pengecoh (distractor) harus merepresentasikan kesalahan umum siswa.
3. Jangan tulis kata "Bloom" atau "C1", "C3" di teks soal.
4. Gunakan Bahasa Indonesia yang baku dan jelas.

OUTPUT harus berupa JSON murni persis seperti ini:
{
  "question": "teks soal lengkap...",
  "options": {
    "A": "pilihan A",
    "B": "pilihan B",
    "C": "pilihan C",
    "D": "pilihan D"
  },
  "correctAnswer": "B",
  "indicator": "Siswa dapat..."
}`;
}
