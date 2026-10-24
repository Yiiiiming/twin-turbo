// Temporarily absent from map pickers. Route data, assets and saved records
// remain intact; remove an ID from this list to make its circuit available again.
export const HIDDEN_TRACK_IDS = Object.freeze([
  'coast', 'coast-bay', 'coast-pines', 'coast-neon', 'coast-marina', 'coast-ridge',
]);
export const DEFAULT_TRACK_ID = 'coast-london';
export function isTrackSelectable(id, tracks) {
  return Object.hasOwn(tracks, id) && !HIDDEN_TRACK_IDS.includes(id);
}
export function getVisibleTracks(tracks) {
  return Object.values(tracks).filter(track => isTrackSelectable(track.id, tracks));
}
