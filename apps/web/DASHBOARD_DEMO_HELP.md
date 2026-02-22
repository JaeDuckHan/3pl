# Dashboard Demo Help

## 1) Demo Mode
- 위치: `/dashboard` 및 하위 페이지 헤더의 `Demo Mode: ON/OFF` 버튼
- 동작:
  - `ON`: 데모 배너 표시, 데모 액션 버튼 표시, 페이지별 데모 프리셋 자동 적용
  - `OFF`: 데모 배너/데모 액션 숨김
- 저장:
  - `localStorage`: `dashboard_demo_mode` (`"1"` / `"0"`)
  - 대시보드 URL: `?demo=1` 동기화
- 로드 우선순위: `URL demo` > `localStorage` > `false`

## 2) 페이지별 Demo 프리셋
- Storage Trend:
  - 명시 필터가 없으면 최근 7일(`from/to`) 자동 설정 후 로드
- Storage Billing:
  - 명시 필터가 없으면 이번 달(`month`) 자동 설정 후 로드
- Capacity:
  - 명시 필터가 없으면 `date` 비움 상태로 자동 로드

## 3) Export 기능
- 공통:
  - `CSV export`: CSV 다운로드
  - `Copy table`: TSV 복사 (엑셀/시트 붙여넣기 최적화)
  - `Save PNG`: 페이지별 지정 캡처 영역 PNG 저장
- 파일명 규칙:
  - Trend: `trend_YYYY-MM-DD_to_YYYY-MM-DD.png`
  - Billing: `billing_YYYY-MM.png`
  - Capacity: `capacity_YYYY-MM-DD.png` (없으면 `today`)

## 4) 로딩/오류/토스트
- 로딩:
  - 카드: `CardsSkeleton`
  - 테이블: `TableSkeleton(rows, cols)`
- 오류:
  - `ErrorState` + `Retry` 버튼으로 동일 요청 재시도
- 토스트:
  - 성공/실패 메시지 공통 래퍼 사용 (`features/dashboard/toast.ts`)
  - 복사/PNG/스냅샷/로드 오류 피드백 통일

## 5) 빠른 점검 체크리스트
1. Demo Mode ON 후 3개 페이지 모두 배너 표시되는지 확인
2. Trend/Billing/Capacity 진입 시 데모 프리셋 자동 적용 확인
3. 각 페이지 `Copy table` 붙여넣기 확인
4. 각 페이지 `Save PNG` 저장 확인
5. Demo Mode OFF 후 데모 액션 숨김 확인
