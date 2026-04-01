import os
import sys
import asyncio
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.routers.assets import get_dashboard_integrated

async def main():
    print("Fetching dashboard integrated data...")
    res = get_dashboard_integrated()
    print("Total rows:", len(res))
    if len(res) > 0:
        print("Sample row:", res[0])
        # Find a row where TeamsNum is not '-'
        for row in res:
            if row.get("TeamsNum", "-") != "-":
                print("Found Teams data:", row)
                break
        
        # Find a row where Printer is not '-'
        for row in res:
            if row.get("Printer", "-") != "-":
                print("Found Printer data:", row)
                break

if __name__ == "__main__":
    asyncio.run(main())
