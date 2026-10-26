// Temporarily absent from map pickers. Route data, assets and saved records
// remain intact; remove an ID from this list to make its circuit available again.
export const HIDDEN_TRACK_IDS = Object.freeze([
  'coast', 'coast-bay', 'coast-pines', 'coast-neon', 'coast-marina', 'coast-ridge',
]);
export const DEFAULT_TRACK_ID = 'coast-london';
// Public labels are independent of the frozen legacy route metadata.
const CITY_NAMES = Object.freeze({
  'coast-london': ['伦敦', 'London'],
  'coast-beijing': ['北京', 'Beijing'],
  'coast-shanghai': ['上海', 'Shanghai'],
  'coast-rio': ['里约', 'Rio de Janeiro'],
  'coast-austin': ['奥斯汀', 'Austin'],
  'coast-paris': ['巴黎', 'Paris'],
});
export function trackDisplayName(track, language = 'zh') {
  return CITY_NAMES[track?.id]?.[language === 'en' ? 1 : 0]
    ?? (language === 'en' ? track?.nameEn || 'Coastline Grand Prix' : track?.name || '海岸技术环线');
}
export function isTrackSelectable(id, tracks) {
  return Object.hasOwn(tracks, id) && !HIDDEN_TRACK_IDS.includes(id);
}
export function getVisibleTracks(tracks) {
  return Object.values(tracks).filter(track => isTrackSelectable(track.id, tracks));
}
