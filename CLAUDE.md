# Claude Code 개발 지침

> 프로젝트 전체 컨텍스트는 **`AGENTS.md`** 를 먼저 읽을 것.
> 아키텍처 상세는 **`ARCHITECTURE.md`**, 기능 스펙은 **`docs/`** 참조.

## 개발 완료 후 필수 워크플로우

모든 기능 추가·수정·버그 수정 작업이 끝나면 반드시 아래 순서를 따른다.

---

### Step 1. 로컬에서 기능 확인

작업 완료 후 반드시 로컬 서버를 실행해 기능이 정상 동작하는지 확인한다.

**백엔드 실행** (프로젝트 루트):
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

**프론트엔드 실행** (`frontend/` 폴더):
```bash
npm run dev
```

**확인 URL:**
- 앱: `http://localhost:5173`
- API 문서: `http://localhost:8000/docs`

로컬 확인이 완료된 후에만 다음 단계로 진행한다.

---

### Step 2. GitHub에 업로드

로컬 확인이 완료되면 변경 내용을 커밋하고 `main` 브랜치에 푸시한다.

```bash
git add <변경된 파일>
git commit -m "feat|fix|style|docs: 변경 내용 한 줄 설명"
git push origin main
```

**커밋 메시지 컨벤션:**

| prefix | 용도 |
|--------|------|
| `feat:` | 새 기능 추가 |
| `fix:` | 버그 수정 |
| `style:` | UI/CSS 변경 |
| `refactor:` | 코드 리팩토링 |
| `docs:` | 문서 수정 |
| `chore:` | 설정·의존성 변경 |

---

### Step 3. 웹 배포

GitHub 푸시 완료 후 운영 서버(Google Cloud Run)에 배포한다.

> ⚠️ 이 단계는 `gcloud` CLI와 서비스 계정 키(`data/*.json`)가 필요하므로  
> **사용자 로컬 PC에서 직접 실행**해야 한다.

```bash
# 프로젝트 루트(ASSET_INFO)에서
./deploy.sh
```

배포 완료 후 운영 URL에서 최종 확인:
```
https://asset-info-1015498761413.asia-northeast3.run.app/dashboard
```

---

## 주의사항

- Step 1 없이 바로 커밋·배포하지 않는다
- `data/*.json` (서비스 계정 키), `*.db`, `*.xlsx` 파일은 절대 커밋하지 않는다
- 배포 전 반드시 `git status`로 민감 파일 포함 여부를 확인한다
