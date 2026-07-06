# ASSET_INFO Agent Harnesses

본 프로젝트(`ASSET_INFO`)의 효율적인 자산 관리 기능 개발, 코드 품질 유지 및 운영 지원을 위해 아래 4가지 하네스가 구성되어 있습니다.

---

## 🛠️ 하네스 리스트 및 사용법

### 1. 🌐 `/fullstack-webapp` (풀스택 기능 개발)
- **목적**: React 프론트엔드 UI 컴포넌트 추가 및 FastAPI 라우터/서비스 API 개발 시 오케스트레이션.
- **에이전트**: `architect`, `frontend-dev`, `backend-dev`, `qa-engineer`, `devops-engineer`
- **사용 예시**: "대시보드에 소모품 재고 상태 요약 차트 기능 추가해줘"

### 2. 🔍 `/code-reviewer` (코드 리뷰 및 검토)
- **목적**: 코드 스타일 컨벤션, 보안(구글 API 키 등), 성능, 아키텍처 다각도 리뷰.
- **에이전트**: `style-inspector`, `security-analyst`, `performance-analyst`, `architecture-reviewer`, `review-synthesizer`
- **사용 예시**: "Google Sheets API 연동 모듈 전체 코드 리뷰해줘"

### 🧪 3. `/test-automation` (테스트 자동화)
- **목적**: pytest 및 프론트엔드 테스트 코드 작성, 모킹 전략 수립, 커버리지 측정.
- **에이전트**: `test-strategist`, `unit-tester`, `integration-tester`, `coverage-analyst`, `version-controller`
- **사용 예시**: "assets_service.py 의 신규입사자 등록 로직용 테스트 작성해줘"

### 📝 4. `/sop-writer` (SOP 및 매뉴얼 작성)
- **목적**: 자산 및 소모품 관리를 담당하는 운영자를 위한 매뉴얼, 체크리스트 작성.
- **에이전트**: `process-analyst`, `procedure-writer`, `checklist-designer`, `training-developer`, `qa-reviewer`
- **사용 예시**: "인사팀용 '신규 입사자 발생 시 자산 등록/지급 표준 업무 절차서' 작성해줘"

---

## 📂 폴더 구조

```
.claude/
├── agents/                           # 20명의 전문 분야 에이전트 선언
├── skills/                           # 각 하네스 오케스트레이터 및 확장 스킬들
│   ├── fullstack-webapp/             # 풀스택 개발 워크플로우
│   ├── code-reviewer/                # 종합 코드 검토 워크플로우
│   ├── test-automation/              # 자동 테스트 작성 워크플로우
│   └── sop-writer/                   # 매뉴얼/SOP 저작 워크플로우
└── CLAUDE.md                         # 본 가이드 파일
```

## 📦 산출물 위치
모든 하네스 실행 결과 및 중간 단계 산출물은 프로젝트 루트의 `_workspace/` 디렉토리에 저장됩니다.
