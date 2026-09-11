// api/generate-batch.js - Vercel Serverless Function
export const config = {
    maxDuration: 60, // Memperpanjang batas timeout menjadi 60 detik (hanya berlaku jika Vercel Pro, kalau Hobby tetap max 10-15s)
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'API Key belum disetting di Vercel.' });
    }

    const { blueprintItems, config: userConfig } = req.body;

    if (!blueprintItems || !Array.isArray(blueprintItems) || blueprintItems.length === 0 || !userConfig) {
        return res.status(400).json({ error: 'Data blueprint tidak valid.' });
    }

    const prompt = buildBatchPrompt(blueprintItems, userConfig);

    async function callGeminiAPI(modelName) {
        const generationConfig = { temperature: 0.7 };
        
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

        if (!geminiResponse.ok && data?.error?.message?.includes('not found')) {
            geminiResponse = await callGeminiAPI('gemini-3.6-pro');
            data = await geminiResponse.json();
        }

        if (!geminiResponse.ok) {
            const errMsg = data?.error?.message || 'Gemini API error.';
            return res.status(502).json({ error: `Gemini Error: ${errMsg}` });
        }

        let textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            return res.status(502).json({ error: 'AI mengembalikan teks kosong.' });
        }

        textResponse = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsedArray = [];
        try {
            parsedArray = JSON.parse(textResponse);
        } catch (e) {
            console.error("Format JSON tidak valid:", textResponse);
            return res.status(502).json({ error: 'Format JSON array dari AI tidak valid.' });
        }

        if (!Array.isArray(parsedArray)) {
             return res.status(502).json({ error: 'Output AI bukan berupa Array JSON.' });
        }

        // Pasangkan hasil generate dengan blueprint aslinya
        const finalQuestions = blueprintItems.map((item, index) => {
            const parsed = parsedArray[index] || {};
            return {
                id: 'q_' + Date.now() + Math.random().toString(36).substr(2, 5) + index,
                question: parsed.question || "Soal tidak tersedia",
                options: {
                    A: parsed.options?.A || '',
                    B: parsed.options?.B || '',
                    C: parsed.options?.C || '',
                    D: parsed.options?.D || '',
                },
                correctAnswer: parsed.correctAnswer || 'A',
                indicator: parsed.indicator || '-',
                questionNumber: item.questionNumber,
                material: item.material,
                bloomLevel: item.bloomLevel,
                difficulty: item.difficulty,
                locked: false,
                editedByUser: false,
            };
        });

        return res.status(200).json({ questions: finalQuestions });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: `Server Error: ${error.message}` });
    }
}

function buildBatchPrompt(blueprintItems, config) {
    let itemsStr = blueprintItems.map((item, index) => 
        `\n[Soal ${index + 1}]\n- Nomor Soal: ${item.questionNumber}\n- Materi: ${item.material}\n- Level Bloom: ${item.bloomLevel}\n- Kesulitan: ${item.difficulty}`
    ).join('\n');

    return `Anda adalah pembuat soal ujian pilihan ganda profesional untuk kurikulum Indonesia.
Buat ${blueprintItems.length} soal pilihan ganda secara serentak.

Konteks Umum:
- Jenjang: ${config.jenjang} Kelas ${config.kelas}
- Mata Pelajaran: ${config.mapel}

Berikut adalah daftar spesifikasi masing-masing soal yang harus Anda buat:
${itemsStr}

ATURAN WAJIB:
1. Buat 4 pilihan (A, B, C, D) dengan SATU jawaban yang benar.
2. Pengecoh (distractor) harus merepresentasikan kesalahan umum siswa.
3. Jangan tulis kata "Bloom" atau "C1", "C3" di teks soal.
4. Gunakan Bahasa Indonesia yang baku dan jelas.
5. Soal harus relevan dengan materi dan tingkat kesulitan yang diminta.

OUTPUT HARUS berupa ARRAY JSON MURNI (dimulai dengan "[" dan diakhiri dengan "]") dengan format persis seperti ini untuk setiap soal, DAN HARUS BERURUTAN sesuai daftar di atas:
[
  {
    "question": "teks soal 1 lengkap...",
    "options": { "A": "pilihan A", "B": "pilihan B", "C": "pilihan C", "D": "pilihan D" },
    "correctAnswer": "B",
    "indicator": "Siswa dapat..."
  },
  {
    "question": "teks soal 2 lengkap...",
    "options": { "A": "pilihan A", "B": "pilihan B", "C": "pilihan C", "D": "pilihan D" },
    "correctAnswer": "C",
    "indicator": "Siswa dapat..."
  }
]`;
}
