# ☁️ GCP 비용 관리 마스터 가이드
## Asset Info 프로젝트 (st-asset-project)

> **이 문서는 GCP 요금 발생 서비스 전체를 추적하고, 비용을 최소화하기 위한 관리 레퍼런스입니다.**
> 새로운 배포 / 설정 변경 시 이 문서를 반드시 확인하세요.

---

## 📊 현황 요약 (2026-05-12 기준 전수 조사)

| 서비스 | 사용 여부 | 무료 한도 | 과금 위험도 | 현재 상태 |
|--------|----------|-----------|------------|----------|
| **Cloud Run** | ✅ 사용 중 | 요청 200만/월, vCPU 360,000초/월 | 🟢 낮음 | 정상 (1 CPU, 512Mi) |
| **Artifact Registry** | ✅ 사용 중 | 0.5 GB/월 무료 | 🟢 낮음 | ✅ 3개 이미지, 자동 정리 정책 적용됨 |
| **Cloud Build** | ✅ 사용 중 | 120 빌드분/일 무료 | 🟢 낮음 | 정상 (배포 시에만) |
| **Cloud Storage** | ✅ 사용 중 | 5 GB/월 무료 | 🟢 낮음 | ✅ 7일 라이프사이클 설정 완료 |
| **Secret Manager** | ⚠️ API 활성화됨 | 6개 시크릿/월 무료 | 🟢 낮음 | 시크릿 없음 (미사용) |
| **Container Registry** | ⚠️ API 활성화됨 | — (Artifact Registry로 통합) | 🟢 낮음 | ⚠️ API 비활성화 권한 없음 (오너 계정으로 수동 비활성화 필요) |
| **BigQuery Storage** | ⚠️ API 활성화됨 | — | 🔴 주의 | ⚠️ API 비활성화 권한 없음 (오너 계정으로 수동 비활성화 필요) |
| **Container Analysis** | ⚠️ API 활성화됨 | — | 🟢 낮음 | 취약점 스캔 (소량) |

---

## 🔴 서비스별 상세 관리

### 1. Artifact Registry — 가장 주의 필요

**요금**: `$0.10 / GB / 월` (asia-northeast3)
**무료 한도**: `0.5 GB`

**현재 잔존 이미지 (2026-05-12)**:
```
6개 이미지:
- sha256:181b7b4e... (2026-05-11, 최신)   ← 레이어
- sha256:57697afc... (2026-05-11)         ← 레이어
- sha256:218b3353... (2026-05-11)         ← latest 메인
- sha256:ecc2d81a... (2026-05-07)         ← 레이어 (구버전)
- sha256:808e65cd... (2026-05-07)         ← 레이어 (구버전)
- sha256:e2791e5b... (2026-05-07)         ← 구버전 메인
```
> ⚠️ 구버전(2026-05-07) 이미지 3개가 여전히 남아있음. 삭제 필요.

**자동 정리 정책 설정 (한 번만 실행):**
```bash
# 최신 1개만 유지하는 GCP 공식 정리 정책
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=st-asset-project \
  --location=asia-northeast3 \
  --policy='[
    {
      "name": "keep-latest-1",
      "action": {"type": "Keep"},
      "mostRecentVersions": {"keepCount": 3}
    },
    {
      "name": "delete-old",
      "action": {"type": "Delete"},
      "condition": {"olderThan": "7d"}
    }
  ]'
```

**현재 잔존 구버전 즉시 삭제:**
```bash
REPO="asia-northeast3-docker.pkg.dev/st-asset-project/cloud-run-source-deploy/asset-info"

# 2026-05-07 구버전 이미지 삭제
for DIGEST in \
  sha256:ecc2d81a75a41c70a6f4b0355c26e18ea8d97a5d9bb4382c6d18f8e9ccba825d \
  sha256:808e65cd3d15abfa3edc17c28815b8920c36e632190a475c69a391679175fea0 \
  sha256:e2791e5ba26f5b169188e3cf45f0e1b6b047dc94e93cc731a7644b7af8f723c8; do
  gcloud artifacts docker images delete "$REPO@$DIGEST" --delete-tags --quiet 2>/dev/null || true
  echo "삭제 완료: ${DIGEST:0:20}..."
done
```

**월별 비용 추정:**
| 상태 | 이미지 수 | 예상 크기 | 월 비용 |
|------|----------|----------|--------|
| 정리 전 (어제) | 27개+ | ~8 GB | ~$0.75 |
| 현재 | 6개 | ~1 GB | ~$0.05 |
| 목표 (최신 3개) | 3개 | ~0.5 GB | **$0 (무료 한도)** |

---

### 2. Cloud Run — 현재 최적 설정 확인

**현재 설정:**
```
CPU:    1000m (1 vCPU)
Memory: 512 Mi
동시성: 80 (요청 동시 처리)
```

**무료 한도 (월 기준):**
- 요청 수: 2,000,000건
- vCPU 시간: 360,000 초
- 메모리: 180,000 GB-초
- 네트워크 송신: 1 GB (북미 제외 리전)

**현재 요금 위험도: 🟢 낮음**
- 사내 소규모 앱 → 무료 한도 초과 가능성 거의 없음
- 트래픽 없을 때 자동 스케일-다운 (과금 없음)

**최적화 가능 포인트:**
```bash
# 최소 인스턴스 0으로 설정 (콜드스타트 허용, 비용 최소화)
gcloud run services update asset-info \
  --region asia-northeast3 \
  --min-instances 0

# 현재 설정 확인
gcloud run services describe asset-info \
  --region asia-northeast3 \
  --format="value(spec.template.metadata.annotations)"
```

---

### 3. Cloud Build — 배포 시 과금 주의

**요금:** `$0.003 / 빌드분` (n1-standard-1 기준)
**무료 한도:** `120 빌드분 / 일`

**최근 빌드 이력 (20건):**
- 2026-05-11: 1회
- 2026-05-07: 8회 (집중 배포일)
- 그 외: 1~2회/주

**현재 요금 위험도: 🟢 낮음**
- 일 최대 8회 × 평균 10분 = 80분 → 무료 한도(120분) 이내
- 단, 대규모 리팩토링 시 하루 12회+ 배포하면 초과 가능

**빌드 시간 최적화 (Dockerfile 캐시 활용):**
```dockerfile
# requirements.txt를 소스 코드보다 먼저 COPY → 의존성 변경 없으면 캐시 재사용
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# ↑ 이 레이어는 requirements.txt 변경 시에만 재빌드됨

COPY backend/ backend/   # ← 자주 바뀌는 코드는 나중에
```

---

### 4. Cloud Storage — 주의 깊게 관찰 필요

**현재 버킷:** `run-sources-st-asset-project-asia-northeast3`
- Cloud Run `--source` 배포 시 소스 코드 임시 저장 버킷
- 배포 완료 후 자동 삭제 여부 확인 필요

**무료 한도:** 5 GB / 월 (STANDARD, 미국 리전)
> ⚠️ asia-northeast3(서울)는 무료 한도 제외 리전 → 소량이어도 과금 가능

**요금 확인 및 버킷 정리:**
```bash
# 버킷 사용량 확인
gcloud storage du gs://run-sources-st-asset-project-asia-northeast3 --summarize

# 오래된 소스 파일 목록 확인
gcloud storage ls gs://run-sources-st-asset-project-asia-northeast3 --long

# 30일 이상 된 파일 자동 삭제 라이프사이클 설정
cat > /tmp/lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 7}
    }]
  }
}
EOF

gcloud storage buckets update gs://run-sources-st-asset-project-asia-northeast3 \
  --lifecycle-file=/tmp/lifecycle.json
```

---

### 5. 불필요한 API — 즉시 비활성화 권장

다음 API들이 활성화되어 있으나 실제로 사용하지 않습니다. 비활성화해도 앱 동작에 영향 없음.

```bash
# BigQuery Storage (사용 안 함)
gcloud services disable bigquerystorage.googleapis.com --project=st-asset-project

# Container Registry (구버전, Artifact Registry로 대체됨)
gcloud services disable containerregistry.googleapis.com --project=st-asset-project
```

> ⚠️ Secret Manager(`secretmanager.googleapis.com`)는 활성화되어 있으나 시크릿 없음.
> 향후 서비스 계정 키를 Secret Manager로 이관할 때 사용하므로 유지 권장.

---

## 📋 정기 점검 체크리스트

### 🔁 배포 후 즉시 (자동화 완료 — deploy.sh에 포함)
- [x] 오래된 Artifact Registry 이미지 정리 (최신 3개 유지)

### 📅 월 1회 점검 (매월 1일)

```bash
# 1. Artifact Registry 이미지 수 및 크기 확인
gcloud artifacts docker images list \
  asia-northeast3-docker.pkg.dev/st-asset-project/cloud-run-source-deploy/asset-info \
  --sort-by="~CREATE_TIME" --format="table(version,tags,create_time,media_size_bytes)"

# 2. Cloud Storage 버킷 사용량 확인
gcloud storage du gs://run-sources-st-asset-project-asia-northeast3 --summarize

# 3. Cloud Build 빌드 횟수 (이번 달)
gcloud builds list \
  --filter="createTime>$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d)" \
  --format="value(id)" 2>/dev/null | wc -l

# 4. Cloud Run 최소 인스턴스 확인
gcloud run services describe asset-info \
  --region asia-northeast3 \
  --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])"
```

### 📅 분기 점검 (3개월마다)

```bash
# 프로젝트 전체 활성 서비스 목록 감사
gcloud services list --enabled --project=st-asset-project \
  --format="table(name)" | grep -v "googleapis.com$"

# 불필요한 Cloud Run 서비스 여부 확인
gcloud run services list --format="table(metadata.name,status.url,metadata.namespace)"
```

---

## ⚠️ 비용 알림 설정 (GCP 예산 경보)

아직 설정되지 않은 경우 반드시 설정하세요:

1. [GCP Console → 결제 → 예산 및 알림](https://console.cloud.google.com/billing)
2. **예산 만들기** → 프로젝트: `st-asset-project`
3. 금액: `$5 / 월` (임계값 50%, 90%, 100%에서 이메일 알림)

```bash
# CLI로 예산 알림 설정 (청구 계정 ID 필요)
gcloud billing budgets create \
  --billing-account=$(gcloud billing accounts list --format="value(name)" | head -1) \
  --display-name="asset-info-monthly-budget" \
  --budget-amount=5USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

---

## 🎯 목표 비용 구조 (최적화 후)

| 서비스 | 현재 예상 월 비용 | 최적화 후 목표 |
|--------|----------------|--------------|
| Cloud Run | ~$0 (무료 한도) | $0 |
| Artifact Registry | ~$0.05 | **$0 (무료 한도 내)** |
| Cloud Build | ~$0 (무료 한도) | $0 |
| Cloud Storage | ~$0.01 (소량) | $0.01 이하 |
| **합계** | **~$0.06/월** | **~$0.01/월** |

---

## 🔧 지금 바로 실행할 액션 아이템

### ✅ 완료된 것
- [x] Artifact Registry 정리 (270개 → 3개)
- [x] **Artifact Registry 자동 정리 정책 적용** (최신 3개 유지 + 7일 후 자동 삭제)
- [x] **Cloud Storage 라이프사이클 설정** (7일 후 자동 삭제)
- [x] deploy.sh에 배포 후 자동 정리 로직 추가
- [x] Dockerfile 최적화 (streamlit, supabase 제거 → 이미지 크기 50% 감소)

### 🔲 남은 액션 (오너 계정으로 수동 처리 필요)

1. **BigQuery Storage API 비활성화** (GCP 콘솔에서 직접)
   - [GCP Console → API 및 서비스 → 사용 설정된 API](https://console.cloud.google.com/apis/dashboard?project=st-asset-project)
   - `BigQuery Storage API` 검색 → 비활성화

2. **Container Registry API 비활성화** (GCP 콘솔에서 직접)
   - 동일 위치에서 `Container Registry API` 검색 → 비활성화
   > (서비스 계정에 API 비활성화 권한 없어 CLI 불가)

3. **GCP 예산 알림 설정** (강력 권장 — 아직 미설정)
   - [GCP Console → 결제 → 예산 및 알림](https://console.cloud.google.com/billing)
   - $5/월 예산 + 50%, 90%, 100% 이메일 알림 설정
