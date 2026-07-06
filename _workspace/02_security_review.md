# 보안 리뷰

## 리뷰 개요
- **보안 수준 평가**: 🔴 취약 (자격증명 유출 및 하드코딩 발견)
- **총 발견 수**: Critical 1 / High 1 / Medium 1 / Low 1

## 취약점 발견 사항

### 🔴 Critical
1. **[data/st-asset-project-8000c6bb9905.json]** — 구글 서비스 계정 키 파일 Git 커밋 유출 (CWE-522 / A07:2021-인증 실패)
   - **취약점**: GCP 서비스 계정의 비공개 키가 포함된 JSON 자격증명 파일이 로컬 디렉토리에 생성되어 있으며, 이것이 `.gitignore`에 등록되지 않아 Git 레포지토리에 그대로 커밋되었습니다.
   - **공격 시나리오**:
       공격자가 깃허브 저장소(퍼블릭인 경우) 또는 유출된 소스코드를 통해 해당 JSON 파일을 획득하면,
       자산 데이터가 저장된 Google Sheets뿐만 아니라 `st-asset-project` 구글 클라우드 프로젝트 전체의 권한을 얻어 자산을 마음대로 조회, 수정 및 파괴할 수 있으며 클라우드 비용을 발생시킬 수 있습니다.
   - **현재 코드 (`config.py:76`)**:
     ```python
     GOOGLE_CREDENTIALS_FILE = "data/st-asset-project-8000c6bb9905.json"
     ```
   - **안전한 조치**:
     1. **[즉시 실행]** Google Cloud Console의 IAM 서비스 계정 메뉴로 이동하여 유출된 키(`8000c6bb9905baeeaa3fec81c7882f966a752a7e`)를 **즉시 삭제/폐기**하십시오.
     2. `.gitignore` 파일에 `data/*.json` 또는 해당 파일명을 추가하여 다시는 커밋되지 않도록 하십시오.
     3. 로컬 개발 환경에서는 환경변수 파일(`.env.development` - 이미 `.gitignore`에 등록됨)에 `GOOGLE_CREDENTIALS_JSON` 변수를 추가하여 JSON 문자열 형태로 인증정보를 주입하도록 통일하십시오.
   - **CVSS**: 9.8 (Critical) / **악용 난이도**: 낮음

### 🟡 High / Medium
1. **[config.py:35-38]** — 운영(PROD) Google Spreadsheet ID 하드코딩 (A05:2021-보안 설정 오류)
   - **취약점**: 운영 환경에서 사용하는 실제 구글 스프레드시트의 고유 ID가 코드 상에 하드코딩되어 있습니다.
   - **공격 시나리오**:
       구글 시트의 공유 설정이 실수로 "링크가 있는 모든 사용자에게 공개" 등으로 열려 있을 경우,
       공격자가 코드에서 획득한 `_PROD_SPREADSHEET_ID`를 이용하여 인증 없이 브라우저로 사내 임직원 자산 정보에 접근하거나 이를 수정할 수 있습니다.
   - **현재 코드**:
     ```python
     _PROD_SPREADSHEET_ID                  = "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g"
     ```
   - **안전한 코드**:
     스프레드시트 ID도 환경 변수로 분리하여 배포 시점에 주입하도록 처리해야 합니다.
     ```python
     _PROD_SPREADSHEET_ID = os.environ.get("PROD_SPREADSHEET_ID", "기본값_또는_오류처리")
     ```
   - **CVSS**: 5.3 (Medium) / **악용 난이도**: 중간

2. **[backend/services/consumables_service.py:144]** — 예외 객체 직접 출력을 통한 정보 노출 가능성 (A09:2021-보안 로깅 및 모니터링 실패)
   - **취약점**: API 연결 예외 발생 시, 구체적인 예외 객체(`e`)를 그대로 화면에 출력하거나 로깅하고 있습니다.
   - **공격 시나리오**:
       구글 API 호출 라이브러리 내부에서 예외 발생 시 시스템 경로, 라이브러리 버전, 혹은 인증 토큰의 일부가 예외 메시지(`e`)에 포함될 수 있으며,
       이것이 표준 출력이나 디버그 로그에 노출되어 공격자에게 시스템 환경에 대한 단서를 제공할 수 있습니다.
   - **현재 코드**:
     ```python
     except Exception as e:
         print(f"⚠️  소모품 Google Sheets 연결 오류 (ID: {spreadsheet_id}): {e}")
     ```
   - **안전한 코드**:
     `sheets_service.py`와 같이 예외의 상세 내용을 필터링하고 안전한 디버깅 메시지만 출력하도록 변경합니다.
     ```python
     except Exception:
         logger.error("Google Sheets 연결 오류 — 환경변수/파일 설정 확인 필요")
     ```
   - **CVSS**: 3.3 (Low) / **악용 난이도**: 높음

## OWASP Top 10 매핑
| 카테고리 | 상태 | 발견 수 | 비고 |
|---------|------|--------|------|
| A01 접근 제어 | ✅ 양호 | 0 | |
| A02 암호화 실패 | ✅ 양호 | 0 | |
| A03 인젝션 | ⚠️ 주의 | 0 | SQLite 테이블 바인딩 체크 완료 |
| A04 안전하지 않은 설계 | ✅ 양호 | 0 | |
| A05 보안 설정 오류 | ❌ 취약 | 1 | 운영 시트 ID 코드 내 노출 |
| A06 취약한 컴포넌트 | ✅ 양호 | 0 | |
| A07 인증 실패 | ❌ 취약 | 1 | 서비스 계정 키 Git 유출 (Critical) |
| A08 데이터 무결성 | ✅ 양호 | 0 | |
| A09 로깅/모니터링 부족| ⚠️ 주의 | 1 | 예외 메시지 직접 노출 가능성 |
| A10 SSRF | ✅ 양호 | 0 | |

## 보안 강화 권고
1. **유출 키 무효화**: 유출된 구글 서비스 계정 키는 1순위로 즉시 폐기해야 합니다.
2. **Secrets Manager 도입**: 로컬 개발 환경은 `.env.development`로 보호하되, 클라우드(운영) 배포 시에는 AWS Secrets Manager 또는 GCP Secret Manager를 연동하거나 컨테이너 환경 변수로 주입하십시오.
