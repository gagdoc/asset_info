with open('backend/services/consumables_service.py', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Restore _get_available_months_impl
if "def _get_available_months_impl():" not in text:
    target = """def _get_estimate_impl(month: str = None):
    _, ss = _get_consumables_client()
    if not ss: return []

    if month:
        months = [month]
    else:
        # 모든 월 시트 데이터 합산 시 '품목리스트'는 제외
        months = [ws.title for ws in ss.worksheets() if ws.title != "품목리스트"]
    return months"""
    
    restored = """def _get_available_months_impl():
    _, ss = _get_consumables_client()
    if not ss: return []
    # '품목리스트' 시트를 제외한 모든 시트 반환
    months = [ws.title for ws in ss.worksheets() if ws.title != "품목리스트"]
    return months"""
    
    text = text.replace(target, restored, 1)

# 2. Fix the original _get_estimate_impl around line 378
target2 = """def _get_estimate_impl(month: str = None):
    _, ss = _get_consumables_client()
    if not ss: return []

    if month:
        months = [month]
    else:
        months = [ws.title for ws in ss.worksheets() if ws.title.endswith("월")]"""

fixed2 = """def _get_estimate_impl(month: str = None):
    _, ss = _get_consumables_client()
    if not ss: return []

    if month:
        months = [month]
    else:
        months = [ws.title for ws in ss.worksheets() if ws.title != "품목리스트"]"""

if target2 in text:
    text = text.replace(target2, fixed2)

with open('backend/services/consumables_service.py', 'w', encoding='utf-8') as f:
    f.write(text)
