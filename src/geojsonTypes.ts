// Minimal local GeoJSON types for Worker code. The frontend has
// @types/geojson available (pulled in transitively via mapbox-gl) and uses
// the ambient `GeoJSON` namespace directly; the backend has no such
// dependency, so rather than adding a new package just for a few type
// aliases, this defines the small subset actually used by the
// PurpleAir/FIRMS/HMS-smoke routes.
export type GeoJsonPosition = [number, number] | [number, number, number];

export type GeoJsonPointGeometry = { type: 'Point'; coordinates: GeoJsonPosition };
export type GeoJsonPolygonGeometry = { type: 'Polygon'; coordinates: GeoJsonPosition[][] };
export type GeoJsonMultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: GeoJsonPosition[][][] };
export type GeoJsonGeometry = GeoJsonPointGeometry | GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry;

export type GeoJsonFeature<G extends GeoJsonGeometry = GeoJsonGeometry, P = Record<string, unknown>> = {
  type: 'Feature';
  geometry: G | null;
  properties: P;
};

export type GeoJsonFeatureCollection<G extends GeoJsonGeometry = GeoJsonGeometry, P = Record<string, unknown>> = {
  type: 'FeatureCollection';
  features: GeoJsonFeature<G, P>[];
};
