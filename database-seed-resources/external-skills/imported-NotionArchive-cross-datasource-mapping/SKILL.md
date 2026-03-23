---
name: cross-datasource-mapping
description: Use this skill when working on cross-datasource operations, mapping fields between Notion, NotionArchive MSSQL, and StonePro Firebird, understanding ID cross-references, or implementing sync/mapping logic between any two of the three datasources.
---

# Cross-Datasource Mapping

This skill documents how the same entities map across the three datasources: **Notion API**, **NotionArchive (MSSQL)**, and **StonePro (Firebird)**.

## Entity: Job / Production Order

| Field | Notion (Production DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|----------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_jobs.id` (int) | `DOC_HEADER.DOC_ID` |
| Notion ID | Page UUID | `notion_page_id` | — |
| Job number | `Job` (title) | `job_number` | `DOC_NUMBER` |
| Job name | `Job Name` (rich_text) | `job_name` | (derived from CUSTOMER_NAME + SITE_ADDRESS) |
| Status | `Status` (status) | `status` | `DOC_STATUS` (int code) |
| Install date | `Install Date` (formula → Install relation) | `install_date` (ISO string) | `DUE_DATE` |
| Customer | Relation → Customers DB | `customer_name` (denorm) | `CUSTOMER_ID` FK |
| Stone colour | Relation → Stone Colours DB | `stone_colour` (denorm) | `COLOUR` |
| Suburb | Rich text property | `suburb` | `SUBURB` |
| Folder path | `Folder in O: Drive` (rich_text) | `folder_path` | — |

## Entity: Piece

| Field | Notion (Pieces DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|-------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_pieces.id` | `DOC_ITEMS.ITEM_ID` |
| Piece number | `Piece No` (title) | `piece_no` | `LINE_NUMBER` + `DESCRIPTION` |
| Parent job | Relation → Production | `production_id` (FK) | `DOC_ID` (FK) |
| Material | Relation → Stone Colours | `stone_colour` | `MATERIAL_NAME` |
| Length | Number property | `length` (float) | `LENGTH` (NUMERIC) |
| Width | Number property | `width` (float) | `WIDTH` (NUMERIC) |
| Thickness | Number property | `thickness` (float) | `THICKNESS` (NUMERIC) |
| Area | Number property (m²) | `area` (float) | `AREA` (NUMERIC) |
| Edge profile | Multi-select | `edge_profile` (CSV) | `EDGE_PROFILE` |
| NC file | Rich text | `nc_file` | — |
| Machine | Select | `machine` | — |

## Entity: Slab

| Field | Notion (Slabs DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|-------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_slabs.id` | `INVENTORY.INVENTORY_ID` |
| Slab name | Title property | `slab_name` | `SLAB_NUMBER` |
| Stone colour | Relation → Stone Colours | `stone_colour` | `COLOUR` |
| Supplier | Relation → Suppliers | `supplier` | `SUPPLIER_NAME` |
| Bundle | Text property | `bundle` | `BUNDLE_NUMBER` |
| Lot number | Text property | `lot_number` | `LOT_NUMBER` |
| Dimensions | L/W/T number properties | `length/width/thickness` | `LENGTH/WIDTH/THICKNESS` |
| Parent job | Relation → Production | `production_id` | `RESERVED_FOR` / `USED_IN` |

## Entity: Cutout

| Field | Notion (Cutouts DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|---------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_cutouts.id` | — (embedded in DOC_ITEMS) |
| Cutout name | Title property | `cutout_name` | `CUTOUT_DETAILS` (text field) |
| Parent piece | Relation → Pieces | `piece_id` (FK) | `ITEM_ID` (FK) |
| Type | Select | `cutout_type` | — |
| Quantity | Number | `quantity` | — |

## Entity: Customer

| Field | Notion (Customers DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|----------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_customers.id` | `CUSTOMERS.CUSTOMER_ID` |
| Name | Title property | `customer_name` | `COMPANY_NAME` or `FIRST_NAME + LAST_NAME` |
| Phone | Text property | `phone` | `PHONE` / `MOBILE` |
| Email | Text property | `email` | `EMAIL` |
| Address | Text property | `address` | `ADDRESS` + `SUBURB` + `STATE` + `POSTCODE` |

## Entity: Stone Colour / Material

| Field | Notion (Stone Colours DB) | NotionArchive MSSQL | StonePro Firebird |
|-------|--------------------------|--------------------|--------------------|
| Primary key | Page UUID | `notion_stone_colours.id` | `MATERIALS.MATERIAL_ID` |
| Name | Title property | `colour_name` | `MATERIAL_NAME` |
| Type | Select (Natural/Engineered) | `material_type` | `MATERIAL_TYPE` |
| Supplier | Relation → Suppliers | `supplier` | `SUPPLIER_ID` FK |
| Thickness | Number | `thickness` | `THICKNESS` |

## ID Cross-Reference

The system links records across datasources:

| Entity | Notion → MSSQL Link | MSSQL → StonePro Link |
|--------|---------------------|----------------------|
| Job | `notion_page_id` (UUID) | `job_number` = `DOC_NUMBER` |
| Piece | `notion_page_id` (UUID) | Manual via job + description |
| Slab | `notion_page_id` (UUID) | `lot_number` + `bundle` match |
| Customer | `notion_page_id` (UUID) | `customer_name` fuzzy match |
| Colour | `notion_page_id` (UUID) | `colour_name` = `MATERIAL_NAME` |

## Cross-Reference Implementation

- **Notion → MSSQL**: Always via `notion_page_id` column (guaranteed unique per page)
- **MSSQL → StonePro**: Via `job_number` ↔ `DOC_NUMBER` (primary link), supplemented by name matching for customers and materials
- **StonePro → Notion**: Not directly linked; requires MSSQL as intermediary
- Mapping logic lives in `stonepro_service/mapping/` and `notion_sync/mappings/`
