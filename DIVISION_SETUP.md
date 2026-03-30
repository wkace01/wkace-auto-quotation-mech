# 새 사업부 견적서 자동화 적용 가이드

이 템플릿은 `division_config.js`와 `constants.js` 두 파일만 수정하면 새 사업부에 적용할 수 있도록 설계되어 있습니다.

---

## 수정 파일 요약

| 파일 | 역할 | 수정 빈도 |
|---|---|---|
| `public/division_config.js` | 항목 정의, 비용 계산, Excel 매핑 | 사업부당 1회 |
| `public/constants.js` | 조건표 단가, 노임단가, 담당자 목록 | 사업부당 1회 |
| `public/index.html` | 헤더 제목, 영업담당자 옵션 목록 | 사업부당 1회 |
| `template/` 폴더 | Excel 양식 파일 | 사업부당 1회 |
| `.env` | API 키, 포트 등 환경변수 | 배포 환경별 |

`app_step.js`, `server.js`, `common.js`, `airtable_service.js`는 수정하지 않아도 됩니다.

---

## 단계별 적용 절차

### 1단계. GitHub 템플릿 레포 복제

```bash
git clone https://github.com/your-org/quotation-automation-template.git my-division-quotation
cd my-division-quotation
npm install
```

---

### 2단계. `public/constants.js` 수정

등급표, 단가, 담당자 목록을 사업부 기준으로 교체합니다.

교체 대상:
- `QUOTATION_CONDITIONS` — 연면적 구간별 등급 및 기본 단가
- `ADJUSTMENT_COEFFICIENTS` — 연면적 조정계수
- `SALES_MANAGERS` — 영업 담당자 이름/전화번호 목록
- `GRADE_WAGES` — 등급별 노임단가 (점검 인력용)
- `APPOINTMENT_WAGES` — 위탁선임 전용 월 단가 (항목 없으면 `{}`)
- `GRADE_ORDER` — 등급 정렬 순서 (`['특급', '고급', '중급', '초급']`)
- `COND_RANGE_LABELS` — 연면적 구간 레이블 (키 = `QUOTATION_CONDITIONS[].area`)

---

### 3단계. `public/division_config.js` 수정

#### 3-1. 기본 정보 변경

```js
window.DIVISION_CONFIG = {
    name: "새사업부명",
    excelTemplate: "새사업부 견적서 양식.xlsx",   // template/ 폴더 내 파일명과 일치
    airtablePdfFieldId: "fldXXXXXXXXXXXXXX",      // Airtable 필드 ID
    ...
};
```

#### 3-2. 항목(items) 정의 변경

```js
items: [
    { id: "inspection",  label: "성능점검", defaultFrequency: "1회" },
    { id: "maintenance", label: "유지점검", defaultFrequency: "2회" },
    // 항목 추가/삭제 가능
    // id는 영문 소문자로 작성, HTML element id 및 state 키로 사용됨
],
```

항목 id를 변경하거나 추가하면 `index.html`의 조건 패널 섹션도 함께 수정해야 합니다.
(`data-row-item`, `data-item`, `id` 속성이 items[].id와 일치해야 함)

#### 3-3. `calculateCosts()` 함수 수정

항목별 비용 계산 로직이 달라지면 이 함수를 수정합니다.
반환값은 반드시 `{ inspection, maintenance, appointment }` 구조를 유지해야 합니다.
항목 id가 달라진 경우 반환 키명도 id와 일치시켜야 합니다.

#### 3-4. `generateExcelMapping()` 함수 수정

Excel 양식의 시트명·셀 주소가 달라지면 이 함수를 수정합니다.
반환 구조: `{ "시트명": [{ name, cell, value }, ...], ... }`

---

### 4단계. Excel 양식 파일 교체

1. 기존 `template/` 폴더(또는 루트)의 xlsx 파일을 삭제합니다.
2. 새 사업부 Excel 양식 파일을 `template/` 폴더에 배치합니다.
3. `division_config.js`의 `excelTemplate` 값이 파일명과 정확히 일치하는지 확인합니다.

```
template/
  새사업부 견적서 양식.xlsx   ← division_config.js excelTemplate 과 일치
```

---

### 5단계. `.env` 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 실제 값을 입력합니다:

```
AIRTABLE_API_KEY=pat_xxxxxxxxxxxxxxxx
AIRTABLE_PDF_FIELD_ID=fldXXXXXXXXXXXXXX
PORT=3001
DIVISION_NAME=새사업부명
```

`AIRTABLE_PDF_FIELD_ID`는 Airtable 테이블에서 PDF를 첨부할 필드의 ID입니다.
Airtable API 문서(https://airtable.com/developers/web/api) 에서 확인할 수 있습니다.

---

### 6단계. Railway 배포

#### 6-1. Railway 프로젝트 생성

1. [railway.app](https://railway.app) 로그인
2. "New Project" > "Deploy from GitHub repo" 선택
3. 이 레포지토리 연결

#### 6-2. 환경변수 설정

Railway 대시보드 > 서비스 > Variables 탭에서 아래 변수를 추가합니다:

| 변수명 | 값 |
|---|---|
| `AIRTABLE_API_KEY` | Airtable Personal Access Token |
| `AIRTABLE_PDF_FIELD_ID` | Airtable PDF 필드 ID |
| `DIVISION_NAME` | 사업부명 (선택) |

`PORT`는 Railway가 자동으로 주입하므로 설정하지 않아도 됩니다.

#### 6-3. LibreOffice 설치 확인

Dockerfile에 LibreOffice 설치 명령이 포함되어 있습니다.
Railway는 Dockerfile을 자동으로 감지하여 빌드합니다.

---

### 7단계. 검증 체크리스트

배포 후 아래 항목을 순서대로 확인합니다.

- [ ] `https://your-app.railway.app/health` 접속 시 `{"status":"ok"}` 응답 확인
- [ ] 주소 검색 후 건물 등급이 올바르게 표시되는지 확인
- [ ] 연면적 입력 시 조건표 금액이 정확히 계산되는지 확인
- [ ] 견적 조건 수동 수정 후 금액이 즉시 반영되는지 확인
- [ ] 할인율/배수/부가세 적용 시 금액 변동 확인
- [ ] "견적서 PDF 생성" 버튼 클릭 후 PDF 다운로드 확인
- [ ] PDF 파일 열기 — Excel 셀 매핑 값이 정확한지 확인
- [ ] Airtable 저장 성공 메시지 확인
- [ ] Airtable 레코드에 PDF 파일 첨부 확인
- [ ] 모바일(iOS/Android) 브라우저에서 레이아웃 확인

---

## 자주 발생하는 오류

### PDF 생성 실패 — "Excel 템플릿 파일을 찾을 수 없습니다"

`division_config.js`의 `excelTemplate` 값과 `template/` 폴더 내 파일명이 일치하는지 확인합니다.

### Airtable 저장 실패 — "API 키 오류"

Railway 환경변수 `AIRTABLE_API_KEY`가 올바르게 설정되었는지 확인합니다.
Airtable Personal Access Token에 해당 Base의 읽기/쓰기 권한이 있는지 확인합니다.

### 금액 계산 오류

`constants.js`의 `QUOTATION_CONDITIONS` 데이터와 `division_config.js`의 `calculateCosts()`가 일치하는지 확인합니다.
특히 `condOverride`에서 참조하는 키명(`yearlyInspection` 등)이 조건표 필드명과 일치해야 합니다.

### 탭 내용이 비어있음

`renderTabs()`가 참조하는 `tbl-q-inspection`, `tbl-q-maintenance`, `tbl-q-appointment` id가 `index.html`에 존재하는지 확인합니다.

---

## 파일 구조

```
quotation-automation-template/
├── public/
│   ├── division_config.js    ← CUSTOMIZE: 사업부 특화 설정 (핵심)
│   ├── constants.js          ← CUSTOMIZE: 단가 및 기준 데이터
│   ├── index.html            ← CUSTOMIZE: 헤더, 영업담당자 목록
│   ├── app_step.js           ← 범용 (수정 불필요)
│   ├── common.js             ← 범용 (수정 불필요)
│   └── airtable_service.js   ← 범용 (수정 불필요)
├── template/
│   └── 사업부 견적서 양식.xlsx  ← CUSTOMIZE: Excel 양식 교체
├── server.js                 ← 범용 (수정 불필요)
├── package.json
├── Dockerfile
├── .env.example
├── .gitignore
└── DIVISION_SETUP.md
```
