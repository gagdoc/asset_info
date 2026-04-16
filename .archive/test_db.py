from backend.services.database import load_from_db
data = load_from_db()
if data is not None:
    print("All User row count:", len(data.get("All_User", [])))
