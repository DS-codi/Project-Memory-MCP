"""
database_cartography.py
-----------------------
Engine stub for database cartography: data source discovery, table/column
introspection, constraint enumeration, relation mapping, migration lineage
analysis, and query touchpoint detection.

Ownership: Python core — this module is the canonical producer of the
database_cartography section of the memory_cartographer output envelope.

See:
    docs/contracts/sections/database-cartography.schema.json
    docs/contracts/memory-cartographer-contract.md
    docs/contracts/normalization-rules.md
    docs/architecture/memory-cartographer/implementation-boundary.md

Ordering guarantees (this module is responsible for enforcing):
    datasources        : sorted by id ascending
    tables             : sorted by (datasource_id, schema_name, table_name) ascending
    columns            : sorted by (table_id, ordinal_position) ascending
    constraints        : sorted by (table_id, constraint_kind, constraint_name) ascending
    relations          : sorted by (from_table_id, to_table_id, constraint_name) ascending
    query_touchpoints  : sorted by (file, line) ascending
    migration_lineage.migration_files : sorted by (datasource_id, version) ascending
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data classes — structural stubs matching database-cartography.schema.json
# ---------------------------------------------------------------------------


@dataclass
class DataSource:
    """A database connection or data source discovered in the workspace.

    Identity key: ``{kind}::{name}``
    Sort key for the ``datasources`` array: ``id`` ascending.
    """

    id: str
    """Stable identity key: '{kind}::{name}'."""

    kind: str
    """Data source type: postgresql | mysql | sqlite | mssql | mongodb | redis | unknown."""

    name: str
    """Human-readable name (database name or connection alias)."""

    connection_source: Optional[str] = None
    """How the connection was discovered: env_var | config_file | code_reference |
    migration_file | unknown."""

    config_path: Optional[str] = None
    """Workspace-relative path to the config file where discovered."""


@dataclass
class Table:
    """A table or view in a scanned data source.

    Identity key: ``{datasource_id}::{schema_name}::{table_name}``
    schema_name is empty string for databases without schema namespacing.
    Sort key for the ``tables`` array: (datasource_id, schema_name, table_name) ascending.
    Empty schema_name sorts before non-empty.
    """

    id: str
    """Stable identity key: '{datasource_id}::{schema_name}::{table_name}'."""

    datasource_id: str
    """Identity key of the parent DataSource. Sort key 1."""

    schema_name: str
    """Schema/namespace name. Empty string when not applicable. Sort key 2."""

    table_name: str
    """Table or view name. Sort key 3."""

    table_kind: str
    """Object kind: table | view | materialized_view | unknown."""

    column_count: int = 0
    """Number of columns."""

    row_count_estimate: Optional[int] = None
    """Estimated row count from DB statistics. None when not available."""


@dataclass
class Column:
    """A single column in a table.

    Identity key: ``{table_id}::{column_name}``
    Sort key for the ``columns`` array: (table_id, ordinal_position) ascending.
    """

    id: str
    """Stable identity key: '{table_id}::{column_name}'."""

    table_id: str
    """Identity key of the parent Table. Sort key 1."""

    column_name: str
    """Column name as it appears in the database."""

    data_type: str
    """Database-native data type string."""

    ordinal_position: int
    """1-based ordinal position. Sort key 2."""

    nullable: bool = True
    """Whether the column allows NULL values. Always present — see normalization-rules.md."""

    default_value: Optional[str] = None
    """Default value expression. None when no default is defined."""

    is_primary_key: bool = False
    """True if this column is part of the primary key."""


# ---------------------------------------------------------------------------
# DatabaseCartographyEngine
# ---------------------------------------------------------------------------


class DatabaseCartographyEngine:
    """Engine that produces the ``database_cartography`` section of the output envelope.

    The engine is responsible for:
    - Discovering data source configurations in the workspace
      (env vars, config files, ORM settings, migration directories).
    - Introspecting database schemas: tables, columns, constraints, relations.
    - Detecting migration files and reconstructing lineage.
    - Scanning source files for raw SQL and ORM query touchpoints.

    All output arrays must be sorted per the ordering guarantees defined in
    ``docs/contracts/sections/database-cartography.schema.json`` before the
    result dict is returned.

    TODO: Implement each sub-engine (datasource discoverer, schema introspector,
          migration scanner, query touchpoint detector).
    """

    def scan(
        self,
        workspace_path: str,
        scope: dict,
        timeout_ms: Optional[int] = None,
    ) -> dict:
        """Run the database cartography scan and return the section dict.

        Args:
            workspace_path: Absolute path to the workspace root.
            scope: Scope configuration dict. See scope_limits.py for the
                   full schema.
            timeout_ms: Optional time budget in milliseconds. The engine
                        should checkpoint against this budget and set
                        ``partial: True`` if the budget is exhausted.

        Returns:
            A dict matching the ``DatabaseCartographySection`` schema in
            ``docs/contracts/sections/database-cartography.schema.json``.
            All array fields are always present (may be empty lists).
            ``partial`` is only included when True.
        """
        # TODO: implement
        raise NotImplementedError(
            "DatabaseCartographyEngine.scan() is not yet implemented. "
            "See docs/contracts/sections/database-cartography.schema.json "
            "for the expected output shape."
        )

    # ------------------------------------------------------------------
    # Private sub-steps (stubs — to be implemented in later phases)
    # ------------------------------------------------------------------

    def _discover_datasources(self, workspace_path: str, scope: dict) -> list[DataSource]:
        """Discover database connections/data sources in the workspace.

        Returns a list sorted by id ascending.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError

    def _introspect_schema(
        self, datasource: DataSource
    ) -> tuple[list[Table], list[Column]]:
        """Introspect tables and columns for a given data source.

        Returns tables sorted by (datasource_id, schema_name, table_name) ascending.
        Returns columns sorted by (table_id, ordinal_position) ascending.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError

    def _collect_constraints(self, tables: list[Table]) -> list[dict]:
        """Collect constraint definitions for the given tables.

        Returns list sorted by (table_id, constraint_kind, constraint_name) ascending.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError

    def _collect_relations(self, tables: list[Table]) -> list[dict]:
        """Collect foreign key and logical relations between tables.

        Returns list sorted by (from_table_id, to_table_id, constraint_name) ascending.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError

    def _scan_migration_lineage(
        self, workspace_path: str, datasources: list[DataSource]
    ) -> dict:
        """Discover migration files and reconstruct schema evolution lineage.

        Returns a dict matching MigrationLineage in database-cartography.schema.json.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError

    def _detect_query_touchpoints(
        self, workspace_path: str, scope: dict, tables: list[Table]
    ) -> list[dict]:
        """Scan source files for SQL queries and ORM references to discovered tables.

        Returns list sorted by (file, line) ascending.
        TODO: implement
        """
        # TODO: implement
        raise NotImplementedError
