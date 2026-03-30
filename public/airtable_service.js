/**
 * Airtable Integration Service for Quotation Automation (Proxy-Only Version)
 * All sensitive requests go through /airtable-proxy on the server.
 */

const AIRTABLE_CONFIG = {
    BASE_ID: 'appFEZaTg3yZU1QwW',
    TABLE_CUSTOMER: 'tbloJO82kbfPy1cgW', // 고객
    TABLE_QUOTATION: 'tbloif1mheDqaRRuR', // 견적
};

// 백엔드 서버 URL 설정 (로컬 환경 vs 실제 배포 환경 자동 구분)
// localhost 또는 127.0.0.1이면 어떤 포트든 3001로 프록시
const BACKEND_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : '';

const PROXY_URL = `${BACKEND_URL}/airtable-proxy`;

window.airtableService = {
    /**
     * 1. 고객 저장/수정, 견적 기록 및 PDF 업로드 통합 실행
     */
    saveQuotation: async (state) => {
        try {
            console.log('[Airtable] Starting save process...');

            // 1) 고객 Upsert
            const customerId = await window.airtableService.upsertCustomer(state);

            // 레이트 리밋 방지: upsertCustomer (2req) 후 createQuotation (1req) 사이 딜레이
            await new Promise(resolve => setTimeout(resolve, 350));

            // 2) 견적 기록 생성
            const quotationResult = await window.airtableService.createQuotation(customerId, state);
            const quotationId = quotationResult.id;
            const quotationUniqueId = quotationResult.fields?.['견적 고유 ID'] ?? '';

            // PDF 첨부는 /generate-pdf 서버에서 airtableInfo를 받아 처리
            // (LibreOffice 이중 실행 방지)
            return { success: true, customerId, quotationId, quotationUniqueId };
        } catch (error) {
            console.error('[Airtable] Overall process error:', error);
            throw error;
        }
    },

    /**
     * 2. 시/군 단위 지역 추출 (수원, 인천 등)
     */
    extractRegion: (address) => {
        if (!address) return '';
        const parts = address.split(' ');
        if (parts.length < 1) return '';
        const first = parts[0];

        const metroMap = {
            '서울특별시': '서울', '인천광역시': '인천', '부산광역시': '부산', '대구광역시': '대구',
            '대전광역시': '대전', '광주광역시': '광주', '울산광역시': '울산', '세종특별자치시': '세종',
            '세종시': '세종'
        };
        if (metroMap[first]) return metroMap[first];

        const shortMetros = ['서울', '인천', '부산', '대구', '대전', '광주', '울산', '세종'];
        for (const m of shortMetros) {
            if (first.startsWith(m)) return m;
        }

        // 경기도 수원시 -> 수원
        if (parts.length > 1) {
            return parts[1].replace(/[시군]$/, '');
        }

        return first.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '');
    },

    /**
     * 3. 고객 정보 Upsert (Proxy 사용)
     */
    upsertCustomer: async (state) => {
        const { address, roadAddress, buildingName, floorArea, useAprDay, purpose, manager, managerPhone, managerPosition, managerMobile, managerEmail, jibunAddress, zonecode } = state;
        
        const targetAddress = roadAddress || address;
        const effectiveBuildingName = buildingName || state.customerName || '';
        const formula = effectiveBuildingName
            ? `AND({건물명}='${effectiveBuildingName.replace(/'/g, "\\'")}', {도로명 주소}='${targetAddress.replace(/'/g, "\\'")}')`
            : `{도로명 주소}='${targetAddress.replace(/'/g, "\\'")}'`;
        const searchUrl = `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}?filterByFormula=${encodeURIComponent(formula)}`;

        const response = await fetch(searchUrl);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`고객 조회 실패 (${response.status}): ${errText.slice(0, 200)}`);
        }
        const data = await response.json();
        if (data.error) throw new Error(`Airtable 오류: ${data.error.message || JSON.stringify(data.error)}`);

        // 연락처 자동 분류
        let finalPhone = managerPhone || '';
        let finalMobile = managerMobile || '';

        if (finalPhone && finalPhone.startsWith('010') && !finalMobile) {
            finalMobile = finalPhone;
            finalPhone = '';
        } else if (finalMobile && !finalMobile.startsWith('010') && !finalPhone) {
            finalPhone = finalMobile;
            finalMobile = '';
        }

        const fields = {
            "건물명": effectiveBuildingName,
            "도로명 주소": targetAddress,
            "지번 주소": jibunAddress || '',
            "우편번호": zonecode || '',
            "지역": window.airtableService.extractRegion(targetAddress),
            "연면적(㎡)": floorArea,
            "주용도": purpose ? [purpose] : [],
            "사용승인일": useAprDay || null,
            "담당자": manager || '',
            "담당자 직함": managerPosition || '',
            "전화번호": finalPhone,
            "휴대전화": finalMobile,
            "이메일": managerEmail || ''
        };

        if (data.records && data.records.length > 0) {
            const recordId = data.records[0].id;
            const patchRes = await fetch(`${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}/${recordId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields, typecast: true })
            });
            if (!patchRes.ok) {
                const patchErr = await patchRes.json().catch(() => ({}));
                throw new Error(`고객 정보 업데이트 실패 (${patchRes.status}): ${patchErr.error?.message || ''}`);
            }
            return recordId;
        } else {
            const createRes = await fetch(`${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields, typecast: true })
            });
            const createData = await createRes.json();
            if (createData.error) throw new Error(createData.error.message);
            return createData.id;
        }
    },

    /**
     * 4. 견적 기록 생성 (Proxy 사용)
     */
    createQuotation: async (customerId, state) => {
        const { results, salesManager, itemToggles, maintenanceFrequency, appointmentFrequency, quotationDate } = state;

        const serviceTypes = [];
        if (itemToggles.inspection)  serviceTypes.push('성능');
        if (itemToggles.maintenance) serviceTypes.push('유지');
        if (itemToggles.appointment) serviceTypes.push('위탁선임');

        const today = new Date().toISOString().split('T')[0];
        const quoteDate = quotationDate || today;

        // null/undefined 필드는 제외 (Airtable 링크드 필드에 null 전송 시 422 에러)
        const fields = {
            '고객 고유 ID': [customerId],
            '견적 금액': (results?.costs?.yearly ?? 0) - (results?.costs?.vat ?? 0),
            '견적서 발송일': quoteDate
        };
        // 서비스 유형: 빈 배열도 오류 날 수 있으므로 값 있을 때만 추가
        if (serviceTypes.length > 0) fields['서비스 유형'] = serviceTypes;
        // 영업 담당자: null 전송 금지 (링크드 필드 422 원인)
        if (salesManager) fields['영업 담당자'] = salesManager;
        // 점검/선임 횟수: 해당 서비스 활성 시만 추가
        if (itemToggles.maintenance) fields['유지 점검 횟수'] = maintenanceFrequency || '2회';
        if (itemToggles.appointment) fields['위탁 선임 횟수'] = appointmentFrequency || '12개월';

        const response = await fetch(`${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_QUOTATION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields, typecast: true })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err.error?.message || err.error || JSON.stringify(err);
            throw new Error(`견적 저장 실패 (HTTP ${response.status}): ${msg}`);
        }

        return await response.json();
    }
};
