#!/usr/bin/env python3
"""Fix assets.py: preserve email case, use _email_key for merging"""

with open('backend/routers/assets.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix line 109: remove .str.lower() and add _email_key
old1 = '''    # Filter valid emails
    if "email" in view_df.columns:
        view_df["email"] = view_df["email"].astype(str).str.strip().str.lower()
        view_df = view_df[~view_df["email"].isin(["nan", "", "none", "null"])]
    else:
        return []'''

new1 = '''    # Filter valid emails (원본 대소문자 보존)
    if "email" in view_df.columns:
        view_df["email"] = view_df["email"].astype(str).str.strip()
        view_df = view_df[~view_df["email"].str.lower().isin(["nan", "", "none", "null"])]
        view_df["_email_key"] = view_df["email"].str.lower()
    else:
        return []'''

# 2. Fix _group_asset helper to use _email_key
old2 = '''    # Helper: Group by email and join values with duplicate marker
    def _group_asset(df, email_col, val_col, target_key):
        if df.empty or email_col not in df.columns or val_col not in df.columns:
            return pd.DataFrame(columns=["email", target_key])
        
        subset = df[[email_col, val_col]].dropna().copy()
        subset["email"] = subset["email"].astype(str).str.strip().str.lower()
        subset[val_col] = subset[val_col].astype(str).str.strip()
        
        # Filter out invalid values
        subset = subset[~subset[val_col].isin(["", "-", "nan", "None", "null"])]
        if subset.empty:
            return pd.DataFrame(columns=["email", target_key])

        # Group and Join
        def _join_logic(x):
            unique_vals = sorted(list(set(x)))
            if not unique_vals: return "-"
            prefix = "[중복!] " if len(unique_vals) > 1 else ""
            return prefix + ", ".join(unique_vals)

        grouped = subset.groupby("email")[val_col].apply(_join_logic).reset_index()
        return grouped.rename(columns={val_col: target_key})'''

new2 = '''    # Helper: Group by email and join values with duplicate marker
    def _group_asset(df, email_col, val_col, target_key):
        if df.empty or email_col not in df.columns or val_col not in df.columns:
            return pd.DataFrame(columns=["_email_key", target_key])
        
        subset = df[[email_col, val_col]].dropna().copy()
        subset["_email_key"] = subset[email_col].astype(str).str.strip().str.lower()
        subset[val_col] = subset[val_col].astype(str).str.strip()
        
        # Filter out invalid values
        subset = subset[~subset[val_col].isin(["", "-", "nan", "None", "null"])]
        if subset.empty:
            return pd.DataFrame(columns=["_email_key", target_key])

        # Group and Join
        def _join_logic(x):
            unique_vals = sorted(list(set(x)))
            if not unique_vals: return "-"
            prefix = "[중복!] " if len(unique_vals) > 1 else ""
            return prefix + ", ".join(unique_vals)

        grouped = subset.groupby("_email_key")[val_col].apply(_join_logic).reset_index()
        return grouped.rename(columns={val_col: target_key})'''

# 3. Fix all merge calls: on="email" -> on="_email_key"
old_merge = 'on="email", how="left"'
new_merge = 'on="_email_key", how="left"'

# 4. Fix Resign section
old_resign = '            r_sub["email"] = r_sub["email"].astype(str).str.strip().str.lower()'
new_resign = '            r_sub["_email_key"] = r_sub["email"].astype(str).str.strip().str.lower()'

old_resign2 = '            r_sub = r_sub[["email", "퇴사정보"]].drop_duplicates("email")'
new_resign2 = '            r_sub = r_sub[["_email_key", "퇴사정보"]].drop_duplicates("_email_key")'

# 5. Add cleanup of _email_key before returning
old_fill = '    # Fill missing cols and handle NaNs'
new_fill = '''    # 임시 병합 키 제거
    if "_email_key" in view_df.columns:
        view_df.drop(columns=["_email_key"], inplace=True)

    # Fill missing cols and handle NaNs'''

# Apply replacements
replacements = [
    (old1, new1, "Filter emails"),
    (old2, new2, "Group asset helper"),
    (old_merge, new_merge, "Merge keys"),
    (old_resign, new_resign, "Resign email key"),
    (old_resign2, new_resign2, "Resign dedup"),
    (old_fill, new_fill, "Cleanup _email_key"),
]

for old, new, label in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"  OK: {label}")
    else:
        print(f"  SKIP: {label} (not found)")

with open('backend/routers/assets.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone! Verifying syntax...")
import py_compile
try:
    py_compile.compile('backend/routers/assets.py', doraise=True)
    print("  Syntax OK!")
except py_compile.PyCompileError as e:
    print(f"  Syntax ERROR: {e}")
