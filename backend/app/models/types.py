"""Column types that differ between Postgres and the SQLite test database."""

from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator, TypeEngine

# all-MiniLM-L6-v2, the default embedding model (settings.embedding_model).
# A model with another size needs a migration of this column.
EMBEDDING_DIMENSIONS = 384


class EmbeddingVector(TypeDecorator):
    """A float vector: pgvector's ``vector`` on Postgres, JSON elsewhere.

    The SQLite test suite cannot load pgvector, so it stores the list as
    JSON and compares in Python (app/services/item_matching_service.py).
    Values are always ``list[float]`` in Python.
    """

    # none_as_null: store None as SQL NULL, not the JSON text "null", so
    # "embedding IS NULL" finds aliases without one on SQLite too.
    impl = JSON(none_as_null=True)
    cache_ok = True

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS) -> None:
        super().__init__()
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[Any]:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dimensions))
        return dialect.type_descriptor(JSON(none_as_null=True))

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        return [float(v) for v in value]

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        return [float(v) for v in value]
