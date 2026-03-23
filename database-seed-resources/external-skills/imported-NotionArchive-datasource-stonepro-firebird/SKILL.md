---
name: datasource-stonepro-firebird
description: Use this skill when working with the StonePro ERP system, Firebird SQL database, fdb/firebirdsql drivers, DOC_HEADER/DOC_ITEMS/INVENTORY tables, job-to-StonePro mapping, or the stonepro_service. Covers all key Firebird table schemas, column definitions, status codes, and the relationship between StonePro data and Notion jobs.
---

# Datasource: StonePro (Firebird SQL)

StonePro is the stone fabrication ERP system. The NotionArchive project has **read-only** access to its Firebird SQL database for data mapping and cross-referencing.

## Connection Details

| Setting | Typical Value |
|---------|---------------|
| Host | `localhost` or network host |
| Port | `3050` (default Firebird) |
| Database path | `C:\StonePro\DATA\STONEPRO.FDB` |
| User | `SYSDBA` |
| Password | Configured in env |
| Charset | `UTF8` |
| Driver | `fdb` or `firebirdsql` (Python) |

Connection factory: `stonepro_service/database.py`

## Key Tables

### `DOC_HEADER` — Job/Document Master

The primary jobs table. Each row is a document (quote, order, invoice).

| Column | Type | Description |
|--------|------|-------------|
| `DOC_ID` | `INTEGER` | Primary key (auto-increment) |
| `DOC_NUMBER` | `VARCHAR(20)` | Document number (maps to Notion job number) |
| `DOC_TYPE` | `SMALLINT` | Document type code |
| `DOC_STATUS` | `SMALLINT` | Status code (see lookup below) |
| `DOC_DATE` | `DATE` | Document creation date |
| `DUE_DATE` | `DATE` | Due/delivery date |
| `CUSTOMER_ID` | `INTEGER` | FK → CUSTOMERS |
| `CUSTOMER_NAME` | `VARCHAR(100)` | Denormalized customer name |
| `CUSTOMER_ADDRESS` | `VARCHAR(200)` | Denormalized address |
| `CUSTOMER_PHONE` | `VARCHAR(30)` | Denormalized phone |
| `CONTACT_NAME` | `VARCHAR(100)` | Contact person |
| `SITE_ADDRESS` | `VARCHAR(200)` | Installation/delivery site |
| `SUBURB` | `VARCHAR(50)` | Suburb |
| `POSTCODE` | `VARCHAR(10)` | Postcode |
| `STATE` | `VARCHAR(5)` | State code |
| `NOTES` | `BLOB SUB_TYPE TEXT` | Free text notes |
| `INTERNAL_NOTES` | `BLOB SUB_TYPE TEXT` | Internal notes |
| `TOTAL_EXCL` | `NUMERIC(15,2)` | Total excl. GST |
| `TOTAL_INCL` | `NUMERIC(15,2)` | Total incl. GST |
| `GST_AMOUNT` | `NUMERIC(15,2)` | GST amount |
| `DEPOSIT_AMOUNT` | `NUMERIC(15,2)` | Deposit paid |
| `BALANCE_DUE` | `NUMERIC(15,2)` | Remaining balance |
| `SALES_REP` | `VARCHAR(50)` | Sales representative |
| `CREATED_BY` | `VARCHAR(50)` | Creator username |
| `CREATED_DATE` | `TIMESTAMP` | Creation timestamp |
| `MODIFIED_BY` | `VARCHAR(50)` | Last modifier |
| `MODIFIED_DATE` | `TIMESTAMP` | Last modification |
| `REF_NUMBER` | `VARCHAR(50)` | External reference |
| `QUOTE_ID` | `INTEGER` | FK to original quote |
| `ORDER_ID` | `INTEGER` | FK to related order |
| `INVOICE_ID` | `INTEGER` | FK to related invoice |
| `PRIORITY` | `SMALLINT` | Priority level |
| `COLOUR` | `VARCHAR(100)` | Primary material colour |

### `DOC_ITEMS` — Document Line Items

Individual items/pieces within a document.

| Column | Type | Description |
|--------|------|-------------|
| `ITEM_ID` | `INTEGER` | Primary key |
| `DOC_ID` | `INTEGER` | FK → DOC_HEADER |
| `LINE_NUMBER` | `SMALLINT` | Line ordering |
| `DESCRIPTION` | `VARCHAR(500)` | Item description |
| `MATERIAL_ID` | `INTEGER` | FK → MATERIALS |
| `MATERIAL_NAME` | `VARCHAR(100)` | Denormalized material |
| `LENGTH` | `NUMERIC(10,2)` | mm |
| `WIDTH` | `NUMERIC(10,2)` | mm |
| `THICKNESS` | `NUMERIC(10,2)` | mm |
| `QUANTITY` | `NUMERIC(10,2)` | Count |
| `AREA` | `NUMERIC(10,4)` | m² |
| `UNIT_PRICE` | `NUMERIC(15,2)` | Price per unit |
| `LINE_TOTAL` | `NUMERIC(15,2)` | Extended total |
| `EDGE_PROFILE` | `VARCHAR(50)` | Edge type |
| `CUTOUT_DETAILS` | `VARCHAR(500)` | Cutout specifications |

### `INVENTORY` — Stone Slab Inventory

Raw stone inventory tracking.

| Column | Type | Description |
|--------|------|-------------|
| `INVENTORY_ID` | `INTEGER` | Primary key |
| `MATERIAL_ID` | `INTEGER` | FK → MATERIALS |
| `MATERIAL_NAME` | `VARCHAR(100)` | Material name |
| `COLOUR` | `VARCHAR(100)` | Colour name |
| `SUPPLIER_ID` | `INTEGER` | FK → SUPPLIERS |
| `SUPPLIER_NAME` | `VARCHAR(100)` | Denormalized supplier |
| `LOT_NUMBER` | `VARCHAR(50)` | Lot/batch number |
| `BUNDLE_NUMBER` | `VARCHAR(50)` | Bundle identifier |
| `SLAB_NUMBER` | `VARCHAR(20)` | Slab ID within bundle |
| `LENGTH` | `NUMERIC(10,2)` | mm |
| `WIDTH` | `NUMERIC(10,2)` | mm |
| `THICKNESS` | `NUMERIC(10,2)` | mm |
| `AREA` | `NUMERIC(10,4)` | m² |
| `STATUS` | `SMALLINT` | Available/Reserved/Used |
| `LOCATION` | `VARCHAR(50)` | Warehouse location |
| `PURCHASE_PRICE` | `NUMERIC(15,2)` | Cost |
| `PURCHASE_DATE` | `DATE` | Received date |
| `PURCHASE_ORDER` | `VARCHAR(30)` | PO number |
| `RESERVED_FOR` | `INTEGER` | FK → DOC_HEADER (if reserved) |
| `USED_IN` | `INTEGER` | FK → DOC_HEADER (if consumed) |
| `NOTES` | `BLOB SUB_TYPE TEXT` | Notes |
| `CREATED_DATE` | `TIMESTAMP` | Entry date |
| `MODIFIED_DATE` | `TIMESTAMP` | Last modified |
| `BARCODE` | `VARCHAR(50)` | Barcode value |
| `BIN_LOCATION` | `VARCHAR(20)` | Bin code |
| `QUALITY_GRADE` | `VARCHAR(10)` | Quality rating |
| `IMAGE_PATH` | `VARCHAR(500)` | Photo file path |

### `CUSTOMERS` — Customer Records

| Column | Type | Description |
|--------|------|-------------|
| `CUSTOMER_ID` | `INTEGER` | Primary key |
| `COMPANY_NAME` | `VARCHAR(100)` | Business name |
| `FIRST_NAME` | `VARCHAR(50)` | Contact first name |
| `LAST_NAME` | `VARCHAR(50)` | Contact last name |
| `EMAIL` | `VARCHAR(100)` | Email address |
| `PHONE` | `VARCHAR(30)` | Phone number |
| `MOBILE` | `VARCHAR(30)` | Mobile number |
| `ADDRESS` | `VARCHAR(200)` | Street address |
| `SUBURB` | `VARCHAR(50)` | Suburb |
| `POSTCODE` | `VARCHAR(10)` | Postcode |
| `STATE` | `VARCHAR(5)` | State code |
| `ABN` | `VARCHAR(20)` | Business number |
| `NOTES` | `BLOB SUB_TYPE TEXT` | Notes |

### `MATERIALS` — Material Catalogue

| Column | Type | Description |
|--------|------|-------------|
| `MATERIAL_ID` | `INTEGER` | Primary key |
| `MATERIAL_NAME` | `VARCHAR(100)` | Material name |
| `MATERIAL_TYPE` | `VARCHAR(50)` | Natural/Engineered/Porcelain |
| `COLOUR` | `VARCHAR(100)` | Colour name |
| `SUPPLIER_ID` | `INTEGER` | FK → SUPPLIERS |
| `THICKNESS` | `NUMERIC(10,2)` | Default thickness (mm) |
| `UNIT_PRICE` | `NUMERIC(15,2)` | Default price |
| `ACTIVE` | `SMALLINT` | 1=active, 0=discontinued |

## `DOC_STATUS` Lookup

| Code | Meaning |
|------|---------|
| 0 | Draft |
| 1 | Quote |
| 2 | Order |
| 3 | In Production |
| 4 | Ready for Delivery |
| 5 | Delivered |
| 6 | Invoiced |
| 7 | Completed |
| 8 | Cancelled |
| 9 | On Hold |

## Field Mapping Configuration

StonePro ↔ Notion field mappings are configured in JSON files under `stonepro_service/mappings/`. The key mapping file is `stonepro_service/mappings/field_mappings.json` which defines how StonePro columns map to Notion properties.

## Python Models

- `stonepro_service/models/document.py` — `Document`, `DocumentItem`
- `stonepro_service/models/inventory.py` — `InventoryItem`, `SlabRecord`
- `stonepro_service/models/customer.py` — `Customer`

## Important Notes

- **Read-only access**: The system never writes to StonePro
- **Firebird-specific SQL**: Uses `FIRST n` instead of `TOP n`, generators instead of sequences, `BLOB SUB_TYPE TEXT` for large strings
- **Character encoding**: Always connect with `charset=UTF8`
- **Connection pooling**: Firebird has limited connection capacity; use connection pooling via `stonepro_service/database.py`
