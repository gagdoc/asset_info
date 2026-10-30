# ServiceNow State별 Substate 목록

In use: Staff, Contractor, Other.
In stock: Available, Reserved, Pending repair, Pending install, Pending disposal, Pending transfer, Legal hold, Termination hold.
미선택 항목은 유지한다. State 변경 시 유효한 Substate는 보존하고, 호환되지 않는 값은 초기화한다. In use 전환 시 기존 기본값 Staff를 유지한다.

검증: 프론트엔드 빌드, 상태별 목록 및 상태 전환 실행 검사 통과.
