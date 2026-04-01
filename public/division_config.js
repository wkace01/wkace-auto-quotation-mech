/**
 * division_config.js — 기계사업부 특화 설정
 *
 * 핵심 책임:
 *   1. items              — 견적 항목 목록 (id, label, defaultFrequency)
 *   2. outputSheets       — PDF/Excel 출력 시트 목록
 *   3. calculateCosts     — 설비 수량 기반 투입인원 산출 및 비용 계산
 *   4. generateExcelMapping — Excel 셀 매핑 반환
 */

window.DIVISION_CONFIG = {
    name: "기계사업부",
    excelTemplate: "26-A-0001 견적서(일반면적)_에이스방재.xlsx",
    airtablePdfFieldId: "fldXXXXXXXXXXXXXX",   // 추후 Airtable 연동 시 교체

    // PDF/Excel 출력 대상 시트
    outputSheets: ["견적서", "산출내역", "수량산출기준"],

    // 견적 항목 목록
    items: [
        { id: "inspection",  label: "성능점검", defaultFrequency: "1회" },
        { id: "maintenance", label: "유지점검", defaultFrequency: "2회" },
        { id: "appointment", label: "위탁선임", defaultFrequency: "12개월" },
    ],

    /**
     * calculateCosts — 설비 수량 기반 비용 계산
     *
     * @param {object}  condition     - lookupCondition() 반환값
     * @param {number}  adjFactor     - getAdjFactor() 반환값 (기계사업부는 인원 할인율에만 사용)
     * @param {object}  toggles       - state.itemToggles
     * @param {boolean} includeVAT    - state.includeVAT
     * @param {object}  condOverride  - state.condOverride (수동 조정값)
     * @param {object}  equipmentQty  - state.equipmentQty (25종 설비 수량)
     * @returns {{ inspection, maintenance, appointment, personnel, inspBreakdown, maintBreakdown }}
     */
    calculateCosts: function(condition, adjFactor, toggles, includeVAT, condOverride, equipmentQty) {
        condOverride = condOverride || {};
        equipmentQty = equipmentQty || {};

        const RATES  = window.CONSTANTS.EQUIPMENT_INSPECTION_RATES;
        const RATIOS = window.CONSTANTS.EQUIPMENT_RATIOS;

        // ① 설비별 산출 점검수량 계산
        const checkQty = {};
        for (const [key, cfg] of Object.entries(RATES)) {
            const raw = equipmentQty[key] || 0;
            checkQty[key] = cfg.method === 'roundup'
                ? Math.ceil(raw * cfg.rate)
                : raw;   // 'direct'
        }

        // ② 설비별 투입인원 합산 (소수점 누적) 및 디버깅 데이터 생성
        let sRaw = 0, hRaw = 0, mRaw = 0;
        const personnelBreakdown = [];

        for (const [key, ratio] of Object.entries(RATIOS)) {
            const qty = key.startsWith('_') ? 1 : (checkQty[key] || 0);
            const sCont = qty * ratio.s;
            const hCont = qty * ratio.h;
            const mCont = qty * ratio.m;

            sRaw += sCont;
            hRaw += hCont;
            mRaw += mCont;

            personnelBreakdown.push({
                name: key.startsWith('_') ? key.substring(1) : key,
                inputQty: key.startsWith('_') ? 1 : (equipmentQty[key] || 0),
                rate: RATES[key] ? RATES[key].rate : 1.0,
                checkQty: qty,
                sRatio: ratio.s,
                hRatio: ratio.h,
                mRatio: ratio.m,
                sContribution: sCont,
                hContribution: hCont,
                mContribution: mCont
            });
        }

        // ③ 인원 할인율 적용 후 ROUNDDOWN
        const discountRate = condOverride.personnelDiscount != null
            ? condOverride.personnelDiscount / 100
            : 0;
        const senior = Math.floor(sRaw * (1 - discountRate));
        const high   = Math.floor(hRaw * (1 - discountRate));
        const mid    = Math.floor(mRaw * (1 - discountRate));

        // ④ 비용 계산
        const inspBreakdown  = _buildMechBreakdown(senior, high, mid);
        const maintBreakdown = _buildMechBreakdown(0, high, mid);

        const inspectionCost  = toggles.inspection  ? _applyRoundDown5(inspBreakdown.total)  : 0;
        const maintenanceCost = toggles.maintenance ? _applyRoundDown5(maintBreakdown.total) : 0;

        // ⑤ 위탁선임 비용
        const monthlyApp = condOverride.monthlyAppointment != null
            ? condOverride.monthlyAppointment
            : (condition ? condition.monthlyAppointment : 0);
        const appQty = condOverride.appointmentFrequency != null
            ? parseInt(condOverride.appointmentFrequency) || 12
            : 12;
        const appointmentCost = toggles.appointment ? (monthlyApp * appQty) : 0;

        return {
            inspection:    inspectionCost,
            maintenance:   maintenanceCost,
            appointment:   appointmentCost,
            personnel:     { senior, high, mid },
            inspBreakdown,
            maintBreakdown,
            checkQty,
            personnelBreakdown, // 디버깅용
            rawPersonnel: { sRaw, hRaw, mRaw } // 디버깅용
        };
    },

    /**
     * generateExcelMapping — 기계사업부 Excel 셀 매핑 생성
     *
     * 출력 시트: 견적서 / 산출내역 / 수량산출기준
     *
     * @param {object} state      - 전체 state 객체
     * @param {object} costs      - calculateCosts() 반환값
     * @param {number} adjFactor  - getAdjFactor() 반환값
     * @param {object} laborData  - (사용 안 함, 인터페이스 호환용)
     * @returns {object} 시트별 셀 매핑
     */
    generateExcelMapping: function(state, costs, adjFactor, laborData) {
        const adj = state.itemToggles;
        const personnel   = state.results.personnel      || { senior: 0, high: 0, mid: 0 };
        const inspB       = state.results.inspBreakdown  || _buildMechBreakdown(0, 0, 0);
        const maintB      = state.results.maintBreakdown || _buildMechBreakdown(0, 0, 0);
        const checkQty    = costs.checkQty               || {};
        const WAGES       = window.CONSTANTS.GRADE_WAGES;

        // 건물 유형 분기
        const isApt = _isApartment(state.purpose);
        const areaLabel = isApt ? '세대 수' : '연면적';
        const areaValue = isApt ? (state.세대수 || '') : (state.floorArea || '');
        const areaUnit  = isApt ? '세대' : '㎡';

        // 점검 항목 텍스트
        const serviceItems = [];
        if (adj.inspection)  serviceItems.push(`성능점검 ${state.inspectionFrequency  || '1회'}`);
        if (adj.maintenance) serviceItems.push(`유지점검 ${state.maintenanceFrequency || '2회'}`);
        if (adj.appointment) serviceItems.push(`위탁선임(비상주) ${state.appointmentFrequency || '12개월'}`);

        const adjInsp  = adj.inspection  ? costs.inspection  : 0;
        const adjMaint = adj.maintenance ? costs.maintenance : 0;
        const adjApp   = adj.appointment ? costs.appointment : 0;
        const subtotal = adjInsp + adjMaint + adjApp;

        const vatText  = state.includeVAT ? '(부가세 포함)' : '(부가세 별도)';
        const yearly   = state.includeVAT ? Math.round(subtotal * 1.1) : subtotal;
        const monthly  = Math.floor(yearly / 12);

        const inspFreq  = adj.inspection  ? (parseInt(state.inspectionFrequency)  || 1) : 0;
        const maintFreq = adj.maintenance ? (parseInt(state.maintenanceFrequency) || 2) : 0;
        const appFreq   = adj.appointment ? (parseInt(state.appointmentFrequency) || 12) : 0;

        return {
            "견적서": [
                { name: "견적일",           cell: "E7",  value: state.quotationDate || '' },
                { name: "고객명(상단)",     cell: "E8",  value: state.customerName || '' },
                { name: "영업담당자",       cell: "Q11", value: state.salesManager || '' },
                { name: "영업담당자연락처", cell: "X12", value: state.salesManagerPhone || '' },
                { name: "고객명(대상물)",   cell: "J14", value: state.customerName || '' },
                { name: "도로명주소",       cell: "J15", value: state.roadAddress || state.address || '' },
                { name: "사용승인일",       cell: "J16", value: state.useAprDay || '' },
                { name: "주용도",           cell: "J17", value: state.purpose || '' },
                { name: "담당자",           cell: "J18", value: state.manager
                    ? `${state.manager}${state.managerPosition ? ' ' + state.managerPosition : ''}님`
                    : '' },
                { name: "담당자연락처",     cell: "W18", value: state.managerPhone || '' },
                { name: "점검항목",         cell: "J19", value: serviceItems.join(', ') },
                { name: "연면적라벨",       cell: "R17", value: areaLabel },
                { name: "연면적값",         cell: "W17", value: areaValue },
                { name: "연면적단위",       cell: "Z17", value: areaUnit },
                { name: "부가세정보",       cell: "G21", value: vatText },
                { name: "성능수량",         cell: "P23", value: inspFreq },
                { name: "성능금액",         cell: "T23", value: adjInsp },
                { name: "유지수량",         cell: "P24", value: maintFreq },
                { name: "유지금액",         cell: "T24", value: adjMaint },
                { name: "위탁수량",         cell: "P25", value: appFreq },
                { name: "위탁금액",         cell: "T25", value: adjApp },
                { name: "합계금액",         cell: "T26", value: subtotal },
                { name: "부가세적용합계",   cell: "T27", value: yearly },
                { name: "월분할금액",       cell: "T28", value: monthly },
                { name: "월분할O21",        cell: "O21", value: monthly },
                { name: "합계금액부가세V21", cell: "V21", value: yearly },
                { name: "원정텍스트",       cell: "T21", value: "원정" },
            ],
            "산출내역": [
                // 성능점검
                { name: "성능_특급_인원",  cell: "D6",  value: personnel.senior || '' },
                { name: "성능_특급_단가",  cell: "E6",  value: personnel.senior > 0 ? WAGES['특급'] : '' },
                { name: "성능_고급_인원",  cell: "D7",  value: personnel.high   || '' },
                { name: "성능_고급_단가",  cell: "E7",  value: personnel.high   > 0 ? WAGES['고급'] : '' },
                { name: "성능_중급_인원",  cell: "D8",  value: personnel.mid    || '' },
                { name: "성능_중급_단가",  cell: "E8",  value: personnel.mid    > 0 ? WAGES['중급'] : '' },
                { name: "성능_직접인건비", cell: "F5",  value: inspB.labor   || 0 },
                { name: "성능_직접경비",   cell: "F9",  value: inspB.expense || 0 },
                { name: "성능_제경비",     cell: "F10", value: inspB.general || 0 },
                { name: "성능_기술료",     cell: "F11", value: inspB.tech    || 0 },
                { name: "성능_소계",       cell: "F12", value: inspB.total   || 0 },
                { name: "성능_조정금액",   cell: "F14", value: adjInsp },
                { name: "성능_조정차액",   cell: "G14", value: (inspB.total || 0) - adjInsp },
                // 유지점검 (특급 없음)
                { name: "유지_고급_인원",  cell: "D19", value: personnel.high || '' },
                { name: "유지_고급_단가",  cell: "E19", value: personnel.high > 0 ? WAGES['고급'] : '' },
                { name: "유지_중급_인원",  cell: "D20", value: personnel.mid  || '' },
                { name: "유지_중급_단가",  cell: "E20", value: personnel.mid  > 0 ? WAGES['중급'] : '' },
                { name: "유지_직접인건비", cell: "F18", value: maintB.labor   || 0 },
                { name: "유지_직접경비",   cell: "F21", value: maintB.expense || 0 },
                { name: "유지_제경비",     cell: "F22", value: maintB.general || 0 },
                { name: "유지_기술료",     cell: "F23", value: maintB.tech    || 0 },
                { name: "유지_소계",       cell: "F24", value: maintB.total   || 0 },
                { name: "유지_조정금액",   cell: "F26", value: adjMaint },
                { name: "유지_조정차액",   cell: "G26", value: (maintB.total || 0) - adjMaint },
            ],
            "수량산출기준": [
                { name: "냉동기",           cell: "C3",  value: state.equipmentQty?.['냉동기']           || 0 },
                { name: "냉각탑",           cell: "C4",  value: state.equipmentQty?.['냉각탑']           || 0 },
                { name: "축열",             cell: "C5",  value: state.equipmentQty?.['축열']             || 0 },
                { name: "보일러",           cell: "C6",  value: state.equipmentQty?.['보일러']           || 0 },
                { name: "열교환기",         cell: "C7",  value: state.equipmentQty?.['열교환기']         || 0 },
                { name: "팽창탱크",         cell: "C8",  value: state.equipmentQty?.['팽창탱크']         || 0 },
                { name: "펌프",             cell: "C9",  value: state.equipmentQty?.['펌프']             || 0 },
                { name: "신재생에너지",     cell: "C10", value: state.equipmentQty?.['신재생에너지']     || 0 },
                { name: "패키지에어컨",     cell: "C11", value: state.equipmentQty?.['패키지에어컨']     || 0 },
                { name: "항온항습기",       cell: "C12", value: state.equipmentQty?.['항온항습기']       || 0 },
                { name: "공기조화기",       cell: "C13", value: state.equipmentQty?.['공기조화기']       || 0 },
                { name: "팬코일유닛",       cell: "C14", value: state.equipmentQty?.['팬코일유닛']       || 0 },
                { name: "환기설비",         cell: "C15", value: state.equipmentQty?.['환기설비']         || 0 },
                { name: "필터",             cell: "C16", value: state.equipmentQty?.['필터']             || 0 },
                { name: "위생기구설비",     cell: "C17", value: state.equipmentQty?.['위생기구설비']     || 0 },
                { name: "급수펌프급탕탱크", cell: "C18", value: state.equipmentQty?.['급수펌프급탕탱크'] || 0 },
                { name: "고저수조",         cell: "C19", value: state.equipmentQty?.['고저수조']         || 0 },
                { name: "오배수통기우수",   cell: "C20", value: state.equipmentQty?.['오배수통기우수']   || 0 },
                { name: "오수정화설비",     cell: "C21", value: state.equipmentQty?.['오수정화설비']     || 0 },
                { name: "물재이용설비",     cell: "C22", value: state.equipmentQty?.['물재이용설비']     || 0 },
                { name: "배관설비",         cell: "C23", value: state.equipmentQty?.['배관설비']         || 0 },
                { name: "덕트설비",         cell: "C24", value: state.equipmentQty?.['덕트설비']         || 0 },
                { name: "보온설비",         cell: "C25", value: state.equipmentQty?.['보온설비']         || 0 },
                { name: "자동제어설비",     cell: "C26", value: state.equipmentQty?.['자동제어설비']     || 0 },
                { name: "방음방진내진",     cell: "C27", value: state.equipmentQty?.['방음방진내진']     || 0 },
                // E열: 템플릿 수식(=ROUNDUP(Cx*비율,0))이 LibreOffice 변환 시 자동 재계산 — 직접 쓰지 않음
            ],
        };
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 함수 (division_config.js 내부에서만 사용)
// ────────────────────────────────────────────────────────────────────────────

/** 공동주택 여부 판별 */
function _isApartment(purpose) {
    return (purpose || '').includes('공동주택') || (purpose || '').includes('아파트');
}

/**
 * 인건비 구조 계산
 *   직접인건비 = 각 등급 인원 × 단가의 합 (절사 없음)
 *   직접경비   = ROUND(직접인건비 × 10%)
 *   제경비     = ROUND(직접인건비 × 110%)
 *   기술료     = ROUND((직접인건비 + 제경비) × 20%)
 *   total      = 직접인건비 + 직접경비 + 제경비 + 기술료
 *   최종 합계  → _applyRoundDown5() 으로 10만원 단위 절사
 */
function _buildMechBreakdown(s, h, m) {
    const WAGES = window.CONSTANTS.GRADE_WAGES;
    const sAmt = s * WAGES['특급'];
    const hAmt = h * WAGES['고급'];
    const mAmt = m * WAGES['중급'];
    const labor = sAmt + hAmt + mAmt;
    const expense = Math.round(labor * 0.1);
    const general = Math.round(labor * 1.1);
    const tech    = Math.round((labor + general) * 0.2);
    const total   = labor + expense + general + tech;
    return {
        rows: [
            { grade: '특급', workers: s, wage: s > 0 ? WAGES['특급'] : '', amount: sAmt },
            { grade: '고급', workers: h, wage: h > 0 ? WAGES['고급'] : '', amount: hAmt },
            { grade: '중급', workers: m, wage: m > 0 ? WAGES['중급'] : '', amount: mAmt },
        ],
        labor, expense, general, tech, total
    };
}

/** ROUNDDOWN(-5): 10만원 단위로 내림 */
function _applyRoundDown5(val) {
    return Math.floor(val / 100000) * 100000;
}
