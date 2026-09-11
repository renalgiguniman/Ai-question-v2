// api/export-docx.js
// Generate file Word menggunakan format HTML-to-Word
// Dijamin 100% rapi, tabel tidak akan berantakan di Microsoft Word

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { questions, config } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Data soal tidak valid.' });
    }

    const mapel = (config?.mapel || 'Mata Pelajaran').replace(/[<>&"']/g, '');
    const kelas = config ? `${config.jenjang} Kelas ${config.kelas}` : '';
    const today = new Date().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    let html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset="utf-8">
        <style>
            /* Reset dan styling dasar untuk Word */
            body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; }
            h1 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 0; }
            h2 { text-align: center; font-size: 12pt; font-weight: normal; margin-top: 5px; margin-bottom: 25px; }
            
            /* Styling Soal */
            .question { text-align: justify; margin-bottom: 12px; line-height: 1.5; }
            .option { text-align: justify; margin-left: 25px; margin-bottom: 6px; line-height: 1.5; }
            .spacer { margin-bottom: 25px; }
            
            /* Styling Tabel */
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { border: 1pt solid black; padding: 8px 10px; vertical-align: top; line-height: 1.3; }
            th { background-color: #e2e8f0; font-weight: bold; text-align: center; }
            .text-center { text-align: center; }
            
            /* Pembatas Halaman */
            .page-break { page-break-before: always; }
        </style>
    </head>
    <body>
        <!-- ================= SECTION 1: SOAL ================= -->
        <h1>LEMBAR SOAL PILIHAN GANDA</h1>
        <h2>${mapel} | ${kelas}</h2>
    `;

    questions.forEach(q => {
        html += `<div class="question">${q.questionNumber}. ${q.question}</div>`;
        ['A', 'B', 'C', 'D'].forEach(letter => {
            if (q.options?.[letter]) {
                html += `<div class="option">${letter}. ${q.options[letter]}</div>`;
            }
        });
        html += `<div class="spacer"></div>`;
    });

    // ================= SECTION 2: KUNCI JAWABAN =================
    html += `
        <div class="page-break"></div>
        <h1>KUNCI JAWABAN</h1>
        <h2>${mapel} | ${kelas}</h2>
        <table>
            <tr>
                <th width="20%">No &mdash; Jawaban</th>
                <th width="20%">No &mdash; Jawaban</th>
                <th width="20%">No &mdash; Jawaban</th>
                <th width="20%">No &mdash; Jawaban</th>
                <th width="20%">No &mdash; Jawaban</th>
            </tr>
    `;
    const COLS = 5;
    for (let i = 0; i < questions.length; i += COLS) {
        html += `<tr>`;
        for (let j = 0; j < COLS; j++) {
            const q = questions[i + j];
            if (q) {
                html += `<td class="text-center"><b>${q.questionNumber}.</b> ${q.correctAnswer}</td>`;
            } else {
                html += `<td></td>`;
            }
        }
        html += `</tr>`;
    }
    html += `</table>`;

    // ================= SECTION 3: KISI-KISI =================
    html += `
        <div class="page-break"></div>
        <h1>KISI-KISI SOAL</h1>
        <h2>${mapel} | ${kelas} | ${today}</h2>
        <table>
            <tr>
                <th width="5%">No</th>
                <th width="20%">Materi</th>
                <th width="12%">Level Bloom</th>
                <th width="12%">Kesulitan</th>
                <th width="41%">Indikator Soal</th>
                <th width="10%">Bentuk</th>
            </tr>
    `;
    questions.forEach(q => {
        html += `
            <tr>
                <td class="text-center">${q.questionNumber}</td>
                <td>${q.material || ''}</td>
                <td class="text-center">${q.bloomLevel || ''}</td>
                <td class="text-center">${q.difficulty || ''}</td>
                <td>${q.indicator || ''}</td>
                <td class="text-center">PG</td>
            </tr>
        `;
    });
    html += `
        </table>
    </body>
    </html>
    `;

    const filename = `Soal_${mapel.replace(/\s+/g, '_')}_${kelas.replace(/\s+/g, '_')}.doc`;

    // Kirim sebagai file word (.doc)
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(Buffer.from(html, 'utf8'));
}
