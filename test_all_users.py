import requests
import pandas as pd

def test():
    res = requests.get('https://asset-info-1015498761413.asia-northeast3.run.app/api/assets/dashboard/integrated')
    # wait, this is from the live DB. I need local DB.
