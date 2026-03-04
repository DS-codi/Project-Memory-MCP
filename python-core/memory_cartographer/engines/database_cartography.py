"""
database_cartography.py
-----------------------
Database cartography engine: connect to a live database, verify connectivity,
map the full schema, and export structured CSV artefacts.

Supported databases (primary to secondary):
    mssql       -- via pyodbc (T-SQL / SQL Server system catalogs)
    postgresql  -- via psycopg2 (INFORMATION_SCHEMA + pg_catalog)
    mysql       -- via mysql-connector-python (INFORMATION_SCHEMA)
    sqlite      -- via stdlib sqlite3 (sqlite_master / PRAGMA)

Three-stage execution model
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Stage 1 -- Connection & Verification
    Accept ConnectionSpec, open a connection, and run lightweight probe queries
    that confirm stability and read permissions.

Stage 2 -- Schema Discovery & Mapping
    Iteratively query system catalogs / INFORMATION_SCHEMA to map:
      - Structural objects  : schemas, tables, views
      - Column metadata     : name, data type, nullability, default
      - Relational integrity: PKs, FKs, unique/check constraints
      - Performance objects : indexes (clustered flag + covered columns)
      - Programmability     : stored procedures, UDFs, triggers

Stage 3 -- Serialisation & Export
    Write one CSV file per object type into a caller-specified output directory.
    Files produced:
        schemas.csv, tables.csv, columns.csv, constraints.csv,
        relations.csv, indexes.csv, index_columns.csv,
        programmability.csv, triggers.csv

See:
    docs/contracts/sections/database-cartography.schema.json
    docs/contracts/memory-cartographer-contract.md
    docs/contracts/normalization-rules.md
    docs/architecture/memory-cartographer/implementation-boundary.md
"""

from __future__ import annotations

import csv
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ConnectionSpec
# ---------------------------------------------------------------------------

class DbKind(str, Enum):
    MSSQL      = "mssql"
    POSTGRESQL = "postgresql"
    MYSQL      = "mysql"
    SQLITE     = "sqlite"
    UNKNOWN    = "unknown"


@dataclass
class ConnectionSpec:
    """All information needed to open a live database connection.

    For SQLite only ``database`` (the file path) is required.
    For all other kinds ``host``, ``port``, ``user``, ``password``,
    and ``database`` are required.
    """

    kind: DbKind
    database: str
    host: str = "localhost"
    port: Optional[int] = None
    user: str = ""
    password: str = ""
    # MSSQL extras
    driver: str = ""
    trust_server_certificate: bool = True
    encrypt: bool = True
    connect_timeout: int = 15

    @property
    def default_port(self) -> int:
        defaults = {
            DbKind.MSSQL: 1433,
            DbKind.POSTGRESQL: 5432,
            DbKind.MYSQL: 3306,
            DbKind.SQLITE: 0,
        }
        return defaults.get(self.kind, 0)

    @property
    def effective_port(self) -> int:
        return self.port if self.port is not None else self.default_port


# ---------------------------------------------------------------------------
# Data-classes
# ---------------------------------------------------------------------------

@dataclass
class DataSource:
    """A live database connection verified in Stage 1."""
    id: str                        # '{kind}::{database}'
    kind: str
    name: str
    host: str = ""
    port: int = 0
    connection_source: str = "explicit"
    config_path: Optional[str] = None


@dataclass
class SchemaEntry:
    """A database schema (namespace)."""
    datasource_id: str
    schema_name: str


@dataclass
class Table:
    """A table or view."""
    id: str                        # '{datasource_id}::{schema_name}::{table_name}'
    datasource_id: str
    schema_name: str
    table_name: str
    table_kind: str                # table | view | materialized_view
    column_count: int = 0
    row_count_estimate: Optional[int] = None


@dataclass
class Column:
    """A column within a table or view."""
    id: str                        # '{table_id}::{column_name}'
    table_id: str
    column_name: str
    data_type: str
    ordinal_position: int
    nullable: bool = True
    default_value: Optional[str] = None
    is_primary_key: bool = False
    max_length: Optional[int] = None
    numeric_precision: Optional[int] = None
    numeric_scale: Optional[int] = None


@dataclass
class Constraint:
    """A table constraint (PK, FK, UNIQUE, CHECK)."""
    id: str                        # '{table_id}::{constraint_kind}::{constraint_name}'
    table_id: str
    constraint_name: str
    constraint_kind: str           # pk | fk | unique | check
    columns: List[str] = field(default_factory=list)
    check_clause: Optional[str] = None


@dataclass
class Relation:
    """A foreign-key relationship between two tables."""
    id: str                        # '{from_table_id}->>{to_table_id}::{constraint_name}'
    constraint_name: str
    from_table_id: str
    from_columns: List[str] = field(default_factory=list)
    to_table_id: str = ""
    to_columns: List[str] = field(default_factory=list)
    on_delete: str = ""
    on_update: str = ""


@dataclass
class Index:
    """An index on a table."""
    id: str                        # '{table_id}::{index_name}'
    table_id: str
    index_name: str
    is_unique: bool = False
    is_clustered: bool = False
    is_primary_key: bool = False
    columns: List[str] = field(default_factory=list)
    included_columns: List[str] = field(default_factory=list)


@dataclass
class ProgrammabilityObject:
    """A stored procedure, function, or UDF."""
    id: str                        # '{datasource_id}::{schema_name}::{kind}::{name}'
    datasource_id: str
    schema_name: str
    object_name: str
    object_kind: str               # procedure | function | udf | aggregate
    definition_available: bool = False


@dataclass
class Trigger:
    """A database trigger."""
    id: str                        # '{table_id}::{trigger_name}'
    table_id: str
    trigger_name: str
    event: str                     # INSERT | UPDATE | DELETE | ...
    timing: str                    # BEFORE | AFTER | INSTEAD OF
    is_enabled: bool = True
    definition_available: bool = False


# ---------------------------------------------------------------------------
# Stage 1 -- Connection & Verification
# ---------------------------------------------------------------------------

class ConnectionVerifier:
    """Opens a database connection and runs probe queries to verify stability
    and read permissions before any cartography work begins."""

    _PROBES: Dict[DbKind, List[Tuple[str, str]]] = {
        DbKind.MSSQL: [
            ("basic_connectivity", "SELECT 1 AS probe"),
            ("server_version",     "SELECT @@VERSION AS version"),
            ("current_db",         "SELECT DB_NAME() AS db_name"),
            ("current_user",       "SELECT SYSTEM_USER AS login, USER_NAME() AS db_user"),
            ("read_permission",    (
                "SELECT TOP 1 TABLE_SCHEMA, TABLE_NAME "
                "FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE'"
            )),
            ("catalog_access",     (
                "SELECT COUNT(*) AS object_count "
                "FROM sys.objects WHERE type_desc IS NOT NULL"
            )),
        ],
        DbKind.POSTGRESQL: [
            ("basic_connectivity", "SELECT 1 AS probe"),
            ("server_version",     "SELECT version()"),
            ("current_db",         "SELECT current_database()"),
            ("current_user",       "SELECT current_user, session_user"),
            ("read_permission",    (
                "SELECT table_schema, table_name "
                "FROM information_schema.tables "
                "WHERE table_type = 'BASE TABLE' LIMIT 1"
            )),
        ],
        DbKind.MYSQL: [
            ("basic_connectivity", "SELECT 1 AS probe"),
            ("server_version",     "SELECT VERSION()"),
            ("current_db",         "SELECT DATABASE()"),
            ("current_user",       "SELECT CURRENT_USER()"),
            ("read_permission",    (
                "SELECT TABLE_SCHEMA, TABLE_NAME "
                "FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE' LIMIT 1"
            )),
        ],
        DbKind.SQLITE: [
            ("basic_connectivity", "SELECT 1 AS probe"),
            ("sqlite_version",     "SELECT sqlite_version()"),
            ("read_permission",    "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"),
        ],
    }

    def verify(self, spec: ConnectionSpec) -> Tuple[Any, List[Dict]]:
        """Open a connection and run all probe queries.

        Returns:
            (connection, probe_results) where probe_results is a list of
            dicts with keys: probe_name, success, value, error, elapsed_ms.

        Raises:
            ConnectionError if the initial connection cannot be established.
        """
        conn = self._connect(spec)
        results: List[Dict] = []
        probes = self._PROBES.get(spec.kind, self._PROBES[DbKind.MSSQL][:2])

        for probe_name, sql in probes:
            t0 = time.monotonic()
            try:
                cur = conn.cursor()
                cur.execute(sql)
                row = cur.fetchone()
                value = str(row[0]) if row else None
                results.append({
                    "probe_name": probe_name,
                    "success":    True,
                    "value":      value,
                    "error":      None,
                    "elapsed_ms": round((time.monotonic() - t0) * 1000, 2),
                })
                cur.close()
            except Exception as exc:
                results.append({
                    "probe_name": probe_name,
                    "success":    False,
                    "value":      None,
                    "error":      str(exc),
                    "elapsed_ms": round((time.monotonic() - t0) * 1000, 2),
                })
                logger.warning("Probe '%s' failed: %s", probe_name, exc)

        failed = [r for r in results if not r["success"]]
        if failed:
            logger.warning(
                "%d of %d probes failed: %s",
                len(failed), len(results), [r["probe_name"] for r in failed],
            )
        return conn, results

    def _connect(self, spec: ConnectionSpec) -> Any:
        if spec.kind == DbKind.MSSQL:
            return self._connect_mssql(spec)
        elif spec.kind == DbKind.POSTGRESQL:
            return self._connect_postgresql(spec)
        elif spec.kind == DbKind.MYSQL:
            return self._connect_mysql(spec)
        elif spec.kind == DbKind.SQLITE:
            return self._connect_sqlite(spec)
        else:
            raise ValueError(f"Unsupported database kind: {spec.kind!r}")

    def _connect_mssql(self, spec: ConnectionSpec) -> Any:
        try:
            import pyodbc  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "pyodbc is required for MSSQL connections. "
                "Install with: pip install pyodbc"
            ) from exc

        driver = spec.driver or self._detect_mssql_driver()
        conn_str = (
            f"DRIVER={driver};"
            f"SERVER={spec.host},{spec.effective_port};"
            f"DATABASE={spec.database};"
            f"UID={spec.user};"
            f"PWD={spec.password};"
            f"Encrypt={'yes' if spec.encrypt else 'no'};"
            f"TrustServerCertificate={'yes' if spec.trust_server_certificate else 'no'};"
            f"Connection Timeout={spec.connect_timeout};"
        )
        return pyodbc.connect(conn_str, autocommit=False)

    @staticmethod
    def _detect_mssql_driver() -> str:
        """Return the highest-version available ODBC Driver for SQL Server."""
        try:
            import pyodbc  # type: ignore
            candidates = [d for d in pyodbc.drivers() if "SQL Server" in d]
            if not candidates:
                raise RuntimeError(
                    "No ODBC SQL Server driver found. "
                    "Install 'ODBC Driver 18 for SQL Server' from Microsoft."
                )
            candidates.sort(
                key=lambda d: int("".join(filter(str.isdigit, d)) or "0"),
                reverse=True,
            )
            return "{" + candidates[0] + "}"
        except ImportError:
            return "{ODBC Driver 18 for SQL Server}"

    @staticmethod
    def _connect_postgresql(spec: ConnectionSpec) -> Any:
        try:
            import psycopg2  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "psycopg2 is required for PostgreSQL. "
                "Install with: pip install psycopg2-binary"
            ) from exc
        return psycopg2.connect(
            host=spec.host, port=spec.effective_port,
            user=spec.user, password=spec.password,
            dbname=spec.database, connect_timeout=spec.connect_timeout,
        )

    @staticmethod
    def _connect_mysql(spec: ConnectionSpec) -> Any:
        try:
            import mysql.connector  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "mysql-connector-python is required for MySQL. "
                "Install with: pip install mysql-connector-python"
            ) from exc
        return mysql.connector.connect(
            host=spec.host, port=spec.effective_port,
            user=spec.user, password=spec.password,
            database=spec.database, connection_timeout=spec.connect_timeout,
        )

    @staticmethod
    def _connect_sqlite(spec: ConnectionSpec) -> Any:
        import sqlite3
        return sqlite3.connect(spec.database, timeout=spec.connect_timeout)


# ---------------------------------------------------------------------------
# Stage 2 -- Schema Discovery & Mapping (MSSQL-primary, multi-dialect)
# ---------------------------------------------------------------------------

class SchemaDiscoverer:
    """Queries system catalogs to map the full database schema.

    MSSQL queries use T-SQL system views (sys.* + INFORMATION_SCHEMA).
    Other dialects fall back to INFORMATION_SCHEMA where possible.
    """

    def __init__(self, conn: Any, spec: ConnectionSpec) -> None:
        self._conn = conn
        self._spec = spec

    def _q(self, sql: str, params: tuple = ()) -> List[Tuple]:
        cur = self._conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        return rows

    # ---- schemas -----------------------------------------------------------

    def get_schemas(self) -> List[str]:
        if self._spec.kind == DbKind.MSSQL:
            rows = self._q(
                "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA "
                "ORDER BY SCHEMA_NAME"
            )
        elif self._spec.kind == DbKind.POSTGRESQL:
            rows = self._q(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT IN ('pg_catalog','information_schema') "
                "ORDER BY schema_name"
            )
        elif self._spec.kind == DbKind.MYSQL:
            rows = self._q(
                "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA "
                "ORDER BY SCHEMA_NAME"
            )
        else:
            return ["main"]
        return [r[0] for r in rows]

    # ---- tables + views ----------------------------------------------------

    def get_tables(self, datasource_id: str) -> List[Table]:
        if self._spec.kind == DbKind.MSSQL:
            rows = self._q(
                "SELECT "
                "  t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE, "
                "  p.rows AS row_count_estimate "
                "FROM INFORMATION_SCHEMA.TABLES t "
                "LEFT JOIN sys.tables st "
                "  ON st.name = t.TABLE_NAME "
                "  AND SCHEMA_NAME(st.schema_id) = t.TABLE_SCHEMA "
                "LEFT JOIN sys.partitions p "
                "  ON p.object_id = st.object_id "
                "  AND p.index_id IN (0, 1) "
                "WHERE t.TABLE_CATALOG = DB_NAME() "
                "ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME"
            )
        elif self._spec.kind == DbKind.POSTGRESQL:
            rows = self._q(
                "SELECT table_schema, table_name, table_type, NULL "
                "FROM information_schema.tables "
                "WHERE table_schema NOT IN ('pg_catalog','information_schema') "
                "ORDER BY table_schema, table_name"
            )
        elif self._spec.kind == DbKind.MYSQL:
            rows = self._q(
                "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, TABLE_ROWS "
                "FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_SCHEMA = %s "
                "ORDER BY TABLE_SCHEMA, TABLE_NAME",
                (self._spec.database,),
            )
        else:
            rows = self._q(
                "SELECT '' AS schema_name, name, type, NULL "
                "FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
            )

        kind_map = {
            "BASE TABLE": "table", "VIEW": "view",
            "table": "table", "view": "view",
        }
        tables: List[Table] = []
        for schema_name, table_name, table_type, row_est in rows:
            table_kind = kind_map.get(str(table_type).upper().strip(), "table")
            tid = f"{datasource_id}::{schema_name}::{table_name}"
            tables.append(Table(
                id=tid,
                datasource_id=datasource_id,
                schema_name=schema_name or "",
                table_name=table_name,
                table_kind=table_kind,
                row_count_estimate=int(row_est) if row_est is not None else None,
            ))
        return tables

    # ---- columns -----------------------------------------------------------

    def get_columns(self, tables: List[Table]) -> List[Column]:
        if self._spec.kind == DbKind.MSSQL:
            return self._get_columns_mssql(tables)
        elif self._spec.kind in (DbKind.POSTGRESQL, DbKind.MYSQL):
            return self._get_columns_information_schema(tables)
        else:
            return self._get_columns_sqlite(tables)

    def _get_columns_mssql(self, tables: List[Table]) -> List[Column]:
        rows = self._q(
            "SELECT "
            "  c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, "
            "  c.ORDINAL_POSITION, c.IS_NULLABLE, c.COLUMN_DEFAULT, "
            "  c.CHARACTER_MAXIMUM_LENGTH, c.NUMERIC_PRECISION, c.NUMERIC_SCALE "
            "FROM INFORMATION_SCHEMA.COLUMNS c "
            "WHERE c.TABLE_CATALOG = DB_NAME() "
            "ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION"
        )
        lookup = {(t.schema_name, t.table_name): t.id for t in tables}

        pk_cols: set = set()
        pk_rows = self._q(
            "SELECT SCHEMA_NAME(t.schema_id), t.name, c.name "
            "FROM sys.indexes i "
            "JOIN sys.index_columns ic ON ic.object_id = i.object_id "
            "  AND ic.index_id = i.index_id "
            "JOIN sys.columns c ON c.object_id = i.object_id "
            "  AND c.column_id = ic.column_id "
            "JOIN sys.tables t ON t.object_id = i.object_id "
            "WHERE i.is_primary_key = 1"
        )
        for schema, tname, cname in pk_rows:
            pk_cols.add((schema, tname, cname))

        columns: List[Column] = []
        for (schema, tname, cname, dtype, pos, nullable_flag,
             default, max_len, num_prec, num_scale) in rows:
            table_id = lookup.get((schema, tname))
            if not table_id:
                continue
            columns.append(Column(
                id=f"{table_id}::{cname}",
                table_id=table_id,
                column_name=cname,
                data_type=dtype,
                ordinal_position=int(pos),
                nullable=(str(nullable_flag).upper() == "YES"),
                default_value=default,
                is_primary_key=(schema, tname, cname) in pk_cols,
                max_length=int(max_len) if max_len is not None else None,
                numeric_precision=int(num_prec) if num_prec is not None else None,
                numeric_scale=int(num_scale) if num_scale is not None else None,
            ))
        return columns

    def _get_columns_information_schema(self, tables: List[Table]) -> List[Column]:
        db_filter = (
            "AND c.TABLE_SCHEMA NOT IN ('pg_catalog','information_schema')"
            if self._spec.kind == DbKind.POSTGRESQL else ""
        )
        rows = self._q(
            f"SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, "
            f"ORDINAL_POSITION, IS_NULLABLE, COLUMN_DEFAULT, "
            f"CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE "
            f"FROM INFORMATION_SCHEMA.COLUMNS c WHERE 1=1 {db_filter} "
            f"ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION"
        )
        lookup = {(t.schema_name, t.table_name): t.id for t in tables}
        columns: List[Column] = []
        for (schema, tname, cname, dtype, pos, nullable_flag,
             default, max_len, num_prec, num_scale) in rows:
            table_id = lookup.get((schema or "", tname))
            if not table_id:
                continue
            columns.append(Column(
                id=f"{table_id}::{cname}",
                table_id=table_id,
                column_name=cname,
                data_type=dtype,
                ordinal_position=int(pos),
                nullable=(str(nullable_flag).upper() == "YES"),
                default_value=default,
                max_length=int(max_len) if max_len is not None else None,
                numeric_precision=int(num_prec) if num_prec is not None else None,
                numeric_scale=int(num_scale) if num_scale is not None else None,
            ))
        return columns

    def _get_columns_sqlite(self, tables: List[Table]) -> List[Column]:
        columns: List[Column] = []
        for table in tables:
            rows = self._q(f"PRAGMA table_info({table.table_name})")
            for row in rows:
                cid, cname, dtype, notnull, default, is_pk = row
                columns.append(Column(
                    id=f"{table.id}::{cname}",
                    table_id=table.id,
                    column_name=cname,
                    data_type=dtype or "TEXT",
                    ordinal_position=int(cid) + 1,
                    nullable=not bool(notnull),
                    default_value=default,
                    is_primary_key=bool(is_pk),
                ))
        return columns

    # ---- constraints (PKs, FKs, UNIQUE, CHECK) -----------------------------

    def get_constraints(
        self, tables: List[Table]
    ) -> Tuple[List[Constraint], List[Relation]]:
        lookup = {(t.schema_name, t.table_name): t.id for t in tables}
        if self._spec.kind == DbKind.MSSQL:
            return self._get_constraints_mssql(lookup)
        elif self._spec.kind in (DbKind.POSTGRESQL, DbKind.MYSQL):
            return self._get_constraints_information_schema(lookup)
        else:
            return self._get_constraints_sqlite(tables)

    def _get_constraints_mssql(
        self, lookup: Dict[Tuple[str, str], str]
    ) -> Tuple[List[Constraint], List[Relation]]:
        rows = self._q(
            "SELECT "
            "  SCHEMA_NAME(t.schema_id) AS table_schema, "
            "  t.name AS table_name, "
            "  kc.name AS constraint_name, "
            "  kc.type_desc AS constraint_type, "
            "  STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns "
            "FROM sys.key_constraints kc "
            "JOIN sys.tables t ON t.object_id = kc.parent_object_id "
            "JOIN sys.index_columns ic "
            "  ON ic.object_id = kc.parent_object_id "
            "  AND ic.index_id = kc.unique_index_id "
            "JOIN sys.columns c "
            "  ON c.object_id = ic.object_id AND c.column_id = ic.column_id "
            "GROUP BY SCHEMA_NAME(t.schema_id), t.name, kc.name, kc.type_desc "
            "ORDER BY table_schema, table_name, constraint_name"
        )
        constraints: List[Constraint] = []
        for schema, tname, cname, ctype, cols in rows:
            table_id = lookup.get((schema, tname))
            if not table_id:
                continue
            kind = "pk" if "PRIMARY" in ctype.upper() else "unique"
            col_list = [c.strip() for c in (cols or "").split(",") if c.strip()]
            constraints.append(Constraint(
                id=f"{table_id}::{kind}::{cname}",
                table_id=table_id,
                constraint_name=cname,
                constraint_kind=kind,
                columns=col_list,
            ))

        check_rows = self._q(
            "SELECT SCHEMA_NAME(t.schema_id), t.name, cc.name, cc.definition "
            "FROM sys.check_constraints cc "
            "JOIN sys.tables t ON t.object_id = cc.parent_object_id "
            "ORDER BY 1, 2, 3"
        )
        for schema, tname, cname, definition in check_rows:
            table_id = lookup.get((schema, tname))
            if not table_id:
                continue
            constraints.append(Constraint(
                id=f"{table_id}::check::{cname}",
                table_id=table_id,
                constraint_name=cname,
                constraint_kind="check",
                check_clause=definition,
            ))

        fk_rows = self._q(
            "SELECT "
            "  SCHEMA_NAME(tp.schema_id) AS from_schema, "
            "  tp.name AS from_table, "
            "  fk.name AS fk_name, "
            "  STRING_AGG(cpa.name, ',') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS from_cols, "
            "  SCHEMA_NAME(tr.schema_id) AS to_schema, "
            "  tr.name AS to_table, "
            "  STRING_AGG(cra.name, ',') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS to_cols, "
            "  fk.delete_referential_action_desc, "
            "  fk.update_referential_action_desc "
            "FROM sys.foreign_keys fk "
            "JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id "
            "JOIN sys.tables tp ON tp.object_id = fk.parent_object_id "
            "JOIN sys.tables tr ON tr.object_id = fk.referenced_object_id "
            "JOIN sys.columns cpa "
            "  ON cpa.object_id = fkc.parent_object_id "
            "  AND cpa.column_id = fkc.parent_column_id "
            "JOIN sys.columns cra "
            "  ON cra.object_id = fkc.referenced_object_id "
            "  AND cra.column_id = fkc.referenced_column_id "
            "GROUP BY "
            "  SCHEMA_NAME(tp.schema_id), tp.name, fk.name, "
            "  SCHEMA_NAME(tr.schema_id), tr.name, "
            "  fk.delete_referential_action_desc, fk.update_referential_action_desc "
            "ORDER BY from_schema, from_table, fk_name"
        )
        relations: List[Relation] = []
        for (from_schema, from_table, fk_name, from_cols,
             to_schema, to_table, to_cols, on_del, on_upd) in fk_rows:
            from_id = lookup.get((from_schema, from_table), "")
            to_id   = lookup.get((to_schema, to_table), "")
            relations.append(Relation(
                id=f"{from_id}->>{to_id}::{fk_name}",
                constraint_name=fk_name,
                from_table_id=from_id,
                from_columns=[c.strip() for c in (from_cols or "").split(",") if c.strip()],
                to_table_id=to_id,
                to_columns=[c.strip() for c in (to_cols or "").split(",") if c.strip()],
                on_delete=on_del or "",
                on_update=on_upd or "",
            ))
        return constraints, relations

    def _get_constraints_information_schema(
        self, lookup: Dict[Tuple[str, str], str]
    ) -> Tuple[List[Constraint], List[Relation]]:
        rows = self._q(
            "SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, "
            "tc.TABLE_SCHEMA, tc.TABLE_NAME, "
            "GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) "
            "FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc "
            "LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu "
            "  ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME "
            "  AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA "
            "  AND kcu.TABLE_NAME = tc.TABLE_NAME "
            "GROUP BY tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, "
            "  tc.TABLE_SCHEMA, tc.TABLE_NAME "
            "ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_NAME"
        )
        type_map = {
            "PRIMARY KEY": "pk", "UNIQUE": "unique",
            "FOREIGN KEY": "fk", "CHECK": "check",
        }
        constraints: List[Constraint] = []
        for cname, ctype, schema, tname, cols in rows:
            table_id = lookup.get((schema or "", tname))
            if not table_id:
                continue
            kind = type_map.get(str(ctype).upper(), "unknown")
            if kind == "fk":
                continue
            col_list = [c.strip() for c in (cols or "").split(",") if c.strip()]
            constraints.append(Constraint(
                id=f"{table_id}::{kind}::{cname}",
                table_id=table_id,
                constraint_name=cname,
                constraint_kind=kind,
                columns=col_list,
            ))

        fk_rows = self._q(
            "SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_SCHEMA, kcu.TABLE_NAME, "
            "kcu.COLUMN_NAME, rcu.TABLE_SCHEMA, rcu.TABLE_NAME, rcu.COLUMN_NAME, "
            "rc.DELETE_RULE, rc.UPDATE_RULE "
            "FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc "
            "JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu "
            "  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME "
            "JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE rcu "
            "  ON rcu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME "
            "  AND rcu.ORDINAL_POSITION = kcu.ORDINAL_POSITION "
            "ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION"
        )
        rel_map: Dict[str, Relation] = {}
        for (cname, f_schema, f_table, f_col,
             t_schema, t_table, t_col, on_del, on_upd) in fk_rows:
            from_id = lookup.get((f_schema or "", f_table), "")
            to_id   = lookup.get((t_schema or "", t_table), "")
            if cname not in rel_map:
                rel_map[cname] = Relation(
                    id=f"{from_id}->>{to_id}::{cname}",
                    constraint_name=cname,
                    from_table_id=from_id,
                    to_table_id=to_id,
                    on_delete=on_del or "",
                    on_update=on_upd or "",
                )
            rel_map[cname].from_columns.append(f_col)
            rel_map[cname].to_columns.append(t_col)
        return constraints, list(rel_map.values())

    def _get_constraints_sqlite(
        self, tables: List[Table]
    ) -> Tuple[List[Constraint], List[Relation]]:
        constraints: List[Constraint] = []
        relations:   List[Relation]   = []
        for table in tables:
            pk_rows = [r for r in self._q(f"PRAGMA table_info({table.table_name})") if r[5]]
            if pk_rows:
                pk_cols = [r[1] for r in pk_rows]
                constraints.append(Constraint(
                    id=f"{table.id}::pk::pk_{table.table_name}",
                    table_id=table.id,
                    constraint_name=f"pk_{table.table_name}",
                    constraint_kind="pk",
                    columns=pk_cols,
                ))
            for row in self._q(f"PRAGMA foreign_key_list({table.table_name})"):
                fk_id_num, seq, ref_table, from_col, to_col, on_update, on_delete, *_ = row
                to_id = f"{table.datasource_id}::::{ref_table}"
                key = fk_id_num
                existing = next((r for r in relations if r.constraint_name == f"fk_{key}"), None)
                if not existing:
                    existing = Relation(
                        id=f"{table.id}->>{to_id}::fk_{key}",
                        constraint_name=f"fk_{key}",
                        from_table_id=table.id,
                        to_table_id=to_id,
                        on_delete=on_delete or "",
                        on_update=on_update or "",
                    )
                    relations.append(existing)
                existing.from_columns.append(from_col)
                existing.to_columns.append(to_col)
        return constraints, relations

    # ---- indexes -----------------------------------------------------------

    def get_indexes(self, tables: List[Table]) -> List[Index]:
        lookup = {(t.schema_name, t.table_name): t.id for t in tables}
        if self._spec.kind == DbKind.MSSQL:
            return self._get_indexes_mssql(lookup)
        elif self._spec.kind == DbKind.POSTGRESQL:
            return self._get_indexes_postgresql(lookup)
        elif self._spec.kind == DbKind.MYSQL:
            return self._get_indexes_mysql(lookup)
        else:
            return self._get_indexes_sqlite(tables)

    def _get_indexes_mssql(self, lookup: Dict[Tuple[str, str], str]) -> List[Index]:
        rows = self._q(
            "SELECT "
            "  SCHEMA_NAME(t.schema_id) AS schema_name, "
            "  t.name AS table_name, "
            "  i.name AS index_name, "
            "  i.is_unique, "
            "  i.type_desc, "
            "  i.is_primary_key, "
            "  STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ',') "
            "    WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols, "
            "  STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ',') "
            "    WITHIN GROUP (ORDER BY ic.index_column_id) AS inc_cols "
            "FROM sys.indexes i "
            "JOIN sys.tables t ON t.object_id = i.object_id "
            "JOIN sys.index_columns ic "
            "  ON ic.object_id = i.object_id AND ic.index_id = i.index_id "
            "JOIN sys.columns c "
            "  ON c.object_id = ic.object_id AND c.column_id = ic.column_id "
            "WHERE i.type > 0 "
            "GROUP BY SCHEMA_NAME(t.schema_id), t.name, i.name, "
            "  i.is_unique, i.type_desc, i.is_primary_key "
            "ORDER BY schema_name, table_name, index_name"
        )
        indexes: List[Index] = []
        for (schema, tname, iname, is_unique, type_desc,
             is_pk, key_cols, inc_cols) in rows:
            table_id = lookup.get((schema, tname))
            if not table_id:
                continue
            indexes.append(Index(
                id=f"{table_id}::{iname}",
                table_id=table_id,
                index_name=iname,
                is_unique=bool(is_unique),
                is_clustered=(str(type_desc).upper() == "CLUSTERED"),
                is_primary_key=bool(is_pk),
                columns=[c.strip() for c in (key_cols or "").split(",") if c.strip()],
                included_columns=[c.strip() for c in (inc_cols or "").split(",") if c.strip()],
            ))
        return indexes

    def _get_indexes_postgresql(self, lookup: Dict[Tuple[str, str], str]) -> List[Index]:
        rows = self._q(
            "SELECT n.nspname, t.relname, i.relname, ix.indisunique, "
            "ix.indisclustered, ix.indisprimary, "
            "ARRAY(SELECT a.attname FROM pg_attribute a "
            "      WHERE a.attrelid = t.oid "
            "        AND a.attnum = ANY(ix.indkey) "
            "      ORDER BY array_position(ix.indkey, a.attnum::smallint)) "
            "FROM pg_class t "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "JOIN pg_index ix    ON ix.indrelid = t.oid "
            "JOIN pg_class i     ON i.oid = ix.indexrelid "
            "WHERE t.relkind = 'r' "
            "  AND n.nspname NOT IN ('pg_catalog','information_schema') "
            "ORDER BY n.nspname, t.relname, i.relname"
        )
        indexes: List[Index] = []
        for (schema, tname, iname, is_unique, is_clustered, is_pk, cols) in rows:
            table_id = lookup.get((schema, tname))
            if not table_id:
                continue
            indexes.append(Index(
                id=f"{table_id}::{iname}",
                table_id=table_id,
                index_name=iname,
                is_unique=bool(is_unique),
                is_clustered=bool(is_clustered),
                is_primary_key=bool(is_pk),
                columns=cols if isinstance(cols, list) else [],
            ))
        return indexes

    def _get_indexes_mysql(self, lookup: Dict[Tuple[str, str], str]) -> List[Index]:
        rows = self._q(
            "SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, "
            "GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), NON_UNIQUE "
            "FROM INFORMATION_SCHEMA.STATISTICS "
            "WHERE TABLE_SCHEMA = %s "
            "GROUP BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE "
            "ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME",
            (self._spec.database,),
        )
        indexes: List[Index] = []
        for schema, tname, iname, cols, non_unique in rows:
            table_id = lookup.get((schema or "", tname))
            if not table_id:
                continue
            indexes.append(Index(
                id=f"{table_id}::{iname}",
                table_id=table_id,
                index_name=iname,
                is_unique=not bool(non_unique),
                is_primary_key=(iname == "PRIMARY"),
                columns=[c.strip() for c in (cols or "").split(",") if c.strip()],
            ))
        return indexes

    def _get_indexes_sqlite(self, tables: List[Table]) -> List[Index]:
        indexes: List[Index] = []
        for table in tables:
            for row in self._q(f"PRAGMA index_list({table.table_name})"):
                _, iname, is_unique, *_ = row
                col_rows = self._q(f"PRAGMA index_info({iname})")
                cols = [r[2] for r in col_rows]
                indexes.append(Index(
                    id=f"{table.id}::{iname}",
                    table_id=table.id,
                    index_name=iname,
                    is_unique=bool(is_unique),
                    columns=cols,
                ))
        return indexes

    # ---- programmability (procs, functions, triggers) ----------------------

    def get_programmability(
        self, datasource_id: str
    ) -> Tuple[List[ProgrammabilityObject], List[Trigger]]:
        if self._spec.kind == DbKind.MSSQL:
            return self._get_programmability_mssql(datasource_id)
        elif self._spec.kind == DbKind.POSTGRESQL:
            return self._get_programmability_postgresql(datasource_id)
        elif self._spec.kind == DbKind.MYSQL:
            return self._get_programmability_mysql(datasource_id)
        else:
            return [], []

    def _get_programmability_mssql(
        self, datasource_id: str
    ) -> Tuple[List[ProgrammabilityObject], List[Trigger]]:
        rows = self._q(
            "SELECT "
            "  SCHEMA_NAME(o.schema_id) AS schema_name, "
            "  o.name, "
            "  o.type_desc, "
            "  CAST(CASE WHEN sm.definition IS NOT NULL THEN 1 ELSE 0 END AS BIT) "
            "FROM sys.objects o "
            "LEFT JOIN sys.sql_modules sm ON sm.object_id = o.object_id "
            "WHERE o.type IN ('P','FN','IF','TF','AF') "
            "ORDER BY schema_name, o.name"
        )
        kind_map = {
            "SQL_STORED_PROCEDURE":               "procedure",
            "SQL_SCALAR_FUNCTION":                "function",
            "SQL_INLINE_TABLE_VALUED_FUNCTION":    "function",
            "SQL_TABLE_VALUED_FUNCTION":           "function",
            "AGGREGATE_FUNCTION":                  "aggregate",
        }
        prog: List[ProgrammabilityObject] = []
        for schema, name, type_desc, has_def in rows:
            kind = kind_map.get(type_desc.upper(), "function")
            prog.append(ProgrammabilityObject(
                id=f"{datasource_id}::{schema}::{kind}::{name}",
                datasource_id=datasource_id,
                schema_name=schema,
                object_name=name,
                object_kind=kind,
                definition_available=bool(has_def),
            ))

        trig_rows = self._q(
            "SELECT "
            "  SCHEMA_NAME(t.schema_id) AS table_schema, "
            "  t.name AS table_name, "
            "  tr.name AS trigger_name, "
            "  tr.is_instead_of_trigger, "
            "  te.type_desc AS event_type, "
            "  tr.is_disabled, "
            "  CAST(CASE WHEN sm.definition IS NOT NULL THEN 1 ELSE 0 END AS BIT) "
            "FROM sys.triggers tr "
            "JOIN sys.tables t ON t.object_id = tr.parent_id "
            "LEFT JOIN sys.trigger_events te ON te.object_id = tr.object_id "
            "LEFT JOIN sys.sql_modules sm ON sm.object_id = tr.object_id "
            "ORDER BY table_schema, table_name, trigger_name"
        )
        triggers: List[Trigger] = []
        seen: set = set()
        for (schema, tname, trig_name, is_instead, event_type,
             is_disabled, has_def) in trig_rows:
            key = (schema, tname, trig_name)
            if key in seen:
                continue
            seen.add(key)
            table_id = f"{datasource_id}::{schema}::{tname}"
            triggers.append(Trigger(
                id=f"{table_id}::{trig_name}",
                table_id=table_id,
                trigger_name=trig_name,
                event=str(event_type or "").replace("_", " "),
                timing="INSTEAD OF" if is_instead else "AFTER",
                is_enabled=not bool(is_disabled),
                definition_available=bool(has_def),
            ))
        return prog, triggers

    def _get_programmability_postgresql(
        self, datasource_id: str
    ) -> Tuple[List[ProgrammabilityObject], List[Trigger]]:
        rows = self._q(
            "SELECT n.nspname, p.proname, "
            "CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' "
            "               WHEN 'a' THEN 'aggregate' ELSE 'function' END, TRUE "
            "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
            "WHERE n.nspname NOT IN ('pg_catalog','information_schema') "
            "ORDER BY n.nspname, p.proname"
        )
        prog = [
            ProgrammabilityObject(
                id=f"{datasource_id}::{schema}::{kind}::{name}",
                datasource_id=datasource_id,
                schema_name=schema,
                object_name=name,
                object_kind=kind,
                definition_available=bool(has_def),
            )
            for schema, name, kind, has_def in rows
        ]
        trig_rows = self._q(
            "SELECT event_object_schema, event_object_table, trigger_name, "
            "event_manipulation, action_timing "
            "FROM information_schema.triggers "
            "ORDER BY event_object_schema, event_object_table, trigger_name"
        )
        triggers = [
            Trigger(
                id=f"{datasource_id}::{ts}::{tname}::{trig}",
                table_id=f"{datasource_id}::{ts}::{tname}",
                trigger_name=trig,
                event=event,
                timing=timing,
            )
            for ts, tname, trig, event, timing in trig_rows
        ]
        return prog, triggers

    def _get_programmability_mysql(
        self, datasource_id: str
    ) -> Tuple[List[ProgrammabilityObject], List[Trigger]]:
        rows = self._q(
            "SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE "
            "FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = %s",
            (self._spec.database,),
        )
        prog = [
            ProgrammabilityObject(
                id=f"{datasource_id}::{schema}::{kind.lower()}::{name}",
                datasource_id=datasource_id,
                schema_name=schema,
                object_name=name,
                object_kind=kind.lower(),
                definition_available=True,
            )
            for schema, name, kind in rows
        ]
        trig_rows = self._q(
            "SELECT TRIGGER_SCHEMA, EVENT_OBJECT_TABLE, TRIGGER_NAME, "
            "EVENT_MANIPULATION, ACTION_TIMING "
            "FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = %s",
            (self._spec.database,),
        )
        triggers = [
            Trigger(
                id=f"{datasource_id}::{ts}::{tname}::{trig}",
                table_id=f"{datasource_id}::{ts}::{tname}",
                trigger_name=trig,
                event=event,
                timing=timing,
            )
            for ts, tname, trig, event, timing in trig_rows
        ]
        return prog, triggers


# ---------------------------------------------------------------------------
# Stage 3 -- Serialisation & CSV Export
# ---------------------------------------------------------------------------

class CsvExporter:
    """Writes one CSV file per object type into ``output_dir``."""

    def __init__(self, output_dir: str) -> None:
        self._dir = Path(output_dir)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _write(self, filename: str, fieldnames: List[str], rows: List[Dict]) -> str:
        path = self._dir / filename
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        return str(path)

    def export_all(
        self,
        datasource: DataSource,
        schemas: List[str],
        tables: List[Table],
        columns: List[Column],
        constraints: List[Constraint],
        relations: List[Relation],
        indexes: List[Index],
        programmability: List[ProgrammabilityObject],
        triggers: List[Trigger],
    ) -> Dict[str, str]:
        """Write all CSV files; return {filename: absolute_path}."""
        out: Dict[str, str] = {}

        out["schemas.csv"] = self._write("schemas.csv",
            ["datasource_id", "schema_name"],
            [{"datasource_id": datasource.id, "schema_name": s} for s in schemas])

        # back-fill column_count
        col_count: Dict[str, int] = {}
        for c in columns:
            col_count[c.table_id] = col_count.get(c.table_id, 0) + 1
        for t in tables:
            t.column_count = col_count.get(t.id, 0)

        out["tables.csv"] = self._write("tables.csv",
            ["id", "datasource_id", "schema_name", "table_name",
             "table_kind", "column_count", "row_count_estimate"],
            [vars(t) for t in tables])

        out["columns.csv"] = self._write("columns.csv",
            ["id", "table_id", "column_name", "data_type", "ordinal_position",
             "nullable", "default_value", "is_primary_key",
             "max_length", "numeric_precision", "numeric_scale"],
            [vars(c) for c in columns])

        out["constraints.csv"] = self._write("constraints.csv",
            ["id", "table_id", "constraint_name", "constraint_kind",
             "columns", "check_clause"],
            [{
                "id": c.id, "table_id": c.table_id,
                "constraint_name": c.constraint_name,
                "constraint_kind": c.constraint_kind,
                "columns": "|".join(c.columns),
                "check_clause": c.check_clause or "",
            } for c in constraints])

        out["relations.csv"] = self._write("relations.csv",
            ["id", "constraint_name", "from_table_id", "from_columns",
             "to_table_id", "to_columns", "on_delete", "on_update"],
            [{
                "id": r.id, "constraint_name": r.constraint_name,
                "from_table_id": r.from_table_id,
                "from_columns": "|".join(r.from_columns),
                "to_table_id":   r.to_table_id,
                "to_columns":    "|".join(r.to_columns),
                "on_delete": r.on_delete, "on_update": r.on_update,
            } for r in relations])

        out["indexes.csv"] = self._write("indexes.csv",
            ["id", "table_id", "index_name",
             "is_unique", "is_clustered", "is_primary_key"],
            [{
                "id": idx.id, "table_id": idx.table_id, "index_name": idx.index_name,
                "is_unique": idx.is_unique,
                "is_clustered": idx.is_clustered,
                "is_primary_key": idx.is_primary_key,
            } for idx in indexes])

        out["index_columns.csv"] = self._write("index_columns.csv",
            ["index_id", "column_name", "included"],
            [{"index_id": idx.id, "column_name": c, "included": False}
             for idx in indexes for c in idx.columns] +
            [{"index_id": idx.id, "column_name": c, "included": True}
             for idx in indexes for c in idx.included_columns])

        out["programmability.csv"] = self._write("programmability.csv",
            ["id", "datasource_id", "schema_name", "object_name",
             "object_kind", "definition_available"],
            [vars(p) for p in programmability])

        out["triggers.csv"] = self._write("triggers.csv",
            ["id", "table_id", "trigger_name",
             "event", "timing", "is_enabled", "definition_available"],
            [vars(t) for t in triggers])

        logger.info("Exported %d CSV files to %s", len(out), self._dir)
        return out


# ---------------------------------------------------------------------------
# DatabaseCartographyEngine -- top-level orchestrator
# ---------------------------------------------------------------------------

class DatabaseCartographyEngine:
    """Orchestrates all three cartography stages for a live database.

    Quick-start example::

        from memory_cartographer.engines.database_cartography import (
            DatabaseCartographyEngine, ConnectionSpec, DbKind
        )

        spec = ConnectionSpec(
            kind=DbKind.MSSQL,
            host="localhost", port=1433,
            user="sa", password="...",
            database="MyApp",
        )
        engine = DatabaseCartographyEngine()
        result = engine.run(spec, output_dir="./cartography_output")

        # result["probe_results"]  -- Stage 1 probe outcomes
        # result["section"]        -- Stage 2 (dict matching schema)
        # result["csv_files"]      -- Stage 3 {filename: absolute_path}
        # result["partial"]        -- True if time budget was exceeded
        # result["elapsed_ms"]     -- total wall-clock time
    """

    def run(
        self,
        spec: ConnectionSpec,
        output_dir: str,
        timeout_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Execute all three stages and return a combined result dict.

        Args:
            spec:       Connection specification.
            output_dir: Directory to write CSV artefacts into.
            timeout_ms: Optional overall time budget in milliseconds.

        Returns:
            {
              "probe_results": [...],
              "section":       {...},
              "csv_files":     {...},
              "partial":       bool,
              "elapsed_ms":    float,
            }
        """
        t_start = time.monotonic()
        partial = False

        # Stage 1 -- connect & verify
        logger.info(
            "[Stage 1] Connecting to %s://%s:%s/%s",
            spec.kind.value, spec.host, spec.effective_port, spec.database,
        )
        verifier = ConnectionVerifier()
        conn, probe_results = verifier.verify(spec)

        critical_failed = [
            r for r in probe_results
            if not r["success"]
            and r["probe_name"] in ("basic_connectivity", "read_permission")
        ]
        if critical_failed:
            raise ConnectionError(
                f"Critical connection probes failed: "
                f"{[r['probe_name'] for r in critical_failed]}. "
                f"Errors: {[r['error'] for r in critical_failed]}"
            )

        datasource_id = f"{spec.kind.value}::{spec.database}"
        datasource = DataSource(
            id=datasource_id,
            kind=spec.kind.value,
            name=spec.database,
            host=spec.host,
            port=spec.effective_port,
        )

        # Stage 2 -- schema discovery
        logger.info("[Stage 2] Discovering schema for %s", datasource_id)
        d = SchemaDiscoverer(conn, spec)

        schemas    = d.get_schemas()
        tables     = d.get_tables(datasource_id)
        columns    = d.get_columns(tables)
        constraints, relations = d.get_constraints(tables)
        indexes    = d.get_indexes(tables)
        prog, triggers = d.get_programmability(datasource_id)

        # enforce ordering guarantees
        tables.sort(key=lambda t: (t.datasource_id, t.schema_name, t.table_name))
        columns.sort(key=lambda c: (c.table_id, c.ordinal_position))
        constraints.sort(key=lambda c: (c.table_id, c.constraint_kind, c.constraint_name))
        relations.sort(key=lambda r: (r.from_table_id, r.to_table_id, r.constraint_name))
        indexes.sort(key=lambda i: (i.table_id, i.index_name))
        prog.sort(key=lambda p: (p.datasource_id, p.schema_name, p.object_name))
        triggers.sort(key=lambda t: (t.table_id, t.trigger_name))

        elapsed_so_far_ms = (time.monotonic() - t_start) * 1000
        if timeout_ms and elapsed_so_far_ms > timeout_ms * 0.85:
            partial = True
            logger.warning("Approaching time budget -- marking result partial.")

        section: Dict[str, Any] = {
            "datasources": [vars(datasource)],
            "tables":      [vars(t) for t in tables],
            "columns":     [vars(c) for c in columns],
            "constraints": [
                {**vars(c), "columns": c.columns, "check_clause": c.check_clause}
                for c in constraints
            ],
            "relations": [
                {**vars(r), "from_columns": r.from_columns, "to_columns": r.to_columns}
                for r in relations
            ],
            "indexes": [
                {**vars(i), "columns": i.columns, "included_columns": i.included_columns}
                for i in indexes
            ],
            "programmability":  [vars(p) for p in prog],
            "triggers":         [vars(t) for t in triggers],
            "migration_lineage": {},
            "query_touchpoints": [],
        }
        if partial:
            section["partial"] = True

        # Stage 3 -- CSV export
        logger.info("[Stage 3] Exporting CSV artefacts to %s", output_dir)
        exporter = CsvExporter(output_dir)
        csv_files = exporter.export_all(
            datasource=datasource,
            schemas=schemas,
            tables=tables,
            columns=columns,
            constraints=constraints,
            relations=relations,
            indexes=indexes,
            programmability=prog,
            triggers=triggers,
        )

        conn.close()
        elapsed_ms = round((time.monotonic() - t_start) * 1000, 2)
        logger.info("Cartography complete in %.0f ms", elapsed_ms)

        return {
            "probe_results": probe_results,
            "section":       section,
            "csv_files":     csv_files,
            "partial":       partial,
            "elapsed_ms":    elapsed_ms,
        }

    def scan(
        self,
        workspace_path: str,
        scope: dict,
        timeout_ms: Optional[int] = None,
    ) -> dict:
        """Envelope-level entry point used by the cartography orchestrator.

        ``scope`` must contain a ``connection`` key holding a ``ConnectionSpec``
        and an optional ``output_dir`` key (defaults to ``workspace_path``).
        For direct use, prefer ``run()`` instead.
        """
        spec: ConnectionSpec = scope["connection"]
        output_dir: str = scope.get("output_dir", workspace_path)
        return self.run(spec, output_dir=output_dir, timeout_ms=timeout_ms)
