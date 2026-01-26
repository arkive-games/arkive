import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, UniqueConstraint, Integer, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aion2.backend.models.base import TimestampMixin
from aion2.backend.interfaces.db import Base

if TYPE_CHECKING:
    from aion2.backend.models import Map, Marker, ServerMatching

class AbyssArtifact(AsyncAttrs, Base, TimestampMixin):
    __tablename__ = 'abyss_artifacts'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('markers.id', ondelete='CASCADE'), nullable=False, unique=True)
    order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    marker: Mapped["Marker"] = relationship("Marker", lazy="joined", join_depth=1)

class AbyssArtifactState(AsyncAttrs, Base, TimestampMixin):
    __tablename__ = 'abyss_artifact_states'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    abyss_artifact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('abyss_artifacts.id', ondelete='CASCADE'), nullable=False)
    server_matching_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('server_matchings.id', ondelete='CASCADE'), nullable=False)
    state: Mapped[int] = mapped_column(Integer, nullable=False)
    record_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    abyss_artifact: Mapped["AbyssArtifact"] = relationship("AbyssArtifact")
    server_matching: Mapped["ServerMatching"] = relationship("ServerMatching")

    __table_args__ = (
        UniqueConstraint('abyss_artifact_id', 'server_matching_id', 'record_time', name='_abyss_artifact_server_matching_record_time_uc'),
    )

class AbyssArtifactMapState(AsyncAttrs, Base, TimestampMixin):
    __tablename__ = 'abyss_artifact_map_states'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    map_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('maps.id', ondelete='CASCADE'), nullable=False)
    server_matching_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('server_matchings.id', ondelete='CASCADE'), nullable=False)
    states: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    record_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    map: Mapped["Map"] = relationship("Map")
    server_matching: Mapped["ServerMatching"] = relationship("ServerMatching")
