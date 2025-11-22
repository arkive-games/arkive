from typing import TYPE_CHECKING

from sqlalchemy import Column, String, Float, ForeignKey, JSON, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import relationship, Mapped, mapped_column
from aion2.backend.interfaces.db import Base  # Correct import
import uuid

if TYPE_CHECKING:
    from aion2.backend.models import Map, Region, Subtype, Language, Image

class Marker(AsyncAttrs, Base):
    __tablename__ = 'markers'

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # UUID id for marker
    map_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('maps.id', ondelete='CASCADE'),
                                         nullable=False)  # Foreign key to Map
    subtype_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('subtypes.id', ondelete='SET NULL'), nullable=True)  # Foreign key to Subtype
    region_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('regions.id', ondelete='SET NULL'), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)  # Name of the marker
    x: Mapped[float] = mapped_column(Float, nullable=False)  # X-coordinate of the marker
    y: Mapped[float] = mapped_column(Float, nullable=False)  # Y-coordinate of the marker

    # Relationships to other models
    map: Mapped["Map"] = relationship("Map", lazy="joined", join_depth=1)  # Relationship to Map model
    subtype: Mapped["Subtype"] = relationship("Subtype", lazy="joined", join_depth=1)  # Relationship to Subtype model
    region: Mapped["Region"] = relationship("Region", lazy="joined", join_depth=1)


    images: Mapped[list["MarkerImage"]] = relationship("MarkerImage", back_populates="marker",
                                                                   lazy="joined", join_depth=1,
                                                                   cascade="all, delete-orphan")

    # Relationship to translations (one-to-many)
    translations: Mapped[list["MarkerTranslation"]] = relationship("MarkerTranslation", back_populates="marker",
                                                                   lazy="joined", join_depth=1,
                                                                   cascade="all, delete-orphan")


class MarkerImage(Base):
    __tablename__ = 'marker_images'
    __table_args__ = (
        UniqueConstraint("marker_id", "image_id"),
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # UUID id for translation
    marker_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('markers.id', ondelete='CASCADE'), nullable=False)  # Foreign key to Marker
    image_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('images.id', ondelete='CASCADE'), nullable=False)  # Foreign key to Marker
    order: Mapped[int] = mapped_column(Integer, default=0)

    marker: Mapped["Marker"] = relationship("Marker", back_populates="images", lazy="joined", join_depth=1, order_by="MarkerImage.order")
    image: Mapped["Image"] = relationship("Image", lazy="joined", join_depth=2)  # Link to Image model



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

class MarkerContributor(Base):
    __tablename__ = "marker_contributors"
    __table_args__ = (
        UniqueConstraint("marker_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marker_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('markers.id', ondelete='CASCADE'), nullable=False)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
