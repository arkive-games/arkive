import { useGameMap } from "@/context/GameMapContext";
import MarkerTypes from "./MarkerTypes";

export default function MarkerTypesSection() {
  const { selectedMap } = useGameMap();

  if (!selectedMap) return null;

  return (
    <div className="w-full" data-testid="marker-types-section">
      <MarkerTypes />
    </div>
  );
}
