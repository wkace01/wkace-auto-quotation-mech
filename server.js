require('dotenv').config(); // .env 파일 로드 (로컬 개발용, 배포 환경에서는 플랫폼 환경변수 사용)

const express = require('express');
const cors = require('cors');
const XlsxPopulate = require('xlsx-populate');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// LibreOffice 실행 경로 (운영 환경(Linux)에서는 전역 명령어 'soffice' 사용)
const SOFFICE_PATH = process.platform === 'win32'
    ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
    : 'soffice';

// CUSTOMIZE: Excel 템플릿은 프론트엔드의 division_config.js에서 templateName으로 전달받습니다.
// fallback: template/ 폴더 내 첫 번째 .xlsx 파일을 자동으로 사용합니다.
// division_config.js의 excelTemplate 값과 template/ 폴더 내 파일명이 일치해야 합니다.
function resolveTemplatePath(templateName) {
    if (templateName) {
        const explicit = path.join(__dirname, templateName);
        if (fs.existsSync(explicit)) return explicit;
        // template/ 하위도 탐색
        const inSubdir = path.join(__dirname, 'template', templateName);
        if (fs.existsSync(inSubdir)) return inSubdir;
    }
    // fallback: template/ 폴더 내 첫 번째 xlsx
    const templateDir = path.join(__dirname, 'template');
    if (fs.existsSync(templateDir)) {
        const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.xlsx'));
        if (files.length > 0) return path.join(templateDir, files[0]);
    }
    // 루트 폴더 내 첫 번째 xlsx (하위 호환)
    const rootFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.xlsx'));
    if (rootFiles.length > 0) return path.join(__dirname, rootFiles[0]);
    throw new Error('Excel 템플릿 파일을 찾을 수 없습니다. template/ 폴더에 .xlsx 파일을 배치하세요.');
}

// CUSTOMIZE: Airtable PDF 첨부 필드 ID를 환경변수로 관리합니다.
// Railway 등 배포 플랫폼에서 AIRTABLE_PDF_FIELD_ID 환경변수를 설정하세요.
// 미설정 시 정보통신사업부 기본값을 사용합니다.
const fieldId = process.env.AIRTABLE_PDF_FIELD_ID || 'fld4Zc6J2Etls5F48';

// 임시 파일 저장 디렉토리
const TEMP_DIR = path.join(__dirname, 'temp_pdf');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 정적 파일(프론트엔드 HTML, JS, CSS) 제공
app.use(express.static(path.join(__dirname, 'public')));

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * POST /generate-pdf — PDF 생성 + 선택적 Airtable 업로드
 * body: { mapping, airtableInfo?: { baseId, recordId }, fileNameMeta?, templateName? }
 * airtableInfo가 있으면 PDF 생성 직후 서버 내부에서 Airtable에 fire-and-forget 업로드
 */
app.post('/generate-pdf', async (req, res) => {
    const timestamp = Date.now();
    const tempXlsx = path.join(TEMP_DIR, `quotation_${timestamp}.xlsx`);
    const expectedPdf = tempXlsx.replace('.xlsx', '.pdf');

    try {
        const { templateName, data, airtableInfo, fileNameMeta } = req.body;
        const actualData = data || req.body;
        const outputSheets = req.body._outputSheets || req.body.outputSheets || ['견적서', '산출내역', '수량산출기준'];

        // CUSTOMIZE: templateName은 division_config.js의 excelTemplate 값이 전달됩니다.
        const templatePath = resolveTemplatePath(templateName);
        const workbook = await XlsxPopulate.fromFileAsync(templatePath);
        const sheetsToRemove = workbook.sheets().map(s => s.name()).filter(name => !outputSheets.includes(name));
        sheetsToRemove.forEach(name => workbook.deleteSheet(name));

        for (const [sheetName, cells] of Object.entries(actualData)) {
            const sheet = workbook.sheet(sheetName);
            if (!sheet || !Array.isArray(cells)) continue;
            for (const { cell, value } of cells) {
                if (cell) {
                    const ws_cell = sheet.cell(cell);
                    ws_cell.formula(undefined);
                    ws_cell.value(value);
                }
            }
        }

        await workbook.toFileAsync(tempXlsx);
        execSync(`"${SOFFICE_PATH}" --headless --convert-to pdf --outdir "${TEMP_DIR}" "${tempXlsx}"`, { timeout: 90000 });

        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 변환 실패');

        const safeStr = (s) => String(s || '').replace(/[/\\?%*:|"<>]/g, '_').trim();
        const meta = fileNameMeta || {};
        const uniqueId = safeStr(meta.quotationUniqueId) || 'NO_ID';
        const customerName = safeStr(meta.customerName) || (() => {
            try {
                for (const cells of Object.values(actualData)) {
                    if (Array.isArray(cells)) {
                        const found = cells.find(c => c.name === '고객명');
                        if (found && found.value) return safeStr(found.value);
                    }
                }
                return '견적서';
            } catch { return '견적서'; }
        })();
        const salesManager = safeStr(meta.salesManager);
        const salesManagerSuffix = salesManager ? `_${salesManager}` : '';
        const fileName = `${uniqueId}_견적서_${customerName}${salesManagerSuffix}.pdf`;

        const pdfBuffer = fs.readFileSync(expectedPdf);
        cleanup(tempXlsx, expectedPdf);

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);

        // Airtable 업로드 (fire-and-forget, 클라이언트 응답과 무관)
        if (airtableInfo && airtableInfo.recordId) {
            const token = process.env.AIRTABLE_API_KEY;
            if (token) {
                const base64Pdf = pdfBuffer.toString('base64');
                // CUSTOMIZE: fieldId는 환경변수 AIRTABLE_PDF_FIELD_ID 로 설정하세요.
                const uploadUrl = `https://content.airtable.com/v0/${airtableInfo.baseId}/${airtableInfo.recordId}/${fieldId}/uploadAttachment`;

                fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contentType: 'application/pdf', file: base64Pdf, filename: fileName })
                })
                .then(r => r.ok
                    ? console.log(`Airtable PDF 업로드 성공: ${fileName}`)
                    : r.json().then(e => console.error('Airtable PDF 업로드 실패:', e?.error?.message || e))
                )
                .catch(e => console.error('Airtable PDF 업로드 네트워크 오류:', e.message));
            }
        }

    } catch (err) {
        console.error('PDF 생성 오류:', err.message);
        cleanup(tempXlsx, expectedPdf);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

/**
 * POST /upload-pdf-to-airtable — PDF 생성 후 Airtable 직접 업로드
 */
app.post('/upload-pdf-to-airtable', async (req, res) => {
    const timestamp = Date.now();
    const tempXlsx = path.join(TEMP_DIR, `upload_${timestamp}.xlsx`);
    const expectedPdf = tempXlsx.replace('.xlsx', '.pdf');

    try {
        const { mapping, airtableInfo, templateName } = req.body;
        const { baseId, recordId } = airtableInfo;
        const token = process.env.AIRTABLE_API_KEY;

        if (!token) throw new Error('서버 환경 변수(AIRTABLE_API_KEY)가 설정되지 않았습니다.');

        const templatePath = resolveTemplatePath(templateName);
        const workbook = await XlsxPopulate.fromFileAsync(templatePath);
        const outputSheets = req.body._outputSheets || req.body.outputSheets || ['견적서', '산출내역', '수량산출기준'];
        const sheetsToRemove = workbook.sheets().map(s => s.name()).filter(name => !outputSheets.includes(name));
        sheetsToRemove.forEach(name => workbook.deleteSheet(name));

        for (const [sheetName, cells] of Object.entries(mapping)) {
            const sheet = workbook.sheet(sheetName);
            if (!sheet || !Array.isArray(cells)) continue;
            for (const { cell, value } of cells) {
                if (cell) {
                    const ws_cell = sheet.cell(cell);
                    ws_cell.formula(undefined);
                    ws_cell.value(value);
                }
            }
        }
        await workbook.toFileAsync(tempXlsx);
        execSync(`"${SOFFICE_PATH}" --headless --convert-to pdf --outdir "${TEMP_DIR}" "${tempXlsx}"`, { timeout: 90000 });

        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 생성 실패');

        const pdfBuffer = fs.readFileSync(expectedPdf);
        const base64Pdf = pdfBuffer.toString('base64');
        const fileName = (mapping["1. 견적서"]?.find(c => c.name === '고객명')?.value || '견적서') + '_견적서.pdf';

        // CUSTOMIZE: fieldId는 환경변수 AIRTABLE_PDF_FIELD_ID 로 설정하세요.
        const uploadUrl = `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`;

        const airRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contentType: 'application/pdf',
                file: base64Pdf,
                filename: fileName
            })
        });

        const airData = await airRes.json();
        if (!airRes.ok) throw new Error(airData.error?.message || '업로드 실패');

        res.json({ success: true, airData });

    } catch (err) {
        console.error('업로드 오류:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        cleanup(tempXlsx, expectedPdf);
    }
});

/**
 * ANY /airtable-proxy — 보안 프록시 (API 키 노출 방지)
 */
app.use('/airtable-proxy', async (req, res) => {
    const subPath = req.url.startsWith('/') ? req.url.slice(1) : req.url;
    const targetUrl = `https://api.airtable.com/v0/${subPath}`;
    const token = process.env.AIRTABLE_API_KEY;

    if (!token) return res.status(500).json({ error: '서버에 에어테이블 API 키가 설정되지 않았습니다.' });

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const airRes = await fetch(targetUrl, fetchOptions);
        const airData = await airRes.json();
        res.status(airRes.status).json(airData);
    } catch (err) {
        console.error('프록시 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /health — 상태 체크
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        division: process.env.DIVISION_NAME || 'template',
        envCheck: !!(process.env.AIRTABLE_API_KEY),
        time: new Date().toLocaleString()
    });
});

function cleanup(...files) {
    for (const f of files) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { }
    }
}

app.listen(PORT, () => {
    console.log(`서버 실행 중 → http://localhost:${PORT}`);
});
