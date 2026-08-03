import sys

def patch():
    path = "backend/routers/assets.py"
    with open(path, "r") as f:
        content = f.read()
    
    new_func = """
@router.get("/dashboard/search-candidates")
def get_search_candidates():
    \"\"\"
    Returns a flat list of all unique users and asset owners across all tables.
    Includes active employees, resigned employees, STOCK, etc.
    \"\"\"
    dfs = load_from_db()
    candidates = []
    
    # 1. All_User
    if "All_User" in dfs and not dfs["All_User"].empty:
        df = dfs["All_User"].copy()
        for _, row in df.iterrows():
            email = str(row.get("email", "")).strip()
            name = str(row.get("이름", row.get("NAME", ""))).strip()
            if not email and not name: continue
            candidates.append({
                "이름": name,
                "email": email,
                "BU": str(row.get("BU", "")).strip(),
                "ROLE": str(row.get("ROLE", "")).strip(),
                "Lease_List": "",
                "Ipad_List": "",
                "Printer": "",
                "Monitor": "",
                "TeamsNum": ""
            })
            
    # Function to extract users from assets
    def extract_from_asset(df, name_cols, sn_cols, target_col):
        if df is None or df.empty: return
        for _, row in df.iterrows():
            name = ""
            for c in name_cols:
                if c in row and pd.notnull(row[c]):
                    name = str(row[c]).strip()
                    break
            
            email = str(row.get("email", "")).strip() if "email" in row and pd.notnull(row.get("email")) else ""
            
            if not name and not email: continue
            
            sn = ""
            for c in sn_cols:
                if c in row and pd.notnull(row[c]):
                    sn = str(row[c]).strip()
                    break
            
            candidates.append({
                "이름": name,
                "email": email,
                "BU": str(row.get("BU", "")).strip(),
                "ROLE": str(row.get("Role", row.get("ROLE", ""))).strip(),
                "Lease_List": sn if target_col == "Lease_List" else "",
                "Ipad_List": sn if target_col == "Ipad_List" else "",
                "Printer": sn if target_col == "Printer" else "",
                "Monitor": sn if target_col == "Monitor" else "",
                "TeamsNum": sn if target_col == "TeamsNum" else ""
            })

    extract_from_asset(dfs.get("Lease"), ["User"], ["S/N", "SNOW Tag"], "Lease_List")
    extract_from_asset(dfs.get("iPad"), ["User"], ["S/N", "Model"], "Ipad_List")
    extract_from_asset(dfs.get("Monitor"), ["User"], ["Model"], "Monitor")
    extract_from_asset(dfs.get("Printer"), ["User"], ["Model"], "Printer")
    extract_from_asset(dfs.get("Teams"), ["User"], ["TeamsNumber", "Number", "전화번호"], "TeamsNum")
    
    # Merge them by Name + Email
    merged = {}
    for c in candidates:
        key = (c["이름"].lower(), c["email"].lower())
        if key not in merged:
            merged[key] = {
                "이름": c["이름"],
                "email": c["email"],
                "BU": c["BU"],
                "ROLE": c["ROLE"],
                "Lease_List": set(),
                "Ipad_List": set(),
                "Printer": set(),
                "Monitor": set(),
                "TeamsNum": set()
            }
        
        for f in ["Lease_List", "Ipad_List", "Printer", "Monitor", "TeamsNum"]:
            if c[f]:
                merged[key][f].add(c[f])
                
        if c["BU"] and merged[key]["BU"] in ["", "-", "nan", "None"]:
            merged[key]["BU"] = c["BU"]
        if c["ROLE"] and merged[key]["ROLE"] in ["", "-", "nan", "None"]:
            merged[key]["ROLE"] = c["ROLE"]

    result = []
    for m in merged.values():
        res = {k: v for k, v in m.items() if k in ["이름", "email", "BU", "ROLE"]}
        for f in ["Lease_List", "Ipad_List", "Printer", "Monitor", "TeamsNum"]:
            res[f] = ", ".join(sorted(list(m[f]))) if m[f] else "-"
        result.append(res)
        
    return result
"""
    
    if "@router.get(\"/dashboard/search-candidates\")" in content:
        print("Already patched")
        return

    content = content.replace(
        '@router.post("/bulk-search")',
        new_func + '\n\n@router.post("/bulk-search")'
    )
    
    with open(path, "w") as f:
        f.write(content)
    print("Patched successfully")

if __name__ == "__main__":
    patch()
