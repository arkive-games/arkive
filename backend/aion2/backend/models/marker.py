from typing import TYPE_CHECKING

from sqlalchemy import Column, String, Float, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import relationship, Mapped, mapped_column
from aion2.backend.interfaces.db import Base  # Correct import
import uuid

if TYPE_CHECKING:
    from aion2.backend.models import Map, Category, Subtype, Language

class Marker(AsyncAttrs, Base):
    __tablename__ = 'markers'

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # UUID id for marker
    map_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('maps.id', ondelete='CASCADE'),
                                         nullable=False)  # Foreign key to Map
    subtype_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('subtypes.id', ondelete='SET NULL'),
                                                    nullable=True)  # Foreign key to Subtype
    name: Mapped[str] = mapped_column(String, nullable=False)  # Name of the marker
    x: Mapped[float] = mapped_column(Float, nullable=False)  # X-coordinate of the marker
    y: Mapped[float] = mapped_column(Float, nullable=False)  # Y-coordinate of the marker
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)  # List of image paths (JSON)

    # Relationships to other models
    map: Mapped["Map"] = relationship("Map", lazy="joined", join_depth=1)  # Relationship to Map model
    subtype: Mapped["Subtype"] = relationship("Subtype", lazy="joined", join_depth=1)  # Relationship to Subtype model

    # Relationship to translations (one-to-many)
    translations: Mapped[list["MarkerTranslation"]] = relationship("MarkerTranslation", back_populates="marker",
                                                                   lazy="joined", join_depth=1,
                                                                   cascade="all, delete-orphan")


class MarkerTranslation(Base):
    __tablename__ = 'marker_translations'

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # UUID id for translation
    marker_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('markers.id', ondelete='CASCADE'), nullable=False)  # Foreign key to Marker
    language_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('languages.id', ondelete='CASCADE'), nullable=False)  # Foreign key to Language
    name: Mapped[str] = mapped_column(String, nullable=False)  # Translated name of the marker
    description: Mapped[str] = mapped_column(String, nullable=True)  # Translated description of the marker

    # Relationships
    marker: Mapped["Marker"] = relationship("Marker", back_populates="translations", lazy="joined", join_depth=1)
    language: Mapped["Language"] = relationship("Language", lazy="joined", join_depth=2)  # Link to Language model

