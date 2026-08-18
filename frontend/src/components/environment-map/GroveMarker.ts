import mapboxgl from 'mapbox-gl';

export type MarkerRow = { label: string; value: string };

const MARKER_SIZE = 14;

function buildPopupContent(title: string, rows: MarkerRow[]): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'font-size:12.5px;min-width:140px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'font-weight:600;margin-bottom:6px;';
  heading.textContent = title;
  container.appendChild(heading);

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:flex;justify-content:space-between;gap:10px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = row.label;
    const valueEl = document.createElement('span');
    valueEl.textContent = row.value;
    rowEl.append(labelEl, valueEl);
    container.appendChild(rowEl);
  }

  return container;
}

// Builds the grove marker as a real <button> (not a bare div) so it's
// keyboard-focusable and reachable in the map container's tab order, and
// screen readers announce it as interactive -- Enter/Space activation is
// native to <button>, no extra keydown handler needed. Popup content is
// built as DOM nodes via setDOMContent rather than an HTML string, since
// raw setHTML is an unnecessary injection boundary once this panel grows
// to include more than trusted numeric values.
export function createGroveMarker(map: mapboxgl.Map, lngLat: [number, number], ariaLabel: string): mapboxgl.Marker {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', ariaLabel);
  el.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;background:#2F6D4F;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15);padding:0;cursor:pointer;z-index:2;position:relative;`;

  const popup = new mapboxgl.Popup({ offset: 16, closeButton: false, maxWidth: '220px' });
  return new mapboxgl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map);
}

export function updateGroveMarkerPopup(marker: mapboxgl.Marker, title: string, rows: MarkerRow[]): void {
  const popup = marker.getPopup();
  if (!popup) return;
  popup.setDOMContent(buildPopupContent(title, rows));
}
