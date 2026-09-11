# 분리된 테스트 환경

이 체크아웃은 `codex/isolated-test-20260910` 테스트 브랜치이며 원본 로컬 소스 및 운영 main을 수정하지 않는다.

- 대상: Cloud Run `asset-info-test`, `st-asset-project`, `asia-northeast3`
- 데이터: 운영 문서 4개의 독립 복사본. 총 50개 탭의 구조·값 일치와 복사본 임시 탭 쓰기/읽기/삭제 검증 완료.
- 인증: 기존 서비스 계정 사용. 복사본에는 소유자와 서비스 계정만 접근. 웹은 공통 테스트 아이디/암호 보호.
- staging에서 TEST ID 4개 필수, 중복 및 운영 ID 사용 차단. Sheets 실패 시 SQLite 대체 저장 금지.
- 모든 페이지에 테스트 배너 및 브라우저 제목 표시.
- 테스트 환경 구축 외 업무 로직 결함은 별도 검수 보고서에 따른 후속 수정 대상이다.

## 로컬 설정

환경 파일은 저장소 밖 `../runtime-env.json`에 보관하며 커밋하지 않는다. 필드:
APP_ENV=staging, TEST_SPREADSHEET_ID, TEST_CONSUMABLES_MASTER_ID,
TEST_CONSUMABLES_OUTBOUND_ID, TEST_TONER_ID, GOOGLE_CREDENTIALS_FILE,
STAGING_ACCESS_USER, STAGING_ACCESS_PASSWORD(16자 이상).

원본 소스 백업은 상위 `.test-environment/backup-20260910-171432/`에 있다.
`source-working-tree.tar.gz`, `repository.bundle`, `sha256.json`, `git-status.txt`를 보관한다.
소스 압축은 비밀 키·실행 환경·데이터 폴더를 제외하며, 원본 파일은 유지한다.
Git bundle에는 기존 저장소 이력이 들어 있으므로 비공개 보관한다.

## 검증과 배포

1. `python -m unittest discover -s tests -v`
2. 프론트엔드 `npm ci --include=dev && npm run build`
3. staging 환경변수로 로컬 서버 실행 후 인증 및 주요 API 확인
4. 테스트 브랜치에 필요한 소스만 commit/push
5. `./deploy.sh test /절대경로/runtime-env.json`

배포 스크립트는 GitHub에서 현재 테스트 브랜치를 clone하고 로컬 HEAD와 일치하는지 검사한다.
운영 서비스명은 배포 대상으로 허용하지 않는다. 서비스 계정 키는 임시 권한 제한 환경 파일로 전달하며 로그/명령 인자에 본문을 출력하지 않는다.
테스트 서버는 최대 인스턴스 1, 동시 요청 1로 시작한다. 이는 시험 운용 범위를 좁힌 설정이며 기존 업무 로직의 동시성 결함을 근본 해결한 것은 아니다.

운영 반영은 이 브랜치를 main에 일괄 병합하지 말고, 검증된 변경만 검토해 반영한다.
특히 테스트 전용 deploy.sh를 운영 배포 스크립트에 덮어쓰지 않는다.
