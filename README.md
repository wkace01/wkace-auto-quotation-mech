# 기계사업부 견적 자동화 시스템

> 기계설비 성능점검 · 유지점검 · 위탁선임 비용을 자동으로 산출하고 엑셀(PDF) 견적서를 생성하는 웹 애플리케이션입니다.

## 주요 기능

- **견적 자동 산출** — 연면적 및 설비 수량 입력 시 엔지니어링 표준품셈 기반으로 인원·비용 자동 계산
- **3개 항목 개별 제어** — 성능점검 / 유지점검 / 위탁선임 항목별 활성/비활성 토글
- **엑셀·PDF 출력** — LibreOffice를 통해 견적서 / 산출내역 / 수량산출기준 3개 시트를 PDF로 변환
- **실시간 요약 패널** — 입력값 변경 즉시 합계 금액 업데이트
- **Airtable 자동 저장** — 견적 데이터를 Airtable 베이스에 자동 동기화
- **관리자 산출 디버깅** — 설비별 기술자 투입 비율, 인원 할인율 적용 과정, 등급별 인건비를 성능점검/유지점검 섹션으로 시각화

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| PDF 변환 | LibreOffice (headless) |
| 엑셀 처리 | xlsx-populate, ExcelJS |
| 데이터 저장 | Airtable REST API |
| 배포 | Railway |

## 프로젝트 구조

```
├── server.js               # Express 서버 (PDF 생성 엔드포인트)
├── public/
│   ├── index.html          # 메인 UI
│   ├── app_step.js         # 단계별 UI 로직 및 상태 관리
│   ├── division_config.js  # 기계사업부 계산 로직 및 엑셀 매핑
│   ├── constants.js        # 설비별 점검 비율, 노임단가 등 상수
│   ├── common.js           # 공통 유틸리티
│   ├── airtable_service.js # Airtable API 연동
│   └── toss_step_style.css # 스타일시트
├── template/               # 엑셀 템플릿 파일
├── Dockerfile              # Railway 배포용
├── .env.example            # 환경변수 예시
└── package.json
```

## 비용 산출 로직

```
직접인건비 = Σ (투입인원 × 노임단가)
직접경비   = 직접인건비 × 10%
제경비     = 직접인건비 × 110%
기술료     = (직접인건비 + 제경비) × 20%
소계       = 직접인건비 + 직접경비 + 제경비 + 기술료
최종금액   = 소계 (10만원 단위 절사)
```

- **노임단가** (정부고시 기준): 특급 401,407원 / 고급 335,379원 / 중급 300,463원
- **인원 산출**: 설비 수량 × 항목별 투입 비율(EQUIPMENT_RATIOS) 합산 후 Math.floor()
- **유지점검**: 특급기술자 미포함 (고급 + 중급만 산출)

## 환경변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

| 변수명 | 설명 |
|--------|------|
| `AIRTABLE_API_KEY` | Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | Airtable 베이스 ID |
| `AIRTABLE_TABLE_NAME` | 저장 대상 테이블 이름 |
| `PORT` | 서버 포트 (기본값: 3001) |

## 로컬 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (프론트 :3000 + 백엔드 :3001 동시 실행)
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## Railway 배포

1. Railway 프로젝트에 이 저장소 연결
2. 환경변수 설정 (위 목록 참고)
3. `npm start` 명령으로 자동 배포

> ⚠️ LibreOffice가 설치된 환경이 필요합니다. `Dockerfile` 참고.

## 개발 워크플로우

```bash
# 새 기능 개발 시
git checkout -b feature/기능명
git commit -m "feat: 기능 설명"
git push origin feature/기능명
# → GitHub에서 PR 생성 → main 브랜치로 Merge
```

## 주요 파일 설명

### `division_config.js`
기계사업부 핵심 로직 파일입니다.
- `calculateCosts()` — 설비 수량 → 인원 산출 → 비용 계산 전체 파이프라인
- `generateExcelMapping()` — 계산 결과를 엑셀 셀 좌표에 매핑
- `_buildMechBreakdown()` — 등급별 인건비 구조 계산

### `constants.js`
- `EQUIPMENT_INSPECTION_RATES` — 설비별 점검 수량 산출 방식
- `EQUIPMENT_RATIOS` — 설비별 특급/고급/중급 투입 비율
- `GRADE_WAGES` — 등급별 노임단가
