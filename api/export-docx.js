import katex from 'katex';

// api/export-docx.js
// Generate file Word menggunakan format HTML-to-Word
// Dijamin 100% rapi, tabel tidak akan berantakan di Microsoft Word

function escapeHtml(text = '') {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function katexToMathML(latex, displayMode = false) {
    try {
        const rendered = katex.renderToString(
            String(latex || '').trim(),
            {
                output: 'mathml',
                displayMode,
                throwOnError: false,
                strict: 'ignore'
            }
        );

        const mathMatch = rendered.match(
            /<math[\s\S]*?<\/math>/i
        );

        return mathMatch
            ? mathMatch[0]
            : rendered;

    } catch (error) {
        console.error(
            'Gagal mengubah LaTeX ke MathML:',
            latex,
            error
        );

        return escapeHtml(latex);
    }
}

function normalizeMathMarkup(text = '') {
    const source = normalizeMathMarkup(text);

    if (
        source.includes('\\(') ||
        source.includes('\\[')
    ) {
        return source;
    }

    if (source.includes('=')) {
        const tokens = source.split(/(\s+)/);
        const meaningfulIndexes = [];

        tokens.forEach((token, index) => {
            if (!/^\s+$/.test(token) && token !== '') {
                meaningfulIndexes.push(index);
            }
        });

        const eqTokenIndex =
            meaningfulIndexes.find(
                index =>
                    tokens[index] === '=' ||
                    tokens[index].includes('=')
            );

        if (eqTokenIndex !== undefined) {
            const isOperator = token =>
                /^[+\-×÷*/=<>≤≥±]+$/.test(token);

            const isMathToken = token => {
                const cleaned =
                    token.replace(
                        /^[,;:]+|[,;:.!?]+$/g,
                        ''
                    );

                if (!cleaned) return false;
                if (isOperator(cleaned)) return true;
                if (/[\^√∑π∞±≤≥×÷*/(){}\[\]]/.test(cleaned)) return true;
                if (/^-?\d+(?:[.,]\d+)?$/.test(cleaned)) return true;
                if (/^[A-Za-z]$/.test(cleaned)) return true;
                if (
                    /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_().+\-^*/]+$/.test(cleaned) ||
                    /^[A-Za-z0-9_().+\-^*/]+[A-Za-z]$/.test(cleaned)
                ) return true;

                return false;
            };

            let left = eqTokenIndex;
            let right = eqTokenIndex;
            const eqPos = meaningfulIndexes.indexOf(eqTokenIndex);

            for (let p = eqPos - 1; p >= 0; p--) {
                const idx = meaningfulIndexes[p];
                if (!isMathToken(tokens[idx])) break;
                left = idx;
            }

            for (let p = eqPos + 1; p < meaningfulIndexes.length; p++) {
                const idx = meaningfulIndexes[p];
                if (!isMathToken(tokens[idx])) break;
                right = idx;
            }

            if (left < eqTokenIndex && right > eqTokenIndex) {
                return (
                    tokens.slice(0, left).join('') +
                    '\\(' +
                    tokens.slice(left, right + 1).join('').trim() +
                    '\\)' +
                    tokens.slice(right + 1).join('')
                );
            }
        }
    }

    return source.replace(
        /\b([A-Za-z0-9_]+(?:\^[A-Za-z0-9{}+\-]+))\b/g,
        '\\($1\\)'
    );
}

function renderTextWithMath(text = '') {
    const source = String(text ?? '');

    // Mendukung:
    // \( ... \) = inline equation
    // \[ ... \] = display equation
    const mathRegex =
        /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;

    let html = '';
    let lastIndex = 0;
    let match;

    while (
        (match = mathRegex.exec(source)) !== null
    ) {
        html += escapeHtml(
            source.slice(lastIndex, match.index)
        ).replace(/\n/g, '<br>');

        const isDisplay =
            match[1] !== undefined;

        const latex =
            isDisplay
                ? match[1]
                : match[2];

        const mathml =
            katexToMathML(
                latex,
                isDisplay
            );

        html += isDisplay
            ? '<div class="math-display">' +
              mathml +
              '</div>'
            : mathml;

        lastIndex =
            mathRegex.lastIndex;
    }

    html += escapeHtml(
        source.slice(lastIndex)
    ).replace(/\n/g, '<br>');

    return html;
}

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
            .math-display { text-align: center; margin: 8px 0; }
            math { font-family: 'Cambria Math', serif; }
            
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
        html += `<div class="question">${q.questionNumber}. ${renderTextWithMath(q.question)}</div>`;
        ['A', 'B', 'C', 'D'].forEach(letter => {
            if (q.options?.[letter]) {
                html += `<div class="option">${letter}. ${renderTextWithMath(q.options[letter])}</div>`;
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
                html += `<td class="text-center"><b>${q.questionNumber}.</b> ${renderTextWithMath(q.correctAnswer)}</td>`;
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
                <td>${renderTextWithMath(q.material || '')}</td>
                <td class="text-center">${q.bloomLevel || ''}</td>
                <td class="text-center">${q.difficulty || ''}</td>
                <td>${renderTextWithMath(q.indicator || '')}</td>
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
