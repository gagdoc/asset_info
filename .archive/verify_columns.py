from common.database import get_supabase_client
import pandas as pd

supabase = get_supabase_client()
if supabase:
    try:
        res = supabase.table("assets_lease").select("*").limit(1).execute()
        if res.data:
            print("Columns in Supabase:", res.data[0].keys())
        else:
            print("No data in table.")
    except Exception as e:
        print(f"Error: {e}")
else:
    print("No Supabase connection.")
