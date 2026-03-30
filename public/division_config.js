/**
 * division_config.js — 사업부 특화 설정 파일
 *
 * 새 사업부 적용 시 이 파일만 수정하면 됩니다.
 * constants.js 의 데이터(등급표, 단가)도 함께 교체하세요.
 *
 * 핵심 책임:
 *   1. items           — 견적 항목 목록 (id, label, defaultFrequency)
 *   2. calculateCosts  — 항목별 비용 계산 (조정 배수·할인율·VAT 반영)
 *   3. generateExcelMapping — Excel 셀 매핑 반환 (generateMapping() 위임 대상)
 */

// CUSTOMIZE: 사업부명, Excel 템플릿 파일명, Airtable PDF 필드 ID를 교체하세요.
window.DIVISION_CONFIG = {
    name: "정보통신사업부",
    excelTemplate: "정보통신사업부 견적서 양식_ver2.xlsx",
    airtablePdfFieldId: "fld4Zc6J2Etls5F48",

    // CUSTOMIZE: 견적 항목을 사업부에 맞게 추가·수정·삭제하세요.
    // id는 state.itemToggles 키, condOverride 키 prefix, HTML element id prefix로 사용됩니다.
    items: [
        { id: "inspection",  label: "성능점검", defaultFrequency: "1회" },
        { id: "maintenance", label: "유지점검", defaultFrequency: "2회" },
        { id: "appointment", label: "위탁선임", defaultFrequency: "12개월" },
    ],

    /**
     * calculateCosts — 항목별 비용 계산
     *
     * @param {object} condition   - lookupCondition() 반환값 (yearlyInspection 등 포함)
     * @param {number} adjFactor   - getAdjFactor() 반환값 (배수 × (1 - 할인율))
     * @param {object} toggles     - state.itemToggles  { inspection, maintenance, appointment }
     * @param {boolean} includeVAT - state.includeVAT
     * @param {object} condOverride - state.condOverride (사용자 수동 수정값)
     * @returns {{ inspection, maintenance, appointment, yearly, monthly, vat }}
     *
     * CUSTOMIZE: 항목이 달라지면 이 함수의 계산 로직을 수정하세요.
     */
    calculateCosts: function(condition, adjFactor, toggles, includeVAT, condOverride) {
        condOverride = condOverride || {};

        // 유효 조건값 (override 우선, toggle=false이면 0)
        const isApp   = toggles.appointment;
        const isMaint = toggles.maintenance;
        const isInsp  = toggles.inspection;

        const yearlyInspection  = isInsp  ? (condOverride.yearlyInspection  ?? condition.yearlyInspection)  : 0;
        const yearlyMaintenance = isMaint ? (condOverride.yearlyMaintenance ?? condition.yearlyMaintenance) : 0;
        const yearlyAppointment = isApp   ? (condOverride.yearlyAppointment ?? condition.yearlyAppointment) : 0;

        // baseSubtotal은 조건표 원본값 합계 (adjFactor 미적용)
        const baseSubtotal = yearlyInspection + yearlyMaintenance + yearlyAppointment;

        // adjFactor = 조정배수 × (1 - 할인율/100) 이므로
        // subtotal(할인·배수 적용) = baseSubtotal × adjFactor
        // 단, adjFactor를 여기서 다시 분해하지 않고, yearly 계산 방식은 app_step.js calculate() 와 일치시킵니다.
        // calculate()에서는 mult와 discount를 따로 적용하므로, 이 함수는 base 값만 반환합니다.
        // (yearly/monthly는 calculate()에서 최종 계산)

        // CUSTOMIZE: 항목별 costs 키 이름을 items[].id 와 일치시키세요.
        return {
            inspection:  yearlyInspection,
            maintenance: yearlyMaintenance,
            appointment: yearlyAppointment,
        };
    },

    /**
     * generateExcelMapping — Excel 셀 매핑 생성
     *
     * app_step.js의 generateMapping() 함수 본문을 이동한 것입니다.
     * 반환 구조: { "시트명": [ { name, cell, value }, ... ], ... }
     *
     * @param {object} state      - 전체 state 객체
     * @param {object} costs      - state.results.costs (calculate() 이후 값)
     * @param {number} adjFactor  - getAdjFactor() 반환값
     * @param {object} laborData  - { inspB, maintB, appB, appAnnualLabor, appWorkers }
     * @returns {object} 시트별 셀 매핑
     *
     * CUSTOMIZE: Excel 양식이 달라지면 이 함수의 시트명·셀 주소를 수정하세요.
     */
    generateExcelMapping: function(state, costs, adjFactor, laborData) {
        const { inspB, maintB, appB, appAnnualLabor, appWorkers } = laborData;

        // 할인율·조정 배수를 반영한 항목별 조정 금액
        const adjInspection  = state.itemToggles.inspection  ? Math.round(costs.inspection  * adjFactor) : 0;
        const adjMaintenance = state.itemToggles.maintenance ? Math.round(costs.maintenance * adjFactor) : 0;
        const adjAppointment = state.itemToggles.appointment ? Math.round(costs.appointment * adjFactor) : 0;

        // 서비스 항목 텍스트 (진행 항목만 포함)
        // CUSTOMIZE: 항목이 달라지면 serviceItems push 내용을 수정하세요.
        const serviceItems = [];
        if (state.itemToggles.inspection)  serviceItems.push('성능점검 1회');
        if (state.itemToggles.maintenance) serviceItems.push('유지보수관리점검 2회');
        if (state.itemToggles.appointment) serviceItems.push('유지관리자 위탁 선임(비상주) 1년');
        const serviceText = serviceItems.join(', ');

        // CUSTOMIZE: 시트명과 셀 주소는 Excel 양식에 맞게 수정하세요.
        return {
            "표지": [
                { name: "고객명", cell: "A10", value: "고객명 : " + state.customerName },
                { name: "견적일", cell: "A18", value: _formatKoreanDate(state.quotationDate || new Date().toISOString().slice(0, 10)) }
            ],
            "1. 견적서": [
                { name: "견적일",            cell: "E8",  value: state.quotationDate || new Date().toISOString().slice(0, 10) },
                { name: "고객명",            cell: "E9",  value: state.customerName },
                { name: "영업 담당자",        cell: "Q12", value: state.salesManager },
                { name: "영업 담당자 연락처",  cell: "X13", value: state.salesManagerPhone },
                { name: "주소",              cell: "J16", value: state.address },
                { name: "사용승인일",          cell: "J17", value: state.useAprDay },
                { name: "주용도",             cell: "J18", value: state.purpose },
                { name: "연면적",             cell: "W18", value: state.floorArea },
                { name: "담당자명",           cell: "J19", value: state.manager
                    ? `${state.manager}${state.managerPosition ? ' ' + state.managerPosition : ''}님`
                    : '' },
                { name: "담당자 연락처",       cell: "W19", value: state.managerPhone },
                { name: "서비스 항목",         cell: "J20", value: serviceText },
                { name: "성능점검비",          cell: "T24", value: adjInspection },
                { name: "성능점검 수량",        cell: "P24", value: state.itemToggles.inspection  ? 1 : 0 },
                { name: "유지점검 수량",        cell: "P25", value: state.itemToggles.maintenance ? 1 : 0 },
                { name: "위탁선임 수량",        cell: "P26", value: state.itemToggles.appointment ? 1 : 0 },
                { name: "유지점검비",          cell: "T25", value: adjMaintenance },
                { name: "위탁선임비",          cell: "T26", value: adjAppointment },
                { name: "합계(할인전)",         cell: "T27", value: adjInspection + adjMaintenance + adjAppointment },
                { name: "최종 연간 금액",       cell: "T28", value: costs.yearly },
                { name: "월 납부액",           cell: "T29", value: costs.monthly },
                { name: "부가세 여부",          cell: "G22", value: state.includeVAT ? '(VAT 포함)' : '(VAT 별도)' },
                { name: "부가세 금액",          cell: "T31", value: costs.vat || 0 },
                { name: "건물등급",            cell: "Y26", value: state.results.grade }
            ],
            "2.1 성능점검 산출내역": [
                { name: "성능 특급 점검인원 수",   cell: "E6",  value: inspB.rows[0].workers },
                { name: "성능 고급 점검인원 수",   cell: "E7",  value: inspB.rows[1].workers },
                { name: "성능 중급 점검인원 수",   cell: "E8",  value: inspB.rows[2].workers },
                { name: "성능 초급 점검인원 수",   cell: "E9",  value: inspB.rows[3].workers },
                { name: "성능 특급 점검 노임 단가", cell: "G6",  value: inspB.rows[0].wage },
                { name: "성능 고급 점검 노임 단가", cell: "G7",  value: inspB.rows[1].wage },
                { name: "성능 중급 점검 노임 단가", cell: "G8",  value: inspB.rows[2].wage },
                { name: "성능 초급 점검 노임 단가", cell: "G9",  value: inspB.rows[3].wage },
                { name: "인건비",              cell: "H10", value: inspB.labor },
                { name: "직접경비",             cell: "H11", value: inspB.expense },
                { name: "제경비",              cell: "H12", value: inspB.general },
                { name: "기술료",              cell: "H13", value: inspB.tech },
                { name: "성능 산출합계",          cell: "H14", value: inspB.total },
                { name: "성능 조정금액",          cell: "H15", value: adjInspection - inspB.total },
                { name: "성능 최종합계",          cell: "H17", value: adjInspection },
                { name: "투입인력",             cell: "O6",  value: state.results.inspectionWorkers }
            ],
            "2.2 유지점검 산출내역": [
                { name: "유지 특급 점검인원 수",   cell: "E6",  value: maintB.rows[0].workers },
                { name: "유지 고급 점검인원 수",   cell: "E7",  value: maintB.rows[1].workers },
                { name: "유지 중급 점검인원 수",   cell: "E8",  value: maintB.rows[2].workers },
                { name: "유지 초급 점검인원 수",   cell: "E9",  value: maintB.rows[3].workers },
                { name: "유지 특급 점검 노임 단가", cell: "G6",  value: maintB.rows[0].wage },
                { name: "유지 고급 점검 노임 단가", cell: "G7",  value: maintB.rows[1].wage },
                { name: "유지 중급 점검 노임 단가", cell: "G8",  value: maintB.rows[2].wage },
                { name: "유지 초급 점검 노임 단가", cell: "G9",  value: maintB.rows[3].wage },
                { name: "인건비",              cell: "H10", value: maintB.labor },
                { name: "직접경비",             cell: "H11", value: maintB.expense },
                { name: "제경비",              cell: "H12", value: maintB.general },
                { name: "기술료",              cell: "H13", value: maintB.tech },
                { name: "유지 산출합계",          cell: "H14", value: maintB.total },
                { name: "유지 조정금액",          cell: "H15", value: adjMaintenance - maintB.total },
                { name: "유지 최종합계",          cell: "H17", value: adjMaintenance },
                { name: "투입인력",             cell: "O6",  value: state.results.maintenanceWorkers }
            ],
            "2.3 선임 산출내역": [
                { name: "선임 특급 점검인원 수",   cell: "E6",  value: appB.rows[0].workers },
                { name: "선임 고급 점검인원 수",   cell: "E7",  value: appB.rows[1].workers },
                { name: "선임 중급 점검인원 수",   cell: "E8",  value: appB.rows[2].workers },
                { name: "선임 초급 점검인원 수",   cell: "E9",  value: appB.rows[3].workers },
                { name: "선임 특급 점검 노임 단가", cell: "G6",  value: appB.rows[0].wage },
                { name: "선임 고급 점검 노임 단가", cell: "G7",  value: appB.rows[1].wage },
                { name: "선임 중급 점검 노임 단가", cell: "G8",  value: appB.rows[2].wage },
                { name: "선임 초급 점검 노임 단가", cell: "G9",  value: appB.rows[3].wage },
                // 2.3 전용: H6=E6*F6(12개월)*G6 템플릿 수식에 맞춰 연간 인건비 계산
                // 직접경비·제경비·기술료는 템플릿에서 모두 0
                { name: "인건비",              cell: "H10", value: appAnnualLabor },
                { name: "직접경비",             cell: "H11", value: 0 },
                { name: "제경비",              cell: "H12", value: 0 },
                { name: "기술료",              cell: "H13", value: 0 },
                { name: "산출합계",             cell: "H14", value: appAnnualLabor },
                { name: "최종합계",             cell: "H17", value: adjAppointment },
                { name: "투입인력",             cell: "O6",  value: appWorkers }
            ],
            "4. 성능점검 수량내역": [
                { name: "조정계수", cell: "F4", value: state.results.coef }
            ]
        };
    }
};

// ---- 내부 유틸 (division_config.js 내부에서만 사용) ----
function _formatKoreanDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일`;
}
