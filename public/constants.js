/**
 * constants.js — 사업부 기준 데이터 (견적 조건표, 단가, 담당자 목록 등)
 *
 * ====================================================================
 * CUSTOMIZE: 새 사업부 적용 시 이 파일의 데이터를 교체하세요.
 *
 * 교체 대상:
 *   - QUOTATION_CONDITIONS   : 연면적 구간별 등급 및 기본 단가 테이블
 *   - ADJUSTMENT_COEFFICIENTS: 연면적 조정계수 테이블
 *   - SALES_MANAGERS         : 영업 담당자 목록 (이름, 전화번호)
 *   - GRADE_WAGES            : 등급별 노임단가 (점검 인력용)
 *   - APPOINTMENT_WAGES      : 위탁선임 전용 노임단가 (없으면 빈 객체 {}로 유지)
 *   - GRADE_STYLES           : 등급별 색상 (UI 표시용)
 *   - GRADE_ORDER            : 등급 정렬 순서 배열 (높은 등급 → 낮은 등급)
 *   - COND_RANGE_LABELS      : 연면적 구간 표시 레이블 (계산식 표시용)
 *
 * division_config.js의 items[] id와 조건표 필드명이 일치해야 합니다.
 * 예) items id="inspection" → condition.yearlyInspection, condition.inspectionWorkers
 * ====================================================================
 */
window.CONSTANTS = {
    // CUSTOMIZE: 연면적 구간별 견적 조건표 — 사업부 기준 단가로 교체하세요.
    QUOTATION_CONDITIONS: [
        // 5,000이상 ~ 10,000미만: 초급
        { area: 5000,   grade: "초급", monthlyAppointment:  80000, yearlyAppointment:  960000, yearlyMaintenance:  360000, yearlyInspection: 1080000, inspectionWorkers: 4, maintenanceWorkers: 4 },
        // 10,000이상 ~ 15,000미만: 초급
        { area: 10000,  grade: "초급", monthlyAppointment:  80000, yearlyAppointment:  960000, yearlyMaintenance:  405000, yearlyInspection: 1335000, inspectionWorkers: 4, maintenanceWorkers: 4 },
        // 15,000이상 ~ 30,000미만: 중급
        { area: 15000,  grade: "중급", monthlyAppointment: 130000, yearlyAppointment: 1560000, yearlyMaintenance:  450000, yearlyInspection:  990000, inspectionWorkers: 6, maintenanceWorkers: 6 },
        // 30,000이상 ~ 60,000미만: 고급
        { area: 30000,  grade: "고급", monthlyAppointment: 150000, yearlyAppointment: 1800000, yearlyMaintenance:  630000, yearlyInspection: 1770000, inspectionWorkers: 8, maintenanceWorkers: 8 },
        // 60,000이상 ~ 150,000미만: 특급
        { area: 60000,  grade: "특급", monthlyAppointment: 180000, yearlyAppointment: 2160000, yearlyMaintenance:  810000, yearlyInspection: 2430000, inspectionWorkers: 10, maintenanceWorkers: 10 },
        // 150,000이상: 특급
        { area: 150000, grade: "특급", monthlyAppointment: 180000, yearlyAppointment: 2160000, yearlyMaintenance:  810000, yearlyInspection: 2430000, inspectionWorkers: 10, maintenanceWorkers: 10 }
    ],

    // CUSTOMIZE: 연면적 조정계수 표 — 사업부 기준으로 교체하세요.
    ADJUSTMENT_COEFFICIENTS: [
        { area: 5000,   coef: 1.15 },  // 5,000  이상 ~ 10,000 미만
        { area: 10000,  coef: 1.30 },  // 10,000 이상 ~ 15,000 미만
        { area: 15000,  coef: 1.45 },  // 15,000 이상 ~ 20,000 미만
        { area: 20000,  coef: 1.60 },  // 20,000 이상 ~ 25,000 미만
        { area: 25000,  coef: 1.75 },  // 25,000 이상 ~ 30,000 미만
        { area: 30000,  coef: 1.90 },  // 30,000 이상 ~ 35,000 미만
        { area: 35000,  coef: 2.05 },  // 35,000 이상 ~ 40,000 미만
        { area: 40000,  coef: 2.20 },  // 40,000 이상 ~ 45,000 미만
        { area: 45000,  coef: 2.35 },  // 45,000 이상 ~ 50,000 미만
        { area: 50000,  coef: 2.50 },  // 50,000 이상 ~ 55,000 미만
        { area: 55000,  coef: 2.65 },  // 55,000 이상 ~ 60,000 미만
        { area: 60000,  coef: 2.80 },  // 60,000 이상
    ],

    // CUSTOMIZE: 영업 담당자 목록 — 사업부 담당자로 교체하세요.
    SALES_MANAGERS: [
        { name: "박진철", phone: "010-7130-8285" },
        { name: "임학빈", phone: "010-4259-2044" },
        { name: "전무승", phone: "010-5269-5357" },
        { name: "김태훈", phone: "010-5393-1308" },
        { name: "이정국", phone: "010-5474-3414" },
        { name: "이승학", phone: "010-2395-5603" },
        { name: "김학수", phone: "010-3255-2473" },
        { name: "김찬진", phone: "010-2027-5011" },
        { name: "신홍민", phone: "010-6550-7169" },
        { name: "한춘교", phone: "010-9162-2995" },
        { name: "박민수", phone: "010-4458-3472" },
        { name: "이우현", phone: "010-2494-4756" },
        { name: "고윤성", phone: "010-2871-5485" }
    ],

    // CUSTOMIZE: 등급별 UI 색상 — 등급 체계가 달라지면 수정하세요.
    GRADE_STYLES: {
        '초급': { color: '#2563eb', label: '초급' },
        '중급': { color: '#16a34a', label: '중급' },
        '고급': { color: '#d97706', label: '고급' },
        '특급': { color: '#dc2626', label: '특급' }
    },

    // CUSTOMIZE: 점검 인력 등급별 노임단가 (원/인·일) — 사업부 기준으로 교체하세요.
    GRADE_WAGES: {
        '특급': 330713,
        '고급': 301470,
        '중급': 272298,
        '초급': 234973,
    },

    // CUSTOMIZE: 위탁선임 전용 노임단가 (월 단가 기준, 점검 인력과 별도)
    // 위탁선임 항목이 없는 사업부는 빈 객체 {} 로 변경하세요.
    APPOINTMENT_WAGES: {
        '특급': 180000,
        '고급': 150000,
        '중급': 130000,
        '초급':  80000,
    },

    // CUSTOMIZE: 등급 정렬 순서 (높은 등급 → 낮은 등급 순으로 나열)
    GRADE_ORDER: ['특급', '고급', '중급', '초급'],

    // CUSTOMIZE: 연면적 구간 레이블 (조건표 area 값과 키가 일치해야 함)
    COND_RANGE_LABELS: {
        5000:   "5,000 ≤ 연면적 < 10,000",
        10000:  "10,000 ≤ 연면적 < 15,000",
        15000:  "15,000 ≤ 연면적 < 30,000",
        30000:  "30,000 ≤ 연면적 < 60,000",
        60000:  "60,000 ≤ 연면적 < 150,000",
        150000: "150,000㎡ 이상"
    }
};
