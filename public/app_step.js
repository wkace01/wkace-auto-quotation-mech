// ---- Master Data (Linked from constants.js) ----
const {
    QUOTATION_CONDITIONS,
    ADJUSTMENT_COEFFICIENTS,
    SALES_MANAGERS,
    GRADE_STYLES,
    GRADE_WAGES,
    APPOINTMENT_WAGES,
    GRADE_ORDER,
    COND_RANGE_LABELS
} = window.CONSTANTS;

// ---- State ----
// CUSTOMIZE(변경 1): itemToggles와 frequency 초기값을 DIVISION_CONFIG.items에서 동적으로 생성합니다.
const state = {
    customerName: "",
    // 각 항목의 frequency: DIVISION_CONFIG.items[].defaultFrequency 에서 초기화
    ...Object.fromEntries(
        window.DIVISION_CONFIG.items.map(item => [item.id + 'Frequency', item.defaultFrequency])
    ),
    floorArea: 0,
    address: "",      // UI 표시용 (참고용)
    roadAddress: "",  // 에어테이블 저장용 (표준 도로명)
    buildingName: "",
    jibunAddress: "",
    zonecode: "",
    purpose: "",
    useAprDay: "",
    manager: "",
    managerPhone: "",
    managerPosition: "",
    managerMobile: "",
    managerEmail: "",
    salesManager: "",
    salesManagerPhone: "",
    quotationDate: "",
    selectedEquipments: new Set(),
    condOverride: {},         // 사용자가 수정한 조건표 값 { key: value }
    _lastConditionArea: -1,  // 이전 구간 추적 (구간 변경 시 override 초기화용)
    // CUSTOMIZE(변경 1): itemToggles를 DIVISION_CONFIG.items에서 동적으로 생성
    itemToggles: Object.fromEntries(
        window.DIVISION_CONFIG.items.map(item => [item.id, true])
    ),
    discount: 0, // 할인율 (%)
    includeVAT: false, // 부가세 포함 여부
    useMultiplier: false, // 견적 조정 배수 적용 여부
    multiplier: 1.5,      // 견적 조정 배수 (기본 1.5배)
    // 기계사업부 전용
    equipmentQty: Object.fromEntries(
        Object.keys(window.CONSTANTS.EQUIPMENT_INSPECTION_RATES || {}).map(k => {
            const defaultOne = [
                '계획검토', '시스템검토',
                '위생기구설비', '급수펌프급탕탱크', '고저수조', '오배수통기우수',
                '배관설비', '덕트설비', '보온설비', '자동제어설비', '방음방진내진'
            ];
            return [k, defaultOne.includes(k) ? 1 : 0];
        })
    ),
    세대수: 0,
    results: {
        grade: "",
        coef: 1,
        inspectionWorkers: 0,
        maintenanceWorkers: 0,
        personnel: { senior: 0, high: 0, mid: 0 },
        inspBreakdown: null,
        maintBreakdown: null,
        checkQty: {},
        costs: { inspection: 0, maintenance: 0, appointment: 0, yearly: 0, monthly: 0, vat: 0 }
    }
};

// ---- 공통 유틸 ----
const fmt = n => Math.round(n).toLocaleString('ko-KR');

function getAdjFactor() {
    const mult = state.useMultiplier ? state.multiplier : 1;
    return mult * (1 - state.discount / 100);
}

// ---- 인건비 산출 헬퍼 ----
// workers: 투입인원, grade: 건물등급 → 해당 등급만 인원 배정, 나머지 0
function calcLaborBreakdown(workers, grade, wages = GRADE_WAGES) {
    const rows = GRADE_ORDER.map(g => ({
        grade: g,
        workers: g === grade ? workers : "",         // 해당 등급 아니면 빈칸
        wage: g === grade && workers > 0 ? wages[g] : "",  // 해당 등급 아니면, 또는 workers=0이면 빈칸
        amount: g === grade ? workers * wages[g] : 0,
    }));
    const labor = workers * (wages[grade] || 0);        // 직접인건비
    const expense = Math.round(labor * 0.1);                     // 직접경비 (인건비×10%)
    const general = Math.round(labor * 1.1);                     // 제경비   (인건비×110%)
    const tech = Math.round((labor + general) * 0.2);         // 기술료   ((인건비+제경비)×20%)
    return {
        rows, labor, expense, general, tech,
        total: labor + expense + general + tech
    };
}


function calcFloorGrade(area, purpose, householdCount) {
    const isApt = (purpose || '').includes('공동주택') || (purpose || '').includes('아파트');
    if (isApt && householdCount > 0) {
        // 세대수 기준 등급
        const thresholds = window.CONSTANTS.HOUSEHOLD_GRADE_THRESHOLDS;
        let grade = '';
        for (const t of thresholds) {
            if (householdCount >= t.count) grade = t.grade;
        }
        return grade;
    }
    // 연면적 기준 등급
    if (!area || area < 1) return '';
    const thresholds = window.CONSTANTS.AREA_GRADE_THRESHOLDS;
    let grade = '';
    for (const t of thresholds) {
        if (area >= t.area) grade = t.grade;
    }
    return grade;
}

// 등급으로 QUOTATION_CONDITIONS 조회
function lookupConditionByGrade(grade) {
    return QUOTATION_CONDITIONS.find(c => c.grade === grade) || null;
}

function updateGradeBadge(area, purpose, householdCount) {
    const el = document.getElementById('floor-grade');
    if (!el) return;
    const grade = calcFloorGrade(area, purpose, householdCount);
    if (!grade) {
        const isApt = (purpose || '').includes('공동주택') || (purpose || '').includes('아파트');
        if (isApt && householdCount > 0 && householdCount < 300) {
            el.textContent = '해당 없음 (300세대 미만)';
        } else {
            el.textContent = '연면적 입력 후 자동 분류';
        }
        el.style.color = 'var(--text-muted)';
        el.style.fontSize = '0.95rem';
        return;
    }
    const style = GRADE_STYLES[grade];
    el.textContent = grade;
    el.style.color = style.color;
    el.style.fontSize = '1.2rem';
}

// ---- Lookup Helpers ----
function lookupCondition(area) {
    let match = null;
    for (const c of QUOTATION_CONDITIONS) {
        if (area >= c.area) match = c;
    }
    return match;
}

function lookupCoef(area) {
    let match = null;
    for (const c of ADJUSTMENT_COEFFICIENTS) {
        if (area >= c.area) match = c;
    }
    return match;
}

// ---- Calculation ----
function calculate() {
    const area = state.floorArea || 0;

    // 기계사업부: 등급을 연면적/세대수 기준으로 계산 후 조건표 조회
    const grade = calcFloorGrade(area, state.purpose, state.세대수);
    const condition = grade ? lookupConditionByGrade(grade) : lookupCondition(area);

    if (!condition) {
        state.results.grade = "면적/세대수를 입력하세요";
        state.results.coef = 0;
        state.results.inspectionWorkers = 0;
        state.results.maintenanceWorkers = 0;
        state.results.personnel = { senior: 0, high: 0, mid: 0 };
        state.results.costs = { inspection: 0, maintenance: 0, appointment: 0, yearly: 0, monthly: 0, vat: 0 };
        updateUI();
        return;
    }

    state.results.grade = grade || condition.grade;
    state.results.coef = 1;  // 기계사업부는 조정계수 미사용

    // Auto-update grade badge
    updateGradeBadge(area, state.purpose, state.세대수);

    // Workers - 기계사업부는 설비 수량 계산으로 대체
    state.results.inspectionWorkers = 0;
    state.results.maintenanceWorkers = 0;

    // CUSTOMIZE(변경 2): costs 계산 — condOverride에 appointmentFrequency 주입
    const baseCosts = DIVISION_CONFIG.calculateCosts(
        condition,
        getAdjFactor(),
        state.itemToggles,
        state.includeVAT,
        {
            ...state.condOverride,
            appointmentFrequency: state.condOverride.appointmentFrequency
                ?? (parseInt(state.appointmentFrequency) || 12)
        },
        state.equipmentQty   // ← 기계사업부 전용
    );
    state.results.costs.inspection = baseCosts.inspection;
    state.results.costs.maintenance = baseCosts.maintenance;
    state.results.costs.appointment = baseCosts.appointment;
    state.results.personnel = baseCosts.personnel || { senior: 0, high: 0, mid: 0 };
    state.results.inspBreakdown = baseCosts.inspBreakdown || null;
    state.results.maintBreakdown = baseCosts.maintBreakdown || null;
    state.results.checkQty = baseCosts.checkQty || {};
    state.results.personnelBreakdown = baseCosts.personnelBreakdown || [];
    state.results.rawPersonnel = baseCosts.rawPersonnel || { sRaw: 0, hRaw: 0, mRaw: 0 };

    // Total (기계사업부: mult/discount 미적용, 비용은 calculateCosts에서 확정)
    const baseSubtotal = baseCosts.inspection + baseCosts.maintenance + baseCosts.appointment;
    const vatAmount = state.includeVAT ? Math.round(baseSubtotal * 0.1) : 0;
    state.results.costs.vat = vatAmount;
    state.results.costs.yearly = baseSubtotal + vatAmount;
    state.results.costs.monthly = Math.floor(state.results.costs.yearly / 12);

    // 조건표 패널 업데이트
    updateConditionPanel(condition);

    updateUI();
}

// ---- Condition Panel ----
function getEffectiveCond(condition) {
    const isApp = state.itemToggles.appointment;
    const isMaint = state.itemToggles.maintenance;
    const isInsp = state.itemToggles.inspection;

    return {
        monthlyAppointment: isApp ? (state.condOverride.monthlyAppointment ?? (condition.monthlyAppointment || 0)) : 0,
        yearlyAppointment: isApp ? (state.condOverride.yearlyAppointment ?? (condition.yearlyAppointment || 0)) : 0,
        yearlyMaintenance: isMaint ? (state.condOverride.yearlyMaintenance ?? (condition.yearlyMaintenance || 0)) : 0,
        yearlyInspection: isInsp ? (state.condOverride.yearlyInspection ?? (condition.yearlyInspection || 0)) : 0,
        inspectionWorkers: isInsp ? (state.condOverride.inspectionWorkers ?? (condition.inspectionWorkers || 0)) : 0,
        maintenanceWorkers: isMaint ? (state.condOverride.maintenanceWorkers ?? (condition.maintenanceWorkers || 0)) : 0,
    };
}

function updateConditionPanel(condition) {
    const panel = document.getElementById('card-condition');
    if (!panel) return;

    // 연면적 구간이 달라진 경우 override 리셋
    if (state._lastConditionArea !== condition.area) {
        state.condOverride = {};
        state._lastConditionArea = condition.area;
    }
    const eff = getEffectiveCond(condition);

    // 패널 표시
    panel.style.display = 'block';
    document.getElementById('cond-grade').textContent = condition.grade;
    document.getElementById('cond-range-label').textContent = COND_RANGE_LABELS[condition.area] || '';

    // 배수·할인율 적용된 최종 조정 금액을 input에 표시
    const adjFactor = getAdjFactor();

    const inputs = [
        { id: 'cond-monthly-appointment', val: fmt(Math.round(eff.monthlyAppointment * adjFactor)) },
        { id: 'cond-yearly-appointment', val: fmt(Math.round(eff.yearlyAppointment * adjFactor)) },
        { id: 'cond-yearly-maintenance', val: fmt(Math.round(eff.yearlyMaintenance * adjFactor)) },
        { id: 'cond-yearly-inspection', val: fmt(Math.round(eff.yearlyInspection * adjFactor)) },
        { id: 'cond-inspection-workers', val: eff.inspectionWorkers },   // 인원수는 adjFactor 미적용
        { id: 'cond-maintenance-workers', val: eff.maintenanceWorkers },  // 인원수는 adjFactor 미적용
        { id: 'cond-personnel-discount', val: state.condOverride.personnelDiscount ?? 0 },
    ];

    inputs.forEach(item => {
        const el = document.getElementById(item.id);
        // 포커스 중인 엘리먼트는 값을 덮어쓰지 않음 (커서 튐 및 jitter 방지)
        if (el && document.activeElement !== el) {
            el.value = item.val;
        }
    });

    // CUSTOMIZE(변경 5): 항목 frequency 동적 처리
    // DIVISION_CONFIG.items 순회하여 각 항목의 frequency input 동기화
    DIVISION_CONFIG.items.forEach(item => {
        const freqEl = document.getElementById('cond-' + item.id + '-frequency');
        if (freqEl && document.activeElement !== freqEl) {
            freqEl.value = state[item.id + 'Frequency'] || item.defaultFrequency;
        }
    });

    // 항목 토글 시각적 동기화 (기계사업부 추가)
    const toggleItems = ['inspection', 'maintenance', 'appointment'];
    toggleItems.forEach(item => {
        const rows = document.querySelectorAll(`.cond-row[data-row-item="${item}"]`);
        const btn = document.querySelector(`.btn-toggle-item[data-item="${item}"]`);
        const isActive = state.itemToggles[item];

        rows.forEach(row => {
            if (isActive) row.classList.remove('excluded-item');
            else row.classList.add('excluded-item');
        });

        if (btn) {
            const icon = btn.querySelector('i');
            if (isActive) {
                btn.classList.remove('excluded');
                if (icon) icon.className = 'fas fa-minus-circle';
            } else {
                btn.classList.add('excluded');
                if (icon) icon.className = 'fas fa-plus-circle';
            }
        }
    });

    document.getElementById('cond-discount-display').textContent = state.discount + '%';

    // 기계사업부: 합계는 calculate()에서 확정된 state.results.costs 사용
    const yearlyTotal = state.results.costs.yearly || 0;
    const monthlyTotal = Math.floor(yearlyTotal / 12);
    document.getElementById('cond-yearly-total').textContent = fmt(yearlyTotal) + '원' + (state.includeVAT ? ' (부가세 포함)' : '');
    document.getElementById('cond-monthly-total').textContent = fmt(monthlyTotal) + '원';

    // 견적 조정 배수 UI 동기화
    const multDisplay = document.getElementById('multiplier-value');
    if (multDisplay) multDisplay.textContent = state.multiplier.toFixed(1) + '배';
    const multControls = document.getElementById('multiplier-controls');
    if (multControls) multControls.style.display = state.useMultiplier ? 'flex' : 'none';
    const hint = document.getElementById('multiplier-hint');
    if (hint) {
        const showHint = !state.itemToggles.appointment &&
            (state.itemToggles.inspection || state.itemToggles.maintenance) &&
            !state.useMultiplier;
        hint.style.display = showHint ? 'inline' : 'none';
    }

    // 수정된 필드 하이라이트
    ['monthly-appointment', 'yearly-appointment', 'yearly-maintenance', 'yearly-inspection', 'inspection-workers', 'maintenance-workers', 'personnel-discount'].forEach(key => {
        const el = document.getElementById('cond-' + key);
        if (!el) return;
        const stateKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (state.condOverride[stateKey] !== undefined) {
            el.style.background = '#fef3c7';
            el.style.borderColor = '#f59e0b';
        } else {
            el.style.background = '';
            el.style.borderColor = '#d1d5db';
        }
    });

    // Toggle 아이콘 및 행 상태 업데이트
    document.querySelectorAll('.btn-toggle-item').forEach(btn => {
        const item = btn.dataset.item;
        const isActive = state.itemToggles[item];
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = isActive ? 'fas fa-minus-circle' : 'fas fa-plus-circle';
        }
    });

    document.querySelectorAll('.cond-row[data-row-item]').forEach(row => {
        const item = row.dataset.rowItem;
        if (state.itemToggles[item]) {
            row.classList.remove('item-disabled');
        } else {
            row.classList.add('item-disabled');
        }
    });
}

// ---- UI Rendering ----
function updateUI() {
    const hasArea = state.floorArea > 0;
    const hasValidCondition = !!lookupCondition(state.floorArea);

    document.getElementById('card-summary').style.display = (hasArea && currentStep >= 2) ? 'block' : 'none';
    document.getElementById('card-detail').style.display = hasArea ? 'block' : 'none';
    if (!hasArea) document.getElementById('card-condition').style.display = 'none';

    const bottomActions = document.getElementById('card-bottom-actions');
    if (bottomActions && window.currentStep === 3) {
        bottomActions.style.display = hasArea ? 'flex' : 'none';
    }

    if (!hasArea) return;

    document.getElementById('res-grade').textContent = state.results.grade;
    const coefEl = document.getElementById('res-coef');
    if (coefEl) coefEl.textContent = hasValidCondition ? state.results.coef.toFixed(2) : '-';
    const workersEl = document.getElementById('res-workers');
    if (workersEl) workersEl.textContent = hasValidCondition ? state.results.inspectionWorkers + " 명" : '-';
    const maintWorkersEl = document.getElementById('res-maint-workers');
    if (maintWorkersEl) maintWorkersEl.textContent = hasValidCondition ? state.results.maintenanceWorkers + " 명" : '-';
    // 기계사업부: 3등급 투입인원
    const p = state.results.personnel || { senior: 0, high: 0, mid: 0 };
    const seniorEl = document.getElementById('res-senior');
    if (seniorEl) seniorEl.textContent = hasValidCondition ? p.senior + ' 명' : '-';
    const highEl = document.getElementById('res-high');
    if (highEl) highEl.textContent = hasValidCondition ? p.high + ' 명' : '-';
    const midEl = document.getElementById('res-mid');
    if (midEl) midEl.textContent = hasValidCondition ? p.mid + ' 명' : '-';
    document.getElementById('res-yearly').textContent = "₩ " + state.results.costs.yearly.toLocaleString();
    document.getElementById('res-monthly').textContent = "₩ " + state.results.costs.monthly.toLocaleString();

    // 항목별 수량/금액
    const _costs = state.results.costs;
    const _tog = state.itemToggles;
    const _setItem = (freqId, costId, enabled, freq, cost) => {
        const fEl = document.getElementById(freqId);
        const cEl = document.getElementById(costId);
        if (fEl) {
            fEl.textContent = enabled ? (freq || '-') : '제외';
            if (enabled) {
                fEl.classList.add('active');
                fEl.classList.remove('excluded');
            } else {
                fEl.classList.add('excluded');
                fEl.classList.remove('active');
            }
        }
        if (cEl) {
            cEl.textContent = enabled ? ('₩ ' + cost.toLocaleString()) : '-';
            cEl.style.color = enabled ? '#111827' : '#9ca3af';
        }
    };
    _setItem('res-insp-freq', 'res-insp-cost', _tog.inspection, state.inspectionFrequency, _costs.inspection);
    _setItem('res-maint-freq', 'res-maint-cost', _tog.maintenance, state.maintenanceFrequency, _costs.maintenance);
    _setItem('res-app-freq', 'res-app-cost', _tog.appointment, state.appointmentFrequency, _costs.appointment);

    // 부가세 배지
    const vatBadge = document.getElementById('res-vat-badge');
    if (vatBadge) {
        vatBadge.textContent = state.includeVAT ? '부가세 포함' : '부가세 별도';
        vatBadge.style.background = '#fff';
        vatBadge.style.color = state.includeVAT ? 'var(--toss-blue)' : '#6b7280';
    }

    renderTabs();
}

function renderTabs() {
    const subtotal = state.results.costs.inspection + state.results.costs.maintenance + state.results.costs.appointment;

    const adjFactor = getAdjFactor();
    const adjInspection = state.itemToggles.inspection ? Math.round(state.results.costs.inspection * adjFactor) : 0;
    const adjMaintenance = state.itemToggles.maintenance ? Math.round(state.results.costs.maintenance * adjFactor) : 0;
    const adjAppointment = state.itemToggles.appointment ? Math.round(state.results.costs.appointment * adjFactor) : 0;

    const discountRow = state.discount > 0
        ? `<tr style="color:#ef4444"><td>할인율 (${state.discount}%)</td><td>- ₩ ${Math.round(subtotal * (state.discount / 100)).toLocaleString()}</td><td>견적 할인</td></tr>`
        : '';

    // CUSTOMIZE(변경 4): 항목명 하드코딩을 DIVISION_CONFIG.items[].label 로 교체
    const inspItem = DIVISION_CONFIG.items.find(i => i.id === 'inspection') || { label: '성능점검' };
    const maintItem = DIVISION_CONFIG.items.find(i => i.id === 'maintenance') || { label: '유지점검' };
    const appItem = DIVISION_CONFIG.items.find(i => i.id === 'appointment') || { label: '위탁선임' };

    document.getElementById('tbl-q-total').innerHTML = `
        <tr><td>대상물 (고객명)</td><td>${state.customerName || '-'}</td><td></td></tr>
        <tr><td>연면적</td><td>${state.floorArea.toLocaleString()} ㎡</td><td>등급: <span style="font-weight:600; color:var(--toss-blue);">${state.results.grade}</span></td></tr>
        <tr><td>담당자 정보</td><td>${state.manager || '-'} ${state.managerPosition ? '(' + state.managerPosition + ')' : ''}</td><td>${state.managerPhone || '-'} ${state.managerMobile ? ' / ' + state.managerMobile : ''}</td></tr>
        <tr><td>${inspItem.label}</td><td>₩ ${adjInspection.toLocaleString()}</td><td>${state.inspectionFrequency}</td></tr>
        <tr><td>${maintItem.label}</td><td>₩ ${adjMaintenance.toLocaleString()}</td><td>${state.maintenanceFrequency}</td></tr>
        <tr><td>${appItem.label}</td><td>₩ ${adjAppointment.toLocaleString()}</td><td>${state.appointmentFrequency}</td></tr>
        ${discountRow}
        ${state.results.costs.vat > 0 ? `<tr style="color:#059669"><td>부가세 (10%)</td><td>+ ₩ ${state.results.costs.vat.toLocaleString()}</td><td>합계의 10%</td></tr>` : ''}
        <tr style="font-weight:700; color:var(--toss-blue)"><td>최종 합계 (연간)</td><td>₩ ${state.results.costs.yearly.toLocaleString()}</td><td>${state.includeVAT ? '부가세 포함' : '부가세 별도'}</td></tr>
        <tr style="font-weight:600"><td>월 납부액</td><td>₩ ${state.results.costs.monthly.toLocaleString()}</td><td>÷12</td></tr>
    `;

    // Tab 2: 성능점검 — 기계사업부 3등급 breakdown 사용
    const inspB = state.results.inspBreakdown || calcLaborBreakdown(state.results.inspectionWorkers, state.results.grade);
    document.getElementById('tbl-q-inspection').innerHTML =
        inspB.rows.filter(r => r.workers > 0).map(r => `
        <tr style="font-weight:600; color:var(--toss-text-main);">
            <td>${r.grade} 기계기술자</td>
            <td>${r.workers}명 × ₩ ${Number(r.wage).toLocaleString()}</td>
            <td>₩ ${Number(r.amount).toLocaleString()}</td>
        </tr>`).join('') + `
        <tr style="border-top:1px solid var(--toss-border); font-weight:700;">
            <td>직접인건비 소계</td><td></td><td>₩ ${inspB.labor.toLocaleString()}</td>
        </tr>
        <tr><td>직접경비</td><td>인건비 × 10%</td><td>₩ ${inspB.expense.toLocaleString()}</td></tr>
        <tr><td>제경비</td><td>인건비 × 110%</td><td>₩ ${inspB.general.toLocaleString()}</td></tr>
        <tr><td>기술료</td><td>(인건비 + 제경비) × 20%</td><td>₩ ${inspB.tech.toLocaleString()}</td></tr>
        <tr style="font-weight:700; color:var(--toss-blue)">
            <td>산출 합계</td><td></td><td>₩ ${inspB.total.toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700; border-top:1px solid var(--toss-border); color:var(--toss-text-main);">
            <td>최종 합계 (ROUNDDOWN 적용)</td><td></td><td>₩ ${adjInspection.toLocaleString()}</td>
        </tr>`;

    // Tab 3: 유지점검 — 특급 없음
    const maintB = state.results.maintBreakdown || calcLaborBreakdown(state.results.maintenanceWorkers, state.results.grade);
    document.getElementById('tbl-q-maintenance').innerHTML =
        maintB.rows.filter(r => r.workers > 0).map(r => `
        <tr style="font-weight:600; color:var(--toss-text-main);">
            <td>${r.grade} 기계기술자</td>
            <td>${r.workers}명 × ₩ ${Number(r.wage).toLocaleString()}</td>
            <td>₩ ${Number(r.amount).toLocaleString()}</td>
        </tr>`).join('') + `
        <tr style="border-top:1px solid var(--toss-border); font-weight:700;">
            <td>직접인건비 소계</td><td></td><td>₩ ${maintB.labor.toLocaleString()}</td>
        </tr>
        <tr><td>직접경비</td><td>인건비 × 10%</td><td>₩ ${maintB.expense.toLocaleString()}</td></tr>
        <tr><td>제경비</td><td>인건비 × 110%</td><td>₩ ${maintB.general.toLocaleString()}</td></tr>
        <tr><td>기술료</td><td>(인건비 + 제경비) × 20%</td><td>₩ ${maintB.tech.toLocaleString()}</td></tr>
        <tr style="font-weight:700; color:var(--toss-blue)">
            <td>산출 합계</td><td></td><td>₩ ${maintB.total.toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700; border-top:1px solid var(--toss-border); color:var(--toss-text-main);">
            <td>최종 합계 (ROUNDDOWN 적용)</td><td></td><td>₩ ${adjMaintenance.toLocaleString()}</td>
        </tr>`;

    // Tab 4: Appointment
    document.getElementById('tbl-q-appointment').innerHTML = `
        <tr><td>선임 등급</td><td>${state.results.grade} 1명</td><td>연면적 기준</td></tr>
        <tr><td>월 단가</td><td>₩ ${Math.round(adjAppointment / 12).toLocaleString()}</td><td>× 12개월</td></tr>
        <tr style="font-weight:700; color:var(--toss-text-main);"><td>연간 선임 합계</td><td></td><td>₩ ${adjAppointment.toLocaleString()}</td></tr>
    `;

    // 데이터 기준 토글 패널 (tab2, tab3 공통)
    ['tab2', 'tab3'].forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (!tab) return;

        const old = tab.querySelector('.data-ref-toggle-wrap');
        if (old) old.remove();

        const condition = lookupCondition(state.floorArea);
        const coefObj = lookupCoef(state.floorArea);
        if (!condition || !coefObj) return;

        const eff = getEffectiveCond(condition);

        const wrap = document.createElement('div');
        wrap.className = 'data-ref-toggle-wrap';
        wrap.style.cssText = 'margin-top:0.75rem;';

        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fas fa-database"></i> 데이터 기준 보기';
        btn.style.cssText = [
            'background:var(--toss-input-bg)', 'border:none', 'border-radius:100px',
            'padding:0.5rem 1rem', 'cursor:pointer', 'font-size:0.85rem', 'font-weight:600',
            'color:var(--toss-text-sub)', 'display:flex', 'align-items:center', 'gap:0.4rem',
            'transition: background 0.2s', 'width: fit-content'
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
            'display:none', 'margin-top:0.6rem', 'background:#f8fafc',
            'border:1px solid #e5e7eb', 'border-radius:8px', 'padding:0.9rem 1rem',
            'font-size:0.82rem', 'color:#374151'
        ].join(';');

        panel.innerHTML = (() => {
            const wageHtml = GRADE_ORDER.map(g => {
                const a = g === condition.grade;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--toss-border);gap:0.5rem;">
                    <span style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;flex-shrink:0;">${a ? '<span style="background:var(--toss-blue);color:white;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:6px;">적용</span>' : ''}</span>
                        <span style="font-size:0.85rem;font-weight:${a ? '700' : '500'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-main)'};white-space:nowrap;">${g} 기술자</span>
                    </span>
                    <span style="font-size:0.85rem;font-weight:${a ? '700' : '600'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-sub)'};font-variant-numeric:tabular-nums;white-space:nowrap;">₩ ${GRADE_WAGES[g].toLocaleString()}</span>
                </div>`;
            }).join('');

            const coefHtml = ADJUSTMENT_COEFFICIENTS.map(c => {
                const a = c.area === coefObj.area;
                const label = (COND_RANGE_LABELS[c.area] || '')
                    .replace(' ≤ 연면적', '').replace(/ ㎡/g, '').replace('< ', '<');
                return `<div style="background:${a ? 'var(--toss-blue)' : 'var(--toss-input-bg)'};color:${a ? 'white' : 'var(--toss-text-main)'};border-radius:var(--radius-sm);padding:0.5rem 0.75rem;text-align:center;white-space:nowrap;border:1px solid ${a ? 'var(--toss-blue)' : 'var(--toss-border)'}; flex: 1 1 calc(25% - 0.5rem); min-width: 80px;">
                    <div style="font-size:0.7rem;opacity:${a ? .9 : .6};margin-bottom:2px;">${label || c.area.toLocaleString() + '㎡~'}</div>
                    <div style="font-size:0.95rem;font-weight:700;">${c.coef.toFixed(2)}</div>
                </div>`;
            }).join('');

            // CUSTOMIZE(변경 4): 항목명을 DIVISION_CONFIG.items[].label 로 교체
            const COND_ROWS = [
                { label: '등급', fn: c => `<span style="font-weight:700;color:${GRADE_STYLES[c.grade]?.color || 'var(--toss-text-main)'}">${c.grade}</span>` },
                { label: `${inspItem.label} (연)`, fn: c => '₩ ' + fmt(c.yearlyInspection) },
                { label: `${inspItem.label} 인력`, fn: c => c.inspectionWorkers + '명' },
                { label: `${maintItem.label} (연)`, fn: c => '₩ ' + fmt(c.yearlyMaintenance) },
                { label: `${maintItem.label} 인력`, fn: c => c.maintenanceWorkers + '명' },
                { label: `${appItem.label} (월)`, fn: c => '₩ ' + fmt(c.monthlyAppointment) },
                { label: `${appItem.label} (연)`, fn: c => '₩ ' + fmt(c.yearlyAppointment) },
            ];

            const thCells = QUOTATION_CONDITIONS.map(c => {
                const a = c.area === condition.area;
                return `<th style="padding:0.5rem 0.75rem;font-size:0.75rem;font-weight:${a ? '700' : '600'};background:${a ? 'var(--toss-blue)' : 'var(--toss-input-bg)'};color:${a ? 'white' : 'var(--toss-text-sub)'};border-bottom:2px solid ${a ? 'var(--toss-blue)' : 'var(--toss-border)'};text-align:center;white-space:nowrap;">
                    ${(COND_RANGE_LABELS[c.area] || '').replace(' ≤ 연면적 <', '<br><').replace(/㎡/g, '㎡')}
                    ${a ? '<div style="font-size:0.65rem;opacity:.9;margin-top:4px;background:rgba(255,255,255,0.2);padding:2px 4px;border-radius:4px;">현재 적용 구간</div>' : ''}
                </th>`;
            }).join('');

            const bodyRows = COND_ROWS.map(row => {
                const tds = QUOTATION_CONDITIONS.map(c => {
                    const a = c.area === condition.area;
                    return `<td style="padding:0.5rem 0.75rem;font-size:0.85rem;text-align:center;border-bottom:1px solid var(--toss-border);background:${a ? 'var(--toss-blue-bg)' : 'transparent'};font-weight:${a ? '700' : '500'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-main)'};white-space:nowrap;">${row.fn(c)}</td>`;
                }).join('');
                return `<tr>
                    <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--toss-text-sub);background:var(--toss-input-bg);border-bottom:1px solid var(--toss-border);border-right:1px solid var(--toss-border);white-space:nowrap;font-weight:600;">${row.label}</td>
                    ${tds}
                </tr>`;
            }).join('');

            return `
            <div style="display:grid;grid-template-columns:1fr;gap:1rem;margin-bottom:1rem;">
                <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;box-shadow:var(--shadow-sm);">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-coins" style="color:var(--toss-blue);"></i> 등급별 노임단가 (원/인·일)
                    </div>
                    ${wageHtml}
                </div>
                <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;box-shadow:var(--shadow-sm);">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-chart-line" style="color:var(--toss-blue);"></i> 연면적 조정계수
                    </div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">${coefHtml}</div>
                </div>
            </div>
            <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;overflow-x:auto;box-shadow:var(--shadow-sm);">
                <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                    <i class="fas fa-table" style="color:var(--toss-blue);"></i> 견적 조건표 (전체 구간)
                </div>
                <table style="width:100%;border-collapse:collapse;min-width:700px;">
                    <thead><tr>
                        <th style="padding:0.5rem 0.75rem;font-size:0.8rem;font-weight:700;background:var(--toss-input-bg);color:var(--toss-text-main);border-bottom:2px solid var(--toss-border);border-right:1px solid var(--toss-border);text-align:left;white-space:nowrap;">항목</th>
                        ${thCells}
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>`;
        })();

        btn.addEventListener('click', () => {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            btn.innerHTML = open
                ? '<i class="fas fa-database"></i> 데이터 기준 보기'
                : '<i class="fas fa-chevron-up"></i> 데이터 기준 접기';
        });

        wrap.appendChild(btn);
        wrap.appendChild(panel);
        tab.appendChild(wrap);
    });
}


// ---- Building Register API ----
let _lastBuildingResult = null;

async function fetchBuildingInfo() {
    const statusEl = document.getElementById('building-fetch-status');
    const panelEl = document.getElementById('building-result-panel');
    const contentEl = document.getElementById('building-result-content');
    const btn = document.getElementById('btn-fetch-building');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    statusEl.style.display = 'block';
    statusEl.style.background = '#f0f9ff';
    statusEl.style.color = '#0369a1';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 주소 변환 및 건축물대장 API 호출 중...';
    panelEl.style.display = 'none';

    try {
        const addrInfo = await window.wkCommon.getAddressInfo(state.address);
        const target = await window.wkCommon.fetchBuildingRegister(addrInfo);

        const sumMainArea = parseFloat(target.totArea || 0);
        const hhldCnt = target.hhldCnt || 0;
        const purposeText = target.mainPurpsCdNm || '';
        const result = {
            '연면적': sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '부속건축물면적': '0.00',
            '총연면적': sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '주용도': purposeText || '-',
            '세대수': hhldCnt > 0 ? hhldCnt.toLocaleString() + ' 세대' : '-',
            '주용도_분포': purposeText || '-',
            '대지면적': target.platArea || '-',
            '건축면적': target.archArea || '-',
            '사용승인일': target.useAprDay || '-',
            '건축물명': target.bldNm || '-',
            '_rawMainArea': sumMainArea,
            '_rawPurpose': purposeText,
            '_hhldCnt': hhldCnt,
        };
        _lastBuildingResult = result;

        // 창고시설 여부
        const isWarehouse = purposeText.includes('창고');

        // 예상 등급 계산
        const previewGrade = calcFloorGrade(sumMainArea, purposeText, hhldCnt);
        const isApt = purposeText.includes('공동주택') || purposeText.includes('아파트');
        const isUnderThreshold = isApt && hhldCnt > 0 && hhldCnt < 300;
        const gradeBasis = isApt && hhldCnt > 0
            ? `세대수 기준 / ${hhldCnt.toLocaleString()}세대`
            : `연면적 기준 / ${sumMainArea.toLocaleString(undefined, { maximumFractionDigits: 0 })}㎡`;
        const gradeStyle = (GRADE_STYLES && previewGrade && GRADE_STYLES[previewGrade])
            ? GRADE_STYLES[previewGrade]
            : { color: '#6b7280' };

        const displayKeys = ['총연면적', '연면적', '부속건축물면적', '주용도', '세대수', '대지면적', '건축면적', '사용승인일', '건축물명'];
        contentEl.innerHTML = (isWarehouse ? `
            <div style="grid-column:1/-1; background:#fef2f2; border:2px solid #fca5a5; border-radius:8px;
                        padding:0.75rem 1rem; display:flex; align-items:center; gap:0.5rem;">
                <i class="fas fa-ban" style="color:#dc2626; font-size:1.1rem; flex-shrink:0;"></i>
                <div>
                    <div style="font-weight:700; color:#b91c1c; font-size:0.95rem;">창고시설 — 견적 작성 불가</div>
                    <div style="font-size:0.8rem; color:#991b1b; margin-top:2px;">창고시설은 기계사업부 견적 작성 대상이 아닙니다.</div>
                </div>
            </div>
        ` : '') + displayKeys.map(k => `
            <div style="background:white; border:1px solid var(--border-color); border-radius:6px; padding:0.6rem 0.8rem;">
                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">${k}</div>
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary)">${result[k] || '-'}</div>
            </div>
        `).join('') + (!isWarehouse ? (previewGrade ? `
            <div style="background:#f0f9ff; border:1px solid ${gradeStyle.color}40; border-radius:6px;
                        padding:0.6rem 0.8rem; grid-column:1/-1;">
                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px;">예상 등급 (조회 기준)</div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-weight:800; font-size:1.05rem; color:${gradeStyle.color};">${previewGrade}</span>
                    <span style="font-size:0.8rem; color:#6b7280;">${gradeBasis}</span>
                </div>
            </div>
        ` : isUnderThreshold ? `
            <div style="background:#fefce8; border:1px solid #fde047; border-radius:6px;
                        padding:0.6rem 0.8rem; grid-column:1/-1;">
                <div style="font-size:0.7rem; color:#a16207; margin-bottom:4px;">예상 등급 (조회 기준)</div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-weight:800; font-size:1.05rem; color:#92400e;">해당 없음</span>
                    <span style="font-size:0.8rem; color:#78350f;">300세대 미만 — 위탁선임 대상 아님</span>
                </div>
            </div>
        ` : '') : '') + `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:0.6rem 0.8rem; grid-column:1/-1;">
                <div style="font-size:0.7rem; color:#3b82f6; margin-bottom:2px;">주용도 분포 (주건축물 기준)</div>
                <div style="font-weight:600; font-size:0.85rem; color:#1d4ed8">${result['주용도_분포'] || '-'}</div>
            </div>
        `;

        // 창고시설이면 "데이터 적용" 버튼 비활성
        const applyBtn = document.getElementById('btn-apply-building');
        if (applyBtn) {
            applyBtn.disabled = isWarehouse;
            applyBtn.style.opacity = isWarehouse ? '0.4' : '';
            applyBtn.style.cursor = isWarehouse ? 'not-allowed' : '';
        }

        panelEl.style.display = 'block';
        statusEl.style.background = isWarehouse ? '#fef2f2' : '#f0fdf4';
        statusEl.style.color = isWarehouse ? '#b91c1c' : '#15803d';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = isWarehouse
            ? '창고시설은 견적 작성 대상이 아닙니다.'
            : '<span class="status-msg-pc">건축물대장 조회 성공! "이 값으로 적용" 버튼으로 값을 입력하세요.</span>' +
            '<span class="status-msg-mobile">건축물대장 조회 성공!<br>"이 값으로 적용" 버튼으로<br>값을 입력하세요.</span>';
    } catch (err) {
        statusEl.style.background = '#fef2f2';
        statusEl.style.color = '#b91c1c';
        statusEl.innerHTML = `오류: ${err.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> 건축물대장 조회';
    }
}

// ---- 기계사업부: 설비 수량 및 세대수 이벤트 ----
const equipmentInputsEl = document.getElementById('equipment-inputs');
if (equipmentInputsEl) {
    // 직접 입력
    equipmentInputsEl.addEventListener('input', e => {
        const key = e.target.dataset.equipment;
        if (key) {
            state.equipmentQty[key] = Number(e.target.value) || 0;
            calculate();
        }
    });
    // −/+ 버튼 클릭
    equipmentInputsEl.addEventListener('click', e => {
        const minusKey = e.target.dataset.eqMinus;
        const plusKey = e.target.dataset.eqPlus;
        const key = minusKey || plusKey;
        if (!key) return;
        const input = equipmentInputsEl.querySelector(`input[data-equipment="${CSS.escape(key)}"]`);
        if (!input) return;
        let val = Number(input.value) || 0;
        if (minusKey) val = Math.max(0, val - 1);
        if (plusKey) val = val + 1;
        input.value = val;
        state.equipmentQty[key] = val;
        calculate();
    });
}

const householdCountEl = document.getElementById('household-count');
if (householdCountEl) {
    householdCountEl.addEventListener('input', e => {
        state.세대수 = Number(e.target.value) || 0;
        updateGradeBadge(state.floorArea, state.purpose, state.세대수);
        calculate();
    });
}

// ---- Kakao Address Search ----
function initKakaoSearch() {
    window.wkCommon.initKakaoPostcode('kakao-embed-container', (roadAddr, buildingName, data) => {
        document.getElementById('address').value = roadAddr;
        if (buildingName) document.getElementById('customer-name').value = buildingName;

        state.address = roadAddr;
        state.buildingName = buildingName || state.customerName || '';
        state.customerName = buildingName || state.customerName || '';
        if (data) {
            state.roadAddress = data.roadAddress || roadAddr;
            state.jibunAddress = data.jibunAddress || data.autoJibunAddress || '';
            state.zonecode = data.zonecode || '';
        }

        goToStep(2);
        calculate();
        setTimeout(() => document.getElementById('btn-fetch-building').click(), 500);
    });
}


document.getElementById('customer-name').addEventListener('input', (e) => {
    state.customerName = e.target.value;
    if (!state.buildingName) state.buildingName = e.target.value;
    calculate();
});

document.getElementById('floor-area').addEventListener('input', (e) => {
    state.floorArea = parseFloat(e.target.value) || 0;
    updateGradeBadge(state.floorArea, state.purpose, state.세대수);
    calculate();
});

document.getElementById('btn-restore-cond').addEventListener('click', () => {
    state.condOverride = {};
    state._lastConditionArea = -1;
    calculate();
});

document.getElementById('btn-fetch-building').addEventListener('click', fetchBuildingInfo);

document.getElementById('btn-apply-building').addEventListener('click', () => {
    if (!_lastBuildingResult) return;
    // 창고시설 적용 차단
    if ((_lastBuildingResult['_rawPurpose'] || '').includes('창고')) return;
    const rawArea = _lastBuildingResult['_rawMainArea'];
    const purpose = _lastBuildingResult['_rawPurpose'];
    const bldName = _lastBuildingResult['건축물명'];

    if (rawArea) {
        document.getElementById('floor-area').value = rawArea.toFixed(2);
        state.floorArea = rawArea;
    }
    const aprDay = _lastBuildingResult['사용승인일'];
    if (aprDay && aprDay !== '-') {
        const fmt = aprDay.length === 8
            ? `${aprDay.slice(0, 4)}-${aprDay.slice(4, 6)}-${aprDay.slice(6, 8)}`
            : aprDay;
        document.getElementById('use-apr-day').value = fmt;
        state.useAprDay = fmt;
    }
    const topPurpose = _lastBuildingResult['주용도'];
    if (topPurpose && topPurpose !== '-') {
        document.getElementById('purpose').value = topPurpose;
        state.purpose = topPurpose;
    }
    // 세대수 (hhldCnt) 반영
    const hhldCnt = _lastBuildingResult['_hhldCnt'] || 0;
    if (hhldCnt > 0) {
        state.세대수 = hhldCnt;
        const hhldEl = document.getElementById('household-count');
        if (hhldEl) hhldEl.value = hhldCnt;
    }
    // 공동주택 여부에 따라 세대수 섹션 표시
    _toggleHouseholdSection(topPurpose || state.purpose);
    if (bldName && bldName !== '-' && !state.customerName) {
        document.getElementById('customer-name').value = bldName;
        state.customerName = bldName;
    }
    calculate();

    const btn = document.getElementById('btn-apply-building');
    btn.textContent = '적용 완료!';
    btn.style.background = '#059669';
    setTimeout(() => {
        btn.innerHTML = '이 값으로 적용';
        btn.style.background = '#10b981';
    }, 2000);
});


// 공동주택 여부에 따라 세대수 섹션 표시/숨김
function _toggleHouseholdSection(purpose) {
    const isApt = (purpose || '').includes('공동주택') || (purpose || '').includes('아파트');
    const hhldGroup = document.getElementById('household-group');
    if (hhldGroup) hhldGroup.style.display = isApt ? 'block' : 'none';
}

document.getElementById('purpose').addEventListener('input', (e) => {
    state.purpose = e.target.value;
    _toggleHouseholdSection(state.purpose);

    // 학교: 위탁선임 월 단가 65만원 자동 설정
    if (state.purpose.includes('학교')) {
        if (state.condOverride.monthlyAppointment == null) {
            state.condOverride.monthlyAppointment = 650000;
            state.condOverride.yearlyAppointment = 7800000;
        }
    } else {
        // 학교 preset(65만원)에서 다른 용도로 변경 시 자동 설정값 제거
        if (state.condOverride.monthlyAppointment === 650000) {
            delete state.condOverride.monthlyAppointment;
            delete state.condOverride.yearlyAppointment;
        }
    }

    calculate();
});

document.getElementById('use-apr-day').addEventListener('input', (e) => {
    state.useAprDay = e.target.value;
});

document.getElementById('manager').addEventListener('input', (e) => {
    state.manager = e.target.value;
});

// ---- 전화번호 자동 포맷팅 ----
function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    const len = digits.length;

    if (digits.startsWith('02')) {
        if (len < 3) return digits;
        if (len < 6) return digits.slice(0, 2) + '-' + digits.slice(2);
        if (len < 10) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
        return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);
    } else {
        if (len < 4) return digits;
        if (len < 7) return digits.slice(0, 3) + '-' + digits.slice(3);
        if (len < 11) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
        return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
    }
}

const managerPhoneEl = document.getElementById('manager-phone');
if (managerPhoneEl) {
    managerPhoneEl.addEventListener('input', function () {
        const pos = this.selectionStart;
        const before = this.value;
        const formatted = formatPhone(this.value);
        if (before !== formatted) {
            this.value = formatted;
            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.managerPhone = formatted;
    });
} else {
    console.error('[디버그] #manager-phone 요소를 찾을 수 없습니다.');
}

const managerMobileEl = document.getElementById('manager-mobile');
if (managerMobileEl) {
    managerMobileEl.addEventListener('input', function () {
        const pos = this.selectionStart;
        const before = this.value;
        const formatted = formatPhone(this.value);
        if (before !== formatted) {
            this.value = formatted;
            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.managerMobile = formatted;
    });
}

document.getElementById('manager-position').addEventListener('input', (e) => {
    state.managerPosition = e.target.value;
    calculate();
});

document.getElementById('manager-email').addEventListener('input', (e) => {
    state.managerEmail = e.target.value;
    calculate();
});

// 영업 담당자 변경 시 연락처 자동 입력
document.getElementById('sales-manager').addEventListener('change', (e) => {
    const val = e.target.value;
    const customInput = document.getElementById('sales-manager-custom');
    const phoneInput = document.getElementById('sales-manager-phone');

    if (val === '__custom__') {
        customInput.style.display = 'block';
        state.salesManager = '';
        state.salesManagerPhone = '';
        if (phoneInput) {
            phoneInput.value = '';
            phoneInput.removeAttribute('readonly');
            phoneInput.placeholder = '010-0000-0000';
        }
    } else {
        customInput.style.display = 'none';
        const manager = SALES_MANAGERS.find(m => m.name === val);
        state.salesManager = val;
        state.salesManagerPhone = manager ? manager.phone : '';
        if (phoneInput) {
            phoneInput.value = state.salesManagerPhone;
            phoneInput.setAttribute('readonly', true);
        }
    }
});

document.getElementById('sales-manager-custom').addEventListener('input', (e) => {
    state.salesManager = e.target.value;
});

document.getElementById('sales-manager-phone').addEventListener('input', (e) => {
    if (!e.target.hasAttribute('readonly')) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
        let formatted = digits;
        if (digits.length > 7) {
            formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
        } else if (digits.length > 3) {
            formatted = digits.slice(0, 3) + '-' + digits.slice(3);
        }
        e.target.value = formatted;
        state.salesManagerPhone = formatted;
    }
});

// 견적일 기본값: 오늘 날짜
const _todayStr = new Date().toISOString().slice(0, 10);
state.quotationDate = _todayStr;
document.getElementById('quotation-date').value = _todayStr;

document.getElementById('quotation-date').addEventListener('input', (e) => {
    state.quotationDate = e.target.value;
});

// 부가세 토글 버튼
document.querySelectorAll('.btn-vat[data-vat]').forEach(btn => {
    btn.addEventListener('click', () => {
        state.includeVAT = btn.dataset.vat === 'true';
        document.querySelectorAll('.btn-vat[data-vat]').forEach(b => b.classList.remove('active-vat'));
        btn.classList.add('active-vat');
        calculate();
    });
});

// 견적 조정 배수 토글 버튼
document.querySelectorAll('.btn-vat[data-multiplier]').forEach(btn => {
    btn.addEventListener('click', () => {
        const applying = btn.dataset.multiplier === 'true';
        state.useMultiplier = applying;
        if (applying) {
            if (!state.itemToggles.appointment &&
                (state.itemToggles.inspection || state.itemToggles.maintenance)) {
                state.multiplier = 1.1;
            } else {
                state.multiplier = 1.5;
            }
        }
        document.querySelectorAll('.btn-vat[data-multiplier]').forEach(b => b.classList.remove('active-vat'));
        btn.classList.add('active-vat');
        calculate();
    });
});

document.getElementById('btn-multiplier-plus').addEventListener('click', () => {
    state.multiplier = Math.round((state.multiplier + 0.1) * 10) / 10;
    calculate();
});
document.getElementById('btn-multiplier-minus').addEventListener('click', () => {
    state.multiplier = Math.max(1.0, Math.round((state.multiplier - 0.1) * 10) / 10);
    calculate();
});

// ---- Condition Table Inputs ----
const COND_INPUT_MAP = {
    'cond-monthly-appointment': 'monthlyAppointment',
    'cond-yearly-appointment': 'yearlyAppointment',
    'cond-yearly-maintenance': 'yearlyMaintenance',
    'cond-yearly-inspection': 'yearlyInspection',
    'cond-inspection-workers': 'inspectionWorkers',
    'cond-maintenance-workers': 'maintenanceWorkers',
    'cond-personnel-discount': 'personnelDiscount',  // % 값 그대로 저장, adjFactor 역산 없음
};
const COST_FIELDS = new Set(['cond-monthly-appointment', 'cond-yearly-appointment', 'cond-yearly-maintenance', 'cond-yearly-inspection']);

Object.entries(COND_INPUT_MAP).forEach(([elId, stateKey]) => {
    const el = document.getElementById(elId);
    if (!el) return;

    el.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/,/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
            const adjFactor = getAdjFactor();
            const baseVal = COST_FIELDS.has(elId) && adjFactor > 0
                ? Math.round(val / adjFactor) : val;

            state.condOverride[stateKey] = baseVal;

            if (elId === 'cond-monthly-appointment') {
                state.condOverride.yearlyAppointment = baseVal * 12;
            } else if (elId === 'cond-yearly-appointment') {
                state.condOverride.monthlyAppointment = baseVal / 12;
            }
        } else {
            delete state.condOverride[stateKey];
            if (elId === 'cond-monthly-appointment') delete state.condOverride.yearlyAppointment;
            if (elId === 'cond-yearly-appointment') delete state.condOverride.monthlyAppointment;
        }
        calculate();
    });

    if (COST_FIELDS.has(elId)) {
        el.addEventListener('focus', (e) => {
            const raw = e.target.value.replace(/,/g, '');
            e.target.value = raw;
        });
        el.addEventListener('blur', (e) => {
            const raw = parseFloat(e.target.value.replace(/,/g, ''));
            if (!isNaN(raw)) {
                e.target.value = Math.round(raw).toLocaleString('ko-KR');
            }
        });
    }
});

// CUSTOMIZE(변경 5): frequency input 이벤트를 DIVISION_CONFIG.items 기반 동적 처리
DIVISION_CONFIG.items.forEach(item => {
    const freqEl = document.getElementById('cond-' + item.id + '-frequency');
    if (!freqEl) return;
    freqEl.addEventListener('input', (e) => {
        state[item.id + 'Frequency'] = e.target.value;
        updateUI();
    });
});


// Reset: show address search again (Step 1)
document.getElementById('btn-reset-addr').addEventListener('click', () => {
    state.address = "";
    state.customerName = "";
    state.buildingName = "";
    state.floorArea = 0;
    state.purpose = "";
    state.useAprDay = "";
    state.managerPhone = "";
    state.salesManager = "";
    state.salesManagerPhone = "";
    state.quotationDate = "";
    state.condOverride = {};
    // CUSTOMIZE(변경 1): itemToggles와 frequency를 DIVISION_CONFIG.items 기반 초기화
    state.itemToggles = Object.fromEntries(
        DIVISION_CONFIG.items.map(item => [item.id, true])
    );
    DIVISION_CONFIG.items.forEach(item => {
        state[item.id + 'Frequency'] = item.defaultFrequency;
    });
    state.includeVAT = false;
    document.querySelectorAll('.btn-vat[data-vat]').forEach(b => b.classList.remove('active-vat'));
    const vatBtnDefault = document.querySelector('.btn-vat[data-vat="false"]');
    if (vatBtnDefault) vatBtnDefault.classList.add('active-vat');
    state.useMultiplier = false;
    state.multiplier = 1.5;
    document.querySelectorAll('.btn-vat[data-multiplier]').forEach(b => b.classList.remove('active-vat'));
    const multBtnDefault = document.querySelector('.btn-vat[data-multiplier="false"]');
    if (multBtnDefault) multBtnDefault.classList.add('active-vat');
    state._lastConditionArea = -1;
    _lastBuildingResult = null;

    document.getElementById('customer-name').value = "";
    document.getElementById('floor-area').value = "";
    document.getElementById('floor-grade').value = "";
    document.getElementById('use-apr-day').value = "";
    document.getElementById('purpose').value = "";
    document.getElementById('manager').value = "";
    document.getElementById('manager-phone').value = "";
    document.getElementById('sales-manager').value = "";
    const customInput = document.getElementById('sales-manager-custom');
    if (customInput) { customInput.value = ''; customInput.style.display = 'none'; }
    const quotationDateInput = document.getElementById('quotation-date');
    const _resetToday = new Date().toISOString().slice(0, 10);
    state.quotationDate = _resetToday;
    if (quotationDateInput) quotationDateInput.value = _resetToday;

    document.getElementById('building-result-panel').style.display = 'none';
    document.getElementById('building-fetch-status').style.display = 'none';
    document.getElementById('building-result-content').innerHTML = '';

    const container = document.getElementById('kakao-embed-container');
    if (container) {
        container.innerHTML = '';
        initKakaoSearch();
    }

    goToStep(1);
});

// Tab Switching
document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// PDF 서버 URL
const PDF_SERVER_URL = (window.location.port === '3000' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/generate-pdf'
    : '/generate-pdf';

// ---- Mapping Logic for Export ----
function formatKoreanDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일`;
}

// CUSTOMIZE(변경 3): generateMapping()은 DIVISION_CONFIG.generateExcelMapping()에 위임
function generateMapping() {
    const adjFactor = getAdjFactor();
    const costs = { ...state.results.costs, checkQty: state.results.checkQty };
    // 기계사업부: inspBreakdown/maintBreakdown은 state.results에서 직접 사용
    const inspB = state.results.inspBreakdown || calcLaborBreakdown(state.results.inspectionWorkers, state.results.grade);
    const maintB = state.results.maintBreakdown || calcLaborBreakdown(state.results.maintenanceWorkers, state.results.grade);
    const laborData = { inspB, maintB };
    const mapping = DIVISION_CONFIG.generateExcelMapping(state, costs, adjFactor, laborData);
    // outputSheets 프로퍼티 추가 (PDF 생성 시 시트 지정)
    mapping.outputSheets = DIVISION_CONFIG.outputSheets || Object.keys(mapping);
    return mapping;
}

// ---- 상태 표시 헬퍼 ----
function showStatusBar(msg, type) {
    const bar = document.getElementById('sheet-status-bar');
    if (!bar) return;
    const colors = {
        info: { bg: '#eff6ff', color: '#1d4ed8' },
        success: { bg: '#f0fdf4', color: '#15803d' },
        error: { bg: '#fef2f2', color: '#b91c1c' },
        warning: { bg: '#fffbeb', color: '#b45309' }
    };
    const c = colors[type] || colors.info;
    bar.style.background = c.bg;
    bar.style.color = c.color;
    bar.innerHTML = msg;
    bar.style.display = 'block';
}

function setPdfBtnEnabled(enabled) {
    const pdfBtn = document.getElementById('btn-save-pdf');
    if (!pdfBtn) return;
    pdfBtn.disabled = !enabled;
    pdfBtn.style.opacity = enabled ? '1' : '0.4';
    pdfBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
}

// PDF 저장 버튼
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
    const mapping = generateMapping();
    const btn = document.getElementById('btn-save-pdf');

    if (!state.floorArea || state.floorArea < 1) {
        showStatusBar('연면적을 먼저 입력해주세요.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    showStatusBar('<i class="fas fa-spinner fa-spin"></i> 에어테이블 저장 중...', 'info');

    let airOk = false;
    let quotationId = null;
    let quotationUniqueId = '';
    let airErrMsg = '';

    try {
        const airResult = await window.airtableService.saveQuotation(state);
        airOk = true;
        quotationId = airResult.quotationId;
        quotationUniqueId = airResult.quotationUniqueId || '';

        if (quotationId) {
            const recordUrl = `https://airtable.com/appFEZaTg3yZU1QwW/tbloif1mheDqaRRuR/${quotationId}`;
            const recentEl = document.getElementById('status-recent-record');
            if (recentEl) {
                recentEl.innerHTML = `<a href="${recordUrl}" target="_blank" style="color:var(--toss-blue); font-weight:600; text-decoration:none;">보기 <i class="fas fa-external-link-alt" style="font-size:0.75rem;"></i></a>`;
            }
        }
    } catch (err) {
        airErrMsg = err.message || '알 수 없는 오류';
        console.error('[Airtable]', err);
    }

    showStatusBar('<i class="fas fa-spinner fa-spin"></i> PDF 생성 중... (약 10초)', 'info');

    let pdfOk = false;
    let fileName = `${state.customerName || '견적서'}_견적서.pdf`;

    try {
        const pdfBody = { ...mapping };
        if (quotationId) {
            pdfBody.airtableInfo = {
                baseId: 'appFEZaTg3yZU1QwW',
                recordId: quotationId
            };
        }
        pdfBody.fileNameMeta = {
            quotationUniqueId: quotationUniqueId || '',
            customerName: state.customerName || '',
            salesManager: state.salesManager || '',
            managerName: state.manager || '',
            managerPosition: state.managerPosition || ''
        };
        pdfBody.templateName = DIVISION_CONFIG.excelTemplate;
        pdfBody.outputSheets = mapping.outputSheets;

        const pdfRes = await fetch(PDF_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pdfBody)
        });

        if (!pdfRes.ok) {
            const errData = await pdfRes.json().catch(() => ({ error: pdfRes.statusText }));
            throw new Error(errData.error || `PDF 서버 오류 (${pdfRes.status})`);
        }

        const blob = await pdfRes.blob();
        const disposition = pdfRes.headers.get('Content-Disposition') || '';
        const nameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
        fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : fileName;

        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (downloadErr) {
            console.warn('[PDF Download] 자동 다운로드 실패 (모바일):', downloadErr.message);
        }
        pdfOk = true;
    } catch (pdfErr) {
        console.error('[PDF]', pdfErr);
    }

    if (pdfOk && airOk) {
        showStatusBar(`<b>${fileName}</b> 다운로드 및 에어테이블 저장 성공!`, 'success');
    } else if (pdfOk && !airOk) {
        showStatusBar(`PDF 다운로드 완료 — 에어테이블 저장 실패: ${airErrMsg}`, 'warning');
    } else if (!pdfOk && airOk) {
        showStatusBar(`에어테이블 저장 성공 — PDF 생성 실패 (서버 확인 필요)`, 'warning');
    } else {
        showStatusBar(`에어테이블 저장 실패: ${airErrMsg}`, 'error');
    }

    btn.innerHTML = '<i class="fas fa-check-circle"></i> 견적서 발행 완료';
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> 견적서 PDF 생성 및 저장';
        btn.disabled = false;
    }, 3000);
});


const btnAirtable = document.getElementById('btn-save-airtable');
if (btnAirtable) {
    btnAirtable.style.display = 'none';
}
const btnJson = document.getElementById('btn-view-json');
if (btnJson) btnJson.style.display = 'none';

// 관리자 도구
const adminTrigger = document.getElementById('admin-trigger');
if (adminTrigger) {
    adminTrigger.addEventListener('click', async () => {
        document.getElementById('modal-admin').style.display = 'flex';

        const mapping = generateMapping();
        document.getElementById('json-result').textContent = JSON.stringify(mapping, null, 2);

        const statusEl = document.getElementById('status-pdf-server');
        statusEl.textContent = '확인 중...';
        statusEl.style.color = 'var(--toss-text-muted)';

        try {
            const res = await fetch(`${PDF_SERVER_URL.replace('/generate-pdf', '')}/health`);
            if (res.ok) {
                statusEl.textContent = '정상 (Connected)';
                statusEl.style.color = '#15803d';
            } else {
                throw new Error();
            }
        } catch {
            statusEl.textContent = '연결 실패 (Disconnected)';
            statusEl.style.color = '#b91c1c';
        }
        renderAdminDebug();
    });
}

function renderAdminDebug() {
    const tbody = document.getElementById('tbl-admin-debug-body');
    const summary = document.getElementById('admin-debug-summary');
    if (!tbody || !summary) return;

    const breakdown = state.results.personnelBreakdown || [];
    const raw = state.results.rawPersonnel || { sRaw: 0, hRaw: 0, mRaw: 0 };

    // 그룹화 (수식에 맞게: 계획/시스템 검토 vs 나머지)
    const reviewItems = ['계획검토', '시스템검토'];
    let reviewS = 0, reviewH = 0, reviewM = 0;
    let baseS = 0, baseH = 0, baseM = 0;

    const rowsHtml = breakdown.map(item => {
        const isReview = reviewItems.includes(item.name);
        if (isReview) {
            reviewS += item.sContribution;
            reviewH += item.hContribution;
            reviewM += item.mContribution;
        } else {
            baseS += item.sContribution;
            baseH += item.hContribution;
            baseM += item.mContribution;
        }

        return `
            <tr style="${isReview ? 'background:#f0f9ff;' : ''}">
                <td style="font-weight:600; white-space:nowrap;">${isReview ? '<span>[검토]</span> ' : ''}${item.name}</td>
                <td style="text-align:center;">${item.inputQty}</td>
                <td style="text-align:center; color:#64748b;">${(item.rate * 100).toFixed(0)}%</td>
                <td style="text-align:center;">${item.checkQty}</td>
                <td style="text-align:right; font-variant-numeric:tabular-nums; color:#4f46e5;">${item.sContribution.toFixed(3)}</td>
                <td style="text-align:right; font-variant-numeric:tabular-nums; color:#059669;">${item.hContribution.toFixed(3)}</td>
                <td style="text-align:right; font-variant-numeric:tabular-nums; color:#d97706;">${item.mContribution.toFixed(3)}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml;

    const inspB = state.results.inspBreakdown || { labor: 0, expense: 0, general: 0, tech: 0, total: 0, rows: [{ amount: 0 }, { amount: 0 }, { amount: 0 }] };
    const maintB = state.results.maintBreakdown || { labor: 0, expense: 0, general: 0, tech: 0, total: 0, rows: [{ amount: 0 }, { amount: 0 }, { amount: 0 }] };
    const WAGES = window.CONSTANTS.GRADE_WAGES;

    summary.innerHTML = `
        <!-- ═══ [A] 성능 점검 섹션 ═══ -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:0.5rem;">
            <div style="grid-column:1/-1; display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.75rem; background:linear-gradient(90deg,#eff6ff,transparent); border-left:3px solid var(--toss-blue); border-radius:0 8px 8px 0;">
                <i class="fas fa-search" style="color:var(--toss-blue);"></i>
                <span style="font-weight:700; font-size:0.95rem; color:var(--toss-blue);">성능 점검</span>
            </div>

            <!-- A-1: 성능점검 인원 산출 요약 -->
            <div style="background:#fff; padding:1.2rem; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-weight:700; font-size:1rem; margin-bottom:1rem; color:#1e293b; border-bottom:1px solid #f1f5f9; padding-bottom:0.75rem;">
                    <i class="fas fa-users-cog" style="margin-right:0.5rem; color:var(--toss-blue);"></i>성능점검 인원 산출 요약
                </div>
                <div style="display:flex; flex-direction:column; gap:0.7rem; font-size:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#64748b;">① 설비 부하 (기본 설비)</span>
                        <span style="font-variant-numeric:tabular-nums; font-weight:600; color:#334155;">S: ${baseS.toFixed(3)} | H: ${baseH.toFixed(3)} | M: ${baseM.toFixed(3)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#64748b;">② 검토 항목 (계획+시스템)</span>
                        <span style="font-variant-numeric:tabular-nums; font-weight:600; color:var(--toss-blue);">S: ${reviewS.toFixed(3)} | H: ${reviewH.toFixed(3)} | M: ${reviewM.toFixed(3)}</span>
                    </div>
                    <div style="height:1px; background:#f1f5f9;"></div>
                    <div style="background:#fdfcf6; padding:0.6rem; border-radius:8px; font-size:0.75rem; color:#854d0e; border:1px solid #fef3c7;">
                        <div style="font-weight:700; margin-bottom:0.25rem; color:#92400e;">인원 할인율 적용 (${state.condOverride.personnelDiscount || 0}% 할인)</div>
                        <div style="font-variant-numeric:tabular-nums; line-height:1.5;">
                            특급: ${raw.sRaw.toFixed(3)} × ${(1-(state.condOverride.personnelDiscount||0)/100).toFixed(2)} = ${(raw.sRaw*(1-(state.condOverride.personnelDiscount||0)/100)).toFixed(3)} → <b>${state.results.personnel.senior}명</b><br>
                            고급: ${raw.hRaw.toFixed(3)} × ${(1-(state.condOverride.personnelDiscount||0)/100).toFixed(2)} = ${(raw.hRaw*(1-(state.condOverride.personnelDiscount||0)/100)).toFixed(3)} → <b>${state.results.personnel.high}명</b><br>
                            중급: ${raw.mRaw.toFixed(3)} × ${(1-(state.condOverride.personnelDiscount||0)/100).toFixed(2)} = ${(raw.mRaw*(1-(state.condOverride.personnelDiscount||0)/100)).toFixed(3)} → <b>${state.results.personnel.mid}명</b>
                        </div>
                    </div>
                    <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9); padding:0.8rem; border-radius:12px; border:1px solid #e2e8f0; text-align:center; font-size:1rem;">
                        <span style="color:#4f46e5; font-weight:800;">특급 ${state.results.personnel.senior}</span> /
                        <span style="color:#059669; font-weight:800;">고급 ${state.results.personnel.high}</span> /
                        <span style="color:#d97706; font-weight:800;">중급 ${state.results.personnel.mid}</span> 명
                    </div>
                </div>
            </div>

            <!-- A-2: 성능점검 비용 산출 -->
            <div style="background:#fff; padding:1.2rem; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-weight:700; font-size:1rem; margin-bottom:0.75rem; color:#1e293b; border-bottom:1px solid #f1f5f9; padding-bottom:0.75rem;">
                    <i class="fas fa-won-sign" style="margin-right:0.5rem; color:#059669;"></i>성능점검 비용 산출
                </div>
                <div style="display:flex; flex-direction:column; gap:0.6rem; font-size:0.85rem;">
                    <div style="background:#f8fafc; padding:0.6rem; border-radius:8px; font-size:0.75rem; color:#475569; border:1px solid #f1f5f9; line-height:1.7;">
                        <div style="display:flex; justify-content:space-between;">
                            <span>특급 (${state.results.personnel.senior}인 × ${WAGES['특급'].toLocaleString()}원)</span>
                            <span style="font-weight:600;">=${inspB.rows[0].amount.toLocaleString()}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>고급 (${state.results.personnel.high}인 × ${WAGES['고급'].toLocaleString()}원)</span>
                            <span style="font-weight:600;">=${inspB.rows[1].amount.toLocaleString()}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>중급 (${state.results.personnel.mid}인 × ${WAGES['중급'].toLocaleString()}원)</span>
                            <span style="font-weight:600;">=${inspB.rows[2].amount.toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; color:#1e293b;">직접인건비 합계</span>
                        <span style="font-weight:800; font-size:0.95rem;">${inspB.labor.toLocaleString()}원</span>
                    </div>
                    <div style="font-size:0.72rem; color:#64748b;">경비(10%): ${inspB.expense.toLocaleString()} | 제경비(110%): ${inspB.general.toLocaleString()} | 기술료(20%): ${inspB.tech.toLocaleString()}</div>
                    <div style="background:var(--toss-blue-bg); padding:0.6rem 0.8rem; border-radius:10px; border:1px solid var(--toss-blue-light);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.75rem; color:var(--toss-blue); font-weight:700;">성능점검 합계 (10만 절사)</span>
                            <span style="font-size:1rem; font-weight:900; color:var(--toss-blue);">${state.results.costs.inspection.toLocaleString()}원</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ [B] 유지 점검 섹션 ═══ -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem; padding-top:1rem; border-top:2px dashed #fde68a;">
            <div style="grid-column:1/-1; display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.75rem; background:linear-gradient(90deg,#fff7ed,transparent); border-left:3px solid #d97706; border-radius:0 8px 8px 0;">
                <i class="fas fa-tools" style="color:#d97706;"></i>
                <span style="font-weight:700; font-size:0.95rem; color:#d97706;">유지 점검</span>
                <span style="font-size:0.72rem; color:#92400e; background:#fef3c7; padding:1px 8px; border-radius:999px; margin-left:0.25rem;">특급 제외</span>
            </div>

            <!-- B-1: 유지점검 인원 산출 요약 -->
            <div style="background:#fff; padding:1.2rem; border:1px solid #fde68a; border-radius:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-weight:700; font-size:1rem; margin-bottom:1rem; color:#1e293b; border-bottom:1px solid #fef9c3; padding-bottom:0.75rem;">
                    <i class="fas fa-users-cog" style="margin-right:0.5rem; color:#d97706;"></i>유지점검 인원 산출 요약
                </div>
                <div style="display:flex; flex-direction:column; gap:0.7rem; font-size:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#64748b;">고급+중급 부하 (성능점검 동일)</span>
                        <span style="font-variant-numeric:tabular-nums; font-weight:600; color:#334155; font-size:0.8rem;">H: ${(baseH+reviewH).toFixed(3)} | M: ${(baseM+reviewM).toFixed(3)}</span>
                    </div>
                    <div style="height:1px; background:#fef9c3;"></div>
                    <div style="background:#fdfcf6; padding:0.6rem; border-radius:8px; font-size:0.75rem; color:#92400e; border:1px solid #fef3c7;">
                        <div style="font-weight:700; margin-bottom:0.25rem;">할인율 ${state.condOverride.personnelDiscount || 0}% 적용 (특급 미포함)</div>
                        <div style="font-variant-numeric:tabular-nums; line-height:1.5;">
                            특급: <span style="text-decoration:line-through; color:#94a3b8;">제외</span> → <b>0명</b><br>
                            고급: ${raw.hRaw.toFixed(3)} × ${(1-(state.condOverride.personnelDiscount||0)/100).toFixed(2)} → <b>${state.results.personnel.high}명</b><br>
                            중급: ${raw.mRaw.toFixed(3)} × ${(1-(state.condOverride.personnelDiscount||0)/100).toFixed(2)} → <b>${state.results.personnel.mid}명</b>
                        </div>
                    </div>
                    <div style="background:linear-gradient(135deg,#fffbeb,#fef9c3); padding:0.65rem; border-radius:10px; border:1px solid #fde68a; text-align:center; font-size:0.9rem;">
                        <span style="color:#94a3b8; font-weight:600; text-decoration:line-through; font-size:0.8rem;">특급 0</span> /
                        <span style="color:#059669; font-weight:800;">고급 ${state.results.personnel.high}</span> /
                        <span style="color:#d97706; font-weight:800;">중급 ${state.results.personnel.mid}</span> 명
                    </div>
                </div>
            </div>

            <!-- B-2: 유지점검 비용 산출 -->
            <div style="background:#fff; padding:1.2rem; border:1px solid #fde68a; border-radius:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-weight:700; font-size:1rem; margin-bottom:0.75rem; color:#1e293b; border-bottom:1px solid #fef9c3; padding-bottom:0.75rem;">
                    <i class="fas fa-won-sign" style="margin-right:0.5rem; color:#d97706;"></i>유지점검 비용 산출
                </div>
                <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.85rem;">
                    <div style="background:#fffcf9; padding:0.6rem; border-radius:8px; font-size:0.75rem; color:#475569; border:1px solid #fed7aa; line-height:1.7;">
                        <div style="display:flex; justify-content:space-between; color:#94a3b8;">
                            <span>특급 (제외)</span><span style="font-weight:600;">0원</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>고급 (${state.results.personnel.high}인 × ${WAGES['고급'].toLocaleString()}원)</span>
                            <span style="font-weight:600;">${maintB.rows[1].amount.toLocaleString()}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>중급 (${state.results.personnel.mid}인 × ${WAGES['중급'].toLocaleString()}원)</span>
                            <span style="font-weight:600;">${maintB.rows[2].amount.toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; color:#1e293b;">직접인건비</span>
                        <span style="font-weight:800;">${maintB.labor.toLocaleString()}원</span>
                    </div>
                    <div style="font-size:0.72rem; color:#64748b;">경비(10%): ${maintB.expense.toLocaleString()} | 제경비(110%): ${maintB.general.toLocaleString()} | 기술료(20%): ${maintB.tech.toLocaleString()}</div>
                    <div style="background:#fff7ed; padding:0.55rem 0.75rem; border-radius:10px; border:1px solid #ffedd5;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.72rem; color:#d97706; font-weight:700;">유지점검 최종 (10만↓)</span>
                            <span style="font-size:1rem; font-weight:900; color:#d97706;">${state.results.costs.maintenance.toLocaleString()}원</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div style="font-size:0.7rem; color:#94a3b8; margin-top:1.2rem; line-height:1.6; background:#f8fafc; padding:0.75rem; border-radius:8px; border:1px solid #f1f5f9;">
            <div style="font-weight:600; color:#64748b; margin-bottom:0.2rem;">산출 기준 근거</div>
            • 설비별 투입비율: EQUIPMENT_RATIOS(constants.js) 기반 특급/고급/중급 인원 기여도 합산<br>
            • 인원 할인율: personnelDiscount(조건표) 적용 후 Math.floor() 내림<br>
            • 비용: (인원 × 노임단가) 합산 후 경비(10%) + 제경비(110%) + 기술료(20%), 합계에서 10만원 단위 절사<br>
            • 유지점검: 특급기술자 미포함 (고급+중급만 산출)
        </div>
    `;
}

document.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.adminTab;
        btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.style.display = (content.id === targetTab) ? 'flex' : 'none';
        });
        if (targetTab === 'tab-admin-debug') renderAdminDebug();
    });
});

document.getElementById('btn-admin-manual-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-admin-manual-sync');
    btn.disabled = true;
    btn.textContent = '전송 중...';

    try {
        const airResult = await window.airtableService.saveQuotation(state);
        alert('에어테이블 수동 동기화가 성공했습니다.');

        if (airResult && airResult.quotationId) {
            const recordUrl = `https://airtable.com/appFEZaTg3yZU1QwW/tbloif1mheDqaRRuR/${airResult.quotationId}`;
            const recentEl = document.getElementById('status-recent-record');
            if (recentEl) {
                recentEl.innerHTML = `<a href="${recordUrl}" target="_blank" style="color:var(--toss-blue); font-weight:600; text-decoration:none;">보기 <i class="fas fa-external-link-alt" style="font-size:0.75rem;"></i></a>`;
            }
        }
    } catch (err) {
        alert('동기화 실패: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '에어테이블 수동 동기화 실행';
    }
});

document.getElementById('btn-admin-reset').addEventListener('click', () => {
    if (confirm('정말로 모든 입력 데이터를 초기화하고 1단계로 돌아가시겠습니까?')) {
        document.getElementById('btn-reset-addr').click();
        document.getElementById('modal-admin').style.display = 'none';
        showStatusBar('시스템이 성공적으로 초기화되었습니다.', 'success');
    }
});

document.getElementById('btn-admin-close').addEventListener('click', () => {
    document.getElementById('modal-admin').style.display = 'none';
});

// ---- Adjuster Buttons (+/-) ----
document.querySelectorAll('.btn-adj').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = btn.dataset.target;
        const adj = parseFloat(btn.dataset.adj);
        const stateKey = COND_INPUT_MAP[targetId];
        if (!stateKey) return;

        const area = state.floorArea || 0;
        if (area < 5000) return;
        const condition = lookupCondition(area);
        const currentBase = state.condOverride[stateKey] ?? condition[stateKey] ?? 0;

        const isCostField = COST_FIELDS.has(targetId);
        const adjFactor = getAdjFactor();

        let newBase;
        if (isCostField && adjFactor > 0) {
            const currentAdj = Math.round(currentBase * adjFactor);
            const newAdj = Math.max(0, currentAdj + adj);
            newBase = Math.round(newAdj / adjFactor);
        } else {
            newBase = Math.max(0, currentBase + adj);
        }
        state.condOverride[stateKey] = newBase;

        if (targetId === 'cond-monthly-appointment') {
            state.condOverride.yearlyAppointment = newBase * 12;
        } else if (targetId === 'cond-yearly-appointment') {
            state.condOverride.monthlyAppointment = newBase / 12;
        }

        calculate();
    });
});

// ---- Item Toggles ----
document.querySelectorAll('.btn-toggle-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.dataset.item;
        const currentActiveItems = Object.keys(state.itemToggles).filter(k => state.itemToggles[k]);

        if (state.itemToggles[item] && currentActiveItems.length <= 1) {
            alert("최소 1개 이상의 항목(선임/유지/성능)이 포함되어야 합니다.");
            return;
        }

        state.itemToggles[item] = !state.itemToggles[item];
        calculate();
    });
});

// ---- Discount Adjuster Buttons ----
document.querySelectorAll('.btn-adj-discount').forEach(btn => {
    btn.addEventListener('click', () => {
        const adj = parseFloat(btn.dataset.adj);
        state.discount = Math.min(100, Math.max(0, state.discount + adj));
        calculate();
    });
});

// ---- Step Navigation Wizard ----
let currentStep = 1;

window.goToStep = function (step) {
    if (step === 2 && currentStep === 1) {
        if (!state.address) {
            alert("주소를 먼저 검색하고 선택해주세요.");
            return;
        }
    }
    if (step === 3 && currentStep === 2) {
        if (!state.floorArea || state.floorArea < 1) {
            alert("연면적을 입력해주세요.");
            return;
        }
        if (!state.customerName || !state.customerName.trim()) {
            alert("대상처명(고객명)을 입력해주세요.");
            document.getElementById('customer-name').focus();
            return;
        }
        // 창고시설 차단
        if ((state.purpose || '').includes('창고')) {
            alert('창고시설은 견적 작성 대상이 아닙니다.');
            return;
        }
        // 학교: 위탁선임 월 단가 65만원 자동 설정
        if ((state.purpose || '').includes('학교')) {
            if (state.condOverride.monthlyAppointment == null) {
                state.condOverride.monthlyAppointment = 650000;
                state.condOverride.yearlyAppointment = 7800000;
                calculate();
            }
        }
    }

    currentStep = step;

    document.querySelectorAll('.step-indicator').forEach((el, index) => {
        const i = index + 1;
        el.classList.remove('active', 'completed');
        if (i < currentStep) {
            el.classList.add('completed');
        } else if (i === currentStep) {
            el.classList.add('active');
        }
    });

    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.remove('active');
    });
    const activePane = document.getElementById(`step${step}-content`);
    if (activePane) {
        activePane.classList.add('active');
    }

    document.getElementById('card-summary').style.display = (step >= 2) ? 'block' : 'none';
    document.getElementById('card-bottom-actions').style.display = (step === 3) ? 'flex' : 'none';

    if (step === 1) {
        const kakaoContainer = document.getElementById('kakao-embed-container');
        if (kakaoContainer) {
            kakaoContainer.innerHTML = '';
            if (typeof initKakaoSearch === 'function') initKakaoSearch();
        }
    }

    const container = document.querySelector('.container');
    if (container) {
        if (step === 1) container.classList.add('step1-mode');
        else container.classList.remove('step1-mode');
    }

    calculate();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ---- Initialize ----
function _startKakaoSearch() {
    if (typeof daum !== 'undefined' && typeof daum.Postcode !== 'undefined') {
        initKakaoSearch();
    } else {
        console.warn('[카카오맵] daum.Postcode 미준비 - 재시도 중...');
        setTimeout(_startKakaoSearch, 100);
    }
}

if (window._kakaoPostcodeLoaded) {
    _startKakaoSearch();
} else {
    window._onKakaoPostcodeReady = _startKakaoSearch;
}

// ---- 기계사업부: 설비 수량 입력 UI 동적 렌더링 (리스트 행 + 그룹 토글) ----
(function renderEquipmentInputs() {
    const container = document.getElementById('equipment-inputs');
    if (!container) return;
    const groups = window.CONSTANTS.EQUIPMENT_GROUPS || [];
    let html = '';
    groups.forEach((group, gi) => {
        const bodyId = `eq-group-body-${gi}`;
        const arrowId = `eq-group-arrow-${gi}`;
        // 첫 번째 그룹만 기본 펼침, 나머지는 접힘
        const isOpen = gi === 0;
        html += `
        <div style="margin-bottom:0.75rem; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
            <!-- 그룹 헤더 (클릭으로 토글) -->
            <button type="button" data-eq-toggle="${gi}"
                style="width:100%; display:flex; align-items:center; justify-content:space-between;
                       padding:0.65rem 0.9rem; background:#eff6ff; border:none; cursor:pointer;
                       border-left:4px solid var(--toss-blue, #3b82f6); gap:0.5rem;">
                <span style="display:flex; align-items:center; gap:0.45rem; font-size:0.95rem; font-weight:700;
                             color:var(--toss-text-main); letter-spacing:-0.01em;">
                    <i class="fas fa-layer-group" style="color:var(--toss-blue, #3b82f6); font-size:0.85rem;"></i>
                    ${group.group}
                    <span style="font-size:0.75rem; font-weight:500; color:var(--toss-text-sub);
                                 background:white; border:1px solid #e5e7eb; border-radius:99px;
                                 padding:1px 8px; margin-left:2px;">${group.items.length}종</span>
                </span>
                <i id="${arrowId}" class="fas fa-chevron-${isOpen ? 'up' : 'down'}"
                   style="color:var(--toss-text-sub); font-size:0.8rem; transition:transform 0.2s;"></i>
            </button>
            <!-- 그룹 바디 (항목 리스트) -->
            <div id="${bodyId}" style="display:${isOpen ? 'block' : 'none'};">`;
        group.items.forEach((item, idx) => {
            const isLast = idx === group.items.length - 1;
            html += `
                <div style="display:flex; align-items:center; justify-content:space-between;
                            padding:0.55rem 0.9rem;
                            border-top:1px solid #f3f4f6;
                            background:white;">
                    <span style="font-size:0.875rem; color:var(--toss-text-main); font-weight:500;">${item}</span>
                    <div style="display:flex; align-items:center; gap:0;">
                        <button type="button" data-eq-minus="${item}"
                            style="width:32px; height:32px; border:1px solid #e5e7eb; border-radius:8px 0 0 8px;
                                   background:#f9fafb; font-size:1.1rem; cursor:pointer;
                                   color:#6b7280; flex-shrink:0;">−</button>
                        <input type="number" min="0" value="${state.equipmentQty[item] || 0}"
                            data-equipment="${item}"
                            style="width:52px; height:32px; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb;
                                   border-left:none; border-right:none;
                                   font-size:0.95rem; font-weight:600; text-align:center;
                                   background:white; color:var(--toss-text-main);">
                        <button type="button" data-eq-plus="${item}"
                            style="width:32px; height:32px; border:1px solid #e5e7eb; border-radius:0 8px 8px 0;
                                   background:#eff6ff; font-size:1.1rem; cursor:pointer;
                                   color:var(--toss-blue, #3b82f6); flex-shrink:0;">+</button>
                    </div>
                </div>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html;

    // 그룹 토글 클릭 이벤트
    container.addEventListener('click', e => {
        const toggleBtn = e.target.closest('[data-eq-toggle]');
        if (!toggleBtn) return;
        const gi = toggleBtn.dataset.eqToggle;
        const body = document.getElementById(`eq-group-body-${gi}`);
        const arrow = document.getElementById(`eq-group-arrow-${gi}`);
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (arrow) {
            arrow.className = isOpen
                ? 'fas fa-chevron-down'
                : 'fas fa-chevron-up';
        }
    });
})();

// Start at Step 1
goToStep(1);
