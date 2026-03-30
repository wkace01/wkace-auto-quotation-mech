# 견적서 자동화 템플릿

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Railway](https://img.shields.io/badge/Deploy-Railway-0B0D0E?logo=railway)
![Airtable](https://img.shields.io/badge/DB-Airtable-18BFFF?logo=airtable&logoColor=white)
![LibreOffice](https://img.shields.io/badge/PDF-LibreOffice-83C3C8)

> 연면적 입력 하나로 **견적서 PDF 자동 생성 + Airtable DB 자동 저장**까지 완료하는 사업부 공통 견적 자동화 템플릿

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🔍 주소 자동 조회 | 카카오 우편번호 API + 건축물대장 API로 연면적·용도 자동 입력 |
| 🧮 견적 자동 계산 | 연면적 → 등급 판별 → 항목별 금액 즉시 계산 |
| ⚙️ 실시간 조정 | 배수·할인율·부가세·항목 ON/OFF 실시간 반영 |
| 📄 PDF 1클릭 생성 | Excel 템플릿 → LibreOffice → PDF 자동 변환 |
| 🗄️ DB 자동 저장 | PDF 생성과 동시에 Airtable에 고객·견적 정보 저장 |
| 📱 모바일 지원 | URL 접속만으로 PC·모바일 어디서든 사용 가능 |

---

## 파일 구조

```
quotation-automation-template/
  ├── public/
  │   ├── division_config.js   ← ✏️ 사업부마다 수정 (항목 정의·계산·Excel 매핑)
  │   ├── constants.js         ← ✏️ 등급표·단가 데이터 교체
  │   ├── app_step.js          ← ✅ 범용 계산 엔진 (수정 불필요)
  │   ├── index.html           ← ✅ 범용 UI (수정 불필요)
  │   ├── common.js            ← ✅ 주소·건물 API 유틸
  │   ├── airtable_service.js  ← ✅ Airtable DB 연동
  │   └── toss_step_style.css  ← ✅ 스타일
  ├── template/
  │   └── [사업부명]_양식.xlsx  ← 🔄 사업부별 Excel 양식으로 교체
  ├── server.js                ← 백엔드 서버
  ├── Dockerfile               ← Railway 배포용
  ├── .env.example             ← 환경변수 예시
  └── DIVISION_SETUP.md        ← 신규 사업부 상세 적용 가이드
```

> ✅ 표시 파일은 **수정 없이 그대로 사용**, ✏️ 표시 파일만 사업부에 맞게 수정

---

## 새 사업부 적용 방법 (5단계)

### 1. 레포 복제
```bash
git clone https://github.com/wkace01/quotation-automation-template.git [사업부명]-quotation
cd [사업부명]-quotation
npm install
```

### 2. `constants.js` 수정
등급표·단가 데이터를 해당 사업부 기준으로 교체
```js
QUOTATION_CONDITIONS: [
  { area: 5000, grade: "초급", monthlyAppointment: ..., ... },
  ...
]
```

### 3. `division_config.js` 수정
항목 이름, 계산 로직, Excel 셀 매핑을 사업부에 맞게 작성
```js
window.DIVISION_CONFIG = {
  name: "○○사업부",
  excelTemplate: "○○사업부_양식.xlsx",
  items: [
    { id: "item1", label: "항목명1", defaultFrequency: "1회" },
    // 2~4개 자유롭게
  ],
  calculateCosts: function(condition, adjFactor, toggles, includeVAT) { ... },
  generateExcelMapping: function(state, costs, adjFactor, laborData) { ... }
};
```

### 4. Excel 양식 교체
`template/` 폴더에 해당 사업부 Excel 견적서 양식 파일을 넣고,
`division_config.js`의 `excelTemplate` 값을 파일명과 일치시킴

### 5. Railway 배포
- Railway → New Project → GitHub 레포 연결
- 환경변수 설정 (아래 참고)
- Dockerfile 자동 감지 → 자동 배포

> 📖 **상세 가이드**: [`DIVISION_SETUP.md`](./DIVISION_SETUP.md) 참고

---

## 환경변수 설정

`.env.example`을 복사하여 `.env` 파일 생성 후 값 입력:

```bash
cp .env.example .env
```

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `AIRTABLE_API_KEY` | Airtable → Developer Hub → Personal Access Tokens | ✅ |
| `AIRTABLE_PDF_FIELD_ID` | PDF 첨부 파일 필드 ID (Airtable 필드 설정에서 확인) | ✅ |
| `PORT` | 서버 포트 (기본값: 3001) | 선택 |

---

## 로컬 실행

```bash
npm install
cp .env.example .env   # 값 입력 후 저장
node server.js
# → http://localhost:3001 접속
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js + Express |
| PDF 변환 | LibreOffice (headless CLI) |
| Excel 처리 | xlsx-populate |
| 데이터베이스 | Airtable |
| 주소 검색 | 카카오 우편번호 API |
| 건물 정보 | 공공데이터포털 건축물대장 API |
| 배포 | Railway (Docker) |

---

## 라이선스

내부 사용 전용 — 우경정보통신 정보통신사업부
