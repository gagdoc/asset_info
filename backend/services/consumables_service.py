from backend.services.database import get_connection, CONSUMABLES_DB_FILE
import pandas as pd
import sqlite3
from datetime import datetime

def get_items(year=None, month=None):
    conn = get_connection(CONSUMABLES_DB_FILE)
    query = "SELECT * FROM items"
    params = []
    conditions = []
    
    if year:
        conditions.append("year = ?")
        params.append(year)
    if month:
        conditions.append("month = ?")
        params.append(month)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    try:
        df = pd.read_sql(query, conn, params=params)
    except:
        df = pd.DataFrame()
    finally:
        conn.close()
        
    return df.to_dict(orient="records")

def add_item(item_data):
    # item_data: dict
    conn = get_connection(CONSUMABLES_DB_FILE)
    c = conn.cursor()
    try:
        # Check if exists
        c.execute("""
            SELECT id FROM items 
            WHERE year=? AND month=? AND item_name=?
        """, (item_data['year'], item_data['month'], item_data['item_name']))
        existing = c.fetchone()
        
        if existing:
            # Update
            c.execute("""
                UPDATE items 
                SET category=?, unit_price=?, current_qty=?, fixed_qty=?, is_essential=?
                WHERE id=?
            """, (
                item_data.get('category'),
                item_data.get('unit_price'),
                item_data.get('current_qty'),
                item_data.get('fixed_qty'),
                item_data.get('is_essential'),
                existing[0]
            ))
        else:
            # Insert
            c.execute("""
                INSERT INTO items (year, month, category, item_name, unit_price, current_qty, fixed_qty, is_essential)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item_data.get('year'),
                item_data.get('month'),
                item_data.get('category'),
                item_data.get('item_name'),
                item_data.get('unit_price'),
                item_data.get('current_qty'),
                item_data.get('fixed_qty'),
                item_data.get('is_essential')
            ))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error adding item: {e}")
        return False
    finally:
        conn.close()

def get_outbound_history():
    conn = get_connection(CONSUMABLES_DB_FILE)
    try:
        df = pd.read_sql("SELECT * FROM outbound ORDER BY date DESC", conn)
    except:
        df = pd.DataFrame()
    finally:
        conn.close()
    return df.to_dict(orient="records")

def add_outbound(data):
    conn = get_connection(CONSUMABLES_DB_FILE)
    c = conn.cursor()
    try:
        c.execute("""
            INSERT INTO outbound (date, year, month, item_name, quantity, unit_price, total_price, user_name, department, estimate_year, estimate_month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get('date'),
            data.get('year'),
            data.get('month'),
            data.get('item_name'),
            data.get('quantity'),
            data.get('unit_price'),
            data.get('total_price'),
            data.get('user_name'),
            data.get('department'),
            data.get('estimate_year'),
            data.get('estimate_month')
        ))
        
        # Update stock in items table
        # We need to find the matching item for the estimate_year/month or current?
        # Typically stock is deducted from the current inventory.
        # Logic says: update 'current_qty' in 'items' table for that item.
        # Assuming items table has row for estimate_year/month? Or just generic?
        # In this system, items are per month/year.
        
        c.execute("""
            UPDATE items
            SET current_qty = current_qty - ?
            WHERE item_name = ? AND year = ? AND month = ?
        """, (data.get('quantity'), data.get('item_name'), data.get('estimate_year'), data.get('estimate_month')))
        
        conn.commit()
        return True
    except Exception as e:
        print(f"Error adding outbound: {e}")
        return False
    finally:
        conn.close()
